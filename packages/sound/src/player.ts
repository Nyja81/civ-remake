/**
 * Odtwarzacz muzyki i efektów oryginału: sterownik .CVL na emulatorze 8086 + emulator karty,
 * taktowany tak jak w CIV.EXE (wersja 474.01, segment 1000):
 *
 * - przerwanie zegara 1000:0199 jest zsynchronizowane z odświeżaniem obrazu (pomiar okresu klatki
 *   w 1000:0268 — dla VGA 70,086 Hz); co klatkę woła procedurę 1000:0337,
 * - 1000:0337 przy [0x4e] = 4 (VGA) pomija co 7. klatkę (licznik [0x5e]) — sekwencer dostaje 6 z 7 klatek,
 *   czyli 60 taktów na sekundę — i woła punkt wejścia 3 sterownika (takt sekwencera); wynik ujemny
 *   przełącza zegar na raz na klatkę (1000:0081), dodatni — na [0x4e] razy na klatkę (1000:0069),
 * - przy szybkim zegarze każde przerwanie woła punkt wejścia 4 (szybkie efekty).
 *
 * Czas liczymy w próbkach wyjścia; zdarzenia sterownika wykonują się przed próbką, w której wypadają.
 */
import { CvlDriver, DRIVER_ENTRY, type CvlInfo } from './cvlDriver';
import { AdLibDevice, PcSpeakerDevice } from './devices';

/** Odświeżanie obrazu VGA w trybie 13h. */
export const VGA_REFRESH_HZ = 70.086;
/** [0x4e] dla VGA: liczba przerwań zegara na klatkę przy szybkim zegarze. */
const FAST_TIMER_DIVIDER = 4;
/** Okres pomijania klatek w 1000:0337 (licznik [0x5e]). */
const SKIP_PERIOD = 7;

export type SoundCard = 'adlib' | 'speaker';

export interface SoundPlayerOptions {
  /** Karta, do której napisany jest sterownik: ASOUND.CVL — AdLib, ISOUND.CVL — głośnik PC. */
  card: SoundCard;
  /** Częstotliwość próbkowania wyjścia (np. AudioContext.sampleRate). */
  sampleRate: number;
  /** Głośność (domyślnie 1). */
  volume?: number;
}

export class SoundPlayer {
  readonly driver: CvlDriver;
  readonly card: SoundCard;
  readonly sampleRate: number;
  volume: number;
  readonly adlib: AdLibDevice | null;
  readonly speaker: PcSpeakerDevice | null;
  /** Licznik wywołań punktu wejścia 3 (klatek z taktem sekwencera). */
  sequencerTicks = 0;
  /** Bieżąca próbka wyjścia. */
  private position = 0;
  /** Czas następnego przerwania zegara (w próbkach wyjścia). */
  private nextIrq = 0;
  /** Numer przerwania w bieżącej klatce (0 … divider−1). */
  private irqInFrame = 0;
  private fastTimer = false;
  private skipCounter = SKIP_PERIOD;
  private readonly frameSamples: number;
  private readonly pending: Array<[number, number]> = [];
  private readonly stereo = [0, 0];
  /** Ostatnia próbka z niezerowym wyjściem albo zapisem do układu (do wstrzymania obliczeń w ciszy). */
  private lastActivity = 0;
  private lastWrites = 0;

  constructor(driverFile: Uint8Array, options: SoundPlayerOptions) {
    this.sampleRate = options.sampleRate;
    this.volume = options.volume ?? 1;
    this.frameSamples = this.sampleRate / VGA_REFRESH_HZ;
    this.card = options.card;
    if (this.card === 'adlib') {
      this.adlib = new AdLibDevice(this.sampleRate);
      this.speaker = null;
      this.driver = new CvlDriver(driverFile, this.adlib);
    } else {
      this.adlib = null;
      this.speaker = new PcSpeakerDevice(this.sampleRate);
      this.driver = new CvlDriver(driverFile, this.speaker);
    }
    this.driver.call(DRIVER_ENTRY.init, [0]);
  }

  get info(): CvlInfo {
    return this.driver.info;
  }

  /** PlayTune(utwór, parametr) — wykonane przed następną próbką. */
  play(tune: number, arg = 0): void {
    this.pending.push([tune, arg]);
  }

  /** Licznik taktów sterownika od ostatniego PlayTune (punkt wejścia 5). */
  counter(): number {
    return this.driver.call(DRIVER_ENTRY.counter);
  }

  /** Czas od początku w sekundach. */
  get time(): number {
    return this.position / this.sampleRate;
  }

  private irq(): void {
    // 1000:0199: co [0x4c] przerwań — procedura klatki 1000:0337, potem przy szybkim zegarze punkt wejścia 4.
    const divider = this.fastTimer ? FAST_TIMER_DIVIDER : 1;
    this.irqInFrame++;
    if (this.irqInFrame >= divider) {
      this.irqInFrame = 0;
      this.frame();
    }
    if (this.fastTimer) this.driver.call(DRIVER_ENTRY.fastTick);
    this.nextIrq += this.frameSamples / (this.fastTimer ? FAST_TIMER_DIVIDER : 1);
  }

  private frame(): void {
    // 1000:0337: przy [0x4e] = 4 co siódma klatka bez taktu sekwencera.
    this.skipCounter--;
    if (this.skipCounter <= 0) {
      this.skipCounter = SKIP_PERIOD;
      return;
    }
    this.sequencerTicks++;
    const r = (this.driver.call(DRIVER_ENTRY.tick) << 16) >> 16;
    if (r < 0) {
      if (this.fastTimer) { this.fastTimer = false; this.irqInFrame = 0; }
    } else if (r > 0) {
      if (!this.fastTimer) { this.fastTimer = true; this.irqInFrame = 0; }
    }
  }

  /** Wypełnia bufor próbkami mono (−1…1). */
  render(out: Float32Array, offset = 0, length = out.length - offset): void {
    const end = offset + length;
    // Poziom jak w DOSBoxie (porównanie nagrań): wyjście układu ×2.
    const gain = (this.volume * 2) / 32768;
    for (let i = offset; i < end; i++) {
      while (this.pending.length) {
        const [tune, arg] = this.pending.shift()!;
        this.driver.call(DRIVER_ENTRY.play, [tune, arg]);
        this.lastActivity = this.position;
      }
      while (this.nextIrq <= this.position) this.irq();
      if (this.adlib) {
        if (this.adlib.writes !== this.lastWrites) {
          this.lastWrites = this.adlib.writes;
          this.lastActivity = this.position;
        }
        // Cisza dłużej niż 2 s bez zapisów — układ nie gra, obliczenia wstrzymane.
        if (this.position - this.lastActivity > this.sampleRate * 2) {
          out[i] = 0;
        } else {
          this.adlib.chip.generateResampled(this.stereo);
          const v = this.stereo[0]!;
          if (v !== 0) this.lastActivity = this.position;
          out[i] = v * gain;
        }
      } else {
        out[i] = this.speaker!.sample() * this.volume;
      }
      this.position++;
    }
  }
}
