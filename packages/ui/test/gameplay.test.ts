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
    // „hail the CONQUEROR” → okno wyniku → wykres potęgi → „See Replay?” (No replay) → postaci sławne (premia za podbój) → Hall of Fame
    await drive(ui, [key('Enter'), key('Enter'), key('Enter'), key('Enter'), key('Enter'), key('Enter')], () => screen.processEvents());
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
    await drive(ui, [key('Enter'), key('Enter'), key('Enter'), key('Enter'), key('Enter'), key('c'), key('Enter')], () => screen.processEvents());
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
    // klik w pole miasta: okno miasta → klik w CHANGE → lista produkcji (domyślnie pierwsza pozycja): trzecia → Esc zamyka okno
    screen.drawVisibleMap(x - 7, y - 6);
    const sx = 80 + 7 * 16 + 4;
    const sy = 8 + (y - screen.viewY) * 16 + 4;
    const before = state.cities[cityId]!.production;
    await drive(ui, [click(240, 110), key('ArrowDown'), key('ArrowDown'), key('Enter'), key('Escape')], () => screen.handle(click(sx, sy)));
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

describe('jednostka w mieście', () => {
  it('aktywna jednostka zbudowana w mieście jest rysowana na polu miasta (miganie)', async () => {
    const { createUnit, unitOrder, UNITS } = await import('@civ-remake/engine');
    const { state, screen, ui } = setup();
    const h = state.humanPlayer;
    const settler = state.players[h]!.units[0]!;
    const { x, y } = settler;
    unitOrder(state, h, 0, 'build');
    expect(cityAt(state, x, y)).not.toBe(-1);
    state.events.length = 0;
    // nowa jednostka (jak po ukończeniu produkcji); bez aktywnej jednostki DrawVisibleMap rysuje samo miasto
    const id = createUnit(state, h, UNITS.findIndex((u) => u.name === 'Militia'), x, y);
    screen.activeUnit = -1;
    screen.drawVisibleMap(x - 7, y - 6);
    const sx = ((x - screen.viewX + 80) % 80) * 16 + 80;
    const sy = (y - screen.viewY) * 16 + 8;
    const cell = () => Array.from({ length: 16 }, (_, j) => [...ui.gfx.screen.pixels.subarray((sy + j) * 320 + sx, (sy + j) * 320 + sx + 16)]).flat();
    expect(sy).toBeGreaterThanOrEqual(8);
    expect(sy).toBeLessThan(200 - 16);
    const cityOnly = cell();
    // jednostka aktywna (faza widoczna migania) — rysowana na wierzchu miasta
    screen.activeUnit = id;
    screen.drawVisibleMap(screen.viewX, screen.viewY);
    expect(cell()).not.toEqual(cityOnly);
  });
});

