/**
 * Dane raportów doradców (menu ADVISORS, klawisze F1–F6) i świata (menu WORLD, F7–F10). Źródło: Reports.* z OpenCivOne (MIT):
 * F14_0000_186f_CityStatusReport, F14_0000_03ad_MilitaryReport, F14_0000_061f_MilitaryLossesReport,
 * F14_0000_0d43_IntelligenceReport i F14_0000_1164_IntelligenceReport, F14_0000_15f4_AttitudeReport, F14_0000_07f1_TradeReport,
 * F14_0000_014b_ScienceReport, F12_0000_080d_ShowWondersOfTheWorldReport, ShowTopFiveCitiesReport, F12_0000_0000_ShowWorldMapReport,
 * F12_0000_03ac_ShowContinentStatisticReport, F12_0000_0d6d_ShowsDemographicsReport (z PrintPlayerRank),
 * F12_0000_09e2_PlayerHistoryRankingReport i F12_0000_0573_ShowPowerGraphReport.
 * Przy wątpliwościach porównane z dosłownym tłumaczeniem asemblera (Overlay_12/Overlay_14 z historii wzorca).
 *
 * Tu są tylko liczby, które raport wypisuje — układ, kolory i ikony rysuje interfejs. Jak w oryginale miasta są przeliczane
 * funkcją ProcessCityState bez skutków tury (`processCity(…, 1)`), która może jedynie na nowo przydzielić mieszkańców do pól.
 */
import { BUILDINGS, WONDERS } from '../data/buildings';
import { NATIONS } from '../data/nations';
import { Tech, TECHS } from '../data/techs';
import { UNITS } from '../data/units';
import { Terrain } from '../world/generate';
import { BuildingId, hasBuilding, WonderId } from './buildings';
import { playerHasWonder } from './cities';
import { improvementDef, processCity } from './economy';
import { cellIndex, isValid, terrainAt, wrapX } from './map';
import { playerHasTech } from './techs';
import { playerPopulation } from './score';
import { activeUnitAt, cellOwner, cityAt, occupantPlayer } from './units';
import { CityStatus, Diplomacy, Improvement, NO_UNIT, type GameState } from './types';

/** Miasto przeliczone dla raportu (Var_70da_Arr, Var_e17a, Var_70e6, Var_70e2/Var_70e4, Var_e8b8). */
export interface ReportCity {
  cityId: number;
  owner: number;
  size: number;
  food: number;
  shields: number;
  trade: number;
  luxury: number;
  tax: number;
  science: number;
  happy: number;
  unhappy: number;
  /** Rodzaje specjalistów (GetSpecialWorkerFlags): 1 poborca, 2 naukowiec, 3 artysta; długość = liczba specjalistów. */
  specialists: number[];
}

/** ProcessCityState(cityId, -1) i odczyt liczb, których używają raporty. */
export function reportCity(state: GameState, cityId: number): ReportCity | null {
  const r = processCity(state, cityId, 1);
  if (!r) return null;
  const c = state.cities[cityId]!;
  const specialists: number[] = [];
  for (let i = 0; i < r.specialists; i++) specialists.push(i < 8 ? (c.specialists >> (i * 2)) & 3 : 1);
  return {
    cityId, owner: c.owner, size: c.size, food: r.food, shields: r.shields, trade: r.trade, luxury: r.luxury, tax: r.tax,
    science: r.science, happy: r.happy, unhappy: r.unhappy, specialists,
  };
}

const ownCities = (state: GameState, player: number): number[] =>
  state.cities.flatMap((c, i) => (c.status !== -1 && c.owner === player ? [i] : []));

const hasEmbassy = (state: GameState, player: number): boolean =>
  (state.players[state.humanPlayer]!.diplomacy[player]! & Diplomacy.Embassy) !== 0;

const isActive = (state: GameState, player: number): boolean => (state.activeCivs & (1 << player)) !== 0;

/** CheckValueRange oryginału. */
const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);
const div = (a: number, b: number): number => Math.trunc(a / b);

// ───────────────────────── doradcy ─────────────────────────

