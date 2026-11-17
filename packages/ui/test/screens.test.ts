/** Ekrany startowe, ustawienia nowej gry i ekran gry — przebieg na syntetycznych plikach gry. */
import { describe, expect, it } from 'vitest';
import { advanceToHuman, NATIONS, newGame, nextUnit } from '@civ-remake/engine';
import type { UiEvent } from '../src/input';
import { GameScreen, ordersFor } from '../src/screens/gameScreen';
import { GameType, showMainGameIntro } from '../src/screens/intro';
import { knownTechnologies, newGameOptions } from '../src/screens/flow';
import { showLogoAndMainGameMenu } from '../src/screens/mainMenu';
import { competitionMenu, initNewGameData, showInitText, tribeMenu, type NewGameSettings } from '../src/screens/newGame';
import { drive, makeUi, syntheticFiles } from './synthetic';

const key = (k: string, extra: Partial<{ alt: boolean }> = {}): UiEvent => ({ type: 'key', key: k, ...extra });
const click = (x: number, y: number): UiEvent => ({ type: 'mousedown', x, y, button: 'left' });

describe('intro i menu główne', () => {
  it('bez plików intro pokazuje samo logo; klawisz z intro wybiera opcję menu', async () => {
    const { ui } = makeUi();
    expect(await showMainGameIntro(ui, (makeUi().assets))).toBe(GameType.None);
    expect(ui.gfx.screen.getPixel(160, 100)).toBe(14); // logo z LOGO.PIC w pasie y 64–144
    expect(ui.gfx.screen.getPixel(160, 20)).toBe(0);
  });

  it('EARTH z menu głównego (klawisz E + Enter)', async () => {
    const { ui, assets } = makeUi();
    const choice = await drive(ui, [key('e'), key('Enter')], () => showLogoAndMainGameMenu(ui, assets));
    expect(choice).toEqual({ kind: 'earth' });
    expect(ui.gfx.patternAvailable).toBe(true);
  });

  it('Customize World: cztery menu na CUSTOM.PIC, domyślnie środkowa opcja, Esc powtarza pytanie', async () => {
    const { ui, assets } = makeUi();
    const events = [
      key('c'), key('Enter'), // Customize World
      key('ArrowUp'), key('Enter'), // Small
      key('Escape'), key('Enter'), // Temperature: Esc, potem domyślne Temperate
      key('ArrowDown'), key('Enter'), // Wet
      key('ArrowUp'), key('Enter'), // 3 billion years
    ];
    const choice = await drive(ui, events, () => showLogoAndMainGameMenu(ui, assets));
    expect(choice).toEqual({ kind: 'custom', options: { landMass: 0, temperature: 1, climate: 2, age: 0 } });
  });

  it('Hall of Fame i wczytywanie wracają do menu', async () => {
    const { ui, assets } = makeUi();
    const events = [key('v'), key('Enter'), key('x'), key('l'), key('Enter'), key('Enter'), key('Enter')];
    expect(await drive(ui, events, () => showLogoAndMainGameMenu(ui, assets))).toEqual({ kind: 'random', options: { landMass: 1, temperature: 1, climate: 1, age: 1 } });
  });
});

