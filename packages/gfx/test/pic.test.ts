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

describe('obraz 4-bitowy (blok "X1")', () => {
  it('nieparzysta szerokość: wiersz zajmuje pełne bajty, starsza połówka ostatniego bajtu pominięta', async () => {
    const { encodePicPixels } = await import('@civ-remake/engine');
    const width = 3;
    const height = 2;
    // wiersz 0: piksele 1 2 3 (bajty 0x21, 0xF3 — 0xF to wypełnienie), wiersz 1: 4 5 6 (0x54, 0xA6)
    const file = encodePicPixels(2, 2, new Uint8Array([0x21, 0xf3, 0x54, 0xa6]));
    file[1] = 0x31; // "X1"
    file[4] = width;
    file[6] = height;
    const img = decodePic(file);
    expect([img.width, img.height]).toEqual([3, 2]);
    expect([...img.pixels]).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
