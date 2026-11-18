/** Okno miasta na syntetycznych plikach gry: rysunek i obsługa myszy i klawiatury. */
import { describe, expect, it } from 'vitest';
import {
  addBuilding, advanceToHuman, BuildingId, CITY_OFFSETS, CityStatus, cellIndex, createUnit, newGame, processCity, specialistAt,
  unitOrder, UnitStatus, type GameState,
} from '@civ-remake/engine';
import { prepareSprites } from '@civ-remake/gfx';
import type { UiEvent } from '../src/input';
import { drawCityWindow, showCityWindow, type CityWindowContext } from '../src/screens/cityWindow';
import { GameScreen } from '../src/screens/gameScreen';
import { drive, makeUi, sectionFile, syntheticFiles } from './synthetic';

const key = (k: string): UiEvent => ({ type: 'key', key: k });
const click = (x: number, y: number, button: 'left' | 'right' = 'left'): UiEvent => ({ type: 'mousedown', x, y, button });

function setup(seed = 51): { ctx: CityWindowContext; state: GameState; city: number } {
  const { ui, assets } = makeUi();
  ui.gfx.patternAvailable = true;
  ui.gfx.loadPic(2, 0, 0, assets.pic('SP299.PIC'));
  const state = newGame({ seed, difficulty: 1, civilizations: 5, nation: 1 });
  advanceToHuman(state);
  unitOrder(state, state.humanPlayer, 0, 'build');
  state.events.length = 0;
  const city = state.cities.findIndex((c) => c.status !== -1 && c.owner === state.humanPlayer);
  const c = state.cities[city]!;
  for (const [dx, dy] of CITY_OFFSETS) state.map.explored[cellIndex(c.x + dx, c.y + dy)]! |= 1 << c.owner;
  const sprites = prepareSprites({ ter: assets.pic('TER257.PIC'), sp: assets.pic('SP257.PIC'), sp299: assets.pic('SP299.PIC') });
  const text = () => undefined;
  return { ctx: { ui, assets, state, sprites, text }, state, city };
}

const pixel = (ctx: CityWindowContext, x: number, y: number) => ctx.ui.gfx.screen.getPixel(x, y);
/** Środek pola mapki miasta o numerze `tile` (pole miasta w (160,56)). */
const tileCenter = (tile: number) => ({ x: 160 + CITY_OFFSETS[tile]![0] * 16 + 8, y: 56 + CITY_OFFSETS[tile]![1] * 16 + 8 });

describe('okno miasta: rysunek', () => {
  it('panele, przyciski i zakładki w miejscach oryginału', () => {
    const { ctx, city } = setup();
    const layout = drawCityWindow(ctx, city, { tab: 0, page: 0 });
    expect(pixel(ctx, 1, 0)).toBe(0); // tło czarne
    expect(pixel(ctx, 2, 1)).toBe(1); // ramka tytułu (DrawRectangleAndFillWithPattern, kolor 1)
    expect(pixel(ctx, 230, 99)).toBe(1); // ramka produkcji
    expect(pixel(ctx, 286, 192)).toBe(12); // EXIT
    expect(pixel(ctx, 233, 192)).toBe(9); // RENAME
    expect(pixel(ctx, 4, 107)).toBe(1); // magazyn żywności
    expect(pixel(ctx, 4, 24)).toBe(1); // pasek „City Resources”
    expect(pixel(ctx, 97, 108)).toBe(15); // zakładka INFO zaznaczona: kolor 9 → 15 w (96,107) 32×7
    expect(pixel(ctx, 130, 110)).toBe(9); // HAPPY bez zaznaczenia
    expect(layout.report.workers + layout.report.specialists).toBe(ctx.state.cities[city]!.size);
    expect(layout.flashChange).toBe(false);
  });

  it('zakładki HAPPY i MAP rysują się bez błędów; MAP ma mapę świata w ramce koloru 9', () => {
    const { ctx, city } = setup();
    drawCityWindow(ctx, city, { tab: 1, page: 0 });
    drawCityWindow(ctx, city, { tab: 2, page: 0 });
    expect(pixel(ctx, 100, 117)).toBe(9);
  });

  it('budynek już stoi: przycisk CHANGE ma migać', () => {
    const { ctx, state, city } = setup();
    const c = state.cities[city]!;
    addBuilding(c, BuildingId.Barracks);
    c.production = -BuildingId.Barracks;
    expect(drawCityWindow(ctx, city, { tab: 0, page: 0 }).flashChange).toBe(true);
  });
});

