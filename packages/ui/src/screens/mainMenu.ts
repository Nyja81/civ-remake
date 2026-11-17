/**
 * Menu główne i „Customize World” — StartGame.ShowLogoAndMainGameMenu (OpenCivOne, MIT).
 * Menu leży na ekranie z logo w punkcie (100, 140). Wybór świata trafia do `MapChoice`;
 * samo tworzenie mapy (generateWorld / MAP.PIC) robi wywołujący.
 */
import { emptyHallOfFame, type HallOfFameEntry } from '@civ-remake/engine';
import { showHallOfFame } from './hallOfFame';
import type { GameState, WorldOptions } from '@civ-remake/engine';
import type { GameAssets } from '../assets';
import { showMenuBox } from '../menuBox';
import type { Ui } from '../ui';
import { GameType } from './intro';

export type MapChoice =
  | { readonly kind: 'random'; readonly options: WorldOptions }
  | { readonly kind: 'earth' }
  | { readonly kind: 'custom'; readonly options: WorldOptions };

/** Wynik menu głównego: nowa gra z wybraną mapą albo wczytany zapis. */
export type MainMenuResult = MapChoice | { readonly kind: 'load'; readonly state: GameState };

/** Wczytywanie zapisu (dostarcza aplikacja): null = anulowano albo brak zapisów. */
export type SavedGameLoader = (ui: Ui) => Promise<GameState | null>;

export const MAIN_MENU_TEXT = ' Start a New Game\n Load a Saved Game\n EARTH\n Customize World\n View Hall of Fame\n';

/**
 * Pokazuje menu główne aż do wyboru nowej gry. `preselected` — wybór z intro (klawisze N, L, E, C).
 * Zwraca wybór mapy; po powrocie ekran 0 jest czarny, a na ekranie 2 leżą wzory z SP299.PIC (okna z tłem).
 */
export async function showLogoAndMainGameMenu(
  ui: Ui, assets: GameAssets, preselected: number = GameType.None, loadSaved?: SavedGameLoader,
  readFame?: () => Promise<HallOfFameEntry[]>,
): Promise<MainMenuResult> {
  const gfx = ui.gfx;
  let selected = preselected;
  let choice: MainMenuResult | null = null;

  while (choice === null) {
    if (selected === GameType.None) {
      selected = (await showMenuBox(ui, MAIN_MENU_TEXT, 100, 140, { frame: true, clearInput: true })).index;
    }
    switch (selected) {
      case GameType.NewGame:
        choice = { kind: 'random', options: { landMass: 1, temperature: 1, climate: 1, age: 1 } };
        break;
      case GameType.LoadGame: {
        // Zapisy silnika (JSON) i — z folderu gry — CIVIL?.SVE oryginału; okno wyboru zapisu dostarcza aplikacja (flow.ts).
        const state = loadSaved ? await loadSaved(ui) : null;
        if (!loadSaved) await showMenuBox(ui, 'Loading saved games\nis not available.\n', 80, 80, { frame: true, clearInput: true });
        if (state) {
          choice = { kind: 'load', state };
        } else {
          redrawLogo(ui, assets);
          selected = GameType.None;
        }
        break;
      }
      case GameType.Earth:
        choice = { kind: 'earth' };
        break;
      case GameType.Customize:
        choice = { kind: 'custom', options: await customizeWorld(ui, assets) };
        break;
      case GameType.HallOfFame:
        await showHallOfFame(ui, readFame ? await readFame() : emptyHallOfFame());
        redrawLogo(ui, assets);
        selected = GameType.None;
        break;
      default:
        selected = GameType.None;
        break;
    }
  }

  loadGameSheets(ui, assets);
  await ui.fadePalette([0, 0, 0], 5);
  gfx.fillRect(0, 0, 320, 200, 0);
  gfx.setPaletteFromFile(assets.file('SP257.PIC'));
  ui.present();
  return choice;
}

/** Ekran tytułowy po powrocie z okna (czarne tło i logo). */
function redrawLogo(ui: Ui, assets: GameAssets): void {
  const gfx = ui.gfx;
  gfx.fillRect(0, 0, 320, 200, 0);
  gfx.screen.blit(assets.pic('LOGO.PIC'), 0, 64, 320, 80, 0, 64, true);
  ui.present();
}

/**
 * Część StartGameMenu.F5_0000_1455_LoadBitmaps potrzebna interfejsowi: fragment SP299.PIC (160,50)–(320,200)
 * na ekranie 2 — stamtąd biorą się wzór tła okien (288,120) i ikony panelu stanu. Od tej chwili okna mają wzór.
 */
export function loadGameSheets(ui: Ui, assets: GameAssets): void {
  const gfx = ui.gfx;
  gfx.loadPic(1, 0, 0, assets.pic('SP299.PIC'));
  gfx.copy(1, 160, 50, 160, 150, 2, 160, 50);
  gfx.patternAvailable = true;
}

const CUSTOM_MENUS = [
  { text: 'LAND MASS:\n Small\n Normal\n Large\n', y: 1, key: 'landMass' },
  { text: 'TEMPERATURE:\n Cool\n Temperate\n Warm\n', y: 51, key: 'temperature' },
  { text: 'CLIMATE:\n Arid\n Normal\n Wet\n', y: 101, key: 'climate' },
  { text: 'AGE:\n 3 billion years\n 4 billion years\n 5 billion years\n', y: 151, key: 'age' },
] as const;

/** Ekran CUSTOM.PIC z czterema menu w kolumnie x = 200 (bez ramek, z pomocą). Esc powtarza pytanie. */
export async function customizeWorld(ui: Ui, assets: GameAssets): Promise<WorldOptions> {
  const gfx = ui.gfx;
  await ui.fadePalette([0, 0, 0], 5);
  gfx.fillRect(0, 0, 320, 200, 0);
  gfx.loadPic(1, 0, 0, assets.pic('CUSTOM.PIC'), assets.file('CUSTOM.PIC'), true);
  gfx.copy(1, 0, 0, 320, 200, 0, 0, 0);
  ui.present();

  const result = { landMass: 1, temperature: 1, climate: 1, age: 1 };
  for (const menu of CUSTOM_MENUS) {
    let defaultIndex = 1;
    let value = -1;
    while (value === -1) {
      const r = await showMenuBox(ui, menu.text, 200, menu.y, { frame: false, help: true, clearInput: true, defaultIndex });
      value = r.index;
      if (value !== -1 && r.help) {
        // Pomoc (Help.F4_0000_0000_DisplayHelpContent) jeszcze nie istnieje — pytanie wraca z tą samą opcją.
        defaultIndex = value;
        value = -1;
      }
    }
    result[menu.key] = value;
  }
  return result;
}

