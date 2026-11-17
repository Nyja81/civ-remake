/**
 * Koder i dekoder obrazów w formacie .PIC oryginału — na potrzeby pliku CIVIL?.MAP (warstwy mapy zapisane jako obraz
 * 320×200, LoadAndSave.LoadGameData / SaveGameData z OpenCivOne, MIT). Silnik nie importuje packages/gfx, dlatego
 * ma własną kopię dekodera (ta sama logika co `decodePic` w packages/gfx).
 *
 * Plik składa się z bloków: sygnatura (2 B), długość (2 B), dane. Obraz to blok "X0": szerokość, wysokość (po 2 B),
 * bajt z największą liczbą bitów kodu LZW, potem dane: RLE (znacznik 0x90) skompresowane LZW (kody od 9 bitów;
 * po przekroczeniu największej liczby bitów słownik zaczyna się od nowa, pozycja 256 słownika jest „zużyta” na starcie).
 *
 * Koder: RLE jak RLE.Compress z OpenCivOne (powtórzenie zapisywane dopiero dla serii dłuższej niż 4 bajty, najwyżej 255),
 * LZW napisane tak, żeby dekoder odtwarzał dokładnie ten sam słownik. Czy bajty są identyczne z koderem oryginału —
 * niesprawdzone (porównujemy piksele).
 */

const SIG_PALETTE = 0x304d; // "M0"
const SIG_EGA = 0x3045; // "E0"
const SIG_IMAGE = 0x3058; // "X0"
const SIG_IMAGE4 = 0x3158; // "X1"

export interface PicPixels {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
}

function lzwDecode(data: Uint8Array, maxBits: number): Uint8Array {
  const out: number[] = [];
  let bits = 9;
  let mask = (1 << bits) - 1;
  let table: number[][] = [];
  const reset = () => {
    table = [];
    for (let i = 0; i < 256; i++) table.push([i]);
  };
  reset();
  let w: number[] = [0];
  let acc = 0;
  let count = 0;
  let pos = 0;
  for (;;) {
    while (count < bits && pos < data.length) {
      acc |= data[pos++]! << count;
      count += 8;
    }
    if (count < bits) break;
    const code = acc & mask;
    acc >>>= bits;
    count -= bits;
    let entry: number[];
    if (code < table.length) entry = table[code]!;
    else if (code === table.length) entry = [...w, w[0]!];
    else entry = [];
    for (const b of entry) out.push(b);
    if (entry.length > 0) w = [...w, entry[0]!];
    if (table.length >= mask) {
      bits++;
      mask = (1 << bits) - 1;
    }
    if (bits > maxBits) {
      bits = 9;
      mask = (1 << bits) - 1;
      reset();
      w = [0];
    } else {
      if (w.length > 0) table.push(w);
      w = entry;
    }
  }
  return Uint8Array.from(out);
}

function rleDecode(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  let last = 0;
  for (let i = 0; i < data.length; ) {
    const c = data[i++]!;
    if (c !== 0x90) {
      last = c;
      out.push(c);
      continue;
    }
    if (i >= data.length) break;
    const repeat = data[i++]!;
    if (repeat === 0) {
      last = 0x90;
      out.push(last);
    } else {
      for (let k = 1; k < repeat; k++) out.push(last);
    }
  }
  return Uint8Array.from(out);
}

/** Odczyt obrazu z pliku .PIC (bloki palety pomijane). */
export function decodePicPixels(file: Uint8Array): PicPixels {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  let image: PicPixels | null = null;
  let pos = 0;
  while (pos + 4 <= file.length) {
    const signature = view.getUint16(pos, true);
    const length = view.getUint16(pos + 2, true);
    const block = file.subarray(pos + 4, pos + 4 + length);
    pos += 4 + length;
    if (signature === SIG_IMAGE || (signature === SIG_IMAGE4 && image === null)) {
      const width = block[0]! | (block[1]! << 8);
      const height = block[2]! | (block[3]! << 8);
      let raw = rleDecode(lzwDecode(block.subarray(5), block[4]!));
      if (signature === SIG_IMAGE4) {
        const unpacked = new Uint8Array(raw.length * 2);
        raw.forEach((b, i) => {
          unpacked[i * 2] = b & 15;
          unpacked[i * 2 + 1] = b >> 4;
        });
        raw = unpacked;
      }
      const pixels = new Uint8Array(width * height);
      pixels.set(raw.subarray(0, pixels.length));
      image = { width, height, pixels };
    } else if (signature !== SIG_PALETTE && signature !== SIG_EGA && signature !== SIG_IMAGE4) {
      throw new Error(`Nieznany blok 0x${signature.toString(16)} w pliku PIC`);
    }
  }
  if (!image) throw new Error('Plik PIC nie zawiera obrazu');
  return image;
}

