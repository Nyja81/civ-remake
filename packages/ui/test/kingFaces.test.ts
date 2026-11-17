/**
 * Animacja twarzy władcy i doradców (F6_0000_1b33 / F6_0000_2362) na syntetycznych plikach i syntetycznym obrazie
 * programu — liczby w tablicach są wymyślone na potrzeby testu, nie pochodzą z CIV.EXE.
 */
import { describe, expect, it } from 'vitest';
import { advanceToHuman, Government, mscRandom, newGame, nextUnit } from '@civ-remake/engine';
import type { UiEvent } from '../src/input';
import { findKingAnimationData, type KingAnimationData } from '../src/exeData';
import { GameScreen } from '../src/screens/gameScreen';
import {
  advisorsFile, drawThroneRoom, kingFaceFrame, kingFaceState, leaderFile, leaderFontId, throneRoomFile,
} from '../src/screens/king';
import { drive, encodePic, makeUi, sectionFile, stripes, syntheticFiles, testPalette6 } from './synthetic';

const key = (k: string): UiEvent => ({ type: 'key', key: k });
const DS = 0x10000;
const SEGMENT = 0x8000;

/** Obraz programu z kotwicą, tablicami sekwencji i segmentem punktów zaczepienia (wartości testowe). */
function syntheticImage(): Uint8Array {
  const image = new Uint8Array(0x20000);
  const put16 = (p: number, v: number) => {
    image[p] = v & 0xff;
    image[p + 1] = (v >> 8) & 0xff;
  };
  const putBytes = (p: number, values: number[]) => values.forEach((v, i) => (image[p + i] = v & 0xff));
  //               0  1   2  3  4  5  6  7  8   9 10  11 12 13 14 15  16  17
  putBytes(DS + 0x3a94, [1, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 6, 7, 7, 7, 7, 7, 7]); // oczy
  putBytes(DS + 0x3aa6, [0, 0, 0, 1, 1, 1, 2, 2, 2, 2, 3, 3, 4, 4, 5, 5, 5, 5]); // usta
  putBytes(DS + 0x3ab8, [0, 1, -1, 1, 1, 1, 0, 1, 1, -1, 1, -2, 1, 1, 0, 1, -1, -3]); // sterowanie
  const anchor = 'govt0a.pic\0king00.pic\0king\0govt0a.pic\0';
  putBytes(DS + 0x3ad8, Array.from(anchor, (c) => c.charCodeAt(0)));
  [20, 200, 5, 250].forEach((x, i) => put16(DS + 0x3afe + 2 * i, x));
  put16(DS + 0x640a, SEGMENT / 16);
  for (let n = 0; n < 16; n++) image[SEGMENT + n] = n % 3; // czcionki
  for (let l = 0; l < 14; l++) {
    put16(SEGMENT + 0x10 + 4 * l, 240); // x punktu twarzy w KING??.PIC
    put16(SEGMENT + 0x12 + 4 * l, 20); // x punktu w klatce
    put16(SEGMENT + 0x48 + 4 * l, 100); // y punktu twarzy
    put16(SEGMENT + 0x4a + 4 * l, 6); // y punktu w klatce
  }
  for (let i = 0; i < 28; i++) {
    put16(SEGMENT + 0x80 + 4 * i, i % 2 ? 170 : 40);
    put16(SEGMENT + 0xf0 + 4 * i, i % 2 ? 10 : 120);
  }
  return image;
}

function setup() {
  const files = syntheticFiles();
  const pal = { first: 0, rgb6: testPalette6() };
  const { ui, assets } = makeUi(files);
  const data = findKingAnimationData(syntheticImage())!;
  (assets as unknown as { kingAnimation: () => KingAnimationData }).kingAnimation = () => data;
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
  return { ui, assets, state, h, ai, data };
}

describe('dane animacji z obrazu programu', () => {
  it('kotwica w segmencie danych, adres segmentu twarzy z DS:0x640a', () => {
    const data = findKingAnimationData(syntheticImage())!;
    expect(data.control[17]).toBe(-3);
    expect(data.eyes.slice(0, 3)).toEqual([1, 2, 3]);
    expect(data.advisorX).toEqual([20, 200, 5, 250]);
    expect(data.word(0x10)).toBe(240);
    expect(leaderFontId(2, data)).toBe(3); // 2 + 8 = 10 → 3
    expect(leaderFontId(1, data)).toBe(9);
    expect(leaderFontId(1, null)).toBe(1);
  });

  it('zły wskaźnik segmentu: segment odnajdywany po kształcie danych', () => {
    const image = syntheticImage();
    image[DS + 0x640a] = 0x12;
    expect(findKingAnimationData(image)!.word(0x48)).toBe(100);
  });

  it('bez kotwicy — brak danych', () => {
    expect(findKingAnimationData(new Uint8Array(0x20000))).toBeNull();
  });
});

