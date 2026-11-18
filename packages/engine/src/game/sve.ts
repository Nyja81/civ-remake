/**
 * Zapis gry oryginału: CIVIL0–9.SVE (stan gry, 37 856 bajtów) i CIVIL0–9.MAP (warstwy mapy jako obraz .PIC 320×200).
 * Źródło: LoadAndSave.LoadGameData / SaveGameData / ReadGameInfoFromFile, City/Unit/UnitDefinition.FromStream/ToStream,
 * MapManagement (położenie warstw na obrazie mapy) z OpenCivOne (MIT). Liczby little-endian, napisy zakończone zerem.
 *
 * Warstwy obrazu .MAP (x 0–79, y 0–49 w każdym prostokącie 80×50):
 *   (x, y)            teren — wartość piksela = `terrainChangeId` z tabeli terenu,
 *   (80 + x, y)       właściciel ziemi (GetPlayerLandOwnership) → `map.landOwner`,
 *   (160 + x, y)      właściciel miasta/jednostek na polu (bity 0–2 gracz, bit 3 jednostki) → `map.occupant`,
 *   (240 + x, y)      minimapa człowieka (SetMiniMapCell: 1 woda, 2 ląd) — silnik jej nie ma (wzorzec),
 *   (x, 50 + y)       numer kontynentu/oceanu → `map.group`,
 *   (80 + x, 50 + y)  atrakcyjność pola (BuildLocationScore) → `map.buildScore`,
 *   (x, 100 + y) i (x, 150 + y)        ulepszenia RZECZYWISTE, bity 0–3 i 4–7 (GetVisibleTerrainImprovements we wzorcu),
 *   (80 + x, 100 + y) i (80 + x, 150 + y) ulepszenia widziane przez człowieka (GetTerrainImprovements),
 *   pozostałe obszary — nieużywane przez silnik (wzorzec).
 *
 * Zasada zapisu: `saveSve` zaczyna od wzorca (`state.sveExtra` — pliki z chwili odczytu; bez niego wzorzec zbudowany
 * z wartości początkowych) i nadpisuje pola, które silnik ma. Gdy wartość silnika jest taka sama jak odczytana ze wzorca,
 * bajty wzorca zostają — dzięki temu zapis → odczyt → zapis daje te same bajty także tam, gdzie odczyt coś gubi
 * (śmieci za zerem kończącym napis, bity 72–79 technologii, wyższe bity ustawień, NextUnitID wolnych miejsc jednostek).
 * Wolne miejsca w tablicach miast i jednostek czytamy w całości (stan 0xff / typ -1 i pozostałe pola), jak leżą w pamięci
 * oryginału — silnik też ich nie czyści.
 *
 * Pola tylko we wzorcu (silnik ich nie ma): MapCellCount, druga część tablic wielkości kontynentów i oceanów (48 + 48),
 * tabela jednostek (28 × 34 B — przy nowej grze z tabeli UNITS), TechnologyAcquiredFrom, MaximumTechnologyCount
 * (przy nowej grze liczone jak na początku GameTurn), RuleDebugFlags (przy nowej grze 0x0F), PalaceLevels/PalaceTypes/
 * PalaceBuildCount, minimapa. Pochodne: NextUnitID (lista cykliczna jednostek gracza na polu w kolejności numerów,
 * jeśli wzorzec nie ma poprawnej listy), CityPositions (zajęte nazwy miast; położenie z żywego miasta albo (0, 0)).
 *
 * Pola silnika spoza zapisu dostają przy odczycie wartości początkowe: badania komputera (−1), przyszłe technologie
 * i szansa statku komputera per gracz (0; oryginał trzyma je tylko dla człowieka), cele jednostek komputera,
 * techCatchUp (Var_d2de = 0, jak po uruchomieniu programu), znaczniki AIEngine, `earth` (false), losowanie (ziarno = RandomSeed),
 * pierwotny właściciel miasta (= właściciel). `waterPath` przeliczana (F7_0000_1440), `gotoCache` pusta.
 */
import { MAP_HEIGHT, MAP_WIDTH, MAX_CITIES, MAX_PLAYERS, MAX_UNITS_PER_PLAYER } from '../data/enums';
import { NATIONS } from '../data/nations';
import { TERRAIN } from '../data/terrain';
import { UNITS } from '../data/units';
import { PIXEL_TO_TERRAIN } from '../world/earth';
import { Terrain } from '../world/generate';
import { newPalace } from './palace';
import { mscRandom, type RandomSource } from '../world/random';
import { constructWaterPathArray, emptyGotoCache, PATH_CELLS } from './goto';
import { decodePicPixels, encodePicPixels } from './picCodec';
import { emptyPlayer } from './players';
import { REPLAY_SIZE } from './replay';
import { base64ToBytes, bytesToBase64 } from './save';
import { NO_UNIT, type City, type Continent, type GameMap, type GameSettings, type GameState, type PalaceState, type Unit } from './types';

const P = MAX_PLAYERS;
const UNIT_TYPES = 28;
const CITY_RECORD = 28;
const UNIT_RECORD = 12;
const UNIT_TYPE_RECORD = 34;
const CITY_NAME_COUNT = 256;
const MAP_IMAGE_WIDTH = 320;
const MAP_IMAGE_HEIGHT = 200;

