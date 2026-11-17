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

/**
 * F0_2f4d_01ad dokładnie jak w asemblerze (ec23ac3): od bajtu 0x200 wiersze czytane `fscanf("%[^\n]\n")` — znak nowego
 * wiersza we wzorcu formatu pomija wszystkie białe znaki, więc puste wiersze i wcięcia znikają; po wierszu z kluczem
 * (stricmp) pomijane są wiersze zaczynające się od '*', dalej każdy wiersz + spacja aż do wiersza z '*'.
 * Wynik: wiersze połączone spacjami, z końcową spacją; '^' zostaje (łamie wiersz dopiero `adjustTextOriginal`).
 */
export function loadTextSection(data: Uint8Array, key: string): string | null {
  const text = decodeAscii(data.subarray(0x200)).replace(/\r\n/g, '\n');
  const lines: string[] = [];
  let pos = 0;
  // fscanf: najpierw "%[^\n]" (co najmniej jeden znak), potem pominięcie białych znaków
  for (;;) {
    let end = text.indexOf('\n', pos);
    if (end < 0) end = text.length;
    if (end === pos) break;
    const line = text.substring(pos, end);
    const nul = line.indexOf('\0'); // napis C kończy się na zerze
    lines.push(nul >= 0 ? line.substring(0, nul) : line);
    pos = end;
    while (pos < text.length && /\s/.test(text[pos]!)) pos++;
    if (pos >= text.length) break;
  }
  const at = lines.findIndex((l) => l.toUpperCase() === key.toUpperCase());
  if (at < 0) return null;
  let i = at + 1;
  while (i < lines.length && lines[i]!.startsWith('*')) i++;
  let item = '';
  for (; i < lines.length && !lines[i]!.startsWith('*'); i++) item += lines[i]! + ' ';
  return item;
}

/**
 * F0_2f4d_0000 dokładnie jak w asemblerze: '^' → spacja, a NASTĘPNY znak zastępowany przez '\n' (licznik od nowa);
 * '\n' zeruje licznik; po przekroczeniu `maxLength` znaków spacja (nie przed drugą spacją) staje się '\n'.
 * Na końcu '\n', jeśli ostatni wiersz nie jest pusty.
 */
export function adjustTextOriginal(text: string, maxLength: number): string {
  const t = text.split('');
  let count = 0;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '^') {
      t[i] = ' ';
      if (i + 1 < t.length) t[i + 1] = '\n';
      else t.push('\n');
      count = -1;
    }
    if (t[i] === '\n') count = -1;
    count++;
    if (count > maxLength && t[i] === ' ' && t[i + 1] !== ' ') {
      t[i] = '\n';
      count = 0;
    }
  }
  let out = t.join('');
  if (count > 0) out += '\n';
  return out;
}

/** F0_2f4d_044f: sekcja KING.TXT po zamianie słów kluczowych, łamana do 80 znaków. */
export function kingSectionText(data: Uint8Array, key: string, values: Parameters<typeof replaceKeywords>[1]): string | null {
  const section = loadTextSection(data, key);
  return section === null ? null : adjustTextOriginal(replaceKeywords(section, values), 80);
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
