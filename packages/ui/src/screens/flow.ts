/**
 * Przebieg gry od uruchomienia — StartGame.StartMainGame (OpenCivOne, MIT):
 * intro → menu główne → (mapa) → ustawienia nowej gry → ekran gry; po Retire / QUIT powrót do menu głównego.
 */
import { generateWorld, mscRandom, worldFromMapPixels, type World } from '@civ-remake/engine';
import type { GameAssets } from '../assets';
import type { Ui } from '../ui';
import { GameScreen } from './gameScreen';
import { GameType, showMainGameIntro } from './intro';
import { showLogoAndMainGameMenu, type MapChoice } from './mainMenu';
import { initNewGameData, type NewGameSettings } from './newGame';

export interface StartedGame {
  readonly settings: NewGameSettings;
  readonly world: World;
  readonly seed: number;
}

export interface GameFlowHooks {
  /** Wywoływane po ustawieniu nowej gry (np. żeby przekazać ustawienia silnikowi). */
  readonly onNewGame?: (game: StartedGame) => void;
  /** Ziarno nowej gry; domyślnie losowe 0–32767. */
  readonly seed?: () => number;
}

/** Tworzy świat według wyboru z menu (losowy z ustawieniami albo Ziemia z MAP.PIC). */
export function createWorld(assets: GameAssets, map: MapChoice, seed: number): World {
  if (map.kind === 'earth') {
    const pic = assets.pic('MAP.PIC');
    return worldFromMapPixels(pic.pixels, pic.width);
  }
  return generateWorld(mscRandom(seed), map.options);
}

export async function runGameFlow(ui: Ui, assets: GameAssets, hooks: GameFlowHooks = {}): Promise<never> {
  let preselected = await showMainGameIntro(ui, assets);
  for (;;) {
    const map = await showLogoAndMainGameMenu(ui, assets, preselected);
    preselected = GameType.None;
    const seed = hooks.seed?.() ?? Math.floor(Math.random() * 32768);
    const world = createWorld(assets, map, seed);
    const settings = await initNewGameData(ui, assets, map);
    hooks.onNewGame?.({ settings, world, seed });
    const screen = new GameScreen(ui, assets, settings, world, { seed });
    await screen.run();
    // powrót do ekranu tytułowego
    ui.gfx.patternAvailable = false;
    ui.gfx.fillRect(0, 0, 320, 200, 0);
    ui.gfx.screen.blit(assets.pic('LOGO.PIC'), 0, 64, 320, 80, 0, 64, true);
    ui.gfx.setPaletteFromFile(assets.file('LOGO.PIC'));
    ui.present();
  }
}
