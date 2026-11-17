/**
 * Rozmowy z władcami komputera. Źródło: MeetWithKing.cs z OpenCivOne (MIT) — F6_0000_0000 (cała rozmowa),
 * F6_0000_16cd (poseł i powitanie), F6_0000_1874 (tekst powitania), F6_0000_1a3f (*TREATY), F6_0000_1a99 (zawarcie pokoju),
 * F6_0000_16ac (koniec rozmowy); Actions.F0_2459_06f2_AcquireTechnologyFromAnotherPlayer (wymiana technologii w rozmowie)
 * oraz wywołania z Diplomacy (*HELPME, *CRUSADE) i GameEngine.ResearchFinished (*GAPE).
 * Logika F6_0000_0000 przepisana z wersji „goto” na kod strukturalny 1:1 (etykiety wzorca w komentarzach);
 * miejsca wątpliwe sprawdzone z najstarszą wersją pliku w historii wzorca (src/Game/Objects/MeetWithKing.cs, a4f89ae).
 *
 * Silnik jest cichy i synchroniczny: rozmowa to generator kroków. Interfejs pokazuje bieżący krok (`meeting.step`)
 * i przekazuje odpowiedź człowieka (`meeting.answer(numer opcji)`); skutki (traktaty, trybut, technologie, wojna)
 * wykonuje silnik między krokami — tak jak oryginał między kolejnymi oknami.
 *
 * Animacja twarzy (F6_0000_1b33) należy do interfejsu, ale steruje nią rozmowa: kroki niosą zapisy zmiennych globalnych
 * oryginału — Var_3936 (mina; −1 = bez animacji), Var_d76c (liczba klatek mówienia) i Var_6b8e (surowe spojrzenie) —
 * dokładnie w miejscach, w których F6_0000_0000, F6_0000_16cd, F6_0000_1a3f, Diplomacy (*HELPME/*CRUSADE)
 * i ResearchFinished (*GAPE) je zapisują. Animacja losuje wspólnym generatorem gry (F0_2dc4_005d) w każdej klatce okna,
 * więc interfejs zużywa `state.rng` tak jak oryginał (liczba losowań zależy od czasu, przez który okno jest otwarte).
 *
 * Pominięte (interfejs, nie zasady): rysowanie pola spotkania (UpdateVisibleCellStatus, DrawCellWithUnit), dźwięk (PlayTune),
 * zmiany czcionki.
 */
import { MAX_UNITS_PER_PLAYER } from '../data/enums';
import { NATIONS } from '../data/nations';
import { TECHS } from '../data/techs';
import { aiChangeGovernment, changeProductionOnContinent } from './ai';
import { WonderId } from './buildings';
import { playerHasWonder } from './cities';
import { acceptAiRequest, clearDiplomacyFlags, setDiplomacyFlags } from './diplomacy';
import { distance } from './map';
import { gradeTech, playerHasTech, researchFinished, TECH_COUNT } from './techs';
import { Diplomacy, Government, NO_UNIT, type GameState } from './types';
import { deleteUnit, nearestCity } from './units';
import { LEADER_TITLES } from '../data/names';

/** Słowa kluczowe tekstów KING.TXT (Array_30b8 wzorca: $US, $THEM, $BUCKS, $RPLC1, $RPLC2). */
export type KingKeywords = Partial<Record<'US' | 'THEM' | 'BUCKS' | 'RPLC1' | 'RPLC2', string>>;

/** Numer nacji, której władczyni zmienia tytuły Emperor/King na „Empress”/„Queen” na czas rozmowy (Anglicy, Elżbieta I). */
const EMPRESS_NATION = 14;
const NUCLEAR = 25;
/** RuleDebugFlags.Bit0 — przyjęta wartość domyślna (DefaultValue: wszystkie bity ustawione), jak w diplomacy.ts. */
const RULE_DEBUG_BIT0 = true;
/** Znacznik „żądanie już załatwione” (0x3e7) w zmiennej z kwotą trybutu. */
const DONE = 999;

/**
 * Krok rozmowy dla interfejsu.
 * - `emissary` — pytanie „An emissary from the … wishes to speak with you.” (MenuBoxDialog.ShowDialog w (100, 80));
 *   odpowiedź: numer opcji (0 = Yes, 1 = No, -1 = Esc). Mapę przed pytaniem oryginał centruje na (x − 8, y − 2), gdy x ≠ −1.
 * - `portrait` — ekran rozmowy z portretem władcy (F6_0000_1d2b); odpowiedź bez znaczenia.
 * - `speech` — tekst w oknie bez ramki (F6_0000_251d_ShowInlineDialog w (36, 139)); `key` = sekcja KING.TXT
 *   (tekst po podstawieniu słów kluczowych łamany do `width` znaków) albo gotowy `text`; `disabled` = maska nieaktywnych opcji.
 *   Odpowiedź: numer opcji albo -1.
 * - `dialog` — tekst w zwykłym oknie (ShowDialog w (40, 100)) — gdy poseł nie został przyjęty, a komputer wypowiada wojnę.
 * - `advice` — porada (Help.ShowInstantAdvicePopup) — interfejs pokazuje ją tylko przy włączonym „Instant Advice”.
 * - `close` — koniec rozmowy (F6_0000_16ac: powrót do mapy).
 */