/** Wiersz F14_0000_186f_CityStatusReport: miasto, żywność/tarcze/handel, produkcja (zgromadzone/koszt·10). */
export interface CityStatusLine extends ReportCity {
  production: number;
  stored: number;
  /** Koszt produkcji ×10; null, gdy numer produkcji ≥ 64 (oryginał nic wtedy nie wypisuje). */
  cost: number | null;
}

/** F14_0000_186f_CityStatusReport */
export function cityStatusReport(state: GameState, player: number): CityStatusLine[] {
  const out: CityStatusLine[] = [];
  for (const id of ownCities(state, player)) {
    const r = reportCity(state, id);
    if (!r) continue;
    const c = state.cities[id]!;
    const cost = c.production < 0 ? 10 * improvementDef(-c.production).cost : c.production < 64 ? 10 * (UNITS[c.production]?.cost ?? 0) : null;
    out.push({ ...r, production: c.production, stored: c.shields, cost });
  }
  return out;
}

/** F14_0000_03ad_MilitaryReport: typy jednostek, które gracz ma albo buduje. */
export function militaryReport(state: GameState, player: number): { type: number; active: number; inProduction: number }[] {
  const p = state.players[player]!;
  const out: { type: number; active: number; inProduction: number }[] = [];
  for (let i = 0; i < 28; i++) {
    const active = p.activeUnits[i] ?? 0;
    const inProduction = p.unitsInProduction[i] ?? 0;
    if (active > 0 || inProduction > 0) out.push({ type: i, active, inProduction });
  }
  return out;
}

/** F14_0000_061f_MilitaryLossesReport: typy jednostek 0–26, które stracił którykolwiek gracz; `lost[gracz]`. */
export function militaryLossesReport(state: GameState): { type: number; lost: number[] }[] {
  const out: { type: number; lost: number[] }[] = [];
  for (let i = 0; i < 27; i++) {
    const lost = state.players.map((p) => p.lostUnits[i] ?? 0);
    if (lost.some((n) => n !== 0)) out.push({ type: i, lost });
  }
  return out;
}

export interface TradeReport {
  cities: { cityId: number; disorder: boolean; luxury: number; tax: number; science: number }[];
  /** Suma podatków miast bez niepokojów. */
  totalIncome: number;
  /** Liczba tur do odkrycia albo null, gdy miasta nie dają nauki. */
  discoveryTurns: number | null;
  /** Utrzymanie budynków (bez pałacu): liczba, nazwa (numer budynku), koszt. */
  maintenance: { building: number; count: number; cost: number }[];
  totalCost: number;
}

/** F14_0000_07f1_TradeReport */
export function tradeReport(state: GameState, player: number): TradeReport {
  const human = state.humanPlayer;
  // Dopłata za koszary: poziom/2, +1 za Gunpowder i za Combustion (tak samo liczy utrzymanie ProcessCityState)
  let coefficient = div(state.difficulty, 2);
  if (playerHasTech(state, player, Tech.Gunpowder)) coefficient++;
  if (playerHasTech(state, player, Tech.Combustion)) coefficient++;
  const maint = new Array<number>(24).fill(0);
  const cities: TradeReport['cities'] = [];
  let totalIncome = 0;
  let points = 0;
  for (const id of ownCities(state, player)) {
    const r = reportCity(state, id);
    if (!r) continue;
    const c = state.cities[id]!;
    const disorder = (c.status & CityStatus.CivilDisorder) !== 0;
    cities.push({ cityId: id, disorder, luxury: r.luxury, tax: r.tax, science: r.science });
    if (!disorder) {
      totalIncome += r.tax;
      points += r.science;
    }
    for (let j = 1; j < 24; j++) {
      if (!((c.buildings >>> j) & 1)) continue;
      maint[j]! += BUILDINGS[j]!.upkeep;
      if (j === 1) maint[j]! += coefficient;
    }
  }
  // Oryginał sprawdza SETI i liczbę technologii człowieka (raport zawsze dotyczy człowieka)
  if (playerHasWonder(state, human, WonderId.Seti)) points += points >> 1;
  let discoveryTurns: number | null = null;
  if (points !== 0) {
    const k = state.year < 0 ? 1 : state.year < 1750 ? 2 : 3;
    discoveryTurns = div(state.players[human]!.techCount * k * (state.difficulty * 2 + 6), points);
  }
  const maintenance: TradeReport['maintenance'] = [];
  let totalCost = 0;
  for (let i = 0; i < 24; i++) {
    if (maint[i] === 0) continue;
    // Koszary: liczba = koszt / dopłata (koszary same nie mają utrzymania)
    const unit = i === 1 ? coefficient : BUILDINGS[i]!.upkeep;
    maintenance.push({ building: i + 1, count: unit !== 0 ? div(maint[i]!, unit) : 0, cost: maint[i]! });
    totalCost += maint[i]!;
  }
  return { cities, totalIncome, discoveryTurns, maintenance, totalCost };
}

