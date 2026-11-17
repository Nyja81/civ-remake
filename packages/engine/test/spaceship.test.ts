import { describe, expect, it } from 'vitest';
import {
  addSpaceshipPart, advanceToHuman, endHumanTurn, launchSpaceship, newGame, SPACESHIP_CELLS, spaceshipPartChoices, spaceshipStats,
  emptySpaceship, unitOrder,
} from '../src';

describe('statek kosmiczny', () => {
  it('pusty statek: masa 0, brak kolonistów, sukces 0 (brak energii)', () => {
    const st = spaceshipStats(emptySpaceship());
    expect(st.mass).toBe(0);
    expect(st.population).toBe(0);
    expect(st.success).toBe(0);
  });

  it('struktura, napęd, paliwo i moduły: masa, czas lotu i szansa wg ShowSpaceshipDialog', () => {
    const s = newGame({ seed: 5, difficulty: 1, civilizations: 3, nation: 1 });
    const p = s.humanPlayer;
    for (let i = 0; i < 33; i++) addSpaceshipPart(s, p, 0);
    for (const b of [3, 4, 6, 7, 8]) {
      const choice = spaceshipPartChoices(s, p, b < 6 ? 1 : 2).find((c) => c.bitmap === b)!;
      expect(choice.available).toBe(true);
      expect(addSpaceshipPart(s, p, b < 6 ? 1 : 2, b)).toBe(true);
    }
    const st = spaceshipStats(s.players[p]!.spaceship);
    expect(st.counts[6]).toBe(1);
    expect(st.support).toBe(100);
    expect(st.energy).toBe(100);
    expect(st.fuel).toBe(100);
    // masa = struktura (1 za część) + napęd 4 + paliwo 4 + moduły 16 + 16 + 4
    const structures = st.counts[0]! + st.counts[1]! + st.counts[2]!;
    expect(st.mass).toBe(structures + 4 + 4 + 16 + 16 + 4);
    expect(st.travelTime).toBe(Math.trunc((st.mass * 50) / 11));
    expect(st.success).toBe(Math.max(0, Math.min(100, 100 - (st.travelTime > 150 ? Math.trunc((st.travelTime - 150) / 10) : 0))));
    expect(s.spaceshipFlags & (1 << (p + 8))).not.toBe(0);
    expect(SPACESHIP_CELLS.length).toBe(67);
  });

  it('start i przylot w roku ETA kończy grę zwycięstwem statku', () => {
    const s = newGame({ seed: 6, difficulty: 1, civilizations: 3, nation: 1 });
    advanceToHuman(s);
    unitOrder(s, s.humanPlayer, 0, 'build');
    const p = s.humanPlayer;
    s.turn = 400;
    s.year = 1950;
    for (let i = 0; i < 33; i++) addSpaceshipPart(s, p, 0);
    for (const b of [3, 4, 6, 7, 8]) addSpaceshipPart(s, p, b < 6 ? 1 : 2, b);
    launchSpaceship(s, p);
    const eta = s.players[p]!.spaceshipEta;
    expect(eta).toBeGreaterThan(1950);
    s.events.length = 0;
    for (let i = 0; i < 100 && s.gameOver === 0; i++) endHumanTurn(s);
    expect(s.year).toBe(eta);
    expect(s.events.find((e) => e.kind === 'gameEnd')).toMatchObject({ reason: 'spaceship', winner: p });
  });
});
