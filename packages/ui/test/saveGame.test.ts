/** Zapis gry w formacie oryginału z interfejsu (F11_0000_036a): okna, zapis plików, odczyt `loadSve` — na syntetycznych plikach. */
import { describe, expect, it } from 'vitest';
import { advanceToHuman, endHumanTurn, loadSve, newGame, saveSve, sveInfo, type GameState } from '@civ-remake/engine';
import type { UiEvent } from '../src/input';
import { GameScreen, GAME_MENU } from '../src/screens/gameScreen';
import {
  autosaveSlot, saveFileName, saveSlotLine, showSaveGameDialog, type OriginalSaveStore, type SaveWriteResult,
} from '../src/screens/saveGame';
import { drive, makeUi } from './synthetic';

const key = (k: string): UiEvent => ({ type: 'key', key: k });

function setup() {
  const { ui, assets } = makeUi();
  ui.gfx.patternAvailable = true;
  ui.gfx.loadPic(2, 0, 0, assets.pic('SP299.PIC'));
  const state = newGame({ seed: 42, difficulty: 2, civilizations: 5, nation: 1 });
  advanceToHuman(state);
  for (let i = 0; i < 12; i++) endHumanTurn(state);
  advanceToHuman(state);
  state.events.length = 0;
  return { ui, assets, state };
}

/** Magazyn w pamięci; `fail` — wynik zapisu z błędem. */
function memoryStore(fail?: SaveWriteResult): OriginalSaveStore & { files: Map<number, { sve: Uint8Array; map: Uint8Array }> } {
  const files = new Map<number, { sve: Uint8Array; map: Uint8Array }>();
  return {
    files,
    list: async () => [...files.keys()].sort(),
    read: async (i) => files.get(i)!,
    write: async (i, f) => {
      if (fail) return fail;
      files.set(i, { sve: f.sve.slice(), map: f.map.slice() });
      return { ok: true };
    },
  };
}

/** Te same pola gry po odczycie zapisu. */
function expectSameGame(loaded: GameState, state: GameState): void {
  expect(loaded.turn).toBe(state.turn);
  expect(loaded.year).toBe(state.year);
  expect(loaded.humanPlayer).toBe(state.humanPlayer);
  expect(loaded.difficulty).toBe(state.difficulty);
  for (let p = 0; p < 8; p++) {
    const a = loaded.players[p]!;
    const b = state.players[p]!;
    expect([a.leader, a.gold, a.government, a.cityCount, a.techs.join()]).toEqual([b.leader, b.gold, b.government, b.cityCount, b.techs.join()]);
  }
  expect(loaded.cities.map((c) => [c.status, c.x, c.y, c.size, c.owner])).toEqual(state.cities.map((c) => [c.status, c.x, c.y, c.size, c.owner]));
  expect(Array.from(loaded.map.terrain)).toEqual(Array.from(state.map.terrain));
}

