/**
 * Okno menu / komunikatu oryginału — przeniesione z MenuBoxDialog.F0_2d05_0031_ShowMenuBox (OpenCivOne, MIT).
 *
 * Tekst: wiersze rozdzielone '\n'. Wiersze opcji zaczynają się spacją (albo '_'); wcześniejsze wiersze to nagłówek.
 * Pierwsza litera po spacji jest skrótem klawiszowym (przeskakuje do opcji, wybór Enterem lub spacją).
 * Wybraną opcję oryginał podświetla, zamieniając kolor tła na 11 (a kolor wzoru 22 lub 8 na 3).
 * Zaznaczona opcja (maska `checked`) dostaje na początku znak '^' — w czcionkach oryginału to „ptaszek”.
 */
import { measureText } from './font';
import { isKey, type UiEvent } from './input';
import type { Ui } from './ui';

export interface MenuBoxOptions {
  /** Ramka i tło okna (windowFrame). Bez ramki menu leży na obrazie, a podświetlenie zamienia kolor tła obrazu. */
  readonly frame?: boolean;
  /**
   * Napis "(HELP AVAILABLE)" i okno wyższe o 2 piksele (Var_2fa0 — w oryginale tylko lista produkcji i wybór badań).
   * Prośbę o pomoc (prawy przycisk, Alt+H, F1) okno przyjmuje zawsze; wynik ma wtedy `help`.
   */
  readonly help?: boolean;
  /** Wyczyść zaległe zdarzenia przed pokazaniem (emptyKeyboardAndMouse). */
  readonly clearInput?: boolean;
  /** Domyślnie wybrana opcja (Var_2f9a_MenuBoxDefaultOptionIndex). */
  readonly defaultIndex?: number;
  /** Maska bitowa opcji nieaktywnych (Var_b276_MenuBoxDisabledOptions). */
  readonly disabled?: number;
  /** Maska bitowa opcji zaznaczonych (Var_d7f2_MenuBoxCheckedOptions). */
  readonly checked?: number;
  /** Stała wysokość wiersza — w rozmowie z władcą (Var_3936 ≠ −1) wzorzec przyjmuje 8. */
  readonly lineHeight?: number;
  /** Var_db38 = 1: okno jest tylko rysowane (bez oczekiwania i bez pokazania klatki); wynik −1. */
  readonly noWait?: boolean;
}

export interface MenuBoxResult {
  /** Numer wybranej opcji albo -1 (Esc, kliknięcie poza oknem, brak opcji). */
  readonly index: number;
  /** Gracz poprosił o pomoc do opcji `index` (Var_2f9c_MenuBoxHelpRequested). */
  readonly help: boolean;
  /** Okno zamknięto kliknięciem (Var_2fa2_DialogMousePressed) — wtedy `mouse` to miejsce kliknięcia. */
  readonly mousePressed: boolean;
  readonly mouse: { readonly x: number; readonly y: number };
}

export interface MenuLayout {
  readonly items: string[];
  readonly optionLines: number[];
  readonly optionChars: string[];
  readonly lineHeight: number;
  readonly contentLeft: number;
  readonly contentTop: number;
  readonly contentWidth: number;
  readonly contentHeight: number;
  readonly windowWidth: number;
  readonly windowHeight: number;
}

/**
 * Wyliczenie układu okna (bez rysowania) — F0_2d05_0475 z dosłownego tłumaczenia asemblera (ec23ac3):
 * tekst zawsze od (x + 5, y + 5 + i·wiersz); ramka tylko przy parzystym `y` (oraz przy y = 139 — menu paska gry):
 * czarny obrys w (x, y) o wymiarach (W + 2) × (H + 2), wnętrze i cień od (x + 1, y + 1) o wymiarach W × H,
 * gdzie W = najdłuższy wiersz + 8, H = wiersze · wysokość + 6 (+ 2 z pomocą). Liczba wierszy obcięta do (192 − y) / wysokość.
 */
