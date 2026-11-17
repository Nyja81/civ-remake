import { describe, expect, it } from 'vitest';
import { addUnitPolicy, advanceToHuman, endHumanTurn, newGame, NO_UNIT, unitOrder, UnitRole } from '../src';

describe('przeciwnik komputerowy (AIEngine)', () => {
  it('lista celów jednostek jest posortowana malejąco wg wagi; cel z wagą nie mniejszą niż istniejący jest pomijany', () => {
    const s = newGame({ seed: 7, difficulty: 2, civilizations: 5, nation: 1 });
    const p = 2;
    s.players[p]!.unitPolicies.forEach((u) => { u.role = -1; u.policy = 0; });
    addUnitPolicy(s, p, 10, 10, UnitRole.Defense, 2);
    addUnitPolicy(s, p, 20, 20, UnitRole.LandAttack, 5);
    addUnitPolicy(s, p, 30, 30, UnitRole.Defense, 4);
    // PlayerAddUnitPolicy: pomija cel, gdy na liście jest ten sam z wagą <= nowej (dosłownie jak we wzorcu)
    addUnitPolicy(s, p, 10, 10, UnitRole.Defense, 3);
    addUnitPolicy(s, p, 20, 20, UnitRole.LandAttack, 1); // słabszy duplikat — dopisany
    const list = s.players[p]!.unitPolicies.filter((u) => u.role !== -1);
    expect(list.map((u) => u.policy)).toEqual([5, 4, 2, 1]);
    expect(list[0]).toMatchObject({ x: 20, y: 20, role: UnitRole.LandAttack });
  });

  it('komputer rozbudowuje się: po 150 turach ma wiele miast, barbarzyńcy nie gromadzą się bez końca', () => {
    for (const seed of [11, 12]) {
      const s = newGame({ seed, difficulty: 2, civilizations: 7, nation: 3 });
      advanceToHuman(s);
      unitOrder(s, s.humanPlayer, 0, 'build');
      for (let i = 0; i < 150 && s.gameOver === 0; i++) {
        s.events.length = 0;
        s.players[s.humanPlayer]!.units.forEach((u, id) => { if (u.type !== NO_UNIT) unitOrder(s, s.humanPlayer, id, 'fortify'); });
        endHumanTurn(s);
      }
      const aiCities = s.cities.filter((c) => c.status !== -1 && c.owner !== s.humanPlayer && c.owner !== 0).length;
      expect(aiCities, `ziarno ${seed}`).toBeGreaterThan(10);
      expect(s.players[0]!.units.filter((u) => u.type !== NO_UNIT).length, `ziarno ${seed}`).toBeLessThan(40);
    }
  });
});
