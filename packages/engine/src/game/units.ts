/**
 * Jednostki: tworzenie, usuwanie, stosy, zajętość pól i widoczność.
 * Źródło: UnitManagement (CreateUnit, DeleteUnit, UpdateUnitVisibility, IsUnitOrCityNear)
 * oraz MapManagement (SetCellPlayerID, GetCellActiveUnitID…) z OpenCivOne (MIT).
 *
 * Odstępstwo od układu oryginału: oryginał łączy jednostki stojące na jednym polu w listę cykliczną
 * (pole NextUnitID). Tu stos to po prostu wszystkie jednostki gracza na danym polu w kolejności numerów;
 * „aktywna” jednostka pola to ta o najniższym numerze — tak samo jak w GetCellActiveUnitID.
 */
import { MAX_UNITS_PER_PLAYER } from '../data/enums';
import { UNITS } from '../data/units';
import { MovementType, UnitRole } from '../data/enums';
import { hasTribalHut } from '../world/features';
import { Terrain } from '../world/generate';
import { DIRECTIONS, cellIndex, distance, isValid, terrainAt, wrapX } from './map';
import { Improvement, NO_UNIT, UnitStatus, type GameState, type Unit } from './types';
import { updateDiplomacyStatus } from './diplomacy';

export const unitDef = (u: Unit) => UNITS[u.type]!;

export function emptyUnit(): Unit {
  return {
    type: NO_UNIT, status: 0, x: -1, y: -1, movesLeft: 0, specialMoves: 0,
    gotoX: -1, gotoY: -1, gotoNextDirection: -1, visibleBy: 0, homeCity: -1,
  };
}

// ── miasta (podstawowe zapytania potrzebne już przy ruchu) ──────────────────────────────

export function cityAt(state: GameState, x: number, y: number): number {
  const wx = wrapX(x);
  return state.cities.findIndex((c) => c.status !== -1 && c.x === wx && c.y === y);
}

export function nearestCity(state: GameState, x: number, y: number): number {
  let best = 999;
  let id = -1;
  state.cities.forEach((c, i) => {
    if (c.status === -1) return;
    const d = distance(x, y, c.x, c.y);
    if (d < best) {
      best = d;
      id = i;
    }
  });
  return id;
}

// ── warstwa zajętości pól ──────────────────────────────────────────────────────────────

/** Gracz, którego jednostki stoją na polu, albo -1 (GetCellActiveUnitPlayerID). */
export function occupantPlayer(state: GameState, x: number, y: number): number {
  if (!isValid(x, y)) return -1;
  const v = state.map.occupant[cellIndex(x, y)]!;
  return v & 8 ? v & 7 : -1;
}

/** Właściciel miasta/ostatniego zajęcia pola (GetCityOwner). */
export function cellOwner(state: GameState, x: number, y: number): number {
  return state.map.occupant[cellIndex(x, y)]! & 7;
}

export function setCellOwner(state: GameState, x: number, y: number, player: number): void {
  const i = cellIndex(x, y);
  state.map.occupant[i] = (state.map.occupant[i]! & 8) | player;
}

/** Aktywna jednostka pola (najniższy numer jednostki gracza zajmującego pole) albo -1. */
export function activeUnitAt(state: GameState, x: number, y: number): number {
  const p = occupantPlayer(state, x, y);
  if (p === -1) return -1;
  const wx = wrapX(x);
  const id = state.players[p]!.units.findIndex((u) => u.type !== NO_UNIT && u.x === wx && u.y === y);
  if (id === -1) state.map.occupant[cellIndex(x, y)] = 0;
  return id;
}

/** Numery jednostek gracza na polu. */
export function unitsAt(state: GameState, player: number, x: number, y: number): number[] {
  const wx = wrapX(x);
  const ids: number[] = [];
  state.players[player]!.units.forEach((u, i) => {
    if (u.type !== NO_UNIT && u.x === wx && u.y === y) ids.push(i);
  });
  return ids;
}

