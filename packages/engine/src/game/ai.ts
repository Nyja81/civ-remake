/**
 * Przeciwnik komputerowy. Źródło: AIEngine (RecalculateStatsAndPolicies, MoveUnit, MoveBarbarianUnit, polityki jednostek
 * i kontynentów, ChangeCityProduction, UnitChooseNewDirection) oraz GameEngine.SelectCityProduction (część oceniająca)
 * z OpenCivOne (MIT) — reguły w tej samej kolejności co we wzorcu.
 *
 * „Idź do” komputera i barbarzyńców: GoTo oryginału (goto.ts, F0_2e31_000e).
 * Dyplomaci i karawany komputera: unitActions.ts (MoveUnit woła DiplomatActionOnCity; przekupienie jednostek —
 * z oceny kierunków poniżej). Odległości — F0_2dc4_0289 (`distance`), w jednym miejscu F0_2dc4_0208 (`distanceOf`).
 * Odstępstwa: statystyki Var_e3c2/Var_db42 z przeliczania miast (wybór despotyzmu/republiki) — przyjęte 0.
 */
import { BUILDINGS, WONDERS } from '../data/buildings';
import { MovementType, UnitRole } from '../data/enums';
import { NATIONS } from '../data/nations';
import { TERRAIN } from '../data/terrain';
import { TERRAIN_MODIFICATIONS } from '../data/terrainModifications';
import { Tech } from '../data/techs';
import { UNITS } from '../data/units';
import { hasSpecialResource } from '../world/features';
import { Terrain } from '../world/generate';
import { attackOdds, bestDefender } from './combat';
import { BuildingId, hasBuilding, WonderId } from './buildings';
import { cityTreasury, playerHasWonder } from './cities';
import { DIRECTIONS, cellIndex, distance, distanceOf, isValid, terrainAt, wrapX } from './map';
import { bribeUnit } from './unitActions';
import { getNextMove } from './goto';
import { playerHasTech } from './techs';
import { CityStatus, Diplomacy, Government, Improvement, NO_UNIT, UnitStatus, type GameState, type Player } from './types';
import { activeUnitAt, cellHasHut, cellOwner, deleteUnit, isEnemyUnitAdjacent, nearestCity, occupantPlayer, placeUnit, unitsAt } from './units';

const R = UnitRole;
const int16 = (v: number) => (v << 16) >> 16;
const NONE = -1;
const BUILDING_TECH = [0, ...BUILDINGS.map((b) => b.requiredTech)];
const WONDER_TECH = [0, ...WONDERS.map((w) => w.requiredTech)];
const GOVERNMENTS = ['Anarchy', 'Despotism', 'Monarchy', 'Communism', 'Republic', 'Democracy'];

// ── pomocnicze funkcje stosu (UnitManagement) ──────────────────────────────────────────

const unitOf = (state: GameState, p: number, id: number) => state.players[p]!.units[id]!;
const defOf = (state: GameState, p: number, id: number) => UNITS[unitOf(state, p, id).type]!;

/** Pozostałe jednostki stosu (lista NextUnitID bez samej jednostki). */
function others(state: GameState, p: number, id: number): number[] {
  const u = unitOf(state, p, id);
  return unitsAt(state, p, u.x, u.y).filter((i) => i !== id);
}

/** GetStackUnitValueSum. */
function stackSum(state: GameState, p: number, id: number, kind: 'cost' | 'defense' | 'count' | 'attack' | 'defenseUnits'): number {
  if (id < 0) return 0;
  const u = unitOf(state, p, id);
  if (u.type === NO_UNIT) return 0;
  let v = 0;
  for (const i of unitsAt(state, p, u.x, u.y)) {
    const d = defOf(state, p, i);
    if (kind === 'cost') v += d.cost;
    else if (kind === 'defense') v += d.defense;
    else if (kind === 'count') v++;
    else if (kind === 'attack') v += d.attack;
    else if (i < id && d.role === R.Defense) v++;
  }
  return v;
}

/** GetStackUnitCount: jednostki o danej roli w stosie. */
function stackRoleCount(state: GameState, p: number, id: number, role: number): number {
  if (id < 0) return 0;
  const u = unitOf(state, p, id);
  return unitsAt(state, p, u.x, u.y).filter((i) => defOf(state, p, i).role === role).length;
}

/** IsEnemyUnitNear (F0_1866_18d0): obca jednostka na sąsiednim polu. */
function enemyNear(state: GameState, p: number, x: number, y: number): boolean {
  for (let d = 1; d < 9; d++) {
    const [dx, dy] = DIRECTIONS[d]!;
    if (!isValid(x + dx, y + dy)) continue;
    const o = occupantPlayer(state, x + dx, y + dy);
    if (o !== -1 && o !== p) return true;
  }
  return false;
}

/** IsUnitNear (F0_1866_1725): jak IsUnitOrCityNear, ale nie w mieście. */
const unitNear = (state: GameState, p: number, x: number, y: number) => isEnemyUnitAdjacent(state, p, x, y);

/** IsUnitOrCityNear (F0_1866_1750). */
function unitOrCityNear(state: GameState, p: number, x: number, y: number): boolean {
  const water = terrainAt(state.map, x, y) === Terrain.Water;
  for (let d = 1; d < 9; d++) {
    const [dx, dy] = DIRECTIONS[d]!;
    if (!isValid(x + dx, y + dy) || (terrainAt(state.map, x + dx, y + dy) === Terrain.Water) !== water) continue;
    const o = occupantPlayer(state, x + dx, y + dy);
    if (o !== -1 && o !== p) return true;
  }
  return false;
}

function nearestPlayerUnit(state: GameState, p: number, except: number, x: number, y: number): number {
  let best = 999;
  let id = -1;
  state.players[p]!.units.forEach((u, i) => {
    if (u.type === NO_UNIT || i === except) return;
    const d = distance(x, y, u.x, u.y);
    if (d < best) {
      best = d;
      id = i;
    }
  });
  return id;
}

const groupAt = (state: GameState, x: number, y: number) => (isValid(x, y) ? state.map.group[cellIndex(x, y)]! : 0);
const imp = (state: GameState, x: number, y: number) => (isValid(x, y) ? state.map.improvements[cellIndex(x, y)]! : 0);
const landOwner = (state: GameState, x: number, y: number) => state.map.landOwner[cellIndex(x, y)]!;

// ── polityki ───────────────────────────────────────────────────────────────────────────

function insertPolicy(list: Player['unitPolicies'], size: number, x: number, y: number, role: number, policy: number): void {
  for (let i = 0; i < size; i++) {
    if (list[i]!.role === NONE || list[i]!.policy < policy) {
      for (let j = size - 2; j >= i; j--) if (list[j]!.policy !== 0) Object.assign(list[j + 1]!, list[j]!);
      Object.assign(list[i]!, { x, y, role, policy });
      return;
    }
  }
}

/** PlayerAddUnitPolicy: lista 32 celów posortowana malejąco wg wagi. */
export function addUnitPolicy(state: GameState, p: number, x: number, y: number, role: number, policy: number): void {
  const pl = state.players[p]!;
  x = wrapX(x);
  for (const up of pl.unitPolicies) if (up.x === x && up.y === y && up.role === role && up.policy <= policy) return;
  if (p === state.currentPlayer && p !== state.humanPlayer && (role === R.SeaAttack || role === R.AirAttack)) {
    for (const u of pl.units) {
      if (u.type === NO_UNIT || u.movesLeft === 0 || UNITS[u.type]!.role !== role || groupAt(state, u.x, u.y) !== groupAt(state, x, y)) continue;
      if (u.movesLeft >= distance(u.x, u.y, x, y) * 2) {
        u.gotoX = x;
        u.gotoY = y;
        u.status |= UnitStatus.AiFlag;
        u.status &= ~(UnitStatus.Sentry | UnitStatus.BuildRoad | UnitStatus.Fortifying | UnitStatus.Fortified);
        break;
      }
    }
  }
  insertPolicy(pl.unitPolicies, 32, x, y, role, policy);
}

export function addContinentPolicy(state: GameState, p: number, x: number, y: number, role: number, policy: number): void {
  const pl = state.players[p]!;
  x = wrapX(x);
  for (const cp of pl.continentPolicies) if (cp.x === x && cp.y === y && cp.role === role && cp.policy <= policy) return;
  insertPolicy(pl.continentPolicies, 16, x, y, role, policy);
}

/** PlayerClearContinentPolicies: usuwa cele danej roli w promieniu. */
export function clearContinentPolicies(state: GameState, p: number, role: number, x: number, y: number, maxDistance: number): void {
  for (const cp of state.players[p]!.continentPolicies) {
    if (cp.role === role && distance(x, y, cp.x, cp.y) <= maxDistance) cp.role = NONE;
  }
}

/** ClearUnitPoliciesAndReassignThem (na początku tury gracza). */
export function reassignPolicies(state: GameState, p: number): void {
  const pl = state.players[p]!;
  for (const up of pl.unitPolicies) {
    up.role = NONE;
    up.policy = 0;
  }
  for (const cp of pl.continentPolicies) {
    if (cp.role !== NONE && cp.role <= R.Defense) addUnitPolicy(state, p, cp.x, cp.y, cp.role, cp.policy);
  }
}

