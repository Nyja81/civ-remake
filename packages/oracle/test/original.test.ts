/**
 * Porównanie tabel silnika z oryginalnym CIV.EXE.
 * Uruchamia się tylko, gdy CIV1_DIR wskazuje folder z grą.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUILDINGS, NATIONS, TECHS, TERRAIN, UNITS, WONDERS } from '@civ-remake/engine';
import {
  parseBuildingTables, parseNationTable, parseTechTable, parseTerrainTable, parseUnitTable, unpackExepack,
} from '../src/exeTables';

const dir = process.env.CIV1_DIR;
const exePath = dir ? join(dir, 'CIV.EXE') : '';

describe.skipIf(!exePath || !existsSync(exePath))('zgodność z oryginalnym CIV.EXE', () => {
  const exe = () => unpackExepack(new Uint8Array(readFileSync(exePath)));

  it('tabela technologii jest identyczna', () => {
    expect(parseTechTable(exe())).toEqual(TECHS);
  });

  it('tabela jednostek jest identyczna', () => {
    expect(parseUnitTable(exe())).toEqual(UNITS);
  });

  it('tabela terenu jest identyczna', () => {
    expect(parseTerrainTable(exe())).toEqual(TERRAIN);
  });

  it('tabele budynków i cudów są identyczne', () => {
    expect(parseBuildingTables(exe())).toEqual({ buildings: BUILDINGS, wonders: WONDERS });
  });

  it('tabela nacji jest identyczna', () => {
    expect(parseNationTable(exe())).toEqual(NATIONS);
  });
});
