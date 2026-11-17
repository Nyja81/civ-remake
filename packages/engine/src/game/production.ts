/**
 * Produkcja miasta z punktu widzenia gracza: lista „What shall we build”, czas budowy, zakup.
 * Źródło: GameEngine.SelectCityProduction (część budująca listę), CostToTurns i zakup w oknie miasta
 * (CityWorker.ProcessCityState, klawisz B) z OpenCivOne (MIT).
 */
import { BUILDINGS, WONDERS } from '../data/buildings';
import { MovementType } from '../data/enums';
import { Tech } from '../data/techs';
import { UNITS } from '../data/units';
import { WonderId } from './buildings';
import { playerHasWonder } from './cities';
import { cellIndex } from './map';
import { processCity, changeProduction } from './economy';
import { playerHasTech } from './techs';
import { CityStatus, type GameState } from './types';

export interface ProductionOption {
  /** Kod produkcji: ≥0 jednostka, -1…-24 budynek, -25…-45 cud. */
  id: number;
  name: string;
  /** Koszt w dziesiątkach tarcz. */
  cost: number;
  turns: number;
  /** Cud przestarzały (gwiazdka w oryginale). */
  obsolete?: boolean;
}

/** Liczba tur do ukończenia (CostToTurns). */
export function turnsToBuild(state: GameState, cityId: number, cost: number): number {
  const city = state.cities[cityId]!;
  const r = processCity(state, cityId, 1);
  const surplus = Math.min(99, Math.max(1, (r?.shields ?? 0) - (r?.unitSupport ?? 0)));
  return Math.min(999, Math.max(1, Math.trunc((10 * cost - city.shields - 1) / surplus) + 1));
}

/** Lista „What shall we build in …?” dla gracza. */
export function productionOptions(state: GameState, cityId: number): ProductionOption[] {
  const city = state.cities[cityId]!;
  const player = city.owner;
  const has = (t: number) => playerHasTech(state, player, t);
  const options: ProductionOption[] = [];
  UNITS.forEach((u, i) => {
    if (i === 25 && !(state.wonderCity[17] !== -1 && has(Tech.NuclearFission))) return;
    if (!has(u.requiredTech) || has(u.obsoleteTech)) return;
    if (u.movementType === MovementType.Water && !(city.status & CityStatus.WaterAccess)) return;
    options.push({ id: i, name: u.name, cost: u.cost, turns: turnsToBuild(state, cityId, u.cost) });
  });
  let hoover = false;
  if (playerHasWonder(state, player, WonderId.HooverDam)) {
    const dam = state.cities[state.wonderCity[WonderId.HooverDam]!]!;
    hoover = state.map.group[cellIndex(city.x, city.y)] === state.map.group[cellIndex(dam.x, dam.y)];
  }
  const b = city.buildings;
  for (let i = 1; i < 25; i++) {
    const def = BUILDINGS[i - 1]!;
    if (!has(def.requiredTech) || b & (1 << (i - 1))) continue;
    if (i === 7 && b & 1) continue; // sąd w stolicy
    if (i === 15 && b & 0x8000) continue; // fabryka, gdy jest Mfg. Plant
    if (i === 10 && !(b & 0x10) && has(BUILDINGS[4]!.requiredTech)) continue; // bank wymaga targu
    if (i === 12 && !(b & 0x20) && has(BUILDINGS[5]!.requiredTech)) continue; // uniwersytet wymaga biblioteki
    if (i === 20 && !(city.status & CityStatus.NearRiverOrMountains)) continue; // elektrownia wodna
    if (i === 19 && !(b & 0x4000)) continue; // elektrownia wymaga fabryki
    if ((i === 19 || i === 20 || i === 21) && (hoover || b & 0x1c0000)) continue;
    if (i > 21 && !(state.wonderCity[19] !== -1)) continue; // części statku po programie Apollo
    options.push({ id: -i, name: def.name, cost: def.cost, turns: turnsToBuild(state, cityId, def.cost) });
  }
  WONDERS.forEach((w, k) => {
    const i = k + 25;
    if (!has(w.requiredTech) || state.wonderCity[k + 1] !== -1) return;
    const obsolete = w.obsoleteTech !== Tech.None && w.obsoleteTech !== Tech.Never && (state.techFirstDiscoveredBy[w.obsoleteTech]! & 7) !== 0;
    options.push({ id: -i, name: w.name, cost: w.cost, turns: turnsToBuild(state, cityId, w.cost), obsolete });
  });
  return options;
}

/** Cena dokończenia bieżącej produkcji w złocie. */
export function buyCost(state: GameState, cityId: number): number {
  const city = state.cities[cityId]!;
  let cost: number;
  if (city.production >= 0) {
    const left = Math.min(999, Math.max(0, 10 * UNITS[city.production]!.cost - city.shields));
    cost = Math.trunc((left * left) / 20) + left * 2;
  } else {
    const id = -city.production;
    const item = id <= 24 ? BUILDINGS[id - 1]! : WONDERS[id - 25]!;
    cost = Math.min(999, Math.max(0, 10 * item.cost - city.shields)) * 2;
    if (id > 21) cost += cost;
  }
  if (city.shields === 0) cost += cost;
  return cost;
}

/** Zakup: ustawia pełną liczbę tarcz i pobiera złoto. Zwraca false, gdy niemożliwe (niepokoje, brak złota). */
export function buyProduction(state: GameState, cityId: number): boolean {
  const city = state.cities[cityId]!;
  const p = state.players[city.owner]!;
  const cost = buyCost(state, cityId);
  if (city.status & CityStatus.CivilDisorder || p.gold < cost) return false;
  const id = city.production;
  const item = id >= 0 ? UNITS[id]!.cost : (-id <= 24 ? BUILDINGS[-id - 1]! : WONDERS[-id - 25]!).cost;
  city.shields = item * 10;
  p.gold -= cost;
  return true;
}

/** Zmiana produkcji przez gracza (wyłącza automatyczny wybór). */
export function setProduction(state: GameState, cityId: number, production: number): void {
  state.cities[cityId]!.status &= ~CityStatus.AutoProduction;
  changeProduction(state, cityId, production);
}
