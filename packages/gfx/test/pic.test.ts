/** Dekodowanie wszystkich plików .PIC z kopii gry; uruchamia się tylko z ustawionym CIV1_DIR. */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodePic } from '../src';

const dir = process.env.CIV1_DIR ?? '';

describe.skipIf(!dir || !existsSync(dir))('dekoder PIC na plikach oryginału', () => {
  const files = () => readdirSync(dir).filter((f) => f.toUpperCase().endsWith('.PIC')).sort();

  it('dekoduje każdy plik do pełnego obrazu', () => {
    expect(files().length).toBeGreaterThan(100);
    for (const name of files()) {
      const img = decodePic(new Uint8Array(readFileSync(join(dir, name))));
      expect(img.pixels.length, name).toBe(img.width * img.height);
      expect(img.width, name).toBeGreaterThan(0);
    }
  });

  it('arkusze terenu i jednostek mają 320×200 i paletę 256 kolorów', () => {
    for (const name of ['TER257.PIC', 'SP257.PIC']) {
      const img = decodePic(new Uint8Array(readFileSync(join(dir, name))));
      expect([img.width, img.height]).toEqual([320, 200]);
      expect(img.palette).not.toBeNull();
    }
  });
});
