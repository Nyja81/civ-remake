/**
 * Gospodarka miast. Źródło: CityWorker.ProcessCityState (część bez okna miasta), CityWorker.GetCityResourceCount,
 * AdjustHappyUnhappyCitizens i GameEngine.ProcessCitiesAndAdjustTaxRates z OpenCivOne (MIT).
 *
 * `processCity(state, id, 0)` to przeliczenie miasta na początku tury gracza (wzrost, produkcja, złoto, nauka,
 * niepokoje); `processCity(state, id, 1)` tylko liczy (okno miasta) i niczego nie zmienia poza przydziałem pól.
 *
 * Raport trybu 1 zawiera też dane okna miasta (kroki zadowolenia, kolejność pracy pól, zanieczyszczenie). Zdarzenia
 * z `showCity: true` odpowiadają Var_b1e8 oryginału: po komunikacie interfejs otwiera okno tego miasta.
 *
 * Pominięte: przechowywanie ufortyfikowanych jednostek poza tablicą (FirstFortifiedCityUnits), statystyki
 * przeciwnika komputerowego (Var_e3c2/Var_db42), budowa statku kosmicznego (etap 7), okna i animacje.
 */
import { MovementType } from '../data/enums';
import { BUILDINGS, WONDERS } from '../data/buildings';
import { NATIONS } from '../data/nations';
import { TERRAIN } from '../data/terrain';
import { TERRAIN_MODIFICATIONS } from '../data/terrainModifications';
import { Tech, TECHS } from '../data/techs';
import { UNITS } from '../data/units';
import { hasSpecialResource } from '../world/features';
import { Terrain } from '../world/generate';
import { aiSelectProduction, setCityFigures } from './ai';
import { nuclearEffects } from './catastrophes';
import { spaceshipPartBuilt } from './spaceship';
import { BuildingId, WonderId, addBuilding, hasBuilding, removeBuilding } from './buildings';
import { cityName, deleteCity, playerHasWonder, testIfPlayerDestroyed } from './cities';
import { CITY_OFFSETS, cellIndex, distance, isValid, terrainAt, updateVisibleCell, wrapX } from './map';
import { playerHasTech, researchFinished, selectNextResearch, canResearch, TECH_COUNT, FUTURE_TECH } from './techs';
import { CityStatus, Government, Improvement, NO_UNIT, type GameState } from './types';
import { createUnit, deleteUnit, occupantPlayer } from './units';

export const Resource = { Food: 0, Shields: 1, Trade: 2 } as const;

/** Wyniki przeliczenia miasta (dla okna miasta i raportów). */
export interface CityReport {
  food: number;
  shields: number;
  trade: number;
  corruption: number;
  luxury: number;
  tax: number;
  science: number;
  happy: number;
  unhappy: number;
  /** Nadwyżka żywności po wyżywieniu mieszkańców i osadników. */
  foodSurplus: number;
  /** Tarcze zużywane na utrzymanie jednostek. */
  unitSupport: number;
  /** Mieszkańcy niepracujący na polach (specjaliści). */
  specialists: number;
  workers: number;
  /** Żywność zjadana co turę: 2 na mieszkańca + 1 lub 2 na osadnika (size·2 + productionRatio·Var_e3c6). */
  foodUpkeep: number;
  /** Mnożnik kosztu produkcji i spichrza (difficultyProductionRatio: 10 dla człowieka). */
  difficultyRatio: number;
  /** Zanieczyszczenie (local_e0 w oknie miasta): tarcze/dzielnik − 20 + size·technologie/4. */
  pollution: number;
  /** Niezadowoleni „ponad miarę” (Var_6542) po ostatnim wyrównaniu — w oknie miasta mają inny kolor. */
  extraUnhappy: number;
  /** Kolejne stany zadowolenia do zakładki HAPPY okna miasta (po każdym AdjustHappyUnhappyCitizens). */
  happinessSteps: HappinessStep[];
  /** Typy pierwszych trzech jednostek bojowych w mieście (stan wojenny, ikony w zakładce HAPPY). */
  martialLawUnits: number[];
  /** Niezadowoleni z powodu jednostek bojowych poza miastem (republika, demokracja, Women's Suffrage). */
  militaryUnhappy: number;
  /** Kolejność, w jakiej mieszkańcy zostali przydzieleni do pól (indeksy CITY_OFFSETS) — kolejność rysowania zasobów. */
  workOrder: number[];
}

/** Stan zadowolenia po jednym kroku ProcessCityState (Var_70e2, Var_70e4, Var_6542). */
export interface HappinessStep {
  kind: 'base' | 'luxury' | 'buildings' | 'military' | 'wonders';
  happy: number;
  unhappy: number;
  extra: number;
}

const wonderCityOf = (state: GameState, wonder: number) => state.wonderCity[wonder]!;