/** Układ pliku .SVE — kolejność pól jak w LoadGameData; przesunięcia liczone z rozmiarów. */
const LAYOUT_SIZES = [
  ['turn', 2], ['human', 2], ['playerFlags', 2], ['seed', 2], ['year', 2], ['difficulty', 2], ['activeCivs', 2], ['research', 2],
  ['leader', P * 14], ['nation', P * 12], ['nationality', P * 11], ['gold', P * 2], ['progress', P * 2],
  ['activeUnits', P * UNIT_TYPES * 2], ['unitsInProduction', P * UNIT_TYPES * 2], ['techCount', P * 2], ['techFlags', P * 5 * 2],
  ['government', P * 2], ['strategy', P * 16 * 2], ['diplomacy', P * 8 * 2], ['cityCount', P * 2], ['unitCount', P * 2],
  ['mapCellCount', P * 2], ['settlerCount', P * 2], ['totalCitySize', P * 2], ['militaryPower', P * 2], ['ranking', P * 2],
  ['taxRate', P * 2], ['score', P * 2], ['contact', P * 2], ['xStart', P * 2], ['nationalityId', P * 2],
  ['attack', P * 16 * 2], ['defense', P * 16 * 2], ['continentCities', P * 16 * 2],
  ['continentSize', 64 * 2], ['oceanSize', 64 * 2], ['buildSites', 16 * 2], ['scoreGraph', 1200], ['peaceGraph', 1200],
  ['cities', MAX_CITIES * CITY_RECORD], ['unitTypes', UNIT_TYPES * UNIT_TYPE_RECORD], ['units', P * MAX_UNITS_PER_PLAYER * UNIT_RECORD],
  ['visibility', MAP_WIDTH * MAP_HEIGHT], ['policyRole', P * 16], ['policy', P * 16], ['policyX', P * 16], ['policyY', P * 16],
  ['techFirst', 72 * 2], ['unitsDestroyed', P * 8 * 2], ['cityNames', CITY_NAME_COUNT * 13], ['replayLength', 2], ['replay', REPLAY_SIZE],
  ['wonderCity', 22 * 2], ['lostUnits', P * UNIT_TYPES * 2], ['techFrom', P * 72], ['pollutedSquares', 2], ['pollutionLevel', 2],
  ['globalWarming', 2], ['settings', 2], ['landPath', PATH_CELLS], ['maxTech', 2], ['futureTech', 2], ['ruleDebug', 2],
  ['scienceRate', P * 2], ['nextHistory', 2], ['historyScore', P * 2], ['spaceship', P * 180], ['spaceshipFlags', 2],
  ['spaceshipSuccess', 2], ['aiSpaceshipSuccess', 2], ['spaceshipEta', P * 2], ['palaceLevels', 12 * 2], ['palaceTypes', 12 * 2],
  ['cityPosX', CITY_NAME_COUNT], ['cityPosY', CITY_NAME_COUNT], ['palaceCount', 2], ['peaceTurns', 2], ['aiOpponents', 2],
  ['spaceshipPopulation', P * 2], ['launchYear', P * 2], ['identity', 2],
] as const;

type Field = (typeof LAYOUT_SIZES)[number][0];

/** Przesunięcie pola w pliku .SVE. */
export const SVE_LAYOUT: Readonly<Record<Field, number>> = (() => {
  const out = {} as Record<Field, number>;
  let pos = 0;
  for (const [name, size] of LAYOUT_SIZES) {
    out[name] = pos;
    pos += size;
  }
  return out;
})();

/** Rozmiar pliku .SVE oryginału. */
export const SVE_SIZE = LAYOUT_SIZES.reduce((n, [, size]) => n + size, 0);

// ── odczyt i zapis liczb i napisów ──────────────────────────────────────────────────────

const u8 = (b: Uint8Array, o: number) => b[o]!;
const s8 = (b: Uint8Array, o: number) => (b[o]! << 24) >> 24;
const u16 = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);
const s16 = (b: Uint8Array, o: number) => (u16(b, o) << 16) >> 16;
const u32 = (b: Uint8Array, o: number) => (u16(b, o) | (u16(b, o + 2) << 16)) >>> 0;

const put8 = (b: Uint8Array, o: number, v: number) => { b[o] = v & 0xff; };
const put16 = (b: Uint8Array, o: number, v: number) => { b[o] = v & 0xff; b[o + 1] = (v >> 8) & 0xff; };
const put32 = (b: Uint8Array, o: number, v: number) => { put16(b, o, v & 0xffff); put16(b, o + 2, (v >>> 16) & 0xffff); };

