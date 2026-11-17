/**
 * Dekoder plików .PIC oryginału. Plik składa się z bloków: sygnatura (2 B), długość (2 B), dane.
 *   "M0" (0x304d) — paleta 256 kolorów (składowe 6-bitowe VGA),
 *   "E0" (0x3045) — mapowanie na 16 kolorów EGA (pomijane),
 *   "X0" (0x3058) — obraz 8-bitowy: LZW (kody od 9 bitów) + RLE ze znacznikiem 0x90,
 *   "X1" (0x3158) — obraz 4-bitowy (dwa piksele w bajcie), używany tylko przy braku "X0".
 * Pliki czytamy z kopii gry właściciela licencji; nie są częścią repozytorium.
 */
export interface PicImage {
  readonly width: number;
  readonly height: number;
  /** Indeksy palety, wiersz po wierszu. */
  readonly pixels: Uint8Array;
  /** 256 × RGB (0–255) albo null, gdy plik nie zawiera palety. */
  readonly palette: Uint8Array | null;
}

function lzwDecode(data: Uint8Array, maxBits: number, startBits = 9): Uint8Array {
  const out: number[] = [];
  let bits = startBits;
  let mask = (1 << bits) - 1;
  let table: number[][] = [];
  const reset = () => {
    table = [];
    for (let i = 0; i < 256; i++) table.push([i]);
  };
  reset();
  let w: number[] = [0]; // pozycja 256 słownika jest w oryginale „zużyta” na starcie
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
      bits = startBits;
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

export function decodePic(file: Uint8Array): PicImage {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  let palette: Uint8Array | null = null;
  let image: { width: number; height: number; pixels: Uint8Array } | null = null;
  let pos = 0;
  while (pos + 4 <= file.length) {
    const signature = view.getUint16(pos, true);
    const length = view.getUint16(pos + 2, true);
    const block = file.subarray(pos + 4, pos + 4 + length);
    pos += 4 + length;
    if (signature === 0x304d) {
      const first = block[0]!;
      const last = block[1]!;
      palette = new Uint8Array(768);
      for (let i = 0; i <= last - first; i++) {
        for (let c = 0; c < 3; c++) {
          palette[(first + i) * 3 + c] = Math.floor(((block[2 + i * 3 + c]! & 0x3f) * 255) / 63);
        }
      }
    } else if (signature === 0x3058 || (signature === 0x3158 && image === null)) {
      const bv = new DataView(block.buffer, block.byteOffset, block.byteLength);
      const width = bv.getUint16(0, true);
      const height = bv.getUint16(2, true);
      let raw = rleDecode(lzwDecode(block.subarray(5), block[4]!));
      if (signature === 0x3158) {
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
    } else if (signature !== 0x3045 && signature !== 0x3158) {
      throw new Error(`Nieznany blok 0x${signature.toString(16)} w pliku PIC`);
    }
  }
  if (!image) throw new Error('Plik PIC nie zawiera obrazu');
  return { ...image, palette };
}