export type Relation = 'peace' | 'allied' | 'war';

/** Stosunki gracza z innymi w kolejności oryginału: PEACE/ALLIED przy pokoju, WAR przy kontakcie bez pokoju. */
function relations(state: GameState, player: number): { player: number; status: Relation }[] {
  const d = state.players[player]!.diplomacy;
  const out: { player: number; status: Relation }[] = [];
  for (let j = 1; j < 8; j++) {
    const f = d[j] ?? 0;
    if (f & Diplomacy.Peace) out.push({ player: j, status: f & Diplomacy.Allied ? 'allied' : 'peace' });
    if ((f & (Diplomacy.Contact | Diplomacy.Peace)) === Diplomacy.Contact) out.push({ player: j, status: 'war' });
  }
  return out;
}

export interface IntelligenceEntry {
  player: number;
  /** Człowiek albo ambasada (albo tryb debugowania): pełny wiersz; inaczej „No embassy established.” */
  known: boolean;
  relations: { player: number; status: Relation }[];
}

/** F14_0000_0d43_IntelligenceReport: wiersze aktywnych cywilizacji 1–7. */
export function intelligenceReport(state: GameState, debug = false): IntelligenceEntry[] {
  const out: IntelligenceEntry[] = [];
  for (let i = 1; i < 8; i++) {
    if (!isActive(state, i)) continue;
    const known = i === state.humanPlayer || hasEmbassy(state, i) || debug;
    out.push({ player: i, known, relations: known ? relations(state, i) : [] });
  }
  return out;
}

export interface IntelligenceDetail {
  player: number;
  /** Cechy władcy z tabeli nacji (Mood, Policy, Ideology). */
  traits: string[];
  /** Miasto z pałacem albo -1 (oryginał wypisuje wtedy „NONE”). */
  capital: number;
  relations: { player: number; peace: boolean; war: boolean }[];
  /** Odkrycia od numeru 71 w dół. */
  techs: number[];
}

/** F14_0000_1164_IntelligenceReport: szczegóły jednej cywilizacji. */
export function intelligenceDetail(state: GameState, player: number): IntelligenceDetail {
  const p = state.players[player]!;
  const nation = NATIONS[p.nation] ?? NATIONS[0]!;
  const traits: string[] = [];
  if (nation.mood === 1) traits.push('Aggressive');
  if (nation.mood === -1) traits.push('Friendly');
  if (nation.policy === 1) traits.push('Expansionistic');
  if (nation.policy === -1) traits.push('Perfectionist');
  if (nation.ideology === 1) traits.push('Civilized');
  if (nation.ideology === -1) traits.push('Militaristic');
  let capital = -1;
  state.cities.forEach((c, i) => {
    if (c.owner === player && c.status !== -1 && hasBuilding(c, BuildingId.Palace)) capital = i;
  });
  const rel: IntelligenceDetail['relations'] = [];
  for (let i = 1; i < 8; i++) {
    const f = p.diplomacy[i] ?? 0;
    if (!(f & Diplomacy.Contact)) continue;
    rel.push({ player: i, peace: (f & Diplomacy.Peace) !== 0, war: (f & (Diplomacy.Contact | Diplomacy.Peace)) === Diplomacy.Contact });
  }
  const techs: number[] = [];
  for (let i = 71; i >= 0; i--) if (playerHasTech(state, player, i)) techs.push(i);
  return { player, traits, capital, relations: rel, techs };
}

