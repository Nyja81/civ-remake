/**
 * Kontekst grafiki jak w oryginale: trzy ekrany 320×200 (0 = widoczny, 1 i 2 = robocze), wspólna paleta,
 * czcionki i bieżąca czcionka. Metody rysujące na ekranie 0 to przeniesione funkcje DrawTools z OpenCivOne (MIT)
 * — nazwy funkcji wzorca w komentarzach.
 */
import { measureText, textHeight, type Font, type FontSet } from './font';
import { Palette, readPaletteRange } from './palette';
import { Surface, type IndexedBitmap } from './surface';

export class Gfx {
  readonly screens: readonly [Surface, Surface, Surface] = [new Surface(), new Surface(), new Surface()];
  readonly palette = new Palette();
  /** Bieżąca czcionka ekranu 0 (Var_aa_Screen0_Rectangle.FontID). */
  fontId = 1;
  /** Var_2f98_PatternAvailable — okna wypełniane wzorem z SP299.PIC (ekran 2) dopiero po wczytaniu arkuszy gry. */
  patternAvailable = false;
  /** Licznik zmian palety — pozwala warstwie wyświetlania wykryć, że trzeba przeliczyć klatkę. */
  paletteVersion = 0;

  constructor(readonly fonts: FontSet) {}

  get screen(): Surface {
    return this.screens[0];
  }

  get font(): Font {
    return this.fonts.get(this.fontId);
  }

  // ----- obrazy i palety -----

  /** ImageTools.F0_2fa1_01a2_LoadBitmapOrPalette: obraz na ekran `screenId` w (x, y); paleta tylko gdy `setPalette`. */
  loadPic(screenId: 0 | 1 | 2, x: number, y: number, image: IndexedBitmap, file?: Uint8Array, setPalette = false): void {
    this.screens[screenId].blit(image, 0, 0, image.width, image.height, x, y, false);
    if (setPalette && file) this.setPaletteFromFile(file);
  }

  /** GDriver.SetColorsFromColorStruct — ustawia tylko zakres kolorów zapisany w pliku. */
  setPaletteFromFile(file: Uint8Array): void {
    const range = readPaletteRange(file);
    if (range) {
      this.palette.apply(range);
      this.paletteVersion++;
    }
  }

  setPalette(palette: Palette): void {
    this.palette.copyFrom(palette);
    this.paletteVersion++;
  }

  /** GDriver.F0_VGA_07d8_DrawImage — kopia fragmentu jednego ekranu na drugi (bez przezroczystości). */
  copy(from: 0 | 1 | 2, sx: number, sy: number, width: number, height: number, to: 0 | 1 | 2, dx: number, dy: number): void {
    const src = this.screens[from];
    const dst = this.screens[to];
    if (src === dst) {
      const tmp = new Surface(width, height);
      tmp.blit(src, sx, sy, width, height, 0, 0);
      dst.blit(tmp, 0, 0, width, height, dx, dy);
    } else {
      dst.blit(src, sx, sy, width, height, dx, dy);
    }
  }

  /** GDriver.F0_VGA_0b85_ScreenToBitmap — wycina fragment ekranu jako osobny obraz. */
  cut(from: 0 | 1 | 2, x: number, y: number, width: number, height: number): Surface {
    const s = new Surface(width, height);
    s.blit(this.screens[from], x, y, width, height, 0, 0);
    return s;
  }

  /** GDriver.F0_VGA_0c3e_DrawBitmapToScreen — rysuje obraz z przezroczystością (kolor 0). */
  drawBitmap(bitmap: IndexedBitmap, x: number, y: number, to: 0 | 1 | 2 = 0): void {
    this.screens[to].blit(bitmap, 0, 0, bitmap.width, bitmap.height, x, y, true);
  }

  // ----- tekst (DrawTools) -----

  /** DrawTools.GetStringWidth */
  stringWidth(text: string): number {
    return measureText(this.font, text).width;
  }

  /** GDriver.F0_VGA_11ae_GetTextHeight */
  textHeight(): number {
    return textHeight(this.font);
  }

  /** DrawTools.DrawString / DrawStringToScreen0 */
  drawString(text: string, x: number, y: number, color: number): void {
    this.screen.drawText(this.font, text, x, y, color);
  }

