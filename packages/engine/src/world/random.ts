import { MscRand } from '../rng';

/** Źródło losowości dla reguł gry: liczba całkowita z zakresu 0..max-1. */
export interface RandomSource {
  next(max: number): number;
  /** Stan generatora (zapis gry); opcjonalny dla źródeł testowych. */
  state?: number;
}

/**
 * Losowanie oparte na rand() z Microsoft C.
 * DO POTWIERDZENIA ze wzorcem: przyjęto, że oryginał wyprowadza zakres jako rand() % max.
 */
export function mscRandom(seed: number): RandomSource {
  const rng = new MscRand(seed);
  return {
    next: (max) => (max <= 0 ? 0 : rng.next() % max),
    get state() {
      return rng.state;
    },
    set state(v: number) {
      rng.state = v;
    },
  };
}
