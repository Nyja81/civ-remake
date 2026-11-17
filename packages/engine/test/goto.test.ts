import { describe, expect, it } from 'vitest';
import {
  createGameMap, createUnit, DIRECTIONS, getNextMove, loadGame, MAP_HEIGHT, MAP_WIDTH, moveUnit, mscRandom, newGame,
  NO_UNIT, saveGame, shortestDistance, Terrain, terrainAt, type GameMap, type GameState,
} from '../src';

const W = MAP_WIDTH;
const H = MAP_HEIGHT;

/** Świat syntetyczny: woda wszędzie, ląd tam, gdzie `land(x, y)`. */
function world(land: (x: number, y: number) => boolean) {
  const terrain = new Uint8Array(W * H).fill(Terrain.Water);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (land(x, y)) terrain[y * W + x] = Terrain.Grassland;
  return { terrain, riverVariant: new Uint8Array(W * H) };
}

/** Gra z podmienioną mapą syntetyczną i bez jednostek. */
function syntheticGame(land: (x: number, y: number) => boolean): GameState {
  const s = newGame({ seed: 3, difficulty: 1, civilizations: 3, nation: 1 });
  s.map = createGameMap(world(land), mscRandom(3), 3);
  for (const p of s.players) for (const u of p.units) u.type = NO_UNIT;
  return s;
}

/** Prowadzi jednostkę rozkazem „idź do” (jak PlayerTurn); zwraca przebytą drogę albo null, gdy GoTo zwróciło -1. */
function walk(s: GameState, player: number, id: number, tx: number, ty: number, maxSteps = 200): [number, number][] | null {
  const u = s.players[player]!.units[id]!;
  const path: [number, number][] = [[u.x, u.y]];
  for (let i = 0; i < maxSteps && (u.x !== tx || u.y !== ty); i++) {
    u.movesLeft = 3 * 3;
    u.gotoX = tx;
    u.gotoY = ty;
    const d = getNextMove(s, player, id);
    if (d === -1) return null;
    expect(d).toBeGreaterThan(0);
    const r = moveUnit(s, player, id, d);
    expect(r.kind, `krok ${i} z (${u.x},${u.y}) w kierunku ${d}`).toBe('moved');
    path.push([u.x, u.y]);
  }
  return path;
}

const bit = (arr: Uint8Array, sx: number, sy: number, d: number) => (arr[sx * 13 + sy]! >> (d - 1)) & 1;

/** Symetria bitów sąsiadów wewnątrz siatki 20×13 (szew mapy i brzegi — bez pary, jak w oryginale). */
function expectSymmetric(arr: Uint8Array, rows: number): void {
  for (let sx = 0; sx < 20; sx++) {
    for (let sy = 0; sy < rows; sy++) {
      for (let d = 1; d <= 8; d++) {
        const nx = sx + DIRECTIONS[d]![0];
        const ny = sy + DIRECTIONS[d]![1];
        if (nx < 0 || nx >= 20 || ny < 0 || ny >= rows) continue;
        const back = ((d + 3) & 7) + 1;
        expect(bit(arr, sx, sy, d), `(${sx},${sy}) kierunek ${d}`).toBe(bit(arr, nx, ny, back));
      }
    }
  }
}

