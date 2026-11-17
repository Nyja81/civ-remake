/**
 * Barbarzyńcy: desanty z morza i powstania w pobliżu bogatych miast człowieka.
 * Źródło: GameEngine.GenerateBarbarianUprising z OpenCivOne (MIT).
 */
import { Tech } from '../data/techs';
import { Terrain } from '../world/generate';
import { cityName, cityTreasury, groupSizeAt } from './cities';
import { cellIndex, distance, terrainAt, wrapX } from './map';
import { UnitStatus, type GameState } from './types';
import { createUnit, isEnemyUnitAdjacent, nearestCity, occupantPlayer } from './units';

const discovered = (state: GameState, tech: number) => (state.techFirstDiscoveredBy[tech]! & 7) !== 0;

export function barbarianUprising(state: GameState): void {
  if ((5 - state.difficulty) * 30 > state.turn) return;
  if (((state.turn + 1) & 7) === 0 && !discovered(state, Tech.Automobile)) {
    let x: number;
    let y: number;
    let guard = 0;
    do {
      x = state.rng.next(80);
      y = state.rng.next(44) + 3;
    } while ((terrainAt(state.map, x, y) !== Terrain.Water || occupantPlayer(state, x, y) !== -1 || groupSizeAt(state, x, y) < 16) && ++guard < 10000);
    const count = Math.min(3, Math.max(1, Math.trunc(state.turn / 150) + 1));
    createUnit(state, 0, count < 3 ? 17 : 18, x, y);
    for (let i = 0; i <= count; i++) {
      let type = discovered(state, Tech.Explosives) ? 7 : 3;
      if (i === count) type = 26;
      const id = createUnit(state, 0, type, x, y);
      if (id !== -1) state.players[0]!.units[id]!.status |= UnitStatus.Sentry;
    }
  }
  let cityId = state.rng.next(128);
  const city = state.cities[cityId]!;
  if (city.status === -1 || city.owner !== state.humanPlayer || state.rng.next(100) >= cityTreasury(state, cityId)) return;
  let x = 0;
  let y = 0;
  let tries = 0;
  for (; tries < 99; tries++) {
    const c = state.cities[cityId]!;
    x = wrapX(c.x + state.rng.next(13) - 6);
    y = c.y + state.rng.next(13) - 6;
    cityId = nearestCity(state, x, y);
    const n = state.cities[cityId]!;
    if (y < 0 || y >= 50) continue;
    if (distance(x, y, n.x, n.y) >= 6 && !isEnemyUnitAdjacent(state, 0, x, y) && terrainAt(state.map, x, y) !== Terrain.Water &&
      occupantPlayer(state, x, y) === -1 && state.map.group[cellIndex(x, y)] === state.map.group[cellIndex(n.x, n.y)]) break;
  }
  if (tries >= 99) return;
  const target = state.cities[cityId]!;
  if (target.owner === state.humanPlayer && state.map.explored[cellIndex(x, y)]! & (1 << state.humanPlayer)) {
    const kind = discovered(state, 35) ? 'Guerrilla uprising' : discovered(state, 68) ? 'Native unrest' : 'Barbarian uprising';
    state.events.push({ kind: 'message', style: 'travelers', x, y, text: `Travellers report:\n${kind}\nnear ${cityName(state, cityId)}!\n` });
  }
  const count = Math.min(99, Math.max(2, state.rng.next(target.size >> 1)));
  for (let i = 0; i <= count; i++) {
    let type = discovered(state, Tech.Industrialization) ? (i & 4 ? 9 : 4) : i & 4 ? 10 : 6;
    if (i === count) type = 26;
    const id = createUnit(state, 0, type, x, y);
    if (id !== -1) state.players[0]!.units[id]!.visibleBy |= state.map.explored[cellIndex(x, y)]!;
  }
}
