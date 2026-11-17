/**
 * Ruch jednostki o jedno pole. Źródło: PlayerTurn.MoveUnit z OpenCivOne (MIT) — reguły w tej samej kolejności.
 *
 * Silnik nie pokazuje okien: tam, gdzie oryginał pyta gracza („Attack at 2/3 strength?”, zerwanie traktatu),
 * funkcja zwraca { kind: 'confirm' } i należy ją wywołać ponownie z { confirm: true }.
 * Na razie zgłaszane jako zdarzenia i nieobsługiwane w całości: działania dyplomaty i karawany (etapy 3 i 7),
 * atak jądrowy (etap 7), polityki przeciwnika komputerowego (etap 6).
 */
import { MovementType } from '../data/enums';
import { TERRAIN } from '../data/terrain';
import { UNITS } from '../data/units';
import { Terrain } from '../world/generate';
import { attackUnit, bestDefender, clearPeace, confirmBreakTreaty } from './combat';
import { cityTakeover, deleteCity, playerHasWonder } from './cities';
import { WonderId, hasBuilding, BuildingId } from './buildings';
import { DIRECTIONS, cellIndex, distance, isValid, terrainAt, wrapX } from './map';
import { Diplomacy, Improvement, NO_UNIT, UnitStatus, type GameState, type Unit } from './types';
import {
  activeUnitAt, cellHasHut, cellOwner, cityAt, createUnit, deleteUnit, isEnemyUnitAdjacent, nearestCity,
  occupantPlayer, placeUnit, setCellOwner, stackCount, transportSpace, unitsAt, updateUnitVisibility,
} from './units';
import { foundTribalHut } from './huts';

export type MoveResult =
  | { kind: 'moved' }
  | { kind: 'blocked'; reason?: string }
  | { kind: 'confirm'; question: string }
  | { kind: 'attacked'; won: boolean }
  | { kind: 'action'; action: string };

export interface MoveOptions {
  /** Odpowiedź „tak” na pytanie zwrócone przez poprzednie wywołanie. */
  confirm?: boolean;
}

const blocked = (reason?: string): MoveResult => ({ kind: 'blocked', reason });
const clearGoto = (u: Unit) => { u.gotoX = u.gotoY = -1; };

/** Punkty ruchu na początku tury (×3), z bonusem Latarni i Magellana dla okrętów. */
export function fullMoves(state: GameState, player: number, unit: Unit): number {
  const def = UNITS[unit.type]!;
  let moves = def.moves * 3;
  if (def.movementType === MovementType.Water &&
    (playerHasWonder(state, player, WonderId.Lighthouse) || playerHasWonder(state, player, WonderId.Magellans))) moves += 3;
  return moves;
}

