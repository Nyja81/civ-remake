/** Raporty doradców i świata: otwarcie z menu ADVISORS/WORLD i klawiszami F1–F10 na syntetycznych plikach gry. */
import { describe, expect, it } from 'vitest';
import { advanceToHuman, Diplomacy, foundCity, newGame, nextUnit, playerHistoryReport } from '@civ-remake/engine';
import type { UiEvent } from '../src/input';
import { GameScreen } from '../src/screens/gameScreen';
import { cityNameOf, governmentPicName, trimToWidth } from '../src/screens/advisors';
import { drive, makeUi } from './synthetic';

const key = (k: string, extra: Partial<{ alt: boolean; shift: boolean }> = {}): UiEvent => ({ type: 'key', key: k, ...extra });
const enter = () => key('Enter');

function setup(options: ConstructorParameters<typeof GameScreen>[3] = {}) {
  const { ui, assets, host } = makeUi();
  ui.gfx.patternAvailable = true;
  ui.gfx.loadPic(2, 0, 0, assets.pic('SP299.PIC'));
  const state = newGame({ seed: 77, difficulty: 1, civilizations: 5, nation: 1 });
  advanceToHuman(state);
  state.events.length = 0;
  const h = state.humanPlayer;
  const u = state.players[h]!.units.find((x) => x.type === 0)!;
  const city = foundCity(state, h, u.x, u.y, 3);
  state.wonderCity[2] = city;
  state.events.length = 0;
  const screen = new GameScreen(ui, assets, state, options);
  screen.activeUnit = nextUnit(state, h);
  screen.redrawAll();
  // zapis klatek: kolor prawego dolnego piksela (tło raportu) przy każdym present()
  const corners: number[] = [];
  host.present = () => {
    host.frames++;
    corners.push(ui.gfx.screen.getPixel(319, 199));
  };
  return { ui, state, screen, corners, city };
}

const REPORTS: readonly [string, string, number, number, number][] = [
  // nazwa, menu (Alt+litera), opcja, liczba ekranów, kolor tła pierwszego ekranu
  ['City Status', 'a', 0, 1, 8],
  ['Military Advisor (status + straty)', 'a', 1, 2, 1],
  ['Intelligence Advisor', 'a', 2, 1, 1],
  ['Attitude Advisor', 'a', 3, 1, 9],
  ['Trade Advisor', 'a', 4, 1, 2],
  ['Science Advisor', 'a', 5, 1, 1],
  ['Wonders of the World', 'w', 0, 1, 3],
  ['Top 5 Cities', 'w', 1, 1, 3],
  ['Civilization Score', 'w', 2, 1, 3],
  ['World Map', 'w', 3, 1, 0],
  ['Demographics', 'w', 4, 1, 1],
];

describe('menu ADVISORS i WORLD', () => {
  for (const [name, menu, option, screens, fill] of REPORTS) {
    it(`${name}: raport w kolorach oryginału, po klawiszu powrót do mapy`, async () => {
      const { ui, screen, corners } = setup();
      const before = ui.gfx.screen.pixels.slice();
      const events = [...Array.from({ length: option }, () => key('ArrowDown')), enter(), ...Array.from({ length: screens }, enter)];
      await drive(ui, events, () => screen.handle(key(menu, { alt: true })));
      expect(corners).toContain(fill);
      expect(ui.gfx.screen.pixels).toEqual(before);
    });
  }

  it('Military: drugi ekran to straty (tło 4)', async () => {
    const { ui, screen, corners } = setup();
    await drive(ui, [key('ArrowDown'), enter(), enter(), enter()], () => screen.handle(key('a', { alt: true })));
    expect(corners).toContain(4);
  });
});

describe('klawisze funkcyjne', () => {
  const F: readonly [string, number, number][] = [
    ['F1', 1, 8], ['F2', 2, 1], ['F3', 1, 1], ['F4', 1, 9], ['F5', 1, 2], ['F6', 1, 1],
    ['F7', 1, 3], ['F8', 1, 3], ['F9', 1, 3], ['F10', 1, 0],
  ];
  for (const [k, screens, fill] of F) {
    it(`${k} otwiera raport`, async () => {
      const { ui, screen, corners } = setup();
      await drive(ui, Array.from({ length: screens }, enter), () => screen.handle(key(k)));
      expect(corners).toContain(fill);
    });
  }

  it('tryb debugowania: F9 — statystyka kontynentów (tło 4), F8 — wykres potęgi (tło 8)', async () => {
    const { ui, screen, corners } = setup({ revealAll: true });
    await drive(ui, [enter()], () => screen.handle(key('F9')));
    expect(corners).toContain(4);
    await drive(ui, [enter()], () => screen.handle(key('F8')));
    expect(corners).toContain(8);
  });
});

