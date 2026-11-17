/**
 * Generator świata — etapy 1–5 (lądy, temperatura, klimat, wiek planety, rzeki).
 *
 * Źródło: dosłowne tłumaczenie asemblera F7_0000_0012 z pierwszego commitu wzorca OpenCivOne (ec23ac3, Overlay_7):
 * GenerateNewMap z F7_0000_08be/0988 (chmury lądu), F7_0000_05d4 (góra → woda) i F7_0000_065c (rzeki).
 * Oryginał buduje mapę na stronie mapy (ekran 1, 320×200): teren w (x, y) jako wartości pikseli (0 woda / wysokość lądu
 * w etapie 1, potem `terrainChangeId`), bufor chmury w (x + 160, y), znaczniki wariantu rzeki w (x, y + 50), kopia
 * zapasowa przy rzekach w (160, 0)–(319, 99). Tu ta sama strona jako tablica bajtów, odczyt poza nią daje 0.
 * Sprawdzone z zapisami oryginału (tools/dosbox/worldcheck.ts, test packages/engine/test/originalWorld.test.ts).
 * Nowszy wzorzec (MapInitAndIntro.GenerateNewMap) różni się w wielu miejscach — m.in. kształt chmury, brak ramki
 * wody i wypełniania przekątnych, o jedną rzekę za dużo, znaczniki wariantu rzeki przy nieudanej próbie.
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

/** Wartość piksela strony mapy → typ terenu (kolumna `terrainChangeId` tabeli terenu). */
const PIXEL_TERRAIN: Readonly<Record<number, Terrain>> = {
  1: Terrain.Water, 2: Terrain.Forest, 3: Terrain.Swamp, 6: Terrain.Plains, 7: Terrain.Tundra, 9: Terrain.River,
  10: Terrain.Grassland, 11: Terrain.Jungle, 12: Terrain.Hills, 13: Terrain.Mountains, 14: Terrain.Desert, 15: Terrain.Arctic,
};

const PAGE_WIDTH = 320;
const PAGE_HEIGHT = 200;

/** Strona mapy oryginału (ekran 1): piksel (x, y) pod adresem y·320 + x — bez obcinania współrzędnych, jak sterownik grafiki. */
class MapPage {
  readonly pixels = new Uint8Array(PAGE_WIDTH * PAGE_HEIGHT);
  get(x: number, y: number): number {
    const a = y * PAGE_WIDTH + x;
    return a >= 0 && a < this.pixels.length ? this.pixels[a]! : 0;
  }
  set(x: number, y: number, v: number): void {
    const a = y * PAGE_WIDTH + x;
    if (a >= 0 && a < this.pixels.length) this.pixels[a] = v;
  }
  /** F0_1000_0bfa — wypełnienie prostokąta. */
  fill(x: number, y: number, w: number, h: number, v: number): void {
    for (let j = y; j < y + h; j++) this.pixels.fill(v, j * PAGE_WIDTH + x, j * PAGE_WIDTH + x + w);
  }
  /** F0_1000_07fb — kopia prostokąta w obrębie strony. */
  copy(sx: number, sy: number, w: number, h: number, dx: number, dy: number): void {
    const block = new Uint8Array(w * h);
    for (let j = 0; j < h; j++) block.set(this.pixels.subarray((sy + j) * PAGE_WIDTH + sx, (sy + j) * PAGE_WIDTH + sx + w), j * w);
    for (let j = 0; j < h; j++) this.pixels.set(block.subarray(j * w, (j + 1) * w), (dy + j) * PAGE_WIDTH + dx);
  }
  /** F0_2d05_0a05 — obrys prostokąta od (x, y) do (x + w, y + h). */
  rectangle(x: number, y: number, w: number, h: number, v: number): void {
    for (let i = x; i <= x + w; i++) {
      this.set(i, y, v);
      this.set(i, y + h, v);
    }
    for (let j = y; j <= y + h; j++) {
      this.set(x, j, v);
      this.set(x + w, j, v);
    }
  }
}

