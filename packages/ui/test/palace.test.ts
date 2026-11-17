/** Pałac, panorama miasta i historia świata na syntetycznych plikach (i bez nich). */
import { describe, expect, it } from 'vitest';
import {
  addBuilding, advanceToHuman, BuildingId, newGame, palaceOf, unitOrder, upgradePalace, WonderId, type GameState,
} from '@civ-remake/engine';
import type { UiEvent } from '../src/input';
import { Palette } from '../src/palette';
import { PaletteCycles } from '../src/paletteCycle';
import { showCityView, civilDisorderAnimation, invadersAnimation, loveOurLeaderAnimation, hasCityViewGraphics } from '../src/screens/cityView';
import { drawCityWindow, showCityWindow } from '../src/screens/cityWindow';
import { GameScreen } from '../src/screens/gameScreen';
import { showWorldHistory } from '../src/screens/intro';
import { drawMiniPalace, drawPalace, palaceSectionFromInput, showPalaceUpgrade } from '../src/screens/palace';
import { prepareSprites } from '@civ-remake/gfx';
import { drive, encodePal, encodePic, makeUi, stripes, syntheticFiles, testPalette6 } from './synthetic';

const key = (k: string): UiEvent => ({ type: 'key', key: k });
const click = (x: number, y: number): UiEvent => ({ type: 'mousedown', x, y, button: 'left' });
const pal = { first: 0, rgb6: testPalette6() };
const pic = (fn: (x: number, y: number) => number, withPal = false) => encodePic(320, 200, stripes(fn), withPal ? pal : undefined);

/** Pliki pałacu: tło 3, części CASTLE{L}: ćwiartki stylów 40 + L (styl 0), 50 + L (styl 1), 60 + L (styl 2), wieże 70 + L. */
function palaceFiles(): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = { 'CBACK.PIC': pic(() => 3, true), 'CBACKS1.PIC': encodePic(320, 65, stripes(() => 4, 320, 65)) };
  for (let l = 0; l < 5; l++) files[`CASTLE${l}.PIC`] = pic((x, y) => (y < 100 ? (x < 160 ? 40 : 50) : x < 160 ? 60 : 70) + l);
  for (let i = 0; i < 6; i++) files[`CBRUSH${i}.PIC`] = encodePic(136, 40, stripes((x) => (x < 4 ? 0 : 20 + i), 136, 40));
  return files;
}

/** Pliki panoramy: wzgórze 5, domy 30, budynki 31/32 (bez/z Combustion), cuda 33/34, mieszkańcy 35, animacje 36. */
function cityViewFiles(): Record<string, Uint8Array> {
  return {
    'HILL.PIC': pic(() => 5, true), 'HILL.PAL': encodePal(64, testPalette6().slice(0, 16 * 3)),
    'CITYPIX1.PIC': pic(() => 30), 'CITYPIX2.PIC': pic(() => 31), 'CITYPIX3.PIC': pic(() => 32),
    'WONDERS.PIC': pic(() => 33), 'WONDERS2.PIC': pic(() => 34), 'POP.PIC': pic(() => 35),
    'INVADER3.PIC': pic(() => 36), 'INVADER2.PIC': pic(() => 36), 'INVADERS.PIC': pic(() => 36),
    'RIOT.PIC': pic(() => 37), 'RIOT2.PIC': pic(() => 37), 'LOVE1.PIC': pic(() => 38), 'LOVE2.PIC': pic(() => 38),
  };
}

function setup(extra: Record<string, Uint8Array> = {}): { ui: ReturnType<typeof makeUi>['ui']; assets: ReturnType<typeof makeUi>['assets']; state: GameState; city: number } {
  const { ui, assets } = makeUi({ ...syntheticFiles(), ...extra });
  ui.gfx.patternAvailable = true;
  ui.gfx.loadPic(2, 0, 0, assets.pic('SP299.PIC'));
  const state = newGame({ seed: 51, difficulty: 1, civilizations: 5, nation: 1 });
  advanceToHuman(state);
  unitOrder(state, state.humanPlayer, 0, 'build');
  state.events.length = 0;
  return { ui, assets, state, city: state.cities.findIndex((c) => c.status !== -1 && c.owner === state.humanPlayer) };
}

