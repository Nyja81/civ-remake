/**
 * Syntetyczny sterownik .CVL do testów bez plików oryginału: nagłówek jak w sterownikach gry, 11 punktów wejścia.
 * play(utwór) zapisuje numer, zeruje licznik i włącza dźwięk 437,7 Hz na kanale 0 AdLib; tick zwiększa licznik
 * i zwraca 1 (szybki zegar), fastTick zlicza szybkie takty, counter zwraca licznik.
 */
const CODE: Array<[number, number[]]> = [
  // 0x60: opl — AL = rejestr, AH = wartość
  [0x60, [0xba, 0x88, 0x03, 0xee, 0x42, 0x88, 0xe0, 0xee, 0xc3]],
  // 0x70: init — xor ax,ax; retf
  [0x70, [0x31, 0xc0, 0xcb]],
  // 0x80: play
  [0x80, [
    0x55, 0x89, 0xe5, 0x8b, 0x46, 0x06, // push bp; mov bp,sp; mov ax,[bp+6]
    0x2e, 0xa3, 0x00, 0x02, // mov cs:[0x200],ax
    0x2e, 0xc7, 0x06, 0x02, 0x02, 0x00, 0x00, // mov word cs:[0x202],0
    0xbe, 0x00, 0x03, // mov si,0x300
    0x2e, 0x8b, 0x04, // loop: mov ax,cs:[si]
    0x3c, 0xff, 0x74, 0x08, // cmp al,0xff; je end
    0xe8, 0xc2, 0xff, // call 0x60
    0x83, 0xc6, 0x02, 0xeb, 0xf1, // add si,2; jmp loop
    0x5d, 0xcb, // end: pop bp; retf
  ]],
  // 0xb0: tick — inc word cs:[0x202]; mov ax,1; retf
  [0xb0, [0x2e, 0xff, 0x06, 0x02, 0x02, 0xb8, 0x01, 0x00, 0xcb]],
  // 0xc0: fastTick — inc word cs:[0x204]; retf
  [0xc0, [0x2e, 0xff, 0x06, 0x04, 0x02, 0xcb]],
  // 0xd0: counter — mov ax,cs:[0x202]; retf
  [0xd0, [0x2e, 0xa1, 0x02, 0x02, 0xcb]],
  // 0xe0: pozostałe — retf
  [0xe0, [0xcb]],
];

/** Dźwięk: operator 1 i 2 kanału 0, blok 4, fnum 0x241 (437,7 Hz), klawisz wciśnięty. */
export const SYNTH_NOTE: Array<[number, number]> = [
  [0x20, 0x01], [0x23, 0x01], [0x40, 0x3f], [0x43, 0x00], [0x60, 0xf0], [0x63, 0xf0],
  [0x80, 0x77], [0x83, 0x77], [0xc0, 0x00], [0xa0, 0x41], [0xb0, 0x20 | (4 << 2) | 0x02],
];
export const SYNTH_NOTE_HZ = (0x241 * 49716) / 2 ** (20 - 4);

export function syntheticDriver(name = 'TEST Synth 00-00'): Uint8Array {
  const image = new Uint8Array(0x400);
  for (let i = 0; i < name.length && i < 24; i++) image[0x10 + i] = name.charCodeAt(i);
  const w = (off: number, v: number) => { image[off] = v & 0xff; image[off + 1] = v >> 8; };
  w(0x28, 0); w(0x2a, 0); w(0x2c, 0x400); w(0x2e, 0x64); w(0x30, 11);
  const entries = [0x70, 0x80, 0xe0, 0xb0, 0xc0, 0xd0, 0xe0, 0xe0, 0xe0, 0xe0, 0xe0];
  entries.forEach((e, i) => w(0x32 + i * 2, e));
  for (const [off, bytes] of CODE) image.set(bytes, off);
  SYNTH_NOTE.forEach(([r, v], i) => { image[0x300 + i * 2] = r; image[0x301 + i * 2] = v; });
  image[0x300 + SYNTH_NOTE.length * 2] = 0xff;
  const header = new Uint8Array(64);
  const total = header.length + image.length;
  const hw = (off: number, v: number) => { header[off] = v & 0xff; header[off + 1] = v >> 8; };
  hw(0, 0x5a4d); hw(2, total % 512); hw(4, Math.ceil(total / 512)); hw(6, 2); hw(8, 4); hw(0x18, 0x1c);
  hw(0x1c, 0x28); hw(0x1e, 0); hw(0x20, 0x2a); hw(0x22, 0);
  const file = new Uint8Array(total);
  file.set(header);
  file.set(image, header.length);
  return file;
}

/** Częstotliwość dominująca (przejścia przez zero w górę). */
export function zeroCrossingHz(samples: Float32Array, rate: number): number {
  let first = -1, last = -1, n = 0;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i - 1]! <= 0 && samples[i]! > 0) {
      if (first < 0) first = i; else n++;
      last = i;
    }
  }
  return n > 0 ? (n * rate) / (last - first) : 0;
}
