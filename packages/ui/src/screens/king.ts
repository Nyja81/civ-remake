/**
 * Ekran rozmowy z władcą komputera. Źródło: dosłowne tłumaczenie asemblera (OpenCivOne, MIT, commit ec23ac3,
 * `Segments/Overlay_6.cs`) i MeetWithKing.cs:
 *   F6_0000_1d2b + F6_0000_21ac — sala tronowa BACK??.PIC (wg ustroju, z Invention: wariant „M”), ciała doradców
 *     z GOVT??.PIC (4 × 78×99 z (80i+1, 101), rysowane w (DS:0x3afe[i], 34) dla i < (ranking + 1) / 2, ciało (i + gracz) & 3)
 *     i portret władcy z KING??.PIC (wycinek (181, 67) 139×133 rysowany w (90, 0)); paleta tła z kolorami 64–143 z KING??.PAL;
 *     potem klatki twarzy z KING??.PIC (14 par: oczy 59×20 i usta 59×29 w siatce 60×50, z pominięciem pól 8, 9, 13, 14)
 *     i głowy doradców z GOVT??.PIC (4 × 3 miny, 28×24 z (29j + 161, 25i + 1)),
 *   F6_0000_1b33 — klatka animacji w każdym obiegu pętli okna (MenuBoxDialog, gdy Var_3936 ≠ −1): sekwencje oczu i ust
 *     z tablic DS:0x3a94/0x3aa6/0x3ab8, mówienie (Var_d76c klatek), losowe mrugnięcia — losowania F0_2dc4_005d wspólnym
 *     generatorem gry (`state.rng`), potem czekanie 10 jednostek zegara,
 *   F6_0000_2362 — rysowanie klatki: głowy doradców (gdy zmieniła się ich mina) z punktami zaczepienia z segmentu 0x36fa
 *     (wariant sali: ustrój / 2 % 3, komunizm 6, z Invention + 3) oraz oczy i usta władcy (punkty zaczepienia 0x36fa:0x10/0x48),
 *   F6_0000_233c — koniec animacji (zwolnienie klatek),
 *   F6_0000_251d_ShowInlineDialog — tekst i opcje bez ramki w (36, 139) na tle sali (wiersz 8 pikseli),
 *   F6_0000_16cd — pytanie o posła (ShowDialog w (100, 80)) i czcionka władcy (bajt z 0x36fa:nacja + 8; 10 → 3),
 *   F6_0000_16ac — koniec rozmowy (powrót do mapy z wygaszeniem).
 * Logikę rozmowy prowadzi silnik (`meetWithKing`, `aiRequestMeeting`, `envoyMeeting`): ten moduł pokazuje kroki
 * i przenosi do animacji zapisy Var_3936 / Var_d76c / Var_6b8e niesione przez kroki.
 * Tablice animacji czyta `GameAssets.kingAnimation()` z CIV.EXE gracza w czasie działania (`exeData.ts`).
 *
 * Pominięte: dźwięk (PlayTune: krótka i długa melodia nacji, sygnał 33 przy groźbach); wariant z brakującą dyskietką
 * (F0_11a8_02a4 — napis „imię: tytuł of the naród.” zamiast sali).
 * Bez plików BACK??.PIC / KING??.PIC ekran jest uproszczony (czarne tło z imieniem władcy, szary pas na tekst);
 * bez CIV.EXE twarz jest nieruchoma i animacja nie losuje (generator gry nie jest wtedy zużywany).
 */
import { playerHasTech, Tech, type GameState, type KingKeywords, type KingMeeting, type MeetingStep } from '@civ-remake/engine';
import type { GameAssets } from '../assets';
import type { KingAnimationData } from '../exeData';
import { showMenuBox } from '../menuBox';
import { readPaletteRange } from '../palette';
import { Surface } from '../surface';
import { adjustTextBlockWidth, replaceKeywords, textSection } from '../text';
import type { Ui } from '../ui';

/** Array_3938_NationalityIDToLeaderID — numer portretu KING??.PIC dla nacji. */
export const NATION_LEADER_IDS = [3, 10, 7, 12, 1, 4, 13, 2, 3, 8, 3, 11, 9, 6, 0, 5] as const;

