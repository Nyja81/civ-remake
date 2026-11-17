/**
 * Gracze i nowa gra. Źródło: StartGameMenu.InitNewGameData i InitPlayerData z OpenCivOne (MIT).
 * Okna wyboru (poziom, liczba cywilizacji, plemię, imię) pokazuje interfejs — tu przychodzą gotowe wybory.
 */
import { emptySpaceship } from './spaceship';
import { MAX_CITIES, MAX_PLAYERS, MAX_UNITS_PER_PLAYER } from '../data/enums';
import { CITY_NAMES } from '../data/cityNames';
import { NATIONS } from '../data/nations';
import { UNITS } from '../data/units';
import { generateWorld, Terrain, DEFAULT_WORLD, type World, type WorldOptions } from '../world/generate';
import { mscRandom, type RandomSource } from '../world/random';
import { emptyCity } from './cities';
import { cellIndex, createGameMap, distance, terrainAt } from './map';
import { researchFinished, TECH_COUNT } from './techs';
import { Government, NO_UNIT, type GameState, type Player } from './types';
import { cellHasHut, createUnit, deleteUnit, emptyUnit, nearestCity, setCellOwner } from './units';

/** Pozycje startowe na mapie Ziemi wg nacji (Array_35da w oryginale). */
export const EARTH_START: readonly (readonly [number, number])[] = [
  [0, 0], [36, 19], [45, 22], [38, 15], [41, 24], [12, 18], [39, 18], [57, 24],
  [0, 0], [44, 12], [42, 42], [33, 16], [5, 23], [66, 19], [31, 14], [49, 19],
];

export interface NewGameOptions {
  /** Ziarno gry: mapa, zasoby, chaty i wszystkie losowania. */
  seed: number;
  /** Mapa Ziemi zamiast losowego świata (wtedy potrzebne `earthWorld`). */
  earth?: boolean;
  earthWorld?: World;
  world?: WorldOptions;
  /** 0 Chieftain … 4 Emperor. */
  difficulty: number;
  /** Liczba cywilizacji łącznie z graczem: 3–7. */
  civilizations: number;
  /** Nacja gracza: 1–7 albo 9–15 (nacja k i k+8 zajmują to samo miejsce gracza k). */
  nation: number;
  leaderName?: string;
  /** Własna nazwa plemienia (gdy gracz wybrał „własne plemię”); liczba mnoga i przymiotnik. */
  tribe?: { plural: string; adjective: string };
  /** Własne źródło losowości (testy); domyślnie rand() z Microsoft C. */
  rng?: RandomSource;
}

export function emptyPlayer(): Player {
  return {
    nation: -1, leader: '', nationPlural: '', nationAdjective: '', gold: 0, government: Government.Anarchy,
    taxRate: 0, scienceRate: 0, researchProgress: 0, score: 0, researching: -1, techs: new Array<boolean>(72).fill(false),
    techCount: 0, futureTechs: 0, spaceshipEta: -1, spaceshipSuccess: 0, spaceshipPopulation: 0, spaceshipLaunchYear: -1, spaceship: emptySpaceship(), cityCount: 0, totalCitySize: 0, settlerCount: 0, ranking: 0, contactCountdown: 0,
    xStart: 0, waiting: -1, diplomacy: new Array<number>(8).fill(0),
    units: Array.from({ length: MAX_UNITS_PER_PLAYER }, emptyUnit),
    continents: Array.from({ length: 16 }, () => ({ strategy: 0, cityCount: 0, attack: 0, defense: 0 })),
    unitPolicies: Array.from({ length: 32 }, () => ({ x: 0, y: 0, role: -1, policy: 0 })),
    continentPolicies: Array.from({ length: 16 }, () => ({ x: 0, y: 0, role: -1, policy: 0 })),
    militaryPower: 0, unitCount: 0,
    activeUnits: new Array<number>(UNITS.length).fill(0), lostUnits: new Array<number>(UNITS.length).fill(0),
    unitsDestroyed: new Array<number>(8).fill(0), unitsInProduction: new Array<number>(UNITS.length).fill(0),
  };
}

const pluralOf = (nation: number) => NATIONS[nation]!.plural || `${NATIONS[nation]!.adjective}s`;

