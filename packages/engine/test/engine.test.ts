import { describe, expect, it } from 'vitest';
import { MovementType, MscRand, Tech, TECHS, TERRAIN, UnitRole, UNITS } from '../src';

describe('MscRand', () => {
  it('daje znany ciąg Microsoft C rand() dla ziarna 1', () => {
    const rng = new MscRand(1);
    const got = Array.from({ length: 10 }, () => rng.next());
    expect(got).toEqual([41, 18467, 6334, 26500, 19169, 15724, 11478, 29358, 26962, 24464]);
  });

  it('odtwarza ciąg po przywróceniu stanu', () => {
    const a = new MscRand(1991);
    a.next();
    const saved = a.state;
    const expected = [a.next(), a.next(), a.next()];
    const b = new MscRand();
    b.state = saved;
    expect([b.next(), b.next(), b.next()]).toEqual(expected);
  });
});

describe('tabele danych', () => {
  it('ma 28 jednostek o kolejnych identyfikatorach', () => {
    expect(UNITS).toHaveLength(28);
    UNITS.forEach((u, i) => expect(u.id).toBe(i));
  });

  it('ma 24 typy terenu: 12 podstawowych i 12 z zasobem', () => {
    expect(TERRAIN).toHaveLength(24);
    for (let i = 0; i < 12; i++) {
      // wariant z zasobem zachowuje koszt ruchu i obronę terenu podstawowego
      expect(TERRAIN[i + 12]!.movementCost).toBe(TERRAIN[i]!.movementCost);
      expect(TERRAIN[i + 12]!.defenseBonus).toBe(TERRAIN[i]!.defenseBonus);
    }
  });

  it('każda jednostka odwołuje się do istniejących technologii i ról', () => {
    const techIds = new Set<number>(Object.values(Tech));
    const roles = new Set<number>(Object.values(UnitRole));
    const movement = new Set<number>(Object.values(MovementType));
    for (const u of UNITS) {
      expect(techIds.has(u.requiredTech), u.name).toBe(true);
      expect(techIds.has(u.obsoleteTech), u.name).toBe(true);
      expect(roles.has(u.role), u.name).toBe(true);
      expect(movement.has(u.movementType), u.name).toBe(true);
    }
  });

  it('drzewo technologii jest spójne i da się je całe odkryć', () => {
    expect(TECHS).toHaveLength(67);
    const known = new Set<number>();
    let progress = true;
    while (progress) {
      progress = false;
      for (const t of TECHS) {
        if (known.has(t.id)) continue;
        const ok = [t.prereq1, t.prereq2].every((p) => p === Tech.None || known.has(p));
        if (ok) {
          known.add(t.id);
          progress = true;
        }
      }
    }
    expect(known.size).toBe(TECHS.length);
  });
});
