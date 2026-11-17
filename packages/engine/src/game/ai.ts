/**
 * Przeciwnik komputerowy (etap 6) — w oryginale AIEngine (2500 linii) i GameEngine.SelectCityProduction.
 * TYMCZASOWO: proste, deterministyczne zachowanie, żeby gra toczyła się dalej:
 *  - osadnicy szukają w promieniu 6 pola o najwyższej atrakcyjności (warstwa buildScore z generatora),
 *    co najmniej 3 pola od innych miast, i tam zakładają miasto;
 *  - pozostałe jednostki lądowe komputera bronią miast (fortyfikacja), po 2 na miasto; nadmiarowe atakują
 *    sąsiadujących wrogów;
 *  - barbarzyńcy idą na najbliższe miasto i atakują, okręty barbarzyńców płyną do najbliższego miasta.
 * Do zastąpienia przeniesionym AIEngine.
 */
import { MovementType } from '../data/enums';
import { UNITS } from '../data/units';
import { BUILDINGS } from '../data/buildings';
import { Terrain } from '../world/generate';
import { cellIndex, DIRECTIONS, distance, isValid, terrainAt } from './map';
import { moveUnit } from './movement';
import { playerHasTech } from './techs';
import { Improvement, NO_UNIT, UnitStatus, type GameState } from './types';
import { unitOrder } from './turn';
import { occupantPlayer, unitsAt } from './units';

export function aiPlayerTurnStart(_state: GameState, _player: number): void {}