export type MeetingStep =
  | { readonly kind: 'emissary'; readonly player: number; readonly x: number; readonly y: number; readonly text: string }
  | { readonly kind: 'portrait'; readonly player: number }
  | {
    readonly kind: 'speech' | 'dialog';
    readonly player: number;
    readonly key: string | null;
    readonly text: string | null;
    readonly values: KingKeywords;
    readonly width: number;
    readonly disabled: number;
    /** Var_3936 w chwili okna: mina władcy w animacji (0 spokojna, 1 zwykła, 2 gniewna; −1 = bez animacji). */
    readonly mood: number;
    /** Var_d76c zapisane przed tym oknem (liczba klatek mówienia: 12 albo 4); null = bez zapisu (licznik biegnie dalej). */
    readonly talk: number | null;
    /** Var_6b8e zapisane przed tym oknem (0/1 — wybór klatek gniewnej i spokojnej miny); null = bez zapisu. */
    readonly stern: number | null;
  }
  | { readonly kind: 'advice'; readonly player: number; readonly key: string; readonly values: KingKeywords }
  | { readonly kind: 'close'; readonly player: number };

type Flow = Generator<MeetingStep, void, number>;
type SubFlow<T> = Generator<MeetingStep, T, number>;

/** Rozmowa prowadzona krok po kroku przez interfejs. */
export class KingMeeting {
  /** Bieżący krok albo null, gdy rozmowa się skończyła. */
  step: MeetingStep | null = null;
  private readonly flow: Flow;

  constructor(flow: Flow) {
    this.flow = flow;
    this.advance(0);
  }

  /** Odpowiedź człowieka na bieżący krok (numer opcji; -1 = Esc); zwraca następny krok. */
  answer(choice = 0): MeetingStep | null {
    if (this.step) this.advance(choice);
    return this.step;
  }

  private advance(choice: number): void {
    const r = this.flow.next(choice);
    this.step = r.done ? null : r.value;
  }
}

/** Przeprowadza rozmowę bez interfejsu (testy, symulacje): `choose` wybiera odpowiedź na każdy krok. */
export function runMeeting(meeting: KingMeeting, choose: (step: MeetingStep) => number = () => 0): MeetingStep[] {
  const steps: MeetingStep[] = [];
  for (let s = meeting.step; s; s = meeting.answer(choose(s))) steps.push(s);
  return steps;
}

export interface MeetWithKingOptions {
  /** Pole spotkania (centrowanie mapy przed pytaniem o posła); -1 = bez centrowania. */
  readonly x?: number;
  readonly y?: number;
  /**
   * param4 wzorca: false = kontakt jednostek (UpdateDiplomacyStatus, pytanie o posła), true = dyplomata w stolicy
   * (DiplomatActions, rozmowa bez pytania).
   */
  readonly visit?: boolean;
  /**
   * ContactPlayerCountdown komputera sprzed spotkania (zmienna lokalna -0x34 wzorca). Silnik ustawia licznik na bieżącą
   * turę już w updateDiplomacyStatus, dlatego zdarzenie `meetLeader` niesie wartość poprzednią.
   */
  readonly previousCountdown?: number;
  /**
   * Czy przed spotkaniem był kontakt (flaga Contact). W oryginale rozmowa odbywa się, zanim UpdateDiplomacyStatus
   * ustawi kontakt; zdarzenie jest obsługiwane później, więc niesie stan sprzed spotkania (`!first`).
   */
  readonly hadContact?: boolean;
}

/** Stan wspólny kroków jednej rozmowy (zmienne globalne wzorca). */
class Session {
  /** Var_3934: 0 = poseł jeszcze nie pytany, 1 = wizyta dyplomaty, po pytaniu −(numer opcji); −1 = odmowa. */
  emissary: number;
  /** Var_d804: pytanie o posła i powitanie już były. */
  asked = false;
  /** Array_30b8 — słowa kluczowe ustawione w tej rozmowie. */
  readonly values: KingKeywords = {};
  readonly titles: string[] = [...LEADER_TITLES];
  /** Var_3936 — po każdej rozmowie F6_0000_16ac zostawia −1, więc nowa rozmowa zaczyna od −1. */
  mood = -1;
  /** Zapisy Var_d76c i Var_6b8e od ostatniego okna (przekazywane z najbliższym krokiem). */
  private pending: { talk?: number; stern?: number } = {};