/** GetCityResourceCount: żywność/tarcze/handel pola dla miasta. */
export function tileResource(state: GameState, player: number, cityId: number, x: number, y: number, type: number, celebrating?: boolean): number {
  if (!isValid(x, y)) return 0;
  const t = terrainAt(state.map, x, y);
  const idx = hasSpecialResource(wrapX(x), y, state.mapSeed) ? t + 12 : t;
  const def = TERRAIN[idx]!;
  let n = type === Resource.Food ? def.food : type === Resource.Shields ? def.production : def.trade;
  const imp = state.map.improvements[cellIndex(x, y)]!;
  if (t !== Terrain.Water) {
    if (type === Resource.Food && imp & Improvement.Irrigation) n += -1 - TERRAIN_MODIFICATIONS[t]!.irrigationEffect;
    if (type === Resource.Shields && imp & Improvement.Mine) n += -1 - TERRAIN_MODIFICATIONS[t]!.miningEffect;
    if (type === Resource.Trade && imp & Improvement.Road && (t === Terrain.Desert || t === Terrain.Plains || t === Terrain.Grassland)) n++;
  }
  if (type === Resource.Shields && (t === Terrain.Grassland || t === Terrain.River) && ((x * 7 + y * 11) & 2) !== 0) n = 0;
  if (n !== 0 && type === Resource.Trade && wonderCityOf(state, WonderId.Colossus) === cityId) n++;
  if (imp & Improvement.Railroad) n += n >> 1;
  const city = state.cities[cityId]!;
  const celebrates = celebrating ?? (city.status & CityStatus.Celebrating) !== 0;
  const gov = state.players[player]!.government;
  if (n > 2 && !celebrates && gov <= Government.Despotism) n--;
  if (n !== 0 && type === Resource.Trade) {
    if (celebrates) {
      if (gov >= Government.Monarchy) n++;
    } else if (gov >= Government.Republic) n++;
  }
  if (imp & Improvement.Pollution) n = (n + 1) >> 1;
  return Math.max(0, n);
}

/** Specjaliści: 2 bity na mieszkańca (0 brak, 1 poborca, 2 naukowiec, 3 artysta). */
const getSpecialist = (bits: number, i: number) => (i < 8 ? (bits >> (i * 2)) & 3 : 1);
const setSpecialist = (bits: number, i: number, v: number) => (i < 8 ? (bits & ~(3 << (i * 2))) | ((v & 3) << (i * 2)) : bits);

/** Ilu jednostek nie utrzymuje darmowo miasto (Var_d2f6) i ile jednostek ma (Var_deb8). */
function unitSupport(state: GameState, cityId: number): { units: number; support: number } {
  const city = state.cities[cityId]!;
  const p = state.players[city.owner]!;
  let units = city.storedUnits.filter((u) => u !== -1).length;
  let support = city.size < units ? units - city.size : 0;
  for (const u of p.units) {
    if (u.type === NO_UNIT || u.homeCity !== cityId || u.type === 26 || u.type === 27) continue;
    units++;
    if (city.size >= units) {
      if (p.government >= Government.Monarchy) support++;
    } else support++;
  }
  return { units, support };
}

/**
 * Pola 5×5 wokół miasta pracowane przez sąsiednie miasta (i ich pola centralne) — tablica cityArea z początku
 * ProcessCityState, przed doliczeniem pól z obcymi jednostkami. Indeks (dx + 2)·5 + (dy + 2); środek nigdy.
 */
export function cityNeighborArea(state: GameState, cityId: number): Set<number> {
  const city = state.cities[cityId]!;
  const area = new Set<number>();
  state.cities.forEach((other, i) => {
    if (other.status === -1 || i === cityId) return;
    if (distance(city.x, city.y, other.x, other.y) >= 6) return;
    for (let j = 0; j < 21; j++) {
      if (!((other.workers >>> j) & 1) && j !== 20) continue;
      const xPos = other.x + CITY_OFFSETS[j]![0];
      const yPos = other.y + CITY_OFFSETS[j]![1];
      if (Math.abs(xPos - city.x) <= 2 && Math.abs(yPos - city.y) <= 2) area.add((xPos - city.x + 2) * 5 + (yPos - city.y + 2));
    }
  });
  area.delete(2 * 5 + 2);
  return area;
}

/**
 * ProcessCityState. mode 0 — przeliczenie tury (zmienia stan), mode 1 — tylko obliczenia dla okna miasta.
 * Zwraca raport miasta albo null, gdy miasto przestało istnieć.
 */