export function layoutMenuBox(ui: Ui, text: string, x: number, y: number, options: MenuBoxOptions = {}): MenuLayout {
  const gfx = ui.gfx;
  const frame = options.frame ?? menuHasFrame(y);
  const help = options.help ?? false;
  // Wiersze = fragmenty zakończone '\n' (Var_658e liczy znaki '\n'); końcówka bez '\n' nie jest rysowana ani liczona
  // jako opcja (L05c5: przy tekście bez '\n' na końcu licznik opcji maleje o 1) — np. " " po ostatniej opcji.
  let items = text.split('\n');
  items.pop();

  let lineHeight = gfx.textHeight();
  if (lineHeight === 9) lineHeight--;
  if (options.lineHeight !== undefined) lineHeight = options.lineHeight;

  const maxLineCount = Math.max(0, Math.trunc((192 - y) / lineHeight));
  if (items.length > maxLineCount) items = items.slice(0, maxLineCount);

  const optionChar = items.find((s) => s.startsWith(' ') || s.startsWith('_'))?.[0];
  const optionLines: number[] = [];
  const optionChars: string[] = [];
  let maxLineWidth = 0;
  const width = (s: string) => measureText(gfx.font, s).width;

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    maxLineWidth = Math.max(maxLineWidth, width(item));
    if (optionChar !== undefined && (item.startsWith(' ') || item.startsWith('_'))) {
      optionLines.push(i);
      if (((options.checked ?? 0) & (1 << (optionLines.length - 1))) !== 0) items[i] = '^' + item.substring(1);
      optionChars.push(item.length > 1 ? item[1]!.toLowerCase() : '');
    }
  }

  const innerWidth = maxLineWidth + 8;
  const innerHeight = items.length * lineHeight + 6 + (help ? 2 : 0);
  return {
    items, optionLines, optionChars, lineHeight,
    contentLeft: x + 5,
    contentTop: y + 5,
    contentWidth: maxLineWidth,
    contentHeight: items.length * lineHeight,
    windowWidth: frame ? innerWidth + 3 : innerWidth,
    windowHeight: frame ? innerHeight + 3 : innerHeight,
  };
}

/** Okno ma ramkę przy parzystym Y i przy Y = 139 (TEST y, 1 i CMP y, 0x8b w F0_2d05_0031/0475). */
export const menuHasFrame = (y: number) => (y & 1) === 0 || y === 139;