/** ChangeCurrentGovernment dla komputera. */
export function aiChangeGovernment(state: GameState, p: number, government: number): void {
  const pl = state.players[p]!;
  const before = pl.government;
  const embassy = (state.players[state.humanPlayer]!.diplomacy[p]! & Diplomacy.Embassy) !== 0;
  if (embassy && (pl.government !== government || pl.diplomacy[0]! & Diplomacy.Allied)) {
    if (pl.diplomacy[0]! & Diplomacy.Allied) {
      pl.diplomacy[0]! &= ~Diplomacy.Allied;
      state.events.push({ kind: 'message', style: 'diplomats', text: `The ${pl.nationAdjective} government\nchanged to ${GOVERNMENTS[government]}!\n` });
    } else {
      pl.diplomacy[0]! |= Diplomacy.Allied;
      state.events.push({ kind: 'message', style: 'diplomats', text: `The ${pl.nationAdjective} government\nhas been overthrown!\n` });
    }
  }
  pl.government = government;
  pl.taxRate = 4 - (government >> 1);
  if (before !== pl.government) for (let i = 0; i < 8; i++) pl.diplomacy[i]! &= ~Diplomacy.Vendetta;
}

/** Mapa ról jednostek 20×13 (MapUnitRoles) — bity: 1 miasto, 2<<rola jednostki. Przeliczana co turę gracza. */
let mapUnitRoles = new Int32Array(20 * 13);
function getMapUnitRoles(x: number, y: number): number {
  if (y < 0 || y >= 13) return 0xff;
  return mapUnitRoles[(((x % 20) + 20) % 20) * 13 + y]!;
}

/** RecalculateStatsAndPolicies. */
export function recalculateStatsAndPolicies(state: GameState, p: number): void {
  const pl = state.players[p]!;
  for (const c of pl.continents) {
    c.cityCount = 0;
    c.defense = 0;
    c.attack = 0;
  }
  mapUnitRoles = new Int32Array(20 * 13);
  pl.militaryPower = 0;
  pl.settlerCount = 0;
  pl.unitCount = 0;
  pl.units.forEach((u) => {
    if (u.type === NO_UNIT || u.type === 25) return;
    if (u.type === 0) pl.settlerCount++;
    else pl.unitCount++;
    const d = UNITS[u.type]!;
    pl.militaryPower += d.attack + d.defense;
    u.status &= ~UnitStatus.AiFlag;
    if (unitOrCityNear(state, p, u.x, u.y)) u.status |= UnitStatus.AiFlag;
    if (terrainAt(state.map, u.x, u.y) !== Terrain.Water) {
      const g = groupAt(state, u.x, u.y);
      pl.continents[g]!.attack += d.defense; // zamiana ataku i obrony jak we wzorcu
      pl.continents[g]!.defense += d.attack;
    } else if (d.movementType === MovementType.Land) u.status |= UnitStatus.AiFlag;
    // Pole jednostki (asembler: Units[i].Position; nowsza wersja wzorca błędnie czyta tu Cities[i]).
    mapUnitRoles[(u.x >> 2) * 13 + (u.y >> 2)]! |= (2 << d.role) & 0xff;
  });
  const unitThreshold = Math.min(99, Math.max(3, Math.trunc(pl.unitCount / 8)));
  pl.totalCitySize = 0;
  pl.cityCount = 0;
  pl.unitsInProduction.fill(0);
  state.cities.forEach((c, i) => {
    if (c.status === -1) return;
    if (c.owner !== p) {
      if (state.turn * state.difficulty > 200 || state.map.explored[cellIndex(c.x, c.y)]! & (1 << p) || c.owner !== state.humanPlayer) {
        if ((pl.diplomacy[c.owner]! & (Diplomacy.Peace | Diplomacy.PeaceTreaty)) !== Diplomacy.Peace && ((i + state.turn) & 3) !== 0) {
          addUnitPolicy(state, p, c.x, c.y, R.LandAttack, hasBuilding(c, BuildingId.CityWalls) ? 3 : 5);
        }
      }
    } else {
      pl.cityCount++;
      pl.continents[groupAt(state, c.x, c.y)]!.cityCount++;
      pl.totalCitySize += c.size;
      if (c.production >= 0) pl.unitsInProduction[c.production]!++;
      mapUnitRoles[(c.x >> 2) * 13 + (c.y >> 2)]! |= 1;
      for (const su of c.storedUnits) {
        if (su === -1) continue;
        const d = UNITS[su & 0x3f]!;
        pl.militaryPower += d.attack + d.defense;
        const cont = pl.continents[groupAt(state, c.x, c.y)]!;
        cont.attack = d.defense; // przypisanie (nie dodawanie) — dosłownie jak we wzorcu
        cont.defense += d.attack;
      }
    }
    if (activeUnitAt(state, c.x, c.y) === -1 && c.storedUnits[0] === -1) {
      addUnitPolicy(state, p, c.x, c.y, R.Defense, c.owner === p ? 4 : 2);
    }
  });
  pl.continents[0]!.strategy = R.Settle;
  pl.continents[15]!.strategy = R.Settle;
  state.aiFlags &= ~(1 << p);
  state.aiMakeContact = false;
  for (let i = 1; i < 8; i++) if ((pl.diplomacy[i]! & (Diplomacy.Contact | Diplomacy.Peace)) === Diplomacy.Contact) state.aiMakeContact = true;
  for (let g = 1; g < 15; g++) {
    let strong = 0;
    let weak = 0;
    let dipl = 0;
    let cities = 0;
    let attack = 0;
    const mine = pl.continents[g]!;
    const old = mine.strategy;
    for (let j = 1; j < 8; j++) {
      const other = state.players[j]!.continents[g]!;
      if (other.attack !== 0 && (Math.trunc(mine.defense / 4) < other.defense || other.cityCount !== 0)) {
        if ((pl.diplomacy[j]! & (Diplomacy.Contact | Diplomacy.Peace)) === Diplomacy.Contact || pl.diplomacy[j]! & Diplomacy.PeaceTreaty) {
          if (other.attack >= mine.defense && other.defense >= mine.attack && mine.cityCount !== 0) weak++;
          else strong++;
        }
      }
      if (other.attack !== 0 && j === state.humanPlayer && pl.diplomacy[j]! & Diplomacy.Peace) {
        if ((mine.defense >> 1) + mine.attack < other.defense) weak++;
      }
      attack += other.attack;
      cities += other.cityCount;
      if (other.attack !== 0) dipl |= pl.diplomacy[j]! & Diplomacy.Peace ? 1 : 2;
    }
    if (state.players[0]!.continents[g]!.cityCount !== 0) strong++;
    const land = state.map.continents[g]!;
    if (((mine.attack + attack) * 2 > land.size || (mine.cityCount + cities) * 64 + 2 > land.buildSiteCount) && playerHasTech(state, p, Tech.MapMaking)) {
      mine.strategy = R.SeaTransport;
    } else mine.strategy = R.Settle;
    if (strong !== 0) mine.strategy = R.LandAttack;
    if (weak !== 0) mine.strategy = R.Defense;
    if (mine.attack === 0 && mine.cityCount === 0 && dipl !== 1) mine.strategy = R.LandAttack;
    if (mine.strategy !== old && p !== state.humanPlayer) changeProductionOnContinent(state, p, g);
    if (mine.attack !== 0 && state.players[state.humanPlayer]!.continents[g]!.cityCount > 1) state.aiFlags |= 1 << p;
  }
  if (p === 0 || p === state.humanPlayer) return;
  if (((p + state.turn) & 7) === 0) {
    const unsupported = 0; // Var_e3c2 — patrz nagłówek
    const tradeBalance = 0; // Var_db42
    if (unsupported > 0) aiChangeGovernment(state, p, Government.Despotism);
    else if (playerHasTech(state, p, Tech.TheRepublic) && tradeBalance >= 0) aiChangeGovernment(state, p, Government.Republic);
    else if (playerHasTech(state, p, Tech.Communism) && pl.cityCount > 10) aiChangeGovernment(state, p, Government.Communism);
    else if (playerHasTech(state, p, Tech.Monarchy)) aiChangeGovernment(state, p, Government.Monarchy);
  }
  const thresholds = new Array<number>(32).fill(unitThreshold);
  pl.units.forEach((u, i) => {
    if (u.type === NO_UNIT || u.type === 25 || u.status & UnitStatus.AiFlag) return;
    const def = UNITS[u.type]!;
    const g = groupAt(state, u.x, u.y);
    const keep = ((i + state.turn) & 0xf) !== 0 ||
      (!playerHasTech(state, p, def.obsoleteTech) &&
        ((pl.government <= Government.Despotism && pl.continents[g]!.strategy !== R.SeaTransport) || u.type !== 1)) ||
      unitOrCityNear(state, p, u.x, u.y) || (imp(state, u.x, u.y) & Improvement.City && unitsAt(state, p, u.x, u.y).length === 1) ||
      terrainAt(state.map, u.x, u.y) === Terrain.Water || pl.continents[g]!.strategy === R.Defense;
    if (!keep) {
      deleteUnit(state, p, i);
      return;
    }
    let best = Number.MAX_SAFE_INTEGER;
    let chosen = -1;
    for (let j = 0; j < 32; j++) {
      const up = pl.unitPolicies[j]!;
      if (up.role === NONE) continue;
      if ((def.role !== up.role || groupAt(state, up.x, up.y) !== g) && (u.type !== 15 || (up.role !== R.SeaAttack && def.role !== up.role))) continue;
      let d = distance(u.x, u.y, up.x, up.y);
      if (u.type !== 15) {
        d = Math.trunc((thresholds[j]! * d) / (up.policy + 1));
      } else {
        if (!(up.policy & 1) || ((j + (state.turn >> 1)) & 1) === 0) continue;
        d = def.moves < d ? Math.trunc((d * 4) / (up.policy + 1)) : Math.trunc((d * 2) / (up.policy + 1));
      }
      if (!(u.status & (UnitStatus.Sentry | UnitStatus.BuildRoad))) {
        if (d < best && up.policy * 4 >= Math.trunc(d / unitThreshold)) {
          best = d;
          chosen = j;
        }
        continue;
      }
      if (up.policy < 2 || (up.policy * unitThreshold < d && thresholds[j] !== unitThreshold)) continue;
      if (!(imp(state, u.x, u.y) & Improvement.City) && d < best && up.policy * 4 >= Math.trunc(d / unitThreshold)) {
        best = d;
        chosen = j;
      }
    }
    if (chosen !== -1) {
      u.gotoX = pl.unitPolicies[chosen]!.x;
      u.gotoY = pl.unitPolicies[chosen]!.y;
      u.status |= UnitStatus.AiFlag;
      u.status &= ~(UnitStatus.Sentry | UnitStatus.BuildRoad | UnitStatus.Fortifying | UnitStatus.Fortified);
      thresholds[chosen]!++;
    }
  });
}

