import { describe, expect, it } from 'vitest';
import {
  advanceToHuman, cellIndex, createUnit, endHumanTurn, Improvement, MAP_HEIGHT, MAP_WIDTH, newGame, nextUnit,
  NO_UNIT, Terrain, terrainAt, turnToYear, unitMove, unitOrder, unitsAt, UnitStatus, DIRECTIONS, distance,
  type GameState,
} from '../src';

const game = (seed = 7, civs = 7) => newGame({ seed, difficulty: 1, civilizations: civs, nation: 1 });

/** Pole lądu obok (x,y) w danym kierunku albo -1. */
function landDirection(state: GameState, x: number, y: number): number {
  for (let d = 1; d < 9; d++) {
    const [dx, dy] = DIRECTIONS[d]!;
    const t = terrainAt(state.map, x + dx, y + dy);
    if (t !== Terrain.Water && t >= 0) return d;
  }
  return -1;
}

describe('nowa gra', () => {
  it('rozstawia po jednym osadniku każdej cywilizacji, daleko od siebie', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const s = game(seed);
      const starts: [number, number][] = [];
      for (let p = 1; p < 8; p++) {
        if (!(s.activeCivs & (1 << p))) continue;
        const units = s.players[p]!.units.filter((u) => u.type !== NO_UNIT);
        expect(units.length, `ziarno ${seed}, gracz ${p}`).toBe(1);
        expect(units[0]!.type).toBe(0);
        expect(terrainAt(s.map, units[0]!.x, units[0]!.y)).not.toBe(Terrain.Water);
        starts.push([units[0]!.x, units[0]!.y]);
      }
      expect(starts.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('jest deterministyczna dla ziarna', () => {
    const a = game(42);
    const b = game(42);
    expect(a.players.map((p) => [p.nation, p.units[0]!.x, p.units[0]!.y])).toEqual(b.players.map((p) => [p.nation, p.units[0]!.x, p.units[0]!.y]));
  });

  it('nacje komputera zajmują miejsca zgodne z numerem gracza', () => {
    const s = game(9);
    s.players.forEach((p, i) => {
      if (i > 0 && s.activeCivs & (1 << i)) expect(p.nation & 7).toBe(i);
    });
    expect(s.players[s.humanPlayer]!.nation).toBe(1);
  });

  it('dodaje czapy polarne i numeruje kontynenty', () => {
    const s = game(3);
    for (let x = 0; x < MAP_WIDTH; x++) {
      expect([Terrain.Arctic, Terrain.Tundra]).toContain(terrainAt(s.map, x, 0));
      expect([Terrain.Arctic, Terrain.Tundra]).toContain(terrainAt(s.map, x, MAP_HEIGHT - 1));
    }
    expect(s.map.continents[1]!.size).toBeGreaterThanOrEqual(s.map.continents[2]!.size);
    expect(s.map.continents[1]!.buildSiteCount).toBeGreaterThan(0);
  });

  it('odkrywa pola wokół osadnika gracza', () => {
    const s = game(11);
    const u = s.players[s.humanPlayer]!.units[0]!;
    for (let d = 0; d < 9; d++) {
      const [dx, dy] = DIRECTIONS[d]!;
      expect(s.map.explored[cellIndex(u.x + dx, u.y + dy)]! & (1 << s.humanPlayer)).not.toBe(0);
    }
  });
});

describe('ruch i rozkazy', () => {
  it('jednostka lądowa porusza się po lądzie i zużywa ruch', () => {
    const s = game(5);
    advanceToHuman(s);
    const h = s.humanPlayer;
    const u = s.players[h]!.units[0]!;
    expect(u.movesLeft).toBe(3);
    const d = landDirection(s, u.x, u.y);
    const before = [u.x, u.y];
    const r = unitMove(s, h, 0, d);
    if (r.kind === 'moved') {
      expect(distance(before[0]!, before[1]!, u.x, u.y)).toBe(1);
      expect(s.map.occupant[cellIndex(u.x, u.y)]).toBe(h | 8);
      expect(s.map.occupant[cellIndex(before[0]!, before[1]!)]).toBe(h);
    } else {
      expect(r.kind).toBe('blocked');
      expect(u.movesLeft).toBe(0);
    }
  });

  it('nie wchodzi lądem do wody bez statku', () => {
    const s = game(5);
    advanceToHuman(s);
    const h = s.humanPlayer;
    // ustaw osadnika nad wodą
    const map = s.map;
    let found = false;
    for (let i = 0; i < map.terrain.length && !found; i++) {
      const x = i % MAP_WIDTH;
      const y = Math.floor(i / MAP_WIDTH);
      if (y < 3 || y > 46 || map.terrain[i] === Terrain.Water) continue;
      for (let d = 1; d < 9; d++) {
        const [dx, dy] = DIRECTIONS[d]!;
        if (terrainAt(map, x + dx, y + dy) === Terrain.Water) {
          const id = createUnit(s, h, 2, x, y);
          s.players[h]!.units[id]!.movesLeft = 3;
          expect(unitMove(s, h, id, d).kind).toBe('blocked');
          found = true;
          break;
        }
      }
    }
    expect(found).toBe(true);
  });

  it('osadnik zakłada miasto, a miasto ma drogę i należy do gracza', () => {
    const s = game(8);
    advanceToHuman(s);
    const h = s.humanPlayer;
    const u = s.players[h]!.units[0]!;
    const { x, y } = u;
    unitOrder(s, h, 0, 'build');
    expect(s.players[h]!.units[0]!.type).toBe(NO_UNIT);
    const city = s.cities.findIndex((c) => c.status !== -1 && c.owner === h);
    expect(city).toBeGreaterThanOrEqual(0);
    expect(s.cities[city]!.x).toBe(x);
    expect(s.map.improvements[cellIndex(x, y)]! & (Improvement.City | Improvement.Road)).toBe(Improvement.City | Improvement.Road);
    expect(s.cities[city]!.buildings & 1).toBe(1); // pałac w pierwszym mieście
    expect(s.cityNames[s.cities[city]!.nameId]).toBe('Rome');
  });

  it('osadnik buduje drogę na równinie w 2 tury', () => {
    const s = game(8);
    advanceToHuman(s);
    const h = s.humanPlayer;
    const u = s.players[h]!.units[0]!;
    const i = cellIndex(u.x, u.y);
    s.map.terrain[i] = Terrain.Plains;
    unitOrder(s, h, 0, 'road');
    expect(u.status & UnitStatus.BuildRoad).not.toBe(0);
    expect(s.map.improvements[i]! & Improvement.Road).toBe(0);
    u.movesLeft = 3;
    unitOrder(s, h, 0, 'road');
    expect(s.map.improvements[i]! & Improvement.Road).toBe(0);
    u.movesLeft = 3;
    unitOrder(s, h, 0, 'road');
    expect(s.map.improvements[i]! & Improvement.Road).toBe(Improvement.Road);
  });

  it('fortyfikacja kończy się w następnej turze', () => {
    const s = game(12);
    advanceToHuman(s);
    const h = s.humanPlayer;
    const u = s.players[h]!.units[0]!;
    const id = createUnit(s, h, 2, u.x, u.y);
    unitOrder(s, h, id, 'fortify');
    expect(s.players[h]!.units[id]!.status & UnitStatus.Fortifying).not.toBe(0);
    endHumanTurn(s);
    unitOrder(s, h, 0, 'skip');
    expect(nextUnit(s, h)).toBe(-1);
    expect(s.players[h]!.units[id]!.status & UnitStatus.Fortified).not.toBe(0);
  });

  it('wygrana walka usuwa obrońcę, przegrana — atakującego', () => {
    const s = game(13);
    advanceToHuman(s);
    const h = s.humanPlayer;
    const u = s.players[h]!.units[0]!;
    const d = landDirection(s, u.x, u.y);
    const [dx, dy] = DIRECTIONS[d]!;
    let wins = 0;
    for (let k = 0; k < 40; k++) {
      const a = createUnit(s, h, 11, u.x, u.y); // Armor
      s.players[h]!.units[a]!.movesLeft = 9;
      const b = createUnit(s, 0, 1, u.x + dx, u.y + dy); // barbarzyńska milicja
      expect(b).toBeGreaterThanOrEqual(0);
      const r = unitMove(s, h, a, d);
      expect(r.kind).toBe('attacked');
      if (r.kind === 'attacked' && r.won) wins++;
      for (const i of unitsAt(s, 0, u.x + dx, u.y + dy)) s.players[0]!.units[i]!.type = NO_UNIT;
      s.map.occupant[cellIndex(u.x + dx, u.y + dy)] = 0;
      if (s.players[h]!.units[a]!.type !== NO_UNIT) s.players[h]!.units[a]!.type = NO_UNIT;
    }
    expect(wins).toBeGreaterThan(30);
  });
});

describe('tura i kalendarz', () => {
  it('lata jak w oryginale', () => {
    expect(turnToYear(0)).toBe(-4000);
    expect(turnToYear(200)).toBe(0);
    expect(turnToYear(250)).toBe(1000);
    expect(turnToYear(300)).toBe(1500);
    expect(turnToYear(350)).toBe(1750);
    expect(turnToYear(400)).toBe(1850);
  });

  it('koniec tury przesuwa rok o 20 lat i odnawia ruchy', () => {
    const s = game(21);
    advanceToHuman(s);
    const h = s.humanPlayer;
    unitOrder(s, h, 0, 'skip');
    expect(nextUnit(s, h)).toBe(-1);
    endHumanTurn(s);
    expect(s.turn).toBe(1);
    expect(s.year).toBe(-3980);
    expect(s.players[h]!.units[0]!.movesLeft).toBe(3);
    for (let i = 0; i < 199; i++) endHumanTurn(s);
    expect(s.year).toBe(1);
    endHumanTurn(s);
    expect(s.year).toBe(20);
  });
});

import { gotoDirection } from '../src';
describe('idź do', () => {
  it('omija wodę i dochodzi do celu', () => {
    const s = game(5);
    advanceToHuman(s);
    const h = s.humanPlayer;
    const u = s.players[h]!.units[0]!;
    // odkryj całą mapę i wybierz pole lądu na tym samym kontynencie w odległości ≥ 4
    s.map.explored.fill(0xffff);
    const g = s.map.group[cellIndex(u.x, u.y)];
    let target = -1;
    for (let i = 0; i < s.map.terrain.length; i++) {
      const x = i % 80, y = Math.floor(i / 80);
      if (s.map.terrain[i] !== Terrain.Water && s.map.group[i] === g && distance(u.x, u.y, x, y) >= 4 && distance(u.x, u.y, x, y) <= 8) { target = i; break; }
    }
    expect(target).toBeGreaterThanOrEqual(0);
    const tx = target % 80, ty = Math.floor(target / 80);
    for (let step = 0; step < 40 && (u.x !== tx || u.y !== ty); step++) {
      u.movesLeft = 3;
      const d = gotoDirection(s, h, 0, tx, ty);
      expect(d).toBeGreaterThan(0);
      unitMove(s, h, 0, d);
    }
    expect([u.x, u.y]).toEqual([tx, ty]);
  });
});
