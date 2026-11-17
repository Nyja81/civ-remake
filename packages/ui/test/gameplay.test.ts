/** Rozgrywka na ekranie gry: okna zdarzeń silnika, miasto, zapis — na syntetycznych plikach gry. */
import { describe, expect, it } from 'vitest';
import { addSpaceshipPart, emptyHallOfFame, type HallOfFameEntry, advanceToHuman, cityAt, isLaunched, newGame, nextUnit, saveGame, TECHS, type GameState } from '@civ-remake/engine';
import type { UiEvent } from '../src/input';
import { savedGameLoader, saveName, type SaveStore } from '../src/screens/flow';
import { GameScreen } from '../src/screens/gameScreen';
import { drive, makeUi } from './synthetic';

const key = (k: string, extra: Partial<{ alt: boolean; shift: boolean }> = {}): UiEvent => ({ type: 'key', key: k, ...extra });
const click = (x: number, y: number): UiEvent => ({ type: 'mousedown', x, y, button: 'left' });

function setup(seed = 77, options: ConstructorParameters<typeof GameScreen>[3] = {}) {
  const { ui, assets } = makeUi();
  ui.gfx.patternAvailable = true;
  ui.gfx.loadPic(2, 0, 0, assets.pic('SP299.PIC'));
  const state = newGame({ seed, difficulty: 1, civilizations: 5, nation: 1 });
  advanceToHuman(state);
  state.events.length = 0;
  const screen = new GameScreen(ui, assets, state, options);
  screen.activeUnit = nextUnit(state, state.humanPlayer);
  screen.redrawAll();
  return { ui, assets, state, screen };
}

describe('okna zdarzeń silnika', () => {
  it('wybór badań: lista technologii, Enter wybiera zaznaczoną', async () => {
    const { ui, state, screen } = setup();
    const options = [TECHS.findIndex((t) => t.name === 'Alphabet'), TECHS.findIndex((t) => t.name === 'Bronze Working')];
    state.events.push({ kind: 'chooseResearch', player: state.humanPlayer, options });
    await drive(ui, [key('ArrowDown'), key('Enter')], () => screen.processEvents());
    expect(state.players[state.humanPlayer]!.researching).toBe(options[1]);
  });

  it('wybór ustroju: Esc powtarza pytanie', async () => {
    const { ui, state, screen } = setup();
    state.events.push({ kind: 'chooseGovernment', player: state.humanPlayer, options: [1, 2] });
    await drive(ui, [key('Escape'), key('ArrowDown'), key('Enter')], () => screen.processEvents());
    expect(state.players[state.humanPlayer]!.government).toBe(2);
  });

  it('komunikat z tekstem jako okno zamykane klawiszem', async () => {
    const { ui, state, screen } = setup();
    state.events.push({ kind: 'news', text: 'Hello\nworld!\n' });
    await drive(ui, [key('Enter')], () => screen.processEvents());
  });
});

describe('statek kosmiczny', () => {
  it('moduł: wybór rodzaju, plan statku, start klawiszem L z potwierdzeniem', async () => {
    const { ui, state, screen } = setup();
    const p = state.humanPlayer;
    for (let i = 0; i < 33; i++) addSpaceshipPart(state, p, 0);
    addSpaceshipPart(state, p, 1, 3);
    addSpaceshipPart(state, p, 1, 4);
    addSpaceshipPart(state, p, 2, 7);
    addSpaceshipPart(state, p, 2, 8);
    state.events.push({ kind: 'spaceshipPart', player: p, part: 2, placed: false });
    // Type? → Habitation (pierwsza), plan statku → L → potwierdzenie (druga opcja), komunikat startu
    await drive(ui, [key('Enter'), key('l'), key('ArrowDown'), key('Enter'), key('Enter')], () => screen.processEvents());
    expect(isLaunched(state, p)).toBe(true);
    expect(state.players[p]!.spaceshipPopulation).toBe(1);
  });
});