export function moveUnit(state: GameState, player: number, unitId: number, direction: number, options: MoveOptions = {}): MoveResult {
  const unit = state.players[player]!.units[unitId]!;
  if (unit.type === NO_UNIT) return blocked();
  const def = UNITS[unit.type]!;
  const human = player === state.humanPlayer;
  const [dx, dy] = DIRECTIONS[direction]!;
  if (!isValid(unit.x + dx, unit.y + dy)) return blocked();

  // Barbarzyńcy (poza dyplomatą) niszczą ulepszenia w pobliżu miast człowieka
  if (player === 0 && unit.type !== 26) {
    const here = state.map.visibleImprovements[cellIndex(unit.x, unit.y)]!;
    const near = nearestCity(state, unit.x, unit.y);
    if (!(here & Improvement.City) && here & (Improvement.Mine | Improvement.Irrigation) && unit.type !== 3 && unit.type !== 7 &&
      near !== -1 && state.cities[near]!.owner === state.humanPlayer) {
      const i = cellIndex(unit.x, unit.y);
      state.map.improvements[i]! &= ~(Improvement.Mine | Improvement.Irrigation);
      if (state.map.explored[i]! & (1 << state.humanPlayer)) state.map.visibleImprovements[i] = state.map.improvements[i]!;
      unit.movesLeft = 0;
      state.events.push({ kind: 'pillage', player, x: unit.x, y: unit.y });
      return blocked();
    }
  }

  const curTerrain = terrainAt(state.map, unit.x, unit.y);
  const nx = wrapX(unit.x + dx);
  const ny = unit.y + dy;
  const newTerrain = terrainAt(state.map, nx, ny);
  const newImp = state.map.visibleImprovements[cellIndex(nx, ny)]!;
  const otherId = activeUnitAt(state, nx, ny);
  const otherPlayer = occupantPlayer(state, nx, ny);

  if (def.movementType === MovementType.Land) {
    // Strefa kontroli
    if (otherId === -1 && isEnemyUnitAdjacent(state, player, unit.x, unit.y) && isEnemyUnitAdjacent(state, player, nx, ny) &&
      unit.type !== 26 && unit.type !== 27 && curTerrain !== Terrain.Water) {
      if (human) state.events.push({ kind: 'advice', key: '*ZOC', sound: 37 });
      clearGoto(unit);
      return blocked('zoc');
    }
    if (unit.type === 26 || unit.type === 27) {
      const cityId = cityAt(state, nx, ny);
      if (cityId !== -1) {
        const city = state.cities[cityId]!;
        if (curTerrain === Terrain.Water && city.owner !== player) return blocked();
        if (unit.type === 26 && city.owner !== player) {
          state.events.push({ kind: 'diplomatAction', player, unitId, city: cityId });
          return { kind: 'action', action: 'diplomat' };
        }
        if (unit.type === 27) {
          state.events.push({ kind: 'caravanArrived', player, unitId, city: cityId });
          return { kind: 'action', action: 'caravan' };
        }
      } else if (unit.type === 26 && otherId !== -1 && otherPlayer !== player) {
        state.events.push({ kind: 'diplomatVsUnit', player, unitId, target: otherPlayer, targetId: otherId });
        clearGoto(unit);
      }
    }
  }

  if (def.movementType === MovementType.Land && newTerrain === Terrain.Water) {
    // Wejście na statek
    if (otherPlayer !== player || otherId === -1 || transportSpace(state, player, nx, ny) <= 0) return blocked();
    unit.status |= UnitStatus.Sentry;
    unit.status &= ~(UnitStatus.Fortifying | UnitStatus.Fortified);
    unit.movesLeft = 3; // tak w oryginale
  } else if (otherId !== -1 && otherPlayer !== player) {
    return attack(state, player, unitId, nx, ny, otherPlayer, otherId, curTerrain, newImp, options);
  }

  if (def.movementType === MovementType.Water && newTerrain !== Terrain.Water && !(newImp & Improvement.City)) {
    clearGoto(unit);
    return blocked();
  }
  if (def.movementType !== MovementType.Land && newImp & Improvement.City && cellOwner(state, nx, ny) !== player) {
    if (unit.type !== 25) {
      state.events.push({ kind: 'advice', key: '*OCCUPY' });
      clearGoto(unit);
      return blocked();
    }
    deleteUnit(state, player, unitId);
    state.events.push({ kind: 'nuclearAttack', player, x: nx, y: ny });
    return { kind: 'action', action: 'nuclear' };
  }
  if (unit.movesLeft === 0) return blocked();

  if (def.movementType === MovementType.Land) {
    const here = state.map.visibleImprovements[cellIndex(unit.x, unit.y)]!;
    if (here & newImp & Improvement.Road && unit.movesLeft !== 0) {
      if (!(here & Improvement.Railroad) || !human || unit.gotoX !== -1) unit.movesLeft -= 1;
    } else {
      const cost = TERRAIN[newTerrain]!.movementCost * 3;
      if (unit.movesLeft !== 3 && state.rng.next(cost) > unit.movesLeft) {
        unit.movesLeft = 0;
        return blocked('terrain');
      }
      unit.movesLeft -= cost;
    }
  } else {
    unit.movesLeft -= 3;
  }
  if (unit.movesLeft < 0) unit.movesLeft = 0;

  if (!human) {
    if (unit.gotoNextDirection !== -1 && (unit.gotoNextDirection ^ 4) === direction && stackCount(state, player, unit.x, unit.y) <= 2) {
      clearGoto(unit);
      unit.gotoNextDirection = -1;
      unit.movesLeft = 0;
      return blocked();
    }
    unit.gotoNextDirection = direction;
  }
  if (otherId !== -1 && otherPlayer === player && !human && !(newImp & Improvement.City)) {
    if (def.movementType === MovementType.Land || (def.movementType === MovementType.Water && unit.specialMoves !== 0)) {
      if ((unit.movesLeft !== 0 ? 4 : 2) <= stackCount(state, player, nx, ny)) return blocked();
    }
  }

  // Ziemia należąca do innej cywilizacji (pola z ulepszeniami w jej granicach)
  const owner = state.map.landOwner[cellIndex(nx, ny)]!;
  if (owner !== 0 && owner < 8) {
    if (newTerrain !== Terrain.Water && curTerrain !== Terrain.Water && unit.type !== 26 && unit.type !== 27 &&
      newImp & (Improvement.City | Improvement.Irrigation | Improvement.Mine | Improvement.Road) && owner !== player) {
      if ((human || owner === state.humanPlayer) && def.movementType === MovementType.Land && occupantPlayer(state, nx, ny) !== player) {
        if (human) {
          clearGoto(unit);
          const peace = state.players[player]!.diplomacy[owner]! & Diplomacy.Peace;
          if (peace && !options.confirm) {
            return { kind: 'confirm', question: `We have signed a\npeace treaty with\nthe ${state.players[owner]!.nationPlural}!\n Cancel action.\n Break treaty.\n` };
          }
          if (confirmBreakTreaty(state, owner, true) === -1) return blocked();
          clearPeace(state, player, owner);
        } else if (state.players[owner]!.diplomacy[player]! & Diplomacy.Peace) {
          unit.movesLeft = 0;
          return blocked();
        }
      }
    }
    if (player !== owner && state.map.visibleImprovements[cellIndex(nx, ny)]! & 0xe) unit.visibleBy |= 1 << owner;
  }

  const cityOwner = cellOwner(state, nx, ny);
  if (player === 0 && newTerrain !== Terrain.Water) revealBarbarian(state, unit, unit.x, unit.y);
  if (newImp & Improvement.City && cityOwner !== player && state.map.explored[cellIndex(nx, ny)]! & (1 << state.humanPlayer)) {
    const humanDip = state.players[state.humanPlayer]!.diplomacy;
    if (humanDip[player]! & Diplomacy.Embassy || humanDip[cityOwner]! & Diplomacy.Embassy) unit.visibleBy |= 1 << state.humanPlayer;
  }
  if (newTerrain === Terrain.Water && state.map.visibleImprovements[cellIndex(nx, ny)]! & 2) unit.visibleBy |= 1 << cityOwner;
  const seenBefore = (unit.visibleBy & (1 << state.humanPlayer)) !== 0 || human;

  // Przesunięcie jednostki (i ładunku, jeśli to statek albo lotniskowiec)
  const ox = unit.x;
  const oy = unit.y;
  const cargo = def.transportCapacity !== 0 || unit.type === 23 ? unitsAt(state, player, ox, oy).filter((i) => i !== unitId) : [];
  placeUnit(state, player, unitId, nx, ny);
  unit.visibleBy = 0;
  if (!human && def.movementType !== MovementType.Water) {
    unit.status &= ~(UnitStatus.Sentry | UnitStatus.BuildRoad | UnitStatus.Fortifying | UnitStatus.Fortified | UnitStatus.BuildIrrigation | UnitStatus.BuildMine);
  }
  if (owner !== 0 && owner < 8 && owner !== player) state.map.landOwner[cellIndex(nx, ny)] = 0;
  if (unit.gotoX === nx && unit.gotoY === ny) {
    clearGoto(unit);
    unit.gotoNextDirection = -1;
    if (!human) unit.movesLeft = 0;
  }
  if (curTerrain === Terrain.Water && newTerrain !== Terrain.Water && def.movementType !== MovementType.Air) unit.movesLeft = 0;

  if (cargo.length > 0) {
    const carried = def.transportCapacity < 1 ? MovementType.Air : MovementType.Land;
    let loaded = 0;
    for (const i of cargo) {
      const c = state.players[player]!.units[i]!;
      if (c.type === NO_UNIT || UNITS[c.type]!.movementType !== carried) continue;
      if (c.status & UnitStatus.Sentry || curTerrain === Terrain.Water ||
        (!human && !(c.status & (UnitStatus.Fortifying | UnitStatus.Fortified)) && cargo.length > 0)) {
        placeUnit(state, player, i, nx, ny);
        c.visibleBy = 0;
        c.gotoNextDirection = -1;
        if (def.transportCapacity !== 0) c.status |= UnitStatus.Sentry;
        if (UNITS[c.type]!.turnsOutside !== 0) c.specialMoves = UNITS[c.type]!.turnsOutside - 1;
        loaded++;
      }
      if (def.transportCapacity <= loaded && unit.type !== 23 && player !== 0) break;
    }
  }

  if (newImp & Improvement.City && cityOwner !== player) {
    unit.visibleBy |= 1 << cityOwner;
    cityTakeover(state, player, cityAt(state, nx, ny), unitId);
    state.map.occupant[cellIndex(nx, ny)]! |= 8;
  }
  setCellOwner(state, nx, ny, player);
  updateUnitVisibility(state, nx, ny, player, unitId);
  if (cellHasHut(state, nx, ny)) {
    foundTribalHut(state, player, unitId);
    state.map.explored[cellIndex(nx, ny)]! |= 1;
  }
  if (newTerrain === Terrain.Water && def.movementType === MovementType.Land) wakeShipsInStack(state, player, nx, ny);
  if (player === 0 && newTerrain !== Terrain.Water) revealBarbarian(state, unit, nx, ny);

  state.events.push({ kind: 'unitMoved', player, unitId, fromX: ox, fromY: oy, x: nx, y: ny, direction,
    visible: seenBefore || (unit.visibleBy & (1 << state.humanPlayer)) !== 0 });

  if (newImp & Improvement.City && def.turnsOutside !== 0) {
    unit.status &= ~UnitStatus.BuildRoad;
    unit.movesLeft = 0;
    clearGoto(unit);
  }
  if (def.turnsOutside !== 0 && def.movementType === MovementType.Air &&
    unitsAt(state, player, nx, ny).some((i) => state.players[player]!.units[i]!.type === 23)) {
    unit.status &= ~UnitStatus.BuildRoad;
    unit.movesLeft = 0;
    unit.specialMoves = def.turnsOutside;
  }
  return { kind: 'moved' };
}

