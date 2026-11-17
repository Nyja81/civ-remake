/**
 * Zapis gry w formacie oryginału (CIVIL0–9.SVE + .MAP) — dosłowne tłumaczenie asemblera z pierwszego commitu wzorca
 * OpenCivOne (MIT, ec23ac3, `Segments/Overlay_11.cs`); nowsza wersja (LoadAndSave.ShowSaveGameDialog) pomija wybór dysku.
 *   F11_0000_036a — zapis: ekran 0 zapamiętany na ekranie 1 (F0_1866_25b6), wybór dysku, lista CIVIL0–3.SVE
 *     („Select Save File...” w (48, 33), domyślnie ostatnio użyte miejsce Var_e168), F11_0000_04ef, wynik w (64, 127),
 *     ekran odtworzony (F0_1866_25d7). Autozapis co 50 tur woła tę samą funkcję z miejscem 4 + ((tura / 50 − 1) % 6).
 *   F11_0000_05f8 — „Which drive contains your Save Game disk?”: biały ekran z ramką z ikon (DrawRandomFoodIcons — jedno
 *     losowanie generatora gry), napis F0_2f4d_0088 w (80, 72), klawisze A–F zmieniają dysk, Enter zatwierdza, Esc anuluje.
 *     W aplikacji jedynym dyskiem jest folder gry — dysk C: (DOSBox montuje grę jako C:); inny dysk daje „No Disk in Drive X.”.
 *   F11_0000_0103 — wiersz listy: „ poziom imię, naród/rok” albo „ (EMPTY)”.
 *   F11_0000_04ef — „ c:CIVILn.SVE / poziom imię / naród/rok / ... save in progress.” w (64, 86) bez czekania, potem
 *     F11_0000_08f6 (najpierw .MAP — błąd: „Error writing map file.” w (4, 64); potem .SVE — błąd otwarcia: „File Error: …”).
 *   Wynik: „ Game has been saved.” albo czerwone pole (64, 127, 192, 34) i „ Game NOT saved.” z „ Write access denied.”
 *     (błąd 13) albo „ Disk Full.” (28), na końcu „ Press key to continue.”.
 * Teksty z danych CIV.EXE (wersja 474.01 i 475.05 — te same).
 */
import { saveSve, sveInfo, type GameState } from '@civ-remake/engine';
import { isKey } from '../input';
import { showMenuBox } from '../menuBox';
import { yearToString } from '../text';
import type { Ui } from '../ui';
import { DIFFICULTY_NAMES, drawRandomFoodIcons } from './newGame';

/** Wynik zapisu plików: błąd z kodem systemowym (EACCES, EPERM, EROFS, ENOSPC…) i plikiem, przy którym wystąpił. */
export type SaveWriteResult = { readonly ok: true } | { readonly ok: false; readonly file: 'map' | 'sve'; readonly code: string };

/** Zapisy oryginału CIVIL0–9.SVE (+ .MAP) w folderze gry. */
export interface OriginalSaveStore {
  /** Numery zapisów, dla których są oba pliki. */
  list(): Promise<number[]>;
  read(index: number): Promise<{ sve: Uint8Array; map: Uint8Array }>;
  /** Zapis obu plików (najpierw .MAP, potem .SVE); bez tej funkcji zapis w formacie oryginału jest niedostępny. */
  write?(index: number, files: { sve: Uint8Array; map: Uint8Array }): Promise<SaveWriteResult>;
}

/** Dysk, na którym aplikacja trzyma zapisy (folder gry): C:. */
export const GAME_DRIVE = 2;

/** Zmienne globalne oryginału trwające między zapisami. */
interface SaveGlobals {
  /** DS:0x4384 — wybrany dysk (−1 = jeszcze nie pytano; wtedy _dos_getdrive). */
  drive: number;
  /** Var_e168 — ostatnio użyte miejsce zapisu. */
  lastSlot: number;
}