export interface AttitudeReport {
  cities: (ReportCity & { buildings: number[] })[];
  /** GetPlayerPopulationCount (tysiące). */
  population: number;
  happyPercent: number;
  contentPercent: number;
  unhappyPercent: number;
}

/** Budynki wpływające na zadowolenie, pokazywane w raporcie (maska 0x2618: świątynia, targ, bank, katedra, koloseum). */
const ATTITUDE_BUILDINGS_MASK = 0x2618;

/** F14_0000_15f4_AttitudeReport */
export function attitudeReport(state: GameState, player: number): AttitudeReport {
  const cities: AttitudeReport['cities'] = [];
  let people = 0;
  let happy = 0;
  let unhappy = 0;
  for (const id of ownCities(state, player)) {
    const r = reportCity(state, id);
    if (!r) continue;
    const c = state.cities[id]!;
    const buildings: number[] = [];
    for (let j = 0; j < 24; j++) if ((c.buildings & (1 << j) & ATTITUDE_BUILDINGS_MASK) !== 0) buildings.push(j + 1);
    cities.push({ ...r, buildings });
    people += c.size;
    happy += r.happy;
    unhappy += r.unhappy;
  }
  if (people === 0) people++;
  return {
    cities, population: playerPopulation(state, player),
    happyPercent: div(100 * happy, people), contentPercent: div(100 * (people - happy - unhappy), people), unhappyPercent: div(100 * unhappy, people),
  };
}

export interface ScienceReport {
  /** Koszt bieżącego odkrycia (długość paska postępu). */
  cost: number;
  /** Odstęp ikon żarówek w ósmych częściach piksela, szerokość i lewa krawędź paska. */
  spacing: number;
  width: number;
  x: number;
  /** Postęp badań obcięty do kosztu (liczba ikon). */
  progress: number;
  researching: number;
  /** Odkrycia gracza w kolejności numerów; `own` — gracz odkrył je pierwszy (kolor 15 zamiast 11). */
  techs: { tech: number; own: boolean }[];
}

/** F14_0000_014b_ScienceReport */
export function scienceReport(state: GameState, player: number): ScienceReport {
  const p = state.players[player]!;
  const ratio = Math.max(state.difficulty * 2 + state.techCatchUp + 6, 11 - p.techCount);
  const cost = p.techCount * (state.year < 0 ? 1 : 2) * ratio;
  const spacing = clamp(div(2432, cost + 1), 1, 64);
  const width = clamp(div(Math.abs(spacing * cost), 8) + 8, 8, 304);
  const x = 160 - div(width, 2);
  const techs: ScienceReport['techs'] = [];
  for (let i = 0; i < 72; i++) {
    if (playerHasTech(state, player, i)) techs.push({ tech: i, own: (state.techFirstDiscoveredBy[i]! & 7) === player });
  }
  return { cost, spacing, width, x, progress: clamp(p.researchProgress, 0, cost), researching: p.researching, techs };
}

// ───────────────────────── świat ─────────────────────────

/** F12_0000_080d_ShowWondersOfTheWorldReport: zbudowane i zniszczone cuda (`owner` zniszczonego = 0). */
export function wondersOfTheWorld(state: GameState): { wonder: number; cityId: number; owner: number; destroyed: boolean }[] {
  const out: { wonder: number; cityId: number; owner: number; destroyed: boolean }[] = [];
  for (let i = 1; i < 22; i++) {
    const c = state.wonderCity[i]!;
    if (c === -1) continue;
    const destroyed = c === 128;
    out.push({ wonder: i, cityId: c, owner: destroyed || c < 0 || c > 127 ? 0 : state.cities[c]!.owner, destroyed });
  }
  return out;
}

const wondersIn = (state: GameState, cityId: number): number[] => {
  const out: number[] = [];
  for (let j = 1; j < 22; j++) if (state.wonderCity[j] === cityId) out.push(j);
  return out;
};