/** RLE.Compress(…, 4) z OpenCivOne: seria zapisywana jako „bajt, 0x90, długość” dopiero, gdy jest dłuższa niż 4. */
function rleEncode(data: Uint8Array, minCount = 4): number[] {
  const out: number[] = [];
  const flush = (value: number, count: number) => {
    if (count > minCount) {
      out.push(value);
      if (value === 0x90) out.push(0);
      out.push(0x90, count);
    } else {
      for (let i = 0; i < count; i++) {
        out.push(value);
        if (value === 0x90) out.push(0);
      }
    }
  };
  let old = -1;
  let count = 0;
  for (const c of data) {
    if (c === old && count < 255) {
      count++;
    } else {
      flush(old, count);
      old = c;
      count = 1;
    }
  }
  flush(old, count);
  return out;
}

/**
 * LZW zgodne z dekoderem: kod nr n w bieżącym słowniku czyta się szerokością, która rośnie, gdy 256 + n ≥ maska;
 * dekoder dopisuje (poprzedni ciąg + pierwszy znak bieżącego) przy odczycie kolejnego kodu, chyba że ten odczyt
 * zaczyna słownik od nowa.
 */
function lzwEncode(data: readonly number[], maxBits: number): number[] {
  const out: number[] = [];
  let acc = 0;
  let accBits = 0;
  const emit = (code: number, bits: number) => {
    acc |= code << accBits;
    accBits += bits;
    while (accBits >= 8) {
      out.push(acc & 0xff);
      acc >>>= 8;
      accBits -= 8;
    }
  };
  let dict = new Map<string, number>();
  let n = 0; // numer kolejnego kodu w bieżącym słowniku (odczyt nr n w dekoderze)
  let bits = 9;
  /** Czy odczyt nr k przy szerokości b kończy się nowym słownikiem. */
  const resetsAt = (k: number, b: number) => 256 + k >= (1 << b) - 1 && b + 1 > maxBits;
  const codeOf = (s: string, first: number) => (s.length === 0 ? first : (dict.get(s) ?? -1));
  if (data.length === 0) return out;
  // ciąg trzymany jako klucz tekstowy (bajty jako znaki) i kod
  let w = String.fromCharCode(data[0]!);
  let wCode = data[0]!;
  for (let i = 1; i < data.length; i++) {
    const c = data[i]!;
    const wc = w + String.fromCharCode(c);
    const known = dict.get(wc);
    if (known !== undefined) {
      w = wc;
      wCode = known;
      continue;
    }
    emit(wCode, bits);
    const reset = resetsAt(n, bits);
    if (256 + n >= (1 << bits) - 1) bits++;
    if (reset) {
      bits = 9;
      n = 0;
      dict = new Map();
    } else {
      n++;
      // dekoder dopisze wc przy odczycie nr n — o ile ten odczyt nie zaczyna nowego słownika
      if (!resetsAt(n, bits)) dict.set(wc, 256 + n);
    }
    w = String.fromCharCode(c);
    wCode = codeOf('', c);
  }
  emit(wCode, bits);
  if (accBits > 0) out.push(acc & 0xff);
  return out;
}

/** Zapis obrazu w formacie .PIC: sam blok "X0" (bez palety), jak SaveToPIC(…, false) we wzorcu. */
export function encodePicPixels(width: number, height: number, pixels: Uint8Array, maxBits = 11): Uint8Array {
  const lzw = lzwEncode(rleEncode(pixels.subarray(0, width * height)), maxBits);
  const length = lzw.length + 5;
  if (length > 0xffff) throw new Error('Obraz za duży na blok PIC');
  const out = new Uint8Array(4 + length);
  out.set([SIG_IMAGE & 0xff, SIG_IMAGE >> 8, length & 0xff, length >> 8, width & 0xff, width >> 8, height & 0xff, height >> 8, maxBits]);
  out.set(lzw, 9);
  return out;
}