describe('GoTo oryginału: tablice ścieżek', () => {
  it('losowe mapy: bity sąsiadów są symetryczne, ląd ma przejścia, szew wody połączony', () => {
    for (const seed of [1, 2, 3, 4]) {
      const s = newGame({ seed, difficulty: 1, civilizations: 5, nation: 1 });
      const { landPath, waterPath } = s.map;
      expectSymmetric(landPath, 13);
      expectSymmetric(waterPath, 12);
      expect(landPath.some((v) => v !== 0)).toBe(true);
      // ląd: tylko kierunki 1–4 ustawiane wprost, 5–8 jako odbicie — wschód z kolumny 19 bez pary
      for (let sy = 0; sy < 13; sy++) expect(landPath[sy]! & 0xe0, `kolumna 0, wiersz ${sy}`).toBe(0);
      // woda: wiersz 12 pusty, poprawki szwu (F7_0000_1440)
      for (let sx = 0; sx < 20; sx++) expect(waterPath[sx * 13 + 12]).toBe(0);
      for (let sy = 0; sy < 12; sy++) {
        expect(bit(waterPath, 0, sy, 7)).toBe(1);
        expect(bit(waterPath, 19, sy, 3)).toBe(1);
      }
      expect(bit(waterPath, 0, 0, 8)).toBe(0);
      expect(bit(waterPath, 0, 11, 6)).toBe(0);
      expect(bit(waterPath, 19, 0, 2)).toBe(0);
      expect(bit(waterPath, 19, 11, 4)).toBe(0);
    }
  });

  it('jeden kontynent z trawy: każde dwa sąsiednie bloki lądu połączone', () => {
    const s = syntheticGame((x, y) => x >= 8 && x < 72 && y >= 8 && y < 42);
    const land = s.map.landPath;
    // bloki 3..16 × 3..9 leżą w całości na lądzie: przejścia N, NE, E, SE do bloków lądu
    for (let sx = 3; sx < 17; sx++) {
      for (let sy = 3; sy < 9; sy++) {
        for (const d of [1, 2, 3, 4]) expect(bit(land, sx, sy, d), `(${sx},${sy}) ${d}`).toBe(1);
      }
    }
    // blok na otwartym oceanie nie ma przejść lądowych
    expect(land[0 * 13 + 0]).toBe(0);
    expectSymmetric(land, 13);
    expectSymmetric(s.map.waterPath, 12);
  });

  it('zapis zachowuje tablice i pamięć FindShortestPath; stary zapis — przeliczenie', () => {
    const s = newGame({ seed: 9, difficulty: 1, civilizations: 4, nation: 1 });
    const b = loadGame(saveGame(s));
    expect(Array.from(b.map.landPath)).toEqual(Array.from(s.map.landPath));
    expect(Array.from(b.map.waterPath)).toEqual(Array.from(s.map.waterPath));
    expect(b.map.gotoCache.lastX).toBe(s.map.gotoCache.lastX);
    expect(Array.from(b.map.gotoCache.costs)).toEqual(Array.from(s.map.gotoCache.costs));
    const old = JSON.parse(saveGame(s)) as { map: Record<string, unknown> };
    delete old.map.landPath;
    delete old.map.waterPath;
    delete old.map.gotoCache;
    const c = loadGame(JSON.stringify(old));
    expect(c.map.landPath.length).toBe(260);
    expect(c.map.waterPath.some((v) => v !== 0)).toBe(true);
    expectSymmetric(c.map.landPath, 13);
  });
});

