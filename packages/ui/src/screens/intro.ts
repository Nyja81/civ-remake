/**
 * Intro z napisami i logo — MainIntro.F2_0000_0000_ShowMainGameIntro (OpenCivOne, MIT).
 * Obrazy BIRTH0/BIRTH1 przesuwają się od prawej, na nich napisy z CREDITS.TXT (czcionka 5, trzy warstwy kolorów),
 * potem logo z LOGO.PIC odsłaniane paskami po 4 piksele i rozpuszczane na czarnym tle.
 * Klawisz albo kliknięcie przerywa intro; klawisze N, C, E, L od razu wybierają opcję menu głównego.
 * Cykle palety jak w oryginale: slot 1 (146–152, szybkość 14) w czasie napisów, slot 4 (224–239, 10) przy logo.
 *
 * Niesprawdzone na plikach oryginału: tempo przesuwania. Wzorzec synchronizuje klatki z zegarem odtwarzacza muzyki
 * (klatka i w chwili 21·i/4); przyjmujemy 60 jednostek na sekundę (INTRO_TICK_MS).
 */
import type { GameAssets } from '../assets';
import { isKey, type UiEvent } from '../input';
import { readPaletteRange } from '../palette';
import { PaletteCycles } from '../paletteCycle';
import { textLines } from '../text';
import type { Ui } from '../ui';
import { STORY_EVENT_TICKS, STORY_PALETTE_CYCLES } from '../data/screenTables';

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
  const cycles = new PaletteCycles(ui);
  let interrupt: UiEvent | null = null;

  if (credits) {
    gfx.loadPic(1, 0, 0, assets.pic('BIRTH0.PIC'), assets.file('BIRTH0.PIC'), true);
    gfx.loadPic(2, 0, 0, assets.pic('BIRTH1.PIC'), assets.file('BIRTH1.PIC'), true);
    gfx.setPaletteFromFile(assets.file('LOGO.PIC'));
    cycles.add(1, 14, 146, 152);
    cycles.start(1);
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
        cycles.update();
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
    cycles.add(4, 10, 224, 239);
    cycles.start(4);
    for (let i = 0; i < 320; i += 4) {
      gfx.copy(1, i, 64, 4, 80, 0, i, 64);
      cycles.update();
      ui.present();
      await ui.waitTimer(1);
    }
    for (let i = 0; i < 100 && !ui.hasKeyOrClick(); i++) {
      await ui.waitEvent(5 * 12);
      cycles.update();
    }
    ui.input.clear();
  }
  cycles.stopAll();

  gfx.fillRect(0, 0, 320, 200, 0, 1);
  gfx.drawBitmap(logo, 0, 64, 1);
  await ui.dissolve(1);
  gfx.copy(1, 0, 0, 320, 200, 0, 0, 0);
  ui.present();
  return selected;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * Cykle palety obrazów historii świata BIRTH1–8 jako (szybkość, od, do): z tablicy CIV.EXE (segment 0x3710, [od, do,
 * dzielnik]) — szybkość = 300 / dzielnik (dzielenie całkowite, F7_0000_17cf).
 */
export const STORY_PALETTE_SPEEDS: readonly (readonly (readonly [number, number, number])[])[] = STORY_PALETTE_CYCLES.map((image) =>
  image.map(([from, to, divisor]) => [Math.trunc(300 / divisor), from, to] as const));

/**
 * Historia świata podczas budowy nowego świata — MapInitAndIntro.F7_0000_17cf_AdvanceAnimation (OpenCivOne, MIT;
 * dosłowne tłumaczenie z `Overlay_7.cs`): wiersze STORY.TXT czcionką 7 w środku (160, 160), najpierw kolorem 3, potem 11
 * (poprzedni przyciemniany kolorem 3); wiersz krótszy niż 4 znaki zmienia obraz na kolejny BIRTH1…8.PIC: wygaszenie
 * palety do czerni, obraz, rozjaśnienie do BIRTHn.PAL i cykle palety obrazu. Kolejny wiersz — nie wcześniej niż
 * 45 jednostek zegara muzyki na każde 2 (3 przy wierszu dłuższym niż 19 znaków) i nie wcześniej niż czas z tablicy.
 * Klawisz albo kliknięcie kończy historię. Bez STORY.TXT — nic się nie dzieje. `speed` przyspiesza odczekania (testy).
 *
 * Odstępstwa: oryginał opowiada w trakcie generowania mapy (tu mapa powstaje od razu, historia idzie przed ustawieniami
 * nowej gry, jak w StartGame po wyborze z menu); ekran na początku czyszczony do czerni; bez muzyki.
 */