describe('pałac (F17_0000_0000, F17_0000_07ec)', () => {
  it('wybór części: klawisze 1–7 i a–c, kliknięcie wg kolumn (48 px) i dolnego pasa (107 px)', () => {
    expect(palaceSectionFromInput(key('4'))).toBe(4);
    expect(palaceSectionFromInput(key('a'))).toBe(9);
    expect(palaceSectionFromInput(key('c'))).toBe(11);
    expect(palaceSectionFromInput(key('A'))).toBe(-1); // GetNavigationKey − 'X' < 1
    expect(palaceSectionFromInput(key('8'))).toBe(-1);
    expect(palaceSectionFromInput(click(0, 100))).toBe(1);
    expect(palaceSectionFromInput(click(160, 100))).toBe(4);
    expect(palaceSectionFromInput(click(319, 100))).toBe(7);
    expect(palaceSectionFromInput(click(150, 160))).toBe(10);
  });

  it('bez plików pałacu: komunikat, wybór części 4 i stylu 2, nowy poziom w silniku', async () => {
    const { ui, assets, state } = setup();
    await drive(ui, [key('Enter'), key('4'), key('2'), key('x')], () => showPalaceUpgrade(ui, assets, state));
    expect(palaceOf(state).levels[4]).toBe(1);
    expect(palaceOf(state).types[4]).toBe(1);
  });

  it('pusty wybór przesuwa się ku środkowi; ogród (litera) bez wyboru stylu', async () => {
    const { ui, assets, state } = setup(palaceFiles());
    await drive(ui, [key('Enter'), key('9'), key('1'), key('3'), key('x')], () => showPalaceUpgrade(ui, assets, state));
    // '9' odrzucone, '1' → część 3 (pierwsza istniejąca od lewej), styl 3
    expect(palaceOf(state).levels[3]).toBe(1);
    expect(palaceOf(state).types[3]).toBe(2);
    await drive(ui, [key('Enter'), key('b'), key('x')], () => showPalaceUpgrade(ui, assets, state));
    expect(palaceOf(state).levels[10]).toBe(1);
  });

  it('rysunek: tło CBACK.PIC, środek z ćwiartki stylu, dziedziniec i ogrody', async () => {
    const { ui, assets, state } = setup(palaceFiles());
    const p = palaceOf(state);
    drawPalace(ui.gfx, assets, p);
    const s1 = ui.gfx.screens[1];
    expect(s1.getPixel(5, 5)).toBe(3);
    expect(s1.getPixel(160, 100)).toBe(40); // środek stylu 0, poziom 0
    upgradePalace(state, 4, 1);
    upgradePalace(state, 10);
    upgradePalace(state, 9);
    drawPalace(ui.gfx, assets, p);
    expect(s1.getPixel(160, 100)).toBe(51); // styl 1, poziom 1
    expect(s1.getPixel(300, 150)).toBe(4); // dziedziniec CBACKS1.PIC od y = 135
    expect(s1.getPixel(10, 110)).toBe(20); // lewy ogród CBRUSH0.PIC w (0, 105)
    // z plikami — wynik rozbudowy przez okno
    await drive(ui, [key('Enter'), key('5'), key('1'), key('x')], () => showPalaceUpgrade(ui, assets, state));
    expect(p.levels[5]).toBe(1);
    expect(ui.gfx.screen.getPixel(5, 5)).toBe(3);
  });

  it('mini-pałac w panelu i widok pałacu po kliknięciu w panel', async () => {
    const { ui, assets, state } = setup(palaceFiles());
    const screen = new GameScreen(ui, assets, state);
    screen.redrawAll();
    expect(ui.gfx.screen.getPixel(8 + 7 * 4 + 3, 60)).toBe(11); // tło panelu
    upgradePalace(state, 4, 1);
    screen.reportTaxAndPopulation();
    // SP257.PIC (160 + 7·2 + 3, 16 + 3): ((177 >> 4) + (19 >> 4)) % 15 + 1
    expect(ui.gfx.screen.getPixel(8 + 7 * 4 + 3, 60)).toBe(13);
    expect(ui.gfx.screen.getPixel(10, 71)).toBe(2); // linia podstawy
    await drive(ui, [key('x')], () => screen.handle(click(20, 65)));
  });

  it('zdarzenie `palace` z silnika otwiera okno rozbudowy', async () => {
    const { ui, assets, state } = setup();
    const screen = new GameScreen(ui, assets, state);
    state.events.push({ kind: 'palace', player: state.humanPlayer, buildCount: 1 });
    await drive(ui, [key('Enter'), key('3'), key('1'), key('x')], () => screen.processEvents());
    expect(palaceOf(state).levels[3]).toBe(1);
  });

  it('mini-pałac komputera w raporcie historyka (rysunek bez błędów)', () => {
    const { ui, assets, state } = setup();
    const ai = state.humanPlayer === 1 ? 2 : 1;
    state.players[ai]!.cityCount = 1;
    drawMiniPalace(ui.gfx, assets, state, ai, 30, 128, 40);
    expect(ui.gfx.screen.getPixel(130, 53)).toBe(2);
  });
});

