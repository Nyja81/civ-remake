/**
 * Wyświetlanie ekranu oryginału w oknie: ekran 320×200 w indeksach palety → RGBA (paleta) → xBR 4× (1280×800)
 * → lekkie zmiękczenie (blur 0.6 px) → canvas okna, skalowany z zachowaniem proporcji 16:10 (czarne pasy).
 * To samo wygładzanie co mapa w wersji 0.1.0. Klatka liczy się tylko po zmianie ekranu lub palety.
 * Mysz: współrzędne okna przeliczane na piksele ekranu 320×200.
 */
import { indexedToRgba, type Gfx, type InputQueue, type UiHost } from '@civ-remake/ui';
import { xbr4x } from 'xbr-js/dist/xBRjs.esm.js';

export const SOURCE_W = 320;
export const SOURCE_H = 200;
export const SCALE = 4;
export const SMOOTH_W = SOURCE_W * SCALE;
export const SMOOTH_H = SOURCE_H * SCALE;
/** Promień zmiękczenia po xBR (jak mapa w renderer.ts wersji 0.1.0). */
export const SOFTEN_PX = 0.6;

/** Wygładza obraz RGBA w rozdzielczości oryginału do canvasu 4× większego. */
export function smoothFrame(rgba: Uint8ClampedArray, width: number, height: number, sharp: HTMLCanvasElement, soft: HTMLCanvasElement): void {
  const scaled = xbr4x(new Uint32Array(rgba.buffer, rgba.byteOffset, width * height), width, height, { blendColors: true, scaleAlpha: false });
  const pixels = new Uint8ClampedArray(scaled.byteLength);
  pixels.set(new Uint8Array(scaled.buffer, scaled.byteOffset, scaled.byteLength));
  sharp.getContext('2d')!.putImageData(new ImageData(pixels, width * SCALE, height * SCALE), 0, 0);
  const ctx = soft.getContext('2d')!;
  ctx.clearRect(0, 0, soft.width, soft.height);
  ctx.filter = `blur(${SOFTEN_PX}px)`;
  ctx.drawImage(sharp, 0, 0);
  ctx.filter = 'none';
}

const canvas2d = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

export class Presenter implements UiHost {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly rgba = new Uint8ClampedArray(SOURCE_W * SOURCE_H * 4);
  private readonly sharp = canvas2d(SMOOTH_W, SMOOTH_H);
  private readonly soft = canvas2d(SMOOTH_W, SMOOTH_H);
  private scheduled = false;
  private hasFrame = false;
  /** Prostokąt obrazu w pikselach CSS okna. */
  private view = { x: 0, y: 0, w: SMOOTH_W, h: SMOOTH_H };
  /** Czas ostatniego wygładzenia klatki (ms) — do diagnostyki. */
  lastFrameMs = 0;
  frames = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly gfx: Gfx,
  ) {
    this.ctx = canvas.getContext('2d')!;
    window.addEventListener('resize', () => this.blit());
  }

  present(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    requestAnimationFrame(() => {
      this.scheduled = false;
      this.render();
    });
  }

  sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Przelicza klatkę: paleta → xBR → zmiękczenie, potem rysuje w oknie. */
  render(): void {
    const t0 = performance.now();
    indexedToRgba(this.gfx.screen, this.gfx.palette, this.rgba);
    smoothFrame(this.rgba, SOURCE_W, SOURCE_H, this.sharp, this.soft);
    this.lastFrameMs = performance.now() - t0;
    this.frames++;
    this.hasFrame = true;
    this.blit();
  }

  /** Rysuje gotową klatkę w oknie z zachowaniem proporcji 16:10. */
  private blit(): void {
    const dpr = window.devicePixelRatio || 1;
    const cssW = this.canvas.clientWidth;
    const cssH = this.canvas.clientHeight;
    const w = Math.round(cssW * dpr);
    const h = Math.round(cssH * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    const scale = Math.min(cssW / SOURCE_W, cssH / SOURCE_H);
    const vw = SOURCE_W * scale;
    const vh = SOURCE_H * scale;
    this.view = { x: (cssW - vw) / 2, y: (cssH - vh) / 2, w: vw, h: vh };
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    if (!this.hasFrame) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.soft, this.view.x * dpr, this.view.y * dpr, vw * dpr, vh * dpr);
  }

  /** Punkt okna (clientX/Y) → piksel ekranu 320×200 (przycięty do ekranu). */
  toScreen(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const x = Math.floor(((clientX - rect.left - this.view.x) / this.view.w) * SOURCE_W);
    const y = Math.floor(((clientY - rect.top - this.view.y) / this.view.h) * SOURCE_H);
    return { x: Math.min(SOURCE_W - 1, Math.max(0, x)), y: Math.min(SOURCE_H - 1, Math.max(0, y)) };
  }

  /** Podłącza mysz i klawiaturę okna do kolejki zdarzeń interfejsu. */
  attachInput(input: InputQueue): void {
    const button = (b: number): 'left' | 'right' => (b === 2 ? 'right' : 'left');
    this.canvas.addEventListener('mousemove', (e) => input.push({ type: 'mousemove', ...this.toScreen(e.clientX, e.clientY), button: 'none' }));
    this.canvas.addEventListener('mousedown', (e) => {
      e.preventDefault();
      input.push({ type: 'mousedown', ...this.toScreen(e.clientX, e.clientY), button: button(e.button) });
    });
    window.addEventListener('mouseup', (e) => input.push({ type: 'mouseup', ...this.toScreen(e.clientX, e.clientY), button: button(e.button) }));
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      if (e.metaKey) return; // skróty systemu (Cmd+Q itd.)
      let key = e.key;
      // Z Alt (Option na Macu) przeglądarka podaje znaki specjalne — litera z kodu klawisza.
      if (e.altKey && /^Key[A-Z]$/.test(e.code)) key = e.code.substring(3).toLowerCase();
      if (key === 'Dead' || key === 'Shift' || key === 'Alt' || key === 'Control' || key === 'Meta') return;
      e.preventDefault();
      input.push({ type: 'key', key, alt: e.altKey, shift: e.shiftKey, ctrl: e.ctrlKey });
    });
  }

  /** Kursor myszy z obrazka oryginału (TORCH.PIC), wygładzony tak samo jak ekran. Niesprawdzone na pliku oryginału. */
  setCursor(rgba: Uint8ClampedArray, width: number, height: number, hotX = 0, hotY = 0): void {
    if (width > 32 || height > 32) return; // przeglądarka ogranicza kursory do 128×128
    const sharp = canvas2d(width * SCALE, height * SCALE);
    const soft = canvas2d(width * SCALE, height * SCALE);
    const scaled = xbr4x(new Uint32Array(rgba.buffer, rgba.byteOffset, width * height), width, height, { blendColors: true, scaleAlpha: true });
    const pixels = new Uint8ClampedArray(scaled.byteLength);
    pixels.set(new Uint8Array(scaled.buffer, scaled.byteOffset, scaled.byteLength));
    sharp.getContext('2d')!.putImageData(new ImageData(pixels, width * SCALE, height * SCALE), 0, 0);
    const ctx = soft.getContext('2d')!;
    ctx.filter = `blur(${SOFTEN_PX}px)`;
    ctx.drawImage(sharp, 0, 0);
    this.canvas.style.cursor = `url(${soft.toDataURL()}) ${hotX * SCALE} ${hotY * SCALE}, default`;
  }
}