  /** DrawTools.DrawStringWithShadow — cień czarny o 1 piksel niżej. */
  drawStringWithShadow(text: string, x: number, y: number, color: number): void {
    this.drawString(text, x, y + 1, 0);
    this.drawString(text, x, y, color);
  }

  /** DrawTools.DrawCenteredStringToScreen0 */
  drawCenteredString(text: string, x: number, y: number, color: number): void {
    this.drawString(text, x - Math.trunc(this.stringWidth(text) / 2), y, color);
  }

  /** DrawTools.DrawCenteredStringWithShadowToScreen0 — cień o 1 piksel w prawo i w dół. */
  drawCenteredStringWithShadow(text: string, x: number, y: number, color: number, shadow = 0): void {
    x -= Math.trunc(this.stringWidth(text) / 2);
    this.drawString(text, x + 1, y + 1, shadow);
    this.drawString(text, x, y, color);
  }

  // ----- prostokąty i okna (DrawTools) -----

  /** DrawTools.FillRectangle (na ekranie 0) */
  fillRect(x: number, y: number, width: number, height: number, color: number, screenId: 0 | 1 | 2 = 0): void {
    if (width > 0 && height > 0) this.screens[screenId].fillRect(x, y, width, height, color);
  }

  drawLine(x1: number, y1: number, x2: number, y2: number, color: number): void {
    this.screen.drawLine(x1, y1, x2, y2, color);
  }

  /** DrawTools.DrawRectangle — obrys o wymiarach (width + 1) × (height + 1). */
  drawRectangle(x: number, y: number, width: number, height: number, color: number): void {
    this.drawLine(x, y, x + width, y, color);
    this.drawLine(x, y + height, x + width, y + height, color);
    this.drawLine(x + width, y, x + width, y + height, color);
    this.drawLine(x, y, x, y + height, color);
  }

  /**
   * DrawTools.DrawShadowRectangle — kolejność i kolory krawędzi dokładnie jak we wzorcu:
   * górna i prawa w kolorze `color1`, dolna i lewa w kolorze `color`.
   */
  drawShadowRectangle(x: number, y: number, width: number, height: number, color: number, color1: number): void {
    this.drawLine(x, y, x + width, y, color1);
    this.drawLine(x, y + height, x + width, y + height, color);
    this.drawLine(x + width, y, x + width, y + height, color1);
    this.drawLine(x, y + 1, x, y + height, color);
  }

  /** DrawTools.FillRectangleWithPattern — kafelkowanie wzorem z ekranu 2 (domyślnie 32×16 z punktu 288,120). */
  fillRectangleWithPattern(x: number, y: number, width: number, height: number, px = 288, py = 120, pw = 32, ph = 16): void {
    for (let cy = y, h = height; h > 0; ) {
      const cellH = Math.min(h, ph);
      for (let cx = x, w = width; w > 0; ) {
        const cellW = Math.min(w, pw);
        this.copy(2, px, py, cellW, cellH, 0, cx, cy);
        cx += cellW;
        w -= cellW;
      }
      cy += cellH;
      h -= cellH;
    }
  }

  /** DrawTools.F0_1238_1bb2_FillRectangleWithShadow — panel ekranu gry. */
  fillRectangleWithShadow(x: number, y: number, width: number, height: number): void {
    this.fillRectangleWithPattern(x, y, width, height);
    this.drawShadowRectangle(x, y, width - 1, height - 1, 15, 8);
  }

  /**
   * F0_2d05_096c — okno menu: wnętrze (wzór albo kolor) i cień 15/8 od (x + 1, y + 1) o wymiarach width × height,
   * czarny obrys od (x, y) do (x + width + 2, y + height + 2).
   */
  drawWindowFrame(x: number, y: number, width: number, height: number, color: number): void {
    if (color === 7 && this.patternAvailable) this.fillRectangleWithPattern(x + 1, y + 1, width, height);
    else this.fillRect(x + 1, y + 1, width, height, color);
    this.drawShadowRectangle(x + 1, y + 1, width, height, 15, 8);
    this.drawRectangle(x, y, width + 2, height + 2, 0);
  }

  /** DrawTools.DrawRectangleAndFillWithPattern (wariant z własnym wzorem: punkt i rozmiar wzoru na ekranie 2). */
  drawRectangleAndFillWithPattern(x: number, y: number, x1: number, y1: number, px = 288, py = 120, pw = 32, ph = 16): void {
    this.fillRectangleWithPattern(x, y, x1 - x, y1 - y, px, py, pw, ph);
    this.drawRectangle(x, y, x1 - x, y1 - y, 1);
  }

