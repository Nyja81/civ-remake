/**
 * Odczyt tabel danych bezpośrednio z CIV.EXE oryginału (wersja 475.05).
 * Funkcje parse* przyjmują obraz rozpakowany przez unpackExepack().
 * Służy wyłącznie do weryfikacji i generowania tabel silnika — plik EXE
 * pozostaje u właściciela licencji i nie trafia do repozytorium.
 */
import type {
  BuildingDefinition, NationDefinition, TechDefinition, TerrainDefinition, UnitDefinition, WonderDefinition,
} from '@civ-remake/engine';

const UNIT_COUNT = 28;
const UNIT_RECORD_SIZE = 34; // nazwa 12 B + 11 × int16
const TERRAIN_COUNT = 24;
const TERRAIN_RECORD_SIZE = 19; // nazwa 12 B + 7 × int8
const NAME_SIZE = 12;
const TECH_COUNT = 67;
const TECH_NAME_SIZE = 20;
const TECH_RECORD_SIZE = 22; // nazwa 20 B + 2 × int8

/** Rozpakowanie EXEPACK jest w packages/gfx (interfejs czyta z CIV.EXE dane animacji w czasie działania). */
export { unpackExepack } from '@civ-remake/gfx';

function findUnique(exe: Uint8Array, text: string): number {
  const needle = new TextEncoder().encode(text + '\0');
  const hits: number[] = [];
  outer: for (let i = 0; i <= exe.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (exe[i + j] !== needle[j]) continue outer;
    }
    hits.push(i);
  }
  if (hits.length !== 1) {
    throw new Error(`Oczekiwano jednego wystąpienia "${text}" w rozpakowanym CIV.EXE, znaleziono ${hits.length}`);
  }
  return hits[0]!;
}

function readName(exe: Uint8Array, offset: number, size = NAME_SIZE): string {
  let end = offset;
  while (end < offset + size && exe[end] !== 0) end++;
  return new TextDecoder('latin1').decode(exe.subarray(offset, end));
}

export function parseUnitTable(exe: Uint8Array): UnitDefinition[] {
  const view = new DataView(exe.buffer, exe.byteOffset, exe.byteLength);
  const start = findUnique(exe, 'Settlers');
  const units: UnitDefinition[] = [];
  for (let id = 0; id < UNIT_COUNT; id++) {
    const base = start + id * UNIT_RECORD_SIZE;
    const i16 = (n: number) => view.getInt16(base + NAME_SIZE + n * 2, true);
    units.push({
      id,
      name: readName(exe, base),
      obsoleteTech: i16(0),
      movementType: i16(1) as UnitDefinition['movementType'],
      moves: i16(2),
      turnsOutside: i16(3),
      attack: i16(4),
      defense: i16(5),
      cost: i16(6),
      sightRange: i16(7),
      transportCapacity: i16(8),
      role: i16(9) as UnitDefinition['role'],
      requiredTech: i16(10),
    });
  }
  return units;
}

export function parseTerrainTable(exe: Uint8Array): TerrainDefinition[] {
  const view = new DataView(exe.buffer, exe.byteOffset, exe.byteLength);
  const start = findUnique(exe, 'Desert');
  const terrain: TerrainDefinition[] = [];
  for (let id = 0; id < TERRAIN_COUNT; id++) {
    const base = start + id * TERRAIN_RECORD_SIZE;
    const i8 = (n: number) => view.getInt8(base + NAME_SIZE + n);
    terrain.push({
      id,
      name: readName(exe, base),
      movementCost: i8(0),
      defenseBonus: i8(1),
      food: i8(2),
      production: i8(3),
      trade: i8(4),
      unknown1: i8(5),
      terrainChangeId: i8(6),
    });
  }
  return terrain;
}

export function parseTechTable(exe: Uint8Array): TechDefinition[] {
  const view = new DataView(exe.buffer, exe.byteOffset, exe.byteLength);
  const start = findUnique(exe, 'Alphabet');
  const techs: TechDefinition[] = [];
  for (let id = 0; id < TECH_COUNT; id++) {
    const base = start + id * TECH_RECORD_SIZE;
    techs.push({
      id,
      name: readName(exe, base, TECH_NAME_SIZE),
      prereq1: view.getInt8(base + TECH_NAME_SIZE),
      prereq2: view.getInt8(base + TECH_NAME_SIZE + 1),
    });
  }
  return techs;
}

const BUILDING_COUNT = 24;
const WONDER_COUNT = 21;
const BUILDING_NAME_SIZE = 24;
const BUILDING_RECORD_SIZE = 30; // nazwa 24 B + 3 × int16

/**
 * Budynki i cuda leżą w jednej tabeli: rekord 0 („NONE”), budynki 1–24, cuda 25–45.
 * Tuż za nią jest tabela technologii wygaszających cuda (22 × int16, indeks = identyfikator cudu).
 */
export function parseBuildingTables(exe: Uint8Array): { buildings: BuildingDefinition[]; wonders: WonderDefinition[] } {
  const view = new DataView(exe.buffer, exe.byteOffset, exe.byteLength);
  const start = findUnique(exe, 'Palace') - BUILDING_RECORD_SIZE;
  if (readName(exe, start, BUILDING_NAME_SIZE) !== 'NONE') throw new Error('Nieoczekiwany początek tabeli budynków');
  const record = (index: number) => {
    const base = start + index * BUILDING_RECORD_SIZE;
    const i16 = (n: number) => view.getInt16(base + BUILDING_NAME_SIZE + n * 2, true);
    return { name: readName(exe, base, BUILDING_NAME_SIZE), a: i16(0), b: i16(1), c: i16(2) };
  };
  const obsoleteStart = start + (1 + BUILDING_COUNT + WONDER_COUNT) * BUILDING_RECORD_SIZE;
  const buildings: BuildingDefinition[] = [];
  for (let id = 1; id <= BUILDING_COUNT; id++) {
    const r = record(id);
    buildings.push({ id, name: r.name, cost: r.a, upkeep: r.b, requiredTech: r.c });
  }
  const wonders: WonderDefinition[] = [];
  for (let id = 1; id <= WONDER_COUNT; id++) {
    const r = record(BUILDING_COUNT + id);
    wonders.push({ id, name: r.name, cost: r.a, requiredTech: r.c, obsoleteTech: view.getInt16(obsoleteStart + id * 2, true) });
  }
  return { buildings, wonders };
}

const NATION_COUNT = 16;
const NATION_TEXT_SIZE = 16;
const NATION_RECORD_SIZE = 58; // 3 × tekst 16 B + 5 × int16

export function parseNationTable(exe: Uint8Array): NationDefinition[] {
  const view = new DataView(exe.buffer, exe.byteOffset, exe.byteLength);
  const start = findUnique(exe, 'Caesar') - NATION_RECORD_SIZE; // nacja 0 jest pusta
  const nations: NationDefinition[] = [];
  for (let id = 0; id < NATION_COUNT; id++) {
    const base = start + id * NATION_RECORD_SIZE;
    const text = (n: number) => readName(exe, base + n * NATION_TEXT_SIZE, NATION_TEXT_SIZE);
    const i16 = (n: number) => view.getInt16(base + 3 * NATION_TEXT_SIZE + n * 2, true);
    nations.push({
      id, leader: text(0), plural: text(1), adjective: text(2),
      mood: i16(0), policy: i16(1), ideology: i16(2), shortTune: i16(3), longTune: i16(4),
    });
  }
  return nations;
}
