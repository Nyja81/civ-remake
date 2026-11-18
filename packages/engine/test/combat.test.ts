/** Walka (AttackUnit 0x29f3:0x000e): siły jak w oryginale, kolejność losowań, prawdopodobieństwo. */
import { describe, expect, it } from 'vitest';
import { advanceToHuman, attackUnit, createUnit, loadGame, mscRandom, newGame, saveGame, Terrain, UNITS, type GameState } from '../src';

let base: string | undefined;

const KNIGHTS = UNITS.findIndex((u) => u.name === 'Knights');
const SETTLERS = UNITS.findIndex((u) => u.name === 'Settlers');

/** Rycerze komputera 2 obok osadników komputera 3 na łące (bez ulepszeń); poziom King — bez poprawek trudności. */
function duel(seed: number, terrain: number = Terrain.Grassland) {
  if (!base) {
    const g = newGame({ seed: 99, difficulty: 3, civilizations: 7, nation: 1 });
    advanceToHuman(g);
    base = saveGame(g);
  }
  const s = loadGame(base);
  const x = 10, y = 20;
  for (const cx of [x, x + 1]) {
    const i = y * 80 + cx;
    s.map.terrain[i] = cx === x + 1 ? terrain : Terrain.Grassland;
    s.map.improvements[i] = 0;
  }
  const k = createUnit(s, 2, KNIGHTS, x, y);
  s.players[2]!.units[k]!.movesLeft = UNITS[KNIGHTS]!.moves * 3;
  const st = createUnit(s, 3, SETTLERS, x + 1, y);
  s.rng.state = seed;
  return { s, k, st };
}

const sameRng = (s: GameState) => {
  const r = mscRandom(0);
  r.state = s.rng.state ?? 0;
  return r;
};

describe('walka', () => {
  it('losowanie jak w oryginale: najpierw obrona, potem atak; wygrana, gdy atak > obrona', () => {
    for (let seed = 1; seed < 40; seed++) {
      const { s, k, st } = duel(seed);
      const r = sameRng(s);
      const d = r.next(8); // osadnicy: obrona 1 × łąka (2) × 4
      const a = r.next(UNITS[KNIGHTS]!.attack * 8);
      expect(attackUnit(s, 2, k, 3, st)).toBe(a > d ? 1 : 0);
    }
  });

  it('rycerze przegrywają z osadnikami na łące w ok. 14% walk, na górach w ok. 38%', () => {
    const lossRate = (terrain: number) => {
      let lost = 0;
      const n = 400;
      for (let seed = 1; seed <= n; seed++) {
        const { s, k, st } = duel(seed * 7919, terrain);
        if (attackUnit(s, 2, k, 3, st) === 0) lost++;
      }
      return lost / n;
    };
    // dokładnie: P(a ≤ d) dla a ∈ [0, 32), d ∈ [0, 8) = 36/256 ≈ 0,14; góry d ∈ [0, 24) = 300/768 ≈ 0,39
    expect(lossRate(Terrain.Grassland)).toBeGreaterThan(0.08);
    expect(lossRate(Terrain.Grassland)).toBeLessThan(0.2);
    expect(lossRate(Terrain.Mountains)).toBeGreaterThan(0.3);
    expect(lossRate(Terrain.Mountains)).toBeLessThan(0.47);
  });
});
