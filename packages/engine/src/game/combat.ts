/**
 * Walka. Źródło: AttackActions.F0_29f3_000e_AttackUnit, ConfirmAttackAction
 * oraz UnitManagement.GetBestDefenseUnitInStack z OpenCivOne (MIT).
 * Pominięte na razie: atak jądrowy (etap 7), animacje i dźwięki (interfejs dostaje zdarzenie „combat”).
 */
import { MovementType } from '../data/enums';
import { TERRAIN } from '../data/terrain';
import { UNITS } from '../data/units';
import { Terrain } from '../world/generate';
import { cellIndex, terrainAt } from './map';
import { Diplomacy, Government, Improvement, UnitStatus, type GameState } from './types';
import { cityAt, deleteUnit, unitsAt } from './units';
import { BuildingId, hasBuilding } from './buildings';

/** Najlepszy obrońca w stosie gracza na polu (GetBestDefenseUnitInStack). */
export function bestDefender(state: GameState, player: number, x: number, y: number): number {
  const ids = unitsAt(state, player, x, y);
  if (ids.length <= 1) return ids[0] ?? -1;
  let best = -1;
  let bestId = ids[0]!;
  for (const id of ids) {
    const u = state.players[player]!.units[id]!;
    const def = UNITS[u.type]!;
    const t = terrainAt(state.map, u.x, u.y);
    if (t === Terrain.Water && def.movementType !== MovementType.Water) continue;
    let strength = def.movementType === MovementType.Land
      ? def.defense * (u.status & UnitStatus.Fortified ? 3 : 2) * TERRAIN[t]!.defenseBonus * 8
      : def.defense * 16;
    if (u.status & UnitStatus.Veteran) strength += strength >> 1;
    if (strength > best) {
      best = strength;
      bestId = id;
    }
  }
  return bestId;
}

/**
 * ConfirmAttackAction: 0 = brak traktatu, 1 = traktat zerwany, -1 = akcja anulowana
 * (gracz nie potwierdził albo w republice/demokracji „Overruled by the Senate”).
 */
export function confirmBreakTreaty(state: GameState, target: number, confirmed: boolean): number {
  const human = state.players[state.humanPlayer]!;
  if (!(human.diplomacy[target]! & Diplomacy.Peace)) return 0;
  if (!confirmed) return -1;
  if (human.government === Government.Republic || human.government === Government.Democracy) {
    state.events.push({ kind: 'message', text: 'Overruled by\nthe Senate.\nAction canceled.\n', style: 'domestic' });
    return -1;
  }
  return 1;
}

export function clearPeace(state: GameState, a: number, b: number): void {
  state.players[a]!.diplomacy[b]! &= ~Diplomacy.Peace;
  state.players[b]!.diplomacy[a]! &= ~Diplomacy.Peace;
}

/** Siła ataku do oceny bez walki (wywołanie z flag = false): (atak × 8) / (obrona + 1). */
export function attackOdds(state: GameState, attacker: number, attackerId: number, defender: number, defenderId: number): number {
  const { attack, defense } = strengths(state, attacker, attackerId, defender, defenderId);
  return Math.trunc((attack * 8) / (defense + 1));
}

function strengths(state: GameState, p1: number, id1: number, p2: number, id2: number) {
  const u1 = state.players[p1]!.units[id1]!;
  const u2 = state.players[p2]!.units[id2]!;
  const d1 = UNITS[u1.type]!;
  const d2 = UNITS[u2.type]!;
  const t = terrainAt(state.map, u2.x, u2.y);
  const imp = state.map.improvements[cellIndex(u2.x, u2.y)]!;
  const bonus = TERRAIN[t]!.defenseBonus;
  let attack = d1.attack * 8;
  let defense = bonus * d2.defense * (imp & Improvement.Fortress ? 8 : u2.status & UnitStatus.Fortified ? 6 : 4);
  if (p1 === 0) attack = p2 === state.humanPlayer ? Math.trunc((attack * (state.difficulty + 1)) / 4) : attack >> 1;
  if (d2.movementType === MovementType.Air || d2.movementType === MovementType.Water) defense = d2.defense * 8;
  let city = -1;
  let barbarianCityAttack = false;
  if (imp & Improvement.City) {
    city = cityAt(state, u2.x, u2.y);
    if (city !== -1 && hasBuilding(state.cities[city]!, BuildingId.CityWalls) && d1.attack !== 12 && d2.movementType !== MovementType.Air) {
      defense = bonus * d2.defense * 12;
    }
    if (p1 === 0) {
      if (state.players[p2]!.cityCount === 1) attack = 0;
      if (city !== -1 && hasBuilding(state.cities[city]!, BuildingId.Palace)) attack = Math.trunc(attack / 2);
      barbarianCityAttack = true;
    }
  }
  if (u1.status & UnitStatus.Veteran) attack += Math.trunc(attack / 2);
  if (u2.status & UnitStatus.Veteran) defense += Math.trunc(defense / 2);
  if (u1.movesLeft < 3) attack = Math.trunc((u1.movesLeft * attack) / 3);
  return { attack, defense, city, barbarianCityAttack };
}

