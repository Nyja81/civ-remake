import { MscRand } from '../rng';

/** Źródło losowości dla reguł gry: liczba całkowita z zakresu 0..max-1. */
export interface RandomSource {
  next(max: number): number;
  /** Stan generatora (zapis gry); opcjonalny dla źródeł testowych. */
  state?: number;
}

/**
 * Losowanie oparte na rand() z Microsoft C. Zakres jak w oryginale: F0_2dc4_005d = (max · rand()) >> 15
 * (mnożenie 32-bitowe _aFlmul i przesunięcie _aFlshr — dosłowne tłumaczenie asemblera, Segment_2dc4 z ec23ac3).
 */
export function mscRandom(seed: number): RandomSource {
  const rng = new MscRand(seed);
  return {
    next: (max) => (max <= 0 ? 0 : Math.floor((max * rng.next()) / 32768)),
    get state() {
      return rng.state;
    },
    set state(v: number) {
      rng.state = v;
    },
  };
}