/** Nazwa tła sali tronowej: BACK + ustrój/2 (komunizm = 3) + A albo M (gracz zna Invention; nie dla komunizmu). */
export function throneRoomFile(government: number, invention: boolean): string {
  if (government === 3) return 'BACK3A.PIC';
  return `BACK${government >> 1}${invention ? 'M' : 'A'}.PIC`;
}

export const leaderFile = (nation: number, ext: 'PIC' | 'PAL') =>
  `KING${String(NATION_LEADER_IDS[nation] ?? 0).padStart(2, '0')}.${ext}`;

/** Obraz doradców (F6_0000_1d2b): GOVT + ustrój/2 (komunizm = 3) + A albo M (Invention; nie dla komunizmu). */
export function advisorsFile(government: number, invention: boolean): string {
  return `GOVT${throneRoomFile(government, invention).slice(4)}`;
}

/** F6_0000_16cd: czcionka władcy = bajt z segmentu 0x36fa (indeks = nacja) + 8, wynik 10 zamieniany na 3; bez CIV.EXE — 1. */
export function leaderFontId(nation: number, data: KingAnimationData | null = null): number {
  if (!data) return 1;
  const font = (data.leaderFont[nation] ?? 0) + 8;
  return font === 10 ? 3 : font;
}

/** Zmienne globalne animacji (segment danych oryginału) — trwają między rozmowami, jak w oryginale. */
interface FaceGlobals {
  /** Var_3936: mina (−1 = bez animacji). */
  mood: number;
  /** Var_d76c: pozostałe klatki mówienia. */
  talk: number;
  /** Var_6b8e. */
  stern: number;
  /** Var_67f4: krok sekwencji. */
  seq: number;
  /** Var_67f6: przerwa po mówieniu (bez losowych mrugnięć). */
  pause: number;
  /** Var_7ef4: mina doradców w tej klatce (−1 = bez zmiany). */
  advisorMood: number;
  /** Var_67e8: ostatnio narysowana mina doradców. */
  lastAdvisor: number;
  /** Kopie tablic DS:0x3a94 / 0x3aa6 / 0x3ab8 — oryginał zmienia w nich trzy komórki (0x3a9a, 0x3ab4, 0x3ab7). */
  readonly eyes: number[];
  readonly mouth: number[];
  readonly control: readonly number[];
}

/** Stan sali z F6_0000_1d2b: klatki i parametry rysowania (zwalniane w F6_0000_233c). */
interface FaceScene {
  readonly player: number;
  /** Var_67f8. */
  readonly leaderId: number;
  /** Wariant sali dla punktów głów doradców (F6_0000_2362: −0xa). */
  readonly variant: number;
  readonly advisors: number;
  /** Var_67f0: ekran uproszczony — klatki nie są rysowane. */
  readonly simple: boolean;
  /** Var_67fa: głowy doradców wczytane. */
  readonly heads: readonly (readonly Surface[])[] | null;
  readonly eyeFrames: readonly Surface[];
  readonly mouthFrames: readonly Surface[];
}

interface FaceAnimation {
  readonly data: KingAnimationData;
  readonly globals: FaceGlobals;
  scene: FaceScene | null;
}

const animations = new WeakMap<Ui, FaceAnimation>();

/** Animacja dla danego ekranu (null, gdy brak danych z CIV.EXE). */
function faceAnimation(ui: Ui, assets: GameAssets): FaceAnimation | null {
  let a = animations.get(ui);
  if (a) return a;
  const data = assets.kingAnimation();
  if (!data) return null;
  a = {
    data,
    globals: {
      mood: -1, talk: 0, stern: 0, seq: 0, pause: 0, advisorMood: -1, lastAdvisor: -1,
      eyes: [...data.eyes], mouth: [...data.mouth], control: [...data.control],
    },
    scene: null,
  };
  animations.set(ui, a);
  return a;
}

/** Odczyt zmiennych animacji (testy, diagnostyka). */
export function kingFaceState(ui: Ui): Readonly<Pick<FaceGlobals, 'mood' | 'talk' | 'stern' | 'seq' | 'advisorMood' | 'lastAdvisor'>> | null {
  return animations.get(ui)?.globals ?? null;
}

/**
 * Teksty zastępcze, gdy w kopii gry brak KING.TXT — własne sformułowania w układzie oryginału:
 * opcja 1 oznacza zgodę (tak sprawdza ją silnik), w *THREAT: 0 pożegnanie, 1 wojna z trzecią cywilizacją, 2 żądanie trybutu.
 */