export async function showWorldHistory(ui: Ui, assets: GameAssets, options: { readonly speed?: number } = {}): Promise<void> {
  if (!assets.has('STORY.TXT')) return;
  const gfx = ui.gfx;
  // fscanf("%[^\n]\n"): białe znaki po wierszu (puste wiersze, wcięcia) są pomijane
  const lines = textLines(assets.file('STORY.TXT')).map((l) => l.trimStart()).filter((l) => l.length > 0);
  const cycles = new PaletteCycles(ui);
  const savedFont = gfx.fontId;
  gfx.fillRect(0, 0, 320, 200, 0);
  gfx.fontId = 7;
  ui.present();
  let start = now();
  let index = 0;
  let image = 1;
  let due = 0;
  let text = '';
  let aborted = false;
  // `speed` — przyspieszenie wszystkich odczekań (testy)
  const speed = options.speed ?? 1;
  const wait = async (ticks: number) => {
    if (!aborted && (await cycles.wait(ticks / speed)) !== null) aborted = true;
  };
  for (let line = 0; !aborted; line++) {
    const left = start + due / speed - now();
    if (left > 0) await wait((left * speed) / 12);
    if (aborted) break;
    if (line > 0 && index < 40) {
      gfx.drawCenteredString(text, 160, 160, 3);
      ui.present();
      await wait(5);
    }
    if (aborted || line >= lines.length) break;
    text = lines[line]!;
    if (image > 1) gfx.copy(2, 0, 160, 320, 8, 0, 0, 160);
    await wait(10);
    if (aborted) break;
    gfx.drawCenteredString(text, 160, 160, 3);
    ui.present();
    await wait(5);
    if (aborted) break;
    gfx.drawCenteredString(text, 160, 160, 11);
    ui.present();
    let pause = 0;
    if (text.length > 3) {
      if (index === 0) start = now(); // ResetWaitTimer i początek muzyki
      pause += 2;
      index++;
    } else if (image < 9) {
      await storyImage(ui, assets, cycles, image);
      image++;
    }
    if (text.length > 19) pause++;
    // F0_2dc4_007c(czas z tablicy, 45·pauza + zegar, 0x7fff) — wszystko w jednostkach zegara muzyki; za końcem tablicy
    // oryginał czyta 0xffff (−1), więc liczy się tylko pauza
    const elapsed = (now() - start) * speed;
    due = Math.max((STORY_EVENT_TICKS[index] ?? -1) * INTRO_TICK_MS, elapsed + 45 * pause * INTRO_TICK_MS);
  }
  if (!aborted) await cycles.wait(180 / speed);
  cycles.stopAll();
  ui.input.clear();
  gfx.fillRect(0, 0, 320, 200, 0, 2);
  gfx.fontId = savedFont;
}

/** Zmiana obrazu historii: BIRTHn.PIC na ekran 2, wygaszenie, obraz, rozjaśnienie do BIRTHn.PAL, cykle palety. */
async function storyImage(ui: Ui, assets: GameAssets, cycles: PaletteCycles, n: number): Promise<void> {
  const gfx = ui.gfx;
  cycles.stopAll();
  const pic = `BIRTH${n}.PIC`;
  if (!assets.has(pic)) return;
  gfx.loadPic(2, 0, 0, assets.pic(pic));
  await ui.fadePalette([0, 0, 0], 8);
  gfx.copy(2, 0, 0, 320, 200, 0, 0, 0);
  const pal = assets.optional(`BIRTH${n}.PAL`);
  const target = gfx.palette.clone();
  const range = pal ? readPaletteRange(pal) : readPaletteRange(assets.file(pic));
  if (range) target.apply(range);
  await ui.fadePalette(target, 8);
  STORY_PALETTE_SPEEDS[n - 1]!.forEach(([speed, from, to], i) => cycles.add(i + 1, speed, from, to));
  STORY_PALETTE_SPEEDS[n - 1]!.forEach((_, i) => cycles.start(i + 1));
}