/** LoadAndSave.ReadString: najwyżej `length − 1` znaków do pierwszego zera (ostatni bajt pomijany). */
function readString(b: Uint8Array, o: number, length: number): string {
  let s = '';
  for (let i = 0; i < length - 1; i++) {
    const c = b[o + i]!;
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

/** LoadAndSave.WriteString, ale bajty wzorca zostają, gdy odczytany z nich napis jest taki sam. */
function writeString(b: Uint8Array, o: number, length: number, text: string): void {
  if (readString(b, o, length) === text) return;
  for (let i = 0; i < length; i++) b[o + i] = i < length - 1 && i < text.length ? text.charCodeAt(i) & 0xff : 0;
}

// ── odczyt ──────────────────────────────────────────────────────────────────────────────

export interface SveInfo {
  turn: number;
  humanPlayer: number;
  year: number;
  difficulty: number;
  leader: string;
  nation: string;
}

/** ReadGameInfoFromFile: nagłówek zapisu do listy w oknie „Select Load File...”. */
export function sveInfo(sve: Uint8Array): SveInfo {
  if (sve.length < SVE_SIZE) throw new Error(`Plik .SVE ma ${sve.length} bajtów, oczekiwano ${SVE_SIZE}`);
  const human = s16(sve, SVE_LAYOUT.human);
  if (human < 0 || human >= P) throw new Error(`Nieprawidłowy numer gracza-człowieka: ${human}`);
  return {
    turn: s16(sve, SVE_LAYOUT.turn), humanPlayer: human, year: s16(sve, SVE_LAYOUT.year), difficulty: s16(sve, SVE_LAYOUT.difficulty),
    leader: readString(sve, SVE_LAYOUT.leader + human * 14, 14), nation: readString(sve, SVE_LAYOUT.nation + human * 12, 12),
  };
}

export interface LoadSveOptions {
  /** Źródło losowości gry; domyślnie rand() z Microsoft C z ziarnem RandomSeed z zapisu (oryginał nie zapisuje stanu rand()). */
  rng?: RandomSource;
}

const settingsFromBits = (v: number): GameSettings => ({
  instantAdvice: (v & 0x1) !== 0, autoSave: (v & 0x2) !== 0, endOfTurn: (v & 0x4) !== 0, animations: (v & 0x8) !== 0,
  sound: (v & 0x10) !== 0, enemyMoves: (v & 0x20) !== 0, civilopediaText: (v & 0x40) !== 0, palace: (v & 0x80) !== 0,
});

const settingsToBits = (s: GameSettings): number =>
  (s.instantAdvice ? 0x1 : 0) | (s.autoSave ? 0x2 : 0) | (s.endOfTurn ? 0x4 : 0) | (s.animations ? 0x8 : 0) |
  (s.sound ? 0x10 : 0) | (s.enemyMoves ? 0x20 : 0) | (s.civilopediaText ? 0x40 : 0) | (s.palace ? 0x80 : 0);

function readImprovements(pix: Uint8Array, x: number, y: number, xOffset: number): number {
  return (pix[(100 + y) * MAP_IMAGE_WIDTH + xOffset + x]! & 0xf) | ((pix[(150 + y) * MAP_IMAGE_WIDTH + xOffset + x]! & 0xf) << 4);
}

/** Unit.FromStream — także wolne miejsce (typ -1) z resztą pól, jak w pamięci oryginału. */
function readUnit(b: Uint8Array, o: number): Unit {
  const type = s8(b, o + 3);
  return {
    status: u8(b, o), x: s8(b, o + 1), y: s8(b, o + 2), type, movesLeft: s8(b, o + 4), specialMoves: s8(b, o + 5),
    gotoX: s8(b, o + 6), gotoY: s8(b, o + 7), gotoNextDirection: s8(b, o + 8), visibleBy: u8(b, o + 9), homeCity: s8(b, o + 11),
  };
}

/** City.FromStream — wolne miejsce (stan 0xff) też z resztą pól (oryginał ich nie czyści). */
function readCity(b: Uint8Array, o: number): City {
  const owner = s8(b, o + 11);
  const status = u8(b, o + 6);
  return {
    buildings: u32(b, o), x: s8(b, o + 4), y: s8(b, o + 5), status: status === 0xff ? -1 : status, size: u8(b, o + 7), visibleSize: u8(b, o + 8),
    production: s8(b, o + 9), baseTrade: u8(b, o + 10), owner, originalOwner: owner, food: s16(b, o + 12), shields: s16(b, o + 14),
    workers: u32(b, o + 16), specialists: u16(b, o + 20), nameId: u8(b, o + 22),
    tradeRoutes: [s8(b, o + 23), s8(b, o + 24), s8(b, o + 25)], storedUnits: [s8(b, o + 26), s8(b, o + 27)],
  };
}

/**
 * LoadGameData: stan gry z pliku .SVE i warstw mapy z pliku .MAP. Wynik ma `sveExtra` — pliki do ponownego zapisu.
 * Kroki LoadGame po odczycie (Var_df60, Var_3484, kasowanie bitu 0 SpaceshipFlags) robi `resumeLoadedGame`.
 */
export function loadSve(sve: Uint8Array, mapFile: Uint8Array, options: LoadSveOptions = {}): GameState {
  const L = SVE_LAYOUT;
  const info = sveInfo(sve);
  const image = decodePicPixels(mapFile);
  if (image.width !== MAP_IMAGE_WIDTH || image.height < MAP_IMAGE_HEIGHT) {
    throw new Error(`Obraz .MAP ma ${image.width}×${image.height}, oczekiwano ${MAP_IMAGE_WIDTH}×${MAP_IMAGE_HEIGHT}`);
  }
  const pix = image.pixels.subarray(0, MAP_IMAGE_WIDTH * MAP_IMAGE_HEIGHT);
  const px = (x: number, y: number) => pix[y * MAP_IMAGE_WIDTH + x]!;
  const human = info.humanPlayer;

  // ── mapa ──
  const n = MAP_WIDTH * MAP_HEIGHT;
  const groups = (sizeAt: number, sites: boolean): Continent[] =>
    Array.from({ length: 16 }, (_, i) => ({ size: s16(sve, sizeAt + i * 2), buildSiteCount: sites ? s16(sve, L.buildSites + i * 2) : 0 }));
  const map: GameMap = {
    terrain: new Uint8Array(n), riverVariant: new Uint8Array(n), improvements: new Uint8Array(n), visibleImprovements: new Uint8Array(n),
    group: new Uint8Array(n), buildScore: new Uint8Array(n), landOwner: new Uint8Array(n), occupant: new Uint8Array(n),
    explored: new Uint16Array(n), continents: groups(L.continentSize, true), oceans: groups(L.oceanSize, false),
    landPath: sve.slice(L.landPath, L.landPath + PATH_CELLS), waterPath: new Uint8Array(PATH_CELLS), gotoCache: emptyGotoCache(),
  };
  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      const i = y * MAP_WIDTH + x;
      const t = PIXEL_TO_TERRAIN.get(px(x, y));
      if (t === undefined) throw new Error(`Nieznana wartość terenu ${px(x, y)} w pliku .MAP w punkcie (${x}, ${y})`);
      map.terrain[i] = t;
      map.landOwner[i] = px(80 + x, y);
      map.occupant[i] = px(160 + x, y);
      map.group[i] = px(x, 50 + y);
      map.buildScore[i] = px(80 + x, 50 + y);
      map.improvements[i] = readImprovements(pix, x, y, 0);
      map.visibleImprovements[i] = readImprovements(pix, x, y, 80);
      map.riverVariant[i] = map.improvements[i]! & 0x80 ? 1 : 0;
      // MapVisibility[x, y] — w pliku kolumnami (x · 50 + y)
      map.explored[i] = u8(sve, L.visibility + x * MAP_HEIGHT + y);
    }
  }
  // Oryginał przelicza tablicę ścieżek wody przy wczytaniu (F7_0000_1440); tablica lądu jest w zapisie.
  constructWaterPathArray(map);

  // ── gracze ──
  const players = Array.from({ length: P }, (_, i) => {
    const p = emptyPlayer();
    p.leader = readString(sve, L.leader + i * 14, 14);
    p.nationPlural = readString(sve, L.nation + i * 12, 12);
    p.nationAdjective = readString(sve, L.nationality + i * 11, 11);
    p.gold = s16(sve, L.gold + i * 2);
    p.researchProgress = s16(sve, L.progress + i * 2);
    for (let j = 0; j < UNIT_TYPES; j++) {
      p.activeUnits[j] = s16(sve, L.activeUnits + (i * UNIT_TYPES + j) * 2);
      p.unitsInProduction[j] = s16(sve, L.unitsInProduction + (i * UNIT_TYPES + j) * 2);
      p.lostUnits[j] = s16(sve, L.lostUnits + (i * UNIT_TYPES + j) * 2);
    }
    p.techCount = s16(sve, L.techCount + i * 2);
    for (let t = 0; t < 72; t++) p.techs[t] = (u16(sve, L.techFlags + (i * 5 + (t >> 4)) * 2) & (1 << (t & 15))) !== 0;
    p.government = s16(sve, L.government + i * 2);
    for (let j = 0; j < 16; j++) {
      const c = p.continents[j]!;
      c.strategy = s16(sve, L.strategy + (i * 16 + j) * 2);
      c.attack = s16(sve, L.attack + (i * 16 + j) * 2);
      c.defense = s16(sve, L.defense + (i * 16 + j) * 2);
      c.cityCount = s16(sve, L.continentCities + (i * 16 + j) * 2);
      const cp = p.continentPolicies[j]!;
      cp.role = s8(sve, L.policyRole + i * 16 + j);
      cp.policy = s8(sve, L.policy + i * 16 + j);
      cp.x = s8(sve, L.policyX + i * 16 + j);
      cp.y = s8(sve, L.policyY + i * 16 + j);
    }
    for (let j = 0; j < 8; j++) {
      p.diplomacy[j] = u16(sve, L.diplomacy + (i * 8 + j) * 2);
      p.unitsDestroyed[j] = s16(sve, L.unitsDestroyed + (i * 8 + j) * 2);
    }
    p.cityCount = s16(sve, L.cityCount + i * 2);
    p.unitCount = s16(sve, L.unitCount + i * 2);
    p.settlerCount = s16(sve, L.settlerCount + i * 2);
    p.totalCitySize = s16(sve, L.totalCitySize + i * 2);
    p.militaryPower = s16(sve, L.militaryPower + i * 2);
    p.ranking = s16(sve, L.ranking + i * 2);
    p.taxRate = s16(sve, L.taxRate + i * 2);
    p.score = s16(sve, L.score + i * 2);
    p.contactCountdown = s16(sve, L.contact + i * 2);
    p.xStart = s16(sve, L.xStart + i * 2);
    p.nation = s16(sve, L.nationalityId + i * 2);
    p.scienceRate = s16(sve, L.scienceRate + i * 2);
    for (let k = 0; k < 180; k++) p.spaceship[k] = s8(sve, L.spaceship + i * 180 + k);
    p.spaceshipEta = s16(sve, L.spaceshipEta + i * 2);
    p.spaceshipPopulation = s16(sve, L.spaceshipPopulation + i * 2);
    p.spaceshipLaunchYear = s16(sve, L.launchYear + i * 2);
    for (let u = 0; u < MAX_UNITS_PER_PLAYER; u++) p.units[u] = readUnit(sve, L.units + (i * MAX_UNITS_PER_PLAYER + u) * UNIT_RECORD);
    return p;
  });
  const hp = players[human]!;
  hp.researching = s16(sve, L.research);
  hp.futureTechs = s16(sve, L.futureTech);
  hp.spaceshipSuccess = s16(sve, L.spaceshipSuccess);
  // ValidateLoadedGameData: barbarzyńcy nie mają w zapisie nazwy ani nacji
  const barbarians = players[0]!;
  barbarians.nation = 0;
  barbarians.leader = NATIONS[0]!.leader;
  barbarians.nationPlural = NATIONS[0]!.plural || 'Barbarians';
  barbarians.nationAdjective = NATIONS[0]!.adjective || 'Barbarian';

  // ── miasta, nazwy, reszta ──
  const cities = Array.from({ length: MAX_CITIES }, (_, i) => readCity(sve, L.cities + i * CITY_RECORD));
  const cityNames = Array.from({ length: CITY_NAME_COUNT }, (_, i) => readString(sve, L.cityNames + i * 13, 13));
  // Nazwa jest zajęta, gdy CityPositions[nazwa].X ≠ -1 (FindNewCity)
  const cityNameTaken = Array.from({ length: CITY_NAME_COUNT }, (_, i) => s8(sve, L.cityPosX + i) !== -1);
  const replayLength = Math.min(Math.max(s16(sve, L.replayLength), 0), REPLAY_SIZE);
  const settingsValue = u16(sve, L.settings);
  const mapSeed = u16(sve, L.seed);

  const state: GameState = {
    turn: info.turn, year: info.year, currentPlayer: human, difficulty: info.difficulty, mapSeed, earth: false, humanPlayer: human,
    activeCivs: s16(sve, L.activeCivs), aiOpponents: s16(sve, L.aiOpponents), playerIdentity: s16(sve, L.identity),
    nextHistoryTurn: s16(sve, L.nextHistory), peaceTurns: s16(sve, L.peaceTurns), settings: settingsFromBits(settingsValue),
    map, players, cities,
    wonderCity: Array.from({ length: 22 }, (_, i) => s16(sve, L.wonderCity + i * 2)),
    cityNames, cityNameTaken,
    techFirstDiscoveredBy: Array.from({ length: 72 }, (_, i) => s16(sve, L.techFirst + i * 2)),
    techCatchUp: 0, globalWarming: s16(sve, L.globalWarming), pollutionLevel: s16(sve, L.pollutionLevel),
    pollutedSquares: s16(sve, L.pollutedSquares), aiFlags: 0, aiMakeContact: false, humanLowest: false, gameOver: 0,
    spaceshipFlags: s16(sve, L.spaceshipFlags), aiSpaceshipSuccess: s16(sve, L.aiSpaceshipSuccess),
    scoreGraph: Array.from(sve.subarray(L.scoreGraph, L.scoreGraph + 1200)),
    historyScores: Array.from({ length: P }, (_, i) => s16(sve, L.historyScore + i * 2)),
    peaceGraph: Array.from(sve.subarray(L.peaceGraph, L.peaceGraph + 1200)),
    replay: Array.from(sve.subarray(L.replay, L.replay + replayLength)),
    palace: readPalace(sve),
    sveExtra: { sve: bytesToBase64(sve.subarray(0, SVE_SIZE)), map: bytesToBase64(pix) },
    rng: options.rng ?? mscRandom(mapSeed),
    events: [],
  };
  return state;
}

