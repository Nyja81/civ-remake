/**
 * Dane syntetyczne do testów: pliki w formatach oryginału (.PIC, FONTS.CV, KING.TXT) zbudowane w kodzie.
 * Nie zawierają nic z oryginalnej gry — to wymyślone obrazy i czcionki o tym samym układzie bajtów.
 */
import { Gfx } from '../src/gfx';
import { FontSet, parseFonts } from '../src/font';
import { Ui, type UiHost } from '../src/ui';
import { GameAssets } from '../src/assets';
import { TERRAIN } from '@civ-remake/engine';

/** Koduje obraz w formacie .PIC: RLE (znacznik 0x90) + LZW z samymi kodami literałów, opcjonalnie z paletą "M0". */
export function encodePic(width: number, height: number, pixels: Uint8Array, palette?: { first: number; rgb6: number[] }): Uint8Array {
  // RLE: bajt, potem 0x90 n = jeszcze n − 1 powtórzeń; sam bajt 0x90 zapisany jako 0x90 0x00
  const rle: number[] = [];
  for (let i = 0; i < pixels.length; ) {
    const p = pixels[i]!;
    let run = 1;
    while (i + run < pixels.length && pixels[i + run] === p && run < 255) run++;
    rle.push(p);
    if (p === 0x90) rle.push(0);
    if (run > 2) {
      rle.push(0x90, run);
      i += run;
    } else {
      i++;
    }
  }
  // LZW zgodne z dekoderem: każdy kod to literał, stan słownika śledzony tak jak w dekoderze
  const maxBits = 12;
  let bits = 9;
  let mask = (1 << bits) - 1;
  let tableLength = 256;
  const out: number[] = [];
  let acc = 0;
  let count = 0;
  const write = (code: number) => {
    acc |= code << count;
    count += bits;
    while (count >= 8) {
      out.push(acc & 0xff);
      acc >>>= 8;
      count -= 8;
    }
  };
  for (const b of rle) {
    write(b);
    if (tableLength >= mask) {
      bits++;
      mask = (1 << bits) - 1;
    }
    if (bits > maxBits) {
      bits = 9;
      mask = (1 << bits) - 1;
      tableLength = 256;
    } else {
      tableLength++;
    }
  }
  if (count > 0) out.push(acc & 0xff);

  const blocks: number[] = [];
  const block = (sig: number, data: number[]) => {
    blocks.push(sig & 0xff, sig >> 8, data.length & 0xff, data.length >> 8, ...data);
  };
  if (palette) {
    const last = palette.first + palette.rgb6.length / 3 - 1;
    block(0x304d, [palette.first, last, ...palette.rgb6]);
  }
  block(0x3058, [width & 0xff, width >> 8, height & 0xff, height >> 8, maxBits, ...out]);
  return Uint8Array.from(blocks);
}

/** Plik .PAL = sam blok palety. */
export function encodePal(first: number, rgb6: number[]): Uint8Array {
  const last = first + rgb6.length / 3 - 1;
  const data = [first, last, ...rgb6];
  return Uint8Array.from([0x4d, 0x30, data.length & 0xff, data.length >> 8, ...data]);
}

/** Paleta 6-bitowa: kolory 0–15 jak EGA, reszta szarości. */
export function testPalette6(): number[] {
  const ega = [
    [0, 0, 0], [0, 0, 42], [0, 42, 0], [0, 42, 42], [42, 0, 0], [42, 0, 42], [42, 21, 0], [42, 42, 42],
    [21, 21, 21], [21, 21, 63], [21, 63, 21], [21, 63, 63], [63, 21, 21], [63, 21, 63], [63, 63, 21], [63, 63, 63],
  ];
  const rgb: number[] = [];
  for (let i = 0; i < 256; i++) {
    const c = ega[i] ?? [i & 63, (i * 3) & 63, (i * 7) & 63];
    rgb.push(...c);
  }
  return rgb;
}

/**
 * Czcionka w formacie FONTS.CV: znaki 0x20–0x7E, `height` wierszy, szerokość zmienna (`widthOf`),
 * bitmapa znaku = pełny prostokąt z pustą pierwszą kolumną (spacja pusta).
 */
export function buildFontFile(fonts: { height: number; spacing: number; lineSpacing: number; widthOf?: (code: number) => number }[]): Uint8Array {
  const first = 0x20;
  const last = 0x7e;
  const range = last - first;
  const parts: number[][] = [];
  const header = 2 + fonts.length * 2;
  let offset = header;
  const pointers: number[] = [];
  for (const f of fonts) {
    const widthOf = f.widthOf ?? ((c: number) => (c === 0x20 ? 3 : 5));
    const widths = Array.from({ length: range + 1 }, (_, j) => widthOf(first + j));
    const bytesPerChar = 1;
    const rowStride = (range + 1) << (bytesPerChar - 1);
    const table: number[] = [...widths, first, last, bytesPerChar, 0, f.height, f.spacing, f.lineSpacing, 0];
    const bitmap = new Array<number>(rowStride * f.height).fill(0);
    for (let j = 0; j <= range; j++) {
      const w = widths[j]!;
      if (first + j === 0x20) continue;
      for (let r = 0; r < f.height; r++) {
        let byte = 0;
        for (let c = 1; c < w; c++) byte |= 0x80 >> c;
        bitmap[r * rowStride + j] = byte;
      }
    }
    pointers.push(offset + table.length);
    parts.push([...table, ...bitmap]);
    offset += table.length + bitmap.length;
  }
  const out: number[] = [fonts.length & 0xff, fonts.length >> 8];
  for (const p of pointers) out.push(p & 0xff, p >> 8);
  for (const p of parts) out.push(...p);
  return Uint8Array.from(out);
}

