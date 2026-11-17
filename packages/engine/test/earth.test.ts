import { describe, expect, it } from 'vitest';
import { MAP_HEIGHT, MAP_WIDTH, Terrain, TERRAIN, worldFromMapPixels } from '../src';

describe('mapa z pikseli', () => {
  it('zamienia wartości pikseli na typy terenu według tabeli oryginału', () => {
    const pixels = new Uint8Array(320 * 200).fill(TERRAIN[Terrain.Water]!.terrainChangeId);
    pixels[5 * 320 + 7] = TERRAIN[Terrain.Hills]!.terrainChangeId;
    const world = worldFromMapPixels(pixels, 320);
    expect(world.terrain[5 * MAP_WIDTH + 7]).toBe(Terrain.Hills);
    expect(world.terrain.filter((t) => t === Terrain.Water).length).toBe(MAP_WIDTH * MAP_HEIGHT - 1);
  });

  it('odrzuca piksele, które nie oznaczają żadnego terenu', () => {
    expect(() => worldFromMapPixels(new Uint8Array(320 * 200), 320)).toThrow();
  });
});