/**
 * Pałac człowieka z zapisu: PalaceLevels (DS:0xd91e), PalaceTypes (DS:0xb222), PalaceBuildCount (Var_1c20).
 * Same zera (zapisy wersji ≤ 0.6.4 bez wzorca oryginału — części 0 i 8 mają w grze zawsze −1) → stan początkowy.
 */
function readPalace(sve: Uint8Array): PalaceState {
  const L = SVE_LAYOUT;
  const levels = Array.from({ length: 12 }, (_, i) => s16(sve, L.palaceLevels + i * 2));
  const types = Array.from({ length: 12 }, (_, i) => s16(sve, L.palaceTypes + i * 2));
  const buildCount = s16(sve, L.palaceCount);
  if (buildCount === 0 && levels.every((v) => v === 0) && types.every((v) => v === 0)) return newPalace();
  return { levels, types, buildCount };
}

/**
 * LoadGame (po LoadGameData): SpaceshipFlags bez bitu 0 (asembler: AND bajtu z 0xFE; nowszy wzorzec: & 0x7ffe).
 * Var_df60 (pominięcie graczy przed człowiekiem i przeliczenia jego miast w pierwszej turze po wczytaniu) odpowiada tu
 * `currentPlayer = humanPlayer` z `loadSve` — ruchy człowieka trwają od chwili zapisu.
 */
