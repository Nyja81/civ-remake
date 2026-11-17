/**
 * Paleta 256 kolorów. Pliki .PIC i .PAL oryginału niosą paletę w bloku "M0" (0x304d): pierwszy i ostatni indeks,
 * potem składowe 6-bitowe VGA. Wczytanie palety ustawia tylko ten zakres (GDriver.SetColorsFromColorStruct),
 * reszta kolorów zostaje — dlatego trzymamy paletę osobno od obrazów.
 */
import type { IndexedBitmap } from './surface';

export interface PaletteRange {
  readonly first: number;
  readonly last: number;
  /** RGB 8-bitowe dla indeksów first..last. */
  readonly rgb: Uint8Array;
}

/** Skala 6 → 8 bitów jak w GBitmap.Color18ToColor: 255·v / 63 (z obcięciem). */
export const vga6to8 = (v: number) => Math.floor((255 * (v & 0x3f)) / 63);

/** Odczyt bloku palety z pliku .PIC/.PAL; null, gdy plik nie ma palety. */
export function readPaletteRange(file: Uint8Array): PaletteRange | null {
  let pos = 0;
  while (pos + 4 <= file.length) {
    const signature = file[pos]! | (file[pos + 1]! << 8);
    const length = file[pos + 2]! | (file[pos + 3]! << 8);
    if (signature === 0x304d) {
      const first = file[pos + 4]!;
      const last = file[pos + 5]!;
      const count = Math.max(0, last - first + 1);
      const rgb = new Uint8Array(count * 3);
      for (let i = 0; i < count * 3; i++) rgb[i] = vga6to8(file[pos + 6 + i] ?? 0);
      return { first, last, rgb };
    }
    pos += 4 + length;
  }
  return null;
}

export class Palette {
  /** 256 × RGB. */
  readonly rgb = new Uint8Array(768);

  apply(range: PaletteRange): void {
    this.rgb.set(range.rgb, range.first * 3);
  }

  copyFrom(other: Palette): void {
    this.rgb.set(other.rgb);
  }

  clone(): Palette {
    const p = new Palette();
    p.copyFrom(this);
    return p;
  }

  setColor(index: number, r: number, g: number, b: number): void {
    this.rgb[index * 3] = r;
    this.rgb[index * 3 + 1] = g;
    this.rgb[index * 3 + 2] = b;
  }
}

/** Zamiana ekranu indeksowanego na piksele RGBA (R, G, B, A w kolejnych bajtach). */
export function indexedToRgba(image: IndexedBitmap, palette: Palette, out?: Uint8ClampedArray): Uint8ClampedArray {
  const rgba = out ?? new Uint8ClampedArray(image.width * image.height * 4);
  const pal = palette.rgb;
  for (let i = 0; i < image.width * image.height; i++) {
    const c = image.pixels[i]! * 3;
    rgba[i * 4] = pal[c]!;
    rgba[i * 4 + 1] = pal[c + 1]!;
    rgba[i * 4 + 2] = pal[c + 2]!;
    rgba[i * 4 + 3] = 255;
  }
  return rgba;
}