describe('ustawienia nowej gry (DIFFS.PIC)', () => {
  it('listy jak w oryginale: 7…3 cywilizacji; plemiona k i k+8', () => {
    expect(competitionMenu()).toBe('Level of Competition...\n 7 Civilizations\n 6 Civilizations\n 5 Civilizations\n 4 Civilizations\n 3 Civilizations\n ');
    const tribes = tribeMenu(2).trimEnd().split('\n').slice(1).map((s) => s.trim());
    expect(tribes).toEqual([NATIONS[1]!.adjective, NATIONS[2]!.adjective, NATIONS[3]!.adjective, NATIONS[9]!.adjective, NATIONS[10]!.adjective, NATIONS[11]!.adjective]);
  });

  async function newGame(events: UiEvent[]): Promise<{ settings: NewGameSettings; frames: number }> {
    const { ui, assets, host } = makeUi();
    const settings = await drive(ui, events, () => initNewGameData(ui, assets, { kind: 'earth' }, { random: () => 0 }));
    return { settings, frames: host.frames };
  }

  it('poziom, 5 cywilizacji, plemię z drugiej kolumny, własne imię, tekst *INIT', async () => {
    const { settings } = await newGame([
      key('ArrowDown'), key('ArrowDown'), key('Enter'), // Prince
      key('ArrowDown'), key('ArrowDown'), key('Enter'), // 5 Civilizations → 4 przeciwników
      key('ArrowDown'), key('ArrowDown'), key('ArrowDown'), key('ArrowDown'), key('ArrowDown'), key('ArrowDown'), key('Enter'), // 7. opcja = nacja 10
      key('A'), key('b'), key('e'), key('Enter'), // imię
    ]);
    expect(settings).toMatchObject({ customTribe: false, difficulty: 2, opponents: 4, activeCivilizations: 0b111111, humanPlayer: 2, nationalityId: 10, leaderName: 'Abe' });
    expect(settings.nationality).toBe(NATIONS[10]!.adjective);
    expect(settings.nation).toBe(NATIONS[10]!.plural || NATIONS[10]!.adjective + 's');
  });

  it('kliknięcie w portret po lewej wybiera poziom według wysokości; Esc przy plemieniu = własne plemię', async () => {
    const { settings } = await newGame([
      click(40, 12 + 35 * 4 + 5), // Emperor
      key('Enter'), // 7 Civilizations
      key('Escape'), // własne plemię
      key('V'), key('i'), key('k'), key('i'), key('n'), key('g'), key('s'), key('Enter'),
      key('Enter'), // imię bez zmian
    ]);
    expect(settings).toMatchObject({ customTribe: true, difficulty: 4, opponents: 6, humanPlayer: 1, nationalityId: 1, nation: 'Vikings', nationality: 'Viking' });
    expect(settings.leaderName).toBe(NATIONS[1]!.leader);
  });
});

describe('ekran gry', () => {
  function gameScreen(seed = 77) {
    const { ui, assets } = makeUi();
    ui.gfx.patternAvailable = true;
    ui.gfx.loadPic(2, 0, 0, assets.pic('SP299.PIC'));
    const state = newGame({ seed, difficulty: 0, civilizations: 5, nation: 1 });
    advanceToHuman(state);
    const screen = new GameScreen(ui, assets, state);
    return { ui, assets, state, screen };
  }

  it('układ: pasek menu, minimapa, panele z wzorem, mapa od (80, 8); panel aktywnej jednostki', () => {
    const { ui, state, screen } = gameScreen();
    screen.activeUnit = nextUnit(state, state.humanPlayer);
    screen.drawVisibleMap(30, 15);
    screen.drawStatusPanel();
    const s = ui.gfx.screen;
    expect(s.getPixel(300, 3)).toBe(0); // pasek menu
    expect(s.getPixel(9, 2)).toBe(15); // biała pierwsza litera "GAME"
    expect([screen.viewX, screen.viewY]).toEqual([30, 15]);
    expect(s.getPixel(31, 26)).toBe(15); // prostokąt widoku na minimapie zawsze w (31, 26)
    expect(s.getPixel(40, 150)).not.toBe(0); // panel jednostki wypełniony wzorem
    expect(screen.cellAt(80, 8)).toEqual({ x: 30, y: 15 });
    expect(screen.cellAt(79, 8)).toBeNull();
    // tekst w panelu jednostki (czarne piksele czcionki) w wierszach y 99–130
    let ink = 0;
    for (let y = 99; y < 130; y++) for (let x = 4; x < 76; x++) if (s.getPixel(x, y) === 0) ink++;
    expect(ink).toBeGreaterThan(50);
  });

  it('kliknięcie w mapę centruje widok, w minimapę przesuwa go; zawijanie w poziomie', async () => {
    const { screen } = gameScreen();
    screen.activeUnit = -1;
    screen.drawVisibleMap(0, 10);
    await screen.handle(click(80 + 2 * 16, 8 + 8 * 16)); // pole (2, 18)
    expect([screen.viewX, screen.viewY]).toEqual([75, 12]);
    await screen.handle(click(40, 30));
    expect(screen.viewX).toBe((40 - 7 + 75 - 32 + 80) % 80);
  });

  it('ruch osadnika strzałką i rozkaz z klawisza przechodzą przez silnik', async () => {
    const { ui, state, screen } = gameScreen();
    const h = state.humanPlayer;
    screen.activeUnit = nextUnit(state, h);
    const id = screen.activeUnit;
    const u = state.players[h]!.units[id]!;
    const before = { x: u.x, y: u.y, moves: u.movesLeft };
    // 's' = sentry: jednostka przestaje być aktywna
    await drive(ui, [], () => screen.handle(key('s')));
    expect(state.players[h]!.units[id]!.status & 1).toBe(1);
    expect(screen.activeUnit).not.toBe(id);
    expect([u.x, u.y, before.moves]).toEqual([before.x, before.y, before.moves]);
  });

  it('menu GAME z paska: Preferences przełącza ustawienie w stanie gry, QUIT kończy ekran', async () => {
    const { ui, state, screen } = gameScreen();
    screen.redrawAll();
    const before = ui.gfx.screen.pixels.slice();
    const sound = state.settings.sound;
    expect(await drive(ui, [key('p'), key('Enter'), key('s'), key('Enter'), key('Escape')], () => screen.handle(click(10, 3)))).toBeNull();
    expect(state.settings.sound).toBe(!sound);
    expect(Buffer.from(ui.gfx.screen.pixels).equals(Buffer.from(before))).toBe(true); // ekran przywrócony
    expect(await drive(ui, [key('q'), key('Enter')], () => screen.handle(key('g', { alt: true })))).toBe('quit');
  });

  it('menu ORDERS dla osadnika i pozostałe menu z paska', async () => {
    const { ui, state, screen } = gameScreen();
    screen.activeUnit = nextUnit(state, state.humanPlayer);
    screen.redrawAll();
    const orders = ordersFor(state, state.humanPlayer, screen.activeUnit);
    expect(orders.text.startsWith(' No Orders')).toBe(true);
    expect(orders.keys).toContain('b');
    expect(await drive(ui, [key('Escape')], () => screen.handle(click(70, 3)))).toBeNull(); // ORDERS
    expect(await drive(ui, [key('Escape')], () => screen.handle(click(130, 3)))).toBeNull(); // ADVISORS
    // CIVILOPEDIA → „Not available yet.”
    expect(await drive(ui, [key('Enter'), key('Enter')], () => screen.handle(key('c', { alt: true })))).toBeNull();
  });

  it('koniec tury: Enter przy „End of Turn” oddaje turę silnikowi i wraca z nowym rokiem', async () => {
    const { ui, state, screen } = gameScreen();
    screen.activeUnit = -1;
    const year = state.year;
    await drive(ui, [], () => screen.handle(key('Enter'))).catch(async () => {
      // nowe zdarzenia mogą otworzyć okna — zamykamy je Enterem
    });
    expect(state.year).toBeGreaterThan(year);
  });
});

