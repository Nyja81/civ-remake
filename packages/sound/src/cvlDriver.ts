/**
 * Sterownik dźwięku oryginału (*.CVL) uruchamiany na interpreterze 8086.
 *
 * Plik .CVL to program MZ ładowany przez CIV.EXE jako nakładka (INT 21h AX=4B03h). Obraz zaczyna się
 * od nagłówka sterownika: 0x10 — nazwa (np. "RLND Cvlzatn12-03-91"), 0x28 — segment kodu (relokowany),
 * 0x2A — segment danych (relokowany), 0x2C — rozmiar danych, 0x2E — numer grupy w tablicy skoków CIV.EXE (100),
 * 0x30 — liczba punktów wejścia (11), 0x32 — przesunięcia punktów wejścia. CIV.EXE kopiuje je do tablicy
 * skoków (Segment_1000.F0_1000_0b70; w wersji 474.01 pod 1000:0A1D, w 475.05 pod 1000:0A2B).
 *
 * Punkty wejścia (ustalone z kodu CIV.EXE 474.01 i z NSOUND.CVL / ASOUND.CVL):
 *  0 — inicjalizacja (wykrycie karty, cisza),
 *  1 — PlayTune(utwór, parametr): F0_11a8_046c woła go tylko przy ustawionym Sound (bit 0x10 ustawień),
 *  2 — zamknięcie (przywrócenie zegara DOS),
 *  3 — takt sekwencera: woła go procedura klatki (1000:0337) raz na klatkę obrazu; zwraca 0, wartość
 *      dodatnią (włącz szybki zegar) albo ujemną (wyłącz szybki zegar),
 *  4 — szybki takt (efekty, wibrato): woła go przerwanie zegara 1000:0199, gdy zegar pracuje szybciej
 *      niż raz na klatkę,
 *  5 — licznik taktów od ostatniego PlayTune (zegar muzyki, używany np. w intro).
 */
import { CS, Cpu8086, CpuError, DS, SP, SS, type CpuIo } from './cpu8086';

/** Segment, pod który ładujemy obraz sterownika. */
const LOAD_SEG = 0x1000;
/** Stos dla wywołań sterownika. */
const STACK_SEG = 0x9000;

export const DRIVER_ENTRY = {
  init: 0, play: 1, close: 2, tick: 3, fastTick: 4, counter: 5,
} as const;

/** Urządzenie dźwiękowe widziane przez sterownik przez porty I/O. */
export interface SoundDevice {
  portIn(port: number): number | undefined;
  portOut(port: number, value: number): boolean;
}

export interface CvlInfo {
  /** Nazwa z nagłówka sterownika. */
  name: string;
  /** Przesunięcia punktów wejścia w segmencie kodu. */
  entries: number[];
}

export function parseCvl(file: Uint8Array): CvlInfo & { image: Uint8Array; relocations: Array<[number, number]>; imageSize: number } {
  const v = new DataView(file.buffer, file.byteOffset, file.byteLength);
  if (v.getUint16(0, true) !== 0x5a4d) throw new Error('Plik sterownika nie jest programem MZ');
  const lastPage = v.getUint16(2, true);
  const pages = v.getUint16(4, true);
  const relocCount = v.getUint16(6, true);
  const headerSize = v.getUint16(8, true) * 16;
  const relocTable = v.getUint16(0x18, true);
  const fileSize = lastPage ? (pages - 1) * 512 + lastPage : pages * 512;
  const image = file.slice(headerSize, Math.min(fileSize, file.length));
  const relocations: Array<[number, number]> = [];
  for (let i = 0; i < relocCount; i++) {
    relocations.push([v.getUint16(relocTable + i * 4, true), v.getUint16(relocTable + i * 4 + 2, true)]);
  }
  const iv = new DataView(image.buffer, image.byteOffset, image.byteLength);
  const nameBytes = image.subarray(0x10, 0x28);
  let name = '';
  for (const b of nameBytes) { if (b === 0) break; name += String.fromCharCode(b); }
  const count = iv.getUint16(0x30, true);
  if (count < 6 || count > 16) throw new Error('Nieznany układ nagłówka sterownika dźwięku');
  const entries: number[] = [];
  for (let i = 0; i < count; i++) entries.push(iv.getUint16(0x32 + i * 2, true));
  const dataSeg = iv.getUint16(0x2a, true);
  const dataSize = iv.getUint16(0x2c, true);
  const imageSize = Math.max(image.length, dataSeg * 16 + dataSize);
  return { name, entries, image, relocations, imageSize };
}

/**
 * Sterownik załadowany do pamięci emulatora. Porty obsługuje `device`; przerwania DOS/BIOS, których
 * sterowniki używają (INT 21h AH=2Dh — ustawienie czasu, INT 1Ah AH=02h — zegar CMOS), są pomijane.
 */
export class CvlDriver {
  readonly cpu: Cpu8086;
  readonly info: CvlInfo;
  /** Odczyty portów od ostatniego wywołania (do modelu czasu układów). */
  portReads = 0;

  constructor(file: Uint8Array, private readonly device: SoundDevice) {
    const parsed = parseCvl(file);
    this.info = { name: parsed.name, entries: parsed.entries };
    const io: CpuIo = {
      portIn: (port) => {
        this.portReads++;
        const v = this.device.portIn(port);
        return v ?? 0xff;
      },
      portOut: (port, value) => {
        this.device.portOut(port, value & 0xff);
      },
      interrupt: (n, cpu) => {
        // INT 1Ah (zegar CMOS) i INT 21h (DOS) — sterowniki tylko przywracają nimi godzinę systemową.
        if (n === 0x1a) { cpu.r[1] = 0; cpu.r[2] = 0; cpu.flags &= ~1; return true; }
        if (n === 0x21) { cpu.r[0] = cpu.r[0]! & 0xff00; cpu.flags &= ~1; return true; }
        return n < 0x20; // wyjątki procesora i BIOS — bez skutku
      },
    };
    this.cpu = new Cpu8086(io);
    const base = LOAD_SEG * 16;
    if (base + parsed.imageSize > 0x90000) throw new Error('Sterownik dźwięku jest za duży');
    this.cpu.mem.set(parsed.image, base);
    for (const [off, seg] of parsed.relocations) {
      const a = base + seg * 16 + off;
      const w = this.cpu.mem[a]! | (this.cpu.mem[a + 1]! << 8);
      const nw = (w + LOAD_SEG) & 0xffff;
      this.cpu.mem[a] = nw & 0xff;
      this.cpu.mem[a + 1] = nw >> 8;
    }
    this.cpu.s[SS] = STACK_SEG;
    this.cpu.r[SP] = 0xfff0;
    this.cpu.s[DS] = LOAD_SEG;
    this.cpu.s[CS] = LOAD_SEG;
  }

  /** Wywołanie punktu wejścia (numer w tablicy skoków). Zwraca AX. */
  call(entry: number, args: readonly number[] = []): number {
    const off = this.info.entries[entry];
    if (off === undefined) throw new Error(`Sterownik nie ma punktu wejścia ${entry}`);
    try {
      return this.cpu.callFar(LOAD_SEG, off, args);
    } catch (e) {
      if (e instanceof CpuError) throw new Error(`Sterownik ${this.info.name}: ${e.message}`);
      throw e;
    }
  }
}