const FALLBACK_TEXTS: Readonly<Record<string, string>> = {
  '*EXCHANGE': 'We could share our knowledge.\nWe offer $RPLC1 for an advance\nof your choosing.\n No thanks.\n Agreed.\n',
  '*CANCEL': 'We $RPLC1 that you break your\ntreaty with the $THEM.\n Never!\n We agree.\n',
  '*TRIBUTE': 'Pay us $BUCKS gold in tribute,\nor face our armies.\n We refuse.\n We pay.\n',
  '*TAKECIV': 'Give us the secret of $RPLC1,\nor face our armies.\n We refuse.\n We agree.\n',
  '*PROVOKE': 'Your insolence will be\npunished. Prepare for war!\n',
  '*REJECT': 'You reject our demands.\nThen it is war!\n',
  '*RID': 'We shall rid the world\nof you. This means war!\n',
  '*PEACE': 'Shall we make peace?\n No.\n Yes.\n',
  '*TREATY': 'The $US and $RPLC1\npeoples sign a treaty of peace.\n',
  '*GIVECIV': 'For peace we offer you\nthe secret of $RPLC1.\n No.\n Yes.\n',
  '*GIVECASH': 'For peace we offer you\n$BUCKS gold.\n No.\n Yes.\n',
  '*GROVEL': 'Spare us! Take our treasury\nof $BUCKS gold and all our knowledge.\n No mercy.\n We accept.\n',
  '*MOBILIZE': 'So be it. We mobilize\nour armies for war.\n',
  '*ATTITUDE': 'We expect you to remember\nour generosity.\n',
  '*THREAT': 'What do you want from the $RPLC1?\n Nothing. Farewell.\n Declare war on our enemies.\n Pay us tribute!\n',
  '*GIVEMORE': 'Take $BUCKS gold\nand leave us in peace.\n',
  '*NOCONTACT': 'We have no contact\nwith the $RPLC1.\n',
  '*ATWAR': 'We are already at war\nwith the $RPLC1.\n',
  '*MERCENARY': 'For $BUCKS gold we will\nmarch against the $RPLC1.\n No.\n Yes.\n',
  '*UNFORTUNATE': 'Sadly, you cannot\nafford our help.\n',
  '*HELPME': 'We are at war with the\n$THEM. Will you\nsend us $BUCKS gold?\n No.\n Yes.\n',
  '*CRUSADE': 'Will you $RPLC1 alliance\nagainst the $THEM?\n No.\n Yes.\n',
  '*GAPE': 'The $US have discovered\n$RPLC1!\n',
};

/** LanguageTools.F0_2f4d_044f_GetTextFromKingSection: sekcja KING.TXT, słowa kluczowe, łamanie do `width` znaków. */
export function kingText(assets: GameAssets, key: string, values: KingKeywords, width = 80): string {
  const data = assets.optional('KING.TXT');
  const section = data ? textSection(data, key) : null;
  const text = section !== null ? adjustTextBlockWidth(replaceKeywords(section, values), width) : replaceKeywords(FALLBACK_TEXTS[key] ?? `${key}\n`, values);
  return text.endsWith('\n') ? text : `${text}\n`;
}

/** GDriver.ScreenToBitmap z obrazu pliku: wycinek w × h z (x, y). */
function cutPic(image: Surface | import('@civ-remake/gfx').PicImage, x: number, y: number, w: number, h: number): Surface {
  const s = new Surface(w, h);
  s.blit(image, x, y, w, h, 0, 0);
  return s;
}

/**
 * F6_0000_1d2b / F6_0000_21ac: sala tronowa z doradcami i portretem na ekranie 1, potem na ekranie 0 z paletą rozmowy;
 * klatki twarzy i głowy doradców do animacji.
 */