/** Jednostka wchodzi na pole (SetCellPlayerID). */
function enterCell(state: GameState, player: number, x: number, y: number): void {
  state.map.occupant[cellIndex(x, y)] = player | 8;
}

/** Jednostka schodzi z pola; gdy to ostatnia jednostka, zostaje sam właściciel (SetCellActivePlayerID). */
function leaveCell(state: GameState, player: number, unitId: number, x: number, y: number): void {
  const others = unitsAt(state, player, x, y).filter((i) => i !== unitId);
  if (others.length === 0) state.map.occupant[cellIndex(x, y)] = player;
}

/** Przenosi jednostkę na pole (bez żadnych reguł). */
export function placeUnit(state: GameState, player: number, unitId: number, x: number, y: number): void {
  const u = state.players[player]!.units[unitId]!;
  if (u.x >= 0) leaveCell(state, player, unitId, u.x, u.y);
  enterCell(state, player, x, y);
  u.x = wrapX(x);
  u.y = y;
}

/** CreateUnit: zwraca numer jednostki albo -1, gdy gracz ma już 127 jednostek. */
export function createUnit(state: GameState, player: number, type: number, x: number, y: number): number {
  const p = state.players[player]!;
  let id = 0;
  while (id < MAX_UNITS_PER_PLAYER - 1 && p.units[id]!.type !== NO_UNIT) id++;
  if (id >= MAX_UNITS_PER_PLAYER - 1) {
    if (player === state.humanPlayer) state.events.push({ kind: 'advice', key: '*UMAX', player });
    return -1;
  }
  const u = p.units[id]!;
  Object.assign(u, emptyUnit());
  setCellOwner(state, x, y, player);
  enterCell(state, player, x, y);
  state.map.explored[cellIndex(x, y)]! |= 1 << player;
  u.x = wrapX(x);
  u.y = y;
  u.type = type;
  u.visibleBy = 1 << player;
  u.specialMoves = UNITS[type]!.turnsOutside;
  const home = nearestCity(state, x, y);
  u.homeCity = home !== -1 && state.cities[home]!.owner === player ? home : -1;
  if (u.specialMoves !== 0) u.specialMoves--;
  p.activeUnits[type]!++;
  updateUnitVisibility(state, x, y, player, id);
  return id;
}

/** DeleteUnit (z jednostkami na pokładzie statku i samolotami na lotniskowcu). */
export function deleteUnit(state: GameState, player: number, unitId: number, countAsLost = false): void {
  const p = state.players[player]!;
  const u = p.units[unitId]!;
  if (u.type === NO_UNIT) return;
  const def = UNITS[u.type]!;
  if (countAsLost) p.lostUnits[u.type]!++;
  if (terrainAt(state.map, u.x, u.y) === Terrain.Water) {
    const others = unitsAt(state, player, u.x, u.y).filter((i) => i !== unitId);
    if (def.transportCapacity !== 0 && others.length > 0) {
      // jednostki lądowe na pokładzie toną razem ze statkiem (DeleteLandUnitsInStack)
      for (const i of others) if (UNITS[p.units[i]!.type]!.movementType === MovementType.Land) deleteUnit(state, player, i, countAsLost);
    }
    if (u.type === 23 && others.length > 0) {
      for (const i of others) if (UNITS[p.units[i]!.type]!.movementType === MovementType.Air) deleteUnit(state, player, i, countAsLost);
    }
  }
  p.activeUnits[u.type]!--;
  u.type = NO_UNIT;
  u.movesLeft = 0;
  leaveCell(state, player, unitId, u.x, u.y);
}

/** Usuwa cały stos jednostek gracza z pola (DeleteUnitStack). */
export function deleteStack(state: GameState, player: number, x: number, y: number, countAsLost = true): void {
  for (const i of unitsAt(state, player, x, y)) deleteUnit(state, player, i, countAsLost);
}

/** Odkrycie pola przez gracza; dla człowieka również przepisanie widocznych ulepszeń (UpdateVisibleCellStatus). */
export function exploreCell(state: GameState, player: number, x: number, y: number): void {
  const i = cellIndex(x, y);
  if (player !== 0) state.map.explored[i]! |= 1 << player;
  if (player === state.humanPlayer) state.map.visibleImprovements[i] = state.map.improvements[i]!;
}

