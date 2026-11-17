/**
 * Pałac gracza-człowieka — część obliczeniowa. Źródło: OpenCivOne (MIT), dosłowne tłumaczenie asemblera
 * (`Overlay_17.cs`, `Segment_1238.cs`, `Overlay_5.cs` z pierwszego commitu wzorca); nowsza wersja `Palace.cs`
 * jest przepisana od nowa (inne położenia i tekst „Select section type”), więc idziemy za dosłownym tłumaczeniem.
 *
 * Dane jak w oryginale (zmienne globalne, tylko dla człowieka): poziomy 12 części (DS:0xd91e — części 0–8 to budynek,
 * 0 i 8 zawsze puste; 9 lewy ogród, 10 dziedziniec, 11 prawy ogród), rodzaje części (DS:0xb222: 0–2 = styl) i liczba
 * rozbudów (Var_1c20). Rysowanie i wybór części robi interfejs (`screens/palace.ts`).
 */
import { BuildingId, hasBuilding } from './buildings';
import { civilizationScore } from './score';
import type { GameState, PalaceState } from './types';

/** Liczba części pałacu (budynek 0–8 + ogrody i dziedziniec 9–11). */
export const PALACE_SECTIONS = 12;

/** Ostatnia rozbudowa, przy której oryginał pokazuje okno pałacu (PalaceBuildCount ≤ 37). */
export const PALACE_MAX_BUILD = 37;

/**
 * Stan na początku gry (StartGameMenu, Overlay_5 L0421/L0440): wszystkie części −1, rodzaje 0;
 * środek budynku (3–5) i ogrody z dziedzińcem (9–11) — poziom 0.
 */
export function newPalace(): PalaceState {
  const levels = new Array<number>(PALACE_SECTIONS).fill(-1);
  for (let i = 3; i <= 5; i++) {
    levels[i] = 0;
    levels[i + 6] = 0;
  }
  return { levels, types: new Array<number>(PALACE_SECTIONS).fill(0), buildCount: 0 };
}

/** Pałac z zapisu albo wartości początkowe (zapisy sprzed wprowadzenia pałacu go nie mają). */
export function palaceOf(state: GameState): PalaceState {
  if (!state.palace) state.palace = newPalace();
  return state.palace;
}

/** F0_1238_16e7_GetPalaceBuildNewScoreThreshold: Σ i·(7 − poziom) dla i = 0…level, potem połowa + 1. */
export function palaceBuildThreshold(state: GameState, level: number): number {
  let sum = 0;
  for (let i = 0; i <= level; i++) sum += i * (7 - state.difficulty);
  return Math.trunc(sum / 2) + 1;
}

/** F0_1238_1c98_GetPalaceLevelFromScore — przybliżona liczba rozbudów z wyniku (mini-pałac cudzych władców). */
export function palaceLevelFromScore(score: number): number {
  let level = 0;
  do {
    level += 5;
    score -= level;
  } while (score > 0);
  return Math.trunc(level / 5) - 1;
}

/**
 * Fragment GameTurn (Segment_1238 0x05e6–0x066e): jeśli człowiek ma miasto z pałacem, opcja Palace jest włączona,
 * a wynik cywilizacji osiągnął próg kolejnej rozbudowy — licznik rozbudów rośnie i (do 37. rozbudowy) zgłaszane jest
 * zdarzenie `palace`; okno wyboru części (F17_0000_0000_UpgradePalace) pokazuje interfejs.
 */
export function checkPalaceUpgrade(state: GameState): boolean {
  const human = state.humanPlayer;
  const hasPalace = state.cities.some((c) => c.status !== -1 && c.owner === human && hasBuilding(c, BuildingId.Palace));
  if (!hasPalace || !state.settings.palace || (state.spaceshipFlags & 0x100) !== 0) return false;
  const palace = palaceOf(state);
  if (civilizationScore(state, human, false).total < palaceBuildThreshold(state, palace.buildCount + 1)) return false;
  palace.buildCount++;
  if (palace.buildCount > PALACE_MAX_BUILD) return false;
  state.events.push({ kind: 'palace', player: human, buildCount: palace.buildCount });
  return true;
}

/** Numer części 1–7 jest wypisany na ekranie wyboru (F17_0000_0000, pętla L0148). */
export function palaceSectionOffered(p: PalaceState, section: number): boolean {
  const l = p.levels;
  if (section < 1 || section > 7 || l[section]! >= 4) return false;
  return l[section - 1]! > 0 || l[section + 1]! > 0 || l[section]! >= 0;
}

/** Litera A–C (ogród lewy, dziedziniec, ogród prawy) jest wypisana, gdy poziom < 3 (pętla L01cd). */
export function palaceGardenOffered(p: PalaceState, garden: number): boolean {
  return p.levels[9 + garden]! < 3;
}

