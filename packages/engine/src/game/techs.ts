/**
 * Technologie. Źródło: GameEngine.PlayerHasTechnology, ResearchFinished, SelectNextResearchField
 * i GradeTechnology z OpenCivOne (MIT).
 */
import { BUILDINGS } from '../data/buildings';
import { NATIONS } from '../data/nations';
import { Tech, TECHS } from '../data/techs';
import { UNITS } from '../data/units';
import { BuildingId } from './buildings';
import { Diplomacy, type GameState } from './types';
import { playerHasWonder } from './cities';

/** Numer „technologii przyszłości” (FutureTechnology5) — odkrywana wielokrotnie, bez znacznika. */
export const FUTURE_TECH = 71;
export const TECH_COUNT = TECHS.length;

export function playerHasTech(state: GameState, player: number, tech: number): boolean {
  if (tech === Tech.None) return true;
  if (player === 0 || tech === Tech.Never || tech < 0) return false;
  return state.players[player]!.techs[tech] === true;
}

/** Czy gracz może zacząć badać technologię (nie ma jej, ma obie wymagane). */
export function canResearch(state: GameState, player: number, tech: number): boolean {
  const def = TECHS[tech]!;
  return !playerHasTech(state, player, tech) && playerHasTech(state, player, def.prereq1) && playerHasTech(state, player, def.prereq2);
}

// Współczynniki wyboru technologii przez komputer (GradeTechnology).
const GRADE_1 = [5, 4, 4, 4, 3, 6, 4, 6, 6, 6, 4, 3, 4, 3, 3, 3, 3, 6, 5, 3, 4, 3, 3, 4, 4, 5, 4, 8, 3, 3, 3, 4, 5, 4, 8, 5, 5, 6, 4, 5, 4, 6, 6, 2, 5, 4, 6, 4, 6, 4, 3, 3, 4, 4, 3, 4, 5, 2, 8, 2, 4, 2, 5, 5, 6, 4, 3, 0, 0, 0, 0, 0];
const GRADE_2 = [0, 1, 1, 0, 2, 1, 0, -1, -1, -1, 0, 0, 0, 1, -2, 0, 1, -1, -2, 0, 0, 0, 1, -1, 1, 0, 0, -2, 1, 2, 2, -1, -1, -2, -2, -1, -1, -1, -1, -1, 1, 0, 1, 0, 1, 0, -2, 0, -2, 0, 0, 1, -1, 1, 1, 0, -1, 1, -1, 2, 1, 1, -2, -1, -1, -1, 0, 0, 0, 0, 0, 0];

export function gradeTech(state: GameState, player: number, tech: number): number {
  return NATIONS[state.players[player]!.nation]!.ideology * GRADE_2[tech]! + GRADE_1[tech]!;
}

/**
 * ResearchFinished: gracz `player` zdobywa technologię `tech` od `source`
 * (0 lub ten sam gracz = własne badania, -2 = Wielka Biblioteka, inny numer = od innej cywilizacji).
 * Okna (encyklopedia, porady) i ewentualne spotkanie z władcą zgłasza jako zdarzenia.
 */
export function researchFinished(state: GameState, player: number, source: number, tech: number): void {
  if (playerHasTech(state, player, tech)) return;
  const p = state.players[player]!;
  if (tech !== FUTURE_TECH) {
    p.techs[tech] = true;
    // TechnologyAcquiredFrom[tech] = playerID2 (encyklopedia: „(Discovered)”, „(from Great Library)”, „(Taken from …)”)
    (p.techSource ??= new Array<number>(72).fill(-1))[tech] = source;
  } else p.futureTechs++;
  if (state.turn === 0) return;
  p.techCount++;
  const name = tech === FUTURE_TECH ? 'Future Technology' : TECHS[tech]!.name;
  const humanSees = player === state.humanPlayer || (state.players[state.humanPlayer]!.diplomacy[player]! & Diplomacy.Embassy) !== 0;
  if (humanSees) {
    let text = `${p.nationPlural}${player === source || source === 0 ? ' develop' : ' acquire'}\n${name}`;
    if (player !== source && source !== 0) text += ` from\nthe ${source === -2 ? 'Great Library' : state.players[source]!.nationPlural}`;
    text += '!\n ';
    if (player !== state.humanPlayer) {
      for (const b of BUILDINGS) if (b.requiredTech === tech) text += `${b.name}\n `;
      for (const u of UNITS) if (u.requiredTech === tech) text += `${u.name}\n `;
    }
    if (player !== state.humanPlayer || source === -2) {
      state.events.push({ kind: 'message', style: player !== state.humanPlayer ? 'spies' : 'science', text });
    }
  }
  if (player === state.humanPlayer) {
    state.events.push({ kind: 'techDiscovered', player, tech });
    if (tech === Tech.Monarchy) state.events.push({ kind: 'advice', key: '*MONARCHY' });
  } else if (!humanSees && (state.techFirstDiscoveredBy[tech]! & 7) === 0 && playerHasTech(state, player, Tech.Navigation) &&
    !playerHasTech(state, state.humanPlayer, tech) && state.rng.next(3) === 0) {
    // oryginał: wizyta posła z propozycją wymiany (MeetWithKing, *GAPE) — etap 7
    state.events.push({ kind: 'envoy', player, tech });
  }
  if (tech === Tech.Gunpowder || tech === Tech.Combustion) {
    for (const c of state.cities) if (c.status !== -1 && c.owner === player) c.buildings &= ~(1 << (BuildingId.Barracks - 1));
    if (player === state.humanPlayer) {
      state.events.push({ kind: 'message', style: 'defense', text: `Development of ${name}\nmakes existing Barracks\nobsolete.\n` });
    }
  }
  if ((state.techFirstDiscoveredBy[tech]! & 7) === 0) {
    state.techFirstDiscoveredBy[tech] = player;
    state.events.push({ kind: 'firstDiscovery', player, tech });
  }
  // Wielka Biblioteka (warunek przepisany dosłownie ze wzorca — do sprawdzenia w oryginale)
  const libraryCity = state.wonderCity[5]!;
  if (libraryCity !== -1 && libraryCity < 128) {
    const owner = state.cities[libraryCity]!.owner;
    if (!playerHasTech(state, owner, tech) && !playerHasWonder(state, owner, 5)) {
      let count = 0;
      for (let i = 1; i < 8; i++) if (playerHasTech(state, i, tech)) count++;
      if (count >= 2) researchFinished(state, owner, -2, tech);
    }
  }
}

/**
 * SelectNextResearchField dla komputera (i dla człowieka w turze 0): wybiera technologię wg oceny ideologii
 * i — tak jak w oryginale — od razu ją przyznaje. Dla człowieka po turze 0 interfejs pokazuje wybór
 * (zdarzenie „chooseResearch”).
 */
export function selectNextResearch(state: GameState, player: number, source: number): void {
  if (player === 0) return;
  let best = -1;
  let choice = -1;
  for (let i = 0; i < TECH_COUNT; i++) {
    if (!canResearch(state, player, i)) continue;
    const score = state.rng.next(gradeTech(state, player, i) * 4);
    if (score > best && (i !== state.players[state.humanPlayer]!.researching || player !== state.humanPlayer)) {
      best = score;
      choice = i;
    }
  }
  if (player !== state.humanPlayer || state.turn === 0) {
    if (state.turn === 0 || state.difficulty !== 0 || playerHasTech(state, state.humanPlayer, choice) || state.rng.next(2) === 0) {
      if (best !== -1) researchFinished(state, player, source, choice);
    }
    return;
  }
  state.events.push({ kind: 'chooseResearch', player, suggested: choice });
}
