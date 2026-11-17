/**
 * Pole tekstowe i okna z pytaniem o nazwę — według zakomentowanego dosłownego tłumaczenia oryginału
 * w TextBoxDialogues (OpenCivOne, MIT): F23_0000_0414_EditBoxDialog, F23_0000_06c1 (rysowanie),
 * F23_0000_00d6_PlayerNameDialog, F23_0000_0173_TribeNameDialog. Wzorzec zastąpił je systemowym oknem;
 * tutaj wracamy do wyglądu oryginału.
 */
import { measureText } from './font';
import type { Ui } from './ui';

export interface EditBoxResult {
  /** true = zatwierdzone Enterem (lub kliknięciem), false = Esc. */
  readonly ok: boolean;
  readonly text: string;
}

/** Pole edycji w (x, y) na `maxLength` znaków; tekst początkowy zastępowany przy pierwszym wpisanym znaku. */
export async function editBox(ui: Ui, x: number, y: number, maxLength: number, initial: string): Promise<EditBoxResult> {
  const gfx = ui.gfx;
  gfx.fillRect(x, y, 7 * maxLength, 11, 15);
  gfx.drawRectangle(x, y - 1, maxLength * 8 + 8, 13, 0);

  let buffer = initial.substring(0, maxLength).padEnd(maxLength, ' ');
  let cursor = 0;
  let firstKey = true;
  let cursorX = x + 2;
  let cursorW = 0;
  const charWidth = (ch: string) => measureText(gfx.font, ch).width;

  const draw = () => {
    let px = x + 2;
    const py = y + 2;
    for (let i = 0; i < maxLength; i++) {
      gfx.fillRect(px, py, 8, 8, 15);
      const ch = buffer[i]!;
      gfx.drawString(ch, px, py, 0);
      if (i === cursor) {
        cursorX = px;
        cursorW = charWidth(ch);
      }
      px += charWidth(ch);
    }
  };

  draw();
  let ok = true;
  for (;;) {
    // migający kursor: 10 jednostek zegara podświetlony, 10 zwykły
    gfx.screen.replaceColor(cursorX, y + 1, cursorW, 10, 15, 11);
    ui.present();
    let e = await ui.waitEvent(10 * 12);
    gfx.screen.replaceColor(cursorX, y + 1, cursorW, 10, 11, 15);
    ui.present();
    if (!e) e = await ui.waitEvent(10 * 12);
    if (!e) continue;

    let key = '';
    if (e.type === 'mousedown') key = 'Enter';
    else if (e.type === 'key') key = e.key;
    else continue;

    if (key === 'Enter' || key === 'Escape') {
      ok = key === 'Enter';
      break;
    }
    if (key === 'ArrowLeft' && cursor > 0) cursor--;
    else if (key === 'ArrowRight' && cursor < maxLength - 1) cursor++;
    else if (key === 'Insert') buffer = (buffer.substring(0, cursor) + ' ' + buffer.substring(cursor)).substring(0, maxLength);
    else if (key === 'Delete') buffer = buffer.substring(0, cursor) + buffer.substring(cursor + 1) + ' ';
    else if (key === 'Backspace' && cursor > 0) {
      buffer = buffer.substring(0, cursor - 1) + buffer.substring(cursor) + ' ';
      cursor--;
    } else if (key.length === 1 && key >= ' ' && key <= '~' && !(e.type === 'key' && (e.alt || e.ctrl))) {
      if (firstKey) buffer = ' '.repeat(maxLength);
      buffer = buffer.substring(0, cursor) + key + buffer.substring(cursor + 1);
      if (cursor < maxLength - 1) cursor++;
    }
    firstKey = false;
    draw();
  }

  // usunięcie spacji z końca (pierwszy znak zostaje), jak w oryginale
  let end = maxLength - 1;
  while (end > 0 && buffer[end] === ' ') end--;
  ui.input.clear();
  return { ok, text: buffer.substring(0, end + 1).trim() === '' ? '' : buffer.substring(0, end + 1) };
}

/** F23_0000_00d6_PlayerNameDialog — „Your Name...”; zwraca nowe imię albo dotychczasowe, gdy pole puste. */
export async function playerNameDialog(ui: Ui, name: string): Promise<string> {
  const gfx = ui.gfx;
  gfx.fillRect(158, 88, 160, 32, 15);
  gfx.drawRectangle(158, 88, 160, 32, 11);
  gfx.drawString('Your Name...', 166, 90, 0);
  const result = await editBox(ui, 166, 104, 13, name);
  return result.text || name;
}

/**
 * F23_0000_0173_TribeNameDialog — „Name of your Tribe...”. Zwraca naród w liczbie mnogiej (np. "Zulus")
 * i przymiotnik bez końcowego 's', najwyżej 9 znaków (np. "Zulu").
 */
export async function tribeNameDialog(ui: Ui, nation: string): Promise<{ nation: string; nationality: string }> {
  const gfx = ui.gfx;
  gfx.fillRect(158, 88, 160, 32, 15);
  gfx.drawRectangle(158, 88, 160, 32, 11);
  gfx.drawString('Name of your Tribe...', 166, 90, 0);
  const result = await editBox(ui, 166, 104, 11, nation);
  const plural = result.text || nation;
  const singular = plural.endsWith('s') ? plural.substring(0, plural.length - 1) : plural;
  return { nation: plural, nationality: singular.substring(0, 9) };
}