  constructor(readonly state: GameState, readonly player: number, emissary: number, readonly x: number, readonly y: number) {
    this.emissary = emissary;
    // Elżbieta I: Emperor → „Empress”, King → „Queen” na czas rozmowy (strcpy DS:0x3768/0x3770 do napisów wskazywanych
    // przez 0x19b4/0x19b6 — stąd spacja w „King ”: miejsce na „Queen”). Na końcu oryginał kopiuje tam nazwy poziomów
    // trudności „Emperor” i „King” (DS:0x33aa/0x33a8), więc od pierwszej rozmowy z Elżbietą tytuł króla traci spację —
    // tej trwałej zmiany nie odtwarzamy (tytuły nie są częścią stanu gry ani zapisu).
    if (state.players[player]!.nation === EMPRESS_NATION) {
      this.titles[1] = 'Empress';
      this.titles[2] = 'Queen';
    }
  }

  /** Zapis zmiennych animacji (kolejność jak w oryginale nie ma znaczenia — czyta je dopiero klatka w oknie). */
  anim(writes: { mood?: number; talk?: number; stern?: number }): void {
    if (writes.mood !== undefined) this.mood = writes.mood;
    if (writes.talk !== undefined) this.pending.talk = writes.talk;
    if (writes.stern !== undefined) this.pending.stern = writes.stern;
  }

  speech(
    key: string | null, text: string | null,
    options: { width?: number; disabled?: number; kind?: 'speech' | 'dialog'; mood?: number; talk?: number; stern?: number } = {},
  ): MeetingStep {
    this.anim(options);
    const step: MeetingStep = {
      kind: options.kind ?? 'speech', player: this.player, key, text, values: { ...this.values },
      width: options.width ?? 80, disabled: options.disabled ?? 0, mood: this.mood,
      talk: this.pending.talk ?? null, stern: this.pending.stern ?? null,
    };
    this.pending = {};
    return step;
  }

  /**
   * F6_0000_16cd: przy pierwszym wywołaniu pytanie o posła (gdy Var_3934 = 0), a po przyjęciu ekran rozmowy i powitanie.
   * Zwraca Var_3934 (−1 = poseł odprawiony).
   */
  *receive(): SubFlow<number> {
    if (this.asked) return this.emissary;
    this.asked = true;
    const ai = this.state.players[this.player]!;
    if (this.emissary === 0) {
      for (;;) {
        // Opcja " Check Intelligence\n" (przy ambasadzie) pominięta — raport wywiadu (Reports.F14_0000_1164) jeszcze nie istnieje.
        const text = `An emissary from the\n${ai.nationPlural} wishes to\nspeak with you.\nWill you receive him?\n Yes.\n No.\n`;
        const index = yield { kind: 'emissary', player: this.player, x: this.x, y: this.y, text };
        this.emissary = -index | 0; // NEG: Yes → 0, No → −1, Esc (−1) → 1, Check Intelligence (2) → −2
        if (this.emissary !== -2) break;
      }
    }
    if (this.emissary === -1) return -1;
    yield { kind: 'portrait', player: this.player };
    // L17d1: Var_3936 = 1, Var_67e8 = −1, Var_7ef4 = 0, Var_d76c = 12, potem powitanie (F6_0000_1874)
    yield this.speech(null, this.greeting(), { mood: 1, talk: 12 });
    return this.emissary;
  }

  /** F6_0000_1874: powitanie władcy (jedna z czterech formuł). */
  private greeting(): string {
    const ai = this.state.players[this.player]!;
    const title = this.titles[ai.government] ?? '';
    let text = ai.diplomacy[this.state.humanPlayer]! & Diplomacy.Vendetta
      ? 'O most untrustworthy leader of the\ninfidels, hear now '
      : 'Greetings from ';
    switch (this.state.rng.next(4)) {
      case 0: text += `the most exalted\n${title}: ${ai.leader} `; break;
      case 1: text += `${ai.leader}, ruler\nand ${title} `; break;
      case 2: text += `our most wise\n${title}: ${ai.leader} `; break;
      default: text += `he who makes mortals\ntremble: ${ai.leader} `; break;
    }
    text += `of the ${ai.nationPlural}...\n`;
    if (ai.activeUnits[NUCLEAR]! !== 0) text += 'Our words are backed\nwith NUCLEAR WEAPONS!\n';
    return text;
  }

  /** F6_0000_1a3f: komunikat *TREATY. */
  *treatyText(): SubFlow<void> {
    this.values.RPLC1 = this.state.players[this.player]!.nationAdjective;
    this.values.US = this.state.players[this.state.humanPlayer]!.nationAdjective;
    yield this.speech('*TREATY', null, { talk: 12 });
  }

  /** F6_0000_16ac: koniec rozmowy (Var_3936 = −1). */
  close(): MeetingStep {
    this.mood = -1;
    this.asked = false;
    this.emissary = 0;
    return { kind: 'close', player: this.player };
  }
}

const s16 = (v: number) => (v << 16) >> 16;
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
const isRepublican = (government: number) => government === Government.Republic || government === Government.Democracy;

/**
 * F6_0000_1a99: pokój między człowiekiem a komputerem; na najniższym poziomie komputer usuwa jednostki stojące
 * najwyżej 2 pola od miast człowieka.
 */