describe('okno miasta: działania', () => {
  it('klik w pracujące pole robi artystę, klik w wolne — znów pracownika; Esc zamyka', async () => {
    const { ctx, state, city } = setup();
    processCity(state, city, 1);
    const c = state.cities[city]!;
    const worked = [...Array(20).keys()].find((i) => (c.workers >>> i) & 1)!;
    const free = [...Array(20).keys()].find((i) => !((c.workers >>> i) & 1))!;
    const a = tileCenter(worked);
    const b = tileCenter(free);
    const r = await drive(ctx.ui, [click(a.x, a.y), click(b.x, b.y), key('Escape')], () => showCityWindow(ctx, city));
    expect(r.redraw).toBe(false);
    expect((c.workers >>> free) & 1).toBe(1);
    expect((c.workers >>> worked) & 1).toBe(0);
  });

  it('zakup (B) za zgodą ustawia pełną liczbę tarcz i pobiera złoto', async () => {
    const { ctx, state, city } = setup();
    const c = state.cities[city]!;
    const p = state.players[c.owner]!;
    c.production = 1; // Militia
    c.shields = 5;
    p.gold = 500;
    await drive(ctx.ui, [key('b'), key('Enter'), key('Escape')], () => showCityWindow(ctx, city));
    expect(c.shields).toBe(10);
    expect(p.gold).toBeLessThan(500);
  });

  it('sprzedaż (S): wybór budynku, pytanie, „Yes.” — złoto i blokada do końca tury', async () => {
    const { ctx, state, city } = setup();
    const c = state.cities[city]!;
    const p = state.players[c.owner]!;
    addBuilding(c, BuildingId.Barracks);
    addBuilding(c, BuildingId.Granary);
    const gold = p.gold;
    // pałac, koszary, spichlerz: strzałka w dół wybiera koszary
    await drive(ctx.ui, [key('s'), key('ArrowDown'), key('Enter'), key('ArrowDown'), key('Enter'), key('Escape')], () => showCityWindow(ctx, city));
    expect(c.buildings & (1 << (BuildingId.Barracks - 1))).toBe(0);
    expect(p.gold).toBe(gold + 40);
    expect(c.status & CityStatus.BuildingSold).not.toBe(0);
  });

  it('klik w budynek po prawej (x ≥ 300) otwiera pytanie o sprzedaż', async () => {
    const { ctx, state, city } = setup();
    const c = state.cities[city]!;
    addBuilding(c, BuildingId.Granary);
    // wiersze co 6 px od y = 2: pałac (0), spichlerz (1); „No.” zostawia budynek
    await drive(ctx.ui, [click(305, 2 + 6 + 2), key('Enter'), key('Escape')], () => showCityWindow(ctx, city));
    expect(c.buildings & (1 << (BuildingId.Granary - 1))).not.toBe(0);
  });

  it('specjaliści w małym mieście: komunikat; zakładki klawiszami; A włącza AUTO', async () => {
    const { ctx, state, city } = setup();
    const c = state.cities[city]!;
    await drive(ctx.ui, [click(20, 10), key('Enter'), key('h'), key('m'), key('v'), key('i'), key('A'), key('Escape')], () => showCityWindow(ctx, city));
    expect(c.status & CityStatus.AutoProduction).not.toBe(0);
  });

  it('specjaliści od pięciu mieszkańców: klawisz 1 zmienia artystę w poborcę', async () => {
    const { ctx, state, city } = setup();
    const c = state.cities[city]!;
    c.size = 5;
    processCity(state, city, 1);
    const worked = [...Array(20).keys()].find((i) => (c.workers >>> i) & 1)!;
    const a = tileCenter(worked);
    await drive(ctx.ui, [click(a.x, a.y), key('1'), key('Escape')], () => showCityWindow(ctx, city));
    expect(specialistAt(state, city, 0)).toBe(1);
  });

  it('kursor pól (P): strzałki, Enter przełącza pole, Esc kończy; okno każe przerysować mapę', async () => {
    const { ctx, state, city } = setup();
    const c = state.cities[city]!;
    processCity(state, city, 1);
    const before = c.workers & 0xfffff;
    // kursor od pola miasta do pracującego pola: najpierw w poziomie, potem w pionie
    const [dx, dy] = CITY_OFFSETS[[...Array(20).keys()].find((i) => (c.workers >>> i) & 1)!]!;
    const moves = [...Array(Math.abs(dx)).fill(dx > 0 ? 'ArrowRight' : 'ArrowLeft'), ...Array(Math.abs(dy)).fill(dy > 0 ? 'ArrowDown' : 'ArrowUp')];
    const r = await drive(ctx.ui, [key('p'), ...moves.map(key), key('Enter'), key('Escape'), key('Escape')], () => showCityWindow(ctx, city));
    expect(r.redraw).toBe(true);
    expect(c.workers & 0xfffff).not.toBe(before);
  });

  it('jednostka w mieście: klik budzi czuwającą', async () => {
    const { ctx, state, city } = setup();
    const c = state.cities[city]!;
    const h = state.humanPlayer;
    const id = createUnit(state, h, 1, c.x, c.y);
    state.players[h]!.units[id]!.status |= UnitStatus.Sentry;
    const units = state.players[h]!.units.map((u, i) => ({ u, i })).filter(({ u }) => u.type !== -1 && u.x === c.x && u.y === c.y);
    const slot = units.findIndex(({ i }) => i === id);
    await drive(ctx.ui, [click(100 + slot * 16 + 4, 120), key('Escape')], () => showCityWindow(ctx, city));
    expect(state.players[h]!.units[id]!.status & UnitStatus.Sentry).toBe(0);
  });

  it('RENAME: nowa nazwa miasta', async () => {
    const { ctx, state, city } = setup();
    const c = state.cities[city]!;
    // pierwszy znak czyści pole (EditBoxDialog)
    await drive(ctx.ui, [click(240, 194), key('X'), key('Enter'), key('Escape')], () => showCityWindow(ctx, city));
    expect(state.cityNames[c.nameId]).toBe('X');
  });
});