const globals = new WeakMap<Ui, SaveGlobals>();
const globalsOf = (ui: Ui): SaveGlobals => {
  let g = globals.get(ui);
  if (!g) globals.set(ui, (g = { drive: -1, lastSlot: 0 }));
  return g;
};

const SAVE_PROMPT = '  Which drive contains your\n     Save Game disk?\n\n            ';
const DRIVE_HELP = ':\n\n    Press drive letter and\nReturn when disk is inserted.\n';
const ESCAPE_HELP = '    Press Escape to cancel.\n';

/** Nazwa pliku jak w DS:0x41c6: litera dysku, dwukropek, CIVILn.SVE. */
export const saveFileName = (drive: number, slot: number) => `${String.fromCharCode(0x61 + drive)}:CIVIL${slot}.SVE`;

/** F11_0000_0103 (z flagą 1): wiersz listy zapisów. */
export function saveSlotLine(sve: Uint8Array | null): string {
  if (!sve) return ' (EMPTY)\n';
  try {
    const info = sveInfo(sve);
    return ` ${DIFFICULTY_NAMES[info.difficulty] ?? ''} ${info.leader}, ${info.nation}/${yearToString(info.year)}\n`;
  } catch {
    return ' (EMPTY)\n';
  }
}

/** F0_2f4d_0088: wiersze tekstu (podział na '\n' i '^') od (x, y), co wysokość czcionki. */
function drawLines(ui: Ui, text: string, x: number, y: number, color: number): void {
  const gfx = ui.gfx;
  const height = gfx.textHeight();
  for (const line of text.split(/\n|\^/)) {
    if (y > 192) break;
    gfx.drawString(line, x, y, color);
    y += height;
  }
}

/**
 * F11_0000_05f8: wybór dysku. Zwraca numer dysku albo −1 (Esc, brak dysku). `random` — losowanie generatora gry
 * dla DrawRandomFoodIcons (tylko przy zapisie).
 */
export async function selectSaveDrive(ui: Ui, random: (n: number) => number): Promise<number> {
  const g = globalsOf(ui);
  const gfx = ui.gfx;
  if (g.drive === -1) g.drive = GAME_DRIVE; // _dos_getdrive
  gfx.fillRect(0, 0, 320, 200, 15);
  drawRandomFoodIcons(ui, random); // Var_681a = 0 (zapis)
  let key = '';
  for (;;) {
    // L063d
    const prompt = SAVE_PROMPT.slice(0, -1) + String.fromCharCode(0x41 + g.drive);
    drawLines(ui, prompt + DRIVE_HELP + ESCAPE_HELP, 80, 72, 0);
    ui.present();
    let e = await ui.input.next();
    while (!isKey(e)) e = await ui.input.next();
    key = e.key;
    const letter = key.length === 1 ? key.toUpperCase() : '';
    if (letter >= 'A' && letter <= 'F') g.drive = letter.charCodeAt(0) - 0x41;
    if (key === 'Escape') g.drive = -1;
    gfx.fillRect(80, 88, 160, 24, 15);
    if (key === 'Enter' || key === 'Escape') break;
  }
  gfx.fillRect(8, 8, 304, 184, 15);
  if (g.drive === -1) return -1;
  // F11_0000_07d6: czy dysk jest dostępny — w aplikacji tylko dysk gry
  if (g.drive !== GAME_DRIVE) {
    const text = `No Disk in Drive ${String.fromCharCode(0x41 + g.drive)}.\n`;
    await showMenuBox(ui, text, 100, 80, { clearInput: true });
    return -1;
  }
  return g.drive;
}

/** Okno tylko z tekstem, zamykane klawiszem albo kliknięciem (Var_d206 = 1). */
async function showMessage(ui: Ui, text: string, x: number, y: number): Promise<void> {
  ui.input.clear();
  await showMenuBox(ui, text, x, y, { noWait: true });
  ui.present();
  await ui.waitKeyOrClick();
}