/** PlayerChangeCityProductionForSameContinent. */
export function changeProductionOnContinent(state: GameState, p: number, group: number): void {
  state.cities.forEach((c, i) => {
    if (c.status !== -1 && c.owner === p && (group === -1 || groupAt(state, c.x, c.y) === group)) aiChangeCityProduction(state, i);
  });
}

/** ChangeCityProduction. */
export function aiChangeCityProduction(state: GameState, cityId: number): void {
  const c = state.cities[cityId]!;
  const pl = state.players[c.owner]!;
  if (c.production >= 0) pl.unitsInProduction[c.production]!--;
  c.production = aiSelectProduction(state, c.owner, cityId);
  if (c.production >= 0) pl.unitsInProduction[c.production]!++;
}

/** UnitChooseNewDirection: kierunek statku z największą liczbą wolnych pól lądu obok. */
function chooseLandingDirection(state: GameState, p: number, x: number, y: number): number {
  let best = -1;
  let count = -1;
  for (let i = 0; i < 9; i++) {
    const [dx, dy] = DIRECTIONS[i]!;
    const nx = x + dx;
    const ny = y + dy;
    if (!isValid(nx, ny) || terrainAt(state.map, nx, ny) !== Terrain.Water || (i !== 0 && occupantPlayer(state, nx, ny) !== -1)) continue;
    let n = 0;
    for (let j = 1; j < 9; j++) {
      const [ex, ey] = DIRECTIONS[j]!;
      if (!isValid(nx + ex, ny + ey) || terrainAt(state.map, nx + ex, ny + ey) === Terrain.Water || occupantPlayer(state, nx + ex, ny + ey) !== -1) continue;
      n++;
      const owner = landOwner(state, nx + ex, ny + ey);
      if (owner !== p && owner < 8 && state.players[p]!.diplomacy[owner]! & Diplomacy.Peace) n--;
    }
    if (n > count) {
      count = n;
      best = i;
    }
  }
  return best;
}

function canIrrigateCell(state: GameState, x: number, y: number): boolean {
  if (terrainAt(state.map, x, y) === Terrain.River) return true;
  for (let d = 1; d < 9; d += 2) {
    const [dx, dy] = DIRECTIONS[d]!;
    if (!isValid(x + dx, y + dy)) continue;
    const t = terrainAt(state.map, x + dx, y + dy);
    const v = imp(state, x + dx, y + dy);
    if (!(v & 1) && (t === Terrain.Water || t === Terrain.River || v & 2)) return true;
  }
  return false;
}

/** GetPreferredImprovement: nawadnianie albo kopalnia na polu bez ulepszeń. */
function preferredImprovement(state: GameState, x: number, y: number): number {
  if (imp(state, x, y) & (Improvement.City | Improvement.Irrigation | Improvement.Mine)) return 0;
  const m = TERRAIN_MODIFICATIONS[terrainAt(state.map, x, y)]!;
  if (m.miningEffect > -3) return m.irrigationEffect === -2 && canIrrigateCell(state, x, y) ? Improvement.Irrigation : 0;
  return Improvement.Mine;
}

/**
 * Rozkaz komputera dla jednostki (AIEngine.MoveUnit): liczba 1–8 = ruch, 0 = kontynuuj „idź do”,
 * litera = rozkaz jak z klawiatury.
 */
export type AiCommand = number | 'b' | 'f' | 'r' | 'i' | 'm' | 'p' | 'P' | 'u' | 'h' | ' ';