export function signPeaceTreaty(state: GameState, player: number): void {
  const h = state.humanPlayer;
  setDiplomacyFlags(state, h, player, Diplomacy.Peace);
  state.players[player]!.contactCountdown = state.turn + 16;
  if (state.difficulty !== 0) return;
  const units = state.players[player]!.units;
  for (let i = 0; i < MAX_UNITS_PER_PLAYER; i++) {
    const u = units[i]!;
    if (u.type === NO_UNIT) continue;
    const city = nearestCity(state, u.x, u.y);
    if (city === -1) continue;
    const c = state.cities[city]!;
    if (c.owner === h && distance(u.x, u.y, c.x, c.y) < 3) deleteUnit(state, player, i);
  }
}

/**
 * Actions.F0_2459_06f2_AcquireTechnologyFromAnotherPlayer w rozmowie: `taker` dostaje jedną technologię od `giver`.
 * Człowiek wybiera z listy „Select one...”, komputer bierze najwyżej ocenianą (GradeTechnology, przy remisie — wyższy numer),
 * a człowiek dostaje o tym komunikat „… take …”.
 */
function* acquireTechnology(session: Session, taker: number, giver: number): SubFlow<void> {
  const state = session.state;
  if (taker === 0 || giver === 0) return;
  const h = state.humanPlayer;
  const options: number[] = [];
  let menu = 'Select one...\n ';
  let best = -1;
  let bestGrade = -1;
  for (let t = TECH_COUNT - 1; t >= 0; t--) {
    if (playerHasTech(state, taker, t) || !playerHasTech(state, giver, t)) continue;
    menu += `${TECHS[t]!.name}\n `;
    options.push(t);
    const grade = gradeTech(state, taker, t);
    if (grade > bestGrade) {
      bestGrade = grade;
      best = t;
    }
  }
  if (options.length === 0) return;
  if (taker === h) {
    let chosen = -1;
    while (chosen === -1) chosen = yield session.speech(null, menu);
    researchFinished(state, taker, giver, options[chosen] ?? options[0]!);
    return;
  }
  if (giver === h) yield session.speech(null, `${state.players[taker]!.nationPlural} take\n${TECHS[best]!.name}.\n`);
  researchFinished(state, taker, giver, best);
  changeProductionOnContinent(state, taker, -1);
}

/**
 * MeetWithKing.F6_0000_0000: rozmowa człowieka z władcą komputera `player` — przy kontakcie jednostek
 * (Diplomacy.UpdateDiplomacyStatus) albo wizycie dyplomaty w stolicy (DiplomatActions).
 */
export function meetWithKing(state: GameState, player: number, options: MeetWithKingOptions = {}): KingMeeting {
  return new KingMeeting(meetWithKingFlow(state, player, options));
}

