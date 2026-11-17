/**
 * Statek kosmiczny. Źródło: Spaceship.cs (GetSpaceshipState, AddSpaceshipPart, ShowSpaceshipDialog — część licząca,
 * LaunchSpaceshipDialog), Actions.SpaceshipArrivalFailed, CityWorker (ukończenie części) oraz tabele SpaceshipCells
 * z OpenCivOne (MIT). Plan statku i części — z CIV.EXE (`data/ruleTables.ts`, `npm run extract`).
 *
 * Plan statku: 15×12 pól; komórka zawiera numer rysunku części (0–2 struktura, 3 napęd, 4 paliwo, 6 mieszkania,
 * 7 podtrzymanie życia, 8 panel słoneczny) albo -1. Flagi `spaceshipFlags`: bit gracza = wystrzelony, bit gracza + 8 = w budowie.
 */
import { SPACESHIP_CELLS, SPACESHIP_PARTS } from '../data/ruleTables';
import { Tech } from '../data/techs';
import type { GameState } from './types';

export const SPACESHIP_WIDTH = 15;
export const SPACESHIP_HEIGHT = 12;

export { SPACESHIP_CELLS, SPACESHIP_PARTS };



export const emptySpaceship = (): number[] => new Array<number>(SPACESHIP_WIDTH * SPACESHIP_HEIGHT).fill(-1);

const cellAt = (ship: readonly number[], x: number, y: number) => ship[x * SPACESHIP_HEIGHT + y]!;
const setCell = (ship: number[], x: number, y: number, v: number) => {
  ship[x * SPACESHIP_HEIGHT + y] = v;
};

export interface SpaceshipStats {
  /** Liczba połączonych części wg numeru rysunku (0–8). */
  counts: number[];
  /** Części niepołączone ze strukturą (rysowane czerwoną ramką): [x, y, szer., wys.] w polach. */
  loose: [number, number, number, number][];
  mass: number;
  /** Koloniści w dziesiątkach tysięcy (liczba modułów mieszkalnych). */
  population: number;
  support: number;
  energy: number;
  fuel: number;
  /** Czas lotu w dziesiątych częściach roku. */
  travelTime: number;
  success: number;
}

/** ValidateSpaceShipData: pole zajęte przez strukturę, napęd albo paliwo. */
function structural(ship: readonly number[], x: number, y: number): number {
  if (x < 0 || x >= SPACESHIP_WIDTH || y < 0 || y >= SPACESHIP_HEIGHT) return 0;
  const v = cellAt(ship, x, y);
  return v === -1 || v > 4 ? 0 : 1;
}

/** Część licząca ShowSpaceshipDialog. `details` = człowiek albo „Enemy Moves” (wtedy liczy się wsparcie). */
export function spaceshipStats(ship: readonly number[], details = true): SpaceshipStats {
  const counts = new Array<number>(9).fill(0);
  const loose: SpaceshipStats['loose'] = [];
  for (const [x, y] of SPACESHIP_CELLS) {
    const type = cellAt(ship, x, y);
    if (type === -1) continue;
    const w = type < 6 && type !== 3 ? 1 : 2;
    const h = type < 6 ? 1 : 2;
    let valid = type > 4 ? 0 : 1;
    for (let j = 0; j < w; j++) {
      for (let k = 0; k < h; k++) {
        valid += structural(ship, x + j + 1, y + k) + structural(ship, x + j - 1, y + k);
        valid += structural(ship, x + j, y + k + 1) + structural(ship, x + j, y + k - 1);
      }
    }
    if (valid !== 0) counts[type]!++;
    else loose.push([x, y, w, h]);
  }
  let mass = 0;
  for (let i = 0; i < 9; i++) mass += SPACESHIP_PARTS[i]!.mass * counts[i]!;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  let success = 100;
  const support = Math.trunc((100 * counts[7]!) / clamp(counts[6]!, 1, 99));
  if (details) success = Math.trunc((clamp(support, 0, 100) * success) / 100);
  const energy = Math.trunc((200 * counts[8]!) / clamp(counts[6]! + counts[7]!, 1, 99));
  success = Math.trunc((clamp(energy, 0, 100) * success) / 100);
  const fuel = Math.trunc((counts[4]! * 100) / clamp(counts[3]!, 1, 99));
  const travelTime = Math.trunc((mass * 50) / (clamp(10 * counts[3]!, 0, 10 * counts[4]!) + 1));
  if (travelTime > 150) success -= Math.trunc((travelTime - 150) / 10);
  success = clamp(success, 0, 100);
  return { counts, loose, mass, population: counts[6]!, support, energy, fuel, travelTime, success };
}

