/**
 * Przebieg gry od uruchomienia — StartGame.StartMainGame (OpenCivOne, MIT):
 * intro → menu główne → ustawienia nowej gry → stan gry z silnika (newGame) → tekst powitalny → ekran gry;
 * po Retire / QUIT / końcu gry powrót do menu głównego.
 */
import { newGame, TECHS, worldFromMapPixels, type GameState, type NewGameOptions } from '@civ-remake/engine';
import type { GameAssets } from '../assets';
import type { Ui } from '../ui';
import { GameScreen } from './gameScreen';
import { GameType, showMainGameIntro } from './intro';
import { showLogoAndMainGameMenu } from './mainMenu';
import { initNewGameData, showInitText, type NewGameSettings } from './newGame';

export interface GameFlowHooks {
  /** Wywoływane po utworzeniu nowej gry (np. dla diagnostyki albo zapisu). */
  readonly onNewGame?: (state: GameState, settings: NewGameSettings) => void;
  /** Ziarno nowej gry; domyślnie losowe 0–32767. */
  readonly seed?: () => number;
}

/** Wybory z menu → opcje silnika (`newGame`). Mapa Ziemi z MAP.PIC gracza. */
export function newGameOptions(assets: GameAssets, settings: NewGameSettings, seed: number): NewGameOptions {
  const earth = settings.map.kind === 'earth';
  const pic = earth ? assets.pic('MAP.PIC') : null;
  return {
    seed,
    earth,
    earthWorld: pic ? worldFromMapPixels(pic.pixels, pic.width) : undefined,
    world: settings.map.kind === 'earth' ? undefined : settings.map.options,
    difficulty: settings.difficulty,
    civilizations: settings.opponents + 1,
    nation: settings.nationalityId,
    leaderName: settings.leaderName,
    tribe: settings.customTribe ? { plural: settings.nation, adjective: settings.nationality } : undefined,
  };
}

/** Nazwy technologii znanych graczowi na starcie (do tekstu *INIT). */
export function knownTechnologies(state: GameState): string[] {
  const p = state.players[state.humanPlayer]!;
  return TECHS.filter((t) => p.techs[t.id]).map((t) => t.name);
}

export async function runGameFlow(ui: Ui, assets: GameAssets, hooks: GameFlowHooks = {}): Promise<never> {
  let preselected = await showMainGameIntro(ui, assets);
  for (;;) {
    const map = await showLogoAndMainGameMenu(ui, assets, preselected);
    preselected = GameType.None;
    const settings = await initNewGameData(ui, assets, map);
    const seed = hooks.seed?.() ?? Math.floor(Math.random() * 32768);
    const state = newGame(newGameOptions(assets, settings, seed));
    hooks.onNewGame?.(state, settings);
    await showInitText(ui, assets, settings, knownTechnologies(state));
    await new GameScreen(ui, assets, state).run();
    // powrót do ekranu tytułowego
    ui.gfx.patternAvailable = false;
    ui.gfx.fillRect(0, 0, 320, 200, 0);
    ui.gfx.screen.blit(assets.pic('LOGO.PIC'), 0, 64, 320, 80, 0, 64, true);
    ui.gfx.setPaletteFromFile(assets.file('LOGO.PIC'));
    ui.present();
  }
}