/**
 * F11_0000_036a: zapis gry do CIVILn.SVE + CIVILn.MAP w folderze gry. `slot` = −1 — wybór z listy (GAME → Save Game),
 * inaczej autozapis do podanego miejsca. Zwraca true, gdy pliki zapisano.
 */
export async function showSaveGameDialog(ui: Ui, state: GameState, store: OriginalSaveStore, slot = -1): Promise<boolean> {
  const g = globalsOf(ui);
  const gfx = ui.gfx;
  let saved = false;
  gfx.copy(0, 0, 0, 320, 200, 1, 0, 0); // F0_1866_25b6
  const drive = await selectSaveDrive(ui, (n) => state.rng.next(n));
  if (drive !== -1 && store.write) {
    let text = '\x8cSelect Save File...\n';
    const existing = new Set(await store.list().catch(() => [] as number[]));
    for (let i = 0; i < 4; i++) {
      let sve: Uint8Array | null = null;
      if (existing.has(i)) sve = await store.read(i).then((f) => f.sve, () => null);
      text += saveSlotLine(sve);
    }
    if (slot === -1) {
      const r = await showMenuBox(ui, text, 48, 33, { clearInput: true, defaultIndex: Math.min(Math.max(g.lastSlot, 0), 3) });
      slot = r.index;
    }
    if (slot !== -1) {
      g.lastSlot = slot;
      saved = await saveToSlot(ui, state, store, drive, slot);
    }
  }
  gfx.copy(1, 0, 0, 320, 200, 0, 0, 0); // F0_1866_25d7
  ui.present();
  return saved;
}

/** F11_0000_04ef + F11_0000_08f6 + komunikat wyniku z F11_0000_036a. */
async function saveToSlot(ui: Ui, state: GameState, store: OriginalSaveStore, drive: number, slot: number): Promise<boolean> {
  const human = state.players[state.humanPlayer]!;
  const name = saveFileName(drive, slot);
  const progress = ` ${name}\n ${DIFFICULTY_NAMES[state.difficulty] ?? ''} ${human.leader}\n ${human.nationPlural}/${yearToString(state.year)}` +
    '\n ... save in progress.\n';
  await showMenuBox(ui, progress, 64, 86, { noWait: true });
  ui.present();
  let errorCode = 0; // Var_681c
  let result: SaveWriteResult;
  try {
    result = await store.write!(slot, saveSve(state));
  } catch (error) {
    result = { ok: false, file: 'sve', code: String((error as { code?: string }).code ?? 'EIO') };
  }
  if (!result.ok) {
    if (result.file === 'map') {
      await showMessage(ui, 'Error writing map file.\n', 4, 64);
      errorCode = 1;
    } else if (result.code === 'ENOSPC') {
      errorCode = 0x1c;
    } else if (result.code === 'EACCES' || result.code === 'EPERM' || result.code === 'EROFS') {
      errorCode = 0xd;
    } else {
      // Odstępstwo: oryginał po „File Error” nie ustawia Var_681c i pokazuje „Game has been saved.”
      await showMessage(ui, `File Error: ${name}\n`, 100, 80);
      errorCode = 1;
    }
  }
  let text: string;
  if (errorCode === 0) {
    text = ' Game has been saved.\n';
  } else {
    text = ' Game NOT saved.\n';
    ui.gfx.fillRect(64, 127, 192, 34, 12);
  }
  if (errorCode === 0xd) text += ' Write access denied.\n';
  if (errorCode === 0x1c) text += ' Disk Full.\n';
  text += ' Press key to continue.\n';
  await showMessage(ui, text, 64, 127);
  return errorCode === 0;
}

/** GameTurn (Segment_1238 L0416): miejsce autozapisu co 50 tur — 4 + ((tura / 50 − 1) % 6). */
export const autosaveSlot = (turn: number) => {
  const r = (Math.trunc(turn / 50) - 1) % 6;
  return 4 + r;
};
