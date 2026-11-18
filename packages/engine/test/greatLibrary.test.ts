import { describe, expect, it } from 'vitest';
import { advanceToHuman, foundCity, newGame, playerHasTech, researchFinished, Tech } from '../src';

describe('Wielka Biblioteka (F0_1ade_1d2e, 0x1ade:0x2254)', () => {
  function setup(owner: number) {
    const s = newGame({ seed: 77, difficulty: 1, civilizations: 7, nation: 1 });
    advanceToHuman(s);
    s.turn = 10;
    const u = s.players[owner === 0 ? s.humanPlayer : owner]!.units[0]!;
    const city = foundCity(s, owner, u.x, u.y, 1);
    s.wonderCity[5] = city;
    for (const p of s.players) p.techs[Tech.Masonry] = false;
    return s;
  }

  it('właściciel działającego cudu dostaje technologię znaną dwóm cywilizacjom', () => {
    const s = setup(2);
    researchFinished(s, 3, 3, Tech.Masonry);
    expect(playerHasTech(s, 2, Tech.Masonry)).toBe(false);
    researchFinished(s, 4, 4, Tech.Masonry);
    expect(playerHasTech(s, 2, Tech.Masonry)).toBe(true);
    expect(s.players[2]!.techSource?.[Tech.Masonry]).toBe(-2);
  });

  it('miasto z cudem u barbarzyńców: bez nieskończonej rekurencji', () => {
    const s = setup(0);
    researchFinished(s, 3, 3, Tech.Masonry);
    researchFinished(s, 4, 4, Tech.Masonry);
    expect(playerHasTech(s, 4, Tech.Masonry)).toBe(true);
  });
});