describe('zapis gry w formacie oryginału (F11_0000_036a)', () => {
  it('wiersze listy i nazwy plików jak w F11_0000_0103 / DS:0x41c6', () => {
    const { state } = setup();
    expect(saveSlotLine(null)).toBe(' (EMPTY)\n');
    const h = state.players[state.humanPlayer]!;
    const info = sveInfo(saveSve(state).sve);
    expect(info.leader).toBe(h.leader);
    expect(saveSlotLine(saveSve(state).sve)).toBe(` Prince ${h.leader}, ${info.nation}/${-state.year} BC\n`);
    expect(saveFileName(2, 3)).toBe('c:CIVIL3.SVE');
    expect([50, 100, 300, 350, 650].map(autosaveSlot)).toEqual([4, 5, 9, 4, 4]);
  });

  it('dysk C:, miejsce 2 z listy, „save in progress”, wynik; pliki dają przy odczycie ten sam stan', async () => {
    const { ui, state } = setup();
    const store = memoryStore();
    store.files.set(0, saveSve(newGame({ seed: 1, difficulty: 0, civilizations: 3, nation: 2 })));
    const rngBefore = state.rng.state;
    // Enter (dysk C:), ↓↓ Enter (miejsce 2), klawisz (wynik)
    const ok = await drive(ui, [key('Enter'), key('ArrowDown'), key('ArrowDown'), key('Enter'), key('x')],
      () => showSaveGameDialog(ui, state, store));
    expect(ok).toBe(true);
    expect([...store.files.keys()].sort()).toEqual([0, 2]);
    // DrawRandomFoodIcons w oknie dysku: jedno losowanie generatora gry
    expect(state.rng.state).not.toBe(rngBefore);
    const files = store.files.get(2)!;
    const loaded = loadSve(files.sve, files.map);
    expectSameGame(loaded, state);
    // zapis → odczyt → zapis: te same bajty
    const again = saveSve(loaded);
    expect(Buffer.from(again.sve).equals(Buffer.from(files.sve))).toBe(true);
    // następnym razem domyślnie to samo miejsce (Var_e168)
    await drive(ui, [key('Enter'), key('Enter'), key('x')], () => showSaveGameDialog(ui, state, store));
    expect(store.files.has(2)).toBe(true);
    expect([...store.files.keys()].length).toBe(2);
  });

  it('nazwy poziomów z Array_33a2 („Lord”); lista (48, 33) bez ramki — nieparzyste Y w F0_2d05_0475', async () => {
    const { ui, state } = setup();
    state.difficulty = 1;
    expect(saveSlotLine(saveSve(state).sve)).toMatch(/^ Lord /);
    const store = memoryStore();
    const seen: number[] = [];
    const present = ui.present.bind(ui);
    ui.present = () => {
      seen.push(ui.gfx.screen.getPixel(49, 34));
      present();
    };
    await drive(ui, [key('Enter'), key('Escape')], () => showSaveGameDialog(ui, state, store));
    expect(seen).toContain(15); // białe tło okna wyboru dysku widać pod listą
    expect(seen).not.toContain(7); // brak szarego tła ramki
  });

  it('Esc przy wyborze dysku albo listy — bez zapisu', async () => {
    const { ui, state } = setup();
    const store = memoryStore();
    expect(await drive(ui, [key('Escape')], () => showSaveGameDialog(ui, state, store))).toBe(false);
    expect(await drive(ui, [key('Enter'), key('Escape')], () => showSaveGameDialog(ui, state, store))).toBe(false);
    expect(store.files.size).toBe(0);
  });

  it('inny dysk (A:) — „No Disk in Drive A.”, bez zapisu; wybór dysku zostaje zapamiętany', async () => {
    const { ui, state } = setup();
    const store = memoryStore();
    expect(await drive(ui, [key('a'), key('Enter'), key('Enter')], () => showSaveGameDialog(ui, state, store))).toBe(false);
    expect(store.files.size).toBe(0);
    // DS:0x4384 = A: — tym razem trzeba wybrać C:
    expect(await drive(ui, [key('c'), key('Enter'), key('Enter'), key('x')], () => showSaveGameDialog(ui, state, store))).toBe(true);
    expect(store.files.has(0)).toBe(true);
  });

  it('błąd zapisu: brak prawa zapisu → czerwone pole i „Write access denied.”; pełny dysk; błąd .MAP', async () => {
    for (const [fail, extra] of [
      [{ ok: false, file: 'sve', code: 'EACCES' }, 0],
      [{ ok: false, file: 'sve', code: 'ENOSPC' }, 0],
      [{ ok: false, file: 'map', code: 'EIO' }, 1], // „Error writing map file.” — jeszcze jeden klawisz
    ] as const) {
      const { ui, state } = setup();
      let red = -1;
      const events = [key('Enter'), key('Enter'), ...Array.from({ length: extra }, () => key('x')), key('x')];
      const ok = await drive(ui, events, async () => {
        const r = showSaveGameDialog(ui, state, memoryStore(fail));
        // czerwone pole (64, 127, 192, 34) widać przy oknie wyniku — zapamiętane przed odtworzeniem ekranu
        const check = setInterval(() => {
          if (ui.gfx.screen.getPixel(250, 158) === 12) red = 12;
        }, 0);
        try {
          return await r;
        } finally {
          clearInterval(check);
        }
      });
      expect(ok).toBe(false);
      expect(red).toBe(12);
    }
  });

  it('GAME → Save Game z ekranu gry zapisuje w formacie oryginału; autozapis co 50 tur do CIVIL4–9', async () => {
    const { ui, assets, state } = setup();
    const store = memoryStore();
    const json: string[] = [];
    const screen = new GameScreen(ui, assets, state, { originalSaves: store, autosave: () => void json.push('autosave') });
    screen.redrawAll();
    expect(GAME_MENU.split('\n')[4]).toBe(' Save Game');
    // Alt+G → menu GAME, ↓×4 Save Game, Enter (dysk), Enter (miejsce 0), klawisz
    const events = [key('ArrowDown'), key('ArrowDown'), key('ArrowDown'), key('ArrowDown'), key('Enter'), key('Enter'), key('Enter'), key('x')];
    await drive(ui, events, () => screen.handle({ type: 'key', key: 'g', alt: true }));
    expect(store.files.has(0)).toBe(true);
    expectSameGame(loadSve(store.files.get(0)!.sve, store.files.get(0)!.map), state);

    state.settings.autoSave = true;
    while ((state.turn + 1) % 50 !== 0) endHumanTurn(state);
    advanceToHuman(state);
    state.events.length = 0;
    await drive(ui, [key('Enter'), key('x')], () => screen.endTurn(), 400);
    expect(state.turn % 50).toBe(0);
    expect(store.files.has(autosaveSlot(state.turn))).toBe(true);
    expect(json).toEqual(['autosave']);
  });
});
