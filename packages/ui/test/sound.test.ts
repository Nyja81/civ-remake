/** Dźwięk w interfejsie: PlayTune w miejscach oryginału (gospodarz testowy zapisuje wywołania). */
import { describe, expect, it } from 'vitest';
import { advanceToHuman, Government, NATIONS, newGame, nextUnit } from '@civ-remake/engine';
import type { UiEvent } from '../src/input';
import { GameScreen } from '../src/screens/gameScreen';
import { showMainGameIntro, showWorldHistory } from '../src/screens/intro';
import { showLogoAndMainGameMenu } from '../src/screens/mainMenu';
import { showInitText } from '../src/screens/newGame';
import { combatTune, TUNE } from '../src/sound';
import { drive, encodePal, encodePic, makeUi, stripes, syntheticFiles, testPalette6 } from './synthetic';

const key = (k: string, extra: Partial<{ alt: boolean }> = {}): UiEvent => ({ type: 'key', key: k, ...extra });

function gameSetup() {
  const { ui, assets, host } = makeUi();
  ui.gfx.patternAvailable = true;
  ui.gfx.loadPic(2, 0, 0, assets.pic('SP299.PIC'));
  const state = newGame({ seed: 77, difficulty: 1, civilizations: 5, nation: 1 });
  advanceToHuman(state);
  state.events.length = 0;
  const screen = new GameScreen(ui, assets, state);
  screen.activeUnit = nextUnit(state, state.humanPlayer);
  screen.redrawAll();
  return { ui, assets, host, state, screen, h: state.humanPlayer };
}

describe('dźwięk walki (AttackUnit)', () => {
  const state = newGame({ seed: 5, difficulty: 1, civilizations: 3, nation: 1 });
  const h = state.humanPlayer;
  const ai = h === 1 ? 2 : 1;
  const ev = (attacker: number, defender: number, attackerType: number, defenderType: number, attackerWon: boolean) =>
    ({ kind: 'combat', attacker, defender, attackerType, defenderType, attackerWon });
  it('wygrana człowieka 38/40, przegrana 39/41, bombowiec 43; „ciężka” — silna zwycięska jednostka', () => {
    expect(combatTune(state, ev(h, ai, 3, 2, true))).toBe(TUNE.combatWon); // Legion (atak 4) wygrywa
    expect(combatTune(state, ev(h, ai, 11, 2, true))).toBe(TUNE.combatWonHeavy); // Armor
    expect(combatTune(state, ev(ai, h, 11, 2, false))).toBe(TUNE.combatWon); // obrońca człowieka (Phalanx) wygrywa z Armor
    expect(combatTune(state, ev(ai, h, 3, 5, false))).toBe(TUNE.combatWonHeavy); // Riflemen (obrona 5) wygrywa
    expect(combatTune(state, ev(h, ai, 3, 2, false))).toBe(TUNE.combatLost);
    expect(combatTune(state, ev(ai, h, 11, 2, true))).toBe(TUNE.combatLostHeavy);
    expect(combatTune(state, ev(ai, h, 15, 2, true))).toBe(TUNE.bomber);
  });
});

describe('PlayTune na ekranach', () => {
  it('intro: muzyka napisów (3) i włączony Sound', async () => {
    const { ui, assets, host } = makeUi();
    ui.soundSettings = { sound: false };
    await showMainGameIntro(ui, assets);
    expect(ui.soundSettings.sound).toBe(true);
    expect(host.tunes).toEqual([[TUNE.intro, 0]]);
  });

  it('menu główne: wybór kończy muzykę intro (1) na granicy frazy', async () => {
    const { ui, assets, host } = makeUi();
    host.counter = 5269 + 288 * 3; // dokładnie granica frazy — bez czekania
    await drive(ui, [key('e'), key('Enter')], () => showLogoAndMainGameMenu(ui, assets));
    expect(host.tunes).toEqual([[TUNE.stop, 0]]);
  });

  it('granica frazy: czekanie do przejścia licznika przez 5269 + k·288', async () => {
    const { ui, host } = makeUi();
    host.counter = 5269 + 288 + 100;
    let done = false;
    const wait = ui.waitTunePhrase(5269, 288).then(() => (done = true));
    await new Promise((r) => setTimeout(r, 20));
    expect(done).toBe(false);
    host.counter = 5269 + 288 * 2 + 3; // licznik przeskoczył granicę w jednym buforze dźwięku
    await wait;
    expect(done).toBe(true);
    // przed 5269 taktami — od razu; bez dźwięku — od razu
    host.counter = 4000;
    await ui.waitTunePhrase(5269, 288);
    host.counter = undefined;
    await ui.waitTunePhrase(5269, 288);
  });

  it('historia świata: PlayTune(1), PlayTune(4) przy pierwszym wierszu, PlayTune(1) na końcu', async () => {
    const pic = (fn: (x: number, y: number) => number) => encodePic(320, 200, stripes(fn), { first: 0, rgb6: testPalette6() });
    const files = {
      ...syntheticFiles(), 'STORY.TXT': new TextEncoder().encode('In the beginning\n1\nthe Earth was\n'),
      'BIRTH1.PIC': pic(() => 90), 'BIRTH1.PAL': encodePal(0, testPalette6()),
    };
    const { ui, assets, host } = makeUi(files);
    await showWorldHistory(ui, assets, { speed: 1000 });
    expect(host.tunes).toEqual([[TUNE.stop, 0], [TUNE.worldHistory, 0], [TUNE.stop, 0]]);
  });

  it('tekst *INIT: długi hymn z parametrem 3', async () => {
    const { ui, assets, host } = makeUi();
    await drive(ui, [key('Enter')], () =>
      showInitText(ui, assets, { nation: 'Romans', leaderName: 'Caesar', difficulty: 0 }, [], NATIONS[1]!.longTune));
    expect(host.tunes).toEqual([[NATIONS[1]!.longTune, 3]]);
  });

  it('bez Sound — żadnych wywołań', async () => {
    const { ui, assets, host } = makeUi();
    await showMainGameIntro(ui, assets);
    ui.soundSettings.sound = false;
    ui.playTune(TUNE.celebration);
    expect(host.tunes).toEqual([[TUNE.intro, 0]]);
  });
});