/** ShowTopFiveCitiesReport: wielkość + zadowoleni − niezadowoleni + 10 za każdy cud; przy remisie wcześniejsze miasto. */
export function topFiveCities(state: GameState): (ReportCity & { score: number; wonders: number[] })[] {
  const ids = [-1, -1, -1, -1, -1];
  const scores = [-1, -1, -1, -1, -1];
  state.cities.forEach((c, i) => {
    if (c.status === -1) return;
    const r = reportCity(state, i);
    if (!r) return;
    const score = c.size + r.happy - r.unhappy + 10 * wondersIn(state, i).length;
    for (let j = 0; j < 5; j++) {
      if (score > scores[j]!) {
        for (let k = 3; k >= j; k--) {
          scores[k + 1] = scores[k]!;
          ids[k + 1] = ids[k]!;
        }
        scores[j] = score;
        ids[j] = i;
        break;
      }
    }
  });
  const out: (ReportCity & { score: number; wonders: number[] })[] = [];
  for (let i = 0; i < 5; i++) {
    if (scores[i] === -1) continue;
    // oryginał przelicza miasto drugi raz przed narysowaniem mieszkańców
    const r = reportCity(state, ids[i]!);
    if (r) out.push({ ...r, score: scores[i]!, wonders: wondersIn(state, ids[i]!) });
  }
  return out;
}

export interface WorldMapCell {
  /** Pole mapy. */
  x: number;
  y: number;
  /** Położenie na ekranie (piksele, pole 4×4). */
  sx: number;
  sy: number;
  terrain: number;
  /** Wariant kafla 4×4: (x + y) & 1. */
  parity: number;
  /** Miasto (pełne pole w kolorze gracza) albo jednostka (kwadrat 3×3 z cieniem). */
  marker: { kind: 'city' | 'unit'; player: number } | null;
}

/** F12_0000_0000_ShowWorldMapReport: odkryte pola człowieka przesunięte tak, by jego państwo było na środku ekranu. */
export function worldMapReport(state: GameState, debug = false): WorldMapCell[] {
  const human = state.humanPlayer;
  const mask = 1 << human;
  let xOffset = 40 - state.players[human]!.xStart;
  let yMedian = 0;
  if (debug) {
    xOffset = 0;
  } else {
    let yMin = 9999;
    let yMax = 0;
    for (const u of state.players[human]!.units) {
      if (u.type === NO_UNIT) continue;
      yMin = Math.min(yMin, u.y);
      yMax = Math.max(yMax, u.y);
    }
    for (const c of state.cities) {
      if (c.status === -1 || c.owner !== human) continue;
      yMin = Math.min(yMin, c.y);
      yMax = Math.max(yMax, c.y);
    }
    for (let i = 0; i < 80; i++) {
      if (state.map.explored[cellIndex(i, 0)]! & mask || state.map.explored[cellIndex(i, 1)]! & mask) {
        yMin = 0;
        yMax = 49;
      }
    }
    yMedian = 25 - div(yMax + yMin, 2);
  }
  const out: WorldMapCell[] = [];
  for (let i = 0; i < 50; i++) {
    for (let j = 0; j < 80; j++) {
      if (!debug && !(isValid(0, i + yMedian) && state.map.explored[cellIndex(j, i)]! & mask)) continue;
      let marker: WorldMapCell['marker'] = null;
      // GetVisibleTerrainImprovements wzorca czyta warstwę rzeczywistą (patrz ARCHITECTURE.v2)
      if (state.map.improvements[cellIndex(j, i)]! & Improvement.City) {
        const city = state.cities[cityAt(state, j, i)];
        if (city && (debug || city.visibleSize !== 0 || city.owner === human)) marker = { kind: 'city', player: cellOwner(state, j, i) };
      } else {
        const unitPlayer = occupantPlayer(state, j, i);
        if (unitPlayer !== -1) {
          const unitId = activeUnitAt(state, j, i);
          const u = unitId === -1 ? undefined : state.players[unitPlayer]!.units[unitId];
          if (u && (debug || unitPlayer === human || u.visibleBy & mask)) marker = { kind: 'unit', player: unitPlayer };
        }
      }
      out.push({ x: j, y: i, sx: wrapX(j + xOffset) * 4, sy: (i + yMedian) * 4, terrain: terrainAt(state.map, j, i), parity: (j + i) & 1, marker });
    }
  }
  return out;
}

