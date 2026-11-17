/**
 * Mapa gry: warstwy oryginału i etapy 6–8 generatora (kontynenty i oceany, atrakcyjność pól pod miasta,
 * czapy polarne). Źródło: GenerateNewMap i MapManagement z OpenCivOne (MIT).
 */
import { MAP_HEIGHT, MAP_WIDTH } from '../data/enums';
import { TERRAIN } from '../data/terrain';
import { TERRAIN_MODIFICATIONS } from '../data/terrainModifications';
import { hasSpecialResource } from '../world/features';
import { MOVE_DIRECTIONS, Terrain, type World } from '../world/generate';
import type { RandomSource } from '../world/random';
import type { Continent, GameMap } from './types';

export const X_MEDIAN = MAP_WIDTH / 2;

/**
 * 49 kierunków oryginału (OpenCivOneGameGlobals.MoveDirections): 0 = brak ruchu, 1–8 sąsiedzi od północy
 * zgodnie z ruchem wskazówek zegara, 9–24 pierścień o promieniu 2, 25–48 pierścień o promieniu 3.
 */
export const DIRECTIONS: readonly (readonly [number, number])[] = [
  [0, 0], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1],
  [0, -2], [1, -2], [2, -1], [2, 0], [2, 1], [1, 2], [0, 2], [-1, 2], [-2, 1], [-2, 0], [-2, -1], [-1, -2],
  [2, 2], [2, -2], [-2, -2], [-2, 2],
  [0, -3], [1, -3], [2, -3], [3, -2], [3, -1], [3, 0], [3, 1], [3, 2], [2, 3], [1, 3], [0, 3], [-1, 3],
  [-2, 3], [-3, 2], [-3, 1], [-3, 0], [-3, -1], [-3, -2], [-2, -3], [-1, -3], [3, 3], [3, -3], [-3, 3], [-3, -3],
];

/** 21 pól wokół miasta (kolejność jak w oryginale; ostatnie = samo miasto). */
export const CITY_OFFSETS: readonly (readonly [number, number])[] = [
  [0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1], [0, -2],
  [2, 0], [0, 2], [-2, 0], [-1, -2], [1, -2], [2, -1], [2, 1], [1, 2], [-1, 2],
  [-2, 1], [-2, -1], [0, 0],
];

export const wrapX = (x: number): number => ((x % MAP_WIDTH) + MAP_WIDTH) % MAP_WIDTH;
export const isValid = (x: number, y: number): boolean => y >= 0 && y < MAP_HEIGHT;
export const cellIndex = (x: number, y: number): number => y * MAP_WIDTH + wrapX(x);

/** Teren pola; poza mapą w pionie zwraca -1. */
export function terrainAt(map: GameMap, x: number, y: number): number {
  return isValid(x, y) ? map.terrain[cellIndex(x, y)]! : -1;
}

/** Przesunięcie z (x1,y1) do (x2,y2) z uwzględnieniem zawijania mapy (GetDistanceOffset). */
export function offsetBetween(x1: number, y1: number, x2: number, y2: number): [number, number] {
  let dx = x2 - x1;
  if (x1 < x2 && dx > X_MEDIAN) dx = x2 - (x1 + MAP_WIDTH);
  else if (x1 > x2 && x1 - x2 > X_MEDIAN) dx = x2 + MAP_WIDTH - x1;
  return [dx, y2 - y1];
}

/** Odległość w polach (maksimum z różnic, z zawijaniem w poziomie). */
export function distance(x1: number, y1: number, x2: number, y2: number): number {
  const [dx, dy] = offsetBetween(x1, y1, x2, y2);
  let w = Math.abs(dx);
  if (w > X_MEDIAN) w = MAP_WIDTH - w;
  return Math.max(w, Math.abs(dy));
}

/** Kierunek ruchu (indeks w MOVE_DIRECTIONS) dla przesunięcia albo -1. */
export function directionOf(dx: number, dy: number): number {
  const nx = wrapX(dx + X_MEDIAN) - X_MEDIAN;
  return MOVE_DIRECTIONS.findIndex(([x, y]) => x === nx && y === dy);
}