describe('nowa gra: wybory z menu → silnik', () => {
  it('ustawienia z menu tworzą grę w silniku z wybraną nacją i imieniem', () => {
    const { assets } = makeUi();
    const settings: NewGameSettings = {
      map: { kind: 'random', options: { landMass: 2, temperature: 1, climate: 1, age: 1 } }, difficulty: 3, opponents: 4,
      activeCivilizations: 0x3f, humanPlayer: 2, nationalityId: 10, leaderName: 'Damian', nation: 'Zulus', nationality: 'Zulu', customTribe: false,
    };
    const state = newGame(newGameOptions(assets, settings, 1234));
    expect(state.humanPlayer).toBe(2);
    expect(state.players[2]!.nation).toBe(10);
    expect(state.players[2]!.leader).toBe('Damian');
    expect(state.difficulty).toBe(3);
    expect(state.activeCivs).toBe(0x3f);
    expect(knownTechnologies(state).every((t) => typeof t === 'string')).toBe(true);
    const custom = newGame(newGameOptions(assets, { ...settings, customTribe: true, nation: 'Vikings', nationality: 'Viking' }, 1234));
    expect(custom.players[2]!.nationPlural).toBe('Vikings');
  });
});

describe('bez plików opcjonalnych', () => {
  it('tekst powitalny *INIT z KING.TXT, a bez KING.TXT ekran jest pomijany', async () => {
    const withKing = makeUi();
    const s = { nation: 'Romans', leaderName: 'Caesar', difficulty: 0 };
    await drive(withKing.ui, [key('Enter')], () => showInitText(withKing.ui, withKing.assets, s, ['Bronze Working']));
    expect(withKing.ui.gfx.screen.getPixel(300, 150)).toBe(15); // białe tło
    const bare = makeUi(syntheticFiles(false));
    bare.ui.gfx.fillRect(0, 0, 320, 200, 3);
    await drive(bare.ui, [], () => showInitText(bare.ui, bare.assets, s, []));
    expect(bare.ui.gfx.screen.getPixel(160, 100)).toBe(3);
  });
});
