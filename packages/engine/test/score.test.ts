import { describe, expect, it } from 'vitest';
import { advanceToHuman, civilizationScore, endHumanTurn, newGame, unitOrder, type GameState } from '../src';

function start(): GameState {
  const s = newGame({ seed: 41, difficulty: 2, civilizations: 5, nation: 1 });
  advanceToHuman(s);
  unitOrder(s, s.humanPlayer, 0, 'build');
  return s;
}

describe('punktacja i koniec gry', () => {
  it('wynik: mieszkańcy, cuda (20), zanieczyszczenie (−10), pokój (3/turę, max 100)', () => {
    const s = start();
    const city = s.cities.findIndex((c) => c.status !== -1 && c.owner === s.humanPlayer);
    const base = civilizationScore(s, s.humanPlayer);
    expect(base.citizens).toBeGreaterThanOrEqual(1);
    s.wonderCity[3] = city;
    s.pollutedSquares = 2;
    s.year = 100;
    s.peaceTurns = 50;
    const r = civilizationScore(s, s.humanPlayer);
    expect(r.wonders).toBe(20);
    expect(r.pollution).toBe(-20);
    expect(r.peace).toBe(100);
    expect(r.total).toBe(Math.max(0, r.citizens + 20 - 20 + 100));
    expect(r.bonus).toBe(-1);
  });

  it('koniec panowania w roku 2100 − 20·poziom', () => {
    const s = start();
    s.turn = 500;
    s.year = 2100 - 20 * s.difficulty - 1;
    s.events.length = 0;
    endHumanTurn(s);
    expect(s.gameOver).toBe(2);
    const end = s.events.find((e) => e.kind === 'gameEnd');
    expect(end).toMatchObject({ reason: 'retirement', canContinue: true });
    expect(s.events.some((e) => typeof e.text === 'string' && e.text.includes('6000 year reign'))).toBe(true);
  });

  it('podbój świata: koniec tury bez ruchów pozostałych graczy, premia za podbój', () => {
    const s = start();
    s.gameOver = 1;
    s.events.length = 0;
    const turn = s.turn;
    endHumanTurn(s);
    expect(s.turn).toBe(turn + 1);
    expect(s.gameOver).toBe(2);
    const end = s.events.find((e) => e.kind === 'gameEnd');
    expect(end).toMatchObject({ reason: 'conquest', canContinue: false });
    expect(end!.score).toBe((550 - s.turn) * 2 + s.aiOpponents * 100 + 400);
  });
});

import { addHallOfFameEntry, emptyHallOfFame, famousPersonIndex } from '../src';
describe('Hall of Fame', () => {
  it('wstawianie wg wynik × (poziom + 2); słabszy wpis i tak trafia na koniec', () => {
    const t = emptyHallOfFame();
    const e = (score: number, d = 0) => ({ ...emptyHallOfFame()[0]!, totalScore: score, difficulty: d });
    expect(addHallOfFameEntry(t, e(100))).toBe(0);
    expect(addHallOfFameEntry(t, e(60, 2))).toBe(0); // 240 > 200
    expect(t.map((x) => x.totalScore).slice(0, 3)).toEqual([60, 100, -1]);
    for (let i = 0; i < 4; i++) addHallOfFameEntry(t, e(500));
    expect(addHallOfFameEntry(t, e(1))).toBe(5);
    expect(t[5]!.totalScore).toBe(1);
  });

  it('postać sławna: ostatnie i, dla którego i²/3 < ocena', () => {
    expect(famousPersonIndex(0, 0)).toBe(-1);
    expect(famousPersonIndex(50, 0)).toBe(0); // ocena 1: i=1 (0 < 1)
    expect(famousPersonIndex(100, 0)).toBe(1); // ocena 2: i=2 (1 < 2)
    expect(famousPersonIndex(100000, 4)).toBe(19);
  });
});
