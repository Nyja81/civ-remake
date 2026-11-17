/** Mapa Ziemi z MAP.PIC oryginału; uruchamia się tylko z ustawionym CIV1_DIR. */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAP_HEIGHT, MAP_WIDTH, Terrain, worldFromMapPixels } from '@civ-remake/engine';
import { decodePic } from '../src';

const path = process.env.CIV1_DIR ? join(process.env.CIV1_DIR, 'MAP.PIC') : '';

describe.skipIf(!path || !existsSync(path))('mapa Ziemi z oryginału', () => {
  it('wczytuje się w całości i ma oczekiwane proporcje', () => {
    const pic = decodePic(new Uint8Array(readFileSync(path)));
    const world = worldFromMapPixels(pic.pixels, pic.width);
    expect(world.terrain.length).toBe(MAP_WIDTH * MAP_HEIGHT);
    const water = world.terrain.reduce((n, t) => n + (t === Terrain.Water ? 1 : 0), 0);
    expect(water).toBe(2490);
    expect(world.terrain.includes(Terrain.River)).toBe(true);
  });
});
