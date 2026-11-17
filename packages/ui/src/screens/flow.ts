/**
 * Przebieg gry od uruchomienia — StartGame.StartMainGame (OpenCivOne, MIT):
 * intro → menu główne → ustawienia nowej gry → stan gry z silnika (newGame) → tekst powitalny → ekran gry;
 * po Retire / QUIT / końcu gry powrót do menu głównego.
 */
import {
  emptyHallOfFame, loadGame, loadSve, newGame, resumeLoadedGame, saveGame, sveInfo, TECHS, worldFromMapPixels, type GameState,
  DIFFICULTY_TITLES, type HallOfFameEntry, type NewGameOptions,
} from '@civ-remake/engine';
import { showMenuBox } from '../menuBox';
import { yearToString } from '../text';
import type { GameAssets } from '../assets';
import type { Ui } from '../ui';
import { GameScreen } from './gameScreen';
import { decodeFameDta, type FameStore } from './hallOfFame';
import { GameType, showMainGameIntro, showWorldHistory } from './intro';
import { loadGameSheets, showLogoAndMainGameMenu, type SavedGameLoader } from './mainMenu';
import { initNewGameData, showInitText, type NewGameSettings } from './newGame';

/** Magazyn zapisów gry (w aplikacji: folder danych aplikacji). */
export interface SaveStore {
  list(): Promise<string[]>;
  read(name: string): Promise<string>;
  write(name: string, json: string): Promise<void>;
}

/** Zapisy oryginału CIVIL0–9.SVE (+ .MAP) z folderu gry — tylko do odczytu. */
export interface OriginalSaveStore {
  /** Numery zapisów, dla których są oba pliki. */
  list(): Promise<number[]>;
  read(index: number): Promise<{ sve: Uint8Array; map: Uint8Array }>;
}

export interface GameFlowHooks {
  /** Zapisy gry; bez nich „Load a Saved Game”, Save Game i autozapis są niedostępne. */
  readonly saves?: SaveStore;
  /** Zapisy oryginału z folderu gry (wczytywanie z „Load a Saved Game”). */
  readonly originalSaves?: OriginalSaveStore;
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

/** Wiersz listy jak w ReadGameInfoFromFile: „poziom imię, naród/rok”. */
function originalSaveLabel(index: number, sve: Uint8Array): string {
  const info = sveInfo(sve);
  return `CIVIL${index}.SVE ${DIFFICULTY_TITLES[info.difficulty] ?? '?'} ${info.leader}, ${info.nation}/${yearToString(info.year)}`;
}

type SaveChoice = { label: string; load: () => Promise<GameState> };

/**
 * Okno wyboru zapisu: zapisy silnika (JSON, folder danych aplikacji), a gdy aplikacja ma dostęp do folderu gry —
 * także zapisy oryginału CIVIL0–9.SVE (oryginał: okno „Select Load File...” z dziesięcioma miejscami).
 */
export function savedGameLoader(saves: SaveStore | undefined, originals?: OriginalSaveStore): SavedGameLoader {
  return async (ui) => {
    const choices: SaveChoice[] = [];
    if (originals) {
      for (const index of await originals.list().catch(() => [] as number[])) {
        try {
          const files = await originals.read(index);
          choices.push({ label: originalSaveLabel(index, files.sve), load: async () => resumeLoadedGame(loadSve(files.sve, files.map)) });
        } catch (error) {
          console.error(error);
        }
      }
    }
    const names = saves ? (await saves.list()).slice(-Math.max(18 - choices.length, 0)) : [];
    choices.unshift(...names.map((name) => ({ label: name.replace(/\.json$/, ''), load: async () => loadGame(await saves!.read(name)) })));
    if (choices.length === 0) {
      await showMenuBox(ui, 'No saved games.\n', 100, 80, { clearInput: true });
      return null;
    }
    const r = await showMenuBox(ui, `Select saved game...\n${choices.map((c) => ` ${c.label}`).join('\n')}\n`, 40, 20, { clearInput: true });
    if (r.index < 0) return null;
    try {
      return await choices[r.index]!.load();
    } catch (error) {
      await showMenuBox(ui, `Could not load\n${choices[r.index]!.label}.\n`, 80, 80, { clearInput: true });
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
  const loader = saves || hooks.originalSaves ? savedGameLoader(saves, hooks.originalSaves) : undefined;
  const fame = saves ? fameStore(saves) : undefined;
  for (;;) {
    const choice = await showLogoAndMainGameMenu(ui, assets, preselected, loader, () => readFame(fame, assets));
    preselected = GameType.None;
    let state: GameState;
    if (choice.kind === 'load') {
      state = choice.state;
    } else {
      // StartGame: historia świata w trakcie budowy mapy (MapInitAndIntro), potem ustawienia nowej gry
      await showWorldHistory(ui, assets);
      // StartGame (0x11a8:0x054e): po budowie mapy SP299.PIC znowu na ekranie 2 — historia świata nadpisała go obrazami BIRTH
      loadGameSheets(ui, assets);
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
      writeReplay: saves ? (text) => saves.write('REPLAY.TXT', text) : undefined,
    }).run();
    // powrót do ekranu tytułowego
    ui.gfx.patternAvailable = false;
    ui.gfx.fillRect(0, 0, 320, 200, 0);
    ui.gfx.screen.blit(assets.pic('LOGO.PIC'), 0, 64, 320, 80, 0, 64, true);
    ui.gfx.setPaletteFromFile(assets.file('LOGO.PIC'));
    ui.present();
  }
}
