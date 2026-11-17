/**
 * Kontekst ekranów: grafika, wejście i „gospodarz” (warstwa wyświetlania), który pokazuje ekran 0
 * i odmierza czas. W testach gospodarz nic nie wyświetla i nie czeka.
 */
import type { Gfx } from './gfx';
import { InputQueue, type UiEvent } from './input';
import { Palette } from './palette';

export interface UiHost {
  /** Ekran 0 lub paleta się zmieniły — pokaż nową klatkę (wywołania można scalać). */
  present(): void;
  /** Odczekanie `ms` milisekund. */
  sleep(ms: number): Promise<void>;
  /**
   * PlayTune oryginału (punkt wejścia 1 sterownika dźwięku): utwór 0–44 i parametr. Brak metody = bez dźwięku
   * (testy, aplikacja bez sterownika).
   */
  playTune?(tune: number, arg: number): void;
  /** Licznik taktów sterownika od ostatniego PlayTune (punkt wejścia 5); undefined, gdy dźwięku nie ma. */
  tuneCounter?(): number | undefined;
}

/** Jednostka zegara oryginału w CommonTools.WaitTimer (wzorzec: 12 ms na jednostkę). */
export const TIMER_TICK_MS = 12;

export class Ui {
  readonly input = new InputQueue();
  /**
   * Ustawienie Sound (bit 0x10 GameSettingFlags, Var_19c0). Przed grą — własne (intro włącza dźwięk: F2_0000_0000 przed 0x0334),
   * w grze ekran gry podstawia `state.settings`, więc Preferences i Alt+V zmieniają je w miejscu.
   */
  soundSettings: { sound: boolean } = { sound: true };

  constructor(
    readonly gfx: Gfx,
    readonly host: UiHost,
  ) {}

  present(): void {
    this.host.present();
  }

  /** Segment_11a8.F0_11a8_046c_PlayTune — utwór tylko przy włączonym Sound. */
  playTune(tune: number, arg = 0): void {
    if (this.soundSettings.sound) this.host.playTune?.(tune, arg);
  }

  /**
   * F0_11a8_0486 (menu główne): przed wyciszeniem muzyki intro czeka, aż licznik taktów sterownika przekroczy `from`
   * albo dojdzie do granicy frazy (`from` + k·`period`). Licznik rośnie w porcjach (bufor dźwięku), więc koniec frazy
   * rozpoznajemy po przejściu przez granicę. Bez dźwięku — od razu.
   */
  async waitTunePhrase(from: number, period: number, timeoutMs = 10000): Promise<void> {
    const first = this.host.tuneCounter?.();
    if (first === undefined || first <= from || !this.soundSettings.sound) return;
    const phrase = (c: number) => Math.floor((c - from) / period);
    if ((first - from) % period === 0) return;
    const deadline = performanceNow() + timeoutMs;
    while (performanceNow() < deadline) {
      await this.sleep(5);
      const c = this.host.tuneCounter?.();
      if (c === undefined || c < first || phrase(c) !== phrase(first)) return;
    }
  }

  sleep(ms: number): Promise<void> {
    return this.host.sleep(ms);
  }

  /** CommonTools.WaitTimer — czeka podaną liczbę jednostek zegara. */
  waitTimer(ticks: number): Promise<void> {
    return this.sleep(Math.ceil(Math.max(ticks * TIMER_TICK_MS, 1)));
  }

  /** Czeka na zdarzenie najwyżej `timeoutMs`; null, gdy nic nie przyszło. Ruch myszy nie przerywa czekania. */
  async waitEvent(timeoutMs: number, includeMove = false): Promise<UiEvent | null> {
    const deadline = performanceNow() + timeoutMs;
    for (;;) {
      const e = this.input.take();
      if (e) {
        if (e.type === 'mousemove' && !includeMove) continue;
        if (e.type === 'mouseup') continue;
        return e;
      }
      const left = deadline - performanceNow();
      if (left <= 0) return null;
      let timedOut = false;
      await this.input.waitFor(this.sleep(left).then(() => (timedOut = true)));
      if (timedOut && this.input.size === 0) return null;
    }
  }

  /** F0_2459_0918_WaitForKeyPressOrMouseClick — czeka na klawisz albo kliknięcie. */
  async waitKeyOrClick(): Promise<UiEvent> {
    for (;;) {
      const e = await this.input.next();
      if (e.type === 'key' || e.type === 'mousedown') return e;
    }
  }

  /** kbhit() lub wciśnięty przycisk myszy: czy na początku kolejki czeka klawisz albo kliknięcie (ruchy myszy są odrzucane). */
  hasKeyOrClick(): boolean {
    return this.input.peekKeyOrClick();
  }

  /**
   * CommonTools.TransformPaletteToColor / TransformPalette — płynne przejście palety do koloru lub do palety docelowej.
   * Wzorzec liczy przejście w HSV w `speed·10` krokach zegara; tu liniowo w RGB w tylu samych krokach (wygląd zbliżony).
   */
  async fadePalette(target: Palette | [number, number, number], speed: number, skippable = false): Promise<void> {
    const from = this.gfx.palette.clone();
    const to = Array.isArray(target) ? solid(target) : target;
    const steps = Math.max(1, speed * 2);
    for (let s = 1; s <= steps; s++) {
      const k = s / steps;
      const p = this.gfx.palette.rgb;
      for (let i = 0; i < 768; i++) p[i] = Math.round(from.rgb[i]! + (to.rgb[i]! - from.rgb[i]!) * k);
      this.gfx.paletteVersion++;
      this.present();
      if (skippable && this.input.size > 0) break;
      await this.waitTimer(5);
    }
    this.gfx.setPalette(to);
    this.present();
  }

  /**
   * GDriver.F0_VGA_06b7_DrawScreenToScreen0WithEffect — ekran `from` pojawia się na ekranie 0 losowymi pikselami.
   * Wzorzec rysuje partiami po 80 pikseli; tu 16 klatek, każda z 1/16 losowo uporządkowanych pikseli.
   */
  async dissolve(from: 1 | 2, frames = 16): Promise<void> {
    const src = this.gfx.screens[from].pixels;
    const dst = this.gfx.screen.pixels;
    const order = new Uint32Array(dst.length);
    for (let i = 0; i < order.length; i++) order[i] = i;
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = order[i]!;
      order[i] = order[j]!;
      order[j] = t;
    }
    const per = Math.ceil(order.length / frames);
    for (let f = 0; f < frames; f++) {
      for (let k = f * per; k < Math.min(order.length, (f + 1) * per); k++) dst[order[k]!] = src[order[k]!]!;
      this.present();
      if (this.input.size > 0 && this.hasKeyOrClick()) break;
      await this.waitTimer(2);
    }
    dst.set(src);
    this.present();
  }
}

function solid([r, g, b]: [number, number, number]): Palette {
  const p = new Palette();
  for (let i = 0; i < 256; i++) p.setColor(i, r, g, b);
  return p;
}

const performanceNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