/** F12_0000_03ac_ShowContinentStatisticReport (tylko w trybie debugowania): kontynenty 1–14 i siły graczy (obrona/atak/miasta). */
export function continentStatistics(state: GameState): { continent: number; size: number; players: { player: number; defense: number; attack: number; cities: number }[] }[] {
  const out: ReturnType<typeof continentStatistics> = [];
  for (let i = 1; i < 15; i++) {
    const players: { player: number; defense: number; attack: number; cities: number }[] = [];
    for (let j = 1; j < 8; j++) {
      const c = state.players[j]!.continents[i];
      if (c && c.attack !== 0) players.push({ player: j, defense: c.defense, attack: c.attack, cities: c.cityCount });
    }
    out.push({ continent: i, size: state.map.continents[i]?.size ?? 0, players });
  }
  return out;
}

export type DemographicsKey =
  | 'approval' | 'population' | 'gnp' | 'goods' | 'land' | 'literacy' | 'disease' | 'pollution'
  | 'lifeExpectancy' | 'familySize' | 'military' | 'income' | 'productivity';

export interface DemographicsRow {
  key: DemographicsKey;
  /** Wartość wypisywana dla gracza (Family Size — w dziesiątych częściach). */
  value: number;
  /** Miejsce człowieka (1 = najlepszy). */
  rank: number;
  /** Najlepsza cywilizacja (gdy to nie człowiek i jest ambasada), inaczej -1, i jej wartość. */
  leader: number;
  leaderValue: number;
}

/**
 * PrintPlayerRank: miejsce człowieka i najlepsza cywilizacja. Przy wierszach „im mniej, tym lepiej” oryginał zmienia znak
 * wartości w trakcie pętli — gracze przed człowiekiem są porównywani z jeszcze niezmienioną wartością człowieka (zachowane).
 */
function printPlayerRank(state: GameState, data: number[], lowerIsBetter: boolean): { rank: number; leader: number; leaderValue: number } {
  const human = state.humanPlayer;
  const r = data.slice();
  let rank = 1;
  let maximum = -9999;
  let selected = human;
  for (let i = 1; i < 8; i++) {
    if (!isActive(state, i)) continue;
    if (lowerIsBetter) r[i] = -r[i]!;
    if (r[i]! > r[human]!) rank++;
    if (maximum < r[i]!) {
      maximum = r[i]!;
      selected = i;
    }
  }
  const leader = selected !== human && hasEmbassy(state, selected) ? selected : -1;
  return { rank, leader, leaderValue: Math.abs(maximum) };
}