export function generateWorld(rng: RandomSource, options: WorldOptions = DEFAULT_WORLD): World {
  const page = new MapPage();
  const px = (x: number, y: number) => page.get(x, y);
  const put = (x: number, y: number, v: number) => page.set(x, y, v);
  const dx = (d: number) => MOVE_DIRECTIONS[d]![0];
  const dy = (d: number) => MOVE_DIRECTIONS[d]![1];

  // Etap 1 — lądy (L0073): chmury F7_0000_08be, aż liczba podniesionych pól (Var_67fe) dojdzie do 320·masa + 640.
  // Wartość piksela rośnie o 1 przy każdej chmurze: 0 woda, 1 równina, 2 wzgórza, 3 i więcej góry.
  let raised = 0;
  while (options.landMass * 8 * 40 + 640 > raised) {
    page.fill(160, 0, 80, 50, 0);
    let x = rng.next(72) + 4;
    let y = rng.next(34) + 8;
    // F7_0000_0988: kształt (x, y), (x + 1, y), (x, y + 1); krok o 1 w kierunku N/E/S/W; koniec przy brzegach
    for (let size = rng.next(64) + 1; ; ) {
      put(x + 160, y, 15);
      put(x + 161, y, 15);
      put(x + 160, y + 1, 15);
      const d = rng.next(4) * 2 + 1;
      x += dx(d);
      y += dy(d);
      if (--size === 0 || x <= 2 || x >= 77 || y <= 2 || y >= 46) break;
    }
    for (let cx = 0; cx < 80; cx++) {
      for (let cy = 0; cy < 50; cy++) {
        if (px(cx + 160, cy) === 0) continue;
        put(cx, cy, px(cx, cy) + 1);
        raised++;
      }
    }
  }
  // ramka wody: obrysy (0, 0)–(79, 49) i (1, 1)–(78, 48)
  page.rectangle(0, 0, 79, 49, 0);
  page.rectangle(1, 1, 77, 47, 0);
  // L00c4: pola stykające się tylko narożnikiem (wzór 0110 albo 1001 w kwadracie 2×2) wypełniane równiną;
  // po zmianie powrót o kolumnę i wiersz (zmienna pętli zewnętrznej też się cofa)
  for (let x = 1; x < 79; x++) {
    for (let y = 1; y < 49; y++) {
      let edges = 0;
      if (px(x, y) !== 0) edges |= 1;
      if (px(x + 1, y) !== 0) edges |= 2;
      if (px(x, y + 1) !== 0) edges |= 4;
      if (px(x + 1, y + 1) !== 0) edges |= 8;
      if (edges === 6 || edges === 9) {
        put(x + 1, y, 1);
        put(x, y + 1, 1);
        put(x + 1, y + 1, 1);
        if (x !== 0) x--;
        if (y !== 0) y--;
      }
    }
  }

  // Etap 2 — temperatura (L01b1): woda → 1, równina wg szerokości, 2 → wzgórza, więcej → góry
  for (let x = 0; x < 80; x++) {
    for (let y = 0; y < 50; y++) {
      const v = px(x, y);
      if (v === 0) put(x, y, 1);
      else if (v === 2) put(x, y, 12);
      else if (v !== 1) put(x, y, 13);
      else {
        const band = Math.trunc((Math.abs(-(rng.next(8) + y - 29)) + (1 - options.temperature)) / 6) + 1;
        if (band === 0 || band === 1) put(x, y, 14);
        else if (band === 2 || band === 3) put(x, y, 6);
        else if (band === 4 || band === 5) put(x, y, 7);
        else if (band === 6 || band === 7) put(x, y, 15);
      }
    }
  }

  // Etap 3 — klimat (L0448): wilgoć znad oceanu z zachodu na wschód, potem ze wschodu na zachód
  const dryness = 7 - options.climate * 2;
  for (let y = 0; y < 50; y++) {
    const latitude = Math.abs(25 - y);
    let wet = 0;
    for (let x = 0; x < 80; x++) {
      const v = px(x, y);
      if (v === 1) {
        if (Math.abs(12 - latitude) + options.climate * 4 > wet) wet++;
      } else if (wet > 0) {
        wet -= rng.next(dryness);
        if (v === 6) put(x, y, 10);
        else if (v === 7) put(x, y, 15);
        else if (v === 12) put(x, y, 2);
        else if (v === 13) wet -= 3;
        else if (v === 14) put(x, y, 6);
      }
    }
    wet = 0;
    for (let x = 79; x >= 0; x--) {
      const v = px(x, y);
      if (v === 1) {
        if (Math.trunc(latitude / 2) + options.climate > wet) wet++;
      } else if (wet > 0) {
        wet -= rng.next(dryness);
        if (v === 3 || v === 12) put(x, y, 2);
        else if (v === 6) put(x, y, 10);
        else if (v === 10) {
          put(x, y, latitude < 10 ? 11 : 3);
          wet = -2;
        } else if (v === 13) {
          wet -= 3;
          put(x, y, 2);
        } else if (v === 14) put(x, y, 6);
      }
    }
  }

  // Etap 4 — wiek planety (L046d): parzyste kroki — losowe pole, nieparzyste — krok w losowym kierunku (bez zawijania)
  let ex = 0;
  let ey = 0;
  for (let e = 0; e < 800 * options.age + 800; e++) {
    if (e & 1) {
      const d = rng.next(8) + 1;
      ex += dx(d);
      ey += dy(d);
    } else {
      ex = rng.next(80);
      ey = rng.next(50);
    }
    switch (px(ex, ey)) {
      case 2: put(ex, ey, 11); break; // las → dżungla
      case 3: put(ex, ey, 10); break; // bagno → łąka
      case 6: case 7: put(ex, ey, 12); break; // równina, tundra → wzgórza
      case 10: put(ex, ey, 2); break; // łąka → las
      case 11: put(ex, ey, 3); break; // dżungla → bagno
      case 12: case 15: put(ex, ey, 13); break; // wzgórza, lód → góry
      case 13: // F7_0000_05d4: góra bez wody na przekątnych → woda
        if (px(ex - 1, ey - 1) !== 1 && px(ex - 1, ey + 1) !== 1 && px(ex + 1, ey - 1) !== 1 && px(ex + 1, ey + 1) !== 1) put(ex, ey, 1);
        break;
      case 14: put(ex, ey, 6); break; // pustynia → równina
    }
  }

  // Etap 5 — rzeki (F7_0000_065c): do (masa + klimat)·2 + 6 udanych prób, najwyżej 256 prób
  const riverTarget = (options.landMass + options.climate) * 2 + 6;
  let hasHills = false;
  for (let i = 0; i < 4000; i++) if (page.pixels[Math.trunc(i / 80) * PAGE_WIDTH + (i % 80)] === 12) hasHills = true;
  for (let attempt = 0, rivers = 0; hasHills && attempt < 256 && rivers < riverTarget; attempt++) {
    page.copy(0, 0, 160, 100, 160, 0); // kopia zapasowa: teren, warstwa (x + 80) i znaczniki (x, y + 50)
    let x: number;
    let y: number;
    do {
      x = rng.next(80);
      y = rng.next(50);
    } while (px(x, y) !== 12);
    const startX = x;
    const startY = y;
    let direction = rng.next(4) * 2;
    let steps = 0;
    let ends = false;
    let v: number;
    do {
      put(x, y, 9);
      ends = false;
      for (let d = 1; d <= 8; d += 2) if (px(x + dx(d), y + dy(d)) === 1) ends = true;
      const previous = direction;
      direction = ((rng.next(2) - (steps & 1)) * 2 + direction) & 7;
      if ((previous ^ 4) > direction) put(x, y + 50, 8);
      x += dx(direction + 1);
      y += dy(direction + 1);
      v = px(x, y);
      steps++;
    } while (!ends && v !== 13 && v !== 1 && v !== 9);
    if ((ends || v === 9) && steps >= 5) {
      rivers++;
      for (let d = 1; d <= 21; d++) if (px(startX + dx(d), startY + dy(d)) === 2) put(startX + dx(d), startY + dy(d), 11);
    } else {
      page.copy(160, 0, 160, 100, 0, 0); // przywrócenie (także znaczników wariantu rzeki)
    }
  }

  const terrain = new Uint8Array(MAP_WIDTH * MAP_HEIGHT);
  const riverVariant = new Uint8Array(MAP_WIDTH * MAP_HEIGHT);
  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      terrain[y * MAP_WIDTH + x] = PIXEL_TERRAIN[px(x, y)] ?? Terrain.Water;
      riverVariant[y * MAP_WIDTH + x] = px(x, y + 50) & 8 ? 1 : 0;
    }
  }
  return { terrain, riverVariant };
}