  /** DrawTools.DrawFilledRectangleWithCenteredText — „przycisk” z napisem. */
  drawFilledRectangleWithCenteredText(x: number, y: number, x1: number, y1: number, text: string, color: number): void {
    this.fillRect(x, y, x1 - x, y1 - y, color);
    const light = color < 8 ? color + 8 : 7;
    const dark = color < 8 ? 8 : color - 8;
    this.drawLine(x, y, x1, y, light);
    this.drawLine(x, y, x, y1, light);
    this.drawLine(x + 1, y1, x1, y1, dark);
    this.drawLine(x1, y, x1, y1, dark);
    this.drawCenteredString(text, Math.trunc((x + x1) / 2) + 1, Math.trunc((y + y1) / 2) - 2, color ^ 8);
  }

  /**
   * DrawTools.DrawTextBlock — tekst łamany do `maxWidth` pikseli; '^' i "^\n" to wymuszony koniec wiersza,
   * pojedyncze '\n' to spacja. Zwraca nowe Y.
   */
  drawTextBlock(x: number, y: number, text: string, maxWidth: number, color: number): number {
    return this.layoutTextBlock(text, y, maxWidth, (line, ly) => this.drawString(line, x, ly, color));
  }

  /**
   * F0_2f4d_0088 dokładnie jak w asemblerze: szerokość w jednostkach po 8 pikseli; wiersz kończy '\n', '^' albo
   * przekroczenie szerokości (łamanie na ostatniej spacji, '\n' lub '^'); po '^' pomijany jest jeden znak.
   * Rysuje, dopóki Y ≤ 192; zwraca nowe Y.
   */
  drawTextBlockUnits(text: string, widthUnits: number, x: number, y: number, color: number): number {
    const lineHeight = this.textHeight();
    const maxWidth = widthUnits << 3;
    let start = 0;
    let lastSeparator = 0;
    let width = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]!;
      width += measureText(this.font, ch).width;
      if (ch === ' ' || ch === '\n' || ch === '^') lastSeparator = i;
      if (ch !== '\n' && ch !== '^' && width <= maxWidth) continue;
      this.drawString(text.substring(start, lastSeparator), x, y, color);
      y += lineHeight;
      width = 0;
      start = lastSeparator + 1;
      if (ch === '^') start++;
      i = lastSeparator;
      if (y > 192) return y;
    }
    if (width > 0 && y <= 192) {
      this.drawString(text.substring(start), x, y, color);
      y += lineHeight;
    }
    return y;
  }

  /** DrawTools.GetTextBlockHeight */
  textBlockHeight(text: string, y: number, maxWidth: number): number {
    return this.layoutTextBlock(text, y, maxWidth, () => {}) - y;
  }

  private layoutTextBlock(text: string, y: number, maxWidth: number, draw: (line: string, y: number) => void): number {
    text = text.replace(/\r/g, ' ').replace(/\^\n/g, '\r').replace(/\n/g, ' ').replace(/\r/g, '\n').replace(/\^/g, '\n');
    while (text.includes('  ')) text = text.replace(/ {2}/g, ' ');
    if (!text.endsWith('\n')) text += '\n';
    let newY = y;
    let lastSeparator = -1;
    let current = 0;
    const length = text.length;
    while (current < length && newY < 193) {
      const separator = indexOfAny(text, lastSeparator + 1);
      if (separator >= 0) {
        const part = text.substring(current, separator);
        const size = measureText(this.font, part);
        if (size.width > maxWidth) {
          draw(text.substring(current, Math.max(current, lastSeparator)), newY);
          current = lastSeparator + 1;
          lastSeparator = separator;
          newY += size.height;
        } else if (text[separator] === '\n') {
          draw(part, newY);
          current = separator + 1;
          lastSeparator = separator;
          newY += size.height;
        } else {
          lastSeparator = separator;
        }
      } else {
        const part = text.substring(current).replace(/^[ \n]+|[ \n]+$/g, '');
        draw(part, newY);
        newY += measureText(this.font, part).height;
        current = length;
      }
    }
    return newY;
  }
}

function indexOfAny(text: string, from: number): number {
  for (let i = from; i < text.length; i++) if (text[i] === ' ' || text[i] === '\n') return i;
  return -1;
}
