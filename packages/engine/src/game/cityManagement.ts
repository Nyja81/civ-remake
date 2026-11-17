/**
 * Działania gracza w oknie miasta. Źródło: interaktywna część CityWorker.F0_1d12_0045_ProcessCityState (tryb 1)
 * oraz F0_1d12_000a_FindCityOffset, F0_1d12_6da1_GetSpecialWorkerFlags i F0_1d12_6d6e_SetSpecialWorkerFlags
 * z OpenCivOne (MIT). Silnik tylko zmienia stan; okno po każdej zmianie liczy miasto od nowa (`processCity(…, 1)`).
 */
import { MovementType } from '../data/enums';
import { BUILDINGS } from '../data/buildings';
import { UNITS } from '../data/units';
import { aiSelectProduction } from './ai';
import { WonderId, hasBuilding, removeBuilding } from './buildings';
import { playerHasWonder } from './cities';
import { cityNeighborArea, changeProduction } from './economy';
import { CITY_OFFSETS, cellIndex, isValid } from './map';
import { CityStatus, Government, NO_UNIT, UnitStatus, type GameState } from './types';
import { occupantPlayer } from './units';

/** F0_1d12_000a_FindCityOffset: numer pola miasta (indeks CITY_OFFSETS) dla przesunięcia albo -1. */
export function cityTileIndex(dx: number, dy: number): number {
  return CITY_OFFSETS.findIndex(([x, y]) => x === dx && y === dy);
}

/** F0_1d12_6da1_GetSpecialWorkerFlags: rodzaj specjalisty `i` (1 poborca, 2 naukowiec, 3 artysta; od 9. zawsze 1). */
export function specialistAt(state: GameState, cityId: number, i: number): number {
  return i < 8 ? (state.cities[cityId]!.specialists >> (i * 2)) & 3 : 1;
}

/**
 * Klik w pole mapki miasta (etykieta L5aa6): przełącza pracę mieszkańca na polu `tile` (bez pola miasta).
 * Pole musi być odkryte; nowego pola nie można zająć, gdy pracuje na nim inne miasto albo stoi obca jednostka.
 * Zajęcie pola bierze specjalistę; bez wolnego specjalisty oryginał przelicza całe miasto od nowa (L045f) —
 * tu to samo robi kolejne `processCity(…, 1)`, bo pól pracujących jest wtedy więcej niż mieszkańców.
 * Zwraca true, gdy przydział się zmienił.
 *
 * Odstępstwo: oryginał porównuje z liczbą specjalistów zapamiętaną na początku przebiegu okna (Var_e8b8);
 * tu — z liczbą zapisaną w `workers` po ostatnim przeliczeniu (różnica tylko w pierwszym widoku po zmniejszeniu miasta).
 */
export function toggleCityTile(state: GameState, cityId: number, tile: number): boolean {
  if (tile < 0 || tile >= 20) return false;
  const city = state.cities[cityId]!;
  const [dx, dy] = CITY_OFFSETS[tile]!;
  const nx = city.x + dx;
  const ny = city.y + dy;
  if (!isValid(nx, ny) || !(state.map.explored[cellIndex(nx, ny)]! & (1 << city.owner))) return false;
  const bit = 1 << tile;
  if (!(city.workers & bit)) {
    // cityArea: pola sąsiednich miast i pola z obcymi jednostkami
    const occupant = occupantPlayer(state, nx, ny);
    if (cityNeighborArea(state, cityId).has((dx + 2) * 5 + (dy + 2)) || (occupant !== -1 && occupant !== city.owner)) return false;
  }
  let workers = (city.workers ^ bit) >>> 0;
  let idle = workers >>> 26;
  if (workers & bit) {
    if (idle !== 0) idle--;
  } else {
    idle++;
  }
  workers = ((workers & 0x3ffffff) | (idle << 26)) >>> 0;
  city.workers = workers;
  return true;
}

/** Klik w specjalistę albo klawisz 1–9: artysta → poborca → naukowiec → artysta (F0_1d12_6d6e_SetSpecialWorkerFlags). */
export function cycleSpecialist(state: GameState, cityId: number, i: number): void {
  if (i >= 8) return;
  const city = state.cities[cityId]!;
  const v = specialistAt(state, cityId, i);
  const next = v < 3 ? v + 1 : 1;
  city.specialists = (city.specialists & ~(3 << (i * 2))) | ((next & 3) << (i * 2));
}

/** Specjalistów można przełączać dopiero od pięciu mieszkańców („A City must have five population units…”). */
export const canAssignSpecialists = (state: GameState, cityId: number): boolean => state.cities[cityId]!.size >= 5;

