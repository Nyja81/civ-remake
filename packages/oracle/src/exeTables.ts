/**
 * Odczyt tabel danych bezpośrednio z CIV.EXE oryginału (wersja 475.05).
 * Funkcje parse* przyjmują obraz rozpakowany przez unpackExepack().
 * Służy wyłącznie do weryfikacji i generowania tabel silnika — plik EXE
 * pozostaje u właściciela licencji i nie trafia do repozytorium.
 */
import type { TechDefinition, TerrainDefinition, UnitDefinition } from '@civ-remake/engine';

const UNIT_COUNT = 28;
const UNIT_RECORD_SIZE = 34; // nazwa 12 B + 11 × int16
const TERRAIN_COUNT = 24;
const TERRAIN_RECORD_SIZE = 19; // nazwa 12 B + 7 × int8
const NAME_SIZE = 12;
const TECH_COUNT = 67;
const TECH_NAME_SIZE = 20;
const TECH_RECORD_SIZE = 22; // nazwa 20 B + 2 × int8

/**
 * CIV.EXE jest spakowany narzędziem Microsoft EXEPACK (ciągi powtórzeń zapisane skrótowo),
 * więc tabel nie da się czytać wprost z pliku. Funkcja zwraca rozpakowany obraz programu
 * (bez nagłówka MZ i bez relokacji — do odczytu danych nie są potrzebne).
 */
export function unpackExepack(file: Uint8Array): Uint8Array {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  if (view.getUint16(0, true) !== 0x5a4d) throw new Error('To nie jest plik MZ EXE');
  const headerSize = view.getUint16(8, true) * 16;
  const packedSize = view.getUint16(0x16, true) * 16; // początkowy CS = początek nagłówka EXEPACK
  const packHeader = headerSize + packedSize;

  // Nagłówek EXEPACK ma 16 lub 18 bajtów (nowszy zawiera pole skip_len) i kończy się sygnaturą "RB".
  let skipLen = 1;
  if (view.getUint16(packHeader + 14, true) === 0x4252) {
    skipLen = 1;
  } else if (view.getUint16(packHeader + 16, true) === 0x4252) {
    skipLen = view.getUint16(packHeader + 14, true);
  } else {
    throw new Error('Nie znaleziono sygnatury EXEPACK — nieobsługiwana wersja CIV.EXE');
  }
  const destSize = view.getUint16(packHeader + 12, true) * 16;
  const padding = (skipLen - 1) * 16;

  const out = new Uint8Array(Math.max(destSize, packedSize));
  out.set(file.subarray(headerSize, headerSize + packedSize));

  // Rozpakowanie przebiega od końca do początku, w miejscu.
  let src = packedSize - padding;
  let dst = destSize - padding;
  while (out[src - 1] === 0xff) src--;
  for (;;) {
    const command = out[--src]!;
    src -= 2;
    const count = out[src]! | (out[src + 1]! << 8);
    if ((command & 0xfe) === 0xb0) {
      const value = out[--src]!;
      out.fill(value, dst - count, dst);
      dst -= count;
    } else if ((command & 0xfe) === 0xb2) {
      for (let i = 0; i < count; i++) out[--dst] = out[--src]!;
    } else {
      throw new Error(`Błąd rozpakowywania EXEPACK: nieznane polecenie 0x${command.toString(16)}`);
    }
    if (command & 1) break;
  }
  return out.subarray(0, destSize);
}

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