describe('koniec gry', () => {
  it('okno wyniku, potem pytanie o dalszą grę — wybór „dalej” wznawia grę', async () => {
    const { ui, state, screen } = setup();
    state.gameOver = 2;
    state.events.push({ kind: 'gameEnd', reason: 'retirement', canContinue: true, score: 0 });
    await drive(ui, [key('Enter'), key('ArrowDown'), key('Enter')], () => screen.processEvents());
    expect(state.gameOver).toBe(0);
  });

  it('podbój: tylko okno wyniku, gra zakończona', async () => {
    const { ui, state, screen } = setup();
    state.gameOver = 2;
    state.events.push({ kind: 'gameEnd', reason: 'conquest', canContinue: false, score: 0 });
    // okno wyniku → wykres potęgi → postaci sławne (premia za podbój) → Hall of Fame
    await drive(ui, [key('Enter'), key('Enter'), key('Enter'), key('Enter')], () => screen.processEvents());
    expect(state.gameOver).toBe(2);
  });

  it('Hall of Fame: wpis zapisany w magazynie, C czyści tabelę i pokazuje sam nowy wpis', async () => {
    let stored: HallOfFameEntry[] | null = null;
    const fame = { read: async () => stored, write: async (e: HallOfFameEntry[]) => { stored = e.map((x) => ({ ...x })); } };
    const { ui, state, screen } = setup(77, { fame });
    const old = emptyHallOfFame();
    old[0] = { ...old[0]!, totalScore: 5000, difficulty: 4, leader: 'X', nation: 'Y' };
    stored = old;
    state.gameOver = 2;
    state.events.push({ kind: 'gameEnd', reason: 'conquest', canContinue: false, score: 0 });
    await drive(ui, [key('Enter'), key('Enter'), key('Enter'), key('c'), key('Enter')], () => screen.processEvents());
    expect(stored![0]!.leader).toBe(state.players[state.humanPlayer]!.leader);
    expect(stored!.filter((e) => e.totalScore > 0).length).toBe(1);
  });
});

describe('miasto', () => {
  it('założenie miasta pyta o nazwę i otwiera okno miasta; klik w miasto otwiera okno, CHANGE zmienia produkcję', async () => {
    const { ui, state, screen } = setup();
    const h = state.humanPlayer;
    const u = state.players[h]!.units[screen.activeUnit]!;
    const { x, y } = u;
    // 'b' = Found New City, okno „City Name...”: wpisujemy nazwę; potem okno nowego miasta — Esc je zamyka
    await drive(ui, [key('W'), key('a'), key('w'), key('Enter'), key('Escape')], () => screen.handle(key('b')));
    const cityId = cityAt(state, x, y);
    expect(cityId).not.toBe(-1);
    expect(state.cityNames[state.cities[cityId]!.nameId]).toBe('Waw');
    // klik w pole miasta: okno miasta → klik w CHANGE → lista produkcji: druga pozycja → Esc zamyka okno
    screen.drawVisibleMap(x - 7, y - 6);
    const sx = 80 + 7 * 16 + 4;
    const sy = 8 + (y - screen.viewY) * 16 + 4;
    const before = state.cities[cityId]!.production;
    await drive(ui, [click(240, 110), key('ArrowDown'), key('Enter'), key('Escape')], () => screen.handle(click(sx, sy)));
    expect(state.cities[cityId]!.production).not.toBe(before);
  });
});

describe('zapis i wczytanie', () => {
  function memoryStore(): SaveStore & { files: Map<string, string> } {
    const files = new Map<string, string>();
    return {
      files,
      list: async () => [...files.keys()].sort(),
      read: async (n) => files.get(n)!,
      write: async (n, j) => void files.set(n, j),
    };
  }

  it('autozapis co 50 tur przy końcu tury; nazwa z narodem i rokiem', async () => {
    const store = memoryStore();
    const { ui, state, screen } = setup(77, { autosave: (s: GameState) => store.write(saveName(s, 'Autosave '), saveGame(s)) });
    state.turn = 49;
    screen.activeUnit = -1;
    // okna zdarzeń nowej tury zamykamy Enterem/Esc (liczba zależy od silnika)
    await drive(ui, Array.from({ length: 30 }, () => key('Escape')), () => screen.endTurn()).catch(() => undefined);
    expect(state.turn).toBe(50);
    expect([...store.files.keys()][0]).toMatch(/^Autosave Roman \d+ (BC|AD)\.json$/);
  });

  it('„Load a Saved Game”: lista zapisów i wczytanie stanu silnika', async () => {
    const store = memoryStore();
    const { ui, state } = setup();
    await store.write('Roman 3950 BC.json', saveGame(state));
    const loaded = await drive(ui, [key('Enter')], () => savedGameLoader(store)(ui));
    expect(loaded?.humanPlayer).toBe(state.humanPlayer);
    const empty = memoryStore();
    expect(await drive(ui, [key('Enter')], () => savedGameLoader(empty)(ui))).toBeNull();
  });
});
