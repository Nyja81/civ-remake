/**
 * Czcionki oryginału z pliku FONTS.CV (format: Documentation/Font.cv specification.txt w OpenCivOne, MIT;
 * odczyt jak w GFonts.ImportFromOldStructure, pomiar i rysowanie jak w GDriver.GetDrawStringSize / GBitmap.DrawString).
 *
 * Układ pliku:
 *   0x0                — liczba czcionek (słowo),
 *   0x2 + 2·i          — wskaźnik tablicy czcionki i (FontTablePtr),
 *   FontTablePtr − 9 − zakres — szerokości znaków (gdy szerokość stała = 0),
 *   FontTablePtr − 8/−7 — pierwszy/ostatni kod znaku, −6 bajty na wiersz znaku, −5 szerokość stała,
 *   −4 wysokość, −3 odstęp między znakami, −2 odstęp między wierszami,
 *   FontTablePtr       — bitmapy: wiersz po wierszu, w każdym wierszu kolejne znaki (najstarszy bit = pierwszy piksel).
 *
 * Numeracja czcionek jak we wzorcu: od 1 (czcionka 1 = pierwsza w pliku). Nieznany numer = czcionka 1.
 */

export interface Glyph {
  readonly width: number;
  readonly height: number;
  /** 1 = piksel znaku, 0 = tło; wiersz po wierszu, `width` na wiersz. */
  readonly bits: Uint8Array;
}

export interface Font {
  readonly firstChar: number;
  readonly lastChar: number;
  readonly height: number;
  /** Odstęp między znakami (CharacterWidthSpacing). */
  readonly spacing: number;
  /** Odstęp między wierszami (LineSpacing). */
  readonly lineSpacing: number;
  readonly glyphs: ReadonlyMap<number, Glyph>;
}

const readWord = (d: Uint8Array, p: number) => d[p]! | (d[p + 1]! << 8);

export function parseFonts(data: Uint8Array): Font[] {
  if (data.length < 2) throw new Error('Plik czcionek jest pusty');
  const count = readWord(data, 0);
  const fonts: Font[] = [];
  for (let i = 0; i < count; i++) {
    const ptr = readWord(data, (i + 1) * 2);
    if (ptr < 9 || ptr > data.length) throw new Error(`Uszkodzona tablica czcionki ${i + 1}`);
    const firstChar = data[ptr - 8]!;
    const lastChar = data[ptr - 7]!;
    const bytesPerChar = data[ptr - 6]!;
    const fixedWidth = data[ptr - 5]!;
    const height = data[ptr - 4]!;
    const spacing = data[ptr - 3]!;
    const lineSpacing = data[ptr - 2]!;
    const range = lastChar - firstChar;
    const widthTable = fixedWidth === 0 ? ptr - 9 - range : -1;
    const rowStride = (range + 1) << (bytesPerChar - 1);
    const glyphs = new Map<number, Glyph>();
    for (let j = 0; j <= range; j++) {
      const width = widthTable >= 0 ? data[widthTable + j]! : fixedWidth;
      const bits = new Uint8Array(width * height);
      let rowPtr = ptr + bytesPerChar * j;
      for (let r = 0; r < height; r++) {
        for (let c = 0; c < width; c++) {
          const byte = data[rowPtr + (c >> 3)] ?? 0;
          bits[r * width + c] = (byte >> (7 - (c & 7))) & 1;
        }
        rowPtr += rowStride;
      }
      glyphs.set(firstChar + j, { width, height, bits });
    }
    fonts.push({ firstChar, lastChar, height, spacing, lineSpacing, glyphs });
  }
  return fonts;
}

/** Zestaw czcionek z numeracją od 1, jak we wzorcu. */
export class FontSet {
  constructor(private readonly fonts: readonly Font[]) {
    if (fonts.length === 0) throw new Error('Brak czcionek');
  }

  get count(): number {
    return this.fonts.length;
  }

  get(id: number): Font {
    return this.fonts[id - 1] ?? this.fonts[0]!;
  }
}

/** Kody 0x80–0xFF w tekście nie są znakami, tylko zmianą koloru (kolor = kod − 0x80), jak w GBitmap.DrawString. */
export const isColorCode = (code: number) => code > 0x7f;

/** Kod koloru do wstawienia w napis, np. `"G" + colorCode(7) + "AME"`. */
export const colorCode = (color: number) => String.fromCharCode(0x80 + color);

export function glyphFor(font: Font, code: number): Glyph | undefined {
  return font.glyphs.get(code) ?? font.glyphs.get(0x3f); // nieznany znak = '?'
}

/**
 * Rozmiar napisu (GDriver.GetDrawStringSize): odstęp + szerokość dla KAŻDEGO znaku (także pierwszego),
 * wysokość = wysokość znaku + odstęp między wierszami.
 * Odstępstwo od wzorca: kody kolorów mają szerokość 0 (wzorzec liczy je jak '?', co poszerzałoby menu z kolorowymi skrótami).
 */
export function measureText(font: Font, text: string): { width: number; height: number } {
  let width = 0;
  let height = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (isColorCode(code)) continue;
    const glyph = glyphFor(font, code);
    width += font.spacing + (glyph?.width ?? 0);
    height = Math.max(height, (glyph?.height ?? font.height) + font.lineSpacing);
  }
  return { width, height };
}

/** Wysokość wiersza tekstu (GDriver.F0_VGA_11ae_GetTextHeight = wysokość napisu "?"). */
export const textHeight = (font: Font) => measureText(font, '?').height;
