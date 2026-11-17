/**
 * Broń jądrowa, katastrofy i globalne ocieplenie. Źródło: AttackActions.NuclearAttack,
 * AddEffectsOfNuclearAttackOrCatastrophe, GameEngine.CheckGlobalWarming i IcecapMeltEvent z OpenCivOne (MIT).
 */
import { Terrain } from '../world/generate';
import { BuildingId, hasBuilding } from './buildings';
import { cityName } from './cities';
import { addPollution } from './economy';
import { DIRECTIONS, cellIndex, isValid, terrainAt, wrapX } from './map';
import { Diplomacy, Improvement, type GameState } from './types';
import { activeUnitAt, cityAt, deleteUnit, occupantPlayer, unitsAt } from './units';

/** NuclearAttack: niszczy jednostki na polu celu i 8 sąsiednich (miasta z SDI chronione), potem skażenie. */
export function nuclearAttack(state: GameState, player: number, x: number, y: number): void {
  if (player !== state.humanPlayer) {
    state.events.push({ kind: 'message', style: 'defense', text: `${state.players[player]!.nationPlural} use\nnuclear weapons!\n` });
  }
  for (let d = 8; d >= 0; d--) {
    const [dx, dy] = DIRECTIONS[d]!;
    const nx = wrapX(x + dx);
    const ny = y + dy;
    if (!isValid(nx, ny)) continue;
    let unit = activeUnitAt(state, nx, ny);
    const owner = occupantPlayer(state, nx, ny);
    if (state.map.improvements[cellIndex(nx, ny)]! & Improvement.City) {
      const c = cityAt(state, nx, ny);
      if (c !== -1 && hasBuilding(state.cities[c]!, BuildingId.SdiDefense)) {
        state.events.push({ kind: 'message', text: `SDI protects ${cityName(state, c)}.\n` });
        unit = -1;
      }
    }
    if (unit !== -1) {
      const stack = unitsAt(state, owner, nx, ny);
      state.players[player]!.unitsDestroyed[owner]! += stack.length;
      for (const id of stack) deleteUnit(state, owner, id, true);
      if (player !== owner) state.players[owner]!.diplomacy[player]! |= Diplomacy.Vendetta | Diplomacy.TributeDemanded;
    }
  }
  nuclearEffects(state, x, y);
  state.events.push({ kind: 'nuclear', player, x, y });
}

/** Skutki wybuchu albo awarii elektrowni: miasta tracą połowę mieszkańców, ląd zostaje skażony (2/3 pól). */
export function nuclearEffects(state: GameState, x: number, y: number): void {
  for (let d = 0; d < 9; d++) {
    const [dx, dy] = DIRECTIONS[d]!;
    const nx = wrapX(x + dx);
    const ny = y + dy;
    if (!isValid(nx, ny)) continue;
    if (state.map.improvements[cellIndex(nx, ny)]! & Improvement.City) {
      const c = state.cities[cityAt(state, nx, ny)];
      if (c) c.size -= c.size >> 1;
    } else if (terrainAt(state.map, nx, ny) !== Terrain.Water && state.rng.next(3) !== 0) {
      addPollution(state, nx, ny);
    }
  }
}

/** CheckGlobalWarming (koniec tury). */
export function checkGlobalWarming(state: GameState): void {
  state.pollutionLevel = Math.min(99, Math.max(0,
    Math.sign(state.pollutedSquares * 2 - state.globalWarming * 4 - state.pollutionLevel) + state.pollutionLevel));
  if (state.pollutionLevel === 12 && state.pollutedSquares > 6) {
    state.events.push({ kind: 'news', text: 'Scientists alarmed by\nrising temperatures.\nGlobal Warming feared!\n' });
  }
  if (state.pollutionLevel > 16) {
    icecapMelt(state, state.globalWarming);
    state.globalWarming++;
    state.pollutionLevel = 0;
  }
}

/** IcecapMeltEvent: wybrzeża zamieniają się w bagna/dżungle, część lądu wysycha. */
function icecapMelt(state: GameState, count: number): void {
  state.events.push({ kind: 'news', text: 'Global temperature\nrises! Icecaps melt.\nSevere Drought.\n' });
  const map = state.map;
  for (let x = 0; x < 80; x++) {
    for (let y = 0; y < 50; y++) {
      const i = cellIndex(x, y);
      const t = map.terrain[i]!;
      if (t !== Terrain.Desert && t !== Terrain.Plains && t !== Terrain.Grassland && t !== Terrain.Forest) continue;
      let water = 0;
      for (let d = 1; d < 9; d++) {
        const [dx, dy] = DIRECTIONS[d]!;
        if (isValid(x + dx, y + dy) && terrainAt(map, x + dx, y + dy) === Terrain.Water) water++;
      }
      if (7 - count <= water) {
        map.explored[i]! |= 1;
        map.terrain[i] = t !== Terrain.Forest ? Terrain.Swamp : Terrain.Jungle;
        map.improvements[i]! &= ~(Improvement.Mine | Improvement.Irrigation);
      } else if (((x * 11 + y * 13) & 7) === count) {
        map.explored[i]! |= 1;
        map.terrain[i] = t === Terrain.Desert || t === Terrain.Plains ? Terrain.Desert : Terrain.Plains;
      }
    }
  }
}