export function drawThroneRoom(ui: Ui, assets: GameAssets, state: GameState, player: number): void {
  const gfx = ui.gfx;
  const pl = state.players[player]!;
  const palette = gfx.palette.clone();
  const invention = playerHasTech(state, player, Tech.Invention); // Var_67ee
  const anim = faceAnimation(ui, assets);
  const backName = throneRoomFile(pl.government, invention);
  const govtName = advisorsFile(pl.government, invention);
  const kingName = leaderFile(pl.nation, 'PIC');
  const withBack = assets.has(backName);
  // L1e3e: ciała doradców (4 × 78×99 z (80i + 1, 101))
  const govt = assets.has(govtName) ? assets.pic(govtName) : null;
  const bodies = govt ? Array.from({ length: 4 }, (_, i) => cutPic(govt, 80 * i + 1, 101, 78, 99)) : null;
  // F6_0000_21ac
  if (withBack) {
    gfx.loadPic(1, 0, 0, assets.pic(backName));
    const range = readPaletteRange(assets.file(backName));
    if (range) palette.apply(range);
  } else {
    gfx.fillRect(0, 0, 320, 136, 0, 1);
    gfx.fillRect(0, 136, 320, 64, 7, 1);
  }
  const advisors = Math.trunc((pl.ranking + 1) / 2);
  if (bodies && anim) {
    for (let i = 0; i < advisors; i++) gfx.drawBitmap(bodies[(i + player) & 3]!, anim.data.advisorX[i] ?? 0, 34, 1);
  }
  if (assets.has(kingName)) {
    const portrait = cutPic(assets.pic(kingName), 181, 67, 139, 133);
    gfx.drawBitmap(portrait, 90, 0, 1);
    // kolory 64–143 z palety władcy (kopia bajtów 0xc0–0x1b0 bloku palety)
    const kingPal = assets.optional(leaderFile(pl.nation, 'PAL'));
    const range = kingPal ? readPaletteRange(kingPal) : null;
    if (range) {
      for (let c = Math.max(64, range.first); c <= Math.min(143, range.last); c++) {
        const o = (c - range.first) * 3;
        palette.setColor(c, range.rgb[o]!, range.rgb[o + 1]!, range.rgb[o + 2]!);
      }
    }
  }
  gfx.fillRect(0, 0, 320, 200, 0);
  gfx.setPalette(palette);
  gfx.copy(1, 0, 0, 320, 200, 0, 0, 0);
  if (!withBack) {
    const title = `${pl.leader} of the ${pl.nationPlural}`;
    gfx.drawCenteredStringWithShadow(title, 160, assets.has(kingName) ? 124 : 60, 15);
  }
  ui.present();
  if (!anim) return;
  // L1f94: klatki twarzy — oczy (60·(k % 5) + 1, 50·(k / 5) + 1) 59×20 i usta (…, 50·(k / 5) + 21) 59×29,
  // k rośnie z każdą klatką i przeskakuje o 2 przed klatkami 8 i 11
  const king = assets.has(kingName) ? assets.pic(kingName) : null;
  const eyeFrames: Surface[] = [];
  const mouthFrames: Surface[] = [];
  for (let i = 0, k = 0; i < 14; i++, k++) {
    if (i === 8 || i === 11) k += 2;
    const x = (k % 5) * 60 + 1;
    const y = Math.trunc(k / 5) * 50;
    eyeFrames.push(king ? cutPic(king, x, y + 1, 59, 20) : new Surface(59, 20));
    mouthFrames.push(king ? cutPic(king, x, y + 21, 59, 29) : new Surface(59, 29));
  }
  // L2076: głowy doradców 28×24 z (29j + 161, 25i + 1), po trzy miny
  const heads = govt
    ? Array.from({ length: 4 }, (_, i) => Array.from({ length: 3 }, (_, j) => cutPic(govt, 29 * j + 161, 25 * i + 1, 28, 24)))
    : null;
  let variant = Math.trunc(pl.government / 2) % 3;
  if (pl.government === 3) variant = 6;
  else if (invention) variant += 3;
  anim.scene = {
    player, leaderId: NATION_LEADER_IDS[pl.nation] ?? 0, variant, advisors,
    simple: !withBack || !king, heads, eyeFrames, mouthFrames,
  };
  anim.globals.seq = 0; // F6_0000_21ac: Var_67f4 = 0
  anim.globals.lastAdvisor = -1; // F6_0000_16cd: Var_67e8 = −1, Var_7ef4 = 0
  anim.globals.advisorMood = 0;
}

/**
 * F6_0000_1b33: jedna klatka animacji (logika i losowania), potem F6_0000_2362 (rysowanie). Woła ją pętla okna
 * (MenuBoxDialog) w każdym obiegu, gdy Var_3936 ≠ −1; czekanie 10 jednostek zegara robi pętla okna.
 */