export function aiUnitCommand(state: GameState, p: number, unitId: number): AiCommand {
  if (p === 0) return barbarianCommand(state, p, unitId);
  const pl = state.players[p]!;
  const unit = pl.units[unitId]!;
  const def = UNITS[unit.type]!;
  const human = state.players[state.humanPlayer]!;
  if (unit.type === 15 && unit.specialMoves <= 0) return 'h';
  if (def.turnsOutside !== 0 && (unit.type !== 14 || unit.gotoX === -1)) {
    if ((def.moves >> 1) * 3 >= unit.movesLeft) return 'h';
    let best = Number.MAX_SAFE_INTEGER;
    let target = -1;
    human.units.forEach((h, i) => {
      if (h.type !== 15 || !(h.visibleBy & (1 << p))) return;
      const d = distance(unit.x, unit.y, h.x, h.y);
      if (d < best) {
        best = d;
        target = i;
      }
    });
    if (target !== -1 && best > 1) {
      const t = human.units[target]!;
      if (def.moves > best) {
        unit.gotoX = t.x;
        unit.gotoY = t.y;
      } else {
        let cbest = Number.MAX_SAFE_INTEGER;
        let city = -1;
        state.cities.forEach((c, i) => {
          if (c.status === -1 || c.owner !== p || def.moves < distance(unit.x, unit.y, c.x, c.y)) return;
          const d = distance(t.x, t.y, c.x, c.y);
          if (d < cbest) {
            cbest = d;
            city = i;
          }
        });
        if (city === -1) return ' ';
        unit.gotoX = state.cities[city]!.x;
        unit.gotoY = state.cities[city]!.y;
      }
    }
  }
  const ux = unit.x;
  const uy = unit.y;
  let role: number = def.role;
  const isNear = unitNear(state, p, ux, uy);
  let nearCity = nearestCity(state, ux, uy);
  const nearCityDist = nearCity !== -1 ? distance(ux, uy, state.cities[nearCity]!.x, state.cities[nearCity]!.y) : Number.MAX_SAFE_INTEGER;
  const nearUnit = nearestPlayerUnit(state, p, unitId, ux, uy);
  const nearUnitDist = nearUnit === -1 ? Number.MAX_SAFE_INTEGER : distance(ux, uy, pl.units[nearUnit]!.x, pl.units[nearUnit]!.y);
  const t = terrainAt(state.map, ux, uy);
  const g = groupAt(state, ux, uy);
  const strategy = pl.continents[g]!.strategy;
  const nearCityOwner = nearCity !== -1 ? state.cities[nearCity]!.owner : -1;

  if (unit.type === 25) {
    let bestScore = -1;
    state.cities.forEach((c, i) => {
      let score = -1;
      if (c.status !== -1 && !hasBuilding(c, BuildingId.SdiDefense)) {
        const o = c.owner;
        const mp = pl.militaryPower;
        if (mp * 3 < state.players[o]!.militaryPower * 2 || pl.diplomacy[o]! & Diplomacy.Vendetta ||
          (state.players[o]!.activeUnits[25] === 0 && mp < state.players[o]!.militaryPower * 2)) {
          if ((pl.diplomacy[o]! & (Diplomacy.Peace | Diplomacy.TributeDemanded)) === Diplomacy.TributeDemanded && c.size > 4) {
            score = 0;
            for (let d = 0; d < 9; d++) {
              const [dx, dy] = DIRECTIONS[d]!;
              if (!isValid(c.x + dx, c.y + dy)) continue;
              const occ = occupantPlayer(state, c.x + dx, c.y + dy);
              if (occ === -1) continue;
              if ((pl.diplomacy[occ]! & (Diplomacy.Peace | Diplomacy.TributeDemanded)) !== Diplomacy.TributeDemanded) score -= occ === p ? 2 : 99;
              else score++;
            }
            score += c.size >> 1;
          }
        }
      }
      if (score > bestScore && state.cities.some((o) => (o.status !== -1 && o.owner === p) || distance(c.x, c.y, o.x, o.y) < 17)) {
        bestScore = score;
        nearCity = i;
      }
    });
    if (bestScore < 10 || pl.activeUnits[25]! < 2) return ' ';
    const target = state.cities[nearCity]!;
    unit.gotoX = target.x;
    unit.gotoY = target.y;
    // L11c8–L129b: rakieta przenosi się od razu na pierwsze wolne pole obok celu i zwraca kierunek „do celu” jako
    // kierunek pola XOR 4 — jak w oryginale, więc dla kierunku 4 wychodzi 0 (dalej „idź do”), a dla 8 — 12
    // (pole z pierścienia 49 kierunków).
    for (let d = 1; d < 9; d++) {
      const [dx, dy] = DIRECTIONS[d]!;
      const nx = wrapX(target.x + dx);
      const ny = target.y + dy;
      if (!isValid(nx, ny) || occupantPlayer(state, nx, ny) !== -1) continue;
      placeUnit(state, p, unitId, nx, ny);
      if (target.owner === state.humanPlayer) pl.contactCountdown = -2;
      return d ^ 4;
    }
    return ' ';
  }

  if (unit.type === 26) {
    if (unit.gotoX === -1) {
      if (nearCity !== -1 && nearCityOwner !== p) {
        unit.gotoX = state.cities[nearCity]!.x;
        unit.gotoY = state.cities[nearCity]!.y;
        return 0;
      }
      deleteUnit(state, p, unitId);
      return ' ';
    }
    return 0;
  }

  if (role === R.Settle) clearContinentPolicies(state, p, R.Settle, ux, uy, 0);
  let owner = landOwner(state, ux, uy);
  if (owner !== 0 && (role === NONE || role === R.Settle || role === R.LandAttack || role === R.Defense)) {
    let dir = 0;
    for (let d = 1; d < 9; d++) {
      const [dx, dy] = DIRECTIONS[d]!;
      const nx = wrapX(ux + dx);
      const ny = uy + dy;
      if (!isValid(nx, ny)) continue;
      const o = landOwner(state, nx, ny);
      if (o > owner) {
        owner = o;
        dir = d;
      }
      if (cellHasHut(state, nx, ny) && role !== R.Settle) return d;
    }
    if (state.turn === 0 && state.earth) {
      owner = 15;
      dir = 0;
    }
    if (owner > 9 && 15 - nearCityDist <= owner && !isNear) {
      if (role === R.Settle) return dir !== 0 ? dir : 'b';
      addContinentPolicy(state, p, ux, uy, R.Settle, 2);
    }
  }
  const score = state.map.buildScore[cellIndex(ux, uy)]!;
  if (role === R.Settle && state.difficulty !== 0 && nearCityOwner === state.humanPlayer && !isNear && nearCityDist > 1 &&
    p !== nearCityOwner && pl.techCount < human.techCount && score > 8 && 14 - nearCityDist <= score) return 'b';

  if (imp(state, ux, uy) & Improvement.City) {
    if (role === R.Defense) {
      if (others(state, p, unitId).length > 0) {
        const saved = unit.type;
        unit.type = 26;
        const best = bestDefender(state, p, ux, uy);
        unit.type = saved;
        if (best !== -1 && best !== unitId && UNITS[pl.units[best]!.type]!.defense < def.defense) return 'f';
        let k = unitOrCityNear(state, p, ux, uy) ? 3 : 4;
        const city = state.cities[nearCity]!;
        if (hasBuilding(city, BuildingId.Palace)) k--;
        else if (strategy === R.Settle) k++;
        const defenders = stackRoleCount(state, p, unitId, R.Defense);
        if (Math.trunc(city.size / k) + 1 > defenders) addUnitPolicy(state, p, ux, uy, R.Defense, 2);
        if (Math.trunc(city.size / k) + 1 >= defenders) return 'f';
        const saveStatus = unit.status;
        unit.status |= UnitStatus.Fortified;
        if (bestDefender(state, p, ux, uy) === unitId && Math.trunc(city.size / k) + 1 > stackSum(state, p, unitId, 'defenseUnits')) {
          unit.status = saveStatus;
          return 'f';
        }
        unit.status = saveStatus;
        if (((unitId + state.turn) & 7) === 0) unit.status &= ~(UnitStatus.Sentry | UnitStatus.Fortifying | UnitStatus.Fortified);
      } else return 'f';
    } else if (nearUnitDist > 0 && role !== R.Settle) {
      addUnitPolicy(state, p, ux, uy, R.Defense, 4);
      return ' ';
    }
  }

  if (role === R.SeaTransport || role === R.SeaAttack) {
    const r = seaUnit(state, p, unitId, role, strategy, isNear, nearCity, nearCityDist, g);
    if (r !== undefined) return r;
  }

  if (def.moves < 2 && nearCityDist < 4 && nearCityOwner === state.humanPlayer && !(human.diplomacy[p]! & Diplomacy.Peace) &&
    imp(state, ux, uy) & (Improvement.Irrigation | Improvement.Mine) && nearCityOwner !== p) return 'P';

  if (role === R.Settle) {
    const r = settlerWork(state, p, unitId, t, nearCity, nearCityDist, nearUnitDist, strategy, g);
    if (r !== undefined) return r;
  }

  if (unit.gotoX !== -1 && (role !== R.SeaAttack || !enemyNear(state, p, ux, uy))) return 0;
  if (role === R.Defense && t !== Terrain.Water) {
    if (nearUnitDist > 1 && nearCityDist < 4 && nearCityOwner === p) return 'f';
    if (isNear && nearUnitDist !== 0) return 'f';
  }
  if (role === R.Settle && pl.continents[g]!.cityCount > Math.trunc(state.map.continents[g]!.buildSiteCount / 8)) {
    const city = state.cities[nearCity];
    if (city && nearCityDist === 0 && city.size < 10) return 'b';
    if (city && city.owner === p && city.size < 10) {
      unit.gotoX = city.x;
      unit.gotoY = city.y;
      return 0;
    }
  }

  // ── wybór kierunku (ocena 8 sąsiednich pól) ──
  let bestScore = -999;
  let bestDir = 0;
  let clearOfEnemies = false;
  if (unitOrCityNear(state, p, ux, uy)) unit.gotoNextDirection = -1;
  else clearOfEnemies = true;
  if (unit.type === 1 && strategy === R.LandAttack) role = R.LandAttack;
  let towardEnemy = false;
  for (let d = 1; d < 9; d++) {
    const [dx, dy] = DIRECTIONS[d]!;
    const nx = wrapX(ux + dx);
    const ny = uy + dy;
    if (!isValid(nx, ny)) continue;
    const nOwner = cellOwner(state, nx, ny);
    const nt = terrainAt(state.map, nx, ny);
    if (nt === Terrain.Water && def.movementType === MovementType.Land) continue;
    let other = activeUnitAt(state, nx, ny);
    const otherPlayer = occupantPlayer(state, nx, ny);
    if (other !== -1 && state.players[otherPlayer]!.units[other]!.type === 26) {
      const alt = unitsAt(state, otherPlayer, nx, ny).find((i) => state.players[otherPlayer]!.units[i]!.type !== 26);
      if (alt !== undefined) other = alt;
    }
    if (!((!isNear || def.movementType !== MovementType.Land || other !== -1 || !unitNear(state, p, nx, ny) ||
      unit.type === 26 || unit.type === 27 || t === Terrain.Water) &&
      (t !== Terrain.Water || def.movementType !== MovementType.Land || other === -1 || nOwner === p))) continue;
    let allowed = false;
    if (def.movementType !== MovementType.Water) {
      if (other === -1 || nOwner !== p || stackSum(state, otherPlayer, other, 'count') < 2) allowed = true;
    } else if (nt !== Terrain.Water) {
      if (other !== -1 && nOwner !== p && unit.type !== 22 && t === Terrain.Water) allowed = true;
    } else if (other === -1 || nOwner !== p || stackSum(state, otherPlayer, other, 'count') < 2) allowed = true;
    if (!allowed) continue;

    let s = 0;
    if (role !== R.Settle) {
      if (unit.visibleBy !== 0 || t === Terrain.Water) {
        s = state.rng.next(5);
        if (other !== -1 && nOwner === p) {
          if (role === R.LandAttack) s += Math.trunc((stackSum(state, p, other, 'defense') * 4) / (stackSum(state, p, other, 'count') + 1));
          if (role === R.Defense) s += Math.trunc((stackSum(state, p, other, 'attack') * 2) / (stackSum(state, p, other, 'defense') + 1));
        } else {
          s += TERRAIN[nt]!.defenseBonus * 4;
        }
      } else if (role !== R.LandAttack) {
        s = state.rng.next(3) - TERRAIN[nt]!.defenseBonus;
      } else {
        s = state.rng.next(3) - TERRAIN[nt]!.movementCost * 2;
      }
      if (def.movementType === MovementType.Air) s = state.rng.next(3);
    } else if (t === Terrain.Water && unitOrCityNear(state, p, nx, ny)) continue;
    if (unit.gotoNextDirection !== -1) {
      let k = Math.abs(unit.gotoNextDirection - d);
      if (k > 4) k = 8 - k;
      s -= k * k * 2;
    }
    let enemyCity = false;
    let check = false;
    if (other === -1) {
      check = true;
      if (imp(state, nx, ny) & Improvement.City && nOwner !== p) s = 999;
      if (cellHasHut(state, nx, ny)) s += 20;
    } else if (nOwner !== p) {
      enemyCity = true;
      if (role !== R.Settle) {
        if (pl.diplomacy[nOwner]! & Diplomacy.Peace) {
          // L2c6a–L2d50: przekupienie ufortyfikowanej jednostki sąsiada, który nie walczy z człowiekiem (F22_0000_0639)
          if (role === R.LandAttack && strategy === R.LandAttack && def.movementType === MovementType.Land &&
            state.players[otherPlayer]!.units[other]!.status & UnitStatus.Fortified &&
            (pl.diplomacy[state.humanPlayer]! & (Diplomacy.Contact | Diplomacy.Peace)) === Diplomacy.Contact &&
            (state.players[otherPlayer]!.diplomacy[state.humanPlayer]! & (Diplomacy.Contact | Diplomacy.Peace)) !== Diplomacy.Contact &&
            human.continents[g]!.cityCount !== 0 && stackSum(state, otherPlayer, other, 'count') < 2 &&
            (state.rng.next(8) === 0 || (nearCity !== -1 && state.cities[nearCity]!.owner === state.humanPlayer)) &&
            !(imp(state, nx, ny) & Improvement.City)) {
            bribeUnit(state, p, otherPlayer, other);
          }
        } else {
          other = bestDefender(state, otherPlayer, nx, ny);
          const target = state.players[otherPlayer]!.units[other]!;
          if (UNITS[target.type]!.movementType !== MovementType.Air || unit.type === 14 || imp(state, nx, ny) & Improvement.City) {
            let a = attackOdds(state, p, unitId, otherPlayer, other);
            a = (stackSum(state, otherPlayer, other, 'cost') + 1) * a;
            a = Math.trunc(a / def.cost);
            if (imp(state, nx, ny) & Improvement.City) a *= 3;
            if (role === R.LandAttack && strategy === R.LandAttack) a *= 3;
            if (role === R.LandAttack && def.attack * 2 < stackSum(state, p, unitId, 'attack')) a *= 2;
            if ((p !== 0 ? 6 : 12) > a) {
              s -= 999;
              // L2bbd–L2c56: przekupienie weterana albo ufortyfikowanej jednostki w terenie obronnym (F22_0000_0639)
              const tu = state.players[otherPlayer]!.units[other]!;
              if (role === R.LandAttack && strategy === R.LandAttack && def.movementType === MovementType.Land &&
                tu.status & (UnitStatus.Veteran | UnitStatus.Fortified) && TERRAIN[nt]!.defenseBonus >= 4 &&
                stackSum(state, otherPlayer, other, 'count') < 2 && state.rng.next(4) === 0 && !(imp(state, nx, ny) & Improvement.City)) {
                bribeUnit(state, p, otherPlayer, other);
              }
            } else s += a * 4; // L2b9d: dodatek tylko powyżej progu
            check = true;
          }
        }
      } else {
        s -= def.defense;
        check = true;
      }
    }
    if (!check) continue;
    if (clearOfEnemies) {
      const fx = ux + dx * 4;
      const fy = uy + dy * 4;
      if (isValid(fx, fy) && getMapUnitRoles(Math.trunc(wrapX(fx) / 4), Math.trunc(fy / 4)) === 0 && terrainAt(state.map, fx, fy) !== Terrain.Water) s += 8;
      for (let j = 1; j < 9; j++) {
        const [ex, ey] = DIRECTIONS[j]!;
        const ax = wrapX(fx + ex);
        const ay = fy + ey;
        if (!isValid(ax, ay)) continue;
        if (!(state.map.explored[cellIndex(ax, ay)]! & (1 << p)) && (terrainAt(state.map, ax, ay) !== Terrain.Water || def.movementType === MovementType.Water)) s += 2;
        if (activeUnitAt(state, ax, ay) !== -1) s -= 2;
        if (role === R.Settle) s += TERRAIN[terrainAt(state.map, ax, ay)]!.food;
      }
    }
    if (enemyCity && unit.movesLeft < 3) {
      s = Math.trunc((stackSum(state, p, unitId, 'defense') * s) / Math.min(99, Math.max(1, stackSum(state, p, unitId, 'attack'))));
    }
    if (s > bestScore) {
      bestScore = s;
      bestDir = d;
      towardEnemy = enemyCity;
    }
  }
  if (towardEnemy && unit.movesLeft < 3) bestDir = 0;
  unit.gotoNextDirection = bestDir;
  return bestDir === 0 ? ' ' : bestDir;
}