/** F12_0000_0d6d_ShowsDemographicsReport: 13 wierszy porównania z innymi cywilizacjami. */
export function demographicsReport(state: GameState, player: number): DemographicsRow[] {
  const z = () => new Array<number>(8).fill(0);
  const sizes = new Array<number>(8).fill(1);
  const growth = z();
  const happy = z();
  const productivity = z();
  const popGrowth = z();
  const education = z();
  const production = z();
  const income = z();
  const pollution = z();
  const land = z();
  // Land Area: pola lądu (wiersze 2–47) według właściciela pola (GetCityOwner: ostatni zajmujący)
  for (let x = 0; x < 80; x++) {
    for (let y = 2; y < 48; y++) if (terrainAt(state.map, x, y) !== Terrain.Water) land[cellOwner(state, x, y)]!++;
  }
  state.cities.forEach((c, i) => {
    if (c.status === -1) return;
    const r = reportCity(state, i);
    if (!r) return;
    const o = c.owner;
    sizes[o]! += c.size;
    happy[o]! += c.size + r.happy - r.unhappy;
    income[o]! += r.luxury * 2 + r.tax;
    popGrowth[o]! += r.food - c.size * 2;
    productivity[o]! += r.food + r.shields + r.trade;
    production[o]! += r.shields;
    // zanieczyszczenie jak w ProcessCityState: tarcze / dzielnik (Var_6c98) − 20 + wielkość · technologie (Var_b882) / 4
    const extra = div(r.shields, pollutionDivisor(state, i)) - 20 + div(c.size * pollutionTechs(state, i), 4);
    if (extra > 0) pollution[o]! += extra;
    if (hasBuilding(c, BuildingId.Granary)) growth[o]! += c.size;
    if (hasBuilding(c, BuildingId.Aqueduct)) growth[o]! += c.size;
    if (hasBuilding(c, BuildingId.Library)) education[o]! += c.size;
    if (hasBuilding(c, BuildingId.University)) education[o]! += c.size;
  });

  const rows: DemographicsRow[] = [];
  const row = (key: DemographicsKey, values: number[], lowerIsBetter = false, rankValues = values) => {
    rows.push({ key, value: values[player]!, ...printPlayerRank(state, rankValues, lowerIsBetter) });
  };
  const per = (fn: (i: number) => number) => Array.from({ length: 8 }, (_, i) => (i === 0 ? 0 : fn(i)));

  row('approval', per((i) => div(50 * happy[i]!, sizes[i]!)));
  row('population', per((i) => playerPopulation(state, i)));
  row('gnp', per((i) => income[i]!));
  row('goods', per((i) => production[i]!));
  row('land', per((i) => land[i]!));
  row('literacy', per((i) => {
    let v = div((sizes[i]! * 2 + education[i]!) * 2, sizes[i]!);
    for (const t of [Tech.Alphabet, Tech.Writing, Tech.Literacy, Tech.University]) if (playerHasTech(state, i, t)) v *= 2;
    return clamp(v, 0, 100);
  }));
  const disease = per((i) => {
    let v = div(50 * sizes[i]!, sizes[i]! + growth[i]!);
    if (playerHasTech(state, i, Tech.Medicine)) v = div(v, 2);
    return v;
  });
  // długość życia: 1500 / (choroby + 20) − 10 · zanieczyszczenie / wielkość, w granicach 20–99
  const life = per((i) => div(1500, disease[i]! + 20) - div(10 * pollution[i]!, sizes[i]!));
  row('disease', disease, true);
  row('pollution', per((i) => pollution[i]!), true);
  row('lifeExpectancy', per((i) => clamp(life[i]!, 20, 99)));
  const family = per((i) => div(40 * popGrowth[i]!, sizes[i]!) + 20);
  row('familySize', family, false, family.map((v) => div(v, 10)));
  row('military', per((i) => div(state.players[i]!.unitCount * 10, sizes[i]!)));
  row('income', per((i) => {
    const techs = state.players[i]!.techCount;
    return div(30000, techs + 1) <= income[i]! ? div(income[i]!, sizes[i]!) * techs : div(income[i]! * techs, sizes[i]!);
  }));
  row('productivity', per((i) => div(productivity[i]! * 10, sizes[i]!)));
  return rows;
}

/** Dzielnik zanieczyszczenia miasta (Var_6c98 w ProcessCityState): elektrownie wodna/jądrowa, Hoover Dam 2, recykling 3. */
function pollutionDivisor(state: GameState, cityId: number): number {
  const c = state.cities[cityId]!;
  let d = 1;
  if (hasBuilding(c, BuildingId.HydroPlant) || hasBuilding(c, BuildingId.NuclearPlant)) d = 2;
  if (playerHasWonder(state, c.owner, WonderId.HooverDam)) {
    const dam = state.cities[state.wonderCity[WonderId.HooverDam]!]!;
    if (state.map.group[cellIndex(c.x, c.y)] === state.map.group[cellIndex(dam.x, dam.y)]) d = 2;
  }
  if (hasBuilding(c, BuildingId.RecyclingCenter)) d = 3;
  return d;
}

/** Technologie zwiększające zanieczyszczenie (Var_b882), bez Mass Transit w mieście. */
function pollutionTechs(state: GameState, cityId: number): number {
  const c = state.cities[cityId]!;
  if (hasBuilding(c, BuildingId.MassTransit)) return 0;
  return [Tech.Industrialization, Tech.Automobile, Tech.MassProduction, Tech.Plastics].filter((t) => playerHasTech(state, c.owner, t)).length;
}


export interface HistoryReport {
  historian: number;
  type: number;
  /** Cywilizacje od najlepszej; `shown` — wiersz rysowany (człowiek, ambasada albo poziom Chieftain). */
  entries: { player: number; rank: number; shown: boolean }[];
}