export function processCity(state: GameState, cityId: number, mode: 0 | 1): CityReport | null {
  const city = state.cities[cityId]!;
  if (city.status === -1) return null;
  const player = city.owner;
  const p = state.players[player]!;
  const human = player === state.humanPlayer;
  const gov = p.government;

  // Odległość do stolicy (korupcja); 32, gdy brak pałacu
  let capitalDistance = hasBuilding(city, BuildingId.Palace) ? 0 : 32;
  if (city.shields < 0 || city.shields > 999) city.shields = 0;
  state.cities.forEach((other, i) => {
    if (other.status === -1 || i === cityId) return;
    const d = distance(city.x, city.y, other.x, other.y);
    if (other.owner === city.owner && hasBuilding(other, BuildingId.Palace) && d < capitalDistance) capitalDistance = d;
  });
  const blocked = cityNeighborArea(state, cityId); // pola 5×5 zajęte przez sąsiednie miasta (indeks (dx+2)*5+(dy+2))
  const productionRatio = gov <= Government.Despotism ? 1 : 2; // żywność na osadnika
  let pollutionTechs = 0;
  if (!hasBuilding(city, BuildingId.MassTransit)) {
    for (const t of [Tech.Industrialization, Tech.Automobile, Tech.MassProduction, Tech.Plastics]) if (playerHasTech(state, player, t)) pollutionTechs++;
  }
  let difficultyRatio = 10;
  let idle = city.workers >>> 26; // liczba mieszkańców bez pola zapamiętana w bitach 26+ (Var_e8b8)
  if (!human) {
    difficultyRatio = 16 - state.difficulty * 2;
    if (state.year >= 0 && state.players[state.humanPlayer]!.ranking === 7 && state.difficulty > 1) difficultyRatio -= 2;
    if (mode === 0) {
      if (!(city.status & CityStatus.CivilDisorder)) idle = 0;
      else city.workers = 0;
    }
  }

  // ── wzrost i głód ──
  if (mode === 0) {
    city.status &= 0x7f;
    if (city.food < 0) {
      const settler = p.units.findIndex((u) => u.type === 0 && u.homeCity === cityId);
      if (human) state.events.push({ kind: 'news', city: cityId, text: `Food storage exhausted\nin ${cityName(state, cityId)}!\n${settler !== -1 ? 'Settlers lost.' : 'Famine feared.'}\n` });
      if (settler !== -1) deleteUnit(state, player, settler);
      else {
        city.size--;
        if (city.size <= 0) {
          deleteCity(state, cityId);
          testIfPlayerDestroyed(state, player, -1);
          return null;
        }
      }
      city.food = 0;
    }
    if ((city.size + 1) * difficultyRatio <= city.food) {
      city.size++;
      city.food = hasBuilding(city, BuildingId.Granary) ? 5 * city.size + 5 : 0;
      if (city.size > 10 && !hasBuilding(city, BuildingId.Aqueduct)) {
        city.size--;
        if (human) state.events.push({ kind: 'message', style: 'domestic', text: `${cityName(state, cityId)} requires an AQUEDUCT\nfor further growth.\n` });
      }
    }
  }

  // ── utrzymanie jednostek i osadnicy ──
  let { support } = unitSupport(state, cityId);
  let aggressiveUnits = 0; // jednostki bojowe poza miastem (niezadowolenie w republice/demokracji)
  let settlers = 0;
  for (const u of p.units) {
    if (u.type === NO_UNIT || u.homeCity !== cityId) continue;
    if (u.type !== 26 && u.type !== 27 && UNITS[u.type]!.attack !== 0) {
      if (UNITS[u.type]!.movementType === MovementType.Air || u.x !== city.x || u.y !== city.y) aggressiveUnits++;
    }
    if (u.type === 0) settlers++;
  }

  // ── pola zablokowane i przydział mieszkańców do pól ──
  const free = new Array<number>(21).fill(0);
  let enemyNear = false;
  for (let i = 0; i < 21; i++) {
    const [ox, oy] = CITY_OFFSETS[i]!;
    const nx = city.x + ox;
    const ny = city.y + oy;
    if (!isValid(nx, ny)) {
      free[i] = 1;
      city.workers &= ~(1 << i);
      continue;
    }
    if (player !== 0 && !(state.map.explored[cellIndex(nx, ny)]! & (1 << player))) free[i] = 1;
    const occ = occupantPlayer(state, nx, ny);
    if (occ !== -1 && occ !== player) {
      blocked.add((ox + 2) * 5 + (oy + 2));
      free[i] = 1;
      if (occ === state.humanPlayer) enemyNear = true;
    }
    if (blocked.has((ox + 2) * 5 + (oy + 2))) free[i] = 1;
    if (free[i]) city.workers &= ~(1 << i);
  }
  const totals = [0, 0, 0];
  const workOrder: number[] = [];
  const res = (i: number, type: number) => tileResource(state, player, cityId, city.x + CITY_OFFSETS[i]![0], city.y + CITY_OFFSETS[i]![1], type);
  const work = (i: number) => {
    free[i] = 1;
    workOrder.push(i);
    const nx = city.x + CITY_OFFSETS[i]![0];
    const ny = city.y + CITY_OFFSETS[i]![1];
    if (mode === 0) state.map.landOwner[cellIndex(nx, ny)] = city.owner;
    for (let t = 0; t < 3; t++) totals[t]! += res(i, t);
  };
  let citizens = city.size + 1;
  let newWorkers = 0;
  let keep = false;
  if (human || ((cityId + state.turn) & 3) !== 0 || city.status & CityStatus.CivilDisorder || enemyNear) {
    for (let i = 0; i < 21; i++) if ((city.workers >>> i) & 1) citizens--;
    if (citizens >= 0) {
      citizens = city.size + 1;
      for (let i = 0; i < 21; i++) {
        if (citizens !== 0 && (city.workers >>> i) & 1) {
          work(i);
          citizens--;
          newWorkers |= 1 << i;
        }
      }
    } else {
      if (mode === 0 && human) state.events.push({ kind: 'message', style: 'domestic', city: cityId, showCity: true, text: `Population decrease\nin ${cityName(state, cityId)}.\n` });
      citizens = city.size + 1;
    }
    if (citizens === idle || citizens === 0) keep = true;
  }
  if (!keep) {
    if (citizens > 0 && free[20] === 0) {
      work(20);
      newWorkers |= 1 << 20;
      citizens--;
    }
    let best = 0;
    while ((city.size * 2 + productionRatio * settlers > (citizens >> 1) + totals[0]! || city.size < 3) && citizens > idle && best !== -1) {
      best = -1;
      let bestProd = 0;
      let bestFood = 0;
      for (let i = 0; i < 21; i++) {
        if (free[i]) continue;
        const food = res(i, Resource.Food);
        let prod = res(i, Resource.Shields) * 2;
        if (citizens !== 1 || totals[1] !== 0 || prod !== 0) {
          prod += res(i, Resource.Trade);
          if (food > bestFood || (food === bestFood && prod > bestProd)) {
            bestFood = food;
            bestProd = prod;
            best = i;
          }
        }
      }
      if (best === -1) break;
      work(best);
      newWorkers |= 1 << best;
      citizens--;
    }
    if (!human && city.status & CityStatus.CivilDisorder) idle++;
    while (citizens > idle) {
      let bestI = -1;
      let bestScore = 0;
      for (let i = 0; i < 21; i++) {
        if (free[i]) continue;
        let score = res(i, Resource.Food) * Math.trunc(16 / clamp(totals[0]! - city.size * 2 - productionRatio * settlers, 1, 99));
        score += Math.trunc((city.size * 3) / clamp(totals[1]! - support, 1, 99)) * res(i, Resource.Shields);
        score += Math.trunc((city.size * 2) / clamp(totals[2]!, 1, 99)) * res(i, Resource.Trade);
        if (score > bestScore) {
          bestScore = score;
          bestI = i;
        }
      }
      if (bestI === -1) break;
      work(bestI);
      newWorkers |= 1 << bestI;
      citizens--;
    }
  }
  city.workers = ((citizens << 26) | newWorkers) >>> 0;
  const specialistsCount = citizens;
  for (let i = 0; i < specialistsCount; i++) if (getSpecialist(city.specialists, i) === 0) city.specialists = setSpecialist(city.specialists, i, 3);
  for (let i = Math.max(0, specialistsCount); i < 8; i++) city.specialists = setSpecialist(city.specialists, i, 0);

  // ── tarcze: fabryki i elektrownie ──
  let factory = 0;
  let power = 0;
  let pollutionDivisor = 1;
  if (hasBuilding(city, BuildingId.Factory)) factory = 2;
  if (hasBuilding(city, BuildingId.MfgPlant)) factory = 4;
  if (hasBuilding(city, BuildingId.PowerPlant)) power = 2;
  if (hasBuilding(city, BuildingId.HydroPlant) || hasBuilding(city, BuildingId.NuclearPlant)) {
    pollutionDivisor = 2;
    power = 2;
  }
  if (playerHasWonder(state, player, WonderId.HooverDam)) {
    const dam = state.cities[state.wonderCity[WonderId.HooverDam]!]!;
    if (state.map.group[cellIndex(city.x, city.y)] === state.map.group[cellIndex(dam.x, dam.y)]) {
      pollutionDivisor = 2;
      power = 2;
    }
  }
  if (hasBuilding(city, BuildingId.RecyclingCenter)) pollutionDivisor = 3;
  power = clamp(power, 0, factory);
  totals[1]! += Math.trunc((factory * totals[1]!) / 4) + Math.trunc((power * totals[1]!) / 4);

  // ── produkcja ──
  if (mode === 0) {
    city.food += totals[0]! - productionRatio * settlers - city.size * 2;
    let newShields = totals[1]! - support;
    if (city.status & CityStatus.CivilDisorder) newShields = 0;
    city.shields += newShields;
    if (!completeProduction(state, cityId, difficultyRatio, newShields)) return null;
  }

  // ── handel, korupcja, podatki, nauka, luksus ──
  if (gov === Government.Communism) capitalDistance = 10;
  let corruption = Math.trunc((totals[2]! * capitalDistance * 3) / (gov * 20 + 80));
  if (hasBuilding(city, BuildingId.Courthouse) || hasBuilding(city, BuildingId.Palace)) corruption >>= 1;
  if (gov === Government.Democracy) corruption = 0;
  city.baseTrade = totals[2]! - corruption;
  for (const route of city.tradeRoutes) {
    if (route === -1) continue;
    const other = state.cities[route]!;
    totals[2]! += Math.trunc((other.baseTrade + totals[2]! + 4) / (other.owner === player ? 16 : 8));
  }
  corruption = Math.trunc((totals[2]! * capitalDistance * 3) / (gov * 20 + 80));
  if (gov === Government.Democracy) corruption = 0;
  if (hasBuilding(city, BuildingId.Courthouse)) corruption >>= 1;
  const net = totals[2]! - corruption;
  let luxury = clamp(Math.trunc((-(p.scienceRate + p.taxRate - 10) * net + 5) / 10), 0, totals[2]!);
  let tax = clampOrig(Math.trunc((p.taxRate * net + 5) / 10), 0, totals[2]! - luxury - corruption);
  let science = totals[2]! - luxury - tax - corruption;
  const countSpec = (type: number) => {
    let n = 0;
    for (let i = 0; i < 8; i++) if (getSpecialist(city.specialists, i) === type) n++;
    return n;
  };
  tax += countSpec(1) * 2;
  science += countSpec(2) * 2;
  luxury += countSpec(3) * 2;
  if (hasBuilding(city, BuildingId.MarketPlace)) {
    luxury += luxury >> 1;
    tax += tax >> 1;
  }
  if (hasBuilding(city, BuildingId.Bank)) {
    luxury += luxury >> 1;
    tax += tax >> 1;
  }
  let sci = science;
  const newton = playerHasWonder(state, player, WonderId.Newtons);
  if (hasBuilding(city, BuildingId.Library)) {
    sci += science >> 1;
    if (newton) sci += Math.trunc(science / 3);
  }
  if (hasBuilding(city, BuildingId.University)) {
    sci += science >> 1;
    if (newton) sci += Math.trunc(science / 3);
  }
  if (wonderCityOf(state, WonderId.Copernicus) === cityId) sci += sci;
  science = sci;

  // ── zadowolenie ──
  const h = { happy: 0, unhappy: 0, extra: 0 };
  if (human) {
    let r = 14 - state.difficulty * 2;
    r = (Math.trunc(gov / 2) + 2) * Math.trunc(r / 2);
    h.unhappy = Math.trunc(((cityId % r) + p.cityCount - r) / r) + city.size + state.difficulty - 6;
  } else {
    h.unhappy = city.size - 3;
  }
  if (city.size < h.unhappy) {
    h.extra = h.unhappy - city.size;
    h.unhappy = city.size;
  }
  const steps: HappinessStep[] = [];
  const adjust = (kind?: HappinessStep['kind']) => {
    adjustHappiness(h, city.size, specialistsCount);
    if (kind) steps.push({ kind, happy: h.happy, unhappy: h.unhappy, extra: h.extra });
  };
  adjust('base');
  h.happy = luxury >> 1;
  adjust('luxury');
  if (hasBuilding(city, BuildingId.Colosseum)) h.unhappy -= 3;
  if (playerHasTech(state, player, Tech.Religion) && hasBuilding(city, BuildingId.Cathedral)) {
    h.unhappy -= playerHasWonder(state, player, WonderId.Michelangelos) ? 6 : 4;
  }
  if (hasBuilding(city, BuildingId.Temple)) {
    if (playerHasTech(state, player, Tech.Mysticism)) h.unhappy -= 2;
    else if (playerHasTech(state, player, Tech.CeremonialBurial)) h.unhappy--;
    if (playerHasWonder(state, player, WonderId.Oracle)) h.unhappy -= playerHasTech(state, player, Tech.Mysticism) ? 2 : 1;
  }
  adjust('buildings');
  const martialLawUnits: number[] = [];
  let militaryUnhappy = 0;
  if (gov <= Government.Communism) {
    // stan wojenny: do 3 jednostek bojowych w mieście uspokaja po jednym niezadowolonym
    let military = 0;
    for (const u of p.units) {
      if (u.type !== NO_UNIT && u.x === city.x && u.y === city.y && UNITS[u.type]!.attack !== 0) {
        military++;
        if (martialLawUnits.length < 3) martialLawUnits.push(u.type);
      }
      if (military >= 32) break;
    }
    military = Math.min(military, 3);
    h.unhappy -= clamp(military, 0, h.unhappy);
  } else {
    let factor = playerHasWonder(state, player, WonderId.WomensSuffrage) ? 1 : 0;
    if (gov === Government.Democracy) factor++;
    if (factor !== 0) {
      h.unhappy += factor * aggressiveUnits;
      militaryUnhappy = factor * aggressiveUnits;
    }
  }
  adjust('military');
  if (playerHasWonder(state, player, WonderId.HangingGardens)) h.happy++;
  if (playerHasWonder(state, player, WonderId.CureForCancer)) h.happy++;
  if (wonderCityOf(state, WonderId.Shakespeares) === cityId) h.unhappy = 0;
  if (playerHasWonder(state, player, WonderId.Bachs)) {
    const bach = state.cities[state.wonderCity[WonderId.Bachs]!]!;
    if (state.map.group[cellIndex(city.x, city.y)] === state.map.group[cellIndex(bach.x, bach.y)]) h.unhappy -= 2;
  }
  adjust('wonders');

  const report: CityReport = {
    food: totals[0]!, shields: totals[1]!, trade: totals[2]!, corruption, luxury, tax, science,
    happy: h.happy, unhappy: h.unhappy, foodSurplus: totals[0]! - productionRatio * settlers - city.size * 2,
    unitSupport: support, specialists: specialistsCount, workers: city.size - specialistsCount,
    foodUpkeep: city.size * 2 + productionRatio * settlers, difficultyRatio,
    pollution: Math.trunc(totals[1]! / pollutionDivisor) - 20 + Math.trunc((city.size * pollutionTechs) / 4),
    extraUnhappy: h.extra, happinessSteps: steps, martialLawUnits, militaryUnhappy, workOrder,
  };
  if (mode === 1) return report;

  // ── utrzymanie jednostek: rozwiązanie jednostki, której miasto nie utrzyma ──
  for (;;) {
    ({ support } = unitSupport(state, cityId));
    const disorderAi = city.status & CityStatus.CivilDisorder && !human && gov >= Government.Republic;
    let disband = -1;
    if (totals[1]! < support || disorderAi) {
      let far = -1;
      p.units.forEach((u, i) => {
        if (u.type === NO_UNIT || u.homeCity !== cityId || u.type === 26 || u.type === 27) return;
        const d = distance(city.x, city.y, u.x, u.y);
        if (d > far) {
          far = d;
          disband = i;
        }
      });
      if (disband === -1) break;
      if (totals[1]! >= support) {
        // republika/demokracja komputera w niepokojach: wycofuje jednostkę spoza miasta (co 8 tur na jednostkę)
        const u = p.units[disband]!;
        if (far > 0 && UNITS[u.type]!.movementType === MovementType.Land && u.type !== 0) {
          deleteUnit(state, player, disband);
          city.status &= ~CityStatus.CivilDisorder;
        }
        break;
      }
      if (human) {
        state.events.push({ kind: 'message', style: 'defense',
          text: `${cityName(state, cityId)} can't support\n${UNITS[p.units[disband]!.type]!.name}.\n Unit Disbanded.\n` });
      }
      deleteUnit(state, player, disband);
      continue;
    }
    break;
  }

  // ── niepokoje, złoto, święto ──
  if (player !== 0) {
    const balance = h.happy - h.unhappy;
    if (balance < 0) {
      if (!(city.status & CityStatus.CivilDisorder)) {
        if (human) {
          state.events.push({ kind: 'news', style: 'domestic', city: cityId, showCity: true, animation: 'disorder', text: `Civil Disorder in\n${cityName(state, cityId)}! Mayor\nflees in panic.\n` });
          if (state.settings.instantAdvice) state.events.push({ kind: 'advice', key: '*DISORDER' });
        }
      }
      if (!(city.status & CityStatus.CivilDisorder)) {
        city.status |= CityStatus.CivilDisorder;
        if (!human) changeProduction(state, cityId, aiSelectProduction(state, player, cityId));
      } else if (gov === Government.Democracy) {
        if (human) {
          state.events.push({ kind: 'news', city: cityId, text: `Discontented citizens of\n${cityName(state, cityId)} revolt:\nGovernment Collapses!\n` });
          p.diplomacy[0]! |= 4;
        }
        p.government = Government.Anarchy;
        state.events.push({ kind: 'governmentChanged', player, government: Government.Anarchy });
      }
    } else {
      if (city.status & CityStatus.CivilDisorder) {
        city.status &= ~CityStatus.CivilDisorder;
        if (human) state.events.push({ kind: 'message', style: 'domestic', text: `Order restored\nin ${cityName(state, cityId)}.\n` });
        else changeProduction(state, cityId, aiSelectProduction(state, player, cityId));
      }
      if (gov !== Government.Anarchy) p.gold += tax;
    }
    if (h.unhappy === 0 && city.size > 2 && (city.size + 1) >> 1 <= h.happy && gov !== Government.Anarchy) {
      if (!(city.status & CityStatus.Celebrating)) {
        if (human) {
          state.events.push({ kind: 'news', city: cityId, animation: 'celebration', text: `'We love the ${GOVERNMENT_NAMES[gov]}'\nday celebrated in\n${cityName(state, cityId)}!\n` });
        }
        city.status |= CityStatus.Celebrating;
      } else if (gov >= Government.Republic) {
        if (city.size * 2 + productionRatio * settlers < totals[0]! && (city.size < 10 || hasBuilding(city, BuildingId.Aqueduct))) city.size++;
      }
    } else if (balance >= 0 && city.status & CityStatus.Celebrating) {
      if (human && gov !== Government.Anarchy) {
        state.events.push({ kind: 'news', city: cityId, text: `'We love the ${GOVERNMENT_NAMES[gov]}'\ncelebration canceled\nin ${cityName(state, cityId)}.\n` });
      }
      city.status &= ~CityStatus.Celebrating;
    }

    // ── nauka ──
    let points = science;
    if (human) {
      if ((p.researching !== -1 && playerHasTech(state, player, p.researching)) || (p.researching === -1 && p.researchProgress !== 0)) {
        p.researching = -1;
        selectNextResearch(state, player, 0);
        p.researchProgress = 0;
      }
    }
    if (gov === Government.Anarchy) points = 0;
    p.researchProgress += points;
    if (human && state.difficulty === 0 && p.researching >= 0 && (state.techFirstDiscoveredBy[p.researching]! & 7) !== 0) p.researchProgress += points;
    if (playerHasWonder(state, player, WonderId.Seti)) p.researchProgress += points >> 1;
    let ratio = human ? state.difficulty * 2 + 6 : 14 - state.difficulty;
    ratio += state.techCatchUp;
    if (human && 11 - p.techCount > ratio) ratio = 11 - p.techCount;
    if (Math.trunc(p.researchProgress / (state.year < 0 ? 1 : 2)) > p.techCount * ratio) {
      p.researchProgress = 0;
      if (human) completeHumanResearch(state);
      else selectNextResearch(state, player, 0);
    }
    p.score += city.size + h.happy - h.unhappy;

    if (human) {
      // zanieczyszczenie
      let pollution = Math.trunc(totals[1]! / pollutionDivisor) - 20;
      pollution += Math.trunc((city.size * pollutionTechs) / 4);
      if (pollution * 2 > state.rng.next(256 - Math.trunc((p.techCount * state.difficulty) / 2))) {
        const k = state.rng.next(20);
        const nx = CITY_OFFSETS[k]![0] + city.x;
        const ny = CITY_OFFSETS[k]![1] + city.y;
        const ni = cellIndex(nx, ny);
        if (isValid(nx, ny) && !(state.map.improvements[ni]! & (Improvement.Pollution | Improvement.City)) && terrainAt(state.map, nx, ny) !== Terrain.Water) {
          addPollution(state, nx, ny);
          state.events.push({ kind: 'message', style: 'science', x: wrapX(nx), y: ny, text: `Pollution near ${cityName(state, cityId)}.\n` });
        }
      }
      if (city.status & CityStatus.CivilDisorder && hasBuilding(city, BuildingId.NuclearPlant) && !playerHasTech(state, player, Tech.FusionPower) && state.rng.next(3) === 0) {
        removeBuilding(city, BuildingId.NuclearPlant);
        state.events.push({ kind: 'news', city: cityId, nuclearCatastrophe: true, text: `Nuclear Catastrophe\nin ${cityName(state, cityId)}!\nContamination feared!\n` });
        nuclearEffects(state, city.x, city.y);
      }
      // utrzymanie budynków (bez pałacu); dopłata za koszary zależna od poziomu i technologii
      for (let bit = 1; bit < 24; bit++) {
        const id = bit + 1;
        if (!hasBuilding(city, id) || gov === Government.Anarchy) continue;
        p.gold -= BUILDINGS[id - 1]!.upkeep;
        if (bit === 1) {
          if (state.difficulty >= 2) p.gold--;
          if (state.difficulty >= 4) p.gold--;
          if (playerHasTech(state, player, Tech.Gunpowder)) p.gold--;
          if (playerHasTech(state, player, Tech.Combustion)) p.gold--;
        }
        if (p.gold < 0) {
          p.gold = 0;
          removeBuilding(city, id);
          state.events.push({ kind: 'message', style: 'domestic', text: `${cityName(state, cityId)}\ncan't maintain\n${BUILDINGS[id - 1]!.name}.\n` });
          p.gold += 10 * BUILDINGS[id - 1]!.cost;
        }
      }
    }
  }
  return report;
}