/** Tworzy nową grę: świat, cywilizacje i pierwszych osadników. */
export function newGame(options: NewGameOptions): GameState {
  const rng = options.rng ?? mscRandom(options.seed);
  const world = options.earth ? options.earthWorld : generateWorld(rng, options.world ?? DEFAULT_WORLD);
  if (!world) throw new Error('Mapa Ziemi wymaga danych (earthWorld)');
  const map = createGameMap(world, rng, options.seed);
  const opponents = Math.min(6, Math.max(2, options.civilizations - 1));
  const human = options.nation & 7;
  if (human === 0 || human > opponents + 1) throw new Error(`Nacja ${options.nation} niedostępna przy ${options.civilizations} cywilizacjach`);

  const state: GameState = {
    turn: 0, year: -4000, currentPlayer: 0, difficulty: options.difficulty, mapSeed: options.seed & 0xffff, earth: options.earth === true,
    humanPlayer: human, activeCivs: 0xff >> (6 - opponents), aiOpponents: opponents, playerIdentity: 0,
    nextHistoryTurn: 80, peaceTurns: 0,
    settings: { instantAdvice: options.difficulty === 0, autoSave: true, endOfTurn: false, animations: true, sound: true,
      enemyMoves: true, civilopediaText: true, palace: true },
    map, players: Array.from({ length: MAX_PLAYERS }, emptyPlayer),
    cities: Array.from({ length: MAX_CITIES }, emptyCity),
    wonderCity: new Array<number>(22).fill(-1), cityNames: [...CITY_NAMES], cityNameTaken: new Array<boolean>(256).fill(false),
    techFirstDiscoveredBy: new Array<number>(72).fill(0), techCatchUp: 0, globalWarming: 0, pollutionLevel: 0, pollutedSquares: 0, gameOver: 0, spaceshipFlags: 0, aiSpaceshipSuccess: 0, humanLowest: false, aiFlags: 0, aiMakeContact: false,
    rng, events: [],
  };

  const hp = state.players[human]!;
  hp.nation = options.nation;
  hp.researching = -1;
  state.nextHistoryTurn += rng.next(50);
  hp.leader = options.leaderName ?? NATIONS[options.nation]!.leader;
  if (options.tribe) {
    hp.nationPlural = options.tribe.plural;
    hp.nationAdjective = options.tribe.adjective;
  } else {
    hp.nationAdjective = NATIONS[options.nation]!.adjective;
    hp.nationPlural = pluralOf(options.nation);
  }
  for (let i = 0; i < MAX_PLAYERS; i++) initPlayer(state, i);
  hp.taxRate = 5;
  hp.scienceRate = 5;
  if (options.difficulty === 0) hp.gold = 50;
  for (let i = 0; i < MAX_PLAYERS; i++) if (state.players[i]!.nation >= 8) state.playerIdentity |= 1 << i;
  if (options.leaderName) hp.leader = options.leaderName;
  return state;
}

/**
 * InitPlayerData: ustawienia początkowe gracza i pierwszy osadnik w losowym, dobrym miejscu.
 * Wywoływana też w trakcie gry, gdy cywilizacja komputera odradza się po zniszczeniu.
 * Zwraca false, gdy gracz nie wszedł do gry.
 */