function* meetWithKingFlow(state: GameState, player: number, options: MeetWithKingOptions): Flow {
  const h = state.humanPlayer;
  const ai = state.players[player]!;
  const human = state.players[h]!;
  const visit = options.visit ?? false;
  const x = options.x ?? -1;
  const y = options.y ?? -1;
  const session = new Session(state, player, visit ? 1 : 0, x, y);
  session.anim({ stern: 0 }); // L008f: Var_6b8e = 0
  const rel = () => ai.diplomacy[h]!;
  const atPeace = () => (rel() & Diplomacy.Peace) !== 0;
  const vendetta = () => (rel() & Diplomacy.Vendetta) !== 0;

  let countdown = options.previousCountdown ?? ai.contactCountdown; // -0x34
  if (!visit) ai.contactCountdown = state.turn;

  // ── ocena sił na kontynentach (L008f–L01da) ──
  let hostile = 0; // -0x24: komputer chce coś wymusić (żądania, wojna)
  let fear = 0; // -0x2e: obawa komputera przed człowiekiem
  let tribute = 0; // -0x6: kwota trybutu
  let attitude = 1; // -0x8: 0 = bez żądań, 1 = prośby, 2 = żądania
  for (let i = 1; i < 15; i++) {
    const A = ai.continents[i]!;
    const H = human.continents[i]!;
    const threshold = ai.cityCount > 1 ? 1 : 0;
    if (A.cityCount > threshold && H.defense > A.attack) {
      fear = s16(fear + Math.trunc(s16(H.defense * (state.difficulty === 0 ? 4 : 2)) / (A.attack + 1)));
      continue;
    }
    if (H.attack !== 0 && A.attack !== 0) hostile = 1;
    if (H.cityCount !== 0) {
      tribute = s16(tribute + (A.cityCount > 1 ? A.defense - H.defense : A.defense));
    } else if (A.cityCount !== 0) {
      tribute = s16(tribute + Math.trunc((A.attack - H.defense) / 2));
    } else {
      tribute = s16(tribute + Math.trunc((A.defense - H.defense) / 4));
    }
  }

  // ── człowiek prowadzi w rankingu albo komputer ma vendettę (L01f5–L0298) ──
  const humanNukes = human.activeUnits[NUCLEAR]!;
  const aiNukes = ai.activeUnits[NUCLEAR]!;
  let humanLeads = human.ranking === 7 && human.cityCount > 4 && ai.cityCount > 1 && humanNukes === 0 && state.turn > 200 ? 1 : 0; // -0x4
  if (humanLeads !== 0 || (vendetta() && 3 * ai.militaryPower > human.militaryPower)) {
    if (humanNukes === 0) {
      hostile = 1;
      tribute = clamp(tribute, 10 * ai.ranking, 9999);
      fear = 0;
    }
  }
  // ── broń jądrowa (L02a0–L034c) ──
  if (aiNukes !== 0) ai.diplomacy[h]! |= Diplomacy.TributeDemanded;
  if (aiNukes !== 0 && humanNukes === 0) {
    hostile = 1;
    tribute = clamp(tribute, 100, 9999);
  }
  if (humanNukes !== 0) {
    if (aiNukes === 0) fear = 4;
    else tribute = Math.trunc(s16(aiNukes * Math.trunc(tribute / 2)) / humanNukes);
  }
  if (fear !== 0) {
    hostile = 0;
    attitude = 0;
  }
  // ── Wielki Mur albo ONZ człowieka (L035c) ──
  if (playerHasWonder(state, h, WonderId.GreatWall) || playerHasWonder(state, h, WonderId.UnitedNations)) {
    humanLeads = 0;
    hostile = 0;
    if (countdown === -2) countdown = -1;
  }
  // ── kwota trybutu (L0397–L0417) ──
  if (vendetta()) tribute = s16(tribute << 1);
  else if (countdown === -2) tribute = Math.trunc(tribute / 4);
  tribute = clamp(Math.trunc((tribute * (state.difficulty + 1)) / 32), 0, 20) * 50;
  const coins = human.gold;
  if (tribute > coins && tribute <= coins * 2 && coins >= 50) tribute = Math.trunc(coins / 50) * 50;
  if (aiNukes !== 0) {
    // Dosłownie jak we wzorcu (L0417); flaga TributeDemanded jest już ustawiona w L02a0, więc warunek nigdy nie zachodzi.
    if (!(rel() & Diplomacy.TributeDemanded) && coins < tribute) tribute = Math.trunc(coins / 50) * 50;
    ai.diplomacy[h]! |= Diplomacy.TributeDemanded;
  }
  if (tribute === 0 || 3 * ai.militaryPower < human.militaryPower) hostile = 0;
  if (hostile !== 0) attitude = 2;
  if (hostile === 0 && rel() & Diplomacy.Allied) attitude = 0;
  const initiallyHostile = hostile; // -0x10

  // ── chęć pokoju: wojny z innymi cywilizacjami (L04b1–L05b3) ──
  let peaceDesire = vendetta() ? -2 : 0; // -0x2a
  let enemyAtPeaceWithHuman = -1; // -0x30
  for (let j = 1; j < 8; j++) {
    if (j === h) continue;
    if ((ai.diplomacy[j]! & (Diplomacy.Contact | Diplomacy.Peace)) !== Diplomacy.Contact) continue;
    const enemy = state.players[j]!;
    if (ai.militaryPower < enemy.militaryPower * 4) peaceDesire++;
    if (enemy.militaryPower > ai.militaryPower) peaceDesire++;
    if (human.diplomacy[j]! & Diplomacy.Peace) enemyAtPeaceWithHuman = j;
  }
  peaceDesire -= NATIONS[ai.nation]?.mood ?? 0;
  if (human.militaryPower < ai.militaryPower) peaceDesire--;
  if ((atPeace() ? 0 : 1) < peaceDesire && humanLeads === 0) {
    hostile = 0;
    if (state.rng.next(2) !== 0) tribute = 0;
  }

  // ── senat republiki komputera (L05b3–L0606) ──
  if (isRepublican(ai.government) && hostile !== 0 && !vendetta()) {
    if (3 * human.militaryPower > 2 * ai.militaryPower && humanLeads === 0) hostile = 0;
    else aiChangeGovernment(state, player, Government.Monarchy);
  }

  // ── traktat pokojowy przy pokoju i słabszym komputerze (L0606–L064f) ──
  let treaty = 0; // -0x28
  if (atPeace() && hostile !== 0 && (ai.militaryPower < human.militaryPower || vendetta())) {
    hostile = 0;
    treaty = 1;
    attitude = 0;
  }

  // ── wymiana technologii (L064f–L0822) ──
  let wantedTech = -1; // -0xc: technologia człowieka, której chce komputer
  let offeredTech = -1; // -0xa: technologia komputera, której nie ma człowiek
  for (;;) {
    wantedTech = -1;
    offeredTech = -1;
    let bestGrade = 0;
    let aiTechs = 0;
    let humanTechs = 0;
    for (let t = 0; t < 72; t++) {
      const hHas = playerHasTech(state, h, t);
      const aHas = playerHasTech(state, player, t);
      if (hHas) humanTechs++;
      if (aHas) aiTechs++;
      if (!hHas && aHas) offeredTech = t;
      if (hHas && !aHas && gradeTech(state, player, t) >= bestGrade) {
        wantedTech = t;
        bestGrade = gradeTech(state, player, t);
      }
    }
    if ((rel() & Diplomacy.EverFought || hostile !== 0) && aiTechs > 6) break;
    if (humanTechs < aiTechs || offeredTech === -1) break;
    if ((yield* session.receive()) === -1) break;
    session.values.RPLC1 = TECHS[offeredTech]!.name;
    if ((yield session.speech('*EXCHANGE', null, { mood: 1, talk: 12 })) !== 1) break;
    session.anim({ mood: -1 }); // L07a4: bez animacji podczas wymiany
    yield* acquireTechnology(session, player, h);
    yield* acquireTechnology(session, h, player);
    session.anim({ mood: 1 });
    hostile = 0;
  }

  // L0822: pokój trwa, a komputer boi się człowieka — bez rozmowy
  const skipTalk = hostile === 0 && !visit && atPeace() && fear > 2;
  if (!skipTalk) {
    yield* talk();
  }
  // L165d
  if (session.emissary !== -1) yield session.close();

  /** L084e–L15fa: żądania, wojna albo pokój, groźby człowieka. */
  function* talk(): Flow {
    if (!RULE_DEBUG_BIT0) {
      hostile = 1;
      attitude = 0;
      fear = 0;
      treaty = 0;
    }

    // ── *CANCEL: zerwanie traktatu z wrogiem komputera (L0869–L0952) ──
    if (enemyAtPeaceWithHuman !== -1 && (yield* session.receive()) !== -1 && attitude !== 0) {
      session.values.THEM = state.players[enemyAtPeaceWithHuman]!.nationPlural;
      session.values.RPLC1 = hostile !== 0 ? 'demand' : 'request';
      if ((yield session.speech('*CANCEL', null, { mood: hostile !== 0 ? 2 : 1, talk: 12 })) === 1) {
        hostile = 0;
        if (state.rng.next(2) !== 0) tribute = 0;
        clearDiplomacyFlags(state, h, enemyAtPeaceWithHuman, Diplomacy.Peace);
        state.players[enemyAtPeaceWithHuman]!.diplomacy[h]! |= Diplomacy.Vendetta;
      }
    }

    // ── *TRIBUTE (L0952–L0a28) ──
    if (tribute !== 0 && attitude === 2 && human.gold > tribute && (yield* session.receive()) !== -1) {
      session.values.BUCKS = String(tribute);
      if ((yield session.speech('*TRIBUTE', null, { stern: 0, mood: 2, talk: 12 })) === 1) {
        human.gold -= tribute;
        ai.gold += tribute;
        hostile = 0;
      }
      tribute = DONE;
    }

    // ── *TAKECIV: żądanie technologii (L0a28–L0ad0) ──
    if (attitude !== 0 && wantedTech !== -1 && tribute !== DONE && (yield* session.receive()) !== -1) {
      session.values.RPLC1 = TECHS[wantedTech]!.name;
      if ((yield session.speech('*TAKECIV', null, { stern: 0, mood: 2, talk: 12 })) === 1) {
        researchFinished(state, player, h, wantedTech);
        hostile = 0;
      }
      tribute = DONE;
    }

    // ── wypowiedzenie wojny (L0ad0–L0c29); w oknie bez ramki L0b1a: Var_6b8e = 1, Var_3936 = 2, Var_d76c = 12 ──
    const warAnim = { stern: 1, mood: 2, talk: 12 } as const;
    if (hostile !== 0 && atPeace() && tribute > 50) {
      const received = (yield* session.receive()) !== -1;
      yield session.speech('*PROVOKE', null, { width: 40, ...(received ? warAnim : { kind: 'dialog' }) });
      clearDiplomacyFlags(state, h, player, Diplomacy.Peace);
    } else if (hostile !== 0 && tribute === DONE) {
      if ((yield* session.receive()) !== -1) {
        yield session.speech('*REJECT', null, { width: 40, ...warAnim });
        clearDiplomacyFlags(state, h, player, Diplomacy.Peace);
      }
    } else if (hostile !== 0) {
      const contact = options.hadContact ?? (rel() & Diplomacy.Contact) !== 0;
      if (!contact || visit) {
        const received = (yield* session.receive()) !== -1;
        yield session.speech('*RID', null, { width: 40, ...(received ? warAnim : { kind: 'dialog' }) });
        clearDiplomacyFlags(state, h, player, Diplomacy.Peace);
      }
    }

    // ── propozycje pokoju (L0c29–L1097) ──
    if (hostile === 0 && (!atPeace() || visit) && (yield* session.receive()) !== -1) {
      yield* peaceTalks();
    }

    // ── L1097: przyjaźń albo nastawienie ──
    session.anim({ stern: 0 });
    if (hostile === 0 && atPeace() && (yield* session.receive()) !== -1) {
      if (attitude !== 0 && tribute !== DONE) {
        yield session.speech('*ATTITUDE', null, { mood: 1, talk: 4 });
      } else {
        const title = session.titles[human.government] ?? '';
        yield session.speech(null, `We welcome the friendship of the\n${human.nationAdjective} people and their most\n` +
          `wise and munificent leader:\n${title} ${human.leader}.\n`, { mood: 0, talk: 12 });
      }
    }

    // L11d6: Var_6b8e = 1
    session.anim({ stern: 1 });

    // ── L11d6: groźby i prośby człowieka (*THREAT) ──
    if (atPeace() && (yield* session.receive()) !== -1) {
      yield* humanDemands();
    }

    // ── L15e2: traktat, koniec zapisu walk, rada *SCHISM ──
    if (treaty !== 0) ai.diplomacy[h]! |= Diplomacy.PeaceTreaty;
    ai.diplomacy[h]! &= ~Diplomacy.EverFought;
    human.diplomacy[player]! &= ~Diplomacy.EverFought;
    if (session.emissary !== -1 && ai.cityCount > 4 && human.ranking + 1 < ai.ranking && !(human.diplomacy[player]! & Diplomacy.Peace)) {
      session.values.THEM = ai.nationPlural;
      // Help.F4_0000_02d3_ShowInstantAdvicePopup: tylko przed naszą erą (ustawienie Instant Advice sprawdza interfejs)
      if (state.year < 0) yield { kind: 'advice', player, key: '*SCHISM', values: { ...session.values } };
    }
  }

  /** L0c65–L1097: *PEACE i — po odmowie człowieka — oferty komputera (*GIVECIV, *GIVECASH, *GROVEL) albo *MOBILIZE. */
  function* peaceTalks(): Flow {
    if ((yield session.speech('*PEACE', null, { stern: 0, mood: 0, talk: 12 })) === 1) {
      yield* session.treatyText();
      signPeaceTreaty(state, player);
      ai.contactCountdown = state.turn + 16;
      return;
    }
    if (isRepublican(human.government)) {
      yield session.speech(null, 'You are overruled by the Senate.\nTreaty signed.\n');
      signPeaceTreaty(state, player);
      return;
    }
    if (atPeace()) clearDiplomacyFlags(state, h, player, Diplomacy.Peace);
    const noTreaty = () => (rel() & (Diplomacy.Peace | Diplomacy.Vendetta)) === 0;
    // *GIVECIV (L0d2a)
    if (fear >= 4 && offeredTech !== -1 && noTreaty()) {
      session.values.RPLC1 = TECHS[offeredTech]!.name;
      if ((yield session.speech('*GIVECIV', null, { mood: 0, talk: 12 })) === 1) {
        researchFinished(state, h, player, offeredTech);
        yield* session.treatyText();
        signPeaceTreaty(state, player);
        countdown = state.turn;
      }
    }
    // *GIVECASH (L0e0e)
    if (noTreaty()) {
      const cash = clamp(fear * 2 - 4, 0, Math.trunc(ai.gold / 50)) * 50;
      if (cash !== 0) {
        session.values.BUCKS = String(cash);
        if ((yield session.speech('*GIVECASH', null, { mood: 0, talk: 12 })) === 1) {
          yield* session.treatyText();
          signPeaceTreaty(state, player);
          // wzorzec: „sub [si], ax” — odejmowane od skarbca komputera (rejestr SI nieczytelny w tłumaczeniu)
          human.gold += cash;
          ai.gold -= cash;
          countdown = state.turn;
        }
      }
    }
    // *GROVEL (L0eed): komputer z jednym miastem oddaje skarbiec i wszystkie technologie
    if (fear !== 0 && ai.cityCount <= 1 && noTreaty()) {
      session.values.BUCKS = String(ai.gold);
      if ((yield session.speech('*GROVEL', null, { mood: 0, talk: 12 })) === 1) {
        yield* session.treatyText();
        signPeaceTreaty(state, player);
        human.gold += ai.gold;
        ai.gold = 0;
        for (let t = 0; t < 72; t++) {
          if (!playerHasTech(state, h, t) && playerHasTech(state, player, t)) researchFinished(state, h, player, t);
        }
        countdown = state.turn;
      }
    }
    // *MOBILIZE (L1041)
    if (!atPeace()) yield session.speech('*MOBILIZE', null, { stern: 1, mood: 2, talk: 4 });
  }

  /** L1209–L15e2: opcje człowieka w *THREAT — 0 pożegnanie, 1 namowa do wojny z trzecią cywilizacją, 2 żądanie trybutu. */
  function* humanDemands(): Flow {
    for (;;) {
      session.values.RPLC1 = ai.nationPlural;
      let disabled = 0;
      if (state.turn - countdown < 16 || isRepublican(human.government)) disabled = 4;
      if (((1 << player) | (1 << h)) === state.activeCivs) disabled |= 2;
      const choice = yield session.speech('*THREAT', null, { disabled });
      if (choice === 2) {
        const cash = s16(clamp(fear, 0, Math.trunc(ai.gold / 50)) * 50);
        if (cash !== 0) {
          session.values.BUCKS = String(cash);
          yield session.speech('*GIVEMORE', null, { mood: 0, talk: 12 });
          // wzorzec dodaje AX po oknie; we wcześniejszej wersji też — przyjmujemy kwotę z -0x22, jak przy odjęciu
          human.gold += cash;
          ai.gold -= cash;
          ai.contactCountdown = state.turn;
        } else if (initiallyHostile !== 0) {
          clearDiplomacyFlags(state, h, player, Diplomacy.Peace);
          yield session.speech('*PROVOKE', null, { mood: 2, talk: 12 });
        } else {
          yield session.speech(null, 'We ignore your feeble threats.\n', { mood: 1, talk: 4 });
        }
      }
      if (choice !== 1) return;
      // „You must attack the evil:” — lista pozostałych cywilizacji
      let text = 'You must attack the evil:\n ';
      const targets: number[] = [];
      for (let j = 1; j < 8; j++) {
        if (j === h || j === player || !(state.activeCivs & (1 << j))) continue;
        targets.push(j);
        text += `${state.players[j]!.nationPlural}\n `;
      }
      const pick = yield session.speech(null, text);
      session.anim({ mood: 1 }); // L1426
      if (pick === -1 || targets[pick] === undefined) return;
      const target = targets[pick]!;
      const enemy = state.players[target]!;
      session.values.RPLC1 = enemy.nationPlural;
      session.anim({ talk: 4 }); // L144a
      if (!(ai.diplomacy[target]! & Diplomacy.Contact)) {
        yield session.speech('*NOCONTACT', null);
        return;
      }
      if (!(ai.diplomacy[target]! & Diplomacy.Peace)) {
        yield session.speech('*ATWAR', null);
        continue; // goto L1209: ponownie *THREAT
      }
      const price = s16(clamp(Math.trunc((Math.trunc(enemy.militaryPower / 2) * Math.trunc(ai.gold / 100)) / 50), 2, 9999) * 50);
      session.values.BUCKS = String(price);
      if ((yield session.speech('*MERCENARY', null)) !== 1) return;
      if (human.gold >= price) {
        ai.gold += price;
        human.gold -= price;
        // Wzorzec (i jego najstarsza wersja) nie zmienia tu flag dyplomacji — tylko komunikat.
        yield session.speech(null, `${ai.nationPlural} declare war\non the ${enemy.nationPlural}.\n`);
      } else {
        yield session.speech('*UNFORTUNATE', null);
      }
      return;
    }
  }
}

