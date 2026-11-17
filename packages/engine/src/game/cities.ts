/**
 * Miasta — zakładanie, usuwanie, zdobywanie. Źródło: GameEngine.FindNewCity, GameEngine.DeleteCity,
 * Actions.CityTakeover i CityWorker.PlayerHasWonder z OpenCivOne (MIT).
 * Gospodarka miasta (praca mieszkańców, wzrost, produkcja) — w economy.ts.
 */
import { spaceshipLost } from './spaceship';
import { MAP_HEIGHT } from '../data/enums';
import { WONDERS } from '../data/buildings';
import { TERRAIN_MODIFICATIONS } from '../data/terrainModifications';
import { Tech } from '../data/techs';
import { Terrain } from '../world/generate';
import { BuildingId, WonderId, hasBuilding } from './buildings';
import { DIRECTIONS, cellIndex, isValid, terrainAt, updateVisibleCell, wrapX } from './map';
import { CityStatus, Government, Improvement, NO_UNIT, type City, type GameState } from './types';
import { activeUnitAt, cellOwner, deleteUnit, exploreCell, setCellOwner, unitsAt } from './units';
import { UNITS } from '../data/units';
import { MovementType } from '../data/enums';
import { playerHasTech } from './techs';
import { initPlayer } from './players';

export function emptyCity(): City {
  return {
    status: -1, x: -1, y: -1, size: 0, visibleSize: 0, owner: 0, originalOwner: 0, production: 0, food: 0, shields: 0,
    baseTrade: 0, workers: 0, specialists: 0, buildings: 0, nameId: 0xff, tradeRoutes: [-1, -1, -1], storedUnits: [-1, -1],
  };
}

export const cityName = (state: GameState, cityId: number): string => state.cities[cityId] ? state.cityNames[state.cities[cityId]!.nameId] ?? '' : '';

/** PlayerHasWonder: cud działa, jeśli stoi w mieście gracza i nikt nie odkrył technologii, która go wygasza. */
export function playerHasWonder(state: GameState, player: number, wonder: number): boolean {
  const def = WONDERS[wonder - 1]!;
  for (let i = 1; i < 8; i++) if (def.obsoleteTech !== Tech.None && playerHasTech(state, i, def.obsoleteTech)) return false;
  const city = state.wonderCity[wonder]!;
  return city !== -1 && city < 128 && state.cities[city]!.owner === player;
}

/**
 * FindNewCity: zakłada miasto gracza na (x, y). Zwraca numer miasta albo -1 (brak miejsca w tablicy 128 miast).
 * Nazwa: kolejna wolna z puli nacji, potem z puli zapasowej (224–255). Okno nadania nazwy pokazuje interfejs
 * (zdarzenie „cityFounded” z proponowaną nazwą); `name` pozwala ją od razu zmienić.
 */
export function foundCity(state: GameState, player: number, x: number, y: number, size: number, name?: string): number {
  x = wrapX(x);
  const id = state.cities.findIndex((c) => c.status === -1);
  if (id === -1) {
    if (player === state.humanPlayer) {
      state.events.push({ kind: 'message', style: 'domestic',
        text: 'Sire, our bureaucrats can not\nadminister so many cities.\nWe must remove some of our old\ncities before we build new ones.' });
    }
    return -1;
  }
  const p = state.players[player]!;
  let nameId = p.nation - 1;
  if (nameId > 6) nameId--;
  nameId *= 16;
  let boundary = nameId;
  for (;;) {
    if (!state.cityNameTaken[nameId]) break;
    nameId++;
    if (boundary + 16 === nameId) nameId = 224;
    if (nameId === 256) {
      nameId = 0;
      if (boundary === 999) break;
      boundary = 999;
    }
  }
  const city = state.cities[id]!;
  Object.assign(city, emptyCity());
  city.nameId = nameId;
  state.cityNameTaken[nameId] = true;
  if (name !== undefined) state.cityNames[nameId] = name.slice(0, 12);

  const i = cellIndex(x, y);
  state.map.improvements[i]! &= ~(Improvement.Fortress | Improvement.Mine);
  state.map.improvements[i]! |= Improvement.City | Improvement.Road;
  if (TERRAIN_MODIFICATIONS[terrainAt(state.map, x, y)]!.irrigationEffect < -1) state.map.improvements[i]! |= Improvement.Irrigation;
  if (state.currentPlayer === state.humanPlayer) updateVisibleCell(state.map, x, y);

  city.status = 0;
  city.x = x;
  city.y = y;
  city.size = size;
  city.owner = player;
  city.originalOwner = player;
  city.production = playerHasTech(state, player, Tech.Conscription) ? 5 : playerHasTech(state, player, Tech.Gunpowder) ? 4 : 1;
  const firstCity = !state.cities.some((c, j) => j !== id && c.status !== -1 && c.owner === player);
  if (firstCity) city.buildings = 1; // Palace
  for (let d = 1; d < 9; d++) {
    const [dx, dy] = DIRECTIONS[d]!;
    const t = terrainAt(state.map, x + dx, y + dy);
    if (t === Terrain.Water && (player === state.humanPlayer || groupSizeAt(state, x + dx, y + dy) > 256)) city.status |= CityStatus.WaterAccess;
    if (t === Terrain.River || t === Terrain.Mountains) city.status |= CityStatus.NearRiverOrMountains;
  }
  if (player === state.humanPlayer && firstCity) state.events.push({ kind: 'advice', key: '*FIRSTPRODUCT' });
  for (let d = 0; d < 45; d++) {
    const [dx, dy] = DIRECTIONS[d]!;
    const nx = wrapX(x + dx);
    const ny = y + dy;
    if (!isValid(nx, ny)) continue;
    const ci = cellIndex(nx, ny);
    if (d > 20) {
      if (state.map.landOwner[ci]! > 7) state.map.landOwner[ci] = 8;
    } else {
      state.map.landOwner[ci] = player;
    }
    if (player !== state.humanPlayer && d <= 24 && state.map.improvements[ci]! & Improvement.City && cellOwner(state, nx, ny) === state.humanPlayer) {
      city.visibleSize = 1;
      exploreCell(state, state.humanPlayer, x, y);
    }
  }
  p.cityCount++;
  state.events.push({ kind: 'cityFounded', player, city: id, x, y, name: state.cityNames[nameId] });
  return id;
}

