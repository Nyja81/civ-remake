/**
 * Teksty z plików oryginału (KING.TXT, CREDITS.TXT…) — czytane z kopii gry gracza, nie z repozytorium.
 * Odczyt sekcji jak w LanguageTools.F0_2f4d_01ad_GetTextBySectionAndKey (OpenCivOne, MIT).
 */

const decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('latin1') : null;

export function decodeAscii(data: Uint8Array): string {
  if (decoder) return decoder.decode(data);
  let s = '';
  for (const b of data) s += String.fromCharCode(b);
  return s;
}

/** Wiersze pliku tekstowego (CR LF albo LF). */
export function textLines(data: Uint8Array, skip = 0): string[] {
  const text = decodeAscii(data.subarray(skip));
  const lines = text.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/**
 * Sekcja pliku z hasłami (np. "*INIT" w KING.TXT): pierwsze 0x212 bajtów to tablica skrótów; po wierszu z kluczem
 * pomijane są kolejne wiersze z kluczami ('*'), a treść trwa do następnego wiersza zaczynającego się od '*'.
 */
export function textSection(data: Uint8Array, key: string): string | null {
  const lines = textLines(data, 0x212);
  const at = lines.findIndex((l) => l.toUpperCase() === key.toUpperCase());
  if (at < 0) return null;
  let i = at + 1;
  while (i < lines.length && lines[i]!.startsWith('*')) i++;
  let item = '';
  for (; i < lines.length && !lines[i]!.startsWith('*'); i++) {
    const line = lines[i]!.trim();
    if (line.length > 0) item += line + '\n';
  }
  item = item.replace(/[ ^\n]+$/, '');
  while (item.includes('  ')) item = item.replace(/ {2}/g, ' ');
  return item;
}

/** LanguageTools.F0_2f4d_0471_ReplaceKeywords — $US, $THEM, $BUCKS, $RPLC1, $RPLC2. */
export function replaceKeywords(text: string, values: Partial<Record<'US' | 'THEM' | 'BUCKS' | 'RPLC1' | 'RPLC2', string>>): string {
  for (const key of ['US', 'THEM', 'BUCKS', 'RPLC1', 'RPLC2'] as const) {
    const value = values[key];
    if (value !== undefined) text = text.split('$' + key).join(value);
  }
  return text;
}

/** LanguageTools.F0_2f4d_0000_AdjustTextBlockWidth — łamanie tekstu do `maxLength` znaków w wierszu. */
export function adjustTextBlockWidth(text: string, maxLength: number): string {
  let previousDelimiter = 0;
  let currentLength = 0;
  const out: string[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const next = text[i + 1] ?? '\0';
    if (ch === ' ' || ch === '^' || ch === '\n') {
      if ((ch === '^' || ch === '\n') && (next === ' ' || next === '_')) {
        out.push('\n', next); // wiersz opcji
        currentLength = 1;
        previousDelimiter = 0;
        i++;
      } else if (out.length > 0 && currentLength > 0) {
        if (out[out.length - 1] !== ' ') {
          out.push(' ');
          currentLength++;
        }
        previousDelimiter = out.length - 1;
      } else {
        previousDelimiter = 0;
      }
    } else {
      out.push(ch);
      currentLength++;
      if (currentLength > maxLength && previousDelimiter > 0) {
        out[previousDelimiter] = '\n';
        currentLength = i - previousDelimiter;
        previousDelimiter = 0;
      }
    }
  }
  if (currentLength > 0) {
    while (out.length > 0 && out[out.length - 1] === ' ') out.pop();
    out.push('\n');
  }
  return out.join('');
}

/** GameEngine.YearToString */
export const yearToString = (year: number) => `${Math.abs(year)} ${year < 0 ? 'BC' : 'AD'}`;
