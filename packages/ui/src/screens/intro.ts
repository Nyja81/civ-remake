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
import { TUNE } from '../sound';
import { readPaletteRange } from '../palette';
import { PaletteCycles } from '../paletteCycle';
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
  const cycles = new PaletteCycles(ui);
  let interrupt: UiEvent | null = null;
  // F2_0000_0000: włączenie Sound (bit 0x10) i muzyka napisów (PlayTune(3) pod 0x033d); gra do menu głównego
  ui.soundSettings.sound = true;
  ui.playTune(TUNE.intro);

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
 * Cykle palety obrazów historii świata BIRTH1–8 (szybkość, od, do) — w oryginale tablica w danych muzyki
 * (segment Var_6416: od, do, dzielnik; szybkość = 300 / dzielnik); wartości przepisane z nowszej wersji wzorca
 * (MapInitAndIntro.storyImagePaletteCycles), do sprawdzenia z oryginałem.
 */
export const STORY_PALETTE_CYCLES: readonly (readonly (readonly [number, number, number])[])[] = [
  [[14, 146, 152], [60, 183, 187], [17, 188, 191]],
  [[27, 48, 56], [30, 32, 47], [23, 141, 148], [13, 176, 183], [100, 211, 215], [300, 152, 155], [20, 57, 79]],
  [[17, 80, 95], [42, 96, 111], [10, 112, 127], [30, 136, 140], [27, 184, 188]],
  [[60, 134, 138], [30, 139, 143], [13, 240, 241], [12, 96, 101], [10, 242, 244], [25, 245, 250], [27, 251, 252], [14, 102, 105]],
  [[14, 184, 187], [18, 180, 183], [25, 135, 140], [14, 214, 215], [17, 96, 102]],
  [[14, 136, 138], [37, 129, 131], [14, 246, 249], [25, 250, 254]],
  [[14, 246, 249], [30, 250, 251], [27, 208, 210], [18, 135, 138]],
  [[18, 208, 210], [27, 216, 218], [18, 131, 134], [12, 48, 53], [4, 246, 249]],
];

/**
 * Chwile kolejnych wierszy historii w sekundach od pierwszego wiersza (w oryginale tablica czasów muzyki, segment
 * Var_6416 + 0x83, w jednostkach zegara odtwarzacza) — przepisane z nowszej wersji wzorca (MapInitAndIntro.storyEvents).
 */
export const STORY_EVENT_SECONDS: readonly number[] = [
  0, 5, 8, 11, 18, 21, 24, 31, 34, 37, 40, 43, 46, 49, 52, 59, 62, 65, 68, 71, 78, 81, 84, 87, 90, 93,
  100, 103, 106, 109, 112, 115, 118, 121, 128, 131, 134, 137, 140, 143, 146, 149, 152, 155, 162, 165,
];

/**
 * Historia świata podczas budowy nowego świata — MapInitAndIntro.F7_0000_17cf_AdvanceAnimation (OpenCivOne, MIT;
 * dosłowne tłumaczenie z `Overlay_7.cs`): wiersze STORY.TXT czcionką 7 w środku (160, 160), najpierw kolorem 3, potem 11
 * (poprzedni przyciemniany kolorem 3); wiersz krótszy niż 4 znaki zmienia obraz na kolejny BIRTH1…8.PIC: wygaszenie
 * palety do czerni, obraz, rozjaśnienie do BIRTHn.PAL i cykle palety obrazu. Kolejny wiersz — nie wcześniej niż
 * 45 jednostek zegara muzyki na każde 2 (3 przy wierszu dłuższym niż 19 znaków) i nie wcześniej niż czas z tablicy.
 * Klawisz albo kliknięcie kończy historię. Bez STORY.TXT — nic się nie dzieje. `speed` przyspiesza odczekania (testy).
 *
 * Muzyka: przy pierwszym wierszu dłuższym niż 3 znaki PlayTune(1) i PlayTune(4), na końcu PlayTune(1).
 *
 * Odstępstwa: oryginał opowiada w trakcie generowania mapy (tu mapa powstaje od razu, historia idzie przed ustawieniami
 * nowej gry, jak w StartGame po wyborze z menu); ekran na początku czyszczony do czerni; czasy wierszy liczone zegarem
 * komputera, nie licznikiem taktów sterownika (oba 60 na sekundę).
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
      if (index === 0) {
        // ResetWaitTimer i początek muzyki: PlayTune(1), PlayTune(4) (Overlay_7 F7_0000_17cf)
        start = now();
        ui.playTune(TUNE.stop);
        ui.playTune(TUNE.worldHistory);
      }
      pause += 2;
      index++;
    } else if (image < 9) {
      await storyImage(ui, assets, cycles, image);
      image++;
    }
    if (text.length > 19) pause++;
    const elapsed = (now() - start) * speed;
    due = Math.max((STORY_EVENT_SECONDS[index] ?? 0) * 1000, elapsed + 45 * pause * INTRO_TICK_MS);
  }
  if (!aborted) await cycles.wait(180 / speed);
  ui.playTune(TUNE.stop);
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
  STORY_PALETTE_CYCLES[n - 1]!.forEach(([speed, from, to], i) => cycles.add(i + 1, speed, from, to));
  STORY_PALETTE_CYCLES[n - 1]!.forEach((_, i) => cycles.start(i + 1));
}
