/**
 * Zasoby specjalne i chaty plemion. Oryginał nie przechowuje ich na mapie — wylicza je z położenia pola
 * i ziarna gry (wzory za funkcjami CellHasSpecialResource i CellHasMinorTribeHut z OpenCivOne, MIT).
 */
import { Terrain } from './generate';

const pattern = (x: number, y: number) => (x & 3) * 4 + (y & 3);
const blockHash = (x: number, y: number, seed: number) => (x >> 2) * 13 + (y >> 2) * 11 + seed;

/** Czy pole (dowolnego typu) ma zasób specjalny. */
export function hasSpecialResource(x: number, y: number, seed: number): boolean {
  return y > 1 && y < 48 && pattern(x, y) === (blockHash(x, y, seed) & 0xf);
}

/** Czy na polu stoi chata plemienia (przed odwiedzeniem; warunki widoczności i miasta sprawdza stan gry). */
export function hasTribalHut(x: number, y: number, terrain: number, seed: number): boolean {
  return y > 1 && y < 48 && terrain !== Terrain.Water && pattern(x, y) === ((blockHash(x, y, seed) + 8) & 0x1f);
}
