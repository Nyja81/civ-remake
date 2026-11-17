/**
 * Cykle palety (obracanie zakresu kolorów) — CommonTools.AddPaletteCycleSlot / StartPaletteCycleSlot /
 * StopPaletteCycleSlot / CyclePaletteTimer z OpenCivOne (MIT). W oryginale robi to przerwanie zegara; tu ekrany
 * wywołują `update()` w swoich pętlach oczekiwania, a liczba kroków wynika z czasu (jednostka zegara TIMER_TICK_MS).
 */
import type { UiEvent } from './input';
import { TIMER_TICK_MS, type Ui } from './ui';

interface Slot {
  readonly speed: number;
  readonly start: number;
  /** Kolory zakresu z chwili dodania (RGB). */
  readonly colors: Uint8Array;
  count: number;
  position: number;
  active: boolean;
}

export class PaletteCycles {
  private readonly slots = new Map<number, Slot>();
  private last = now();

  constructor(private readonly ui: Ui) {}

  /** AddPaletteCycleSlot: zakres from…to, krok co `speed + 1` jednostek zegara; poprzedni slot o tym numerze jest zatrzymywany. */
  add(index: number, speed: number, from: number, to: number): void {
    this.stop(index);
    const rgb = this.ui.gfx.palette.rgb;
    this.slots.set(index, { speed, start: from, colors: rgb.slice(from * 3, (to + 1) * 3), count: 0, position: 0, active: false });
  }

  start(index: number): void {
    const slot = this.slots.get(index);
    if (slot) slot.active = true;
    this.last = now();
  }

  /** StopPaletteCycleSlot — przywraca kolory zakresu. */
  stop(index: number): void {
    const slot = this.slots.get(index);
    if (!slot) return;
    if (slot.active) {
      this.ui.gfx.palette.rgb.set(slot.colors, slot.start * 3);
      this.ui.gfx.paletteVersion++;
    }
    slot.active = false;
  }

  stopAll(): void {
    for (const index of this.slots.keys()) this.stop(index);
  }

  get active(): boolean {
    for (const s of this.slots.values()) if (s.active) return true;
    return false;
  }

  /** CyclePaletteTimer — jedna jednostka zegara; true, gdy paleta się zmieniła. */
  tick(): boolean {
    let changed = false;
    const rgb = this.ui.gfx.palette.rgb;
    for (const slot of this.slots.values()) {
      if (!slot.active) continue;
      slot.count++;
      if (slot.count <= slot.speed) continue;
      slot.count = 0;
      const n = slot.colors.length / 3;
      slot.position = (slot.position + 1) % n;
      for (let j = 0; j < n; j++) {
        const index = slot.start + ((slot.position + j) % n);
        rgb[index * 3] = slot.colors[j * 3]!;
        rgb[index * 3 + 1] = slot.colors[j * 3 + 1]!;
        rgb[index * 3 + 2] = slot.colors[j * 3 + 2]!;
      }
      changed = true;
    }
    if (changed) this.ui.gfx.paletteVersion++;
    return changed;
  }

  /** Kroki zegara, które upłynęły od poprzedniego wywołania (najwyżej 50 naraz); pokazuje klatkę po zmianie. */
  update(): void {
    const t = now();
    const ticks = Math.min(50, Math.floor((t - this.last) / TIMER_TICK_MS));
    if (ticks <= 0) return;
    this.last += ticks * TIMER_TICK_MS;
    let changed = false;
    for (let i = 0; i < ticks; i++) changed = this.tick() || changed;
    if (changed) this.ui.present();
  }

  /**
   * Odczekanie `ticks` jednostek zegara z obracaniem palety; przerwane, gdy czeka klawisz lub kliknięcie (jak kbhit —
   * zdarzenie zostaje w kolejce). Zwraca true, gdy przerwane.
   */
  async pause(ticks: number): Promise<boolean> {
    const end = now() + ticks * TIMER_TICK_MS;
    for (;;) {
      if (this.ui.hasKeyOrClick()) return true;
      const left = end - now();
      if (left <= 0) return false;
      await this.ui.input.waitFor(this.ui.sleep(Math.min(left, TIMER_TICK_MS * 2)));
      this.update();
    }
  }

  /**
   * Oczekiwanie z obracaniem palety: do klawisza lub kliknięcia (zwraca je) albo do upływu `ticks` jednostek zegara (null).
   */
  async wait(ticks = Infinity): Promise<UiEvent | null> {
    const end = now() + ticks * TIMER_TICK_MS;
    for (;;) {
      const left = end - now();
      if (left <= 0) return null;
      const e = await this.ui.waitEvent(Math.min(left, TIMER_TICK_MS * 2));
      if (e && (e.type === 'key' || e.type === 'mousedown')) return e;
      this.update();
    }
  }
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
