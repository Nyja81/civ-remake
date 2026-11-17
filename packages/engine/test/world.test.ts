import { describe, expect, it } from 'vitest';
import { generateWorld, MAP_HEIGHT, MAP_WIDTH, mscRandom, Terrain } from '../src';

const count = (world: { terrain: Uint8Array }, t: number) => world.terrain.reduce((n, v) => n + (v === t ? 1 : 0), 0);

describe('generator świata', () => {
  it('jest deterministyczny dla tego samego ziarna', () => {
    const a = generateWorld(mscRandom(1234));
    const b = generateWorld(mscRandom(1234));
    expect(Array.from(a.terrain)).toEqual(Array.from(b.terrain));
    expect(Array.from(generateWorld(mscRandom(1235)).terrain)).not.toEqual(Array.from(a.terrain));
  });

  it('zachowuje niezmienniki na 200 ziarnach', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const world = generateWorld(mscRandom(seed));
      expect(world.terrain.length).toBe(MAP_WIDTH * MAP_HEIGHT);
      // ramka wody (F7_0000_0012: obrysy (0,0)–(79,49) i (1,1)–(78,48)) — czapy polarne dodaje dopiero createGameMap
      for (let y = 0; y < MAP_HEIGHT; y++) {
        for (let x = 0; x < MAP_WIDTH; x++) {
          if (x >= 2 && x <= 77 && y >= 2 && y <= 47) continue;
          expect(world.terrain[y * MAP_WIDTH + x], `ziarno ${seed}`).toBe(Terrain.Water);
        }
      }
      for (const t of world.terrain) expect(t).toBeLessThanOrEqual(Terrain.River);
      const land = MAP_WIDTH * MAP_HEIGHT - count(world, Terrain.Water);
      expect(land, `ziarno ${seed}`).toBeGreaterThan(400);
      expect(land, `ziarno ${seed}`).toBeLessThan(2400);
    }
  });

  it('więcej lądu przy większym ustawieniu masy lądowej (średnio)', () => {
    const average = (landMass: number) => {
      let sum = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const w = generateWorld(mscRandom(seed), { landMass, temperature: 1, climate: 1, age: 1 });
        sum += MAP_WIDTH * MAP_HEIGHT - count(w, Terrain.Water);
      }
      return sum / 40;
    };
    expect(average(2)).toBeGreaterThan(average(0));
  });
});
