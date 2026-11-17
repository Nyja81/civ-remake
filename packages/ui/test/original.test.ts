/** Interfejs na plikach oryginału — uruchamia się tylko z ustawionym CIV1_DIR (pliki nie trafiają do repozytorium). */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GameAssets, UI_OPTIONAL_FILES, UI_REQUIRED_FILES } from '../src/assets';
import { measureText, parseFonts } from '../src/font';
import { Gfx } from '../src/gfx';
import { layoutMenuBox, showMenuBox } from '../src/menuBox';
import { MAIN_MENU_TEXT } from '../src/screens/mainMenu';
import { drawThroneRoom, kingFaceFrame, kingFaceState, leaderFontId } from '../src/screens/king';
import { advanceToHuman, Government, newGame } from '@civ-remake/engine';
import { textSection } from '../src/text';
import { Ui } from '../src/ui';
import { drive, TestHost } from './synthetic';

const dir = process.env.CIV1_DIR ?? '';

function readGameFiles(): Record<string, Uint8Array> {
  const present = new Map(readdirSync(dir).map((n) => [n.toUpperCase(), n]));
  const files: Record<string, Uint8Array> = {};
  for (const name of [...UI_REQUIRED_FILES, ...UI_OPTIONAL_FILES]) {
    const real = present.get(name);
    if (real) files[name] = new Uint8Array(readFileSync(join(dir, real)));
  }
  return files;
}

describe.skipIf(!dir || !existsSync(dir))('interfejs na plikach oryginału', () => {
  it('FONTS.CV: 9 czcionek ze znakami ASCII, napisy mają sensowną szerokość', () => {
    const fonts = parseFonts(new Uint8Array(readFileSync(join(dir, 'FONTS.CV'))));
    expect(fonts.length).toBe(9);
    for (const f of fonts) {
      expect(f.firstChar).toBeLessThanOrEqual(0x41);
      expect(f.height).toBeGreaterThan(4);
      const w = measureText(f, 'Start a New Game').width;
      expect(w).toBeGreaterThan(40);
      expect(w).toBeLessThan(320); // największa czcionka oryginału daje ok. 215 px
    }
  });

  it('menu główne mieści się na ekranie i daje się wybrać', async () => {
    const assets = new GameAssets(readGameFiles());
    const ui = new Ui(new Gfx(assets.fonts), new TestHost());
    const layout = layoutMenuBox(ui, MAIN_MENU_TEXT, 100, 140);
    expect(layout.optionLines).toEqual([0, 1, 2, 3, 4]);
    expect(140 + layout.windowHeight).toBeLessThanOrEqual(200);
    const r = await drive(ui, [{ type: 'key', key: 'ArrowDown' }, { type: 'key', key: 'Enter' }], () => showMenuBox(ui, MAIN_MENU_TEXT, 100, 140, { clearInput: true }));
    expect(r.index).toBe(1);
  });

  it('KING.TXT ma sekcję *INIT', () => {
    const king = join(dir, readdirSync(dir).find((n) => n.toUpperCase() === 'KING.TXT') ?? 'KING.TXT');
    if (!existsSync(king)) return;
    expect(textSection(new Uint8Array(readFileSync(king)), '*INIT')).toContain('$');
  });

  it('CIV.EXE: dane animacji twarzy władców; sala tronowa z doradcami i klatki twarzy na plikach gry', () => {
    const assets = new GameAssets(readGameFiles());
    const data = assets.kingAnimation();
    expect(data).not.toBeNull();
    expect(data!.control[17]).toBe(-3);
    expect(data!.advisorX.every((x) => x >= 0 && x < 320)).toBe(true);
    for (let n = 0; n < 16; n++) expect([3, 8, 9]).toContain(leaderFontId(n, data));
    const ui = new Ui(new Gfx(assets.fonts), new TestHost());
    const state = newGame({ seed: 5, difficulty: 1, civilizations: 7, nation: 1 });
    advanceToHuman(state);
    for (const p of [1, 2, 3, 4, 5, 6, 7].filter((q) => q !== state.humanPlayer && state.activeCivs & (1 << q))) {
      state.players[p]!.ranking = 7;
      for (const government of [Government.Despotism, Government.Monarchy, Government.Communism, Government.Democracy]) {
        state.players[p]!.government = government;
        drawThroneRoom(ui, assets, state, p);
        const g = kingFaceState(ui) as { mood: number; talk: number };
        for (const mood of [0, 1, 2]) {
          g.mood = mood;
          g.talk = 4;
          for (let i = 0; i < 30; i++) kingFaceFrame(ui, assets, state);
        }
      }
    }
  });
});