/** UpdateVisibleCellStatus: gracz-człowiek widzi aktualne ulepszenia pola. */
export function updateVisibleCell(map: GameMap, x: number, y: number): void {
  const i = cellIndex(x, y);
  map.visibleImprovements[i] = map.improvements[i]!;
}

export function terrainWithResource(map: GameMap, x: number, y: number, seed: number): number {
  const t = terrainAt(map, x, y);
  return t >= 0 && hasSpecialResource(wrapX(x), y, seed) ? t + 12 : t;
}

const emptyGroups = (n: number): Continent[] => Array.from({ length: n }, () => ({ size: 0, buildSiteCount: 0 }));

/**
 * Tworzy mapę gry z wygenerowanego świata (losowego albo Ziemi) i wykonuje etapy 6–8 generatora.
 * `rng` musi być tym samym źródłem, którego użył generator (oryginał losuje dalej z tego samego ciągu).
 */
export function createGameMap(world: World, rng: RandomSource, seed: number): GameMap {
  const n = MAP_WIDTH * MAP_HEIGHT;
  const map: GameMap = {
    terrain: Uint8Array.from(world.terrain),
    riverVariant: Uint8Array.from(world.riverVariant),
    improvements: new Uint8Array(n),
    visibleImprovements: new Uint8Array(n),
    group: new Uint8Array(n),
    buildScore: new Uint8Array(n),
    landOwner: new Uint8Array(n),
    occupant: new Uint8Array(n),
    explored: new Uint16Array(n),
    continents: emptyGroups(16),
    oceans: emptyGroups(16),
  };
  // Znacznik wariantu rzeki to w oryginale bit 0x80 warstwy ulepszeń.
  for (let i = 0; i < n; i++) if (map.riverVariant[i]) map.improvements[i] = map.visibleImprovements[i] = 0x80;
  buildGroups(map);
  scoreBuildSites(map, seed);
  addPolarCaps(map, rng);
  return map;
}

/** Etap 6: numeracja kontynentów (przebieg 0) i oceanów (przebieg 1), 14 największych dostaje numery 1–14, reszta 15. */
function buildGroups(map: GameMap): void {
  const ids = new Int32Array(MAP_WIDTH * MAP_HEIGHT);
  for (let pass = 0; pass < 2; pass++) {
    const sizes = new Array<number>(256).fill(0);
    ids.fill(0);
    let newId = 0;
    for (let y = 0; y < MAP_HEIGHT; y++) {
      let current = -1;
      let keep = false;
      for (let x = 0; x < MAP_WIDTH; x++) {
        const isLand = map.terrain[y * MAP_WIDTH + x] !== Terrain.Water;
        if (isLand !== (pass === 0)) {
          keep = false;
          current = -1;
          continue;
        }
        if (y > 0) {
          // sąsiedzi z poprzedniego wiersza: x-1, x, x+1 (bez zawijania, jak w oryginale)
          for (let ox = x !== 0 ? -1 : 0; ox <= (x >= MAP_WIDTH - 1 ? 0 : 1); ox++) {
            const g = ids[(y - 1) * MAP_WIDTH + x + ox]!;
            if (g === 0) continue;
            if (current !== -1 && current !== g) {
              for (let i = 0; i < (y + 1) * MAP_WIDTH; i++) if (ids[i] === current) ids[i] = g;
              sizes[g]! += sizes[current]!;
              sizes[current] = 0;
            }
            current = g;
          }
        }
        if (current === -1) {
          if (!keep) {
            newId = 1;
            while (sizes[newId]! !== 0) newId++;
          }
          current = newId;
        }
        ids[y * MAP_WIDTH + x] = current;
        sizes[current]!++;
        keep = true;
      }
    }
    // Ranking: grupy o numerach 1–63 sortowane malejąco wg wielkości (stabilnie), 14 pierwszych → 1–14.
    const order = new Array<number>(16).fill(0);
    const remap = new Array<number>(256).fill(15);
    remap[0] = 0;
    for (let j = 1; j < 64; j++) {
      let k = 1;
      while (k < 15 && sizes[order[k]!]! >= sizes[j]!) k++;
      if (k < 15) {
        for (let m = 15; m > k; m--) {
          remap[order[m - 1]!] = m;
          order[m] = order[m - 1]!;
        }
        remap[j] = k;
        order[k] = j;
      }
    }
    remap[0] = 0;
    for (let i = 0; i < ids.length; i++) {
      const g = remap[ids[i]!]!;
      if (g !== 0) map.group[i] = g;
    }
    const target = pass === 0 ? map.continents : map.oceans;
    for (let k = 1; k < 15; k++) target[k]!.size = sizes[order[k]!]!;
    target[0]!.size = 0;
    target[15]!.size = 1;
  }
}