describe('panorama miasta (F19_0000_0000)', () => {
  it('bez plików: uproszczona (czarne tło z nazwą), czeka na klawisz, przywraca paletę', async () => {
    const { ui, assets, state, city } = setup();
    expect(hasCityViewGraphics(assets)).toBe(false);
    const palette = new Palette();
    palette.setColor(1, 1, 2, 3);
    await drive(ui, [key('x')], () => showCityView(ui, assets, state, city, -1, null, { palette }));
    expect(ui.gfx.palette.rgb[3]).toBe(1);
    expect(ui.gfx.screen.getPixel(160, 100)).toBe(0);
  });

  it('tło do animacji (−2): wzgórze, domy, budynki, cud, komunikat w oknie; bez czekania', async () => {
    const { ui, assets, state, city } = setup(cityViewFiles());
    const c = state.cities[city]!;
    c.size = 8;
    addBuilding(c, BuildingId.Temple);
    addBuilding(c, BuildingId.CityWalls);
    state.wonderCity[WonderId.Oracle] = city;
    state.wonderCity[WonderId.Pyramids] = city;
    await showCityView(ui, assets, state, city, -2, 'Civil Disorder in\nRome!\n');
    const colors = new Set(ui.gfx.screen.pixels);
    expect(colors.has(5)).toBe(true); // HILL.PIC
    expect(colors.has(30)).toBe(true); // domy
    expect(colors.has(31)).toBe(true); // budynki (bez Combustion), mury
    expect(colors.has(33)).toBe(true); // Oracle z WONDERS.PIC
    expect(colors.has(34)).toBe(true); // Piramidy w tle z WONDERS2.PIC
    expect(ui.gfx.screen.getPixel(78, 20)).toBe(0); // ramka okna komunikatu w (80, 8)
    expect(ui.gfx.screen.getPixel(84, 12)).not.toBe(5);
    await invadersAnimation(ui, assets, state, state.humanPlayer);
    expect(ui.gfx.palette.rgb[253 * 3]).toBe(12); // kolor 253 = (3, 3, 3) w skali VGA
    await civilDisorderAnimation(ui, assets, state);
    await loveOurLeaderAnimation(ui, assets, state);
  });

  it('VIEW w oknie miasta: panorama z mieszkańcami, potem okno wraca do INFO', async () => {
    const { ui, assets, state, city } = setup(cityViewFiles());
    const sprites = prepareSprites({ ter: assets.pic('TER257.PIC'), sp: assets.pic('SP257.PIC'), sp299: assets.pic('SP299.PIC') });
    const ctx = { ui, assets, state, sprites, text: () => undefined };
    const rng = state.rng.state;
    // klawisz v → panorama (czeka), klawisz → okno, Esc zamyka
    await drive(ui, [key('v'), key('x'), key('Escape')], () => showCityWindow(ctx, city));
    expect(state.rng.state).not.toBe(rng); // panorama ustawia ziarno generatora gry (srand z nazwy miasta)
    drawCityWindow(ctx, city, { tab: 0, page: 0 });
    expect(ui.gfx.screen.getPixel(97, 108)).toBe(15);
  });

  it('ukończony budynek z animacjami: panorama zamiast komunikatu, potem okno miasta', async () => {
    const { ui, assets, state, city } = setup(cityViewFiles());
    addBuilding(state.cities[city]!, BuildingId.Barracks);
    const screen = new GameScreen(ui, assets, state);
    screen.redrawAll();
    state.events.push({ kind: 'built', player: state.humanPlayer, city, item: BuildingId.Barracks, showCity: true, text: 'Rome builds\nBarracks.\n' });
    await drive(ui, [key('x'), key('Escape')], () => screen.processEvents());
  });
});