export function resumeLoadedGame(state: GameState): GameState {
  state.spaceshipFlags &= ~1;
  return state;
}

// ── zapis ───────────────────────────────────────────────────────────────────────────────

/** Wzorzec .SVE dla gry bez `sveExtra`: zera, tabela jednostek z UNITS, RuleDebugFlags = DefaultValue (0x0F). */
function freshSveTemplate(state: GameState): Uint8Array {
  const b = new Uint8Array(SVE_SIZE);
  UNITS.forEach((u, i) => {
    const o = SVE_LAYOUT.unitTypes + i * UNIT_TYPE_RECORD;
    writeString(b, o, 12, u.name);
    [u.obsoleteTech, u.movementType, u.moves, u.turnsOutside, u.attack, u.defense, u.cost, u.sightRange, u.transportCapacity,
      u.role, u.requiredTech].forEach((v, k) => put16(b, o + 12 + k * 2, v));
  });
  put16(b, SVE_LAYOUT.ruleDebug, 0x0f);
  // MaximumTechnologyCount jak na początku GameTurn: największa liczba technologii aktywnej cywilizacji
  let maxTech = 0;
  for (let i = 0; i < P; i++) if (state.activeCivs & (1 << i)) maxTech = Math.max(maxTech, state.players[i]!.techCount);
  put16(b, SVE_LAYOUT.maxTech, maxTech);
  return b;
}