/** Czy pole zawiera chatę plemienia (nieodwiedzoną — odwiedzone oznacza bit 0 maski odkrycia). */
export function cellHasHut(state: GameState, x: number, y: number): boolean {
  const i = cellIndex(x, y);
  return (state.map.explored[i]! & 1) === 0 && !(state.map.improvements[i]! & Improvement.City) &&
    hasTribalHut(wrapX(x), y, state.map.terrain[i]!, state.mapSeed);
}

/**
 * UpdateUnitVisibility: odkrywa pola wokół jednostki (promień 1, a dla jednostek z zasięgiem 2 — promień 2;
 * okręty widzą w drugim pierścieniu tylko wodę) i wzajemnie ujawnia jednostki sąsiadów.
 * Pominięte (wymagają przeciwnika komputerowego i dyplomacji — etapy 6–7): polityki jednostek AI
 * i UpdateDiplomacyStatus; zamiast tego silnik zgłasza zdarzenie „contact”.
 */
export function updateUnitVisibility(state: GameState, x: number, y: number, player: number, unitId: number): void {
  const unit = state.players[player]!.units[unitId]!;
  if (unit.type === NO_UNIT) return;
  const def = UNITS[unit.type]!;
  const seesFar = (nx: number, ny: number) =>
    (def.sightRange & 2) !== 0 && (def.movementType !== MovementType.Water || terrainAt(state.map, nx, ny) === Terrain.Water);
  const imp = (nx: number, ny: number) => state.map.improvements[cellIndex(nx, ny)]!;
  const hereIsCity = (imp(x, y) & Improvement.City) !== 0;

  if (player === state.humanPlayer) {
    for (let d = 0; d < 25; d++) {
      const [dx, dy] = DIRECTIONS[d]!;
      const nx = wrapX(x + dx);
      const ny = y + dy;
      if (!isValid(nx, ny)) continue;
      if (d < 9 || seesFar(nx, ny)) exploreCell(state, player, nx, ny);
    }
  }

  for (let d = 1; d < 9; d++) {
    const [dx, dy] = DIRECTIONS[d]!;
    const nx = wrapX(x + dx);
    const ny = y + dy;
    if (!isValid(nx, ny)) continue;
    if (player !== 0) state.map.explored[cellIndex(nx, ny)]! |= 1 << player;
    const nImp = imp(nx, ny);
    if (nImp & Improvement.City && cellOwner(state, nx, ny) !== player) {
      const cityId = cityAt(state, nx, ny);
      if (cityId !== -1 && player === state.humanPlayer) state.cities[cityId]!.visibleSize = state.cities[cityId]!.size;
      if (def.movementType === MovementType.Land) unit.visibleBy |= 1 << cellOwner(state, nx, ny);
    }
    const otherId = activeUnitAt(state, nx, ny);
    const otherPlayer = occupantPlayer(state, nx, ny);
    if (otherId !== -1 && otherPlayer !== player) {
      const other = state.players[otherPlayer]!.units[otherId]!;
      if (!hereIsCity) unit.visibleBy |= 1 << otherPlayer;
      // UnitStackUpdateSentryFlag: obcy obok budzi wartowników
      for (const i of unitsAt(state, otherPlayer, nx, ny)) state.players[otherPlayer]!.units[i]!.status &= ~UnitStatus.Sentry;
      const nWater = terrainAt(state.map, nx, ny) === Terrain.Water;
      const hereWater = terrainAt(state.map, x, y) === Terrain.Water;
      if (nWater || !hereWater) other.gotoX = other.gotoY = -1;
      if (!nWater || hereWater || def.movementType === MovementType.Air) unit.gotoX = unit.gotoY = -1;
      if (!(nImp & Improvement.City)) other.visibleBy |= 1 << player;
      if (def.movementType === MovementType.Land && !hereWater && !nWater && UNITS[other.type]!.movementType !== MovementType.Air) {
        updateDiplomacyStatus(state, player, otherPlayer, x, y);
      }
    }
  }

  for (let d = 9; d < 25; d++) {
    const [dx, dy] = DIRECTIONS[d]!;
    const nx = wrapX(x + dx);
    const ny = y + dy;
    if (!isValid(nx, ny)) continue;
    const otherId = activeUnitAt(state, nx, ny);
    const otherPlayer = occupantPlayer(state, nx, ny);
    const nImp = imp(nx, ny);
    if (seesFar(nx, ny)) {
      if (player !== 0) state.map.explored[cellIndex(nx, ny)]! |= 1 << player;
      if (otherId !== -1 && otherPlayer !== player) {
        const other = state.players[otherPlayer]!.units[otherId]!;
        if (other.type !== 22 && !(nImp & Improvement.City)) other.visibleBy |= 1 << player;
      }
    }
    if (otherId !== -1 && otherPlayer !== player && unit.type !== 22) {
      const other = state.players[otherPlayer]!.units[otherId]!;
      const otherDef = UNITS[other.type]!;
      if ((otherDef.sightRange & 2) !== 0 && (otherDef.movementType !== MovementType.Water || terrainAt(state.map, x, y) === Terrain.Water)) {
        other.status &= ~UnitStatus.Sentry;
        other.gotoX = other.gotoY = -1;
        if (!hereIsCity) unit.visibleBy |= 1 << otherPlayer;
      } else if (otherPlayer === state.humanPlayer && nImp & Improvement.City && state.map.explored[cellIndex(x, y)]! & (1 << state.humanPlayer)) {
        unit.visibleBy |= 1 << otherPlayer;
      }
    }
    if (nImp & Improvement.City && cellOwner(state, nx, ny) === state.humanPlayer && state.map.explored[cellIndex(x, y)]! & (1 << state.humanPlayer)) {
      unit.visibleBy |= 1 << state.humanPlayer;
    }
  }
}