export const GOVERNMENT_NAMES = ['Anarchy', 'Despotism', 'Monarchy', 'Communism', 'Republic', 'Democracy'] as const;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

/** CheckValueRange oryginału: najpierw dolna granica, potem górna (gdy min > max, wygrywa max). */
function clampOrig(v: number, lo: number, hi: number): number {
  if (v < lo) v = lo;
  if (v > hi) v = hi;
  return v;
}

/** AdjustHappyUnhappyCitizens. */
function adjustHappiness(h: { happy: number; unhappy: number; extra: number }, size: number, specialists: number): void {
  while (h.extra >= 0 && h.unhappy < h.extra) {
    h.extra--;
    h.unhappy++;
  }
  h.happy = clampOrig(h.happy, 0, size);
  h.unhappy = clampOrig(h.unhappy, 0, size);
  while (h.happy + h.unhappy > clampOrig(size - specialists, 0, 99)) {
    if (h.extra > 0) h.extra--;
    else {
      h.happy--;
      h.happy = clampOrig(h.happy, 0, size);
    }
    h.unhappy--;
    h.unhappy = clampOrig(h.unhappy, 0, size);
  }
}

export function addPollution(state: GameState, x: number, y: number): void {
  const i = cellIndex(x, y);
  if (state.map.improvements[i]! & Improvement.Pollution) return;
  state.map.improvements[i]! |= Improvement.Pollution;
  updateVisibleCell(state.map, x, y);
  state.pollutedSquares++;
}