export function kingFaceFrame(ui: Ui, assets: GameAssets, state: GameState): void {
  const anim = faceAnimation(ui, assets);
  if (!anim) return;
  const g = anim.globals;
  const random = (n: number) => state.rng.next(n); // F0_2dc4_005d
  g.advisorMood = -1;
  let eyes: number;
  let mouth: number;
  if (g.talk !== 0 && g.seq === 0) {
    // L1cc0: mówienie — usta 0 albo 9, co czwarta klatka 8
    eyes = g.seq !== 0 ? 5 : -1;
    mouth = random(2) !== 0 ? 9 : 0;
    if ((g.talk & 3) === 0) mouth = 8;
    g.talk = (g.talk - 1) << 16 >> 16;
    g.pause = 4;
  } else {
    // L1b50
    const c = g.control[g.seq] ?? 0;
    if (c > 0) {
      g.seq++;
    } else if (c < 0) {
      if (c === -3) g.seq = 14;
      else if (c === -2) g.seq = 6;
      else if (c === -1) g.seq = 0;
    } else {
      // L1b9a: koniec sekwencji — przejście do sekwencji miny
      let next = -1;
      if (g.mood === 0) {
        g.eyes[6] = g.stern !== 0 ? 4 : 2; // DS:0x3a9a
        if (g.seq !== 6) next = 3;
      } else if (g.mood === 1) {
        if (g.seq !== 0) next = 0;
      } else if (g.mood === 2) {
        g.mouth[14] = g.stern !== 0 ? 11 : 7; // DS:0x3ab4
        g.mouth[17] = g.stern !== 0 ? 11 : 7; // DS:0x3ab7
        if (g.seq !== 14) next = 12;
      }
      // L1bce
      if (g.talk !== 0 && g.seq !== 0) next = 0;
      if (next !== -1) {
        if (g.seq === 0) g.seq = next;
        if (g.seq === 6 || g.seq === 14) g.seq++;
      } else {
        // L1c44: sekwencja trwa — mina doradców wg kroku
        g.advisorMood = g.seq === 6 ? 2 : g.seq === 14 ? 1 : 0;
      }
    }
    // L1c64: losowe mrugnięcie / grymas w spoczynku
    if (g.pause === 0 && random(12) === 0 && (g.control[g.seq] ?? 0) === 0) {
      if (g.seq === 0) g.seq = 1;
      if (g.seq === 6) g.seq = 10;
      if (g.seq === 14) g.seq = 17;
    }
    eyes = g.eyes[g.seq] ?? -1;
    mouth = g.mouth[g.seq] ?? -1;
  }
  // L1d02
  if (g.pause !== 0) g.pause--;
  drawFaceFrame(ui, anim, eyes, mouth, g.advisorMood);
}

/** F6_0000_2362: głowy doradców (gdy zmieniła się ich mina), oczy i usta władcy — na ekranie 0. */
function drawFaceFrame(ui: Ui, anim: FaceAnimation, eyes: number, mouth: number, advisorMood: number): void {
  const scene = anim.scene;
  if (!scene || scene.simple) return;
  const gfx = ui.gfx;
  const { data, globals: g } = anim;
  if (advisorMood !== -1 && advisorMood !== g.lastAdvisor && scene.heads) {
    for (let i = 0; i < scene.advisors; i++) {
      const c = (i + scene.player) & 3;
      const si = scene.variant * 16 + c * 4;
      let x = data.advisorX[i] ?? 0;
      let y = 0;
      x += data.word(si + 0x80) - 80 * c;
      x -= data.word(si + 0x82) - 160;
      y += data.word(si + 0xf0) - 100;
      y -= data.word(si + 0xf2) - 25 * c;
      gfx.drawBitmap(scene.heads[c]![advisorMood]!, x, y + 34);
      g.lastAdvisor = advisorMood;
    }
  }
  const lid = scene.leaderId * 4;
  const x = 90 + data.word(lid + 0x10) - 180 - data.word(lid + 0x12);
  const y = data.word(lid + 0x48) - 64 - data.word(lid + 0x4a);
  if (eyes !== -1 && scene.eyeFrames[eyes]) gfx.drawBitmap(scene.eyeFrames[eyes]!, x, y - 2);
  if (mouth !== -1 && scene.mouthFrames[mouth]) gfx.drawBitmap(scene.mouthFrames[mouth]!, x, y + 18);
  ui.present();
}

