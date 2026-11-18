/** GAME → Load Game i Autosave... (odstępstwo na prośbę Damiana), cichy autozapis co N tur, usuwanie starych autozapisów. */
import { describe, expect, it } from 'vitest';
import { advanceToHuman, newGame, saveGame, type GameState } from '@civ-remake/engine';
import type { UiEvent } from '../src/input';
import { AUTOSAVE_PREFIX, AUTOSAVES_KEPT, savedGameLoader, writeAutosave, type SaveStore } from '../src/screens/flow';
import { GameScreen, type GameScreenOptions } from '../src/screens/gameScreen';
import { drive, makeUi } from './synthetic';

const key = (k: string, extra: Partial<{ alt: boolean }> = {}): UiEvent => ({ type: 'key', key: k, ...extra });

/** Magazyn w pamięci; lista od najstarszego zapisu. */
function memoryStore(): SaveStore & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    list: async () => [...files.keys()],
    read: async (n) => files.get(n)!,
    write: async (n, j) => {
      files.delete(n);
      files.set(n, j);
    },
    remove: async (n) => void files.delete(n),
  };
}

function setup(options: GameScreenOptions) {
  const { ui, assets } = makeUi();
  ui.gfx.patternAvailable = true;
  ui.gfx.loadPic(2, 0, 0, assets.pic('SP299.PIC'));
  const state = newGame({ seed: 77, difficulty: 1, civilizations: 5, nation: 1 });
  advanceToHuman(state);
  state.events.length = 0;
  const screen = new GameScreen(ui, assets, state, options);
  screen.redrawAll();
  return { ui, state, screen };
}

const down = (n: number) => Array.from({ length: n }, () => key('ArrowDown'));

describe('autozapis i wczytywanie w trakcie gry', () => {
  it('GAME → Autosave... ustawia liczbę tur', async () => {
    let turns = 5;
    const { ui, screen } = setup({ autosaveTurns: { get: () => turns, set: (n) => (turns = n) }, autosave: () => undefined });
    // menu GAME: … 4 Save Game, 5 Autosave...; w podmenu z zaznaczonym „Every 5 turns” (3) → „Every 10 turns” (4)
    await drive(ui, [...down(5), key('Enter'), key('ArrowDown'), key('Enter')], () => screen.handle(key('g', { alt: true })));
    expect(turns).toBe(10);
  });

  it('autozapis co ustawioną liczbę tur; wyłączony — tylko co 50 tur jak w oryginale', async () => {
    for (const every of [1, 0]) {
      const saved: number[] = [];
      const { ui, state, screen } = setup({ autosaveTurns: { get: () => every, set: () => undefined }, autosave: (s) => void saved.push(s.turn) });
      state.settings.autoSave = true;
      for (let i = 0; i < 3; i++) await drive(ui, Array.from({ length: 40 }, () => key('Escape')), () => screen.endTurn()).catch(() => undefined);
      expect(saved.length > 0).toBe(every === 1);
      if (every === 1) expect(saved).toContain(state.turn);
    }
  });

  it('zostają tylko najnowsze autozapisy; zwykłe zapisy nietknięte', async () => {
    const store = memoryStore();
    await store.write('Roman 3000 BC.json', '{}');
    const state = newGame({ seed: 5, difficulty: 1, civilizations: 5, nation: 1 });
    for (let i = 0; i < AUTOSAVES_KEPT + 3; i++) {
      state.year = -4000 + i * 20;
      await writeAutosave(store, state);
    }
    const names = await store.list();
    expect(names.filter((n) => n.startsWith(AUTOSAVE_PREFIX))).toHaveLength(AUTOSAVES_KEPT);
    expect(names).toContain('Roman 3000 BC.json');
    expect(names.at(-1)).toContain('3900 BC');
  });

  it('GAME → Load Game: wybrany zapis kończy ekran wynikiem „load”', async () => {
    const store = memoryStore();
    const other = newGame({ seed: 9, difficulty: 2, civilizations: 5, nation: 3 });
    advanceToHuman(other);
    await store.write('Other.json', saveGame(other));
    const { ui, screen } = setup({ load: savedGameLoader(store) });
    // menu GAME: … 4 Save Game, 5 Load Game; lista zapisów: Enter
    const result = await drive(ui, [...down(5), key('Enter'), key('Enter')], () => screen.handle(key('g', { alt: true })));
    expect(result).toBe('load');
    expect((screen.loadedState as GameState).mapSeed).toBe(other.mapSeed);
    expect(screen.loadedState!.difficulty).toBe(2);
  });
});