/** Zmiana produkcji miasta z licznikiem jednostek w produkcji. */
export function changeProduction(state: GameState, cityId: number, production: number): void {
  const city = state.cities[cityId]!;
  const p = state.players[city.owner]!;
  if (city.production >= 0) p.unitsInProduction[city.production]!--;
  city.production = production;
  if (city.production >= 0) p.unitsInProduction[city.production]!++;
}

/** Koszt pozycji produkcji w tarczach (dla danego gracza: człowiek ×10, komputer zależnie od poziomu). */
export function productionCost(state: GameState, player: number, production: number): number {
  let ratio = 10;
  if (player !== state.humanPlayer) {
    ratio = 16 - state.difficulty * 2;
    if (state.year >= 0 && state.players[state.humanPlayer]!.ranking === 7 && state.difficulty > 1) ratio -= 2;
  }
  return (production >= 0 ? UNITS[production]!.cost : improvementDef(-production).cost) * ratio;
}

/** Budynek (1–24) albo cud (25–45 → cud 1–21) jako pozycja produkcji. */
export function improvementDef(id: number): { name: string; cost: number; requiredTech: number } {
  return id <= 24 ? BUILDINGS[id - 1]! : WONDERS[id - 25]!;
}

/** Zakończenie budowy jednostki lub budynku. Zwraca false, gdy miasto przestało istnieć. */
function completeProduction(state: GameState, cityId: number, ratio: number, newShields: number): boolean {
  const city = state.cities[cityId]!;
  const player = city.owner;
  const p = state.players[player]!;
  const human = player === state.humanPlayer;
  let skipAuto = false;
  if (city.production >= 0) {
    const cost = UNITS[city.production]!.cost * ratio;
    if (cost <= city.shields) {
      if (city.production === 0 && city.size === 1 && state.difficulty === 0) {
        skipAuto = true;
      } else {
        city.shields -= cost;
        let unitId = -1;
        if (human || city.production !== 26) unitId = createUnit(state, player, city.production, city.x, city.y);
        if (!(state.techFirstDiscoveredBy[city.production]! & 8)) state.techFirstDiscoveredBy[city.production]! |= 8;
        if (hasBuilding(city, BuildingId.Barracks) && unitId !== -1) p.units[unitId]!.status |= 0x20;
        if (unitId !== -1 && city.production === 0 && (city.size > 1 || p.cityCount > 1)) {
          city.size--;
          if (city.size === 0) {
            const type = city.production;
            deleteCity(state, cityId);
            createUnit(state, player, type, city.x, city.y);
            testIfPlayerDestroyed(state, player, -1);
            return false;
          }
        }
        if (unitId !== -1) p.units[unitId]!.homeCity = cityId;
        if (!human && unitId !== -1) {
          // Karawany i dyplomaci komputera (handel, kradzież technologii) — etap 6
          changeProduction(state, cityId, aiSelectProduction(state, player, cityId));
        } else if (human) {
          city.shields = 0;
          if (unitId !== -1 && (city.production === 0 || city.production >= 26)) {
            state.events.push({ kind: 'message', style: 'defense', city: cityId, showCity: true, text: `${cityName(state, cityId)} builds ${UNITS[city.production]!.name}.\n` });
          }
        }
      }
    }
  } else {
    const item = -city.production;
    const cost = improvementDef(item).cost * ratio;
    if (cost <= city.shields) {
      let built = item;
      if (built > 24) {
        if (state.wonderCity[built - 24] === -1) state.wonderCity[built - 24] = cityId;
        else built = -1;
      } else if (hasBuilding(city, built)) built = -1;
      if (built !== -1) {
        if (built === 41) state.events.push({ kind: 'news', text: `Sensors report a\nNUCLEAR WEAPONS test\nnear ${cityName(state, cityId)}!\n` });
        if (built < 22) addBuilding(city, built);
        city.shields -= cost;
        if (human || built > 24) {
          if (!human) state.map.explored[cellIndex(city.x, city.y)] = 0xffff;
          state.events.push({ kind: 'built', player, city: cityId, item: built, showCity: human, text: `${cityName(state, cityId)} builds\n${improvementDef(built).name}.\n` });
          city.shields = 0;
          if (built === 1 && !human) changeProduction(state, cityId, aiSelectProduction(state, player, cityId));
        } else {
          changeProduction(state, cityId, aiSelectProduction(state, player, cityId));
        }
        if (built > 21 && built < 25) {
          spaceshipPartBuilt(state, cityId, built, cost, (pl, t) => playerHasTech(state, pl, t), (part) => BUILDINGS[21 + part]!.requiredTech);
        }
        if (built === 1) {
          for (const c of state.cities) if (c.owner === player && c !== city) removeBuilding(c, BuildingId.Palace);
          addBuilding(city, BuildingId.Palace);
          p.xStart = city.x;
        }
        if (built === 38) {
          // Darwin's Voyage: dwa odkrycia
          selectNextResearch(state, player, 0);
          selectNextResearch(state, player, 0);
        }
        if (built === 43 && human) {
          // Apollo Program: odsłania wszystkie miasta
          for (const c of state.cities) {
            if (c.status === -1 || c.owner === player) continue;
            c.visibleSize = c.size;
            state.map.explored[cellIndex(c.x, c.y)]! |= 1 << player;
            updateVisibleCell(state.map, c.x, c.y);
          }
        }
      }
    }
  }
  if (!skipAuto && human && city.status & CityStatus.AutoProduction && (city.shields === 0 || (city.production < 0 && newShields === -1))) {
    const choice = aiSelectProduction(state, player, cityId);
    if (choice === 99) city.status &= ~CityStatus.AutoProduction;
    else changeProduction(state, cityId, choice);
  }
  if (!human) aiBuyProduction(state, cityId, ratio, newShields);
  return true;
}