describe('cykle palety i historia świata', () => {
  it('PaletteCycles: obrót zakresu co speed + 1 jednostek, zatrzymanie przywraca kolory', () => {
    const { ui } = makeUi();
    const p = ui.gfx.palette;
    for (let i = 0; i < 3; i++) p.setColor(10 + i, i, i, i);
    const cycles = new PaletteCycles(ui);
    cycles.add(1, 1, 10, 12);
    cycles.start(1);
    expect(cycles.tick()).toBe(false);
    expect(cycles.tick()).toBe(true);
    expect([p.rgb[30], p.rgb[33], p.rgb[36]]).toEqual([2, 0, 1]);
    cycles.stop(1);
    expect([p.rgb[30], p.rgb[33], p.rgb[36]]).toEqual([0, 1, 2]);
  });

  it('bez STORY.TXT historia nic nie robi', async () => {
    const { ui, assets, host } = makeUi();
    const frames = host.frames;
    await showWorldHistory(ui, assets);
    expect(host.frames).toBe(frames);
  });

  it('STORY.TXT: wiersze w (160,160) czcionką 7, krótki wiersz zmienia obraz BIRTHn z paletą; klawisz przerywa', async () => {
    const story = new TextEncoder().encode('In the beginning\n\n1\nthe Earth was\n2\nwithout form.\n');
    const files = {
      ...syntheticFiles(), 'STORY.TXT': story,
      'BIRTH1.PIC': pic((x, y) => (y < 150 ? 90 : 0)), 'BIRTH1.PAL': encodePal(0, testPalette6()),
      'BIRTH2.PIC': pic((x, y) => (y < 150 ? 91 : 0)), 'BIRTH2.PAL': encodePal(0, testPalette6()),
    };
    const { ui, assets } = makeUi(files);
    await showWorldHistory(ui, assets, { speed: 1000 });
    expect(ui.gfx.screen.getPixel(160, 20)).toBe(91); // ostatni obraz: BIRTH2.PIC
    expect(ui.gfx.screens[2].getPixel(160, 20)).toBe(0); // ekran 2 wyczyszczony na końcu
    expect(ui.gfx.fontId).toBe(1);
    // klawisz w trakcie: koniec bez czekania na kolejne wiersze
    const r = makeUi(files);
    await drive(r.ui, [key('x')], () => showWorldHistory(r.ui, r.assets));
    expect(r.ui.input.size).toBe(0);
  });
});