describe('GoTo oryginału: ruch', () => {
  it('odległość F0_2dc4_0208: dłuższa różnica + połowa krótszej, z zawijaniem', () => {
    expect(shortestDistance(3, 1)).toBe(3);
    expect(shortestDistance(-1, 3)).toBe(3);
    expect(shortestDistance(4, 4)).toBe(6);
    expect(shortestDistance(79, 0)).toBe(1);
  });

  it('jednostka lądowa dochodzi do bliskiego celu (FindShortestPath)', () => {
    const s = syntheticGame((x, y) => x >= 8 && x < 72 && y >= 8 && y < 42);
    for (const player of [1, 2]) {
      const id = createUnit(s, player, 1, 20 + player * 20, 20);
      const path = walk(s, player, id, 26 + player * 20, 24);
      expect(path, `gracz ${player}`).not.toBeNull();
      // w oknie FindShortestPath droga jest najkrótsza: max(|Δx|, |Δy|) kroków
      expect(path!.length - 1).toBe(6);
    }
  });

  it('jednostka lądowa omija jezioro i dochodzi do dalekiego celu', () => {
    const lake = (x: number, y: number) => x >= 28 && x <= 31 && y >= 12 && y <= 30;
    const s = syntheticGame((x, y) => x >= 8 && x < 72 && y >= 8 && y < 42 && !lake(x, y));
    const id = createUnit(s, 2, 1, 22, 20);
    const path = walk(s, 2, id, 40, 21);
    expect(path).not.toBeNull();
    expect(path!.at(-1)).toEqual([40, 21]);
    for (const [x, y] of path!) expect(terrainAt(s.map, x, y)).not.toBe(Terrain.Water);
    expect(path!.length - 1).toBeLessThan(45);
  });

  it('statek płynie wzdłuż wybrzeża do odległego celu', () => {
    const s = syntheticGame((x, y) => x >= 10 && x < 60 && y >= 10 && y < 40);
    const id = createUnit(s, 2, 17, 9, 20); // Sail przy zachodnim brzegu
    const path = walk(s, 2, id, 35, 41); // przy południowym brzegu
    expect(path).not.toBeNull();
    expect(path!.at(-1)).toEqual([35, 41]);
    for (const [x, y] of path!) expect(terrainAt(s.map, x, y)).toBe(Terrain.Water);
    expect(path!.length - 1).toBeLessThan(80);
  });

  it('cel nieosiągalny: GoTo zwraca -1 i kasuje rozkaz', () => {
    // wyspa jednego pola i kontynent obok
    const s = syntheticGame((x, y) => (x === 5 && y === 25) || (x >= 10 && x < 60 && y >= 10 && y < 40));
    const id = createUnit(s, 2, 1, 5, 25);
    const u = s.players[2]!.units[id]!;
    u.gotoX = 20;
    u.gotoY = 25;
    u.movesLeft = 3;
    expect(getNextMove(s, 2, id)).toBe(-1);
    expect(u.gotoX).toBe(-1);
    // statek w zamkniętym jeziorze: krok zachłanny w stronę celu, przy brzegu zawrócenie kończy „idź do”
    const lake = (x: number, y: number) => x >= 30 && x <= 32 && y >= 20 && y <= 22;
    const t = syntheticGame((x, y) => x >= 10 && x < 60 && y >= 10 && y < 40 && !lake(x, y));
    const ship = createUnit(t, 2, 17, 31, 21);
    const path: [number, number][] = [];
    const sh = t.players[2]!.units[ship]!;
    let r = 0;
    for (let i = 0; i < 20; i++) {
      sh.movesLeft = 9;
      sh.gotoX = 5;
      sh.gotoY = 5;
      r = getNextMove(t, 2, ship);
      if (r === -1) break;
      moveUnit(t, 2, ship, r);
      path.push([sh.x, sh.y]);
    }
    expect(r).toBe(-1);
    expect(sh.gotoX).toBe(-1);
    for (const [x, y] of path) expect(lake(x, y)).toBe(true);
  });

  it('człowiek obok celu: krok wprost, cel X skasowany', () => {
    const s = syntheticGame((x, y) => x >= 8 && x < 72 && y >= 8 && y < 42);
    const h = s.humanPlayer;
    const id = createUnit(s, h, 1, 30, 30);
    const u = s.players[h]!.units[id]!;
    u.gotoX = 31;
    u.gotoY = 29;
    expect(getNextMove(s, h, id)).toBe(2);
    expect(u.gotoX).toBe(-1);
  });
});

describe('GoTo oryginału: mapa', () => {
  it('tablice istnieją dla mapy z createGameMap', () => {
    const m: GameMap = createGameMap(world(() => false), mscRandom(1), 1);
    expect(m.landPath.every((v) => v === 0)).toBe(true);
    // sam ocean: każdy blok wody 0–11 połączony we wszystkich kierunkach w obrębie wierszy 0–11
    expect(m.waterPath[5 * 13 + 5]).toBe(0xff);
  });
});