describe('animacja twarzy (F6_0000_1b33 / F6_0000_2362)', () => {
  it('sala tronowa z doradcami; mówienie losuje usta wspólnym generatorem gry', () => {
    const { ui, assets, state, ai } = setup();
    drawThroneRoom(ui, assets, state, ai);
    const s = ui.gfx.screen;
    expect(s.getPixel(100, 10)).toBe(70); // portret
    expect(s.getPixel(30, 60)).toBe(50); // ciało doradcy w (20, 34)
    const g = kingFaceState(ui) as { mood: number; talk: number; stern: number };
    g.mood = 1;
    g.talk = 12;
    // twarz: x = 90 + 240 − 180 − 20 = 130, y = 100 − 64 − 6 = 30; usta w (130, 48), oczy w (130, 28)
    const shadow = mscRandom(0);
    shadow.state = state.rng.state;
    kingFaceFrame(ui, assets, state);
    shadow.next(2); // losowanie jest, ale przy talk = 12 (12 & 3 = 0) usta to zawsze klatka 8
    expect(s.getPixel(131, 49)).toBe(120 + 8);
    expect(state.rng.state).toBe(shadow.state); // jedno losowanie w klatce mówienia
    expect(g.talk).toBe(11);
    kingFaceFrame(ui, assets, state);
    const second = shadow.next(2) !== 0 ? 9 : 0;
    expect(s.getPixel(131, 49)).toBe(120 + second);
  });

  it('gniewna mina: sekwencja 12–14, surowe usta w DS:0x3ab4/0x3ab7, głowy doradców z miną 1', () => {
    const { ui, assets, state, ai, data } = setup();
    drawThroneRoom(ui, assets, state, ai);
    const g = kingFaceState(ui) as { mood: number; talk: number; stern: number; seq: number };
    g.mood = 2;
    g.talk = 0;
    g.stern = 1;
    for (let i = 0; i < 6; i++) kingFaceFrame(ui, assets, state);
    expect(g.seq).toBeGreaterThanOrEqual(14);
    // głowa doradcy 0 (ciało (0 + gracz) & 3) z miną 1 (kolor 61) narysowana na ekranie 0
    const pixels = new Set<number>();
    for (let y = 0; y < 128; y++) for (let x = 0; x < 320; x++) pixels.add(ui.gfx.screen.getPixel(x, y));
    expect(pixels.has(61)).toBe(true);
    expect(data.mouth[14]).toBe(5); // tablica z obrazu programu nie jest zmieniana — zmienia się kopia
  });

  it('rozmowa *HELPME animuje twarz w oknie i zużywa generator gry; po rozmowie Var_3936 = −1', async () => {
    const run = async (animated: boolean) => {
      const { ui, state, assets, h, ai } = setup();
      if (!animated) (assets as unknown as { kingAnimation: () => null }).kingAnimation = () => null;
      const screen = new GameScreen(ui, assets, state);
      screen.activeUnit = nextUnit(state, h);
      screen.redrawAll();
      (assets as unknown as { files: Record<string, Uint8Array> }).files['KING.TXT'] =
        sectionFile(['*HELPME', 'We need $BUCKS gold', 'against the $THEM.', '_No.', '_Yes.', '*END']);
      const enemy = [1, 2, 3, 4, 5, 6, 7].find((p) => p !== h && p !== ai && state.activeCivs & (1 << p))!;
      state.players[h]!.gold = 300;
      state.events.push({ kind: 'aiRequest', request: 'helpme', player: ai, enemy, amount: 100 });
      await drive(ui, [key('Enter'), key('Enter'), key('ArrowDown'), key('Enter')], () => screen.processEvents());
      expect(state.players[h]!.gold).toBe(200);
      return { rng: state.rng.state, face: kingFaceState(ui), font: leaderFontId(state.players[ai]!.nation) };
    };
    const still = await run(false);
    const animated = await run(true);
    expect(still.face).toBeNull();
    expect(animated.face!.mood).toBe(-1);
    // klatki w oknach powitania i prośby losowały wspólnym generatorem
    expect(animated.rng).not.toBe(still.rng);
  });
});