/**
 * F12_0000_09e2_PlayerHistoryRankingReport — część bez okna: losuje rodzaj raportu i historyka (generator gry, w tej kolejności),
 * układa ranking i dopisuje punkty historii (HistoryRankingScore: 7 − miejsce; licznik raportów u gracza 0).
 */
export function playerHistoryReport(state: GameState, debug = false): HistoryReport {
  const type = state.rng.next(5);
  const historian = state.rng.next(4);
  const grades = new Array<number>(8).fill(0);
  state.cities.forEach((c, i) => {
    if (c.owner === -1 || c.status === -1) return;
    const r = reportCity(state, i);
    if (!r) return;
    if (type === 3) grades[c.owner]! += c.size + r.happy - r.unhappy;
    if (type === 4) grades[c.owner]! += c.size;
  });
  for (let i = 0; i < 8; i++) {
    const p = state.players[i]!;
    if (type === 0) grades[i] = p.gold;
    else if (type === 1) grades[i] = p.militaryPower;
    else if (type === 2) {
      grades[i] = 0;
      for (let j = 0; j < 72; j++) if (playerHasTech(state, i, j)) grades[i]!++;
    }
  }
  const scores = (state.historyScores ??= new Array<number>(8).fill(0));
  const entries: HistoryReport['entries'] = [];
  let rank = 0;
  for (let i = 1; i < 8; i++) {
    if (!isActive(state, i)) continue;
    let best = 0;
    let selected = -1;
    for (let j = 1; j < 8; j++) {
      if (grades[j]! >= best && isActive(state, j)) {
        best = grades[j]!;
        selected = j;
      }
    }
    if (selected === -1) continue;
    const shown = debug || state.difficulty === 0 || selected === state.humanPlayer || hasEmbassy(state, selected);
    entries.push({ player: selected, rank, shown });
    scores[selected] = (scores[selected] ?? 0) + 7 - rank;
    rank++;
    grades[selected] = -1;
  }
  scores[0] = (scores[0] ?? 0) + 1;
  return { historian, type, entries };
}

/** Zapis wartości rankingu do wykresu potęgi (RankPlayers: co 4 tury, do tury 600, wartość / 8 w granicach 0–255). */
export function recordScoreGraph(state: GameState, player: number, rankingScore: number): void {
  if (state.turn >= 600) return;
  const graph = (state.scoreGraph ??= new Array<number>(150 * 8).fill(0));
  graph[(div(state.turn, 4) % 150) * 8 + player] = clamp(div(rankingScore, 8), 0, 255);
}

export interface PowerGraph {
  /** Pionowe linie co 50 tur (x = tura / 2 + 4); `label` — podpis roku (TurnCountToYear) co 100 tur. */
  marks: { turn: number; label: boolean }[];
  maximum: number;
  series: { player: number; values: number[] }[];
}

/** F12_0000_0573_ShowPowerGraphReport: przebieg siły cywilizacji (co 4 tury, najwyżej 150 punktów). */
export function powerGraph(state: GameState): PowerGraph {
  const graph = state.scoreGraph ?? [];
  const marks: PowerGraph['marks'] = [];
  for (let i = 0; i <= state.turn && i <= 600; i += 50) marks.push({ turn: i, label: i % 100 === 0 });
  const count = Math.min(div(state.turn, 4), 150);
  let maximum = 50;
  const series: PowerGraph['series'] = [];
  for (let i = 1; i < 8; i++) {
    if (!isActive(state, i) && i > state.aiOpponents + 1) continue;
    const values: number[] = [];
    for (let j = 0; j < count; j++) values.push(graph[j * 8 + i] ?? 0);
    for (const v of values) maximum = Math.max(maximum, v);
    series.push({ player: i, values });
  }
  return { marks, maximum, series };
}

/** Nazwa technologii (pusta dla numerów bez technologii). */
export const techName = (tech: number): string => TECHS[tech]?.name ?? '';
/** Nazwa cudu 1–21. */
export const wonderName = (wonder: number): string => WONDERS[wonder - 1]?.name ?? '';