/** Część MoveUnit dla statków (transport i atak morski). */
function seaUnit(state: GameState, p: number, unitId: number, role: number, strategy: number, isNear: boolean,
  nearCity: number, nearCityDist: number, g: number): AiCommand | undefined {
  const pl = state.players[p]!;
  const unit = pl.units[unitId]!;
  const ux = unit.x;
  const uy = unit.y;
  let fortified = 0;
  let roleBits = 0;
  let cargo = 0;
  for (const i of others(state, p, unitId)) {
    const o = pl.units[i]!;
    if (!(o.status & UnitStatus.Fortified)) {
      roleBits |= 1 << UNITS[o.type]!.role;
      if (UNITS[o.type]!.movementType === MovementType.Land) cargo++;
    } else if (strategy === R.SeaTransport && nearCity >= 0 && Math.trunc(state.cities[nearCity]!.size / 5) < fortified++) {
      o.status &= ~UnitStatus.Fortified;
      cargo++;
    }
  }
  if (((nearCityDist !== 0 ? 1 : 3) > cargo || roleBits === 1) && role === R.SeaTransport) {
    let best = 999;
    let destStrategy: number = R.Settle;
    state.cities.forEach((c) => {
      if (c.status === -1 || c.owner !== p || !(c.status & CityStatus.WaterAccess)) return;
      let d = distance(ux, uy, c.x, c.y);
      const cg = groupAt(state, c.x, c.y);
      if (pl.continents[cg]!.attack < 16) return;
      const a = activeUnitAt(state, c.x, c.y);
      if (a !== -1 && (d < 1 ? 1 : 0) < stackRoleCount(state, p, a, R.SeaTransport)) d += 16;
      if (pl.continents[cg]!.strategy !== R.SeaTransport) d += 16;
      else d -= pl.continents[cg]!.defense >> 2;
      if (d < best) {
        best = d;
        unit.gotoX = c.x;
        unit.gotoY = c.y;
        destStrategy = pl.continents[cg]!.strategy;
      }
    });
    const pol = destStrategy === R.SeaTransport ? 4 : 2;
    if (pol * 3 >= best) {
      if (destStrategy !== R.Settle) addUnitPolicy(state, p, unit.gotoX, unit.gotoY, R.Settle, pol);
      if (destStrategy !== R.Defense) addUnitPolicy(state, p, unit.gotoX, unit.gotoY, R.Defense, pol);
      if (destStrategy !== R.LandAttack) addUnitPolicy(state, p, unit.gotoX, unit.gotoY, R.LandAttack, pol);
    }
    return undefined;
  }
  if (role === R.SeaTransport) {
    for (let d = 1; d < 9; d++) {
      const [dx, dy] = DIRECTIONS[d]!;
      const nx = wrapX(ux + dx);
      const ny = uy + dy;
      if (!isValid(nx, ny) || terrainAt(state.map, nx, ny) === Terrain.Water) continue;
      const occ = occupantPlayer(state, nx, ny);
      if (!((occ === -1 || occ === p) && (occ !== p || stackSum(state, p, activeUnitAt(state, nx, ny), 'count') < 2))) continue;
      if (pl.diplomacy[state.humanPlayer]! & Diplomacy.Peace && cellOwner(state, nx, ny) === state.humanPlayer &&
        imp(state, nx, ny) & (Improvement.City | Improvement.Irrigation | Improvement.Mine | Improvement.Road)) continue;
      const ng = groupAt(state, nx, ny);
      let land = (pl.continents[ng]!.attack < 16 && pl.continents[ng]!.strategy !== R.SeaTransport) ||
        (((1 << pl.continents[ng]!.strategy) & roleBits) & 6) !== 0;
      if (unit.gotoX !== -1 && groupAt(state, unit.gotoX, unit.gotoY) === ng) land = true;
      if (land && state.map.continents[ng]!.buildSiteCount > 4 && ny > 1 && ny < 48) {
        if (unit.movesLeft > 3) {
          const nd = chooseLandingDirection(state, p, ux, uy);
          if (nd > 0) return nd;
        }
        if (pl.continents[ng]!.strategy === R.LandAttack) addUnitPolicy(state, p, ux, uy, R.SeaAttack, 5);
        unit.movesLeft = 0;
        unit.gotoX = unit.gotoY = -1;
        return 'u';
      }
      if ((state.turn & 3) === 0) unit.gotoX = unit.gotoY = -1;
      break;
    }
    if (unit.movesLeft < 4 && unit.gotoX !== -1) {
      const mx = Math.trunc((ux + unit.gotoX) / 2);
      const my = Math.trunc((uy + unit.gotoY) / 2);
      if (terrainAt(state.map, mx, my) === Terrain.Water) addUnitPolicy(state, p, mx, my, R.SeaAttack, 3);
    }
  }
  if (!isNear || role === R.SeaTransport) {
    if (unit.gotoX === -1 && (roleBits & 2 || !(roleBits & 1)) && unit.type !== 16) {
      let best = 999;
      for (let i = state.turn & 7; i < 128; i += 8) {
        const c = state.cities[i]!;
        if (c.status === -1 || c.owner === p || (pl.diplomacy[c.owner]! & (Diplomacy.Peace | Diplomacy.PeaceTreaty)) === Diplomacy.Peace) continue;
        if (state.players[state.humanPlayer]!.ranking < 7 || c.owner === state.humanPlayer) {
          const d = distance(ux, uy, c.x, c.y);
          if (d < best) {
            best = d;
            unit.gotoX = c.x;
            unit.gotoY = c.y;
          }
        }
      }
    }
    if (unit.gotoX === -1 && unit.type !== 16) {
      let best = 999;
      const own = terrainAt(state.map, ux, uy) !== Terrain.Water ? g : -1;
      state.cities.forEach((c) => {
        if (c.status === -1 || c.owner !== p) return;
        let d = distance(ux, uy, c.x, c.y);
        if (d < 8) return;
        const cg = groupAt(state, c.x, c.y);
        if (cg === own || pl.continents[cg]!.strategy === R.SeaTransport) return;
        if ((((1 << pl.continents[cg]!.strategy) & roleBits) & 7) === 0) d *= 2;
        if (d < best) {
          best = d;
          unit.gotoX = c.x;
          unit.gotoY = c.y;
        }
      });
    }
    if (unit.gotoX === -1) {
      for (let i = 2; i < 24; i++) {
        const [dx, dy] = DIRECTIONS[state.rng.next(9)]!;
        const nx = wrapX(dx * i + ux);
        const ny = dy * i + uy;
        if (ny > 2 && ny < 47 && terrainAt(state.map, nx, ny) !== Terrain.Water && pl.continents[groupAt(state, nx, ny)]!.cityCount === 0) {
          unit.gotoX = nx;
          unit.gotoY = ny;
          break;
        }
      }
    }
  }
  return undefined;
}

