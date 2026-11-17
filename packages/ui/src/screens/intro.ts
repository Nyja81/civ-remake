/**
 * Intro z napisami i logo — MainIntro.F2_0000_0000_ShowMainGameIntro (OpenCivOne, MIT).
 * Obrazy BIRTH0/BIRTH1 przesuwają się od prawej, na nich napisy z CREDITS.TXT (czcionka 5, trzy warstwy kolorów),
 * potem logo z LOGO.PIC odsłaniane paskami po 4 piksele i rozpuszczane na czarnym tle.
 * Klawisz albo kliknięcie przerywa intro; klawisze N, C, E, L od razu wybierają opcję menu głównego.
 *
 * Niesprawdzone na plikach oryginału: tempo przesuwania. Wzorzec synchronizuje klatki z zegarem odtwarzacza muzyki
 * (klatka i w chwili 21·i/4); przyjmujemy 60 jednostek na sekundę (INTRO_TICK_MS).
 */
import type { GameAssets } from '../assets';
import { isKey, type UiEvent } from '../input';
import { textLines } from '../text';
import type { Ui } from '../ui';

/** Typ gry wybrany w menu głównym (Var_6b32_SelectedGameType). */
export const GameType = { None: -1, NewGame: 0, LoadGame: 1, Earth: 2, Customize: 3, HallOfFame: 4 } as const;

export const INTRO_TICK_MS = 1000 / 60;

const PHASE1_TEXT_AT: Record<number, 'line' | 'clear'> = {
  10: 'line', 70: 'line', 120: 'line', 170: 'line', 190: 'line', 210: 'line', 230: 'line', 250: 'line', 270: 'line', 290: 'line', 310: 'line',
  50: 'clear', 160: 'clear',
};
const PHASE2_TEXT_AT: Record<number, 'line' | 'clear'> = {
  10: 'line', 30: 'line', 64: 'line', 84: 'line', 130: 'line', 150: 'line', 170: 'line', 190: 'line', 210: 'line', 230: 'line', 250: 'line', 270: 'line', 290: 'line',
  50: 'clear', 116: 'clear', 310: 'clear',
};

export async function showMainGameIntro(ui: Ui, assets: GameAssets): Promise<number> {
  const gfx = ui.gfx;
  gfx.fontId = 1;
  gfx.fillRect(0, 0, 320, 200, 0);
  const logoPic = assets.pic('LOGO.PIC');
  gfx.loadPic(1, 0, 0, logoPic);
  const logo = gfx.cut(1, 0, 64, 320, 80);

  const credits = assets.has('BIRTH0.PIC') && assets.has('BIRTH1.PIC') && assets.has('CREDITS.TXT');
  let interrupt: UiEvent | null = null;

  if (credits) {
    gfx.loadPic(1, 0, 0, assets.pic('BIRTH0.PIC'), assets.file('BIRTH0.PIC'), true);
    gfx.loadPic(2, 0, 0, assets.pic('BIRTH1.PIC'), assets.file('BIRTH1.PIC'), true);
    gfx.setPaletteFromFile(assets.file('LOGO.PIC'));
    const lines = textLines(assets.file('CREDITS.TXT'));
    let lineIndex = 0;
    const start = now();
    gfx.fontId = 5;
    for (let phase = 0; phase < 2 && !interrupt; phase++) {
      const schedule = phase === 0 ? PHASE1_TEXT_AT : PHASE2_TEXT_AT;
      let text = '';
      for (let i = 0; i < 320; i++) {
        const change = schedule[i];
        if (change === 'line') text = lines[lineIndex++] ?? '';
        else if (change === 'clear') text = '';
        if (phase === 0) {
          gfx.fillRect(0, 0, 320 - i, 200, 0);
          gfx.copy(1, 0, 0, i, 200, 0, 320 - i, 0);
        } else {
          gfx.copy(1, i, 0, 320 - i, 200, 0, 0, 0);
          gfx.copy(2, 0, 0, i, 200, 0, 320 - i, 0);
        }
        if (text) {
          const size = { w: gfx.stringWidth(text), h: gfx.textHeight() };
          const x = Math.trunc((320 - size.w) / 2);
          const y = Math.trunc((200 - size.h) / 2);
          gfx.drawString(text, x, y + 2, 252);
          gfx.drawString(text, x, y, 248);
          gfx.drawString(text, x, y + 1, 250);
        }
        ui.present();
        const due = start + (((21 * i) >> 2) + phase * 1680) * INTRO_TICK_MS;
        interrupt = await ui.waitEvent(Math.max(0, due - now()));
        if (interrupt) break;
      }
    }
    gfx.fontId = 1;
  } else {
    gfx.setPaletteFromFile(assets.file('LOGO.PIC'));
  }

  let selected: number = GameType.None;
  if (interrupt) {
    if (isKey(interrupt)) {
      const k = interrupt.key.toLowerCase();
      if (k === 'n') selected = GameType.NewGame;
      else if (k === 'c') selected = GameType.Customize;
      else if (k === 'e') selected = GameType.Earth;
      else if (k === 'l') selected = GameType.LoadGame;
    }
  } else if (credits) {
    // logo odsłaniane paskami na tle ostatniego obrazu
    gfx.copy(2, 0, 0, 320, 200, 1, 0, 0);
    gfx.drawBitmap(logo, 0, 64, 1);
    for (let i = 0; i < 320; i += 4) {
      gfx.copy(1, i, 64, 4, 80, 0, i, 64);
      ui.present();
      await ui.waitTimer(1);
    }
    await ui.waitEvent(100 * 5 * 12);
    ui.input.clear();
  }

  gfx.fillRect(0, 0, 320, 200, 0, 1);
  gfx.drawBitmap(logo, 0, 64, 1);
  await ui.dissolve(1);
  gfx.copy(1, 0, 0, 320, 200, 0, 0, 0);
  ui.present();
  return selected;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
