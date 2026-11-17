/**
 * Animacja twarzy władcy i doradców (F6_0000_1b33 / F6_0000_2362) na syntetycznych plikach; tablice sekwencji i punktów
 * zaczepienia — wygenerowane z CIV.EXE (`data/screenTables.ts`).
 */
import { describe, expect, it } from 'vitest';
import { advanceToHuman, aiRequestMeeting, Government, mscRandom, newGame, nextUnit, runMeeting } from '@civ-remake/engine';
import type { UiEvent } from '../src/input';
import { KING_FACE_POINTS, LEADER_FONTS, NATION_LEADER_IDS } from '../src/data/screenTables';
import { GameScreen } from '../src/screens/gameScreen';
import {
  advisorsFile, drawThroneRoom, kingFaceFrame, kingFaceState, leaderFile, leaderFontId, throneRoomFile,
} from '../src/screens/king';
import { drive, encodePic, makeUi, sectionFile, stripes, syntheticFiles, testPalette6 } from './synthetic';

const key = (k: string): UiEvent => ({ type: 'key', key: k });

function setup() {
  const files = syntheticFiles();
  const pal = { first: 0, rgb6: testPalette6() };
  const { ui, assets } = makeUi(files);
  ui.gfx.patternAvailable = true;
  ui.gfx.loadPic(2, 0, 0, assets.pic('SP299.PIC'));
  const state = newGame({ seed: 77, difficulty: 1, civilizations: 5, nation: 1 });
  advanceToHuman(state);
  state.events.length = 0;
  const h = state.humanPlayer;
  const ai = [1, 2, 3, 4, 5, 6, 7].find((p) => p !== h && state.activeCivs & (1 << p))!;
  const pl = state.players[ai]!;
  pl.government = Government.Despotism;
  pl.ranking = 7; // (7 + 1) / 2 = 4 doradców
  // sala: kolor 40; KING??.PIC: klatki oczu kolorem 100 + numer, ust 120 + numer, twarz 70; GOVT: ciała 50, głowy 60 + mina
  files[throneRoomFile(Government.Despotism, false)] = encodePic(320, 200, stripes(() => 40), pal);
  const frameAt = (x: number, y: number): [number, number] | null => {
    // odwrotność siatki klatek: k = kolumna + 5·wiersz, i = k z pominięciem 8, 9, 13, 14
    const k = Math.trunc((x - 1) / 60) + 5 * Math.trunc(y / 50);
    const i = k < 8 ? k : k < 10 ? -1 : k < 13 ? k - 2 : k < 15 ? -1 : k - 4;
    return i < 0 || i > 13 ? null : [i, y % 50 < 21 ? 0 : 1];
  };
  files[leaderFile(pl.nation, 'PIC')] = encodePic(320, 200, stripes((x, y) => {
    if (x >= 181 && y >= 67) return 70;
    const f = frameAt(x, y);
    return f ? (f[1] === 0 ? 100 : 120) + f[0] : 0;
  }), pal);
  files[advisorsFile(Government.Despotism, false)] = encodePic(320, 200, stripes((x, y) => {
    if (y >= 101) return 50;
    if (x >= 161) return 60 + Math.min(2, Math.trunc((x - 161) / 29));
    return 0;
  }), pal);
  // punkt zaczepienia klatek twarzy tego władcy (F6_0000_2362)
  const [fx, fx1, fy, fy1] = KING_FACE_POINTS[NATION_LEADER_IDS[pl.nation]!]!;
  const face = { x: 90 + fx - 180 - fx1, y: fy - 64 - fy1 };
  return { ui, assets, state, h, ai, face };
}

describe('czcionka władcy (F6_0000_16cd)', () => {
  it('bajt z segmentu 0x36fa + 8, wynik 10 → 3', () => {
    for (let n = 0; n < 16; n++) {
      const raw = LEADER_FONTS[n]! + 8;
      expect(leaderFontId(n)).toBe(raw === 10 ? 3 : raw);
    }
  });
});