export async function showMenuBox(ui: Ui, text: string, x: number, y: number, options: MenuBoxOptions = {}): Promise<MenuBoxResult> {
  const gfx = ui.gfx;
  const frame = options.frame ?? menuHasFrame(y);
  const help = options.help ?? false;
  const disabled = options.disabled ?? 0;
  const layout = layoutMenuBox(ui, text, x, y, options);
  const { items, optionLines, optionChars, lineHeight, contentLeft, contentTop, contentWidth } = layout;

  let selected = 0;
  if (options.defaultIndex !== undefined && options.defaultIndex !== -1) selected = Math.min(optionLines.length - 1, options.defaultIndex);

  // kolory (F0_2d05_0031): tło 7, wzór 22 (8 dla y = 139); bez ramki — kolor obrazu w (x, y) i bez zamiany wzoru
  let background = 7;
  let highlight = y === 139 ? 8 : 22;
  if (!frame) {
    background = gfx.screen.getPixel(x, y);
    highlight = -1;
  }
  const textColor = background === 15 ? 3 : 15;
  const right = x + contentWidth + 8; // Var_de0e
  const bottom = y + items.length * lineHeight + 6 + (help ? 2 : 0);

  if (frame) gfx.drawWindowFrame(x, y, right - x, bottom - y, 7);

  if (help) {
    // F0_2d05_0475 L075b: napis czcionką 2 w (de0e − 74, dół − 4), kolor 10 — także bez ramki
    const fontId = gfx.fontId;
    gfx.fontId = 2;
    gfx.drawString('(HELP AVAILABLE)', right - 0x4a, bottom - 4, 10);
    gfx.fontId = fontId;
  }

  let optionIndex = -1;
  for (let i = 0; i < items.length; i++) {
    if (optionLines.length > 0) {
      if (optionIndex === -1 && i === optionLines[0]) optionIndex = 0;
      else if (optionIndex !== -1) optionIndex++;
    }
    const item = items[i]!;
    const ly = contentTop + i * lineHeight;
    if (optionIndex === -1) {
      if (lineHeight > 9) gfx.drawStringWithShadow(item, contentLeft, ly, textColor);
      else gfx.drawString(item, contentLeft, ly, textColor);
    } else {
      gfx.drawString(item, contentLeft, ly, (disabled & (1 << optionIndex)) !== 0 ? 3 : 0);
    }
  }

  if (options.clearInput) ui.input.clear();
  if (options.noWait) return { index: -1, help: false, mousePressed: false, mouse: { x: ui.input.mouse.x, y: ui.input.mouse.y } };

  const isDisabled = (i: number) => i >= 0 && (disabled & (1 << i)) !== 0;
  // L018a: opcja = (mysz.y − y − 4) / wiersz − pierwszy wiersz opcji; poza x..de0e — brak opcji
  const inside = (px: number, py: number) => px >= x && px <= x + contentWidth + 8 && py >= y && py <= y + 4 + items.length * lineHeight;
  const optionAt = (py: number) => {
    const o = Math.trunc((py - y - 4) / lineHeight) - (optionLines[0] ?? 0);
    return o >= 0 && o < optionLines.length ? o : -1;
  };

  let oldSelected = -1;
  let helpRequested = false;
  let mousePressed = false;
  const mouse = { x: ui.input.mouse.x, y: ui.input.mouse.y };

  const updateHighlight = () => {
    if (selected < 0 || selected >= optionLines.length) selected = -1;
    if (selected === oldSelected) return;
    // F0_1000_0784 w (x + 3, y + 4 + wiersz·wysokość), szerokość d4c8 + 5
    const mark = (index: number, on: boolean) => {
      const ly = y + 4 + optionLines[index]! * lineHeight;
      gfx.screen.replaceColor(x + 3, ly, contentWidth + 5, lineHeight, on ? background : 11, on ? 11 : background);
      if (highlight !== -1) gfx.screen.replaceColor(x + 3, ly, contentWidth + 5, lineHeight, on ? highlight : 3, on ? 3 : highlight);
    };
    if (oldSelected !== -1) mark(oldSelected, false);
    if (selected !== -1) mark(selected, true);
    oldSelected = selected;
    ui.present();
  };

  updateHighlight();
  ui.present();

  for (;;) {
    const e: UiEvent = await ui.input.next();
    let exit = false;
    if (e.type === 'mousemove') {
      // Odstępstwo: wzorzec reaguje dopiero, gdy zmienią się OBIE współrzędne myszy; tu wystarczy jedna.
      if (inside(e.x, e.y)) {
        const o = optionAt(e.y);
        if (o !== -1) selected = o;
      }
    } else if (e.type === 'mousedown') {
      mouse.x = e.x;
      mouse.y = e.y;
      mousePressed = true;
      if (!inside(e.x, e.y)) {
        selected = -1;
        exit = true;
      } else {
        const o = optionAt(e.y);
        if (o !== -1) selected = o;
        if (e.button === 'right') {
          // L0177: prawy przycisk (db3a = 2) zawsze zgłasza prośbę o pomoc (Var_2f9c), także bez napisu
          helpRequested = true;
          exit = true;
        } else if (!isDisabled(selected)) {
          exit = true;
        }
      }
    } else if (isKey(e)) {
      const key = e.key;
      if (key === 'Enter' || key === ' ') {
        if (!isDisabled(selected)) exit = true;
      } else if (key === 'Escape') {
        selected = -1;
        exit = true;
      } else if ((e.alt && key.toLowerCase() === 'h') || key === 'F1') {
        helpRequested = true;
        exit = true;
      } else if (key === 'ArrowUp') {
        if (selected === -1 && optionLines.length > 0) selected = 0;
        else if (selected > 0) selected--;
      } else if (key === 'ArrowDown') {
        if (selected === -1 && optionLines.length > 0) selected = 0;
        else if (selected < optionLines.length - 1) selected++;
      } else if (key.length === 1 && !e.alt && !e.ctrl) {
        const ch = key.toLowerCase();
        for (let i = 0; i < optionChars.length; i++) {
          const index = (selected + 1 + i) % optionLines.length;
          if (optionChars[index] !== '' && optionChars[index] === ch) {
            selected = index;
            break;
          }
        }
      }
    }
    updateHighlight();
    if (exit) {
      if (selected !== -1) await ui.waitTimer(20);
      else helpRequested = false;
      return { index: selected, help: helpRequested, mousePressed, mouse };
    }
  }
}

/**
 * MenuBoxDialog.ShowDialog — okno na chwilę: zapamiętuje ekran 0 na ekranie 1, pokazuje okno i przywraca ekran.
 */
export async function showDialog(ui: Ui, text: string, x: number, y: number, disabled = 0): Promise<number> {
  ui.gfx.copy(0, 0, 0, 320, 200, 1, 0, 0);
  const result = await showMenuBox(ui, text, x, y, { frame: true, clearInput: true, disabled });
  ui.gfx.copy(1, 0, 0, 320, 200, 0, 0, 0);
  ui.present();
  return result.index;
}
