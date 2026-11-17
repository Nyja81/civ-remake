/** Prymitywy: czcionki FONTS.CV, ekran 320×200, paleta — na danych syntetycznych. */
import { describe, expect, it } from 'vitest';
import { decodePic } from '@civ-remake/gfx';
import { colorCode, measureText, parseFonts, textHeight } from '../src/font';
import { indexedToRgba, Palette, readPaletteRange, vga6to8 } from '../src/palette';
import { Surface } from '../src/surface';
import { adjustTextBlockWidth, replaceKeywords, textSection, yearToString } from '../src/text';
import { buildFontFile, encodePal, encodePic, sectionFile, stripes, testPalette6 } from './synthetic';

describe('czcionki FONTS.CV', () => {
  const file = buildFontFile([
    { height: 7, spacing: 1, lineSpacing: 1 },
    { height: 9, spacing: 2, lineSpacing: 0, widthOf: (c) => (c === 0x41 ? 7 : 4) },
  ]);
  const fonts = parseFonts(file);

  it('czyta liczbę czcionek, zakres znaków i parametry', () => {
    expect(fonts).toHaveLength(2);
    expect(fonts[0]!.firstChar).toBe(0x20);
    expect(fonts[0]!.lastChar).toBe(0x7e);
    expect(fonts[1]!.height).toBe(9);
    expect(fonts[1]!.spacing).toBe(2);
    expect(fonts[1]!.glyphs.get(0x41)!.width).toBe(7);
  });

  it('czyta bitmapy: najstarszy bit to pierwszy piksel wiersza', () => {
    const a = fonts[0]!.glyphs.get(0x41)!;
    expect(Array.from(a.bits.subarray(0, 5))).toEqual([0, 1, 1, 1, 1]);
    expect(fonts[0]!.glyphs.get(0x20)!.bits.every((b) => b === 0)).toBe(true);
  });

  it('mierzy napis jak GetDrawStringSize (odstęp przed każdym znakiem, kody kolorów bez szerokości)', () => {
    const f = fonts[1]!;
    expect(measureText(f, 'AB')).toEqual({ width: 2 + 7 + 2 + 4, height: 9 });
    expect(measureText(f, `A${colorCode(7)}B`).width).toBe(15);
    expect(textHeight(fonts[0]!)).toBe(8);
    expect(measureText(f, '').width).toBe(0);
  });
});

describe('ekran w indeksach palety', () => {
  it('kopiuje z przezroczystością i przycina do krawędzi', () => {
    const src = Surface.from({ width: 4, height: 4, pixels: Uint8Array.from({ length: 16 }, (_, i) => (i % 2 ? 5 : 0)) });
    const dst = new Surface(8, 8);
    dst.fillRect(0, 0, 8, 8, 9);
    dst.blit(src, 0, 0, 4, 4, -2, 6, true);
    expect(dst.getPixel(0, 6)).toBe(9); // piksel 0 w źródle = przezroczysty
    expect(dst.getPixel(1, 6)).toBe(5);
    expect(dst.getPixel(0, 7)).toBe(9);
    dst.blit(src, 0, 0, 4, 4, 6, 6, false);
    expect(dst.getPixel(6, 6)).toBe(0);
  });

  it('rysuje linie z obydwoma końcami i zamienia kolory w prostokącie', () => {
    const s = new Surface(10, 10);
    s.drawLine(1, 1, 8, 1, 3);
    s.drawLine(2, 2, 2, 7, 4);
    s.drawLine(0, 0, 9, 4, 6);
    expect(s.getPixel(1, 1)).toBe(3);
    expect(s.getPixel(8, 1)).toBe(3);
    expect(s.getPixel(2, 7)).toBe(4);
    expect(s.getPixel(9, 4)).toBe(6);
    s.replaceColor(0, 0, 10, 2, 3, 11);
    expect(s.getPixel(5, 1)).toBe(11);
    expect(s.getPixel(2, 3)).toBe(4);
  });

  it('pisze tekst tylko pikselami znaków, a kod koloru zmienia kolor dalszej części', () => {
    const font = parseFonts(buildFontFile([{ height: 7, spacing: 1, lineSpacing: 1 }]))[0]!;
    const s = new Surface(40, 10);
    s.fillRect(0, 0, 40, 10, 7);
    s.drawText(font, `A${colorCode(12)}B`, 0, 0, 15);
    expect(s.getPixel(0, 0)).toBe(7); // pusta kolumna znaku: tło zostaje
    expect(s.getPixel(1, 0)).toBe(15);
    expect(s.getPixel(7, 0)).toBe(12); // "B" zaczyna się od x = 5 + 1 (odstęp), pierwsza kolumna pusta
  });
});

describe('paleta', () => {
  it('czyta zakres palety z .PIC i .PAL, skala 6 → 8 bitów jak Color18ToColor', () => {
    expect(vga6to8(63)).toBe(255);
    expect(vga6to8(42)).toBe(170);
    const range = readPaletteRange(encodePal(16, [63, 0, 0, 0, 63, 0]))!;
    expect([range.first, range.last]).toEqual([16, 17]);
    const p = new Palette();
    p.setColor(0, 1, 2, 3);
    p.apply(range);
    expect(Array.from(p.rgb.subarray(48, 54))).toEqual([255, 0, 0, 0, 255, 0]);
    expect(Array.from(p.rgb.subarray(0, 3))).toEqual([1, 2, 3]); // reszta palety zostaje
  });

  it('syntetyczny .PIC dekoduje się dekoderem z packages/gfx (zgodność kodera testowego)', () => {
    const pixels = stripes((x, y) => (x < 50 ? 0x90 : (x * 7 + y * 13) % 256), 120, 80);
    const file = encodePic(120, 80, pixels, { first: 0, rgb6: testPalette6() });
    const img = decodePic(file);
    expect(Buffer.from(img.pixels).equals(Buffer.from(pixels))).toBe(true);
    const p = new Palette();
    p.apply(readPaletteRange(file)!);
    const rgba = indexedToRgba(img, p);
    expect(rgba[4 * 15 + 3]).toBe(255);
    expect(Array.from(rgba.subarray(0, 3))).toEqual(Array.from(p.rgb.subarray(0x90 * 3, 0x90 * 3 + 3)));
  });
});

describe('teksty z plików gry', () => {
  it('czyta sekcję po kluczu, pomija kolejne klucze i kończy na następnej gwiazdce', () => {
    const file = sectionFile(['*OTHER', 'x', '*INIT', '*ALIAS', 'Hello  $US,', '  leader $RPLC1^', '*END']);
    const text = textSection(file, '*init')!;
    expect(text).toBe('Hello $US,\nleader $RPLC1');
    expect(replaceKeywords(text, { US: 'Romans', RPLC1: 'Caesar' })).toBe('Hello Romans,\nleader Caesar');
    expect(textSection(file, '*NONE')).toBeNull();
  });

  it('łamie tekst do szerokości w znakach i zachowuje wiersze opcji', () => {
    expect(adjustTextBlockWidth('aaa bbb ccc', 7)).toBe('aaa bbb\nccc\n');
    expect(adjustTextBlockWidth('Choose:^ one^ two', 80)).toBe('Choose:\n one\n two\n');
    expect(yearToString(-4000)).toBe('4000 BC');
    expect(yearToString(1990)).toBe('1990 AD');
  });
});