export const testFonts = () =>
  buildFontFile(Array.from({ length: 9 }, (_, i) => ({ height: i === 4 || i === 6 ? 12 : 7, spacing: 1, lineSpacing: i === 4 || i === 6 ? 2 : 1 })));

/** Obraz 320×200 z poziomymi pasami kolorów (kolor = funkcja wiersza i kolumny). */
export function stripes(fn: (x: number, y: number) => number, width = 320, height = 200): Uint8Array {
  const p = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) p[y * width + x] = fn(x, y) & 0xff;
  return p;
}

/** Plik tekstowy z sekcjami jak KING.TXT: 0x212 bajtów nagłówka, potem wiersze. */
export function sectionFile(lines: string[]): Uint8Array {
  const body = new TextEncoder().encode(lines.join('\r\n') + '\r\n');
  const out = new Uint8Array(0x212 + body.length);
  out.set(body, 0x212);
  return out;
}

/** Mapa Ziemi: obszar 80×50 z wartościami pikseli terenu (pas lądu na równiku). */
function earthPixels(): Uint8Array {
  const water = TERRAIN[10]!.terrainChangeId;
  const grass = TERRAIN[2]!.terrainChangeId;
  return stripes((x, y) => (x < 80 && y < 50 ? (y > 20 && y < 30 && x > 10 && x < 60 ? grass : water) : 0));
}

/** Komplet syntetycznych plików gry potrzebnych interfejsowi. */
export function syntheticFiles(withOptional = true): Record<string, Uint8Array> {
  const pal = { first: 0, rgb6: testPalette6() };
  const pic = (fn: (x: number, y: number) => number, withPal = true) => encodePic(320, 200, stripes(fn), withPal ? pal : undefined);
  const files: Record<string, Uint8Array> = {
    'FONTS.CV': testFonts(),
    'LOGO.PIC': pic((x, y) => (y >= 64 && y < 144 && x > 40 && x < 280 ? 14 : 0)),
    'DIFFS.PIC': pic((x, y) => (x < 150 ? 20 + ((y / 35) | 0) : 9)),
    'CUSTOM.PIC': pic((x) => (x < 200 ? 30 : 1)),
    'SP257.PIC': pic((x, y) => ((x >> 4) + (y >> 4)) % 15 + 1),
    'SP299.PIC': pic((x, y) => (x >= 288 && y >= 120 && y < 136 ? ((x + y) & 1 ? 7 : 22) : ((x >> 3) + (y >> 3)) % 15 + 1), false),
    'TER257.PIC': pic((x, y) => ((x >> 4) * 3 + (y >> 4)) % 14 + 1, false),
    'MAP.PIC': encodePic(320, 200, earthPixels(), pal),
  };
  if (withOptional) {
    files['KING.TXT'] = sectionFile(['*INIT', '$RPLC1, you are the leader', 'of the $US. Your people know', '*END']);
    files['SP256.PAL'] = encodePal(0, testPalette6().slice(0, 128 * 3));
    files['BACK0A.PAL'] = encodePal(0, testPalette6());
  }
  return files;
}

/** Gospodarz testowy: nic nie wyświetla; liczy klatki i zapisuje wywołania PlayTune. */
export class TestHost implements UiHost {
  frames = 0;
  /** Wywołania PlayTune (utwór, parametr) w kolejności. */
  readonly tunes: Array<[number, number]> = [];
  /** Licznik taktów sterownika zwracany przez tuneCounter (undefined = bez dźwięku). */
  counter: number | undefined = undefined;
  present(): void {
    this.frames++;
  }
  playTune(tune: number, arg: number): void {
    this.tunes.push([tune, arg]);
  }
  tuneCounter(): number | undefined {
    return this.counter;
  }
  /** Bez czekania, ale z oddaniem sterowania pętli zdarzeń (żeby scenariusz testu mógł podać kolejne zdarzenie). */
  sleep(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }
}

export function makeUi(files = syntheticFiles()): { ui: Ui; assets: GameAssets; host: TestHost } {
  const assets = new GameAssets(files);
  const host = new TestHost();
  const ui = new Ui(new Gfx(assets.fonts), host);
  return { ui, assets, host };
}

export function plainUi(): Ui {
  return new Ui(new Gfx(new FontSet(parseFonts(testFonts()))), new TestHost());
}

/**
 * Przebieg scenariusza: kolejne zdarzenia podaje dopiero wtedy, gdy ekran czeka na wejście
 * (ekrany czyszczą kolejkę przed pokazaniem menu, jak oryginał).
 */
export async function drive<T>(ui: Ui, events: readonly import('../src/input').UiEvent[], run: () => Promise<T>, maxIdle = 50): Promise<T> {
  let done = false;
  const pending = run().finally(() => (done = true));
  const queue = [...events];
  for (let idle = 0; !done && idle < maxIdle; ) {
    await new Promise((r) => setTimeout(r, 0));
    if (done) break;
    if (ui.input.size === 0 && ui.input.waiting && queue.length > 0) {
      ui.input.push(queue.shift()!);
      idle = 0;
    } else {
      idle++;
    }
  }
  if (!done) throw new Error(`Scenariusz utknął; nieużyte zdarzenia: ${queue.length}`);
  if (queue.length > 0) throw new Error(`Zostały nieużyte zdarzenia: ${queue.length}`);
  return pending;
}
