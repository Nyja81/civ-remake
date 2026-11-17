/**
 * Generator świata — etapy 1–5 (lądy, temperatura, klimat, wiek planety, rzeki).
 *
 * Źródło: funkcja GenerateNewMap z projektu OpenCivOne (MIT), czyli czytelne przepisanie kodu oryginału.
 * STAN WERYFIKACJI: logika przeniesiona krok po kroku, ale jeszcze nieporównana z dosłownym tłumaczeniem
 * oryginału ani z samym oryginałem (m.in. sposób losowania zakresów). Do czasu porównania nie gwarantujemy,
 * że to samo ziarno da tę samą mapę co w oryginale.
 */
import { MAP_HEIGHT, MAP_WIDTH } from '../data/enums';
import { DIRECTIONS } from '../data/ruleTables';
import type { RandomSource } from './random';

export const Terrain = {
  Desert: 0, Plains: 1, Grassland: 2, Forest: 3, Hills: 4, Mountains: 5,
  Tundra: 6, Arctic: 7, Swamp: 8, Jungle: 9, Water: 10, River: 11,
} as const;
export type Terrain = (typeof Terrain)[keyof typeof Terrain];

/** Kierunki z oryginału (DIRECTIONS z CIV.EXE): 0 = brak ruchu, 1–8 sąsiedzi od północy zgodnie z ruchem wskazówek zegara, 9–20 = pierścień w odległości 2, 21 = (2,2). */
export const MOVE_DIRECTIONS: readonly (readonly [number, number])[] = DIRECTIONS.slice(0, 22);

export interface WorldOptions {
  /** 0 = mało lądu, 1 = normalnie, 2 = dużo. */
  readonly landMass: number;
  /** 0 = chłodno, 1 = umiarkowanie, 2 = ciepło. */
  readonly temperature: number;
  /** 0 = sucho, 1 = normalnie, 2 = wilgotno. */
  readonly climate: number;
  /** 0 = 3 mld lat, 1 = 4 mld, 2 = 5 mld. */
  readonly age: number;
}

export const DEFAULT_WORLD: WorldOptions = { landMass: 1, temperature: 1, climate: 1, age: 1 };

export interface World {
  /** Typ terenu, indeks = y * MAP_WIDTH + x. */
  readonly terrain: Uint8Array;
  /** 1 tam, gdzie oryginał ustawia przy rzece znacznik wariantu rysunku (bit 0x80 ulepszeń terenu). */
  readonly riverVariant: Uint8Array;
}

const wrapX = (x: number) => ((x % MAP_WIDTH) + MAP_WIDTH) % MAP_WIDTH;

