/**
 * „Małpa” na ekranie gry: losowe klawisze i kliknięcia przez wiele tur, na prawdziwych plikach gry (CIV1_DIR) albo syntetycznych.
 * Wykrywa wyjątki w ekranach i silniku oraz zawieszenia (ekran nie czeka na wejście i nie kończy pracy).
 * Domyślnie pominięty; uruchomienie: MONKEY=1 [MONKEY_GAMES=5] [MONKEY_EVENTS=20000] [CIV1_DIR=…] npx vitest run packages/ui/test/monkey.stress.test.ts
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { advanceToHuman, newGame, unitOrder } from '@civ-remake/engine';
import { GameAssets } from '../src/assets';
import { UI_OPTIONAL_FILES, UI_REQUIRED_FILES } from '../src/files';
import { Gfx } from '../src/gfx';
import type { UiEvent } from '../src/input';
import { GameScreen } from '../src/screens/gameScreen';
import { Ui } from '../src/ui';
import { syntheticFiles, TestHost } from './synthetic';

const enabled = process.env.MONKEY === '1';
const games = Number(process.env.MONKEY_GAMES ?? 5);
const maxEvents = Number(process.env.MONKEY_EVENTS ?? 20000);
const dir = process.env.CIV1_DIR ?? '';

function gameFiles(): Record<string, Uint8Array> {
  if (!dir || !existsSync(dir)) return syntheticFiles();
  const present = new Map(readdirSync(dir).map((n) => [n.toUpperCase(), n]));
  const out: Record<string, Uint8Array> = {};
  for (const name of [...UI_REQUIRED_FILES, ...UI_OPTIONAL_FILES]) {
    const real = present.get(name);
    if (real) out[name] = new Uint8Array(readFileSync(join(dir, real)));
  }
  return out;
}

class Rng {
  constructor(private s: number) {}
  next(n: number): number {
    this.s = (Math.imul(this.s, 1103515245) + 12345) >>> 0;
    return (this.s >>> 8) % n;
  }
}

const KEYS = ['Enter', 'Enter', 'Enter', ' ', ' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', '1', '2', '3', '4', '6', '7', '8', '9',
  'b', 'f', 's', 'r', 'i', 'm', 'w', 'h', 'u', 'p', 'c', 'Escape', 'y', 'n', 'a', 'v'];
const RARE_KEYS = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F9', 'F10', 'D', 'P', 'x', 'o', 'l', 'k', 'e', 'g', 't'];

function randomEvent(r: Rng): UiEvent {
  const k = r.next(100);
  if (k < 70) return { type: 'key', key: KEYS[r.next(KEYS.length)]! };
  if (k < 74) return { type: 'key', key: RARE_KEYS[r.next(RARE_KEYS.length)]! };
  if (k < 76) return { type: 'key', key: 'gtascrwp'[r.next(8)]!, alt: true } as UiEvent; // menu z klawiaturą (Alt+litera)
  return { type: 'mousedown', x: r.next(320), y: r.next(200), button: r.next(5) === 0 ? 'right' : 'left' };
}

describe.skipIf(!enabled)('małpa na ekranie gry', () => {
  it(`${games} gier, do ${maxEvents} zdarzeń każda — bez wyjątków i zawieszeń`, async () => {
    const assets = new GameAssets(gameFiles());
    const report: string[] = [];
    for (let g = 0; g < games; g++) {
      const seed = 1000 + g;
      const r = new Rng(seed * 31 + 7);
      const ui = new Ui(new Gfx(assets.fonts), new TestHost());
      ui.gfx.patternAvailable = true;
      ui.gfx.loadPic(2, 0, 0, assets.pic('SP299.PIC'));
      const state = newGame({ seed, difficulty: g % 3, civilizations: 5 + (g % 3), nation: 1 + (g % 4) });
      advanceToHuman(state);
      unitOrder(state, state.humanPlayer, 0, 'build');
      state.events.length = 0;
      const saved: string[] = [];
      const screen = new GameScreen(ui, assets, state, {
        save: () => { saved.push('x'); },
        autosave: () => {},
        writeReplay: async () => {},
      });
      let done = false;
      let error: unknown = null;
      const run = screen.run().then((res) => { done = true; return res; }, (e) => { done = true; error = e; });
      let events = 0;
      let busy = 0;
      const recent: string[] = [];
      while (!done && events < maxEvents) {
        await new Promise((res) => setTimeout(res, 0));
        if (ui.input.size === 0 && ui.input.waiting) {
          const ev = randomEvent(r);
          recent.push(JSON.stringify(ev));
          if (recent.length > 30) recent.shift();
          ui.input.push(ev);
          events++;
          busy = 0;
        } else if (++busy > 20000) {
          throw new Error(`gra ${seed}: ekran nie czeka na wejście (zawieszenie?) po ${events} zdarzeniach, tura ${state.turn}; ostatnie: ${recent.join(' ')}`);
        }
      }
      if (error) throw new Error(`gra ${seed}: wyjątek po ${events} zdarzeniach, tura ${state.turn}: ${(error as Error).stack ?? error}\nostatnie: ${recent.join(' ')}`);
      report.push(`gra ${seed}: ${events} zdarzeń, tura ${state.turn}, rok ${state.year}, koniec ${state.gameOver}, ${done ? 'ekran zakończony' : 'limit zdarzeń'}`);
      if (!done) {
        // zostawiamy ekran czekający na wejście — kolejna gra ma własny Ui
        void run;
      }
    }
    console.log(report.join('\n'));
    expect(report.length).toBe(games);
  }, 3_600_000);
});