describe('lista produkcji (SelectCityProduction)', () => {
  it('wiersze jak w CIV.EXE, domyślnie pierwsza pozycja; Instant Advice — okna doradców z PRODUCE.TXT przed listą', async () => {
    const files = { ...syntheticFiles(), 'PRODUCE.TXT': sectionFile(['*Phalanx', 'We should build $RPLC1^to defend.', '*Barracks', 'We should build a $RPLC1.']) };
    const { ui, assets } = makeUi(files);
    ui.gfx.patternAvailable = true;
    ui.gfx.loadPic(2, 0, 0, assets.pic('SP299.PIC'));
    const { ctx: base, state, city } = setup();
    const ctx = { ...base, ui, assets };
    state.settings.instantAdvice = true;
    const strings: string[] = [];
    const draw = ui.gfx.drawString.bind(ui.gfx);
    ui.gfx.drawString = (t, x, y, c) => {
      strings.push(t);
      draw(t, x, y, c);
    };
    // c → porady (bez czekania) → lista: Enter wybiera pierwszą pozycję (Settlers) → Esc zamyka okno
    await drive(ui, [key('c'), key('Enter'), key('Escape')], () => showCityWindow(ctx, city));
    expect(state.cities[city]!.production).toBe(0);
    expect(strings.some((t) => t.trim().startsWith('Settlers (') && t.includes(', ADM:0/1/1)'))).toBe(true);
    expect(strings).toContain('Military Advisor:');
    expect(strings).toContain('Domestic Advisor:');
  });
});

describe('okno miasta z ekranu gry', () => {
  it('komunikat o budowie w mieście człowieka (Var_b1e8) otwiera okno miasta; dwa komunikaty z jednego miasta — jedno okno', async () => {
    const { ctx, state, city } = setup();
    const screen = new GameScreen(ctx.ui, ctx.assets, state);
    screen.redrawAll();
    state.events.push({ kind: 'built', player: state.humanPlayer, city, item: 2, showCity: true, text: 'Rome builds\nBarracks.\n' });
    state.events.push({ kind: 'news', city, showCity: true, text: 'Civil Disorder in\nRome!\n' });
    // budowa przy włączonych animacjach: panorama (bez plików — wariant uproszczony, klawisz) → komunikat → okno miasta (Esc)
    await drive(ctx.ui, [key('Enter'), key('Enter'), key('Escape')], () => screen.processEvents());
  });
});
