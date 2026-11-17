/**
 * Dane grafiki czytane w czasie działania z CIV.EXE gracza (po rozpakowaniu EXEPACK). Tablice nie są przepisywane
 * do repozytorium — tu jest tylko sposób ich odnalezienia w obrazie programu.
 *
 * Rozmowy z władcami (MeetWithKing, overlay 6):
 *   - segment danych DS: sekwencje animacji twarzy — oczy DS:0x3a94, usta DS:0x3aa6, sterowanie DS:0x3ab8 (po 18 bajtów
 *     ze znakiem), położenia X doradców DS:0x3afe (4 słowa); kotwica: napisy DS:0x3ad8 „govt0a.pic\0king00.pic\0king\0govt0a.pic”
 *     (tuż za tablicami — ten sam układ w wersji 474.01 Damiana i 475.05 wzorca),
 *   - osobny segment danych (wzorzec: 0x36fa; adres segmentu w słowie DS:0x640a): 0x00 — czcionka władcy wg nacji (16 bajtów,
 *     wynik + 8), 0x10/0x48 — punkty zaczepienia klatek twarzy (14 władców × 2 słowa: x, x klatki / y, y klatki),
 *     0x80/0xF0 — punkty zaczepienia głów doradców (7 wariantów sali × 4 doradców × 2 słowa).
 */
import { unpackExepack } from '@civ-remake/gfx';

export interface KingAnimationData {
  /** DS:0x3a94 — numer klatki oczu dla kroku sekwencji (−1 = bez zmiany). */
  readonly eyes: readonly number[];
  /** DS:0x3aa6 — numer klatki ust. */
  readonly mouth: readonly number[];
  /** DS:0x3ab8 — sterowanie: 0 = koniec sekwencji, > 0 = dalej, −1/−2/−3 = skok do kroku 0/6/14. */
  readonly control: readonly number[];
  /** DS:0x3afe — X ciał doradców w sali tronowej. */
  readonly advisorX: readonly number[];
  /** Segment 0x36fa:0x00 — czcionka władcy (bajt + 8; 10 → 3) wg numeru nacji. */
  readonly leaderFont: readonly number[];
  /** Segment 0x36fa: słowo pod przesunięciem `offset` (0x10…0x15f). */
  word(offset: number): number;
}

const ANCHOR = 'govt0a.pic\0king00.pic\0king\0govt0a.pic\0';
const ANCHOR_DS = 0x3ad8;
const SEGMENT_POINTER_DS = 0x640a;
const SEGMENT_SIZE = 0x160;

function findAll(image: Uint8Array, text: string): number[] {
  const needle = Array.from(text, (c) => c.charCodeAt(0));
  const hits: number[] = [];
  outer: for (let i = 0; i <= image.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      const b = image[i + j]!;
      // nazwy plików w CIV.EXE są małymi literami, ale porównujemy bez względu na wielkość
      if (b !== needle[j] && (b | 0x20) !== needle[j]) continue outer;
    }
    hits.push(i);
  }
  return hits;
}

const word = (image: Uint8Array, p: number) => ((image[p]! | (image[p + 1]! << 8)) << 16) >> 16;
const sbyte = (image: Uint8Array, p: number) => (image[p]! << 24) >> 24;

/**
 * Sprawdzenie, czy pod `base` leży segment z danymi twarzy: czcionki 0–2, punkty twarzy w obrębie portretu,
 * punkty doradców w obrębie sali — tylko kształt danych, bez porównywania z konkretnymi liczbami.
 */
function plausibleFaceSegment(image: Uint8Array, base: number): boolean {
  if (base < 0 || base + SEGMENT_SIZE > image.length) return false;
  for (let i = 0; i < 16; i++) if (image[base + i]! > 2) return false;
  for (let i = 0; i < 14; i++) {
    const x = word(image, base + 0x10 + 4 * i);
    const x1 = word(image, base + 0x12 + 4 * i);
    const y = word(image, base + 0x48 + 4 * i);
    const y1 = word(image, base + 0x4a + 4 * i);
    if (x < 181 || x >= 320 || y < 67 || y >= 200 || x1 < 0 || x1 >= 60 || y1 < 0 || y1 >= 50) return false;
  }
  for (let i = 0; i < 28; i++) {
    const hx = word(image, base + 0x80 + 4 * i);
    const hy = word(image, base + 0xf0 + 4 * i);
    if (hx < 0 || hx >= 320 || hy < 0 || hy >= 200) return false;
  }
  return true;
}

/** Odnajduje dane animacji rozmów z władcami; null, gdy obraz programu ma inny układ. */
export function findKingAnimationData(image: Uint8Array): KingAnimationData | null {
  const hits = findAll(image, ANCHOR);
  if (hits.length !== 1) return null;
  const anchor = hits[0]!;
  const ds = anchor - ANCHOR_DS;
  const at = (offset: number) => ds + offset;
  const bytes = (offset: number) => Array.from({ length: 18 }, (_, i) => sbyte(image, at(offset) + i));
  const eyes = bytes(0x3a94);
  const mouth = bytes(0x3aa6);
  const control = bytes(0x3ab8);
  const advisorX = Array.from({ length: 4 }, (_, i) => word(image, at(0x3afe) + 2 * i));
  // kształt sekwencji: ostatni krok kończy skokiem (−3), klatki w zakresie arkusza 14 klatek
  if (control[17] !== -3 || [...eyes, ...mouth].some((v) => v < -1 || v > 13)) return null;

  // segment twarzy: najpierw adres z DS:0x640a, a gdy nie pasuje — przegląd wszystkich segmentów obrazu
  let segment = -1;
  const pointer = at(SEGMENT_POINTER_DS);
  if (pointer >= 0 && pointer + 2 <= image.length) {
    const candidate = (image[pointer]! | (image[pointer + 1]! << 8)) * 16;
    if (plausibleFaceSegment(image, candidate)) segment = candidate;
  }
  if (segment === -1) {
    const found: number[] = [];
    for (let p = 0; p + SEGMENT_SIZE <= image.length && found.length < 2; p += 16) {
      if (plausibleFaceSegment(image, p)) found.push(p);
    }
    if (found.length !== 1) return null;
    segment = found[0]!;
  }
  const leaderFont = Array.from({ length: 16 }, (_, i) => sbyte(image, segment + i));
  return { eyes, mouth, control, advisorX, leaderFont, word: (offset) => word(image, segment + offset) };
}

/** Rozpakowuje CIV.EXE i odnajduje dane animacji; null przy innym pliku albo błędzie. */
export function readKingAnimationData(exe: Uint8Array): KingAnimationData | null {
  try {
    return findKingAnimationData(unpackExepack(exe));
  } catch {
    return null;
  }
}