describe('wywiad', () => {
  it('cyfra cywilizacji z ambasadą otwiera szczegóły, potem powrót do listy i zamknięcie', async () => {
    const { ui, state, screen } = setup();
    const h = state.humanPlayer;
    const active = [1, 2, 3, 4, 5, 6, 7].filter((i) => state.activeCivs & (1 << i));
    const other = active.find((i) => i !== h)!;
    state.players[h]!.diplomacy[other]! |= Diplomacy.Embassy;
    const digit = String(active.indexOf(other) + 1);
    // F3 → cyfra (szczegóły) → Enter (powrót do listy) → Enter (koniec)
    await drive(ui, [key(digit), enter(), enter()], () => screen.handle(key('F3')));
  });

  it('cyfra cywilizacji bez ambasady zamyka raport', async () => {
    const { ui, state, screen } = setup();
    const active = [1, 2, 3, 4, 5, 6, 7].filter((i) => state.activeCivs & (1 << i));
    const other = active.find((i) => i !== state.humanPlayer)!;
    await drive(ui, [key(String(active.indexOf(other) + 1))], () => screen.handle(key('F3')));
  });
});

describe('raport historyka', () => {
  it('zdarzenie historyReport rysuje ranking (tło 3) i czeka na klawisz', async () => {
    const { ui, state, screen, corners } = setup();
    state.events.push({ kind: 'historyReport', report: playerHistoryReport(state) });
    await drive(ui, [enter()], () => screen.processEvents());
    expect(corners).toContain(3);
  });

  it('napisy jak w CIV.EXE: „… completes his epic history:”, „The X Civilizations in the World”, „Civilization of the …”', async () => {
    const { ui, state, screen } = setup();
    const texts: string[] = [];
    const g = ui.gfx;
    const centered = g.drawCenteredString.bind(g);
    const plain = g.drawString.bind(g);
    g.drawCenteredString = (t: string, ...rest: Parameters<typeof centered> extends [string, ...infer R] ? R : never) => {
      texts.push(t);
      return centered(t, ...rest);
    };
    g.drawString = (t: string, ...rest: Parameters<typeof plain> extends [string, ...infer R] ? R : never) => {
      texts.push(t);
      return plain(t, ...rest);
    };
    const report = playerHistoryReport(state);
    state.events.push({ kind: 'historyReport', report });
    await drive(ui, [enter()], () => screen.processEvents());
    expect(texts.some((t) => /^(Herodotus|Pliny|Toynbee|Gibbon) completes his epic history:$/.test(t))).toBe(true);
    expect(texts.some((t) => /^'The [A-Z ]+ Civilizations in the World'$/.test(t))).toBe(true);
    const first = report.entries.find((e) => e.shown)!;
    expect(texts).toContain(`${first.rank + 1}. The ${['Glorious', 'Great', 'Fine', 'Mediocre', 'Puny', 'Pathetic', 'Hopeless'][first.rank]} Civilization of the ${state.players[first.player]!.nationPlural}.`);
  });
});

describe('pomocnicze', () => {
  it('TrimStringToWidth skraca z kropką; GetCityName dla -1 to NONE; obraz ustroju', () => {
    const { ui, state, city } = setup();
    const trimmed = trimToWidth(ui.gfx, 'Very long city name', 30);
    expect(ui.gfx.stringWidth(trimmed)).toBeLessThanOrEqual(30);
    expect(trimToWidth(ui.gfx, 'Babylonopolis', 40)).toMatch(/\.$/);
    expect(cityNameOf(state, -1)).toBe('NONE');
    expect(cityNameOf(state, city)).toBe(state.cityNames[state.cities[city]!.nameId]);
    expect(governmentPicName(state)).toBe('GOVT0A.PIC');
    state.players[state.humanPlayer]!.government = 3;
    expect(governmentPicName(state)).toBe('GOVT3A.PIC');
  });
});