/** Etap 7: atrakcyjność pól pod miasta (warstwa używana przy rozstawianiu cywilizacji i przez komputer). */
function scoreBuildSites(map: GameMap, seed: number): void {
  const coefficient = TERRAIN.map((t, i) => {
    const mod = TERRAIN_MODIFICATIONS[i % 12]!;
    let c = t.trade + 3 * t.food;
    if (i % 12 !== Terrain.Grassland && i % 12 !== Terrain.River) c += t.production * 2;
    if (mod.miningEffect >= 0) {
      if (mod.irrigationEffect < 0) c += (-1 - mod.irrigationEffect) * 2;
    } else {
      c += -1 - mod.miningEffect;
    }
    return c;
  });
  for (const c of map.continents) c.buildSiteCount = 0;
  for (let x = 2; x < 78; x++) {
    for (let y = 2; y < 48; y++) {
      const i = y * MAP_WIDTH + x;
      const t = map.terrain[i]!;
      if (t !== Terrain.River && t !== Terrain.Grassland && t !== Terrain.Plains) {
        map.buildScore[i] = 0;
        continue;
      }
      let total = 0;
      for (let k = 0; k < 21; k++) {
        const [ox, oy] = CITY_OFFSETS[k]!;
        const nx = x + ox;
        const ny = y + oy;
        let nt = terrainAt(map, nx, ny);
        let score = 0;
        if ((nt === Terrain.Grassland || nt === Terrain.River) && ((7 * nx + 11 * ny) & 2) === 0) score += 2;
        if (hasSpecialResource(nx, ny, seed)) nt += 12;
        score += coefficient[nt]!;
        if (k < 9) score += score;
        if (k === 0) score += score;
        total += score;
      }
      if (t !== Terrain.Plains && ((7 * x + 11 * y) & 2) !== 0) total -= 16;
      const clamped = Math.min(15, Math.max(1, Math.trunc((total - 120) / 8)));
      const value = Math.trunc(clamped / 2) + 8;
      map.buildScore[i] = value;
      map.landOwner[i] = value; // oryginał zapisuje tę samą wartość także w warstwie własności ziemi
      map.continents[map.group[i]!]!.buildSiteCount++;
    }
  }
}

/** Etap 8: czapy polarne. */
function addPolarCaps(map: GameMap, rng: RandomSource): void {
  const set = (x: number, y: number, t: number) => {
    map.terrain[cellIndex(x, y)] = t;
  };
  for (let x = 0; x < MAP_WIDTH; x++) {
    set(x, 0, Terrain.Arctic);
    set(x, MAP_HEIGHT - 1, Terrain.Arctic);
  }
  for (let i = 0; i < 20; i++) {
    set(rng.next(80), 0, Terrain.Tundra);
    set(rng.next(80), 1, Terrain.Tundra);
    const x = rng.next(80);
    if (terrainAt(map, x, 47) === Terrain.Water && terrainAt(map, x - 1, 47) === Terrain.Water && terrainAt(map, x + 1, 47) === Terrain.Water) {
      set(x, 48, Terrain.Tundra);
    }
    set(rng.next(80), 49, Terrain.Tundra);
  }
}