/** Wzorzec obrazu .MAP dla gry bez `sveExtra`: zera i minimapa z pól odkrytych przez człowieka. */
function freshMapTemplate(state: GameState): Uint8Array {
  const pix = new Uint8Array(MAP_IMAGE_WIDTH * MAP_IMAGE_HEIGHT);
  updateMiniMap(state, pix, null);
  return pix;
}

/**
 * Minimapa (240 + x, y): pola odkryte przez człowieka od chwili odczytu (albo wszystkie, gdy nie było odczytu),
 * na których wzorzec ma 0, dostają 1 (woda) albo 2 (ląd) — tak ustawia je oryginał przy odkrywaniu pola jednostką.
 */
function updateMiniMap(state: GameState, pix: Uint8Array, loadedSve: Uint8Array | null): void {
  const bit = 1 << state.humanPlayer;
  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      const i = y * MAP_WIDTH + x;
      if (!(state.map.explored[i]! & bit)) continue;
      if (loadedSve && loadedSve[SVE_LAYOUT.visibility + x * MAP_HEIGHT + y]! & bit) continue;
      const o = y * MAP_IMAGE_WIDTH + 240 + x;
      if (pix[o] === 0) pix[o] = state.map.terrain[i] === Terrain.Water ? 1 : 2;
    }
  }
}

function writeUnit(b: Uint8Array, o: number, u: Unit, next: number): void {
  put8(b, o, u.status);
  put8(b, o + 1, u.x);
  put8(b, o + 2, u.y);
  put8(b, o + 3, u.type);
  put8(b, o + 4, u.movesLeft);
  put8(b, o + 5, u.specialMoves);
  put8(b, o + 6, u.gotoX);
  put8(b, o + 7, u.gotoY);
  put8(b, o + 8, u.gotoNextDirection);
  put8(b, o + 9, u.visibleBy);
  put8(b, o + 10, next);
  put8(b, o + 11, u.homeCity);
}

function writeCity(b: Uint8Array, o: number, c: City): void {
  put32(b, o, c.buildings);
  put8(b, o + 4, c.x);
  put8(b, o + 5, c.y);
  put8(b, o + 6, c.status === -1 ? 0xff : c.status);
  put8(b, o + 7, c.size);
  put8(b, o + 8, c.visibleSize);
  put8(b, o + 9, c.production);
  put8(b, o + 10, c.baseTrade);
  put8(b, o + 11, c.owner);
  put16(b, o + 12, c.food);
  put16(b, o + 14, c.shields);
  put32(b, o + 16, c.workers);
  put16(b, o + 20, c.specialists);
  put8(b, o + 22, c.nameId);
  for (let k = 0; k < 3; k++) put8(b, o + 23 + k, c.tradeRoutes[k] ?? -1);
  for (let k = 0; k < 2; k++) put8(b, o + 26 + k, c.storedUnits[k] ?? -1);
}

/**
 * NextUnitID jednostek gracza: lista cykliczna jednostek na tym samym polu (AddUnitToStack), -1 dla samotnej jednostki.
 * Silnik nie trzyma list — zostaje lista ze wzorca, jeśli obejmuje dokładnie te same jednostki; inaczej kolejność numerów.
 */
function stackLinks(units: readonly Unit[], template: Uint8Array, base: number): number[] {
  const next = new Array<number>(units.length).fill(-1);
  const stacks = new Map<number, number[]>();
  units.forEach((u, id) => {
    if (u.type === NO_UNIT) return;
    const key = (u.y & 0xff) * 256 + (u.x & 0xff);
    const list = stacks.get(key);
    if (list) list.push(id);
    else stacks.set(key, [id]);
  });
  for (const ids of stacks.values()) {
    if (ids.length < 2) continue;
    const members = new Set(ids);
    let valid = true;
    let at = ids[0]!;
    const seen = new Set<number>();
    for (let k = 0; k < ids.length; k++) {
      const t = s8(template, base + at * UNIT_RECORD + 10);
      if (!members.has(t) || seen.has(t)) {
        valid = false;
        break;
      }
      seen.add(t);
      at = t;
    }
    valid &&= at === ids[0] && seen.size === ids.length;
    ids.forEach((id, k) => {
      next[id] = valid ? s8(template, base + id * UNIT_RECORD + 10) : ids[(k + 1) % ids.length]!;
    });
  }
  return next;
}