export const isLaunched = (state: GameState, p: number) => (state.spaceshipFlags & (1 << p)) !== 0;
export const isBuildingSpaceship = (state: GameState, p: number) => (state.spaceshipFlags & (1 << (p + 8))) !== 0;

/** Po każdym pokazaniu planu (ShowSpaceshipDialog): koloniści, a dla niewystrzelonego statku — przewidywany rok przylotu. */
function refresh(state: GameState, p: number): SpaceshipStats {
  const pl = state.players[p]!;
  const stats = spaceshipStats(pl.spaceship, p === state.humanPlayer || state.settings.enemyMoves);
  if (!isLaunched(state, p)) pl.spaceshipEta = Math.trunc(stats.travelTime / 10) + state.year;
  pl.spaceshipPopulation = stats.population;
  return stats;
}

/** Szansa sukcesu i rok przylotu (bez rysowania) — dla okna statku w interfejsie. */
export function spaceshipReport(state: GameState, p: number): SpaceshipStats {
  return refresh(state, p);
}

/**
 * GetSpaceshipState (komputer): wstawia część danego rodzaju (0 struktura, 1 komponent, 2 moduł).
 * Zwraca 0 — wstawiono, 1 — statek częściowo gotowy (nie ma miejsca na tę część), 2 — brak miejsca na cokolwiek.
 */
export function aiAddSpaceshipPart(state: GameState, p: number, part: number, hasTech: (tech: number) => boolean, partTech: (part: number) => number): number {
  state.aiSpaceshipSuccess = 0;
  const pl = state.players[p]!;
  const h = state.players[state.humanPlayer]!;
  let i = 0;
  let found = 1;
  let selected = 999;
  if (part === 2 || (pl.spaceshipEta !== -1 && pl.spaceshipEta - state.year < 15 && (pl.spaceshipEta < h.spaceshipEta || h.spaceshipEta === -1))) i = 33;
  do {
    const [x, y, bmp] = SPACESHIP_CELLS[i]!;
    if (cellAt(pl.spaceship, x, y) === -1) {
      if (selected === 999 && bmp >= part * 3 + 3) selected = i;
      if (Math.trunc(bmp / 3) === part) {
        found = 0;
        break;
      }
    }
    i++;
  } while (i < SPACESHIP_CELLS.length && (i - selected < 4 || part === 2 || !hasTech(partTech(part))));
  if (i >= SPACESHIP_CELLS.length && selected === 999) return 2;
  if (found !== 0 || (i >= SPACESHIP_CELLS.length && selected !== 999)) return 1;
  state.events.push({ kind: 'news', text: `${pl.nationPlural} builds space ship.\n`, spaceship: p });
  const [x, y, bmp] = SPACESHIP_CELLS[i]!;
  setCell(pl.spaceship, x, y, bmp);
  state.aiSpaceshipSuccess = refresh(state, p).success;
  state.spaceshipFlags |= 1 << (p + 8);
  return 0;
}

/** Rodzaje części do wyboru dla człowieka: komponent — napęd (3)/paliwo (4), moduł — mieszkania (6)/podtrzymanie (7)/panel (8). */
export function spaceshipPartChoices(state: GameState, p: number, part: number): { bitmap: number; available: boolean }[] {
  if (part === 0) return [];
  const ship = state.players[p]!.spaceship;
  const kinds = part === 1 ? [3, 4] : [6, 7, 8];
  return kinds.map((bitmap) => ({ bitmap, available: SPACESHIP_CELLS.some(([x, y, b]) => b === bitmap && cellAt(ship, x, y) === -1) }));
}

/**
 * AddSpaceshipPart (człowiek): struktura trafia na pierwsze wolne miejsce tej połowy planu, która jest mniej zaawansowana;
 * komponent i moduł — na pierwsze wolne miejsce wybranego rodzaju (`bitmap`). Zwraca false, gdy część nie jest już potrzebna.
 */
