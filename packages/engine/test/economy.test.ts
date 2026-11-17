import { describe, expect, it } from 'vitest';
import {
  advanceToHuman, cellIndex, chooseResearch, endHumanTurn, Improvement, newGame, NO_UNIT, processCity, researchOptions,
  Resource, Terrain, tileResource, unitOrder, type GameState,
} from '../src';

function foundCapital(seed: number): { s: GameState; city: number } {
  const s = newGame({ seed, difficulty: 1, civilizations: 5, nation: 1 });
  advanceToHuman(s);
  unitOrder(s, s.humanPlayer, 0, 'build');
  const city = s.cities.findIndex((c) => c.status !== -1 && c.owner === s.humanPlayer);
  return { s, city };
}

describe('gospodarka miast', () => {
  it('pole miasta ma nawodnienie i drogę, plony liczone jak w oryginale', () => {
    const { s, city } = foundCapital(31);
    const c = s.cities[city]!;
    const t = s.map.terrain[cellIndex(c.x, c.y)]!;
    const imp = s.map.improvements[cellIndex(c.x, c.y)]!;
    expect(imp & Improvement.Road).not.toBe(0);
    if (t === Terrain.Grassland || t === Terrain.Plains) {
      expect(imp & Improvement.Irrigation).not.toBe(0);
      // despotyzm: plon > 2 zmniejszony o 1
      expect(tileResource(s, s.humanPlayer, city, c.x, c.y, Resource.Food)).toBeLessThanOrEqual(3);
    }
  });

  it('miasto rośnie, produkuje i gracz zbiera złoto przez 60 tur', () => {
    const { s, city } = foundCapital(32);
    const h = s.humanPlayer;
    s.players[h]!.researching = researchOptions(s)[0] ?? -1;
    for (let i = 0; i < 60; i++) {
      for (const e of s.events) if (e.kind === 'chooseResearch') chooseResearch(s, (e.options as number[])[0]!);
      s.events.length = 0;
      for (const [id, u] of s.players[h]!.units.entries()) if (u.type !== NO_UNIT) unitOrder(s, h, id, 'sentry');
      endHumanTurn(s);
    }
    const c = s.cities[city]!;
    expect(c.status).not.toBe(-1);
    expect(c.size).toBeGreaterThan(1);
    expect(s.players[h]!.units.filter((u) => u.type !== NO_UNIT).length).toBeGreaterThan(0);
    expect(s.players[h]!.gold).toBeGreaterThan(0);
    // nauka: komputer odkrywa technologie (człowiek przy 1 handlu w stolicy ma 0 nauki — zaokrąglenie jak w oryginale)
    expect(s.players.some((p, i) => i !== h && p.techs.some(Boolean))).toBe(true);
    // komputer też założył miasta
    const aiCities = s.cities.filter((x) => x.status !== -1 && x.owner !== h).length;
    expect(aiCities).toBeGreaterThan(0);
  });

  it('raport miasta: handel = korupcja + luksus + podatek + nauka (bez budynków)', () => {
    const { s, city } = foundCapital(33);
    const r = processCity(s, city, 1)!;
    expect(r.trade).toBe(r.corruption + r.luxury + r.tax + r.science);
    expect(r.workers + r.specialists).toBe(s.cities[city]!.size);
  });
});