/** F6_0000_233c: koniec animacji — klatki zwolnione. */
function endFaceAnimation(ui: Ui): void {
  const anim = animations.get(ui);
  if (anim) anim.scene = null;
}

/** F6_0000_251d_ShowInlineDialog: menu bez ramki na tle sali; dolny pas ekranu odtwarzany po wyborze. */
export async function showInlineDialog(ui: Ui, text: string, x: number, y: number, disabled = 0, idle?: () => void): Promise<number> {
  ui.gfx.copy(0, 0, 128, 320, 72, 1, 0, 128);
  const r = await showMenuBox(ui, text, x, y, { frame: false, clearInput: true, disabled, lineHeight: 8, idle });
  ui.gfx.copy(1, 0, 128, 320, 72, 0, 0, 128);
  ui.present();
  return r.index;
}

export interface KingMeetingHooks {
  /** MapManagement.DrawVisibleMap(x, y) przed pytaniem o posła. */
  readonly centerMap?: (x: number, y: number) => void;
  /** Porada (Help.ShowInstantAdvicePopup); `values` — słowa kluczowe. */
  readonly advice?: (key: string, values: KingKeywords) => Promise<void>;
  /** F6_0000_16ac: powrót do mapy (GameEngine.RedrawMapWithBlankingEffect). */
  readonly close?: () => Promise<void>;
}

/**
 * Prowadzi rozmowę: pokazuje kroki silnika i oddaje mu odpowiedzi. `keywords` to trwały odpowiednik Array_30b8
 * (wartości z poprzednich rozmów zostają, jak w oryginale); kroki nadpisują w nim to, co ustawia wzorzec.
 */
export async function runKingMeeting(
  ui: Ui, assets: GameAssets, state: GameState, meeting: KingMeeting, keywords: KingKeywords, hooks: KingMeetingHooks = {},
): Promise<void> {
  const text = (step: Extract<MeetingStep, { kind: 'speech' | 'dialog' }>) => {
    Object.assign(keywords, step.values);
    if (step.text !== null) return step.text;
    return kingText(assets, step.key ?? '', keywords, step.width);
  };
  const anim = faceAnimation(ui, assets);
  // pętla okna woła F6_0000_1b33, gdy Var_3936 ≠ −1
  const idle = () => (anim && anim.globals.mood !== -1 ? () => kingFaceFrame(ui, assets, state) : undefined);
  /** MenuBoxDialog.ShowDialog z animacją: ekran 0 zapamiętany na ekranie 1 i odtworzony po wyborze. */
  const dialog = async (body: string, x: number, y: number): Promise<number> => {
    ui.gfx.copy(0, 0, 0, 320, 200, 1, 0, 0);
    const animated = idle();
    const r = await showMenuBox(ui, body, x, y, { frame: true, clearInput: true, idle: animated, lineHeight: animated ? 8 : undefined });
    ui.gfx.copy(1, 0, 0, 320, 200, 0, 0, 0);
    ui.present();
    return r.index;
  };
  for (let step = meeting.step; step; ) {
    let answer = 0;
    switch (step.kind) {
      case 'emissary':
        if (step.x !== -1) hooks.centerMap?.(step.x - 8, step.y - 2);
        answer = await dialog(step.text, 100, 80);
        break;
      case 'portrait':
        drawThroneRoom(ui, assets, state, step.player);
        ui.gfx.fontId = leaderFontId(state.players[step.player]!.nation, assets.kingAnimation());
        break;
      case 'speech':
      case 'dialog':
        if (anim) {
          // zapisy Var_3936 / Var_d76c / Var_6b8e sprzed okna
          anim.globals.mood = step.mood;
          if (step.talk !== null) anim.globals.talk = step.talk;
          if (step.stern !== null) anim.globals.stern = step.stern;
        }
        answer = step.kind === 'speech'
          ? await showInlineDialog(ui, text(step), 36, 139, step.disabled, idle())
          : await dialog(text(step), 40, 100);
        break;
      case 'advice':
        Object.assign(keywords, step.values);
        await hooks.advice?.(step.key, keywords);
        break;
      case 'close':
        // F6_0000_16ac: F6_0000_233c, Var_3936 = −1
        endFaceAnimation(ui);
        if (anim) anim.globals.mood = -1;
        ui.gfx.fontId = 1;
        await hooks.close?.();
        break;
    }
    step = meeting.answer(answer);
  }
}