/** Część MoveUnit dla osadników: prace przy mieście, drogi, szukanie miejsca. */
function settlerWork(state: GameState, p: number, unitId: number, t: number, nearCity: number, nearCityDist: number,
  nearUnitDist: number, strategy: number, g: number): AiCommand | undefined {
  const pl = state.players[p]!;
  const unit = pl.units[unitId]!;
  const ux = unit.x;
  const uy = unit.y;
  const city = nearCity !== -1 ? state.cities[nearCity]! : undefined;
  if (t === Terrain.Water) {
    if (unit.gotoX !== -1) return 0;
    const [dx, dy] = DIRECTIONS[state.rng.next(20) + 1]!;
    if (isValid(wrapX(ux + dx), uy + dy) && (getMapUnitRoles(Math.trunc(ux / 4) + dx, Math.trunc(uy / 4) + dy) & 3) === 0) {
      const gx = ux + dx * 4;
      const gy = uy + dy * 4;
      if (isValid(gx, gy) && TERRAIN[terrainAt(state.map, gx, gy)]!.production !== 0 && groupAt(state, gx, gy) === g) {
        unit.gotoX = wrapX(gx);
        unit.gotoY = gy;
        return 0;
      }
    }
    return undefined;
  }
  if (nearUnitDist > 1) addUnitPolicy(state, p, ux, uy, R.Defense, 2);
  const monarchy = playerHasTech(state, p, Tech.Monarchy);
  const mod = TERRAIN_MODIFICATIONS[t]!;
  if ((!monarchy ? mod.aiBeforeMonarchy : mod.aiAfterMonarchy) || strategy === R.SeaTransport) {
    if (city && nearCityDist > 0 && nearCityDist <= 2 && city.owner === p &&
      (city.size >= 3 || t !== Terrain.Hills || hasSpecialResource(ux, uy, state.mapSeed))) {
      const pref = preferredImprovement(state, ux, uy);
      if (pref === Improvement.Irrigation) {
        unit.gotoX = unit.gotoY = -1;
        return 'i';
      }
      if (pref === Improvement.Mine) {
        unit.gotoX = unit.gotoY = -1;
        return 'm';
      }
      const v = imp(state, ux, uy);
      if (!(v & Improvement.Road) && (v & (Improvement.Irrigation | Improvement.Mine) ||
        t === Terrain.Desert || t === Terrain.Plains || t === Terrain.Grassland)) {
        unit.gotoX = unit.gotoY = -1;
        return 'r';
      }
      if ((v & (Improvement.Road | Improvement.Railroad)) !== (Improvement.Road | Improvement.Railroad) && playerHasTech(state, p, Tech.RailRoad) &&
        (v & Improvement.Road ? 1 : 2) <= tileShields(state, ux, uy)) {
        unit.gotoX = unit.gotoY = -1;
        return 'r';
      }
    }
  }
  if (imp(state, ux, uy) & Improvement.Pollution) return 'p';
  if (unit.gotoX !== -1 && (NATIONS[pl.nation]!.policy + 1) * state.map.continents[g]!.buildSiteCount > pl.continents[g]!.cityCount * 16) return 0;
  if (city && nearCityDist <= 1 && city.owner === p) {
    for (let i = 1; i < 9; i++) {
      const [dx, dy] = DIRECTIONS[((i + state.turn) & 7) + 1]!;
      const nx = wrapX(dx + ux);
      const ny = dy + uy;
      if (!isValid(nx, ny)) continue;
      const a = activeUnitAt(state, nx, ny);
      const ap = occupantPlayer(state, nx, ny);
      if (a !== -1 && !(p === ap && !unitsAt(state, p, nx, ny).some((k) => pl.units[k]!.type === 0))) continue;
      const nm = TERRAIN_MODIFICATIONS[terrainAt(state.map, nx, ny)]!;
      if ((monarchy ? nm.aiAfterMonarchy : nm.aiBeforeMonarchy) && preferredImprovement(state, nx, ny) !== 0 &&
        (city.size >= 3 || terrainAt(state.map, nx, ny) !== Terrain.Hills || hasSpecialResource(nx, ny, state.mapSeed)) &&
        distanceOf(nx - city.x, ny - city.y) <= 2) { // F0_2dc4_0208 wprost na różnicach (0x25fb:0x2275), bez zawijania X
        unit.gotoX = nx;
        unit.gotoY = ny;
        return 0;
      }
    }
  }
  if ((!(imp(state, ux, uy) & Improvement.Road) && t !== Terrain.River) || playerHasTech(state, p, Tech.BridgeBuilding)) {
    if (city && city.owner === p) {
      if (nearCityDist > 2 || (t !== Terrain.Plains && t !== Terrain.Grassland)) {
        let neighbourRoad = false;
        let roads = 0;
        let bits = 0;
        for (let i = 1; i < 9; i++) {
          const [dx, dy] = DIRECTIONS[i]!;
          const nx = wrapX(ux + dx);
          const ny = uy + dy;
          if (!isValid(nx, ny) || !(imp(state, nx, ny) & Improvement.Road)) continue;
          bits |= 1 << (i - 1);
          roads++;
          if (imp(state, nx + dx, ny + dy) & Improvement.Road) neighbourRoad = true;
        }
        bits &= bits >> 4;
        if (roads < 4) {
          if (bits === 0) {
            if (nearCityDist === 1 && (t === Terrain.Desert || t === Terrain.Plains || t === Terrain.Grassland)) return 'r';
          } else return 'r';
        }
        if (roads === 1 && neighbourRoad && TERRAIN[t]!.movementCost === 1) return 'r';
      } else return 'r';
    }
  }
  return undefined;
}

function tileShields(state: GameState, x: number, y: number): number {
  const t = terrainAt(state.map, x, y);
  let n = TERRAIN[hasSpecialResource(x, y, state.mapSeed) ? t + 12 : t]!.production;
  if (imp(state, x, y) & Improvement.Mine) n += -1 - TERRAIN_MODIFICATIONS[t]!.miningEffect;
  return Math.max(0, n);
}

