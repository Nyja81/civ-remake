/**
 * Zrzuty ekranów NASZEGO interfejsu (packages/ui) dla tego samego scenariusza, który dosbox.py odgrywa w oryginale.
 *
 * Uruchomienie:  CIV1_DIR=… npx tsx tools/dosbox/render.ts SCENARIUSZ [KATALOG_WYNIKÓW]
 * Pliki gry czytane z CIV1_DIR (nie trafiają do repozytorium); zapisy oryginału CIVIL?.SVE/.MAP — z CIV1_SAVES_DIR
 * (domyślnie folder gry DOSBoxa /tmp/civ-dosbox/game), żeby „Load a Saved Game” wczytało ten sam stan co oryginał.
 * Wynik: KATALOG/NAZWA.png (320×200, paleta) — domyślnie /tmp/civ-dosbox/ours.
 *
 * Format scenariusza (wspólny z dosbox.py): w wierszu jeden krok —
 *   keys K1 K2 …   klawisze w nazwach xdotool (Return, Escape, space, Up, F1, alt+g, shift+a, a, 1…)
 *   type TEKST     wpisanie tekstu
 *   click X Y      kliknięcie lewym przyciskiem w punkt ekranu 320×200 (rclick — prawym)
 *   move X Y       tylko ruch myszy
 *   shot NAZWA     zrzut ekranu, gdy interfejs czeka na wejście
 *   sleep S        przerwa (tylko w DOSBoxie)
 *   dosbox …       krok tylko dla oryginału; ours … — tylko dla naszego interfejsu
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { GameAssets, Gfx, Ui, UI_OPTIONAL_FILES, UI_REQUIRED_FILES, runGameFlow, type UiEvent, type UiHost } from '../../packages/ui/src/index';

const dir = process.env.CIV1_DIR;
if (!dir) throw new Error('Ustaw CIV1_DIR');
const savesDir = process.env.CIV1_SAVES_DIR ?? '/tmp/civ-dosbox/game';
const [scenarioPath, outDir = '/tmp/civ-dosbox/ours'] = process.argv.slice(2);
if (!scenarioPath) throw new Error('Podaj scenariusz');

function readGameFiles(): Record<string, Uint8Array> {
  const present = new Map(readdirSync(dir!).map((n) => [n.toUpperCase(), n]));
  const files: Record<string, Uint8Array> = {};
  for (const name of [...UI_REQUIRED_FILES, ...UI_OPTIONAL_FILES]) {
    const real = present.get(name);
    if (real) files[name] = new Uint8Array(readFileSync(join(dir!, real)));
  }
  return files;
}

// --- PNG z paletą ---------------------------------------------------------------------------------------------
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of data) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
export function encodeIndexedPng(width: number, height: number, pixels: Uint8Array, rgb: Uint8Array): Uint8Array {
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  ihdr.set([8, 3, 0, 0, 0], 8);
  const raw = new Uint8Array((width + 1) * height);
  for (let y = 0; y < height; y++) raw.set(pixels.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);
  const parts = [
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('PLTE', rgb.subarray(0, 768)), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

// --- klawisze xdotool → zdarzenia interfejsu --------------------------------------------------------------------
const NAMED: Record<string, string> = {
  Return: 'Enter', KP_Enter: 'Enter', Escape: 'Escape', space: ' ', BackSpace: 'Backspace', Tab: 'Tab',
  Up: 'ArrowUp', Down: 'ArrowDown', Left: 'ArrowLeft', Right: 'ArrowRight', Home: 'Home', End: 'End',
  Prior: 'PageUp', Next: 'PageDown', period: '.', comma: ',', minus: '-', apostrophe: "'",
  KP_1: '1', KP_2: '2', KP_3: '3', KP_4: '4', KP_5: '5', KP_6: '6', KP_7: '7', KP_8: '8', KP_9: '9',
};
export function keyEvent(spec: string): UiEvent {
  const parts = spec.split('+');
  const base = parts.pop()!;
  const mods = new Set(parts.map((p) => p.toLowerCase()));
  let key = NAMED[base] ?? base;
  const shift = mods.has('shift');
  if (shift && key.length === 1) key = key.toUpperCase();
  return { type: 'key', key, alt: mods.has('alt') || undefined, shift: shift || undefined, ctrl: mods.has('ctrl') || undefined };
}

// --- gospodarz: bez wyświetlania, czas wirtualny ------------------------------------------------------------------
// Zegar interfejsu (performance.now) płynie tylko w sleep(): animacje i czekanie z limitem przebiegają natychmiast,
// a zależności czasowe (rozkład napisów, cykle palety) zostają takie jak przy prawdziwym zegarze.
let virtualNow = 0;
Object.defineProperty(globalThis.performance, 'now', { value: () => virtualNow, configurable: true });
class CaptureHost implements UiHost {
  frames = 0;
  present(): void {
    this.frames++;
  }
  sleep(ms: number): Promise<void> {
    virtualNow += Math.max(ms, 0.01);
    return new Promise((resolve) => setImmediate(resolve));
  }
}

const tick = () => new Promise((r) => setImmediate(r));

async function main(): Promise<void> {
  const assets = new GameAssets(readGameFiles());
  const host = new CaptureHost();
  const ui = new Ui(new Gfx(assets.fonts), host);
  mkdirSync(outDir, { recursive: true });

  const originalSaves = existsSync(savesDir)
    ? {
        list: async () => [...Array(10).keys()].filter((i) => existsSync(join(savesDir, `CIVIL${i}.SVE`)) && existsSync(join(savesDir, `CIVIL${i}.MAP`))),
        read: async (i: number) => ({
          sve: new Uint8Array(readFileSync(join(savesDir, `CIVIL${i}.SVE`))),
          map: new Uint8Array(readFileSync(join(savesDir, `CIVIL${i}.MAP`))),
        }),
      }
    : undefined;
  // Interfejs „czeka na gracza”, gdy któryś ekran czeka na wejście BEZ limitu czasu (waitFor bez drugiej obietnicy);
  // czekanie z limitem (animacje, miganie, intro) nie jest bezczynnością.
  let blocking = 0;
  const waitFor = ui.input.waitFor.bind(ui.input);
  ui.input.waitFor = async (other?: Promise<unknown>) => {
    if (other) return waitFor(other);
    blocking++;
    try {
      await waitFor();
    } finally {
      blocking--;
    }
  };
  let failure: unknown = null;
  let currentStep = '(start)';
  void runGameFlow(ui, assets, { originalSaves, seed: () => 1 }).catch((e) => (failure = e));

  /**
   * Czeka, aż interfejs będzie czekał na wejście z pustą kolejką przez `stable` kolejnych sprawdzeń;
   * `any` — wystarczy czekanie z limitem czasu (klawisz przerywa animację, jak w oryginale).
   */
  async function idle(stable = 40, any = false, limit = 400000): Promise<void> {
    let n = 0;
    for (let i = 0; i < limit; i++) {
      await tick();
      if (failure) throw failure;
      if ((blocking > 0 || (any && ui.input.waiting)) && ui.input.size === 0) {
        if (++n >= stable) return;
      } else {
        n = 0;
      }
    }
    throw new Error(`Interfejs nie czeka na wejście (krok: ${currentStep})`);
  }
  const push = async (e: UiEvent) => {
    await idle(5, true);
    ui.input.push(e);
  };

  for (const raw of readFileSync(scenarioPath!, 'utf8').split('\n')) {
    let line = raw.split('#', 1)[0]!.trim();
    if (!line) continue;
    if (line.startsWith('dosbox ')) continue;
    if (line.startsWith('ours ')) line = line.slice(5);
    currentStep = line;
    const [cmd, ...args] = line.split(/\s+/);
    switch (cmd) {
      case 'keys':
        for (const k of args) await push(keyEvent(k));
        break;
      case 'type':
        for (const ch of line.slice(5)) await push({ type: 'key', key: ch });
        break;
      case 'click':
      case 'rclick': {
        const [x, y] = args.map(Number) as [number, number];
        const button = cmd === 'click' ? 'left' : 'right';
        await push({ type: 'mousemove', x, y, button: 'none' });
        await push({ type: 'mousedown', x, y, button });
        ui.input.push({ type: 'mouseup', x, y, button });
        break;
      }
      case 'move': {
        const [x, y] = args.map(Number) as [number, number];
        await push({ type: 'mousemove', x, y, button: 'none' });
        break;
      }
      case 'shot': {
        // ekran bez czekania bez limitu (np. migający kursor pola tekstowego): po 20 000 sprawdzeń wystarczy dowolne czekanie
        await idle(40, false, 20000).catch(() => idle(40, true));
        const png = encodeIndexedPng(320, 200, ui.gfx.screen.pixels, ui.gfx.palette.rgb);
        writeFileSync(join(outDir, `${args[0]}.png`), png);
        console.log(join(outDir, `${args[0]}.png`));
        break;
      }
      case 'sleep':
        break;
      default:
        throw new Error(`Nieznany krok: ${line}`);
    }
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