/** Wielkość kontynentu/oceanu, do którego należy pole (GetMapGroupSize). */
export function groupSizeAt(state: GameState, x: number, y: number): number {
  if (!isValid(x, y)) return 0;
  const g = state.map.group[cellIndex(x, y)]!;
  const list = terrainAt(state.map, x, y) === Terrain.Water ? state.map.oceans : state.map.continents;
  return list[g]?.size ?? 0;
}

/** DeleteCity: usunięcie miasta wraz z jednostkami z niego utrzymywanymi. */
export function deleteCity(state: GameState, cityId: number): void {
  const city = state.cities[cityId]!;
  const player = city.owner;
  const { x, y } = city;
  state.events.push({ kind: 'cityDeleted', player, city: cityId, x, y });
  if (city.production >= 0) state.players[player]!.unitsInProduction[city.production]!--;
  state.players[player]!.cityCount--;
  city.status = -1;
  const i = cellIndex(x, y);
  state.map.improvements[i] = state.map.improvements[i]! & Improvement.Flag80;
  if (state.map.explored[i]! & (1 << state.humanPlayer)) state.map.visibleImprovements[i] = state.map.improvements[i]!;
  for (const c of state.cities) c.tradeRoutes = c.tradeRoutes.map((t) => (t === cityId ? -1 : t));
  for (let w = 1; w < 22; w++) if (state.wonderCity[w] === cityId) state.wonderCity[w] = 128;
  state.players[player]!.units.forEach((u, uid) => {
    if (u.type !== NO_UNIT && u.homeCity === cityId) deleteUnit(state, player, uid);
  });
  if (activeUnitAt(state, x, y) !== -1) {
    // DeleteNonLandUnitsInStack: okręty i samoloty w zniszczonym mieście giną
    for (const uid of unitsAt(state, player, x, y)) {
      if (UNITS[state.players[player]!.units[uid]!.type]!.movementType !== MovementType.Land) deleteUnit(state, player, uid);
    }
  }
  for (let d = 0; d < 49; d++) {
    const [dx, dy] = DIRECTIONS[d]!;
    const nx = wrapX(x + dx);
    const ny = y + dy;
    if (!isValid(nx, ny)) continue;
    const near = nearestCityDistance(state, nx, ny);
    if (d < 21 || near > 5) state.map.landOwner[cellIndex(nx, ny)] = state.map.buildScore[cellIndex(nx, ny)]!;
  }
}

function nearestCityDistance(state: GameState, x: number, y: number): number {
  let best = Number.MAX_SAFE_INTEGER;
  for (const c of state.cities) {
    if (c.status === -1) continue;
    const dx = Math.abs(wrapX(c.x - x + 40) - 40);
    best = Math.min(best, Math.max(dx, Math.abs(c.y - y)));
  }
  return best;
}

/** Złoto miasta przy zdobyciu (GetCityTreasury). */
export function cityTreasury(state: GameState, cityId: number): number {
  const city = state.cities[cityId]!;
  const p = state.players[city.owner]!;
  return Math.trunc((p.gold * city.size) / (p.totalCitySize + 1));
}