describe('animacja twarzy (F6_0000_1b33 / F6_0000_2362)', () => {
  it('sala tronowa z doradcami; mówienie losuje usta wspólnym generatorem gry', () => {
    const { ui, assets, state, ai, face } = setup();
    drawThroneRoom(ui, assets, state, ai);
    const s = ui.gfx.screen;
    expect(s.getPixel(100, 10)).toBe(70); // portret
    expect(s.getPixel(10, 60)).toBe(50); // ciało doradcy w (1, 34)
    const g = kingFaceState(ui) as { mood: number; talk: number; stern: number };
    g.mood = 1;
    g.talk = 12;
    // usta w (x, y + 18), oczy w (x, y − 2)
    const shadow = mscRandom(0);
    shadow.state = state.rng.state;
    kingFaceFrame(ui, state);
    shadow.next(2); // losowanie jest, ale przy talk = 12 (12 & 3 = 0) usta to zawsze klatka 8
    expect(s.getPixel(face.x + 1, face.y + 19)).toBe(120 + 8);
    expect(state.rng.state).toBe(shadow.state); // jedno losowanie w klatce mówienia
    expect(g.talk).toBe(11);
    kingFaceFrame(ui, state);
    const second = shadow.next(2) !== 0 ? 9 : 0;
    expect(s.getPixel(face.x + 1, face.y + 19)).toBe(120 + second);
  });

  it('gniewna mina: sekwencja 12–14, surowe usta w DS:0x3ab4/0x3ab7, głowy doradców z miną 1', () => {
    const { ui, assets, state, ai } = setup();
    drawThroneRoom(ui, assets, state, ai);
    const g = kingFaceState(ui) as { mood: number; talk: number; stern: number; seq: number };
    g.mood = 2;
    g.talk = 0;
    g.stern = 1;
    for (let i = 0; i < 6; i++) kingFaceFrame(ui, state);
    expect(g.seq).toBeGreaterThanOrEqual(14);
    // głowa doradcy 0 (ciało (0 + gracz) & 3) z miną 1 (kolor 61) narysowana na ekranie 0
    const pixels = new Set<number>();
    for (let y = 0; y < 128; y++) for (let x = 0; x < 320; x++) pixels.add(ui.gfx.screen.getPixel(x, y));
    expect(pixels.has(61)).toBe(true);
  });

  it('rozmowa *HELPME animuje twarz w oknie i zużywa generator gry ponad samą rozmowę; po rozmowie Var_3936 = −1', async () => {
    const { ui, state, assets, h, ai } = setup();
    const enemy = [1, 2, 3, 4, 5, 6, 7].find((p) => p !== h && p !== ai && state.activeCivs & (1 << p))!;
    state.players[h]!.gold = 300;
    // ta sama rozmowa w silniku, bez interfejsu: Yes (poseł), powitanie, Yes (prośba)
    const shadow = newGame({ seed: 77, difficulty: 1, civilizations: 5, nation: 1 });
    shadow.rng.state = state.rng.state;
    shadow.players[h]!.gold = 300;
    runMeeting(aiRequestMeeting(shadow, 'helpme', ai, enemy, 100), (st) => (st.kind === 'speech' && st.key === '*HELPME' ? 1 : 0));
    const screen = new GameScreen(ui, assets, state);
    screen.activeUnit = nextUnit(state, h);
    screen.redrawAll();
    (assets as unknown as { files: Record<string, Uint8Array> }).files['KING.TXT'] =
      sectionFile(['*HELPME', 'We need $BUCKS gold', 'against the $THEM.', '_No.', '_Yes.', '*END']);
    state.events.push({ kind: 'aiRequest', request: 'helpme', player: ai, enemy, amount: 100 });
    await drive(ui, [key('Enter'), key('Enter'), key('ArrowDown'), key('Enter')], () => screen.processEvents());
    expect(state.players[h]!.gold).toBe(200);
    expect(kingFaceState(ui)!.mood).toBe(-1);
    // klatki w oknach powitania i prośby losowały wspólnym generatorem
    expect(state.rng.state).not.toBe(shadow.rng.state);
  });
});
