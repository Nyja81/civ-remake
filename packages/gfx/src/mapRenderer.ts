/**
 * Rysowanie terenu mapy z arkuszy oryginału (TER257/SP257/SP299.PIC) według reguł oryginału:
 * kolejność warstw i maski sąsiadów za funkcją DrawCell z OpenCivOne (MIT).
 * Wynik to obraz w indeksach palety (16 px na pole), który potem jest zamieniany na RGBA i wygładzany.
 */
import { hasSpecialResource, hasTribalHut, MAP_HEIGHT, MAP_WIDTH, Terrain, type World } from '@civ-remake/engine';
import type { PicImage } from './pic';

export const CELL = 16;

export interface Sheets {
  readonly ter: PicImage; // TER257.PIC
  readonly sp: PicImage; // SP257.PIC
  readonly sp299: PicImage; // SP299.PIC
}

export interface IndexedImage {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
}

/** Sąsiedzi 1–8: od północy zgodnie z ruchem wskazówek zegara. */
const DIRS: readonly (readonly [number, number])[] = [
  [0, 0], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1],
];
/** Gotowe kafle wybrzeża dla wybranych układów lądu wokół pola morza (pozycja x w SP299, y = 100). */
const COAST_SPECIAL: Readonly<Record<number, number>> = { 0x1c: 224, 0xc1: 240, 0x07: 256, 0x70: 272, 0x8f: 288, 0xf8: 304 };

function blit(dst: IndexedImage, dx: number, dy: number, src: PicImage, sx: number, sy: number, w: number, h: number, transparent: boolean): void {
  for (let y = 0; y < h; y++) {
    const ty = dy + y;
    if (ty < 0 || ty >= dst.height) continue;
    for (let x = 0; x < w; x++) {
      const tx = dx + x;
      if (tx < 0 || tx >= dst.width) continue;
      const c = src.pixels[(sy + y) * src.width + sx + x]!;
      if (transparent && c === 0) continue;
      dst.pixels[ty * dst.width + tx] = c;
    }
  }
}

export interface RenderOptions {
  /** Ziarno gry — od niego zależą zasoby specjalne i chaty. */
  readonly seed: number;
  readonly specials?: boolean;
  readonly huts?: boolean;
}

export function renderTerrain(world: World, sheets: Sheets, options: RenderOptions): IndexedImage {
  const out: IndexedImage = { width: MAP_WIDTH * CELL, height: MAP_HEIGHT * CELL, pixels: new Uint8Array(MAP_WIDTH * CELL * MAP_HEIGHT * CELL) };
  const { ter, sp, sp299 } = sheets;
  const validY = (y: number) => y >= 0 && y < MAP_HEIGHT;
  const at = (x: number, y: number): number =>
    validY(y) ? world.terrain[y * MAP_WIDTH + ((x % MAP_WIDTH) + MAP_WIDTH) % MAP_WIDTH]! : Terrain.Water;

  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      const t = at(x, y);
      const px = x * CELL;
      const py = y * CELL;

      if (t === Terrain.Water) {
        // Ocean składa się z czterech ćwiartek 8×8 dobranych do lądu w ośmiu sąsiednich polach.
        let mask = 0;
        for (let i = 1; i < 9; i++) {
          mask >>= 1;
          const [dx, dy] = DIRS[i]!;
          if (validY(y + dy) && at(x + dx, y + dy) !== Terrain.Water) mask |= 0x80;
        }
        const quarters = ((mask >> 6) & 3) + (mask << 2);
        for (let i = 0; i < 4; i++) {
          const variant = (quarters >> (i * 2)) & 7;
          if (i < 2) blit(out, px + (i & 1) * 8, py, ter, variant * 16 + (i & 1) * 8, 176, 8, 8, false);
          else blit(out, px - (i & 1) * 8 + 8, py + 8, ter, variant * 16 - (i & 1) * 8 + 8, 184, 8, 8, false);
        }
        const special = COAST_SPECIAL[mask];
        if (special !== undefined) blit(out, px, py, sp299, special, 100, 16, 16, false);
        for (let i = 1; i < 9; i += 2) {
          const [dx, dy] = DIRS[i]!;
          if (at(x + dx, y + dy) === Terrain.River) blit(out, px, py, ter, ((i - 1) / 2) * 16 + 128, 176, 16, 16, true);
        }
      } else {
        blit(out, px, py, sp299, 256, 120, 16, 16, false); // tło każdego pola lądu: trawa
        let mask = 0;
        for (let i = 1; i < 9; i += 2) {
          mask >>= 1;
          const [dx, dy] = DIRS[i]!;
          const n = at(x + dx, y + dy);
          const joins = t === Terrain.River ? n === Terrain.Water || n === Terrain.River : validY(y + dy) && n === t;
          if (joins) mask |= 8;
        }
        if (t === Terrain.River) {
          if (world.riverVariant[y * MAP_WIDTH + x]) mask += 16;
          if (mask > 0) blit(out, px, py, sp, (mask & 15) * 16, mask > 15 ? 80 : 64, 16, 16, true);
        } else {
          // Tylko pierwsze sześć typów terenu ma komplet 16 wariantów łączenia z sąsiadami.
          blit(out, px, py, ter, (t < 6 ? mask : 0) * 16, t * 16, 16, 16, true);
          if (t === Terrain.Grassland && ((7 * x + 11 * y) & 2) === 0) blit(out, px + 4, py + 4, sp, 153, 41, 7, 7, true);
        }
      }

      if (options.specials !== false && hasSpecialResource(x, y, options.seed)) blit(out, px, py, sp, t * 16 + 1, 113, 15, 15, true);
      if (options.huts !== false && hasTribalHut(x, y, t, options.seed)) blit(out, px, py, sp, 15 * 16 + 1, 113, 15, 15, true);
    }
  }
  return out;
}

/** Zamiana obrazu indeksowanego na piksele RGBA (kolejność bajtów R, G, B, A). */
export function toRgba(image: IndexedImage, palette: Uint8Array): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(image.pixels.length * 4);
  for (let i = 0; i < image.pixels.length; i++) {
    const c = image.pixels[i]! * 3;
    rgba[i * 4] = palette[c]!;
    rgba[i * 4 + 1] = palette[c + 1]!;
    rgba[i * 4 + 2] = palette[c + 2]!;
    rgba[i * 4 + 3] = 255;
  }
  return rgba;
}