/** Barbarzyńcy na ziemi człowieka stają się dla niego widoczni. */
function revealBarbarian(state: GameState, unit: Unit, x: number, y: number): void {
  const seen = state.map.explored[cellIndex(x, y)]!;
  const near = nearestCity(state, x, y);
  if (seen & (1 << state.humanPlayer) && !(unit.visibleBy & (1 << state.humanPlayer)) && near !== -1 &&
    state.cities[near]!.owner === state.humanPlayer) unit.visibleBy |= seen;
}

/** UpdateWaterUnitStatusInStack: wejście jednostki lądowej na statek budzi statki stosu. */
function wakeShipsInStack(state: GameState, player: number, x: number, y: number): void {
  for (const i of unitsAt(state, player, x, y)) {
    const u = state.players[player]!.units[i]!;
    if (UNITS[u.type]!.movementType !== MovementType.Water) continue;
    if (u.status & (UnitStatus.BuildRoad | UnitStatus.BuildIrrigation | UnitStatus.BuildMine)) u.specialMoves = 0;
    if (u.status & (UnitStatus.Sentry | UnitStatus.BuildRoad | UnitStatus.Fortified | UnitStatus.BuildIrrigation | UnitStatus.BuildMine)) {
      u.movesLeft = UNITS[u.type]!.moves * 3;
    }
    u.status &= ~(UnitStatus.Sentry | UnitStatus.BuildRoad | UnitStatus.Fortifying | UnitStatus.Fortified | UnitStatus.BuildIrrigation | UnitStatus.BuildMine);
    u.gotoX = u.gotoY = -1;
  }
}

