/** Rozmowy z władcami na syntetycznych plikach: z KING.TXT i portretem oraz bez nich. */
import { describe, expect, it } from 'vitest';
import { advanceToHuman, Diplomacy, Government, newGame, nextUnit, type GameState } from '@civ-remake/engine';
import type { UiEvent } from '../src/input';
import { GameScreen } from '../src/screens/gameScreen';
import { drawThroneRoom, leaderFile, throneRoomFile } from '../src/screens/king';
import { drive, encodePal, encodePic, makeUi, sectionFile, stripes, syntheticFiles, testPalette6 } from './synthetic';

const key = (k: string): UiEvent => ({ type: 'key', key: k });

function setup(files = syntheticFiles()) {
  const { ui, assets } = makeUi(files);
  ui.gfx.patternAvailable = true;
  ui.gfx.loadPic(2, 0, 0, assets.pic('SP299.PIC'));
  const state = newGame({ seed: 77, difficulty: 1, civilizations: 5, nation: 1 });
  advanceToHuman(state);
  state.events.length = 0;
  const h = state.humanPlayer;
  const ai = [1, 2, 3, 4, 5, 6, 7].find((p) => p !== h && state.activeCivs & (1 << p))!;
  for (const p of [h, ai]) {
    const pl = state.players[p]!;
    pl.techs.fill(false);
    pl.diplomacy.fill(0);
    pl.ranking = 0;
    pl.government = Government.Despotism;
    for (const c of pl.continents) Object.assign(c, { cityCount: 0, attack: 0, defense: 0 });
  }
  const screen = new GameScreen(ui, assets, state);
  screen.activeUnit = nextUnit(state, h);
  screen.redrawAll();
  return { ui, assets, state, screen, h, ai };
}

/** Słabszy komputer: obawa przed człowiekiem → propozycja pokoju. */
function weakAi(state: GameState, h: number, ai: number): void {
  const A = state.players[ai]!;
  const H = state.players[h]!;
  Object.assign(A.continents[1]!, { cityCount: 2, attack: 1, defense: 1 });
  Object.assign(H.continents[1]!, { cityCount: 1, attack: 5, defense: 10 });
  A.cityCount = 2;
  A.militaryPower = 5;
  H.militaryPower = 50;
}

describe('rozmowa z władcą (MeetWithKing)', () => {
  it('kontakt jednostek bez KING.TXT i portretów: poseł, powitanie, pokój, traktat, *THREAT', async () => {
    const files = syntheticFiles();
    delete files['KING.TXT'];
    const { ui, state, screen, h, ai } = setup(files);
    weakAi(state, h, ai);
    const u = state.players[h]!.units[screen.activeUnit]!;
    state.events.push({ kind: 'meetLeader', player: ai, x: u.x, y: u.y, first: true, previousCountdown: -1 });
    // Yes (poseł) → powitanie → *PEACE: druga opcja „Yes” → *TREATY → przyjaźń → *THREAT: pożegnanie
    await drive(ui, [key('Enter'), key('Enter'), key('ArrowDown'), key('Enter'), key('Enter'), key('Enter'), key('Enter')],
      () => screen.processEvents());
    expect(state.players[ai]!.diplomacy[h]! & Diplomacy.Peace).not.toBe(0);
    expect(state.players[h]!.diplomacy[ai]! & Diplomacy.Peace).not.toBe(0);
    expect(ui.gfx.fontId).toBe(1);
  });

  it('*HELPME z KING.TXT, salą tronową i portretem: zgoda przenosi złoto', async () => {
    const files = syntheticFiles();
    const pal = { first: 0, rgb6: testPalette6() };
    files['KING.TXT'] = sectionFile(['*HELPME', 'We need $BUCKS gold', 'against the $THEM.', '_No.', '_Yes.', '*END']);
    const { ui, assets, state, screen, h, ai } = setup(files);
    const nation = state.players[ai]!.nation;
    files[throneRoomFile(Government.Despotism, false)] = encodePic(320, 200, stripes((_x, y) => (y < 128 ? 40 : 7)), pal);
    files[leaderFile(nation, 'PIC')] = encodePic(320, 200, stripes((x, y) => (x >= 181 && y >= 67 ? 70 : 0)), pal);
    files[leaderFile(nation, 'PAL')] = encodePal(0, Array.from({ length: 256 * 3 }, (_, i) => (i === 64 * 3 ? 63 : 1)));
    // portret: wycinek (181, 67) w (90, 0), kolory 64–143 z palety władcy
    drawThroneRoom(ui, assets, state, ai);
    expect(ui.gfx.screen.getPixel(100, 10)).toBe(70);
    expect(ui.gfx.screen.getPixel(10, 10)).toBe(40);
    expect(ui.gfx.palette.rgb[64 * 3]).toBe(255);

    const enemy = [1, 2, 3, 4, 5, 6, 7].find((p) => p !== h && p !== ai && state.activeCivs & (1 << p))!;
    state.players[h]!.gold = 300;
    state.events.push({ kind: 'aiRequest', request: 'helpme', player: ai, enemy, amount: 100 });
    await drive(ui, [key('Enter'), key('Enter'), key('ArrowDown'), key('Enter')], () => screen.processEvents());
    expect(state.players[h]!.gold).toBe(200);
    expect(state.players[ai]!.diplomacy[h]! & Diplomacy.Peace).not.toBe(0);
    expect(state.players[enemy]!.diplomacy[h]! & Diplomacy.Vendetta).not.toBe(0);
  });

  it('odprawiony poseł: bez rozmowy i bez zmian', async () => {
    const { ui, state, screen, h, ai } = setup();
    weakAi(state, h, ai);
    state.events.push({ kind: 'meetLeader', player: ai, x: 10, y: 10, first: true, previousCountdown: -1 });
    await drive(ui, [key('ArrowDown'), key('Enter')], () => screen.processEvents());
    expect(state.players[ai]!.diplomacy[h]! & Diplomacy.Peace).toBe(0);
  });
});
