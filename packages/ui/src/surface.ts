/**
 * Ekran w indeksach palety (domyślnie 320×200, jak tryb VGA 13h oryginału) i prymitywy rysowania
 * przeniesione z GBitmap / GDriver w OpenCivOne (MIT): SetPixel, DrawLine, FillRectangle, DrawBitmap,
 * ReplaceColor, DrawString. Kolor przezroczysty przy kopiowaniu = 0, jak w oryginale.
 */
import { glyphFor, isColorCode, type Font } from './font';

export const SCREEN_WIDTH = 320;
export const SCREEN_HEIGHT = 200;

/** Tryb zapisu piksela (PixelWriteModeEnum). */
export enum WriteMode {
  Normal = 0,
  And = 1,
  Or = 2,
  Xor = 3,
}

/** Dowolny obraz w indeksach palety (np. wynik `decodePic`). */
export interface IndexedBitmap {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
}

export class Surface implements IndexedBitmap {
  readonly pixels: Uint8Array;

  constructor(
    readonly width = SCREEN_WIDTH,
    readonly height = SCREEN_HEIGHT,
  ) {
    this.pixels = new Uint8Array(width * height);
  }

  static from(image: IndexedBitmap): Surface {
    const s = new Surface(image.width, image.height);
    s.pixels.set(image.pixels.subarray(0, s.pixels.length));
    return s;
  }

  contains(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  getPixel(x: number, y: number): number {
    return this.contains(x, y) ? this.pixels[y * this.width + x]! : 0;
  }

  setPixel(x: number, y: number, color: number, mode: WriteMode = WriteMode.Normal): void {
    if (!this.contains(x, y)) return;
    const i = y * this.width + x;
    this.pixels[i] = writePixel(this.pixels[i]!, color, mode);
  }

  /** GBitmap.FillRectangle — prostokąt przycięty do ekranu. */
  fillRect(x: number, y: number, width: number, height: number, color: number, mode: WriteMode = WriteMode.Normal): void {
    const x0 = Math.max(x, 0);
    const y0 = Math.max(y, 0);
    const x1 = Math.min(x + width, this.width);
    const y1 = Math.min(y + height, this.height);
    for (let yy = y0; yy < y1; yy++) {
      const row = yy * this.width;
      for (let xx = x0; xx < x1; xx++) this.pixels[row + xx] = writePixel(this.pixels[row + xx]!, color, mode);
    }
  }

  /** GBitmap.DrawLine — oba końce włącznie; linie ukośne krokiem ułamkowym jak we wzorcu. */
  drawLine(x1: number, y1: number, x2: number, y2: number, color: number, mode: WriteMode = WriteMode.Normal): void {
    const dirX = x1 > x2 ? -1 : 1;
    const dirY = y1 > y2 ? -1 : 1;
    const w = Math.abs(x2 - x1) + 1;
    const h = Math.abs(y2 - y1) + 1;
    if (w === 1 && h === 1) {
      this.setPixel(x1, y1, color, mode);
    } else if (h === 1) {
      for (let i = 0; i < w; i++) this.setPixel(x1 + i * dirX, y1, color, mode);
    } else if (w === 1) {
      for (let i = 0; i < h; i++) this.setPixel(x1, y1 + i * dirY, color, mode);
    } else if (w > h) {
      const step = h / w;
      for (let i = 0; i < w; i++) this.setPixel(x1 + i * dirX, y1 + Math.trunc(step * i) * dirY, color, mode);
    } else {
      const step = w / h;
      for (let i = 0; i < h; i++) this.setPixel(x1 + Math.trunc(step * i) * dirX, y1 + i * dirY, color, mode);
    }
  }

  /** GBitmap.DrawBitmap — kopiuje fragment obrazu; przy `transparent` pomija piksele o kolorze 0. */
  blit(src: IndexedBitmap, sx: number, sy: number, width: number, height: number, dx: number, dy: number, transparent = false): void {
    // przycięcie do obrazu źródłowego
    if (sx < 0) { dx -= sx; width += sx; sx = 0; }
    if (sy < 0) { dy -= sy; height += sy; sy = 0; }
    width = Math.min(width, src.width - sx);
    height = Math.min(height, src.height - sy);
    // przycięcie do ekranu docelowego
    if (dx < 0) { sx -= dx; width += dx; dx = 0; }
    if (dy < 0) { sy -= dy; height += dy; dy = 0; }
    width = Math.min(width, this.width - dx);
    height = Math.min(height, this.height - dy);
    if (width <= 0 || height <= 0) return;
    for (let y = 0; y < height; y++) {
      const s = (sy + y) * src.width + sx;
      const d = (dy + y) * this.width + dx;
      if (!transparent) {
        this.pixels.set(src.pixels.subarray(s, s + width), d);
        continue;
      }
      for (let x = 0; x < width; x++) {
        const c = src.pixels[s + x]!;
        if (c !== 0) this.pixels[d + x] = c;
      }
    }
  }

  /** GBitmap.ReplaceColor — w prostokącie zamienia jeden kolor na drugi (tak oryginał podświetla wybraną opcję). */
  replaceColor(x: number, y: number, width: number, height: number, from: number, to: number): void {
    const x0 = Math.max(x, 0);
    const y0 = Math.max(y, 0);
    const x1 = Math.min(x + width, this.width);
    const y1 = Math.min(y + height, this.height);
    for (let yy = y0; yy < y1; yy++) {
      const row = yy * this.width;
      for (let xx = x0; xx < x1; xx++) if (this.pixels[row + xx] === from) this.pixels[row + xx] = to;
    }
  }

  /**
   * GBitmap.DrawString — rysuje tylko piksele znaków (tło zostaje), odstęp przed każdym znakiem poza pierwszym.
   * Kod 0x80+n w napisie zmienia kolor na n dla dalszej części napisu.
   */
  drawText(font: Font, text: string, x: number, y: number, color: number, mode: WriteMode = WriteMode.Normal): void {
    let cx = x;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (isColorCode(code)) {
        color = code - 0x80;
        continue;
      }
      if (i > 0) cx += font.spacing;
      const glyph = glyphFor(font, code);
      if (!glyph) continue;
      for (let r = 0; r < glyph.height; r++) {
        for (let c = 0; c < glyph.width; c++) {
          if (glyph.bits[r * glyph.width + c]) this.setPixel(cx + c, y + r, color, mode);
        }
      }
      cx += glyph.width;
    }
  }
}

function writePixel(old: number, color: number, mode: WriteMode): number {
  switch (mode) {
    case WriteMode.And: return old & color;
    case WriteMode.Or: return old | color;
    case WriteMode.Xor: return old ^ color;
    default: return color & 0xff;
  }
}