/** MoveBarbarianUnit. */
function barbarianCommand(state: GameState, p: number, unitId: number): AiCommand {
  const pl = state.players[p]!;
  const unit = pl.units[unitId]!;
  const def = UNITS[unit.type]!;
  const ux = unit.x;
  const uy = unit.y;
  if (uy < 2 || uy >= 48) {
    deleteUnit(state, p, unitId);
    return ' ';
  }
  const nearCity = nearestCity(state, ux, uy);
  if (nearCity === -1) {
    deleteUnit(state, p, unitId);
    return ' ';
  }
  const city = state.cities[nearCity]!;
  const nearDist = distance(ux, uy, city.x, city.y);
  if (def.role === R.SeaTransport) {
    if (others(state, p, unitId).length === 0) {
      deleteUnit(state, p, unitId);
      return ' ';
    }
    for (let d = 1; d < 9; d++) {
      const [dx, dy] = DIRECTIONS[d]!;
      const nx = wrapX(ux + dx);
      const ny = uy + dy;
      if (nearDist <= 8 && terrainAt(state.map, nx, ny) !== Terrain.Water && terrainAt(state.map, nx, ny) >= 0 && !(imp(state, nx, ny) & Improvement.City) &&
        occupantPlayer(state, nx, ny) === -1 && ny > 1 && ny < 48) {
        if (state.map.explored[cellIndex(nx, ny)]! & (1 << state.humanPlayer) && city.owner === state.humanPlayer &&
          groupAt(state, nx, ny) === groupAt(state, city.x, city.y)) {
          unit.visibleBy |= 1 << state.humanPlayer;
          const near2 = nearestCity(state, nx, ny);
          state.events.push({ kind: 'message', style: 'defense', x: nx, y: ny,
            text: `Barbarian raiding party\nlands near ${state.cityNames[state.cities[near2]!.nameId]}!\nCitizens are alarmed.\n` });
        }
        unit.visibleBy |= state.map.explored[cellIndex(nx, ny)]!;
        unit.movesLeft = 0;
        return 'u';
      }
      if (isValid(nx, ny) && occupantPlayer(state, nx, ny) > 0) return d;
    }
    if (unit.gotoX === -1) {
      let best = 0;
      let target = -1;
      state.cities.forEach((c, i) => {
        if (c.status === -1) return;
        const profit = Math.trunc((cityTreasury(state, i) + 50) / (distance(ux, uy, c.x, c.y) + 1));
        if (profit > best) {
          best = profit;
          target = i;
        }
      });
      if (best === 0) {
        deleteUnit(state, p, unitId);
        return ' ';
      }
      unit.gotoX = state.cities[target]!.x;
      unit.gotoY = state.cities[target]!.y;
      return 0;
    }
  }
  let nearestDist = nearDist;
  const nearPlayer = city.owner;
  if (nearDist === 0 && (others(state, p, unitId).length === 0 || def.role === R.Defense)) return 'f';
  let xStep = -2;
  let yStep = -2;
  if (((unitId + state.turn) & 3) === 0 && (groupAt(state, ux, uy) !== groupAt(state, city.x, city.y) || nearDist > 8)) {
    deleteUnit(state, p, unitId);
    return ' ';
  }
  if (groupAt(state, ux, uy) === groupAt(state, city.x, city.y) && city.owner === state.humanPlayer) {
    yStep = Math.sign(city.x - ux);
    xStep = Math.sign(city.y - uy);
  }
  if (p === nearPlayer || (state.players[nearPlayer]!.cityCount < 2 && state.players[nearPlayer]!.gold < 100)) {
    xStep = -2;
    yStep = -2;
  }
  if (yStep !== -2) {
    // kierunek do miasta z GoTo oryginału (F0_2e31_000e), potem cel zostaje skasowany
    unit.gotoX = city.x;
    unit.gotoY = city.y;
    unit.gotoNextDirection = getNextMove(state, p, unitId);
  }
  unit.gotoX = unit.gotoY = -1;
  if (unit.type === 26) {
    const t = terrainAt(state.map, ux, uy);
    const rest = others(state, p, unitId);
    if (rest.length > 0 && t !== Terrain.Water && pl.units[rest[0]!]!.type !== 26) return ' ';
    if (t === Terrain.Water) {
      if (nearDist < 3) {
        deleteUnit(state, p, unitId);
        return ' ';
      }
    } else {
      const pu = nearestPlayerUnit(state, p, unitId, ux, uy);
      if (pu !== -1) {
        const d = distance(ux, uy, pl.units[pu]!.x, pl.units[pu]!.y);
        nearestDist = d;
        if (d < 4 && pl.units[pu]!.type !== 26) {
          unit.gotoX = pl.units[pu]!.x;
          unit.gotoY = pl.units[pu]!.y;
          return 0;
        }
      }
      if ((state.turn & 7) + 4 <= nearDist) {
        deleteUnit(state, p, unitId);
        return ' ';
      }
    }
  }
  let dir = 0;
  let best = -999;
  for (let d = 1; d < 9; d++) {
    const [dx, dy] = DIRECTIONS[d]!;
    const nx = wrapX(ux + dx);
    const ny = uy + dy;
    if (!isValid(nx, ny)) continue;
    const nt = terrainAt(state.map, nx, ny);
    if ((def.movementType === MovementType.Water) !== (nt === Terrain.Water)) continue;
    const a = activeUnitAt(state, nx, ny);
    const ap = occupantPlayer(state, nx, ny);
    if (unit.type !== 26) {
      if (!(imp(state, nx, ny) & Improvement.City) || cellOwner(state, nx, ny) === p) {
        let s = state.rng.next(6);
        if (imp(state, nx, ny) & (Improvement.Irrigation | Improvement.Mine)) s += 6;
        if (cellOwner(state, nx, ny) !== p) s += 4;
        let ok = false;
        if (a === -1) ok = true;
        else if (p !== ap) {
          if (terrainAt(state.map, ux, uy) !== Terrain.Water) {
            if (state.players[ap]!.units[a]!.type !== 26) s += 99;
            ok = true;
          }
        } else if (terrainAt(state.map, ux, uy) === Terrain.Water) {
          s -= 20;
          ok = true;
        }
        if (ok && (!unitNear(state, p, ux, uy) || def.movementType !== MovementType.Land || a !== -1 || !unitNear(state, p, nx, ny))) {
          if (unit.gotoNextDirection === d) s += 6;
          if (dx === yStep) s += 2;
          if (dy === xStep) s += 2;
          if (s > best) {
            best = s;
            dir = d;
          }
        }
      } else if (terrainAt(state.map, ux, uy) !== Terrain.Water) return d;
    } else {
      let s = 0;
      if (a !== -1) s += p === ap ? 99 : -99;
      s += TERRAIN[nt]!.movementCost + state.rng.next(4) + nearestDist * 4;
      if (s > best) {
        best = s;
        dir = d;
      }
    }
  }
  if (imp(state, ux, uy) & Improvement.City && others(state, p, unitId).length === 0 && best < 99) return ' ';
  unit.gotoNextDirection = dir;
  return dir === 0 ? ' ' : dir;
}

// ── wybór produkcji (SelectCityProduction, część oceniająca) ───────────────────────────

/** Wartości ProcessCityState(…, -1) potrzebne do oceny produkcji — podpinane z economy.ts. */
export interface CityFigures { food: number; shields: number; trade: number; corruption: number; unitCount: number }
let cityFigures: (state: GameState, cityId: number) => CityFigures = () => ({ food: 0, shields: 0, trade: 0, corruption: 0, unitCount: 0 });
export function setCityFigures(fn: typeof cityFigures): void {
  cityFigures = fn;
}

/** Lista pozycji produkcji jak w SelectCityProduction (indeks 0 = bieżąca produkcja). */
function productionList(state: GameState, p: number, cityId: number): number[] {
  const city = state.cities[cityId]!;
  const has = (t: number) => playerHasTech(state, p, t);
  const list = [city.production];
  UNITS.forEach((u, i) => {
    if (i === 25 && !(state.wonderCity[17] !== -1 && has(Tech.NuclearFission))) return;
    if (has(u.requiredTech) && !has(u.obsoleteTech) && (u.movementType !== MovementType.Water || city.status & CityStatus.WaterAccess)) list.push(i);
  });
  let hoover = false;
  if (playerHasWonder(state, p, WonderId.HooverDam)) {
    const dam = state.cities[state.wonderCity[WonderId.HooverDam]!]!;
    hoover = groupAt(state, city.x, city.y) === groupAt(state, dam.x, dam.y);
  }
  const b = city.buildings;
  for (let i = 1; i < 25; i++) {
    if (!has(BUILDING_TECH[i]!) || b & (1 << (i - 1))) continue;
    if (i === 7 && b & 1) continue;
    if (i === 15 && b & 0x8000) continue;
    if (i === 10 && !(b & 0x10) && has(BUILDING_TECH[5]!)) continue;
    if (i === 12 && !(b & 0x20) && has(BUILDING_TECH[6]!)) continue;
    if (i === 20 && !(city.status & CityStatus.NearRiverOrMountains)) continue;
    if (i === 19 && !(b & 0x4000)) continue;
    if ((i === 19 || i === 20 || i === 21) && (hoover || b & 0x1c0000)) continue;
    if (i > 21 && state.wonderCity[19] === -1) continue;
    list.push(-i);
  }
  for (let w = 1; w < 22; w++) if (has(WONDER_TECH[w]!) && state.wonderCity[w] === -1) list.push(-(w + 24));
  return list;
}

