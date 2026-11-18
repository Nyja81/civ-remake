/**
 * Strona gry: wczytuje pliki oryginału z folderu gracza, a potem prowadzi ekrany jak w oryginale
 * (intro, menu, nowa gra, ekran gry) na wirtualnym ekranie 320×200, pokazywanym w oknie po wygładzeniu xBR 4×.
 * Gdy brakuje plików — czytelny ekran z prośbą o wskazanie folderu gry.
 */
import { decodePic } from '@civ-remake/gfx';
import { Gfx, GameAssets, Palette, readPaletteRange, runGameFlow, Ui, type UiHost } from '@civ-remake/ui';
import type { CivApi, LoadResult } from '../api';
import { AudioOutput } from './audio';
import { Presenter } from './presenter';

declare global {
  interface Window { civ: CivApi }
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('screen');
const overlay = $('overlay');
let started = false;

function showOverlay(title: string, text = '', withButton = false): void {
  $('overlayTitle').textContent = title;
  $('overlayText').textContent = text;
  $<HTMLButtonElement>('overlayButton').hidden = !withButton;
  overlay.classList.remove('hidden');
}

/** Kursor z TORCH.PIC (13×14, obraz 4-bitowy; kolor 0 = przezroczysty, paleta z bloku M0 pliku). */
function applyCursor(presenter: Presenter, assets: GameAssets): void {
  const file = assets.optional('TORCH.PIC');
  if (!file) return;
  try {
    const pic = decodePic(file);
    const palette = new Palette();
    const range = readPaletteRange(file) ?? readPaletteRange(assets.file('SP257.PIC'));
    if (range) palette.apply(range);
    const rgba = new Uint8ClampedArray(pic.width * pic.height * 4);
    for (let i = 0; i < pic.pixels.length; i++) {
      const c = pic.pixels[i]!;
      rgba.set([palette.rgb[c * 3]!, palette.rgb[c * 3 + 1]!, palette.rgb[c * 3 + 2]!, c === 0 ? 0 : 255], i * 4);
    }
    presenter.setCursor(rgba, pic.width, pic.height);
  } catch {
    // zostaje kursor systemowy
  }
}

function start(result: LoadResult): void {
  if (!result.ok) {
    if (result.reason === 'no-folder') {
      showOverlay('Choose your game folder', 'This game uses the graphics, fonts and texts from your own copy of the original 1991 game. Select the folder that contains its files (for example FONTS.CV, LOGO.PIC and SP257.PIC).', true);
    } else {
      showOverlay('Files not found', `The selected folder is missing: ${result.missing.join(', ')}.`, true);
    }
    return;
  }
  if (started) {
    // Ekrany już działają na poprzednich plikach — nowy folder zadziała po ponownym uruchomieniu strony.
    location.reload();
    return;
  }
  let assets: GameAssets;
  try {
    assets = new GameAssets(result.files);
  } catch (error) {
    showOverlay('Could not read the game files', String(error), true);
    return;
  }
  started = true;
  overlay.classList.add('hidden');
  const gfx = new Gfx(assets.fonts);
  const presenter = new Presenter(canvas, gfx);
  // dźwięk: sterownik z kopii gry na emulatorze (menu View → Sound)
  const audio = new AudioOutput(result.files);
  const host: UiHost = {
    present: () => presenter.present(),
    sleep: (ms) => presenter.sleep(ms),
    playTune: (tune, arg) => audio.playTune(tune, arg),
    tuneCounter: () => audio.tuneCounter(),
  };
  const ui = new Ui(gfx, host);
  window.civ.onSoundCard((card) => audio.setCard(card));
  presenter.attachInput(ui.input);
  applyCursor(presenter, assets);
  void window.civ.getSmoothing().then((mode) => presenter.setSmoothing(mode));
  window.civ.onSmoothing((mode) => presenter.setSmoothing(mode));
  (window as unknown as { civUi: unknown }).civUi = { ui, presenter, assets, audio }; // diagnostyka (konsola)
  const saves = {
    list: () => window.civ.listSaves(),
    read: (n: string) => window.civ.readSave(n),
    write: (n: string, j: string) => window.civ.writeSave(n, j),
    remove: (n: string) => window.civ.removeSave(n),
  };
  let autosaveEvery = 5;
  void window.civ.getAutosaveTurns().then((n) => (autosaveEvery = n)).catch(() => undefined);
  const autosaveTurns = {
    get: () => autosaveEvery,
    set: (n: number) => {
      autosaveEvery = n;
      void window.civ.setAutosaveTurns(n);
    },
  };
  const originalSaves = {
    list: () => window.civ.listGameSaves(),
    read: (i: number) => window.civ.readGameSave(i),
    write: (i: number, f: { sve: Uint8Array; map: Uint8Array }) => window.civ.writeGameSave(i, f.sve, f.map),
  };
  // karta dźwiękowa przed intro — muzyka napisów zaczyna się od pierwszej klatki
  window.civ.getSoundCard().catch(() => 'none' as const).then((card) => {
    audio.setCard(card);
    return runGameFlow(ui, assets, { saves, originalSaves, autosaveTurns, exit: () => window.civ.quit() });
  }).catch((error: unknown) => {
    console.error(error);
    showOverlay('Something went wrong', String(error), true);
  });
}

const choose = () => void window.civ.choose().then(start);
$('overlayButton').addEventListener('click', choose);
showOverlay('Loading…');
void window.civ.load().then(start);
