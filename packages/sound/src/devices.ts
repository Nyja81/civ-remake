/**
 * Urządzenia widziane przez sterowniki dźwięku oryginału przez porty I/O:
 * karta AdLib (YM3812 pod 0x388/0x389) i głośnik PC (kanał 2 układu 8253 pod 0x42/0x43 + port 0x61).
 */
import type { SoundDevice } from './cvlDriver';
import { Opl3 } from './opl3';

/** Czas jednego odczytu portu na szynie ISA — przyjęte 1 µs (model zegarów OPL przy wykrywaniu karty). */
const MICROSECONDS_PER_PORT_READ = 1;

/**
 * Karta AdLib: rejestr adresu i danych, zegary T1/T2 (tylko na potrzeby wykrywania karty przez sterownik),
 * bit WSE rejestru 0x01 (bez niego YM3812 gra tylko sinusem), dalsze zapisy do emulatora Nuked OPL3
 * w trybie zgodności z OPL2.
 */
export class AdLibDevice implements SoundDevice {
  readonly chip: Opl3;
  /** Liczba zapisów rejestrów (do testów i wykrywania ciszy). */
  writes = 0;
  /** Dziennik zapisów (rejestr, wartość) — włączany w testach. */
  log: Array<[number, number]> | null = null;
  private address = 0;
  private status = 0;
  private timerReg = [0, 0];
  private timerStart = [-1, -1];
  private timerMask = 0;
  private wse = false;
  private readonly waveform = new Uint8Array(0x16);
  /** Upływ czasu w µs — liczony z odczytów portów. */
  private clock = 0;

  constructor(sampleRate: number) {
    this.chip = new Opl3(sampleRate);
  }

  portIn(port: number): number | undefined {
    this.clock += MICROSECONDS_PER_PORT_READ;
    if (port !== 0x388) return undefined;
    this.updateTimers();
    // YM3812: bity 1–2 statusu zawsze ustawione (0x06), bit 7 = przerwanie zegara.
    return (this.status | 0x06) & 0xff;
  }

  portOut(port: number, value: number): boolean {
    if (port === 0x388) {
      this.address = value;
      return true;
    }
    if (port !== 0x389) return false;
    this.write(this.address, value);
    return true;
  }

  private updateTimers(): void {
    for (let t = 0; t < 2; t++) {
      if (this.timerStart[t]! < 0) continue;
      const period = (256 - this.timerReg[t]!) * (t === 0 ? 80 : 320);
      if (this.clock - this.timerStart[t]! >= period) {
        const bit = t === 0 ? 0x40 : 0x20;
        if (!(this.timerMask & bit)) this.status |= bit | 0x80;
        this.timerStart[t] = this.clock;
      }
    }
  }

  /** Zapis rejestru układu tak, jak robi to sterownik (adres + dane). */
  write(reg: number, value: number): void {
    this.writes++;
    this.log?.push([reg, value]);
    if (reg === 0x02 || reg === 0x03) {
      this.timerReg[reg - 2] = value;
      return;
    }
    if (reg === 0x04) {
      if (value & 0x80) {
        this.status = 0;
        return;
      }
      this.timerMask = value & 0x60;
      this.timerStart[0] = value & 0x01 ? this.clock : -1;
      this.timerStart[1] = value & 0x02 ? this.clock : -1;
      return;
    }
    if (reg === 0x01) {
      const wse = (value & 0x20) !== 0;
      if (wse !== this.wse) {
        this.wse = wse;
        for (let i = 0; i < 0x16; i++) this.chip.writeRegBuffered(0xe0 + i, wse ? this.waveform[i]! : 0);
      }
      return;
    }
    if (reg >= 0xe0 && reg <= 0xf5) {
      this.waveform[reg - 0xe0] = value;
      this.chip.writeRegBuffered(reg, this.wse ? value : 0);
      return;
    }
    if (reg > 0xf5) return;
    this.chip.writeRegBuffered(reg, value);
  }
}

/** Amplituda fali głośnika — poziom jak w DOSBoxie (porównanie nagrań). */
const SPEAKER_LEVEL = 0.15;

/** Częstotliwość wejściowa układu 8253. */
export const PIT_HZ = 1193182;

/**
 * Głośnik PC: kanał 2 zegara 8253 w trybie fali prostokątnej, bramka i wyjście sterowane bitami 0–1 portu 0x61.
 */
export class PcSpeakerDevice implements SoundDevice {
  writes = 0;
  private port61 = 0;
  private divisor = 0x10000;
  private latchLow: number | null = null;
  private phase = 0;
  private level = 0;

  constructor(private readonly sampleRate: number) {}

  portIn(port: number): number | undefined {
    if (port === 0x61) return this.port61;
    return undefined;
  }

  portOut(port: number, value: number): boolean {
    if (port === 0x61) {
      this.port61 = value;
      this.writes++;
      return true;
    }
    if (port === 0x43) {
      if ((value & 0xc0) === 0x80) this.latchLow = null; // kanał 2: nowa wartość dzielnika
      return true;
    }
    if (port === 0x42) {
      if (this.latchLow === null) {
        this.latchLow = value;
      } else {
        this.divisor = ((value << 8) | this.latchLow) || 0x10000;
        this.latchLow = null;
        this.writes++;
      }
      return true;
    }
    return false;
  }

  /** Następna próbka (−1…1): fala prostokątna z lekkim wygładzeniem jak na prawdziwym głośniku. */
  sample(): number {
    let target = 0;
    if ((this.port61 & 0x03) === 0x03) {
      const freq = PIT_HZ / this.divisor;
      if (freq < this.sampleRate / 2) {
        this.phase += freq / this.sampleRate;
        this.phase -= Math.floor(this.phase);
        target = this.phase < 0.5 ? SPEAKER_LEVEL : -SPEAKER_LEVEL;
      }
    } else if (this.port61 & 0x02) {
      target = SPEAKER_LEVEL;
    }
    this.level += (target - this.level) * 0.5;
    return this.level;
  }
}