/**
 * IsUnitOrCityNear: czy obok pola (tego samego rodzaju: ląd/woda) stoi obca jednostka.
 * Dla człowieka ujawnia przy okazji te jednostki i miasta. Używane przez strefę kontroli.
 */
export function isEnemyUnitAdjacent(state: GameState, player: number, x: number, y: number): boolean {
  if (state.map.improvements[cellIndex(x, y)]! & Improvement.City) return false;
  const water = terrainAt(state.map, x, y) === Terrain.Water;
  for (let d = 1; d < 9; d++) {
    const [dx, dy] = DIRECTIONS[d]!;
    const nx = wrapX(x + dx);
    const ny = y + dy;
    if (!isValid(nx, ny) || (terrainAt(state.map, nx, ny) === Terrain.Water) !== water) continue;
    const other = occupantPlayer(state, nx, ny);
    if (other === -1 || other === player) continue;
    if (player === state.humanPlayer) {
      const id = activeUnitAt(state, nx, ny);
      if (id !== -1) state.players[other]!.units[id]!.visibleBy |= 1 << player;
      state.map.explored[cellIndex(nx, ny)]! |= 1 << player;
      const cityId = cityAt(state, nx, ny);
      if (cityId !== -1) {
        state.cities[cityId]!.visibleSize = state.cities[cityId]!.size;
        exploreCell(state, player, nx, ny);
      }
    }
    return true;
  }
  return false;
}

/** Ile jednostek danego gracza stoi na polu (GetStackUnitValueSum dla liczby jednostek). */
export function stackCount(state: GameState, player: number, x: number, y: number): number {
  return unitsAt(state, player, x, y).length;
}

/** Wolne miejsca na statkach gracza na polu (GetWaterTransportCapabilityCount). */
export function transportSpace(state: GameState, player: number, x: number, y: number): number {
  let space = 0;
  for (const i of unitsAt(state, player, x, y)) {
    const def = UNITS[state.players[player]!.units[i]!.type]!;
    if (def.movementType === MovementType.Land) space--;
    if (def.role === UnitRole.SeaTransport) space += def.transportCapacity;
  }
  return space;
}