export function generateWorld(rng: RandomSource, options: WorldOptions = DEFAULT_WORLD): World {
  const terrain = new Uint8Array(MAP_WIDTH * MAP_HEIGHT).fill(Terrain.Water);
  const riverVariant = new Uint8Array(MAP_WIDTH * MAP_HEIGHT);
  // Poza zakresem pionowym oryginał czyta „brak terenu” (piksel 0), a zapis nie zmienia mapy.
  const get = (x: number, y: number): number => (y < 0 || y >= MAP_HEIGHT ? -1 : terrain[y * MAP_WIDTH + wrapX(x)]!);
  const set = (x: number, y: number, t: Terrain) => {
    if (y >= 0 && y < MAP_HEIGHT) terrain[y * MAP_WIDTH + wrapX(x)] = t;
  };

  // Etap 1 — lądy: losowe „chmury”, które podnoszą teren (woda → równiny → wzgórza → góry).
  const targetCells = options.landMass * 320 + 640;
  for (let total = 0; total < targetCells; ) {
    const cloud = new Uint8Array(MAP_WIDTH * MAP_HEIGHT);
    let x = rng.next(72) + 4;
    let y = rng.next(34) + 8;
    let size = rng.next(64) + 1;
    do {
      cloud[y * MAP_WIDTH + x] = 1;
      cloud[(y - 1) * MAP_WIDTH + x] = 1;
      cloud[y * MAP_WIDTH + wrapX(x + 1)] = 1;
      cloud[(y + 1) * MAP_WIDTH + x] = 1;
      cloud[y * MAP_WIDTH + wrapX(x - 1)] = 1;
      switch (rng.next(4)) {
        case 0: y -= 1; break;
        case 1: x += 1; break;
        case 2: y += 1; break;
        case 3: x -= 1; break;
      }
      x = wrapX(x);
      size--;
    } while (size > 0 && y > 4 && y < 45);
    let count = 0;
    for (let cx = 0; cx < MAP_WIDTH; cx++) {
      for (let cy = 0; cy < MAP_HEIGHT; cy++) {
        if (!cloud[cy * MAP_WIDTH + cx]) continue;
        const t = get(cx, cy);
        if (t === Terrain.Water) set(cx, cy, Terrain.Plains);
        else if (t === Terrain.Plains) set(cx, cy, Terrain.Hills);
        else if (t === Terrain.Hills) set(cx, cy, Terrain.Mountains);
        count++;
      }
    }
    total += count;
  }

  // Etap 2 — temperatura: równiny zamieniają się w pustynię, tundrę lub lód zależnie od szerokości geograficznej.
  for (let x = 0; x < MAP_WIDTH; x++) {
    for (let y = 0; y < MAP_HEIGHT; y++) {
      if (get(x, y) !== Terrain.Plains) continue;
      const band = Math.trunc((Math.abs(rng.next(8) + y - 29) + (1 - options.temperature)) / 6) + 1;
      if (band === 0 || band === 1) set(x, y, Terrain.Desert);
      else if (band === 4 || band === 5) set(x, y, Terrain.Tundra);
      else if (band === 6 || band === 7) set(x, y, Terrain.Arctic);
    }
  }

  // Etap 3 — klimat: wilgoć niesiona znad oceanu, najpierw z zachodu na wschód, potem odwrotnie.
  const dryness = 7 - options.climate * 2;
  for (let y = 0; y < MAP_HEIGHT; y++) {
    const latitude = Math.abs(25 - y);
    let wet = 0;
    for (let x = 0; x < MAP_WIDTH; x++) {
      const t = get(x, y);
      if (t === Terrain.Water) {
        if (Math.abs(12 - latitude) + options.climate * 4 > wet) wet++;
      } else if (wet > 0) {
        wet -= rng.next(dryness);
        if (t === Terrain.Plains) set(x, y, Terrain.Grassland);
        else if (t === Terrain.Tundra) set(x, y, Terrain.Arctic);
        else if (t === Terrain.Hills) set(x, y, Terrain.Forest);
        else if (t === Terrain.Mountains) wet -= 3;
        else if (t === Terrain.Desert) set(x, y, Terrain.Plains);
      }
    }
    wet = 0;
    for (let x = MAP_WIDTH - 1; x >= 0; x--) {
      const t = get(x, y);
      if (t === Terrain.Water) {
        if (Math.trunc(latitude / 2) + options.climate > wet) wet++;
      } else if (wet > 0) {
        wet -= rng.next(dryness);
        if (t === Terrain.Swamp || t === Terrain.Hills) set(x, y, Terrain.Forest);
        else if (t === Terrain.Plains) set(x, y, Terrain.Grassland);
        else if (t === Terrain.Grassland) {
          set(x, y, latitude < 10 ? Terrain.Jungle : Terrain.Swamp);
          wet = -2;
        } else if (t === Terrain.Mountains) {
          wet -= 3;
          set(x, y, Terrain.Forest);
        } else if (t === Terrain.Desert) set(x, y, Terrain.Plains);
      }
    }
  }

  // Etap 4 — wiek planety: erozja i wypiętrzanie w losowych miejscach i wzdłuż losowych spacerów.
  let ex = 0;
  let ey = 0;
  const erosionSteps = 800 + 800 * options.age;
  for (let i = 0; i < erosionSteps; i++) {
    if (i & 1) {
      const [dx, dy] = MOVE_DIRECTIONS[rng.next(8) + 1]!;
      ex += dx;
      ey += dy;
    } else {
      ex = rng.next(MAP_WIDTH);
      ey = rng.next(MAP_HEIGHT);
    }
    switch (get(ex, ey)) {
      case Terrain.Forest: set(ex, ey, Terrain.Jungle); break;
      case Terrain.Swamp: set(ex, ey, Terrain.Grassland); break;
      case Terrain.Plains:
      case Terrain.Tundra: set(ex, ey, Terrain.Hills); break;
      case Terrain.Grassland: set(ex, ey, Terrain.Forest); break;
      case Terrain.Jungle: set(ex, ey, Terrain.Swamp); break;
      case Terrain.Hills:
      case Terrain.Arctic: set(ex, ey, Terrain.Mountains); break;
      case Terrain.Mountains:
        if (
          get(ex - 1, ey - 1) !== Terrain.Water && get(ex - 1, ey + 1) !== Terrain.Water &&
          get(ex + 1, ey - 1) !== Terrain.Water && get(ex + 1, ey + 1) !== Terrain.Water
        ) set(ex, ey, Terrain.Water);
        break;
      case Terrain.Desert: set(ex, ey, Terrain.Plains); break;
    }
  }

  // Etap 5 — rzeki: start na wzgórzach, meandrowanie aż do morza lub innej rzeki; nieudane próby są cofane.
  const riverTarget = (options.landMass + options.climate) * 2 + 6;
  let rivers = 0;
  for (let attempt = 0; attempt < 256 && rivers <= riverTarget; attempt++) {
    if (!terrain.includes(Terrain.Hills)) break;
    const terrainBackup = terrain.slice();
    let startX: number;
    let startY: number;
    do {
      startX = rng.next(MAP_WIDTH);
      startY = rng.next(MAP_HEIGHT);
    } while (get(startX, startY) !== Terrain.Hills);
    let rx = startX;
    let ry = startY;
    let ends = false;
    let cell: number;
    let steps = 0;
    let direction = rng.next(4) * 2;
    do {
      set(rx, ry, Terrain.River);
      for (let d = 1; d < 9; d += 2) {
        const [dx, dy] = MOVE_DIRECTIONS[d]!;
        if (get(rx + dx, ry + dy) === Terrain.Water) ends = true;
      }
      const previous = direction;
      direction = ((rng.next(2) - (steps & 1)) * 2 + direction) & 7;
      if ((previous ^ 4) > direction && ry >= 0 && ry < MAP_HEIGHT) riverVariant[ry * MAP_WIDTH + wrapX(rx)] = 1;
      const [dx, dy] = MOVE_DIRECTIONS[direction + 1]!;
      rx += dx;
      ry += dy;
      cell = get(rx, ry);
      steps++;
    } while (!ends && cell !== Terrain.Water && cell !== Terrain.River && cell !== Terrain.Mountains);
    if ((!ends && cell !== Terrain.River) || steps < 5) {
      terrain.set(terrainBackup); // znaczniki wariantu zostają — tak jak w źródle
    } else {
      rivers++;
      for (let d = 1; d < 22; d++) {
        const [dx, dy] = MOVE_DIRECTIONS[d]!;
        if (get(startX + dx, startY + dy) === Terrain.Forest) set(startX + dx, startY + dy, Terrain.Jungle);
      }
    }
  }

  return { terrain, riverVariant };
}