/** Czy jest co rozbudować (zmienna bp−0x102); bez tego okno kończy się po komunikacie *PALACE. */
export function palaceCanUpgrade(p: PalaceState): boolean {
  for (let i = 1; i < 8; i++) if (palaceSectionOffered(p, i)) return true;
  for (let i = 0; i < 3; i++) if (palaceGardenOffered(p, i)) return true;
  return false;
}

/** Wybór odrzucany w pętli L0268: część 1–11 o poziomie ≥ 4 (ogrody i dziedziniec — ≥ 3). */
export function palaceSectionAccepted(p: PalaceState, section: number): boolean {
  if (section < 1 || section > 11) return false;
  const level = p.levels[section]!;
  return level < 4 && !(section >= 9 && level >= 3);
}

/**
 * Pętle L02ce/L02ef: wybrana pusta część budynku przesuwa się ku środkowi, aż dotknie istniejącej
 * (lewa strona — póki prawy sąsiad nie ma poziomu > 0, a sama część jest pusta; prawa — symetrycznie).
 */
export function normalizePalaceSection(p: PalaceState, section: number): number {
  if (section >= 9) return section;
  const l = p.levels;
  for (; section < 4; section++) if (l[section + 1]! > 0 || l[section]! !== -1) break;
  for (; section > 4; section--) if (l[section - 1]! > 0 || l[section]! !== -1) break;
  return section;
}

/** Poziom części po rozbudowie: CheckValueRange(poziom + 1, 1, 4). */
export function palaceNewLevel(p: PalaceState, section: number): number {
  return Math.min(4, Math.max(1, p.levels[section]! + 1));
}

/**
 * L0747: zapis rozbudowy. `type` — styl 0–2 wybrany na ekranie „Select new section.”; dla ogrodów i dziedzińca
 * oryginał zapisuje niezainicjowaną zmienną (rodzaju tych części nic nie czyta) — tu rodzaj zostaje bez zmian.
 */
export function upgradePalace(state: GameState, section: number, type?: number): void {
  const p = palaceOf(state);
  p.levels[section] = palaceNewLevel(p, section);
  if (section < 9 && type !== undefined) p.types[section] = type;
}

/** Poziomy i rodzaje części 0–8 do narysowania mini-pałacu (F0_1238_14a3_DrawMiniPalace, bez rysowania). */
export interface MiniPalace {
  readonly levels: number[];
  readonly types: number[];
}

/**
 * F0_1238_14a3_DrawMiniPalace — część obliczeniowa. Brak miast = brak pałacu (null). Człowiek: jego pałac.
 * Komputer: pałac losowany własnym generatorem (słowo 16-bitowe r = gracz · ziarno; r = 5r + 1, część = (r & 0xff) % 9),
 * `buildCount` rozbudów (3–36), każda część najwyżej do poziomu min(3, rozbudowy / 5) i nie wyżej niż sąsiad bliżej środka.
 */
export function miniPalace(state: GameState, player: number, buildCount: number): MiniPalace | null {
  if (state.players[player]!.cityCount === 0) return null;
  const levels = new Array<number>(9).fill(-1);
  const types = new Array<number>(9).fill(0);
  for (let i = 3; i <= 5; i++) levels[i] = 0;
  if (player === state.humanPlayer) {
    const p = palaceOf(state);
    for (let i = 0; i < 9; i++) {
      levels[i] = p.levels[i]!;
      types[i] = p.types[i]!;
    }
    return { levels, types };
  }
  const count = Math.min(36, Math.max(3, buildCount + 3));
  const threshold = Math.trunc(count / 5);
  let r = (player * state.mapSeed) & 0xffff;
  for (let i = 0; i < count; i++) {
    let section = 0;
    let level = 0;
    for (let attempt = 0; ; ) {
      let ok = true;
      r = (r * 5 + 1) & 0xffff;
      section = (r & 0xff) % 9;
      level = levels[section]! + 1;
      if (section < 4 && (levels[section + 1]! < level || levels[7 - section] === -1)) ok = false;
      if (section > 4 && (levels[section - 1]! < level || levels[9 - section] === -1)) ok = false;
      if (level > threshold || level > 3) ok = false;
      if (ok) break;
      attempt++;
      if (attempt >= 999) break;
    }
    levels[section] = level;
    types[section] = player % 3;
  }
  return { levels, types };
}

/**
 * Rysunek części mini-pałacu (pętla L1635): 0 lewy skraj, 1 część lewa, 2 środek, 3 część prawa, 4 prawy skraj.
 * Poza tablicą oryginał czyta sąsiednie zmienne stosu: levels[−1] przyjmujemy jako −1, a levels[9] to types[0].
 */
export function miniPalacePiece(m: MiniPalace, i: number): number {
  if (i < 4) {
    const left = i === 0 ? -1 : m.levels[i - 1]!;
    return left === -1 || i === 1 ? 0 : 1;
  }
  if (i > 4) {
    const right = i === 8 ? m.types[0]! : m.levels[i + 1]!;
    return right === -1 || i === 7 ? 4 : 3;
  }
  return 2;
}