/** Komputer dokupuje produkcję złotem (część ProcessCityState po etykiecie L2307). */
function aiBuyProduction(state: GameState, cityId: number, ratio: number, newShields: number): void {
  const city = state.cities[cityId]!;
  const p = state.players[city.owner]!;
  let income = 0;
  const unitCost = city.production >= 0 ? UNITS[city.production]!.cost * ratio : 0;
  if (city.status & CityStatus.CivilDisorder && city.production < 0 && city.shields !== 0) {
    income = clampOrig(improvementDef(-city.production).cost * ratio - city.shields, 0, Math.trunc(p.gold / 8));
  }
  if ((occupantPlayer(state, city.x, city.y) === -1 || city.status & CityStatus.AutoProduction) && city.production >= 0 && city.shields !== 0) {
    income = clampOrig(unitCost - city.shields, 0, Math.trunc(p.gold / 3));
  }
  if (p.gold > 2000) income += Math.trunc(p.gold / 512);
  void newShields;
  city.shields += income;
  p.gold -= income * 2;
  city.status &= ~CityStatus.AutoProduction;
}

/** Technologie, które człowiek może wybrać do badań — z ograniczeniem listy jak w oryginale (pierwsze okno). */
export function researchOptions(state: GameState, fullList = false): number[] {
  const p = state.players[state.humanPlayer]!;
  const list: number[] = [];
  for (let t = 0; t < TECH_COUNT; t++) {
    if (!canResearch(state, state.humanPlayer, t)) continue;
    if (fullList || list.length <= 1 || (t - p.techCount) % 3 !== 0 || state.difficulty === 0) list.push(t);
  }
  return list;
}

