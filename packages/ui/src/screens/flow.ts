/**
 * Przebieg gry od uruchomienia — StartGame.StartMainGame (OpenCivOne, MIT):
 * intro → menu główne → ustawienia nowej gry → stan gry z silnika (newGame) → tekst powitalny → ekran gry;
 * po Retire / QUIT / końcu gry powrót do menu głównego.
 */
import {
  emptyHallOfFame, loadGame, newGame, saveGame, TECHS, worldFromMapPixels, type GameState, type HallOfFameEntry, type NewGameOptions,
} from '@civ-remake/engine';
import { showMenuBox } from '../menuBox';
import { yearToString } from '../text';
import type { GameAssets } from '../assets';
import type { Ui } from '../ui';
import { GameScreen } from './gameScreen';
import { decodeFameDta, type FameStore } from './hallOfFame';
import { GameType, showMainGameIntro } from './intro';
import { showLogoAndMainGameMenu, type SavedGameLoader } from './mainMenu';
import { initNewGameData, showInitText, type NewGameSettings } from './newGame';

/** Magazyn zapisów gry (w aplikacji: folder danych aplikacji). */
export interface SaveStore {
  list(): Promise<string[]>;
  read(name: string): Promise<string>;
  write(name: string, json: string): Promise<void>;
}

export interface GameFlowHooks {
  /** Zapisy gry; bez nich „Load a Saved Game”, Save Game i autozapis są niedostępne. */
  readonly saves?: SaveStore;
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

/** Okno wyboru zapisu: lista nazw w oknie menu (oryginał pyta o dysk i numer zapisu .SVE). */
export function savedGameLoader(saves: SaveStore): SavedGameLoader {
  return async (ui) => {
    const names = (await saves.list()).slice(-18);
    if (names.length === 0) {
      await showMenuBox(ui, 'No saved games.\n', 100, 80, { clearInput: true });
      return null;
    }
    const r = await showMenuBox(ui, `Select saved game...\n${names.map((n) => ` ${n.replace(/\.json$/, '')}`).join('\n')}\n`, 60, 20, { clearInput: true });
    if (r.index < 0) return null;
    try {
      return loadGame(await saves.read(names[r.index]!));
    } catch (error) {
      await showMenuBox(ui, `Could not load\n${names[r.index]}.\n`, 80, 80, { clearInput: true });
      console.error(error);
      return null;
    }
  };
}

/** Nazwa pliku zapisu: przymiotnik narodu i rok, np. "Roman 1250 AD.json". */
export const saveName = (state: GameState, prefix = '') =>
  `${prefix}${state.players[state.humanPlayer]!.nationAdjective} ${yearToString(state.year)}.json`;

/** Tabela Hall of Fame w magazynie zapisów (plik bez rozszerzenia .json — nie pojawia się na liście zapisów). */
export function fameStore(saves: SaveStore): FameStore {
  return {
    read: async () => {
      try {
        return JSON.parse(await saves.read('fame.dat')) as HallOfFameEntry[];
      } catch {
        return null;
      }
    },
    write: (entries) => saves.write('fame.dat', JSON.stringify(entries)),
  };
}

/** Tabela z magazynu albo — gdy jej jeszcze nie ma — FAME.DTA z kopii gry, albo pusta. */
async function readFame(fame: FameStore | undefined, assets: GameAssets): Promise<HallOfFameEntry[]> {
  const own = fame ? await fame.read() : null;
  if (own) return own;
  const dta = assets.optional('FAME.DTA');
  return dta ? decodeFameDta(dta) : emptyHallOfFame();
}

export async function runGameFlow(ui: Ui, assets: GameAssets, hooks: GameFlowHooks = {}): Promise<never> {
  let preselected = await showMainGameIntro(ui, assets);
  const saves = hooks.saves;
  const loader = saves ? savedGameLoader(saves) : undefined;
  const fame = saves ? fameStore(saves) : undefined;
  for (;;) {
    const choice = await showLogoAndMainGameMenu(ui, assets, preselected, loader, () => readFame(fame, assets));
    preselected = GameType.None;
    let state: GameState;
    if (choice.kind === 'load') {
      state = choice.state;
    } else {
      const settings = await initNewGameData(ui, assets, choice);
      const seed = hooks.seed?.() ?? Math.floor(Math.random() * 32768);
      state = newGame(newGameOptions(assets, settings, seed));
      hooks.onNewGame?.(state, settings);
      await showInitText(ui, assets, settings, knownTechnologies(state));
    }
    await new GameScreen(ui, assets, state, {
      autosave: saves ? (s) => saves.write(saveName(s, 'Autosave '), saveGame(s)) : undefined,
      save: saves ? (s) => saves.write(saveName(s), saveGame(s)) : undefined,
      fame,
      fameInitial: () => readFame(undefined, assets),
    }).run();
    // powrót do ekranu tytułowego
    ui.gfx.patternAvailable = false;
    ui.gfx.fillRect(0, 0, 320, 200, 0);
    ui.gfx.screen.blit(assets.pic('LOGO.PIC'), 0, 64, 320, 80, 0, 64, true);
    ui.gfx.setPaletteFromFile(assets.file('LOGO.PIC'));
    ui.present();
  }
}
