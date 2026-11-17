/**
 * Mapa Ziemi. Oryginał trzyma ją w pliku MAP.PIC jako obraz, w którym wartość piksela w obszarze 80×50
 * oznacza typ terenu. Silnik nie czyta plików — dostaje gotowe piksele (np. z `decodePic` w packages/gfx).
 */
import { MAP_HEIGHT, MAP_WIDTH } from '../data/enums';
import { TERRAIN } from '../data/terrain';
import type { World } from './generate';

/** Wartość piksela → typ terenu; wartości pochodzą z tabeli terenu w CIV.EXE (pole terrainChangeId). */
export const PIXEL_TO_TERRAIN = new Map<number, number>(TERRAIN.slice(0, 12).map((t) => [t.terrainChangeId, t.id]));

export function worldFromMapPixels(pixels: Uint8Array, imageWidth: number): World {
  const terrain = new Uint8Array(MAP_WIDTH * MAP_HEIGHT);
  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      const pixel = pixels[y * imageWidth + x];
      const type = pixel === undefined ? undefined : PIXEL_TO_TERRAIN.get(pixel);
      if (type === undefined) throw new Error(`Nieznana wartość piksela ${pixel} na mapie w punkcie (${x}, ${y})`);
      terrain[y * MAP_WIDTH + x] = type;
    }
  }
  return { terrain, riverVariant: new Uint8Array(MAP_WIDTH * MAP_HEIGHT) };
}