/** Cena sprzedaży budynku (10 × koszt w dziesiątkach tarcz, bez względu na poziom trudności). */
export const buildingSellPrice = (building: number): number => 10 * BUILDINGS[building - 1]!.cost;

/**
 * Sprzedaż budynku (etykieta L5740): złoto dla gracza, budynek znika, w tej turze nie można sprzedać kolejnego
 * (CityStatus.BuildingSold, kasowany na początku tury miasta). Zwraca false, gdy sprzedaż niemożliwa.
 */
export function sellBuilding(state: GameState, cityId: number, building: number): boolean {
  const city = state.cities[cityId]!;
  if (city.status & CityStatus.BuildingSold || building < 1 || building > 24 || !hasBuilding(city, building)) return false;
  state.players[city.owner]!.gold += buildingSellPrice(building);
  removeBuilding(city, building);
  city.status |= CityStatus.BuildingSold;
  return true;
}

/**
 * Klik w jednostkę w mieście (lista na zakładce INFO): jednostka czuwająca lub ufortyfikowana dostaje pełny ruch,
 * kasowane są rozkazy (czuwanie, fortyfikacja, prace osadników) i cel „idź do”.
 */
export function activateUnitInCity(state: GameState, player: number, unitId: number): void {
  const u = state.players[player]!.units[unitId]!;
  if (u.type === NO_UNIT) return;
  if (u.status & (UnitStatus.Sentry | UnitStatus.Fortified)) u.movesLeft = UNITS[u.type]!.moves * 3;
  u.status &= ~(UnitStatus.Sentry | UnitStatus.BuildRoad | UnitStatus.Fortifying | UnitStatus.Fortified |
    UnitStatus.BuildIrrigation | UnitStatus.BuildMine);
  u.gotoX = -1;
  u.gotoY = -1;
}

/**
 * Klawisz A / prawy przycisk na CHANGE: przełącza automatyczny wybór produkcji; po włączeniu produkcję wybiera
 * ocena komputera (SelectCityProduction z flagą AutoProduction). Zwraca false, gdy ocena nic nie wybrała (99) —
 * oryginał zostawia wtedy flagę włączoną i przelicza okno od nowa.
 */
export function toggleAutoProduction(state: GameState, cityId: number): boolean {
  const city = state.cities[cityId]!;
  city.status ^= CityStatus.AutoProduction;
  if (!(city.status & CityStatus.AutoProduction)) return true;
  const choice = aiSelectProduction(state, city.owner, cityId);
  if (choice === 99) return false;
  changeProduction(state, cityId, choice);
  return true;
}

/** Jednostka utrzymywana przez miasto z oznaczeniami kosztów jak w oknie miasta. */
export interface SupportedUnit {
  unitId: number;
  /** Tarcza pod jednostką (Var_d2f6 ≠ 0 po doliczeniu tej jednostki). */
  shield: boolean;
  /** Żywność osadników: 0, 1 albo 2 ikony. */
  food: number;
  /** Niezadowolenie z jednostki bojowej poza miastem (republika, demokracja): 0, 1 albo 2 ikony. */
  unhappy: number;
}

/**
 * Jednostki z miastem macierzystym `cityId` w kolejności numerów, z kosztami jak w pętli po etykiecie L32e0
 * (bez dyplomatów i karawan w liczeniu tarcz).
 */
export function supportedUnits(state: GameState, cityId: number): SupportedUnit[] {
  const city = state.cities[cityId]!;
  const p = state.players[city.owner]!;
  const gov = p.government;
  let count = city.storedUnits.filter((u) => u !== -1).length; // Var_deb8
  let support = city.size < count ? count - city.size : 0; // Var_d2f6
  const suffrage = (playerHasWonder(state, city.owner, WonderId.WomensSuffrage) ? 1 : 0) + (gov === Government.Democracy ? 1 : 0);
  const list: SupportedUnit[] = [];
  p.units.forEach((u, i) => {
    if (u.type === NO_UNIT || u.homeCity !== cityId) return;
    const entry: SupportedUnit = { unitId: i, shield: false, food: 0, unhappy: 0 };
    if (u.type !== 26 && u.type !== 27) {
      count++;
      if (city.size >= count) {
        if (gov >= Government.Monarchy) support++;
      } else support++;
      entry.shield = support !== 0;
      const def = UNITS[u.type]!;
      if (u.type === 0) {
        entry.food = gov >= Government.Monarchy ? 2 : 1;
      } else if (gov >= Government.Republic && def.attack !== 0 && suffrage !== 0 &&
        (def.movementType === MovementType.Air || u.x !== city.x || u.y !== city.y)) {
        entry.unhappy = Math.min(2, suffrage);
      }
    }
    list.push(entry);
  });
  return list;
}
