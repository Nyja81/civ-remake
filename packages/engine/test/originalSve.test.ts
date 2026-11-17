/**
 * Zapisy gry z kopii oryginału (CIVIL0–9.SVE + .MAP). Uruchamia się tylko, gdy CIV1_DIR wskazuje folder z grą
 * i są w nim zapisy; pliki nie trafiają do repozytorium.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodePicPixels, loadSve, saveSve, SVE_SIZE } from '../src';

const dir = process.env.CIV1_DIR;
const files = dir && existsSync(dir) ? new Map(readdirSync(dir).map((name) => [name.toUpperCase(), name])) : new Map<string, string>();
const saves = Array.from({ length: 10 }, (_, i) => i).filter((i) => files.has(`CIVIL${i}.SVE`) && files.has(`CIVIL${i}.MAP`));
const read = (name: string) => new Uint8Array(readFileSync(join(dir!, files.get(name)!)));

describe.skipIf(saves.length === 0)('zapisy oryginału CIVIL?.SVE', () => {
  it.each(saves.length > 0 ? saves : [0])('CIVIL%i.SVE: odczyt i ponowny zapis dają te same bajty (.MAP — te same piksele)', (i) => {
    const sve = read(`CIVIL${i}.SVE`);
    const map = read(`CIVIL${i}.MAP`);
    expect(sve.length).toBe(SVE_SIZE);
    const state = loadSve(sve, map);
    expect(state.humanPlayer).toBeGreaterThan(0);
    const out = saveSve(state);
    const firstDiff = out.sve.findIndex((v, k) => v !== sve[k]);
    expect(firstDiff, `pierwsza różnica w bajcie ${firstDiff}`).toBe(-1);
    expect(Array.from(decodePicPixels(out.map).pixels)).toEqual(Array.from(decodePicPixels(map).pixels.subarray(0, 320 * 200)));
    // ten sam stan po drugim odczycie
    const again = saveSve(loadSve(out.sve, out.map));
    expect(Array.from(again.sve)).toEqual(Array.from(out.sve));
  });
});
