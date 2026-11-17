/** Interfejs na plikach oryginału — uruchamia się tylko z ustawionym CIV1_DIR (pliki nie trafiają do repozytorium). */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GameAssets, UI_OPTIONAL_FILES, UI_REQUIRED_FILES } from '../src/assets';
import { measureText, parseFonts } from '../src/font';
import { Gfx } from '../src/gfx';
import { layoutMenuBox, showMenuBox } from '../src/menuBox';
import { MAIN_MENU_TEXT } from '../src/screens/mainMenu';
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
});
