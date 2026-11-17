import { describe, expect, it } from 'vitest';
import { hasSpecialResource, hasTribalHut, MAP_HEIGHT, MAP_WIDTH, Terrain } from '../src';

describe('zasoby specjalne i chaty', () => {
  it('w każdym bloku 4×4 jest dokładnie jeden zasób specjalny (poza pasami przy biegunach)', () => {
    for (const seed of [0, 1, 1991, 32767]) {
      for (let by = 1; by < 11; by++) {
        for (let bx = 0; bx < MAP_WIDTH / 4; bx++) {
          let count = 0;
          for (let y = by * 4; y < by * 4 + 4; y++) for (let x = bx * 4; x < bx * 4 + 4; x++) if (hasSpecialResource(x, y, seed)) count++;
          expect(count, `ziarno ${seed}, blok ${bx},${by}`).toBe(1);
        }
      }
    }
  });

  it('nie ma zasobów ani chat w wierszach 0–1 i 48–49, a chat na wodzie', () => {
    for (let x = 0; x < MAP_WIDTH; x++) {
      for (const y of [0, 1, 48, 49]) {
        expect(hasSpecialResource(x, y, 5)).toBe(false);
        expect(hasTribalHut(x, y, Terrain.Plains, 5)).toBe(false);
      }
      for (let y = 0; y < MAP_HEIGHT; y++) expect(hasTribalHut(x, y, Terrain.Water, 5)).toBe(false);
    }
  });
});
