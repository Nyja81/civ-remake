import { describe, expect, it } from 'vitest';
import { advanceToHuman, chooseResearch, endHumanTurn, newGame, NO_UNIT, unitOrder, setGovernment, type GameState } from '../src';

/** Rozgrywa n tur, w których człowiek tylko pomija ruchy (wybierając pierwszą proponowaną technologię). */
function play(s: GameState, turns: number): void {
  const h = s.humanPlayer;
  for (let i = 0; i < turns && s.gameOver === 0; i++) {
    for (const e of s.events) {
      if (e.kind === 'chooseResearch') chooseResearch(s, (e.options as number[] | undefined)?.[0] ?? -1);
      if (e.kind === 'chooseGovernment') setGovernment(s, h, (e.options as number[])[0]!);
    }
    s.events.length = 0;
    s.players[h]!.units.forEach((u, id) => { if (u.type !== NO_UNIT) unitOrder(s, h, id, 'skip'); });
    endHumanTurn(s);
  }
}

describe('symulacja wielu tur', () => {
  it('200 tur bez błędów; niezmienniki stanu zachowane', () => {
    for (const seed of [101, 202, 303]) {
      const s = newGame({ seed, difficulty: 2, civilizations: 7, nation: 3 });
      advanceToHuman(s);
      unitOrder(s, s.humanPlayer, 0, 'build');
      play(s, 200);
      s.players.forEach((p, pi) => p.units.forEach((u) => {
        if (u.type === NO_UNIT) return;
        expect(s.map.occupant[u.y * 80 + u.x]! & 8, `ziarno ${seed}`).toBe(8);
        expect(s.map.occupant[u.y * 80 + u.x]! & 7).toBe(pi);
      }));
      for (const c of s.cities) if (c.status !== -1) {
        expect(c.size).toBeGreaterThan(0);
        expect(s.map.improvements[c.y * 80 + c.x]! & 1).toBe(1);
      }
      const aiCities = s.cities.filter((c) => c.status !== -1 && c.owner !== s.humanPlayer).length;
      expect(aiCities, `ziarno ${seed}`).toBeGreaterThan(3);
      expect(s.year).toBeGreaterThan(0);
    }
  });
});

import { loadGame, saveGame } from '../src';
describe('zapis gry', () => {
  it('zapis i odczyt dają identyczny dalszy przebieg', () => {
    const a = newGame({ seed: 515, difficulty: 1, civilizations: 5, nation: 2 });
    advanceToHuman(a);
    unitOrder(a, a.humanPlayer, 0, 'build');
    play(a, 30);
    const b = loadGame(saveGame(a));
    play(a, 40);
    play(b, 40);
    expect(saveGame(b)).toBe(saveGame(a));
  });
});
