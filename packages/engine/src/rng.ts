/**
 * Generator liczb losowych zgodny z rand() z biblioteki Microsoft C,
 * którą skompilowano oryginał (stałe 214013 i 2531011 występują w CIV.EXE
 * w wersji 475.05 pod offsetami 0x23055 i 0x2306a).
 *
 * UWAGA: zgodność samego rand() jest pewna; to, jak gra wyprowadza z niego
 * zakresy (np. random(n)), zostanie odtworzone i sprawdzone ze wzorcem osobno.
 */
export class MscRand {
  private seed: number;

  constructor(seed = 1) {
    this.seed = seed >>> 0;
  }

  /** Zwraca liczbę z zakresu 0..32767 i przesuwa stan generatora. */
  next(): number {
    this.seed = (Math.imul(this.seed, 214013) + 2531011) >>> 0;
    return (this.seed >>> 16) & 0x7fff;
  }

  /** Stan wewnętrzny (32 bity) — do zapisu gry i testów porównawczych. */
  get state(): number {
    return this.seed;
  }

  set state(value: number) {
    this.seed = value >>> 0;
  }
}