/**
 * Walka jednostki attackerId gracza p1 z jednostką defenderId gracza p2 (AttackUnit z flag = true).
 * Zwraca 1 — atakujący wygrał, 0 — przegrał, -1 — akcja anulowana (traktat pokojowy).
 */
export function attackUnit(state: GameState, p1: number, id1: number, p2: number, id2: number, confirmTreaty = false): number {
  const u1 = state.players[p1]!.units[id1]!;
  const u2 = state.players[p2]!.units[id2]!;
  const type1 = u1.type;
  let { attack, defense, city, barbarianCityAttack } = strengths(state, p1, id1, p2, id2);
  if (p1 !== 0) {
    if (state.difficulty <= 1 && p2 === state.humanPlayer) attack = Math.trunc(attack / 2);
    if (state.difficulty === 0 && p1 === state.humanPlayer) attack *= 2;
  }
  if (p1 === state.humanPlayer && confirmBreakTreaty(state, p2, confirmTreaty) === -1) {
    u1.gotoX = u1.gotoY = -1;
    return -1;
  }
  let won = state.rng.next(attack) > state.rng.next(defense);
  if (barbarianCityAttack && won && state.rng.next(attack) < state.rng.next(defense)) won = false;

  const players = state.players;
  players[p1]!.diplomacy[p2]! |= Diplomacy.EverFought;
  players[p2]!.diplomacy[p1]! |= Diplomacy.EverFought;
  if (p1 !== 0 && p2 !== 0) state.peaceTurns = 0;
  if ((p2 === state.humanPlayer && players[p2]!.diplomacy[p1]! & Diplomacy.Peace) || players[p1]!.diplomacy[p2]! & Diplomacy.WarDeclared) {
    state.events.push({ kind: 'message', style: 'defense', text: `Sneak attack by\n${players[p1]!.nationAdjective} forces!\n` });
    players[p1]!.diplomacy[p2]! &= ~Diplomacy.WarDeclared;
  }
  if (players[p2]!.diplomacy[p1]! & Diplomacy.Peace || players[p1]!.diplomacy[p2]! & Diplomacy.Peace) {
    if (p1 === state.humanPlayer || p2 === state.humanPlayer) {
      state.events.push({ kind: 'message', style: 'foreign', text: `${players[p2]!.nationPlural} cancel\npeace treaty\nwith ${players[p1]!.nationPlural}.\n` });
    }
    if (p1 === state.humanPlayer && players[p2]!.diplomacy[p1]! & Diplomacy.Peace) players[p2]!.diplomacy[p1]! |= Diplomacy.Vendetta;
    clearPeace(state, p1, p2);
  }
  if (p1 === state.humanPlayer) players[p2]!.diplomacy[p1]! &= ~Diplomacy.WarDeclared;

  state.events.push({ kind: 'combat', player: p1, attacker: p1, defender: p2, attackerType: type1, defenderType: u2.type,
    fromX: u1.x, fromY: u1.y, x: u2.x, y: u2.y, attackerWon: won });

  if (type1 === 25) {
    // Nuclear — etap 7 (NuclearAttack); na razie zwykła wygrana bez skutków ubocznych
    return 1;
  }

  if (won) {
    if (p2 === 0 && u2.type === 26) {
      players[p1]!.gold += 100;
      if (p1 === state.humanPlayer) state.events.push({ kind: 'advice', key: '*LEADER' });
    }
    const dx = u2.x;
    const dy = u2.y;
    if (city === -1) {
      if (!(state.map.improvements[cellIndex(dx, dy)]! & Improvement.Fortress)) {
        const stack = unitsAt(state, p2, dx, dy);
        players[p1]!.unitsDestroyed[p2]! += stack.length;
        for (const i of stack) deleteUnit(state, p2, i, true);
        if (stack.length > 1 && (p1 === state.humanPlayer || p2 === state.humanPlayer)) {
          state.events.push({ kind: 'message', text: `${stack.length} units destroyed.\n` });
        }
      } else {
        deleteUnit(state, p2, id2, true);
        players[p1]!.unitsDestroyed[p2]!++;
      }
    } else {
      // Pominięte: budzenie obrońców sąsiednich pól i reakcja komputera na zagrożone miasto (etap 6).
      deleteUnit(state, p2, id2, true);
      players[p1]!.unitsDestroyed[p2]!++;
    }
    if (state.rng.next(2) !== 0) u1.status |= UnitStatus.Veteran;
    return 1;
  }
  players[p2]!.unitsDestroyed[p1]!++;
  deleteUnit(state, p1, id1, true);
  if (state.rng.next(2) !== 0) u2.status |= UnitStatus.Veteran;
  return 0;
}