function attack(state: GameState, player: number, unitId: number, nx: number, ny: number, target: number, targetId: number,
  curTerrain: number, newImp: number, options: MoveOptions): MoveResult {
  const unit = state.players[player]!.units[unitId]!;
  const def = UNITS[unit.type]!;
  const human = player === state.humanPlayer;
  if (curTerrain === Terrain.Water && def.movementType === MovementType.Land) {
    if (human) state.events.push({ kind: 'advice', key: '*AMPHIB' });
    clearGoto(unit);
    return blocked('amphibious');
  }
  if (unit.type === 26 || (terrainAt(state.map, nx, ny) !== Terrain.Water && unit.type === 22) || (!human && def.attack === 0)) return blocked();
  if (unit.type !== 14 && UNITS[state.players[target]!.units[targetId]!.type]!.movementType === MovementType.Air && !(newImp & Improvement.City)) {
    state.events.push({ kind: 'advice', key: '*FIGHTER' });
    clearGoto(unit);
    return blocked('fighter');
  }
  if (unit.movesLeft < 3) {
    if (human) {
      if (!options.confirm) return { kind: 'confirm', question: `Attack at\n${unit.movesLeft}/3 strength?\n Cancel\n Attack\n` };
    } else if (unit.movesLeft < 2) return blocked();
  }
  if (human && !options.confirm && state.players[state.humanPlayer]!.diplomacy[target]! & Diplomacy.Peace) {
    return { kind: 'confirm', question: `We have signed a\npeace treaty with\nthe ${state.players[target]!.nationPlural}!\n Cancel action.\n Break treaty.\n` };
  }
  const defender = bestDefender(state, target, nx, ny);
  const result = attackUnit(state, player, unitId, target, defender, options.confirm === true);
  clearGoto(unit);
  if (result === -1) return blocked('treaty');
  if (unit.type === NO_UNIT) return { kind: 'attacked', won: false };
  unit.movesLeft -= 3;
  if (unit.movesLeft < 0 || unit.type === 15) unit.movesLeft = 0;
  if (newImp & Improvement.City) {
    const cityId = cityAt(state, nx, ny);
    if (cityId !== -1) {
      const city = state.cities[cityId]!;
      if (city.owner !== state.humanPlayer) city.status |= 0x10; // AutoProduction — oryginał przełącza produkcję komputera
      if (!hasBuilding(city, BuildingId.CityWalls) && curTerrain !== Terrain.Water && (state.difficulty !== 0 || target !== state.humanPlayer)) {
        city.size--;
      }
      if (city.size <= 0) {
        deleteCity(state, cityId);
        state.events.push({ kind: 'cityDestroyed', player, x: nx, y: ny });
      }
      if (player === state.humanPlayer || target === state.humanPlayer) city.visibleSize = city.size;
    }
  }
  return { kind: 'attacked', won: result === 1 };
}

export { createUnit, distance, unitsAt };