/** Zwraca numer jednostki (≥0) albo -id budynku/cudu; 99 = brak decyzji (człowiek z automatyczną produkcją). */
export function aiSelectProduction(state: GameState, p: number, cityId: number): number {
  const city = state.cities[cityId]!;
  const pl = state.players[p]!;
  if (p === 0) return (state.techFirstDiscoveredBy[Tech.Explosives]! & 7) === 0 ? 3 : 7;
  const fig = cityFigures(state, cityId);
  const list = productionList(state, p, cityId);
  const g = groupAt(state, city.x, city.y);
  const strategy = pl.continents[g]!.strategy;
  const preferUnits = strategy === R.LandAttack || strategy === R.Defense || (state.humanLowest && strategy === R.SeaTransport);
  const settlers = pl.units.filter((u) => u.type === 0 && u.homeCity === cityId).length;
  const govMult = pl.government > Government.Despotism ? fig.food - settlers * 2 - city.size * 2 : fig.food - settlers - city.size * 2;
  const building = new Array<number>(28).fill(1);
  const present = new Array<number>(28).fill(0);
  const savedCount = pl.unitCount;
  pl.unitCount = 0;
  state.cities.forEach((c, i) => {
    if (c.status === -1 || c.owner !== p || groupAt(state, c.x, c.y) !== g) return;
    if (c.production >= 0 && i !== cityId) building[c.production]!++;
    for (const su of c.storedUnits) {
      if (su === -1) continue;
      pl.unitCount++;
      present[su & 0x3f]!++;
    }
  });
  pl.units.forEach((u) => {
    if (u.type === NO_UNIT) return;
    pl.unitCount++;
    if (groupAt(state, u.x, u.y) === g) present[u.type]!++;
  });
  if (pl.unitCount === 0 && p !== state.humanPlayer && pl.government <= Government.Despotism) {
    pl.unitCount = savedCount;
    return 1;
  }
  let militaryNeed = 0;
  const here = activeUnitAt(state, city.x, city.y);
  if (here === -1) militaryNeed = 2;
  else if ((city.size >> 2) + (preferUnits ? 1 : 0) > stackRoleCount(state, occupantPlayer(state, city.x, city.y), here, R.Defense)) militaryNeed = 1;
  let selected = 0;
  let selectedScore = 999;
  let selectedBuilding = -1;
  let selectedBuildingScore = 999;
  const pick = (i: number, id: number, s: number) => {
    if (s < selectedScore) {
      selected = i;
      selectedScore = s;
    }
    if ((id < 0 || id >= 26) && s < selectedBuildingScore) {
      selectedBuildingScore = s;
      selectedBuilding = i;
    }
  };
  const ideology = NATIONS[pl.nation]?.ideology ?? 0;
  list.forEach((id, i) => {
    if (i === 0 || id === 23) return;
    if (id >= 0 && id < 26) {
      const u = UNITS[id]!;
      if (id === 0 && !((pl.government <= Government.Despotism ? 1 : 2) < govMult || (pl.activeUnits[0] === 0 && building[0]! <= 1))) return;
      if (id === 1 && pl.government > Government.Despotism) return;
      if (id === 25 && !(pl.activeUnits[25]! < 4 && pl.unitsInProduction[25]! < 2)) return;
      if (id === 14 && !(pl.activeUnits[14]! + pl.unitsInProduction[14]! < state.players[state.humanPlayer]!.activeUnits[15]! / 2 &&
        !(pl.diplomacy[state.humanPlayer]! & Diplomacy.Peace))) return;
      if (u.movementType !== MovementType.Land && pl.continents[g]!.attack < 8) return;
      let s = u.movementType !== MovementType.Land
        ? Math.trunc((pl.continents[g]!.attack * (pl.unitsInProduction[id]! * 2 + pl.activeUnits[id]!)) / (pl.unitCount + 1))
        : building[id]! * 2 + present[id]!;
      if (!(militaryNeed === 0 || u.role === R.Defense)) return;
      if (militaryNeed !== 0) s = Math.trunc(2 / militaryNeed);
      if (u.role !== R.Defense && u.role !== R.Settle) {
        s *= 2;
        if (strategy !== u.role) s *= 2;
      }
      if (u.role === R.SeaTransport && strategy !== R.SeaTransport) return;
      if (strategy === R.SeaTransport) s = Math.trunc((3 * s) / 2);
      // Wg dosłownego tłumaczenia asemblera (OpenCivOne przed fb7e4c7, Segment_1ade L113c): mnożnik 16 dla
      // wszystkich jednostek poza osadnikami; nowsza wersja wzorca gubi tu czynnik (koszt+2)·ocena.
      // IMUL 16-bit, potem CWD — iloczyn obcinany do 16 bitów ze znakiem.
      const k = id === 0 ? (city.buildings & 4 ? 4 : 6) - ideology : 16;
      s = Math.trunc(int16(k * (u.cost + 2) * s) / ((u.attack + u.defense) * (u.moves + 1)));
      if (u.role === R.SeaAttack) s *= preferUnits ? 4 : 2;
      if (u.movementType === MovementType.Air) s *= 2;
      if (pl.unitCount > 120) s *= 4;
      if ((!preferUnits && fig.shields <= fig.unitCount) || !state.aiMakeContact) s *= 2;
      pick(i, id, s);
      return;
    }
    let s = 999;
    let unitPref = false;
    switch (27 - id) {
      case 0: // Caravan
        if (city.tradeRoutes[2] === -1) {
          s = 10 - (fig.trade >> 1);
          if (city.tradeRoutes[0] !== -1) s += 2;
          if (city.tradeRoutes[1] !== -1) s += 2;
          if (s < 3) s = 3;
        }
        if (p === state.humanPlayer && city.status & CityStatus.AutoProduction) s = 999;
        break;
      case 1: { // Diplomat
        const h = state.players[state.humanPlayer]!;
        if (state.humanPlayer > 0 && !(pl.diplomacy[state.humanPlayer]! & Diplomacy.Peace) && pl.unitsInProduction[26]! <= 0) {
          const word = state.rng.next(5);
          const humanAhead = h.techs.slice(word * 16, word * 16 + 16).some((v, k) => v && !pl.techs[word * 16 + k]);
          if (state.aiFlags & (1 << p) && humanAhead) s = Math.min(10, Math.max(5, pl.techCount - h.techCount + 10));
        }
        break;
      }
      case 29: s = 5; unitPref = true; break; // Barracks
      case 30: s = fig.shields < 3 ? 8 : 4; break; // Granary
      case 31: if (city.status & CityStatus.CivilDisorder) s = -4; break; // Temple
      case 32: s = 10 - (fig.trade >> 1); if (city.status & CityStatus.CivilDisorder) s = -3; break; // MarketPlace
      case 33: case 37: s = 10 - Math.trunc(fig.trade / 3); break; // Library, Bank
      case 34: s = 12 - fig.corruption * 2; break; // Courthouse
      case 35: s = 10 - (city.size >> 1); if (city.buildings & 1) s -= 4; unitPref = true; break; // City Walls
      case 36: if (10 - (govMult >> 1) <= city.size) s = 14 - city.size + (govMult >> 1); break; // Aqueduct
      case 38: if (city.status & CityStatus.CivilDisorder) s = -2; break; // Cathedral
      case 39: s = 10 - (fig.trade >> 2); break; // University
      case 41: if (city.status & CityStatus.CivilDisorder) s = -1; break; // Colosseum
      case 42: case 47: s = 13 - (fig.shields >> 1); break; // Factory, Hydro Plant
      case 43: case 45: case 48: s = 12 - (fig.shields >> 3); break; // Mfg. Plant, Recycling, Nuclear Plant
      case 46: s = 12 - Math.trunc(fig.shields / 5); break; // Power Plant
      case 49: s = 4; break; // SS Structural — statek kosmiczny: etap 7
    }
    if (s < 400) {
      s *= preferUnits !== unitPref ? 20 : 10;
      s = Math.trunc((s * 3) / (ideology + 3));
    } else s = 16383;
    if (city.buildings & 2) s += s >> 2;
    pick(i, id, s);
  });
  pl.unitCount = savedCount;
  if (p === state.humanPlayer) {
    if (selectedBuilding === -1 || selectedBuildingScore > 500) return 99;
    return list[selectedBuilding]!;
  }
  if (city.production !== -1) return list[selected] ?? 1;
  return -1;
}

export function aiPlayerTurnStart(_state: GameState, _player: number): void {}