/**
 * Prośba komputera z Diplomacy.UpdatePlayerGovernmentAndDiplomacy (*HELPME / *CRUSADE): poseł (F6_0000_16cd — warunek
 * „== 0”, więc tylko „Yes”), tekst z KING.TXT, opcja 1 = zgoda, potem F6_0000_16ac.
 */
export function aiRequestMeeting(
  state: GameState, request: 'helpme' | 'crusade', player: number, enemy: number, amount = 0, extend = false,
): KingMeeting {
  return new KingMeeting((function* (): Flow {
    // Var_3934 = 0: pytanie o posła (wzorzec zostawia tu wartość z poprzedniej rozmowy — przyjmujemy stan „bez rozmowy”)
    const session = new Session(state, player, 0, -1, -1);
    const received = yield* session.receive();
    if (received === 0) {
      session.values.THEM = state.players[enemy]!.nationPlural;
      if (request === 'helpme') session.values.BUCKS = String(amount);
      else session.values.RPLC1 = extend ? 'extend our' : 'agree to a';
      // Diplomacy (Segment_2517 L0243): Var_3936 = 1, Var_d76c = 12
      if ((yield session.speech(request === 'helpme' ? '*HELPME' : '*CRUSADE', null, { mood: 1, talk: 12 })) === 1) {
        acceptAiRequest(state, request, player, enemy, amount);
      }
    }
    if (received !== -1) yield session.close();
  })());
}

/**
 * GameEngine.ResearchFinished: poseł komputera chwali się odkryciem (*GAPE) — zdarzenie `envoy`.
 * Warunek wzorca „!= −1”, więc tekst pokazuje się także po Esc.
 */
export function envoyMeeting(state: GameState, player: number, tech: number): KingMeeting {
  return new KingMeeting((function* (): Flow {
    const session = new Session(state, player, 0, -1, -1);
    if ((yield* session.receive()) === -1) return;
    session.values.US = state.players[player]!.nationPlural;
    session.values.RPLC1 = TECHS[tech]?.name ?? '';
    // ResearchFinished (Segment_1ade L1fe6): Var_3936 = 2, Var_d76c = 12
    yield session.speech('*GAPE', null, { mood: 2, talk: 12 });
    yield session.close();
  })());
}