export function addSpaceshipPart(state: GameState, p: number, part: number, bitmap = -1): boolean {
  const pl = state.players[p]!;
  const ship = pl.spaceship;
  let cell = -1;
  if (part === 0) {
    const half = (from: number, to: number): [number, number] => {
      let low = 99;
      let high = -1;
      for (let j = from; j < to; j++) {
        const [x, y, b] = SPACESHIP_CELLS[j]!;
        if (cellAt(ship, x, y) === -1) {
          if (b < 3 && low === 99) low = j;
        } else if (b > 6) high = j;
      }
      return [low, high];
    };
    const [low1, high1] = half(0, 33);
    const [low2, high2] = half(33, SPACESHIP_CELLS.length);
    cell = high2 - low2 < high1 - low1 ? low1 : low2;
    if (cell >= SPACESHIP_CELLS.length) cell = -1;
  } else {
    cell = SPACESHIP_CELLS.findIndex(([x, y, b]) => b === bitmap && cellAt(ship, x, y) === -1);
  }
  if (cell === -1) {
    pl.spaceshipSuccess = refresh(state, p).success;
    return false;
  }
  const [x, y, b] = SPACESHIP_CELLS[cell]!;
  setCell(ship, x, y, b);
  if (!isBuildingSpaceship(state, p)) {
    for (let i = 1; i < 8; i++) if (isBuildingSpaceship(state, i)) state.players[i]!.contactCountdown = 0;
    state.spaceshipFlags |= 1 << (p + 8);
  }
  pl.spaceshipSuccess = refresh(state, p).success;
  return true;
}

/** LaunchSpaceshipDialog: start statku; rok przylotu już policzony przy ostatnim przeglądzie planu. */
export function launchSpaceship(state: GameState, p: number): void {
  const pl = state.players[p]!;
  refresh(state, p);
  state.spaceshipFlags |= 1 << p;
  pl.spaceshipLaunchYear = state.year;
  state.events.push({ kind: 'spaceshipLaunched', player: p, spaceship: p,
    text: `${pl.nationPlural} launched space ship!\nEstimated arrival in ${pl.spaceshipEta}.\n` });
}

/** SpaceshipArrivalFailed: utrata stolicy niszczy statek (w budowie albo w locie). */
export function spaceshipLost(state: GameState, p: number): void {
  const pl = state.players[p]!;
  if (isBuildingSpaceship(state, p)) {
    state.events.push({ kind: 'message', text: `${pl.nationAdjective} spaceship\n${isLaunched(state, p) ? 'returns to Earth' : 'construction cancelled'}.\n` });
  }
  state.spaceshipFlags &= ~((1 << p) | (1 << (p + 8)));
  pl.spaceshipEta = -1;
  pl.spaceship = emptySpaceship();
}

/**
 * Ukończenie części statku w mieście (CityWorker): człowiek dostaje zdarzenie wyboru miejsca; komputer wstawia część,
 * a przy braku miejsca odzyskuje tarcze i przełącza się na kolejny rodzaj części; potem decyduje o starcie.
 */
export function spaceshipPartBuilt(state: GameState, cityId: number, item: number, cost: number,
  hasTech: (p: number, tech: number) => boolean, partTech: (part: number) => number): void {
  const city = state.cities[cityId]!;
  const p = city.owner;
  if (isLaunched(state, p)) return;
  const part = item - 22;
  if (p === state.humanPlayer) {
    if (part === 0) addSpaceshipPart(state, p, 0);
    state.events.push({ kind: 'spaceshipPart', player: p, part, placed: part === 0 });
    return;
  }
  let st = aiAddSpaceshipPart(state, p, part, (t) => hasTech(p, t), partTech);
  if (st !== 0 && item < 24) {
    city.shields += cost;
    if (city.production <= -22 && city.production >= -24) city.production = -item - 1;
    st--;
  }
  const h = state.players[state.humanPlayer]!;
  const me = state.players[p]!;
  if (!isLaunched(state, p) && state.aiSpaceshipSuccess >= 40) {
    if (st === 0) launchSpaceship(state, p);
    else if (hasTech(state.humanPlayer, Tech.SpaceFlight)) {
      if (state.aiSpaceshipSuccess > 75) launchSpaceship(state, p);
      else if (h.ranking > me.ranking) launchSpaceship(state, p);
      else if (isLaunched(state, state.humanPlayer) && me.spaceshipEta - state.year <= h.spaceshipEta - state.year) launchSpaceship(state, p);
      // Wzorzec: Players[ActiveCivilizations].Coins — indeks z maski cywilizacji (dosłownie); przy masce > 7 brak gracza
      else if (isBuildingSpaceship(state, state.humanPlayer) && (state.players[state.activeCivs]?.gold ?? 0) > 1000) launchSpaceship(state, p);
    }
  } else if (st !== 0) launchSpaceship(state, p);
}

