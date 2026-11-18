/**
 * Wejście interfejsu: kolejka zdarzeń klawiatury i myszy we współrzędnych ekranu 320×200.
 * Oryginał odpytuje stan myszy i bufor klawiatury w pętlach; tutaj ekrany są funkcjami async,
 * które czekają na kolejne zdarzenie — kolejność kroków zostaje taka jak we wzorcu.
 */

/** Klawisz: pojedynczy znak ('a', 'A', '1', ' ') albo nazwa jak w KeyboardEvent.key ('Enter', 'Escape', 'ArrowUp', 'F1'…). */
export interface KeyEvent {
  readonly type: 'key';
  readonly key: string;
  readonly alt?: boolean;
  readonly shift?: boolean;
  readonly ctrl?: boolean;
}

export type MouseButton = 'left' | 'right' | 'none';

export interface PointerEvent {
  readonly type: 'mousedown' | 'mouseup' | 'mousemove';
  /** Współrzędne na ekranie oryginału (0–319, 0–199). */
  readonly x: number;
  readonly y: number;
  readonly button: MouseButton;
}

export type UiEvent = KeyEvent | PointerEvent;

export const isKey = (e: UiEvent | null | undefined, key?: string): e is KeyEvent =>
  !!e && e.type === 'key' && (key === undefined || e.key === key);

export const isClick = (e: UiEvent | null | undefined): e is PointerEvent => !!e && e.type === 'mousedown';

export class InputQueue {
  private readonly queue: UiEvent[] = [];
  private waiters: (() => void)[] = [];
  private waitingCount = 0;
  /** Ostatnie znane położenie myszy (aktualizowane przy pobraniu zdarzenia). */
  readonly mouse = { x: 0, y: 0 };

  push(event: UiEvent): void {
    this.queue.push(event);
    const waiters = this.waiters;
    this.waiters = [];
    for (const w of waiters) w();
  }

  /** Oddaje zdarzenie na początek kolejki (podejrzane, ale jeszcze nieobsłużone). */
  unshift(event: UiEvent): void {
    this.queue.unshift(event);
    const waiters = this.waiters;
    this.waiters = [];
    for (const w of waiters) w();
  }

  get size(): number {
    return this.queue.length;
  }

  /** Pobiera zdarzenie bez czekania. */
  take(): UiEvent | undefined {
    const e = this.queue.shift();
    if (e && e.type !== 'key') {
      this.mouse.x = e.x;
      this.mouse.y = e.y;
    }
    return e;
  }

  /** Obietnica spełniona, gdy w kolejce jest co najmniej jedno zdarzenie (nie pobiera go). */
  available(): Promise<void> {
    if (this.queue.length > 0) return Promise.resolve();
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  /** Czy któryś ekran właśnie czeka na wejście (używane przez scenariusze testów). */
  get waiting(): boolean {
    return this.waitingCount > 0;
  }

  /** Czeka, aż przyjdzie zdarzenie albo spełni się `other` (np. upłynie czas). */
  async waitFor(other?: Promise<unknown>): Promise<void> {
    this.waitingCount++;
    try {
      await (other ? Promise.race([this.available(), other]) : this.available());
    } finally {
      this.waitingCount--;
    }
  }

  async next(): Promise<UiEvent> {
    for (;;) {
      const e = this.take();
      if (e) return e;
      await this.waitFor();
    }
  }

  /** Odrzuca z początku kolejki ruchy myszy i puszczenia przycisków; true, gdy dalej czeka klawisz lub kliknięcie. */
  peekKeyOrClick(): boolean {
    for (;;) {
      const e = this.queue[0];
      if (!e) return false;
      if (e.type === 'key' || e.type === 'mousedown') return true;
      this.take();
    }
  }

  /** ClearKeyboardAndMouseEvents — odrzuca zaległe zdarzenia (ruch myszy zapamiętuje). */
  clear(): void {
    while (this.queue.length > 0) this.take();
  }
}