/** Krok w stronę celu (najmniejsza odległość, pola dostępne dla typu jednostki). */
function stepToward(state: GameState, player: number, unitId: number, tx: number, ty: number): boolean {
  const u = state.players[player]!.units[unitId]!;
  const def = UNITS[u.type]!;
  let best = -1;
  let bestDist = distance(u.x, u.y, tx, ty);
  for (let d = 1; d < 9; d++) {
    const [dx, dy] = DIRECTIONS[d]!;
    const nx = u.x + dx;
    const ny = u.y + dy;
    if (!isValid(nx, ny)) continue;
    const t = terrainAt(state.map, nx, ny);
    const city = (state.map.improvements[cellIndex(nx, ny)]! & Improvement.City) !== 0;
    if (def.movementType === MovementType.Land && t === Terrain.Water) continue;
    if (def.movementType === MovementType.Water && t !== Terrain.Water && !city) continue;
    const dist = distance(nx, ny, tx, ty);
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  if (best === -1) return false;
  const r = moveUnit(state, player, unitId, best);
  return r.kind === 'moved' || r.kind === 'attacked';
}

function nearestCityOf(state: GameState, x: number, y: number, filter: (owner: number) => boolean): number {
  let best = 999;
  let id = -1;
  state.cities.forEach((c, i) => {
    if (c.status === -1 || !filter(c.owner)) return;
    const d = distance(x, y, c.x, c.y);
    if (d < best) {
      best = d;
      id = i;
    }
  });
  return id;
}

/** Atak na sąsiadującego wroga, jeśli jest. */
function attackAdjacent(state: GameState, player: number, unitId: number): boolean {
  const u = state.players[player]!.units[unitId]!;
  if (UNITS[u.type]!.attack === 0 || u.movesLeft < 2) return false;
  for (let d = 1; d < 9; d++) {
    const [dx, dy] = DIRECTIONS[d]!;
    if (!isValid(u.x + dx, u.y + dy)) continue;
    const occ = occupantPlayer(state, u.x + dx, u.y + dy);
    if (occ === -1 || occ === player) continue;
    if (player !== 0 && occ !== 0 && state.players[player]!.diplomacy[occ]! & 2) continue;
    if (UNITS[u.type]!.movementType === MovementType.Land && terrainAt(state.map, u.x + dx, u.y + dy) === Terrain.Water) continue;
    const r = moveUnit(state, player, unitId, d);
    return r.kind === 'attacked';
  }
  return false;
}

export function aiMoveUnit(state: GameState, player: number, unitId: number): void {
  const u = state.players[player]!.units[unitId]!;
  const def = UNITS[u.type]!;
  const before = u.movesLeft;
  if (player === 0) {
    if (attackAdjacent(state, player, unitId)) return;
    const target = nearestCityOf(state, u.x, u.y, (o) => o !== 0);
    if (target !== -1) {
      const c = state.cities[target]!;
      if (def.movementType === MovementType.Water) {
        // przy brzegu budzi ładunek, który zejdzie na ląd
        for (const id of unitsAt(state, 0, u.x, u.y)) state.players[0]!.units[id]!.status &= ~UnitStatus.Sentry;
      }
      if (stepToward(state, player, unitId, c.x, c.y) && u.movesLeft < before) return;
    }
    unitOrder(state, player, unitId, 'skip');
    return;
  }
  if (u.type === 0) {
    const alive = () => state.players[player]!.units[unitId]!.type !== NO_UNIT;
    const site = bestCitySite(state, player, u.x, u.y);
    if (site && (site[0] !== u.x || site[1] !== u.y)) {
      if (stepToward(state, player, unitId, site[0], site[1]) && alive() && u.movesLeft < before) return;
    }
    if (alive() && !(state.map.improvements[cellIndex(u.x, u.y)]! & Improvement.City)) {
      unitOrder(state, player, unitId, 'build');
      return;
    }
    if (alive()) unitOrder(state, player, unitId, 'skip');
    return;
  }
  if (def.movementType === MovementType.Land) {
    if (attackAdjacent(state, player, unitId)) return;
    const here = state.map.improvements[cellIndex(u.x, u.y)]! & Improvement.City;
    const defenders = unitsAt(state, player, u.x, u.y).filter((i) => state.players[player]!.units[i]!.status & UnitStatus.Fortified).length;
    if (here && defenders < 2) {
      unitOrder(state, player, unitId, 'fortify');
      return;
    }
    const target = nearestCityOf(state, u.x, u.y, (o) => o === player && !hasTwoDefenders(state, player, o));
    if (target !== -1) {
      const c = state.cities[target]!;
      if ((c.x !== u.x || c.y !== u.y) && stepToward(state, player, unitId, c.x, c.y) && u.movesLeft < before) return;
    }
    unitOrder(state, player, unitId, 'fortify');
    return;
  }
  unitOrder(state, player, unitId, 'skip');
}

function hasTwoDefenders(state: GameState, player: number, _owner: number): boolean {
  void state;
  void player;
  return false;
}

/** Najlepsze pole na miasto w promieniu 6 (atrakcyjność ≥ 8, ≥ 3 pola od innych miast). */
function bestCitySite(state: GameState, player: number, x: number, y: number): [number, number] | null {
  let best: [number, number] | null = null;
  let bestScore = -1;
  for (let dy = -6; dy <= 6; dy++) {
    for (let dx = -6; dx <= 6; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (!isValid(nx, ny) || ny < 2 || ny > 47) continue;
      const i = cellIndex(nx, ny);
      if (state.map.terrain[i] === Terrain.Water || !(state.map.explored[i]! & (1 << player))) continue;
      const score = state.map.buildScore[i]! * 4 - distance(x, y, nx, ny);
      if (state.map.buildScore[i]! < 8) continue;
      if (state.cities.some((c) => c.status !== -1 && distance(c.x, c.y, nx, ny) < 3)) continue;
      const occ = occupantPlayer(state, nx, ny);
      if (occ !== -1 && occ !== player) continue;
      if (score > bestScore) {
        bestScore = score;
        best = [nx, ny];
      }
    }
  }
  return best;
}

/**
 * Wybór produkcji (SelectCityProduction) — TYMCZASOWO: obrońca, gdy miasto nie ma 2 jednostek,
 * potem osadnicy (do 3 miast na 1 miasto wyjściowe), potem budynki obronne/rozwojowe.
 * Zwraca numer jednostki (≥0) albo -id budynku; 99 = brak decyzji.
 */
export function aiSelectProduction(state: GameState, player: number, cityId: number): number {
  const city = state.cities[cityId]!;
  const p = state.players[player]!;
  const defenders = p.units.filter((u) => u.type !== NO_UNIT && u.x === city.x && u.y === city.y && u.type !== 0).length;
  const has = (t: number) => playerHasTech(state, player, t);
  if (defenders < 2) {
    for (const t of [12, 5, 4, 2, 1]) if (has(UNITS[t]!.requiredTech) && !has(UNITS[t]!.obsoleteTech)) return t;
    return 1;
  }
  const settlers = p.units.filter((u) => u.type === 0).length;
  if (city.size >= 2 && settlers < 2 && p.cityCount < 12) return 0;
  for (const b of [4, 3, 8, 5, 6]) { // świątynia, spichlerz, mury, targ, biblioteka
    if (!((city.buildings >>> (b - 1)) & 1) && has(BUILDINGS[b - 1]!.requiredTech)) return -b;
  }
  return defenders < 3 ? 2 : -2;
}
