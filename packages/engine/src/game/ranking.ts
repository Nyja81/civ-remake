/**
 * Ranking cywilizacji i „cuda komputera”. Źródło: GameEngine.RankPlayers i GiveWonderToAI z OpenCivOne (MIT).
 */
import { BUILDINGS, WONDERS } from '../data/buildings';
import { Tech } from '../data/techs';
import { UNITS } from '../data/units';
import { cityName } from './cities';
import { selectNextResearch, playerHasTech } from './techs';
import { Diplomacy, type GameState } from './types';

/** RankPlayers: ranking 1 (najlepszy) … 7 wg złota, wielkości miast, technologii i wartości jednostek. */
export function rankPlayers(state: GameState): void {
  const scores = new Array<number>(8).fill(0);
  for (let i = 1; i < 8; i++) {
    const p = state.players[i]!;
    scores[i] = Math.trunc(p.gold / 32) + p.totalCitySize * 8 + p.techCount;
    UNITS.forEach((u, j) => { scores[i]! += u.cost * p.activeUnits[j]!; });
    if (!(state.activeCivs & (1 << i))) scores[i] = 0;
  }
  for (let i = 1; i < 8; i++) {
    let best = -1;
    let id = 0;
    for (let j = 1; j < 8; j++) if (best < scores[j]!) { best = scores[j]!; id = j; }
    state.players[id]!.ranking = 8 - i;
    scores[id] = -1;
  }
  const h = state.players[state.humanPlayer]!;
  state.humanLowest = h.ranking === 7 && h.cityCount > 4 && h.activeUnits[25] === 0 && state.turn > 200;
  if (state.humanLowest) {
    for (let i = 1; i < 8; i++) {
      if (i === state.humanPlayer || state.players[i]!.cityCount <= 1) continue;
      const d = state.players[i]!.diplomacy;
      if (!(d[state.humanPlayer]! & Diplomacy.Peace)) d[state.humanPlayer]! |= Diplomacy.Contact;
      else d[state.humanPlayer]! |= Diplomacy.PeaceTreaty;
    }
  }
}

/** GiveWonderToAI: co turę (difficulty + 1) losowań — komputer może „dostać” cud w dużym mieście. */
export function giveWonderToAI(state: GameState): void {
  const human = state.humanPlayer;
  for (let i = 0; i <= state.difficulty; i++) {
    let wonder = state.rng.next(21) + 1;
    // Wzorzec sprawdza tu technologię budynku o tym samym numerze (tak jest w dosłownym tłumaczeniu) — do weryfikacji.
    if (state.difficulty === 0 && !playerHasTech(state, human, BUILDINGS[wonder - 1]!.requiredTech)) continue;
    if (state.difficulty < 2) {
      for (const c of state.cities) if (c.status !== -1 && c.owner === human && c.production === -(wonder + 24)) wonder = 17;
    }
    const cityId = state.rng.next(128);
    const city = state.cities[cityId]!;
    if (city.status === -1) continue;
    const player = city.owner;
    const p = state.players[player]!;
    if (player === human || p.diplomacy[0]! & Diplomacy.Allied || (wonder === 17 && !playerHasTech(state, player, Tech.Rocketry))) continue;
    if (i === 0 && playerHasTech(state, player, Tech.Rocketry) && !playerHasTech(state, human, Tech.Rocketry) && state.wonderCity[17] === -1) wonder = 17;
    const def = WONDERS[wonder - 1]!;
    if ((wonder !== 17 || !playerHasTech(state, human, Tech.Rocketry) || militaryPower(state, player) <= militaryPower(state, human)) &&
      state.wonderCity[wonder] === -1 && city.size > Math.trunc(def.cost / 10) && playerHasTech(state, player, def.requiredTech)) {
      state.wonderCity[wonder] = cityId;
      city.shields = 0;
      p.gold -= Math.min(Math.max(Math.trunc(p.gold / 3), 0), 10 * def.cost - city.shields);
      state.events.push({ kind: 'message', style: 'travelers', wonder,
        text: `${cityName(state, cityId)} (${p.nationAdjective})\nbuilds ${def.name}.\n` });
      if (wonder === 14) {
        selectNextResearch(state, player, 0);
        selectNextResearch(state, player, 0);
      }
      break;
    }
  }
}

/** MilitaryPower: suma ataku i obrony jednostek (bez broni jądrowej), liczona w RecalculateStatsAndPolicies. */
export function militaryPower(state: GameState, player: number): number {
  let sum = 0;
  for (const u of state.players[player]!.units) if (u.type !== -1 && u.type !== 25) sum += UNITS[u.type]!.attack + UNITS[u.type]!.defense;
  return sum;
}