export function initPlayer(state: GameState, player: number): boolean {
  const p = state.players[player]!;
  if (player === state.humanPlayer && state.turn !== 0) return false;
  const keepName = player === state.humanPlayer ? { leader: p.leader, plural: p.nationPlural, adjective: p.nationAdjective } : null;
  p.researchProgress = 0;
  p.techCount = 0;
  p.gold = 0;
  p.government = Government.Despotism;
  p.taxRate = 4;
  p.scienceRate = 4;
  p.cityCount = 0;
  p.settlerCount = 1;
  p.contactCountdown = -1;
  p.units.forEach((u) => Object.assign(u, emptyUnit()));
  for (const c of p.continents) c.strategy = 0;
  for (const c of p.continentPolicies) { c.role = -1; c.policy = 0; }
  for (let i = 0; i < 8; i++) {
    p.diplomacy[i] = 0;
    state.players[i]!.diplomacy[player] = 0;
    p.unitsDestroyed[i] = 0;
  }
  p.techs.fill(false);
  if (state.turn !== 0) {
    for (let t = 0; t < TECH_COUNT; t++) {
      const first = state.techFirstDiscoveredBy[t]! & 7;
      if (state.players[state.humanPlayer]!.techs[t] && first !== 0 && first !== state.humanPlayer && state.rng.next(2) === 0) {
        researchFinished(state, player, player, t);
      }
    }
  }

  if (player === 0) {
    p.nation = 0;
    p.leader = NATIONS[0]!.leader;
    p.nationPlural = NATIONS[0]!.plural || 'Barbarians';
    p.nationAdjective = NATIONS[0]!.adjective || 'Barbarian';
    p.techCount = 0;
    p.lostUnits.fill(0);
    p.activeUnits.fill(0);
    p.unitsInProduction.fill(0);
    return true;
  }
  if (!(state.activeCivs & (1 << player))) return true;

  if (player !== state.humanPlayer) {
    if (state.turn === 0) {
      for (;;) {
        const n = state.rng.next(16);
        if ((n & 7) !== player) continue;
        if (state.players.some((o, i) => i !== player && o.nation === n)) continue;
        p.nation = n;
        break;
      }
    } else {
      p.nation ^= 8;
    }
  }

  // Miejsce startu
  const cityCountOnContinent = (group: number) =>
    state.cities.filter((c) => c.status !== -1 && state.map.group[cellIndex(c.x, c.y)] === group && terrainAt(state.map, c.x, c.y) !== Terrain.Water).length;
  let x = 0;
  let y = 0;
  let tries = 0;
  for (;;) {
    x = state.rng.next(64) + 8;
    y = state.rng.next(34) + 8;
    if (terrainAt(state.map, x, y) === Terrain.Water || cellHasHut(state, x, y)) continue;
    const near = nearestCity(state, x, y);
    let dist = near === -1 ? 30 : distance(x, y, state.cities[near]!.x, state.cities[near]!.y);
    if (state.turn === 0) {
      for (let j = 1; j < player; j++) {
        const first = state.players[j]!.units[0]!;
        if (first.type !== NO_UNIT) dist = Math.min(dist, distance(x, y, first.x, first.y));
      }
    }
    const i = cellIndex(x, y);
    const score = state.map.buildScore[i]!;
    const group = state.map.group[i]!;
    tries++;
    // Zabezpieczenie przed nieskończoną pętlą (w oryginale wymaganie co do wielkości kontynentu rośnie z liczbą prób)
    if (tries > 100000) break;
    if (tries <= 2000 || (player === state.humanPlayer && state.turn === 0)) {
      if (12 - Math.trunc(tries / 32) > score || dist < 10 - Math.trunc(tries / 64) ||
        state.map.continents[group]!.buildSiteCount < 32 - Math.trunc(state.turn / 32) + Math.trunc(tries / 64) ||
        (state.year > 0 && cityCountOnContinent(group) !== 0)) continue;
    }
    break;
  }
  if (state.turn === 0 && state.earth) {
    [x, y] = EARTH_START[p.nation] as [number, number];
    tries = 0;
  }
  if (state.turn !== 0 && ((p.nation > 7 && state.playerIdentity & (1 << player)) || (p.nation < 8 && !(state.playerIdentity & (1 << player))))) {
    tries = 2000;
  }
  if (player !== state.humanPlayer) {
    p.scienceRate = NATIONS[p.nation]!.ideology + 3;
    p.taxRate = 9 - p.scienceRate;
  }
  if ((-(50 * state.difficulty - 350) < state.turn || tries >= 2000) && player !== state.humanPlayer) {
    p.nation ^= 8;
    state.activeCivs &= ~(1 << player);
    if (((1 << state.humanPlayer) | 1) === state.activeCivs) state.gameOver = 1;
    return false;
  }
  if (keepName) {
    p.leader = keepName.leader;
    p.nationPlural = keepName.plural;
    p.nationAdjective = keepName.adjective;
  } else {
    p.leader = NATIONS[p.nation]!.leader;
    p.nationAdjective = NATIONS[p.nation]!.adjective;
    p.nationPlural = pluralOf(p.nation);
  }
  setCellOwner(state, x, y, player);
  createUnit(state, player, 0, x, y);
  p.xStart = x;
  state.players[0]!.units.forEach((u, i) => {
    if (u.type !== NO_UNIT && distance(x, y, u.x, u.y) < 9) deleteUnit(state, 0, i);
  });
  p.techCount = 1;
  p.lostUnits.fill(0);
  p.activeUnits.fill(0);
  p.unitsInProduction.fill(0);
  return true;
}
