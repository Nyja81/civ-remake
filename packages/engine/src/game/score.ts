/**
 * Punktacja cywilizacji. Źródło: GameEngine.F20_0000_0ca9_ShowCivilizationScorePopup z OpenCivOne (MIT) — część licząca
 * (okno rysuje interfejs). Wynik liczony dla człowieka jak w oryginale (wartości zapisywane w polach gracza człowieka).
 */
import { processCity } from './economy';
import type { GameState } from './types';

export interface CivilizationScore {
  /** Mieszkańcy: rozmiar + zadowoleni − niezadowoleni (przy luksusie 40%). */
  citizens: number;
  /** Cuda: 20 za każdy. */
  wonders: number;
  /** Statek kosmiczny: sukces% × koloniści / 2; liczony do wyniku tylko w roku przylotu. */
  spaceship: number;
  spaceshipArrived: boolean;
  /** Zanieczyszczenie: −10 za pole. */
  pollution: number;
  /** Pokój: 3 za turę po naszej erze, najwyżej 100. */
  peace: number;
  /** Technologie przyszłości: 5 za każdą. */
  futureTech: number;
  /** Premia za podbój świata albo -1. */
  bonus: number;
  total: number;
  /** Liczby mieszkańców wg kategorii do rysunku (zadowoleni, zwykli, niezadowoleni, specjaliści) — dla każdego miasta. */
  cities: { happy: number; content: number; unhappy: number; specialists: number }[];
}

export function civilizationScore(state: GameState, player: number, conquest = state.gameOver === 1): CivilizationScore {
  const p = state.players[player]!;
  const oldTax = p.taxRate;
  p.taxRate = 6 - p.scienceRate;
  let citizens = 0;
  const cities: CivilizationScore['cities'] = [];
  state.cities.forEach((c, i) => {
    if (c.status === -1 || c.owner !== player) return;
    const r = processCity(state, i, 1);
    if (!r) return;
    cities.push({ happy: r.happy, content: c.size - r.happy - r.unhappy - r.specialists, unhappy: r.unhappy, specialists: r.specialists });
    citizens += c.size + r.happy - r.unhappy;
  });
  p.taxRate = oldTax;
  let wonders = 0;
  for (let w = 1; w < 22; w++) {
    const c = state.wonderCity[w]!;
    if (c !== -1 && c !== 128 && state.cities[c]!.owner === player) wonders += 20;
  }
  let total = wonders + citizens;
  const h = state.players[state.humanPlayer]!;
  let spaceship = 0;
  const spaceshipArrived = h.spaceshipEta === state.year;
  if (h.spaceshipPopulation !== 0 && h.spaceshipSuccess !== 0) {
    spaceship = Math.max(Math.trunc((h.spaceshipSuccess * h.spaceshipPopulation) / 2), 0);
    if (spaceshipArrived) total += spaceship;
  }
  const pollution = state.pollutedSquares * -10;
  total += pollution;
  const peace = state.year > 0 && state.peaceTurns !== 0 ? Math.min(100, Math.max(0, state.peaceTurns * 3)) : 0;
  total += peace;
  const futureTech = h.futureTechs * 5;
  total += futureTech;
  if (total < 0) total = 0;
  const bonus = conquest ? (550 - state.turn) * 2 + state.aiOpponents * 100 + 400 : -1;
  if (bonus > total) total = bonus;
  return { citizens, wonders, spaceship, spaceshipArrived, pollution, peace, futureTech, bonus, total, cities };
}

// ── Hall of Fame (HallOfFame.cs, HallOfFameEntry.cs) ───────────────────────────────────

export interface HallOfFameEntry {
  totalScore: number;
  difficulty: number;
  finalYear: number;
  achievements: number;
  citizens: number;
  /** Ludność w tysiącach (GetPlayerPopulationCount: suma 1+2+…+rozmiar dla każdego miasta). */
  population: number;
  leader: string;
  nation: string;
}

export const emptyHallOfFame = (): HallOfFameEntry[] =>
  Array.from({ length: 6 }, () => ({ totalScore: -1, difficulty: 0, finalYear: 0, achievements: 0, citizens: 0, population: 0, leader: '', nation: '' }));

/** Ocena cywilizacji w procentach: wynik × (poziom + 1) / 50. */
export const civilizationRating = (score: number, difficulty: number): number => Math.trunc((score * (difficulty + 1)) / 50);

/** GetPlayerPopulationCount. */
export function playerPopulation(state: GameState, player: number): number {
  let n = 0;
  for (const c of state.cities) if (c.status !== -1 && c.owner === player) for (let j = 1; j <= c.size; j++) n += j;
  return n;
}

/** Wpis do Hall of Fame dla człowieka na koniec gry (AddNewEntryToHallOfFame). */
export function hallOfFameEntry(state: GameState, score: CivilizationScore): HallOfFameEntry {
  const h = state.players[state.humanPlayer]!;
  return {
    totalScore: score.total, difficulty: state.difficulty, finalYear: state.year, achievements: score.wonders,
    citizens: score.citizens, population: playerPopulation(state, state.humanPlayer), leader: h.leader, nation: h.nationPlural,
  };
}

/**
 * AddNewEntryToHallOfFame wg dosłownego tłumaczenia asemblera (Overlay_3, F3_0000_0513): porównanie
 * wynik × (poziom + 2); nowy wpis trafia przed pierwszy słabszy, a gdy takiego nie ma — na ostatnie (szóste) miejsce.
 * Niższe wpisy przesuwają się w dół. Nowsza wersja wzorca (porównanie ocen, przesunięcie od j = 4, brak wstawienia na koniec)
 * różni się od asemblera. Zwraca miejsce 0–5.
 */
export function addHallOfFameEntry(entries: HallOfFameEntry[], entry: HallOfFameEntry): number {
  const value = (entry.difficulty + 2) * entry.totalScore;
  for (let i = 0; i < 6; i++) {
    const e = entries[i]!;
    if ((e.difficulty + 2) * e.totalScore < value || i === 5) {
      for (let j = 5; j > i; j--) entries[j] = entries[j - 1]!;
      entries[i] = entry;
      return i;
    }
  }
  return -1;
}

export const FAMOUS_PERSONS = [
  'Dan Quayle', 'Emperor Nero', 'Ferdinand Marcos', 'Neville Chamberlain', 'Louis the XVI', 'Kaiser Wilhelm', 'Eric the Red',
  'Otto von Bismarck', 'Simon Bolivar', 'Vladimir Lenin', 'Charles De Gaulle', 'Cleopatra', 'Winston Churchill',
  'Suleyman the Magnificent', 'Franklin Roosevelt', 'Shogun Tokugawa', 'Thomas Jefferson', 'King Charlemagne',
  'Emperor Augustus', 'Solomon the Wise',
] as const;

/** ShowFamousPersonsWindow: indeks postaci dla wyniku (ostatnie i, dla którego i²/3 < ocena) albo -1. */
export function famousPersonIndex(score: number, difficulty: number): number {
  const rating = civilizationRating(score, difficulty);
  let index = -1;
  for (let i = 1; i < 21; i++) if (Math.trunc((i * i) / 3) < rating) index = i - 1;
  return Math.min(19, index);
}
