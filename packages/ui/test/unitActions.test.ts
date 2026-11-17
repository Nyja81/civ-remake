/** Okna karawany i dyplomaty na ekranie gry (screens/unitActions.ts) — na syntetycznych plikach gry. */
import { describe, expect, it } from 'vitest';
import {
  cellIndex, createUnit, deleteUnit, Diplomacy, foundCity, Government, newGame, NO_UNIT, Tech, Terrain,
  unitsAt, type GameState,
} from '@civ-remake/engine';
import type { UiEvent } from '../src/input';
import { GameScreen } from '../src/screens/gameScreen';
import { drive, makeUi } from './synthetic';

const key = (k: string): UiEvent => ({ type: 'key', key: k });

/** Płaski ląd bez jednostek; człowiek i komputer w kontakcie, bez technologii i złota. */
function setup() {
  const { ui, assets } = makeUi();
  ui.gfx.patternAvailable = true;
  ui.gfx.loadPic(2, 0, 0, assets.pic('SP299.PIC'));
  const s = newGame({ seed: 3, difficulty: 1, civilizations: 4, nation: 1 });
  const h = s.humanPlayer;
  const ai = h === 1 ? 2 : 1;
  s.players.forEach((pl, p) => pl.units.forEach((u, i) => { if (u.type !== NO_UNIT) deleteUnit(s, p, i); }));
  for (let y = 0; y < 50; y++) {
    for (let x = 0; x < 80; x++) {
      const i = cellIndex(x, y);
      const land = y >= 5 && y < 45;
      s.map.terrain[i] = land ? Terrain.Grassland : Terrain.Water;
      s.map.group[i] = land ? 1 : 2;
      s.map.improvements[i] = 0;
      s.map.visibleImprovements[i] = 0;
      s.map.occupant[i] = 0;
      s.map.landOwner[i] = 0;
      s.map.explored[i] = 0xffff;
    }
  }
  s.turn = 30;
  s.currentPlayer = h;
  for (const p of [h, ai]) {
    const pl = s.players[p]!;
    pl.techs.fill(false);
    pl.diplomacy.fill(0);
    pl.gold = 0;
    pl.government = Government.Despotism;
  }
  s.players[h]!.diplomacy[ai] = Diplomacy.Contact;
  s.players[ai]!.diplomacy[h] = Diplomacy.Contact;
  const capital = foundCity(s, ai, 20, 20, 6); // stolica komputera (pałac)
  const city = foundCity(s, ai, 30, 20, 4);
  const screen = new GameScreen(ui, assets, s, {});
  return { ui, s, h, ai, capital, city, screen };
}

/** Jednostka człowieka z pełnym ruchem, aktywna na ekranie. */
function activeUnit(screen: GameScreen, s: GameState, type: number, x: number, y: number): number {
  const id = createUnit(s, s.humanPlayer, type, x, y);
  s.players[s.humanPlayer]!.units[id]!.movesLeft = 3;
  s.events.length = 0;
  (screen as unknown as { eventsSeen: number }).eventsSeen = 0;
  screen.activeUnit = id;
  screen.drawVisibleMap(x - 7, y - 6);
  return id;
}

describe('dyplomata człowieka: menu „… diplomat arrives in …”', () => {
  it('Establish Embassy: ambasada, raport wywiadu zamykany klawiszem, dyplomata znika', async () => {
    const { ui, s, h, ai, screen } = setup();
    const d = activeUnit(screen, s, 26, 29, 20);
    await drive(ui, [key('Enter'), key('Enter')], () => screen.handle(key('ArrowRight')));
    expect(s.players[h]!.diplomacy[ai]! & Diplomacy.Embassy).toBeTruthy();
    expect(s.players[h]!.units[d]!.type).toBe(NO_UNIT);
  });

  it('Steal Technology: technologia i komunikat „… steal …”', async () => {
    const { ui, s, h, ai, screen } = setup();
    s.players[ai]!.techs[Tech.Pottery] = true;
    activeUnit(screen, s, 26, 29, 20);
    await drive(ui, [key('ArrowDown'), key('ArrowDown'), key('Enter'), key('Enter')], () => screen.handle(key('ArrowRight')));
    expect(s.players[h]!.techs[Tech.Pottery]).toBe(true);
  });

  it('Investigate City: podgląd obcego miasta zamykany klawiszem', async () => {
    const { ui, s, h, screen } = setup();
    const d = activeUnit(screen, s, 26, 29, 20);
    await drive(ui, [key('ArrowDown'), key('Enter'), key('Escape')], () => screen.handle(key('ArrowRight')));
    expect(s.players[h]!.units[d]!.type).toBe(NO_UNIT);
  });

  it('Incite a Revolt: okno „Dissidents in …”, miasto przechodzi do człowieka', async () => {
    const { ui, s, h, city, screen } = setup();
    s.players[h]!.gold = 3000;
    activeUnit(screen, s, 26, 29, 20);
    // menu → opcja 4; okno buntu → „Incite revolt”; komunikat buntu; zdobycie miasta pokazuje panorama (CityView, animacje włączone)
    await drive(ui, [key('ArrowDown'), key('ArrowDown'), key('ArrowDown'), key('ArrowDown'), key('Enter'), key('ArrowDown'), key('Enter'),
      key('Enter')], () => screen.handle(key('ArrowRight')));
    expect(s.cities[city]!.owner).toBe(h);
  });

  it('Esc: dyplomata zostaje przed miastem', async () => {
    const { ui, s, h, screen } = setup();
    const d = activeUnit(screen, s, 26, 29, 20);
    await drive(ui, [key('Escape')], () => screen.handle(key('ArrowRight')));
    expect(s.players[h]!.units[d]!.type).toBe(26);
    expect(s.players[h]!.units[d]!.x).toBe(29);
  });
});

describe('karawana i przekupienie', () => {
  it('karawana w mieście budującym cud: „Help build WONDER.” dodaje 50 tarcz', async () => {
    const { ui, s, h, screen } = setup();
    const home = foundCity(s, h, 40, 30, 3);
    const target = foundCity(s, h, 52, 30, 3);
    s.cities[target]!.production = -27;
    const c = activeUnit(screen, s, 27, 51, 30);
    s.players[h]!.units[c]!.homeCity = home;
    await drive(ui, [key('ArrowDown'), key('ArrowDown'), key('Enter')], () => screen.handle(key('ArrowRight')));
    expect(s.cities[target]!.shields).toBe(50);
    expect(s.players[h]!.units[c]!.type).toBe(NO_UNIT);
  });

  it('przekupienie: „will desert for …” → Pay; jednostka przechodzi do człowieka', async () => {
    const { ui, s, h, ai, screen } = setup();
    s.players[h]!.gold = 5000;
    const t = createUnit(s, ai, 1, 31, 30);
    activeUnit(screen, s, 26, 30, 30);
    await drive(ui, [key('ArrowDown'), key('Enter')], () => screen.handle(key('ArrowRight')));
    expect(s.players[ai]!.units[t]!.type).toBe(NO_UNIT);
    expect(unitsAt(s, h, 31, 30)).toHaveLength(1);
  });
});