/** SaveGameData: pliki .SVE i .MAP (obraz .PIC) ze stanu gry. */
export function saveSve(state: GameState): { sve: Uint8Array; map: Uint8Array } {
  const L = SVE_LAYOUT;
  const extra = state.sveExtra;
  const loaded = extra ? base64ToBytes(extra.sve) : null;
  if (loaded && loaded.length !== SVE_SIZE) throw new Error('Uszkodzony wzorzec .SVE w stanie gry');
  const b = loaded ? loaded.slice() : freshSveTemplate(state);
  const human = state.humanPlayer;

  put16(b, L.turn, state.turn);
  put16(b, L.human, human);
  if (!(s16(b, L.playerFlags) & (1 << human))) put16(b, L.playerFlags, 1 << human);
  put16(b, L.seed, state.mapSeed);
  put16(b, L.year, state.year);
  put16(b, L.difficulty, state.difficulty);
  put16(b, L.activeCivs, state.activeCivs);
  put16(b, L.research, state.players[human]!.researching);

  state.players.forEach((p, i) => {
    // Barbarzyńcy: napisy i nacja tylko ze wzorca (oryginał ich nie ustawia, ValidateLoadedGameData uzupełnia je przy odczycie)
    if (i !== 0) {
      writeString(b, L.leader + i * 14, 14, p.leader);
      writeString(b, L.nation + i * 12, 12, p.nationPlural);
      writeString(b, L.nationality + i * 11, 11, p.nationAdjective);
      put16(b, L.nationalityId + i * 2, p.nation);
    }
    put16(b, L.gold + i * 2, p.gold);
    put16(b, L.progress + i * 2, p.researchProgress);
    for (let j = 0; j < UNIT_TYPES; j++) {
      put16(b, L.activeUnits + (i * UNIT_TYPES + j) * 2, p.activeUnits[j] ?? 0);
      put16(b, L.unitsInProduction + (i * UNIT_TYPES + j) * 2, p.unitsInProduction[j] ?? 0);
      put16(b, L.lostUnits + (i * UNIT_TYPES + j) * 2, p.lostUnits[j] ?? 0);
    }
    put16(b, L.techCount + i * 2, p.techCount);
    for (let w = 0; w < 5; w++) {
      const o = L.techFlags + (i * 5 + w) * 2;
      let word = w < 4 ? 0 : u16(b, o) & 0xff00; // bity 72–79 ze wzorca
      for (let k = 0; k < 16 && w * 16 + k < 72; k++) if (p.techs[w * 16 + k]) word |= 1 << k;
      put16(b, o, word);
    }
    put16(b, L.government + i * 2, p.government);
    for (let j = 0; j < 16; j++) {
      const c = p.continents[j]!;
      put16(b, L.strategy + (i * 16 + j) * 2, c.strategy);
      put16(b, L.attack + (i * 16 + j) * 2, c.attack);
      put16(b, L.defense + (i * 16 + j) * 2, c.defense);
      put16(b, L.continentCities + (i * 16 + j) * 2, c.cityCount);
      const cp = p.continentPolicies[j]!;
      put8(b, L.policyRole + i * 16 + j, cp.role);
      put8(b, L.policy + i * 16 + j, cp.policy);
      put8(b, L.policyX + i * 16 + j, cp.x);
      put8(b, L.policyY + i * 16 + j, cp.y);
    }
    for (let j = 0; j < 8; j++) {
      put16(b, L.diplomacy + (i * 8 + j) * 2, p.diplomacy[j] ?? 0);
      put16(b, L.unitsDestroyed + (i * 8 + j) * 2, p.unitsDestroyed[j] ?? 0);
    }
    put16(b, L.cityCount + i * 2, p.cityCount);
    put16(b, L.unitCount + i * 2, p.unitCount);
    put16(b, L.settlerCount + i * 2, p.settlerCount);
    put16(b, L.totalCitySize + i * 2, p.totalCitySize);
    put16(b, L.militaryPower + i * 2, p.militaryPower);
    put16(b, L.ranking + i * 2, p.ranking);
    put16(b, L.taxRate + i * 2, p.taxRate);
    put16(b, L.score + i * 2, p.score);
    put16(b, L.contact + i * 2, p.contactCountdown);
    put16(b, L.xStart + i * 2, p.xStart);
    put16(b, L.scienceRate + i * 2, p.scienceRate);
    for (let k = 0; k < 180; k++) put8(b, L.spaceship + i * 180 + k, p.spaceship[k] ?? -1);
    put16(b, L.spaceshipEta + i * 2, p.spaceshipEta);
    put16(b, L.spaceshipPopulation + i * 2, p.spaceshipPopulation);
    put16(b, L.launchYear + i * 2, p.spaceshipLaunchYear);
    // jednostki; NextUnitID wolnego miejsca — ze wzorca (silnik go nie ma)
    const base = L.units + i * MAX_UNITS_PER_PLAYER * UNIT_RECORD;
    const next = stackLinks(p.units, b, base);
    p.units.forEach((u, id) => {
      const o = base + id * UNIT_RECORD;
      writeUnit(b, o, u, u.type === NO_UNIT ? s8(b, o + 10) : next[id]!);
    });
  });
  const hp = state.players[human]!;
  put16(b, L.futureTech, hp.futureTechs);
  put16(b, L.spaceshipSuccess, hp.spaceshipSuccess);

  // wielkości kontynentów i oceanów (pierwsze 16 z 64), miejsca pod miasta
  for (let i = 0; i < 16; i++) {
    put16(b, L.continentSize + i * 2, state.map.continents[i]?.size ?? 0);
    put16(b, L.oceanSize + i * 2, state.map.oceans[i]?.size ?? 0);
    put16(b, L.buildSites + i * 2, state.map.continents[i]?.buildSiteCount ?? 0);
  }
  // pałac człowieka (PalaceLevels, PalaceTypes, PalaceBuildCount)
  const palace = state.palace ?? newPalace();
  for (let i = 0; i < 12; i++) {
    put16(b, L.palaceLevels + i * 2, palace.levels[i] ?? -1);
    put16(b, L.palaceTypes + i * 2, palace.types[i] ?? 0);
  }
  put16(b, L.palaceCount, palace.buildCount);
  if (state.scoreGraph) for (let i = 0; i < 1200; i++) put8(b, L.scoreGraph + i, state.scoreGraph[i] ?? 0);
  if (state.peaceGraph) for (let i = 0; i < 1200; i++) put8(b, L.peaceGraph + i, state.peaceGraph[i] ?? 0);

  state.cities.forEach((c, i) => writeCity(b, L.cities + i * CITY_RECORD, c));

  for (let x = 0; x < MAP_WIDTH; x++) {
    for (let y = 0; y < MAP_HEIGHT; y++) put8(b, L.visibility + x * MAP_HEIGHT + y, state.map.explored[y * MAP_WIDTH + x]!);
  }
  for (let i = 0; i < 72; i++) put16(b, L.techFirst + i * 2, state.techFirstDiscoveredBy[i] ?? 0);
  for (let i = 0; i < CITY_NAME_COUNT; i++) writeString(b, L.cityNames + i * 13, 13, state.cityNames[i] ?? '');

  if (state.replay) {
    const replay = state.replay.slice(0, REPLAY_SIZE);
    put16(b, L.replayLength, replay.length);
    replay.forEach((v, i) => put8(b, L.replay + i, v));
  }
  for (let i = 0; i < 22; i++) put16(b, L.wonderCity + i * 2, state.wonderCity[i] ?? -1);
  put16(b, L.pollutedSquares, state.pollutedSquares);
  put16(b, L.pollutionLevel, state.pollutionLevel);
  put16(b, L.globalWarming, state.globalWarming);
  put16(b, L.settings, (u16(b, L.settings) & 0xff00) | settingsToBits(state.settings));
  b.set(state.map.landPath.subarray(0, PATH_CELLS), L.landPath);
  put16(b, L.nextHistory, state.nextHistoryTurn);
  if (state.historyScores) for (let i = 0; i < P; i++) put16(b, L.historyScore + i * 2, state.historyScores[i] ?? 0);
  put16(b, L.spaceshipFlags, state.spaceshipFlags);
  put16(b, L.aiSpaceshipSuccess, state.aiSpaceshipSuccess);

  // CityPositions: zajęta nazwa ma położenie (miasta, które ją nosi — wzorzec zostaje, jeśli już była zajęta), wolna -1
  for (let i = 0; i < CITY_NAME_COUNT; i++) {
    const takenInTemplate = s8(b, L.cityPosX + i) !== -1;
    if (state.cityNameTaken[i]) {
      if (takenInTemplate) continue;
      const city = state.cities.find((c) => c.status !== -1 && c.nameId === i);
      put8(b, L.cityPosX + i, city ? city.x : 0);
      put8(b, L.cityPosY + i, city ? city.y : 0);
    } else if (takenInTemplate) {
      put8(b, L.cityPosX + i, -1);
      put8(b, L.cityPosY + i, -1);
    }
  }
  put16(b, L.peaceTurns, state.peaceTurns);
  put16(b, L.aiOpponents, state.aiOpponents);
  put16(b, L.identity, state.playerIdentity);

  return { sve: b, map: encodePicPixels(MAP_IMAGE_WIDTH, MAP_IMAGE_HEIGHT, saveMapPixels(state, loaded)) };
}

