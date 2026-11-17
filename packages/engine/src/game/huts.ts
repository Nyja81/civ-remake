/**
 * Chaty plemion. Źródło: UnitManagement.FoundMinorTribeHut i funkcje TribeHutFound* z OpenCivOne (MIT).
 */
import { MovementType } from '../data/enums';
import { TERRAIN } from '../data/terrain';
import { UNITS } from '../data/units';
import { Terrain } from '../world/generate';
import { foundCity } from './cities';
import { DIRECTIONS, cellIndex, distance, terrainAt } from './map';
import { canResearch, researchFinished, TECH_COUNT } from './techs';
import { Improvement, type GameState } from './types';
import { createUnit, nearestCity, occupantPlayer } from './units';

const message = (state: GameState, player: number, text: string) => {
  if (player === state.humanPlayer) state.events.push({ kind: 'message', text, hut: true });
};

export function foundTribalHut(state: GameState, player: number, unitId: number): void {
  const unit = state.players[player]!.units[unitId]!;
  if (player === 0 || UNITS[unit.type]!.movementType === MovementType.Air) return;
  const near = nearestCity(state, unit.x, unit.y);
  const dist = near === -1 ? Number.MAX_SAFE_INTEGER : distance(unit.x, unit.y, state.cities[near]!.x, state.cities[near]!.y);
  switch (state.rng.next(4)) {
    case 0:
      if (dist > 3) {
        const owner = state.map.landOwner[cellIndex(unit.x, unit.y)]! & 7;
        if (owner === 0 && dist < 6) advancedTribe(state, player, unitId);
        else metalDeposits(state, player);
      } else mercenaries(state, player, unitId);
      break;
    case 1:
      if (state.turn === 0 || state.year > 1000) metalDeposits(state, player);
      else ancientWisdom(state, player);
      break;
    case 2:
      metalDeposits(state, player);
      break;
    case 3:
      if (dist < 4 || state.players[player]!.cityCount === 0) mercenaries(state, player, unitId);
      else barbarians(state, player, unitId);
      break;
  }
}

function metalDeposits(state: GameState, player: number): void {
  message(state, player, 'You have discovered\nvaluable metal deposits\nworth 50 coins\n');
  state.players[player]!.gold += 50;
}

function advancedTribe(state: GameState, player: number, unitId: number): void {
  message(state, player, 'You have discovered\nan advanced tribe.\n');
  const u = state.players[player]!.units[unitId]!;
  foundCity(state, player, u.x, u.y, 1);
}

function mercenaries(state: GameState, player: number, unitId: number): void {
  message(state, player, 'You have discovered\na friendly tribe of\nskilled mercenaries.\n');
  const u = state.players[player]!.units[unitId]!;
  createUnit(state, player, state.rng.next(2) !== 0 ? 3 : 6, u.x, u.y);
}

function ancientWisdom(state: GameState, player: number): void {
  message(state, player, 'You have discovered\nscrolls of ancient wisdom.\n');
  const options: number[] = [];
  for (let t = 0; t < TECH_COUNT; t++) if (canResearch(state, player, t)) options.push(t);
  if (options.length > 0) researchFinished(state, player, 0, options[state.rng.next(options.length)]!);
  else metalDeposits(state, player);
}

function barbarians(state: GameState, player: number, unitId: number): void {
  message(state, player, 'You have unleashed\na horde of barbarians!\n');
  const u = state.players[player]!.units[unitId]!;
  const step = Math.min(4, Math.max(1, 4 - state.players[player]!.cityCount));
  for (let d = 1; d < 9; d += step) {
    const [dx, dy] = DIRECTIONS[d]!;
    const nx = u.x + dx;
    const ny = u.y + dy;
    if (occupantPlayer(state, nx, ny) !== -1 || state.map.improvements[cellIndex(nx, ny)]! & Improvement.City) continue;
    const t = terrainAt(state.map, nx, ny);
    if (t === Terrain.Water || t < 0) continue;
    const id = createUnit(state, 0, TERRAIN[t]!.movementCost < 3 ? 6 : 3, nx, ny);
    if (id !== -1) state.players[0]!.units[id]!.visibleBy |= 1 << player;
  }
}