/** Odkrycie technologii badanej przez człowieka i prośba o wybór następnej (SelectNextResearchField dla człowieka). */
function completeHumanResearch(state: GameState): void {
  const p = state.players[state.humanPlayer]!;
  if (p.researching !== -1) {
    const name = p.researching === FUTURE_TECH ? `Future Technology ${p.futureTechs + 1}` : TECHS_NAME(p.researching);
    state.events.push({ kind: 'news', style: 'science',
      text: `${p.nationAdjective} ${playerHasTech(state, state.humanPlayer, Tech.Invention) ? 'scientists' : 'wise men'}\ndiscover the secret\nof ${name}!\n` });
    researchFinished(state, state.humanPlayer, 0, p.researching);
    p.researching = -1;
  }
  if (p.techCount <= 1) state.events.push({ kind: 'advice', key: '*FIRSTCIV' });
  const options = researchOptions(state);
  if (options.length === 0) {
    p.researching = FUTURE_TECH;
    return;
  }
  state.events.push({ kind: 'chooseResearch', player: state.humanPlayer, options });
}

const TECHS_NAME = (t: number) => (t >= 0 && t < TECH_COUNT ? TECHS[t]!.name : '');

/** Wybór badanej technologii przez człowieka. */
export function chooseResearch(state: GameState, tech: number): void {
  state.players[state.humanPlayer]!.researching = tech;
}