/**
 * CityTakeover: gracz zdobywa miasto (wejście jednostką). `byDiplomat` = przekupstwo dyplomatą (flag w oryginale).
 * Pominięte (etapy 6–8): secesja imperium, przejęcie technologii, przeniesienie stolicy, okno zdobycia miasta.
 */
export function cityTakeover(state: GameState, player: number, cityId: number, unitId: number, byDiplomat = false): void {
  if (cityId < 0) return;
  const city = state.cities[cityId]!;
  const loser = city.owner;
  const { x, y } = city;
  if (player === state.humanPlayer) state.players[loser]!.contactCountdown = -2;
  if (loser === state.humanPlayer) state.players[player]!.contactCountdown = -1;
  const treasury = Math.min(Math.max(cityTreasury(state, cityId), 0), state.players[loser]!.gold);
  const attacker = state.players[player]!.units[unitId];
  if (player === 0 && attacker && attacker.type !== NO_UNIT && UNITS[attacker.type]!.attack <= 2) {
    deleteCity(state, cityId);
    city.size = 0;
  } else {
    city.shields = 0;
    city.status &= ~(CityStatus.CivilDisorder | CityStatus.AutoProduction | CityStatus.Celebrating);
    if (hasBuilding(city, BuildingId.Palace)) spaceshipLost(state, loser); // SpaceshipArrivalFailed
    city.buildings &= 0xfffffbb6; // Palace, Temple, Courthouse, Cathedral
    if (!byDiplomat) city.buildings = (city.buildings & (0xaaaa >>> state.rng.next(2))) >>> 0;
    if (!byDiplomat || city.size > 1) {
      city.size--;
      if (city.size < 1) deleteCity(state, cityId);
    }
  }
  state.players[loser]!.gold -= treasury;
  if (player !== 0) state.players[player]!.gold += treasury;
  if (city.size !== 0) {
    city.status &= ~(CityStatus.StoredUnitsRestored | CityStatus.TechStolen | CityStatus.Celebrating);
    for (let d = 0; d < 20; d++) {
      const [dx, dy] = DIRECTIONS[d]!;
      if (isValid(x + dx, y + dy)) state.map.landOwner[cellIndex(x + dx, y + dy)] = player;
    }
  }
  city.owner = player;
  if (player === state.humanPlayer || loser === state.humanPlayer) {
    exploreCell(state, state.humanPlayer, x, y);
    city.visibleSize = player === state.humanPlayer ? 0 : city.size;
  }
  state.events.push({ kind: 'cityCaptured', player, loser, city: cityId, x, y, treasury, destroyed: city.size === 0,
    text: `${state.players[player]!.nationPlural} capture\n${cityName(state, cityId)}. ${treasury} gold\npieces plundered.\n` });
  setCellOwner(state, x, y, player);
  state.players[loser]!.units.forEach((u, uid) => {
    if (u.type !== NO_UNIT && u.homeCity === cityId && (u.x !== x || u.y !== y || city.size === 0)) deleteUnit(state, loser, uid);
  });
  const gov = state.players[state.humanPlayer]!.government;
  if (player === state.humanPlayer && gov <= Government.Communism) city.status |= CityStatus.CivilDisorder;
  if (city.size !== 0) {
    if (city.production >= 0) state.players[loser]!.unitsInProduction[city.production]!--;
    if (player !== state.humanPlayer) city.production = 0;
  }
  testIfPlayerDestroyed(state, loser, player);
}

/** TestIfAIPlayerIsDestroyed: cywilizacja komputera bez miast znika (i może się odrodzić — initPlayer). */
export function testIfPlayerDestroyed(state: GameState, player: number, destroyer: number): void {
  if (player === 0 || player === state.humanPlayer) return;
  if (state.cities.some((c) => c.status !== -1 && c.owner === player)) return;
  const p = state.players[player]!;
  state.events.push({ kind: 'civDestroyed', player, destroyer,
    text: destroyer >= 0 ? `${p.nationAdjective}\ncivilization\ndestroyed\nby ${state.players[destroyer]!.nationPlural}!\n` : `${p.nationAdjective}\ncivilization\nhas died out!\n` });
  p.units.forEach((u, uid) => { if (u.type !== NO_UNIT) deleteUnit(state, player, uid); });
  const mask = ~(1 << player);
  for (let i = 0; i < state.map.explored.length; i++) state.map.explored[i]! &= mask;
  initPlayer(state, player);
}

export const cityHasBuilding = (state: GameState, cityId: number, id: number): boolean => hasBuilding(state.cities[cityId]!, id);
export { BuildingId, WonderId, MAP_HEIGHT };