/** Piksele obrazu .MAP: wzorzec z `sveExtra` (albo nowy) z warstwami silnika. */
export function saveMapPixels(state: GameState, loadedSve: Uint8Array | null = state.sveExtra ? base64ToBytes(state.sveExtra.sve) : null): Uint8Array {
  const map = state.map;
  const pix = state.sveExtra ? base64ToBytes(state.sveExtra.map).slice() : freshMapTemplate(state);
  if (pix.length !== MAP_IMAGE_WIDTH * MAP_IMAGE_HEIGHT) throw new Error('Uszkodzony wzorzec .MAP w stanie gry');
  const at = (x: number, y: number) => y * MAP_IMAGE_WIDTH + x;
  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      const i = y * MAP_WIDTH + x;
      const t = map.terrain[i]!;
      if (PIXEL_TO_TERRAIN.get(pix[at(x, y)]!) !== t) pix[at(x, y)] = TERRAIN[t]!.terrainChangeId;
      pix[at(80 + x, y)] = map.landOwner[i]!;
      pix[at(160 + x, y)] = map.occupant[i]!;
      pix[at(x, 50 + y)] = map.group[i]!;
      pix[at(80 + x, 50 + y)] = map.buildScore[i]!;
      for (const [offset, value] of [[0, map.improvements[i]!], [80, map.visibleImprovements[i]!]] as const) {
        if (readImprovements(pix, x, y, offset) === value) continue;
        pix[at(offset + x, 100 + y)] = value & 0xf;
        pix[at(offset + x, 150 + y)] = value >> 4;
      }
    }
  }
  if (state.sveExtra) updateMiniMap(state, pix, loadedSve);
  return pix;
}