describe('PlayTune przy zdarzeniach silnika', () => {
  it('`tune` przed komunikatem, `tuneAfter` po nim; zdarzenie „tune”', async () => {
    const { ui, host, state, screen } = gameSetup();
    state.events.push({ kind: 'news', text: 'Famine!\n', tune: TUNE.disaster, tuneAfter: TUNE.stop });
    state.events.push({ kind: 'tune', tune: TUNE.stop });
    await drive(ui, [key('Enter')], () => screen.processEvents());
    expect(host.tunes).toEqual([[TUNE.disaster, 0], [TUNE.stop, 0], [TUNE.stop, 0]]);
  });

  it('walka widoczna dla człowieka — dźwięk; niewidoczna — cisza; Sound wyłączony — cisza', async () => {
    const { host, state, screen, h } = gameSetup();
    const ai = [1, 2, 3, 4, 5, 6, 7].find((p) => p !== h && state.activeCivs & (1 << p))!;
    state.events.push({ kind: 'combat', player: h, attacker: h, defender: ai, attackerType: 3, defenderType: 2, attackerWon: true, seen: true });
    state.events.push({ kind: 'combat', player: ai, attacker: ai, defender: 0, attackerType: 3, defenderType: 2, attackerWon: true, seen: false });
    await screen.processEvents();
    expect(host.tunes).toEqual([[TUNE.combatWon, 0]]);
    state.settings.sound = false;
    state.events.push({ kind: 'combat', player: h, attacker: h, defender: ai, attackerType: 3, defenderType: 2, attackerWon: false, seen: true });
    await screen.processEvents();
    expect(host.tunes).toHaveLength(1);
  });

  it('Alt+V: przełącza Sound (ustawienie gry) z komunikatem', async () => {
    const { ui, state, screen } = gameSetup();
    expect(ui.soundSettings).toBe(state.settings);
    expect(state.settings.sound).toBe(true);
    await drive(ui, [key('Enter')], () => screen.handle(key('v', { alt: true })));
    expect(state.settings.sound).toBe(false);
  });

  it('rozmowa z władcą: krótki hymn przy pośle, długi w sali tronowej, 33 przy groźbie, 1 na końcu', async () => {
    const { ui, host, state, screen, h } = gameSetup();
    const ai = [1, 2, 3, 4, 5, 6, 7].find((p) => p !== h && state.activeCivs & (1 << p))!;
    for (const p of [h, ai]) {
      const pl = state.players[p]!;
      pl.techs.fill(false);
      pl.diplomacy.fill(0);
      pl.government = Government.Despotism;
    }
    const nation = NATIONS[state.players[ai]!.nation]!;
    const u = state.players[h]!.units[screen.activeUnit]!;
    state.events.push({ kind: 'meetLeader', player: ai, x: u.x, y: u.y, first: true, previousCountdown: -1 });
    // Enter na każde pytanie, aż rozmowa się skończy
    const run = screen.processEvents();
    for (let i = 0; i < 200 && host.tunes.at(-1)?.[0] !== TUNE.stop; i++) {
      await new Promise((r) => setTimeout(r, 0));
      if (ui.input.waiting && ui.input.size === 0) ui.input.push(key('Enter'));
    }
    await run;
    expect(host.tunes[0]).toEqual([nation.shortTune, 3]);
    expect(host.tunes[1]).toEqual([nation.longTune, 3]);
    expect(host.tunes.at(-1)).toEqual([TUNE.stop, 0]);
    expect(host.tunes.slice(2, -1).every(([t]) => t === TUNE.threat)).toBe(true);
  });
});