describe('mysz i koniec tury', () => {
  const at = (screen: GameScreen, x: number, y: number) => ({
    x: ((x - screen.viewX + 80) % 80) * 16 + 80 + 8,
    y: (y - screen.viewY) * 16 + 8 + 8,
  });
  /** Pole sąsiednie (kierunek 3 = wschód albo inny) z lądem, bez jednostek i miast. */
  function neighbour(state: GameState, ux: number, uy: number): { x: number; y: number } {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]] as const) {
      const x = (ux + dx + 80) % 80;
      const y = uy + dy;
      if (state.map.terrain[y * 80 + x] !== 10 && (state.map.occupant[y * 80 + x]! & 8) === 0 && cityAt(state, x, y) === -1) return { x, y };
    }
    throw new Error('brak wolnego pola obok');
  }

  it('kliknięcie w sąsiednie pole przesuwa aktywną jednostkę (lewy i prawy przycisk)', async () => {
    const { ui, state, screen } = setup();
    const h = state.humanPlayer;
    const id = screen.activeUnit;
    const u = state.players[h]!.units[id]!;
    screen.drawVisibleMap(u.x - 7, u.y - 6);
    const target = neighbour(state, u.x, u.y);
    const p = at(screen, target.x, target.y);
    await drive(ui, [], () => screen.handle({ type: 'mousedown', x: p.x, y: p.y, button: 'right' }));
    expect([u.x, u.y]).toEqual([target.x, target.y]);
  });

  it('kliknięcie w dalsze pole centruje mapę, bez ruchu jednostki', async () => {
    const { ui, state, screen } = setup();
    const h = state.humanPlayer;
    const u = state.players[h]!.units[screen.activeUnit]!;
    screen.drawVisibleMap(u.x - 7, u.y - 6);
    const goal = { x: (u.x + 5) % 80, y: u.y };
    const p = at(screen, goal.x, goal.y);
    const before = [u.x, u.y];
    await drive(ui, [], () => screen.handle(click(p.x, p.y)));
    expect([u.x, u.y]).toEqual(before);
    expect(u.gotoX === goal.x && u.gotoY === goal.y).toBe(false);
    expect(screen.viewX).toBe((goal.x - 7 + 80) % 80);
  });

  it('pole sąsiednie z własną jednostką: klik — ruch, dwuklik — wybór jednostki', async () => {
    const { createUnit, UNITS } = await import('@civ-remake/engine');
    for (const double of [false, true]) {
      const { ui, state, screen } = setup();
      const h = state.humanPlayer;
      const id = screen.activeUnit;
      const u = state.players[h]!.units[id]!;
      const target = neighbour(state, u.x, u.y);
      const other = createUnit(state, h, UNITS.findIndex((t) => t.name === 'Militia'), target.x, target.y);
      screen.drawVisibleMap(u.x - 7, u.y - 6);
      const p = at(screen, target.x, target.y);
      // czas w testach mija od razu — drugi klik musi już czekać w kolejce
      if (double) ui.input.push(click(p.x, p.y));
      await drive(ui, double ? [key('Escape')] : [], () => screen.handle(click(p.x, p.y)));
      if (double) {
        expect([u.x, u.y]).not.toEqual([target.x, target.y]);
        expect(ui.input.size).toBe(0);
        expect(other).toBeGreaterThanOrEqual(0);
      } else {
        expect([u.x, u.y]).toEqual([target.x, target.y]);
      }
    }
  });

  it('klawisz g i kliknięcie: tryb „idź do”', async () => {
    const { ui, screen } = setup();
    await drive(ui, [], () => screen.handle(key('g')));
    expect(screen.gotoMode).toBe(true);
    await drive(ui, [], () => screen.handle(key('g')));
    expect(screen.gotoMode).toBe(false);
  });

  it('bez „End of Turn” tura kończy się sama, gdy zabraknie jednostek; z tą opcją czeka', async () => {
    for (const endOfTurn of [false, true]) {
      const { ui, state, screen } = setup();
      state.settings.endOfTurn = endOfTurn;
      // jak po wybraniu jednostki w PlayerTurn (flag5)
      (screen as unknown as { hadActiveUnit: boolean }).hadActiveUnit = true;
      const turn = state.turn;
      // wszystkie jednostki: spacja (bez rozkazów)
      for (let i = 0; i < 10 && screen.activeUnit !== -1; i++) await drive(ui, [], () => screen.handle(key(' ')));
      expect(screen.activeUnit).toBe(-1);
      const ended = await drive(ui, [], () => screen.autoEndTurn(), 400);
      expect(ended).toBe(!endOfTurn);
      expect(state.turn).toBe(endOfTurn ? turn : turn + 1);
    }
  });

  it('tura bez żadnej jednostki kończy się po krótkiej przerwie; klawisz w przerwie ją wstrzymuje', async () => {
    const { ui, state, screen } = setup();
    screen.activeUnit = -1;
    (screen as unknown as { hadActiveUnit: boolean }).hadActiveUnit = false;
    const turn = state.turn;
    ui.input.push(key('Escape'));
    expect(await screen.autoEndTurn()).toBe(false);
    expect(ui.input.size).toBe(1); // klawisz wrócił do kolejki
    while (ui.input.size > 0) await ui.waitEvent(0);
    // czas przerwy w testach mija od razu (TestHost.sleep)
    expect(await screen.autoEndTurn()).toBe(true);
    expect(state.turn).toBe(turn + 1);
  }, 20000);

  it('ruch jednostki: 17 klatek przesuwania jak AnimateUnitMove', async () => {
    const { ui, state, screen } = setup();
    const h = state.humanPlayer;
    const u = state.players[h]!.units[screen.activeUnit]!;
    screen.drawVisibleMap(u.x - 7, u.y - 6);
    const target = neighbour(state, u.x, u.y);
    const p = at(screen, target.x, target.y);
    let frames = 0;
    const present = ui.present.bind(ui);
    ui.present = () => { frames++; present(); };
    await drive(ui, [], () => screen.handle({ type: 'mousedown', x: p.x, y: p.y, button: 'right' }));
    expect([u.x, u.y]).toEqual([target.x, target.y]);
    expect(frames).toBeGreaterThanOrEqual(17);
  });

  it('walka: wypad napastnika, wybuch, pokonana jednostka znika', async () => {
    const { createUnit, UNITS } = await import('@civ-remake/engine');
    const { ui, state, screen } = setup();
    const h = state.humanPlayer;
    const s0 = state.players[h]!.units[screen.activeUnit]!;
    const target = neighbour(state, s0.x, s0.y);
    const legion = createUnit(state, h, UNITS.findIndex((u) => u.name === 'Legion'), s0.x, s0.y);
    state.players[h]!.units[legion]!.movesLeft = 3;
    const enemy = createUnit(state, 0, UNITS.findIndex((u) => u.name === 'Militia'), target.x, target.y);
    state.players[0]!.units[enemy]!.visibleBy = 0xff;
    screen.activeUnit = legion;
    screen.drawVisibleMap(s0.x - 7, s0.y - 6);
    const p = at(screen, target.x, target.y);
    let frames = 0;
    const present = ui.present.bind(ui);
    ui.present = () => { frames++; present(); };
    await drive(ui, Array.from({ length: 6 }, () => key('Enter')), () => screen.handle({ type: 'mousedown', x: p.x, y: p.y, button: 'right' })).catch(() => undefined);
    expect(state.events.some((e) => e.kind === 'combat')).toBe(true);
    // 11 klatek wypadu + 8 klatek wybuchu
    expect(frames).toBeGreaterThanOrEqual(19);
    const legionAlive = state.players[h]!.units[legion]!.type !== -1;
    const enemyAlive = state.players[0]!.units[enemy]!.type !== -1;
    expect(legionAlive && enemyAlive).toBe(false);
  });
});
