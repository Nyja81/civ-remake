/** Okna menu i pole tekstowe w stylu oryginału — sterowanie klawiaturą i myszą na danych syntetycznych. */
import { describe, expect, it } from 'vitest';
import { editBox, playerNameDialog } from '../src/editBox';
import type { UiEvent } from '../src/input';
import { layoutMenuBox, showMenuBox } from '../src/menuBox';
import { plainUi } from './synthetic';

const key = (k: string, extra: Partial<{ alt: boolean }> = {}): UiEvent => ({ type: 'key', key: k, ...extra });
const click = (x: number, y: number, button: 'left' | 'right' = 'left'): UiEvent => ({ type: 'mousedown', x, y, button });

const MENU = 'Title:\n Alpha\n Beta\n Gamma\n';

describe('okno menu (ShowMenuBox)', () => {
  it('układ: nagłówek nie jest opcją, okno z ramką ma marginesy 4 piksele', () => {
    const ui = plainUi();
    const l = layoutMenuBox(ui, MENU, 100, 50);
    expect(l.optionLines).toEqual([1, 2, 3]);
    expect(l.optionChars).toEqual(['a', 'b', 'g']);
    expect(l.lineHeight).toBe(8);
    expect([l.contentLeft, l.contentTop]).toEqual([104, 54]);
    expect(l.windowHeight).toBe(4 * 8 + 8);
    expect(l.windowWidth).toBe(l.contentWidth + 8);
  });

  it('strzałki i Enter wybierają opcję; podświetlenie zamienia tło 7 na 11', async () => {
    const ui = plainUi();
    for (const e of [key('ArrowDown'), key('ArrowDown'), key('ArrowUp')]) ui.input.push(e);
    const pending = showMenuBox(ui, MENU, 100, 50);
    await new Promise((r) => setTimeout(r, 0));
    const l = layoutMenuBox(ui, MENU, 100, 50);
    // po trzech klawiszach wybrana jest opcja 1 (Beta)
    const rowY = l.contentTop + 2 * l.lineHeight + 2;
    expect(ui.gfx.screen.getPixel(l.contentLeft + l.contentWidth - 1, rowY)).toBe(11);
    expect(ui.gfx.screen.getPixel(l.contentLeft + l.contentWidth - 1, l.contentTop + 3 * l.lineHeight + 2)).toBe(7);
    ui.input.push(key('Enter'));
    const r = await pending;
    expect(r.index).toBe(1);
    expect(r.mousePressed).toBe(false);
  });

  it('litera przeskakuje do opcji o tym skrócie, Esc zwraca -1', async () => {
    const ui = plainUi();
    ui.input.push(key('g'));
    ui.input.push(key('Enter'));
    expect((await showMenuBox(ui, MENU, 10, 10)).index).toBe(2);
    ui.input.push(key('Escape'));
    expect((await showMenuBox(ui, MENU, 10, 10, { defaultIndex: 2 })).index).toBe(-1);
  });

  it('nieaktywnej opcji nie da się zatwierdzić; zaznaczone dostają znak ^', async () => {
    const ui = plainUi();
    const l = layoutMenuBox(ui, MENU, 10, 10, { checked: 0b010 });
    expect(l.items[2]).toBe('^Beta');
    ui.input.push(key('ArrowDown'));
    ui.input.push(key('Enter')); // Beta wyłączona — nic się nie dzieje
    ui.input.push(key('ArrowDown'));
    ui.input.push(key(' '));
    expect((await showMenuBox(ui, MENU, 10, 10, { disabled: 0b010 })).index).toBe(2);
  });

  it('kliknięcie w opcję ją wybiera, kliknięcie poza oknem anuluje (z położeniem kliknięcia)', async () => {
    const ui = plainUi();
    const l = layoutMenuBox(ui, MENU, 100, 50);
    ui.input.push(click(l.contentLeft + 2, l.contentTop + 3 * l.lineHeight + 1));
    const r = await showMenuBox(ui, MENU, 100, 50);
    expect(r.index).toBe(2);
    ui.input.push(click(5, 190));
    const r2 = await showMenuBox(ui, MENU, 100, 50);
    expect(r2).toMatchObject({ index: -1, mousePressed: true, mouse: { x: 5, y: 190 } });
  });

  it('pomoc: prawy przycisk albo Alt+H przy menu z pomocą', async () => {
    const ui = plainUi();
    const l = layoutMenuBox(ui, MENU, 100, 50, { help: true });
    ui.input.push(click(l.contentLeft + 2, l.contentTop + 2 * l.lineHeight + 1, 'right'));
    expect(await showMenuBox(ui, MENU, 100, 50, { help: true })).toMatchObject({ index: 1, help: true });
    ui.input.push(key('h', { alt: true }));
    expect(await showMenuBox(ui, MENU, 100, 50, { help: true })).toMatchObject({ index: 0, help: true });
  });

  it('menu bez ramki bierze kolor tła z obrazu pod lewym górnym rogiem', async () => {
    const ui = plainUi();
    ui.gfx.fillRect(0, 0, 320, 200, 9);
    ui.input.push(key('Enter'));
    await showMenuBox(ui, MENU, 160, 35, { frame: false });
    const l = layoutMenuBox(ui, MENU, 160, 35, { frame: false });
    expect(ui.gfx.screen.getPixel(l.contentLeft + l.contentWidth - 1, l.contentTop + l.lineHeight + 2)).toBe(11);
    expect(ui.gfx.screen.getPixel(158, 35)).toBe(9); // bez ramki
  });

  it('za długie wiersze są skracane z dopiskiem "..."', () => {
    const ui = plainUi();
    const l = layoutMenuBox(ui, ` ${'x'.repeat(80)}\n Short\n`, 200, 10);
    expect(l.items[0]!.endsWith('...')).toBe(true);
    expect(l.contentWidth).toBeLessThanOrEqual(320 - 8 - 200);
  });
});

describe('pole tekstowe (EditBoxDialog)', () => {
  it('pierwszy wpisany znak zastępuje tekst; Backspace, strzałki, Enter', async () => {
    const ui = plainUi();
    for (const k of ['B', 'o', 'b', 'x', 'Backspace', 'ArrowLeft', 'ArrowRight', 'y', 'Enter']) ui.input.push(key(k));
    expect(await editBox(ui, 10, 10, 8, 'Caesar')).toEqual({ ok: true, text: 'Boby' });
  });

  it('Esc zwraca niezatwierdzony wynik; puste imię zostawia dotychczasowe', async () => {
    const ui = plainUi();
    ui.input.push(key('Escape'));
    expect((await editBox(ui, 10, 10, 8, 'Caesar')).ok).toBe(false);
    ui.input.push(key(' '));
    ui.input.push(key('Enter'));
    expect(await playerNameDialog(ui, 'Caesar')).toBe('Caesar');
    ui.input.push(key('Z'));
    ui.input.push(click(0, 0));
    expect(await playerNameDialog(ui, 'Caesar')).toBe('Z');
  });
});