/** ProcessCitiesAndAdjustTaxRates. */
export function processCities(state: GameState, player: number): void {
  let largeCity = false;
  let disorder = false;
  state.players[player]!.score = 0;
  for (let i = 0; i < state.cities.length; i++) {
    const c = state.cities[i]!;
    if (c.status === -1 || c.owner !== player) continue;
    const r = processCity(state, i, 0);
    if (r && r.happy - r.unhappy === 0 && c.size > 5) largeCity = true;
    if (c.status !== -1 && c.status & CityStatus.CivilDisorder) disorder = true;
  }
  const p = state.players[player]!;
  p.totalCitySize = state.cities.reduce((s, c) => s + (c.status !== -1 && c.owner === player ? c.size : 0), 0);
  if (player !== state.humanPlayer && player !== 0) {
    const total = p.scienceRate + p.taxRate;
    let lux = 10 - total;
    if (disorder && total > 6) lux++;
    if ((state.turn & 3) === 0 && !largeCity && !disorder && total < 8) lux--;
    lux = clamp(lux, 0, 4);
    p.scienceRate = (p.nation !== -1 ? NATIONS[p.nation]!.ideology : 0) + Math.trunc((10 - lux) / 2);
    if (p.gold > state.turn + 100) p.scienceRate++;
    if (playerHasTech(state, player, Tech.Robotics)) p.scienceRate = 0;
    p.taxRate = 10 - (p.scienceRate + lux);
  }
}

export { wrapX };

// SelectCityProduction komputera korzysta z wyników ProcessCityState(…, -1): żywność, tarcze, handel, korupcja, utrzymanie.
setCityFigures((state, cityId) => {
  const r = processCity(state, cityId, 1);
  if (!r) return { food: 0, shields: 0, trade: 0, corruption: 0, unitCount: 0 };
  return { food: r.food, shields: r.shields, trade: r.trade, corruption: r.corruption, unitCount: r.unitSupport };
});
