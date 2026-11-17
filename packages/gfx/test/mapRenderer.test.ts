/** Rysowanie terenu z arkuszy oryginału; uruchamia się tylko z ustawionym CIV1_DIR. */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateWorld, mscRandom } from '@civ-remake/engine';
import { decodePic, renderTerrain, toRgba } from '../src';

const dir = process.env.CIV1_DIR ?? '';

describe.skipIf(!dir || !existsSync(dir))('rysowanie mapy z grafik oryginału', () => {
  const load = (name: string) => decodePic(new Uint8Array(readFileSync(join(dir, name))));

  it('pokrywa całą mapę i jest powtarzalne', () => {
    const sheets = { ter: load('TER257.PIC'), sp: load('SP257.PIC'), sp299: load('SP299.PIC') };
    const world = generateWorld(mscRandom(1991));
    const a = renderTerrain(world, sheets, { seed: 1991 });
    const b = renderTerrain(world, sheets, { seed: 1991 });
    expect([a.width, a.height]).toEqual([1280, 800]);
    expect(a.pixels.every((p) => p !== 0)).toBe(true); // żadne pole nie zostało puste
    expect(Buffer.from(a.pixels).equals(Buffer.from(b.pixels))).toBe(true);
    expect(toRgba(a, sheets.sp.palette!).length).toBe(1280 * 800 * 4);
  });
});
