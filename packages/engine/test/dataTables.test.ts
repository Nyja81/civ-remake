/**
 * Spójność tablic generowanych z CIV.EXE (data/ruleTables, data/names) z resztą danych — bez pliku gry.
 * Porównanie z samym CIV.EXE: packages/oracle/test/original.test.ts (CIV1_DIR).
 */
import { describe, expect, it } from 'vitest';
import {
  addSpaceshipPart, DIRECTIONS, FAMOUS_PERSONS, LEADER_TITLES, MOVE_DIRECTIONS, newGame, PIXEL_TERRAIN, SPACESHIP_CELLS,
  SPACESHIP_HEIGHT, SPACESHIP_PARTS, SPACESHIP_WIDTH, TECH_AI_GRADES, TERRAIN, TERRAIN_MODIFICATIONS,
} from '../src';

describe('tablice z CIV.EXE', () => {
  it('piksel → teren jest odwrotnością terrainChangeId z tabeli terenu', () => {
    for (let t = 0; t < 12; t++) expect(PIXEL_TERRAIN[TERRAIN[t]!.terrainChangeId]).toBe(t);
    expect(PIXEL_TERRAIN.filter((t) => t >= 0)).toHaveLength(12);
  });

  it('przekształcenie terenu nawadnianiem/kopalnią prowadzi do istniejącego terenu', () => {
    for (const m of TERRAIN_MODIFICATIONS) {
      if (m.irrigationEffect >= 0) expect(PIXEL_TERRAIN[m.irrigationEffect]).toBeGreaterThanOrEqual(0);
      if (m.miningEffect >= 0) expect(PIXEL_TERRAIN[m.miningEffect]).toBeGreaterThanOrEqual(0);
    }
  });

  it('kierunki generatora świata to początek 49 kierunków oryginału', () => {
    expect(MOVE_DIRECTIONS).toEqual(DIRECTIONS.slice(0, 22));
    expect(DIRECTIONS).toHaveLength(49);
  });

  it('współczynniki technologii: 72 pozycje, przyszłe technologie bez oceny', () => {
    expect(TECH_AI_GRADES).toHaveLength(72);
    expect(TECH_AI_GRADES.slice(67)).toEqual([[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]]);
  });

  it('tytuł króla ma w CIV.EXE spację na końcu (miejsce na „Queen” w rozmowie z Elżbietą)', () => {
    expect(LEADER_TITLES[2]).toBe('King ');
    expect(FAMOUS_PERSONS[13]).toBe('Sulayman the Magnificent');
  });

  it('plan statku: 67 pól w obrębie 15×12, rysunki części istnieją', () => {
    expect(SPACESHIP_CELLS).toHaveLength(67);
    for (const [x, y, b] of SPACESHIP_CELLS) {
      expect(x).toBeLessThan(SPACESHIP_WIDTH);
      expect(y).toBeLessThan(SPACESHIP_HEIGHT);
      expect(SPACESHIP_PARTS[b]).toBeDefined();
    }
  });

  it('struktura (11, 8) należy do drugiej połowy planu (wzorzec miał ją jako 17. pole pierwszej połowy)', () => {
    const s = newGame({ seed: 5, difficulty: 1, civilizations: 3, nation: 1 });
    const p = s.humanPlayer;
    const firstHalf = SPACESHIP_CELLS.slice(0, 33).filter(([, , b]) => b < 3).length;
    for (let i = 0; i < firstHalf; i++) addSpaceshipPart(s, p, 0);
    const ship = s.players[p]!.spaceship;
    expect(ship[11 * SPACESHIP_HEIGHT + 9]).toBe(1);
    expect(ship[11 * SPACESHIP_HEIGHT + 8]).toBe(-1);
    expect(SPACESHIP_CELLS.findIndex(([x, y]) => x === 11 && y === 8)).toBe(43);
  });
});
