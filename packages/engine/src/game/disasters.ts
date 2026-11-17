/**
 * Klęski w miastach (od tury 51, dwa losowania na turę dla miast wielkości ≥ 5).
 * Źródło: GameEngine.GenerateCityDisaster z OpenCivOne (MIT).
 */
import { BUILDINGS } from '../data/buildings';
import { Tech } from '../data/techs';
import { Terrain } from '../world/generate';
import { BuildingId, hasBuilding } from './buildings';
import { cityName } from './cities';
import { inciteCityRevolt } from './unitActions';
import { processCity } from './economy';
import { DIRECTIONS, cellIndex, distance, isValid, terrainAt } from './map';
import { playerHasTech } from './techs';
import type { GameState } from './types';

function message(state: GameState, cityId: number, title: string, text: string): void {
  const city = state.cities[cityId]!;
  if (city.owner === state.humanPlayer) state.events.push({ kind: 'message', city: cityId, text: `${title}\n${text}` });
  else if (state.map.explored[cellIndex(city.x, city.y)]! & (1 << state.humanPlayer)) {
    state.events.push({ kind: 'message', city: cityId, x: city.x, y: city.y, text: title });
  }
}

/** Losowy budynek miasta (bez pałacu) — numer bitu 1–23. */
function randomBuilding(state: GameState, buildings: number): number {
  let bit = 0;
  while (bit === 0 || !((buildings >>> bit) & 1)) bit = 1 + state.rng.next(23);
  return bit;
}

export function cityDisaster(state: GameState, cityId: number): void {
  const city = state.cities[cityId]!;
  const name = cityName(state, cityId);
  const has = (t: number) => playerHasTech(state, city.owner, t);
  const need = (b: number) => has(BUILDINGS[b - 1]!.requiredTech) && !hasBuilding(city, b);
  let terrainBits = 0;
  for (let d = 0; d < 9; d++) {
    const [dx, dy] = DIRECTIONS[d]!;
    const t = isValid(city.x + dx, city.y + dy) ? terrainAt(state.map, city.x + dx, city.y + dy) : -1;
    if (t >= 0) terrainBits |= 1 << t;
  }
  switch (state.rng.next(10)) {
    case 0:
      if (terrainBits & (1 << Terrain.Hills) && city.buildings & 0xfffe) {
        const bit = randomBuilding(state, city.buildings);
        city.buildings &= ~(1 << bit);
        message(state, cityId, `Earthquake in ${name}!`, `${BUILDINGS[bit]!.name} destroyed.\n`);
      }
      break;
    case 1:
      if (!has(Tech.Medicine) && need(BuildingId.Aqueduct)) {
        if (city.size !== 0) city.size -= city.size >> 2;
        message(state, cityId, `Plague in ${name}!`, 'Scores perish!\nCitizens demand AQUEDUCT.\n');
      }
      break;
    case 2:
      if (terrainBits & (1 << Terrain.River) && need(BuildingId.CityWalls)) {
        if (city.size > 1) city.size -= city.size >> 2;
        message(state, cityId, `Floods strike ${name}!`, 'Houses washed away.\nCitizens demand CITY WALLS.\n');
      }
      break;
    case 3:
      if (terrainBits & (1 << Terrain.Mountains) && need(BuildingId.Temple)) {
        if (city.size > 1) city.size -= Math.trunc(city.size / 3);
        message(state, cityId, `Volcano erupts near ${name}!`, 'Citizens flee in terror.\nCitizens demand TEMPLE.\n');
      }
      break;
    case 4:
      if (city.size !== 0 && need(BuildingId.Granary)) {
        city.food = 0;
        city.size -= Math.trunc(city.size / 3);
        message(state, cityId, `Famine strikes ${name}!`, 'Scores perish.\nCitizens demand GRANARY.\n');
      }
      break;
    case 5:
      if (city.buildings & 0xfffe && need(BuildingId.Aqueduct)) {
        const bit = randomBuilding(state, city.buildings);
        city.buildings &= ~(1 << bit);
        message(state, cityId, `Fire sweeps through ${name}!`, `${BUILDINGS[bit]!.name} destroyed.\nCitizens demand AQUEDUCT.\n`);
      }
      break;
    case 6:
      if (terrainBits & (1 << Terrain.Water) && !hasBuilding(city, BuildingId.Barracks)) {
        city.food = 0;
        city.shields = 0;
        message(state, cityId, `Pirates plunder ${name}!`, 'Production halted, Food Stolen.\nCitizens demand BARRACKS.\n');
      }
      break;
    default: {
      const r = processCity(state, cityId, 1);
      if (!r || r.happy >= r.unhappy) break;
      const title = [`Rioting in ${name}!`, `Corruption in ${name}!`, `Scandal in ${name}!`][state.rng.next(3)]!;
      let demand = 'lower taxes.\n';
      if (!hasBuilding(city, BuildingId.Temple)) demand = `${BUILDINGS[BuildingId.Temple - 1]!.name}\n`;
      else if (!hasBuilding(city, BuildingId.Courthouse)) demand = `${BUILDINGS[BuildingId.Courthouse - 1]!.name}\n`;
      else if (!hasBuilding(city, BuildingId.MarketPlace)) demand = `${BUILDINGS[BuildingId.MarketPlace - 1]!.name}\n`;
      else if (need(BuildingId.Cathedral)) demand = `${BUILDINGS[BuildingId.Cathedral - 1]!.name}\n`;
      if (city.owner === state.humanPlayer) state.events.push({ kind: 'message', city: cityId, text: `${title}\nCitizens demand ${demand}` });
      city.food = 0;
      city.shields = 0;
      if (hasBuilding(city, BuildingId.Palace) || state.players[city.owner]!.cityCount <= 3) break;
      let best = 4;
      let target = -1;
      state.cities.forEach((other, i) => {
        if (i === cityId || other.status === -1) return;
        const o = processCity(state, i, 1);
        if (!o) return;
        const score = Math.trunc(((o.happy - o.unhappy) * 32) / Math.max(1, distance(city.x, city.y, other.x, other.y)));
        if (score > best) {
          best = score;
          target = i;
        }
      });
      if (target !== -1 && state.cities[target]!.owner !== city.owner) {
        const t = state.cities[target]!;
        if (state.map.explored[cellIndex(t.x, t.y)]! & (1 << state.humanPlayer)) {
          state.events.push({ kind: 'message', text: `Residents of ${name} admire\nthe prosperity of ${cityName(state, target)}.\n` });
        }
        // DiplomatActions.F22_0000_0af5_InciteCityRevolt — miasto (z jednostkami wokół) przechodzi do sąsiada
        inciteCityRevolt(state, cityId, t.owner);
      }
    }
  }
}

/** Część GameTurn: po turze 50 dwa losowe miasta mogą doznać klęski. */
export function randomDisasters(state: GameState): void {
  if (state.turn <= 50) return;
  for (let i = 0; i < 2; i++) {
    const id = state.rng.next(128);
    const c = state.cities[id]!;
    if (c.status !== -1 && state.players[c.owner]!.cityCount > 1 && c.size >= 5) cityDisaster(state, id);
  }
}
