/** Ekrany startowe, ustawienia nowej gry i ekran gry — przebieg na syntetycznych plikach gry. */
import { describe, expect, it } from 'vitest';
import { NATIONS } from '@civ-remake/engine';
import type { UiEvent } from '../src/input';
import { GameScreen, MAP_VIEW } from '../src/screens/gameScreen';
import { GameType, showMainGameIntro } from '../src/screens/intro';
import { createWorld } from '../src/screens/flow';
import { showLogoAndMainGameMenu } from '../src/screens/mainMenu';
import { competitionMenu, initNewGameData, tribeMenu, type NewGameSettings } from '../src/screens/newGame';
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
      key('Enter'), // tekst powitalny
    ]);
    expect(settings).toMatchObject({ difficulty: 2, opponents: 4, activeCivilizations: 0b111111, humanPlayer: 2, nationalityId: 10, leaderName: 'Abe' });
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
      click(10, 10), // tekst powitalny
    ]);
    expect(settings).toMatchObject({ difficulty: 4, opponents: 6, humanPlayer: 1, nationalityId: 1, nation: 'Vikings', nationality: 'Viking' });
    expect(settings.leaderName).toBe(NATIONS[1]!.leader);
  });
});

describe('ekran gry', () => {
  function gameScreen() {
    const { ui, assets } = makeUi();
    const settings: NewGameSettings = {
      map: { kind: 'earth' }, difficulty: 0, opponents: 6, activeCivilizations: 0xff, humanPlayer: 1, nationalityId: 1,
      leaderName: 'Caesar', nation: 'Romans', nationality: 'Roman',
    };
    ui.gfx.patternAvailable = true;
    ui.gfx.loadPic(2, 0, 0, assets.pic('SP299.PIC'));
    const world = createWorld(assets, settings.map, 1);
    return { ui, assets, screen: new GameScreen(ui, assets, settings, world, { seed: 1 }) };
  }

  it('układ: pasek menu, minimapa z kolorami 1/2, panele z wzorem, mapa od (80, 8)', () => {
    const { ui, screen } = gameScreen();
    screen.drawVisibleMap(30, 15);
    screen.drawStatusPanel();
    const s = ui.gfx.screen;
    expect(s.getPixel(300, 3)).toBe(0); // pasek menu
    expect(s.getPixel(9, 2)).toBe(15); // biała pierwsza litera "GAME"
    expect([screen.viewX, screen.viewY]).toEqual([30, 15]);
    // minimapa: ocean = 1, ląd = 2 (pas lądu y 21–29, x 11–59)
    const mini = (x: number, y: number) => s.getPixel(x - screen.miniMapX, y - screen.miniMapY + 8);
    expect(mini(30, 25)).toBe(2);
    expect(mini(30, 10)).toBe(1);
    // prostokąt widoku na minimapie zawsze w (31, 26)
    expect(s.getPixel(31, 26)).toBe(15);
    expect(s.getPixel(40, 98)).not.toBe(0); // panel jednostki wypełniony wzorem
    expect(s.getPixel(MAP_VIEW.x + 5, MAP_VIEW.y + 5)).not.toBe(0); // pole mapy
    expect(screen.cellAt(80, 8)).toEqual({ x: 30, y: 15 });
    expect(screen.cellAt(79, 8)).toBeNull();
  });

  it('kliknięcie w mapę centruje widok, w minimapę przesuwa go; zawijanie w poziomie', async () => {
    const { screen } = gameScreen();
    screen.drawVisibleMap(0, 10);
    await screen.handle(click(80 + 2 * 16, 8 + 8 * 16)); // pole (2, 18)
    expect([screen.viewX, screen.viewY]).toEqual([75, 12]);
    await screen.handle(click(40, 30));
    expect(screen.viewX).toBe((40 - 7 + 75 - 32 + 80) % 80);
    await screen.handle(key('ArrowUp'));
    await screen.handle(key('ArrowUp'));
    expect(screen.viewY).toBeGreaterThanOrEqual(0);
  });

  it('menu GAME z paska: Preferences przełącza ustawienie, QUIT kończy ekran', async () => {
    const { ui, screen } = gameScreen();
    screen.drawVisibleMap(30, 15);
    const before = ui.gfx.screen.pixels.slice();
    const flags = screen.settingFlags;
    // GAME → Preferences → Sound (5. opcja) → Esc
    expect(await drive(ui, [key('p'), key('Enter'), key('s'), key('Enter'), key('Escape')], () => screen.handle(click(10, 3)))).toBeNull();
    expect(screen.settingFlags ^ flags).toBe(1 << 4);
    expect(Buffer.from(ui.gfx.screen.pixels).equals(Buffer.from(before))).toBe(true); // ekran przywrócony
    expect(await drive(ui, [key('q'), key('Enter')], () => screen.handle(key('g', { alt: true })))).toBe('quit');
  });

  it('pozostałe menu otwierają się z paska i z Alt+litera', async () => {
    const { ui, screen } = gameScreen();
    screen.drawVisibleMap(30, 15);
    expect(await drive(ui, [key('Escape')], () => screen.handle(click(130, 3)))).toBeNull(); // ADVISORS
    // CIVILOPEDIA → „Not available yet.”
    expect(await drive(ui, [key('Enter'), key('Enter')], () => screen.handle(key('c', { alt: true })))).toBeNull();
    expect(ui.input.size).toBe(0);
  });
});

describe('bez plików opcjonalnych', () => {
  it('nowa gra przechodzi bez KING.TXT (bez tekstu powitalnego)', async () => {
    const { ui, assets } = makeUi(syntheticFiles(false));
    const events = [key('Enter'), key('Enter'), key('Enter'), key('Enter')];
    const s = await drive(ui, events, () => initNewGameData(ui, assets, { kind: 'random', options: { landMass: 1, temperature: 1, climate: 1, age: 1 } }));
    expect(s.nationalityId).toBe(1);
  });
});
