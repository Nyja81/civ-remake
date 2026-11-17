/**
 * Pałac gracza — Palace.F17_0000_0000_UpgradePalace (okno rozbudowy), F17_0000_07ec_DrawPalace (rysunek),
 * F17_0000_0cfe (wybór kawałków), F17_0000_0e2f (rysowanie kawałka), F17_0000_0e95 (wycinanie kawałków z CASTLE?.PIC),
 * widok pałacu po kliknięciu w panel (PlayerTurn, 0x1403:0x07af) i mini-pałac w panelu
 * (GameEngine.F0_1238_14a3_DrawMiniPalace). Źródło: dosłowne tłumaczenie asemblera z pierwszego commitu wzorca
 * OpenCivOne (MIT), `Overlay_17.cs` i `Segment_1238.cs`; nowsza wersja `Palace.cs` jest przepisana od nowa.
 *
 * Kawałki budynku: 0 środek (52 px), 1 i 2 ściany (24 px), 3 lewa wieża (28 px), 4 prawa wieża (27 px), wycinane
 * z ćwiartki CASTLE{poziom}.PIC wg stylu (0: (0,0), 1: (160,0), 2: (0,100)); wieże stylu 1 — z ćwiartki (160,100), 35 px.
 * Zasady (poziomy, wybór części, progi) liczy silnik: `packages/engine/src/game/palace.ts`.
 *
 * Bez plików CBACK.PIC i CASTLE0–4.PIC — wariant uproszczony: wybór części na jednolitym tle, bez rysunku pałacu.
 */
import {
  miniPalace, miniPalacePiece, normalizePalaceSection, palaceCanUpgrade, palaceGardenOffered, palaceNewLevel, palaceOf,
  palaceSectionAccepted, palaceSectionOffered, upgradePalace, type GameState, type PalaceState,
} from '@civ-remake/engine';
import type { GameAssets } from '../assets';
import type { Gfx } from '../gfx';
import { isKey, type UiEvent } from '../input';
import { showMenuBox } from '../menuBox';
import type { Surface } from '../surface';
import { replaceKeywords, textSection } from '../text';
import { ANTHEM, longTune, TUNE } from '../sound';
import type { Ui } from '../ui';

/**
 * Tablice w danych CIV.EXE przepisane ze wzorca (do dodania do `npm run extract`): szerokości kawałków DS:0x4b2c
 * (słowa) i przesunięcia w pionie DS:0x4b36 (bajty ze znakiem, [poziom][styl][kawałek]) — odczytane z obrazu
 * segmentu danych dołączonego do wzorca (BinaryResources.bin).
 */
export const PALACE_PIECE_WIDTHS = [48, 24, 24, 25, 25] as const;
export const PALACE_PIECE_Y: readonly (readonly (readonly number[])[])[] = [
  [[1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]],
  [[1, 0, 0, 2, 2], [1, 0, 0, 1, 1], [1, 0, 0, 2, 2]],
  [[1, 0, 0, 2, 2], [1, 0, 0, 1, 1], [1, 0, 0, 2, 2]],
  [[1, 3, 3, 2, 2], [1, 0, 0, 1, 1], [1, 0, 0, 2, 2]],
  [[1, 3, 3, 2, 2], [1, 0, 0, 1, 1], [1, 0, 0, 2, 2]],
];
const W = PALACE_PIECE_WIDTHS;

/** Przesunięcie z tablicy; indeks −1 (kawałek nieustawiony) czyta bajt wcześniej, jak oryginał. */
function pieceY(level: number, type: number, piece: number): number {
  const flat = level * 15 + type * 5 + piece;
  if (flat < 0) return 0; // starszy bajt słowa 25 (DS:0x4b35)
  return PALACE_PIECE_Y[Math.trunc(flat / 15)]?.[Math.trunc((flat % 15) / 5)]?.[flat % 5] ?? 0;
}

/** Rodzaj części: 0 lewy skraj (wieża), 1 część boczna, 2 środek, 3 prawy skraj (pętle L0b05 i F17_0000_0cfe). */
function sectionKind(levels: readonly number[], section: number): number {
  let kind = 2;
  if (section < 4) {
    kind = 1;
    if (levels[section - 1] === -1 || section === 1) kind = 0;
  }
  if (section > 4) {
    kind = 1;
    if (levels[section + 1] === -1 || section === 7) kind = 3;
  }
  return kind;
}

/** F17_0000_0cfe: numery kawałków (Arr_b25e) dla dwóch rysunków części `section`; `draw` = 1 przy rysowaniu pałacu. */
function setPieces(p: PalaceState, pieces: number[][], section: number, draw: 0 | 1): void {
  const l = p.levels;
  const level = l[section]!;
  const out = pieces[section]!;
  switch (sectionKind(l, section)) {
    case 0:
      out[0] = 3;
      if (section === 3 || draw === 0) out[1] = level !== 0 ? 1 : 2;
      break;
    case 1:
      out[0] = l[section - 1]! > level || section === 5 ? 1 : l[section - 2] !== -1 ? 2 : 1;
      out[1] = 2;
      break;
    case 2:
      out[0] = 0;
      break;
    case 3:
      if (section === 5 || draw === 0) out[0] = l[section - 1]! > level || section === 5 ? 1 : 2;
      out[1] = 4;
      break;
  }
}

/**
 * F17_0000_0e95: wycina kawałki z CASTLE{poziom}.PIC (przez ekran 1) dla poziomów z maski `levelMask`.
 * `mode` 1 — części 1–7 o danym poziomie w ich stylu; 0 — ekran wyboru: części 1–3 to style 0–2.
 */
function cutPieces(gfx: Gfx, assets: GameAssets, p: PalaceState, pieces: number[][], levelMask: number, mode: 0 | 1, bitmaps: (Surface | null)[][]): void {
  for (let level = 0; level < 5; level++) {
    if (!(levelMask & (1 << level))) continue;
    gfx.loadPic(1, 0, 0, assets.pic(`CASTLE${level}.PIC`));
    for (let i = 1; i < 8; i++) {
      if (p.levels[i] !== level && mode !== 0) continue;
      const t = mode === 0 ? i - 1 : p.types[i]!;
      const bx = (t & 1) * 160;
      const by = (t & 2) * 50;
      const special = mode !== 0 ? p.types[i] === 1 : i === 2;
      for (let j = 0; j < 2; j++) {
        let cut: Surface | null = null;
        switch (pieces[i]![j]) {
          case 0: cut = gfx.cut(1, bx, by + 1, 52, 99); break;
          case 1: cut = gfx.cut(1, bx + 53, by + 1, 24, 99); break;
          case 2: cut = gfx.cut(1, bx + 78, by + 1, 24, 99); break;
          case 3: cut = special ? gfx.cut(1, 160, 101, 35, 99) : gfx.cut(1, bx + 103, by + 1, 28, 99); break;
          case 4: cut = special ? gfx.cut(1, 196, 101, 35, 99) : gfx.cut(1, bx + 132, by + 1, 27, 99); break;
        }
        if (cut) bitmaps[i]![j] = cut;
      }
    }
  }
}

const emptyPieces = () => Array.from({ length: 12 }, () => [-1, -1]);
const emptyBitmaps = (): (Surface | null)[][] => Array.from({ length: 12 }, () => [null, null]);

/** Czy są pliki do narysowania pałacu. */
export function hasPalaceGraphics(assets: GameAssets): boolean {
  return assets.has('CBACK.PIC') && [0, 1, 2, 3, 4].every((l) => assets.has(`CASTLE${l}.PIC`));
}

/**
 * F17_0000_07ec_DrawPalace: pałac na ekranie 1 (tło CBACK.PIC albo SAD.PIC przy `sad`, dziedziniec CBACKS?.PIC,
 * części budynku od lewej do prawej, ogrody CBRUSH?.PIC). Bez plików — ekran 1 wypełniony kolorem 0.
 * Przy `sad` oryginał od razu wygasza ekran 0 i ustawia paletę SAD.PIC — robi to wywołujący.
 */
export function drawPalace(gfx: Gfx, assets: GameAssets, p: PalaceState, sad = false): void {
  const background = sad ? 'SAD.PIC' : 'CBACK.PIC';
  if (!hasPalaceGraphics(assets) || !assets.has(background)) {
    gfx.fillRect(0, 0, 320, 200, 0, 1);
    return;
  }
  const l = p.levels;
  const t = p.types;
  const pieces = emptyPieces();
  let mask = 0;
  for (let i = 0; i < 9; i++) if (l[i] !== -1) mask |= 1 << l[i]!;
  for (let i = 1; i < 8; i++) if (l[i] !== -1) setPieces(p, pieces, i, 1);
  const bitmaps = emptyBitmaps();
  cutPieces(gfx, assets, p, pieces, mask, 1, bitmaps);

  gfx.loadPic(1, 0, 0, assets.pic(background));
  if (l[10]! > 0 && assets.has(`CBACKS${l[10]}.PIC`)) gfx.loadPic(1, 0, 135, assets.pic(`CBACKS${l[10]}.PIC`));

  // F17_0000_0e2f: kawałek `flag` części `section` z przesunięciem dla poziomu `level`
  const draw = (level: number, section: number, x: number, y: number, flag: 0 | 1) => {
    const bitmap = bitmaps[section]![flag];
    if (!bitmap) return;
    gfx.drawBitmap(bitmap, x, pieceY(level, t[section]!, pieces[section]![flag]!) + y + level, 1);
  };

  // DS:0xd922 = poziom części 2 (we wzorcu PalaceData1[4] — tablica przesunięta o dwa słowa)
  let x = 16;
  if (l[2] === -1) x -= 24;
  if (t[4] === 1) x++;
  const y = 36;
  let last = 8;
  while (last > 0 && l[last] === -1) last--;
  let first = 1;
  for (let i = 1; i < 8; i++) {
    const level = l[i]!;
    if (level === -1) {
      x += 48;
      continue;
    }
    switch (sectionKind(l, i)) {
      case 0:
        if (i === 3) draw(level, i, x + W[3], y, 1);
        if (t[i] !== 1 || i === 3) draw(level, i, x, y, 0);
        x += W[3];
        if (i === 3) x += W[1];
        first = i;
        break;
      case 1:
        // wieża stylu 1 przesłania sąsiednią ścianę — rysowana jeszcze raz (L0988)
        if (first + 1 === i && t[i] === t[first]) draw(level, first, x + W[1] - 17, y - 2, 0);
        if (last - 1 === i && t[i] === t[last]) draw(level, last, x + W[1] - 17, y - 2, 1);
        draw(level, i, x, y, 0);
        x += W[1];
        draw(level, i, x, y, 1);
        x += W[1];
        break;
      case 2:
        if (t[4] === 1) x--;
        draw(level, i, x - 2, y, 0);
        x += W[0];
        if (t[4] === 1) x--;
        break;
      case 3:
        if (i === 5) {
          draw(level, i, x, y, 0);
          x += W[1];
        }
        if (t[i] === 1 && l[i - 1]! > level) draw(level, i, x - 3, l[i - 1]! - level + y + 1, 1);
        else draw(level, i, x - (t[i] === 1 ? 3 : 2), y, 1);
        x += W[4];
        break;
    }
  }
  // lewa wieża stylu 1 na końcu (L0b87)
  if (t[first] === 1 && first !== 3) draw(l[first]!, first, first * 48 - 36, l[first + 1]! - l[first]! + y, 0);

  // ogrody: lewy CBRUSH0/2/4 w (0, …), prawy CBRUSH1/3/5 w (184, …)
  for (const [section, base, gx] of [[9, 0, 0], [11, 1, 184]] as const) {
    const level = l[section]!;
    if (level === 0) continue;
    const name = `CBRUSH${base + level * 2 - 2}.PIC`;
    if (assets.has(name)) gfx.drawBitmap(assets.pic(name), gx, level <= 1 ? 105 : 94, 1);
  }
}

/** Tekst *PALACE z KING.TXT (gdy brak pliku — własny tekst zastępczy). */
function palaceText(assets: GameAssets, state: GameState): string {
  const me = state.players[state.humanPlayer]!;
  const king = assets.optional('KING.TXT');
  const section = king ? textSection(king, '*PALACE') : null;
  const text = section ?? 'Sire, the people want\nto honor you with\nan improved palace.';
  return replaceKeywords(text, { US: me.nationPlural, RPLC1: me.leader }).replace(/\^/g, '\n').replace(/([^\n])$/, '$1\n');
}

/** Pełny ekran z paletą CBACK.PIC (gdy jest). */
function applyPalacePalette(gfx: Gfx, assets: GameAssets): void {
  if (assets.has('CBACK.PIC')) gfx.setPaletteFromFile(assets.file('CBACK.PIC'));
}

/** Klawisz lub kliknięcie (ruch myszy pomijany). */
async function nextKeyOrClick(ui: Ui): Promise<UiEvent> {
  return ui.waitKeyOrClick();
}

/** Numer części z klawisza (GetNavigationKey: '1'–'7' → 1–7, 'a'–'c' → 9–11; kod − 'X') albo kliknięcia. */
export function palaceSectionFromInput(e: UiEvent): number {
  if (isKey(e)) {
    if (e.key.length !== 1) return -1;
    const code = e.key.charCodeAt(0);
    const s = code < 0x38 ? code - 0x30 : code - 0x58;
    return s >= 1 && s <= 11 ? s : -1;
  }
  if (e.type !== 'mousedown') return -1;
  return e.y >= 154 ? Math.trunc(e.x / 107) + 9 : Math.trunc((e.x + 12) / 48) + 1;
}

/**
 * Palace.F17_0000_0000_UpgradePalace: komunikat *PALACE na tle pałacu, „Which section shall we improve?”
 * z numerami części 1–7 (y = 144) i literami A–C (y = 160), potem „Select new section.” z trzema stylami części
 * budynku; na końcu rozbudowany pałac pojawia się z efektem rozpuszczania i czeka na klawisz. Zmianę zapisuje silnik
 * (`upgradePalace`). Wywołujący odtwarza potem mapę z wygaszeniem (F0_1238_1b44).
 */
export async function showPalaceUpgrade(ui: Ui, assets: GameAssets, state: GameState): Promise<void> {
  const gfx = ui.gfx;
  const p = palaceOf(state);
  const savedFont = gfx.fontId;
  const text = palaceText(assets, state);
  // F17_0000_0000: długi hymn gracza z parametrem 3 (0x0000:0x0091), na końcu PlayTune(1)
  ui.playTune(longTune(state, state.humanPlayer), ANTHEM);
  drawPalace(gfx, assets, p);
  gfx.fillRect(0, 0, 320, 200, 0);
  applyPalacePalette(gfx, assets);
  gfx.copy(1, 0, 0, 320, 200, 0, 0, 0);
  ui.present();
  await showMenuBox(ui, text, 20, 16, { clearInput: true });
  gfx.copy(1, 0, 0, 320, 200, 0, 0, 0);
  await showMenuBox(ui, 'Which section shall we improve?\n', 40, 16, { noWait: true });
  for (let i = 1; i < 8; i++) if (palaceSectionOffered(p, i)) gfx.drawStringWithShadow(`${i}`, i * 48 - 36, 144, 14);
  for (let i = 0; i < 3; i++) if (palaceGardenOffered(p, i)) gfx.drawStringWithShadow(String.fromCharCode(0x41 + i), i * 120 + 40, 160, 14);
  ui.present();

  if (palaceCanUpgrade(p)) {
    let section = -1;
    while (section === -1) {
      const s = palaceSectionFromInput(await nextKeyOrClick(ui));
      if (palaceSectionAccepted(p, s)) section = s;
    }
    section = normalizePalaceSection(p, section);
    gfx.copy(1, 0, 0, 320, 200, 0, 0, 0);
    let type: number | undefined;
    if (section < 9) {
      type = await selectSectionType(ui, assets, p, section);
      drawPalace(gfx, assets, p);
      gfx.copy(1, 0, 0, 320, 200, 0, 0, 0);
    }
    upgradePalace(state, section, type);
    drawPalace(gfx, assets, p);
    ui.input.clear();
    await ui.dissolve(1);
    await ui.waitKeyOrClick();
  }
  ui.playTune(TUNE.stop);
  gfx.fontId = savedFont;
}

/** Ekran „Select new section.” (L035d–L070a): trzy style nowej części na niebieskich polach; zwraca styl 0–2. */
async function selectSectionType(ui: Ui, assets: GameAssets, p: PalaceState, section: number): Promise<number> {
  const gfx = ui.gfx;
  const level = palaceNewLevel(p, section);
  const pieces = emptyPieces();
  setPieces(p, pieces, section, 0);
  for (let i = 1; i <= 3; i++) pieces[i] = [...pieces[section]!];
  const bitmaps = emptyBitmaps();
  const graphics = hasPalaceGraphics(assets);
  if (graphics) {
    // ekran 1 trzyma pałac — kawałki wycinamy przez kopię zapasową
    const backup = gfx.cut(1, 0, 0, 320, 200);
    cutPieces(gfx, assets, p, pieces, 1 << level, 0, bitmaps);
    gfx.screens[1].blit(backup, 0, 0, 320, 200, 0, 0);
  }
  gfx.fillRect(16, 2, 288, 102, 9);
  gfx.drawCenteredString('Select new section.', 160, 3, 15);
  const kind = sectionKind(p.levels, section);
  const put = (bitmap: Surface | null, x: number, y: number) => {
    if (bitmap) gfx.drawBitmap(bitmap, x, y);
  };
  for (let i = 1; i <= 3; i++) {
    let x = i * 100 - 80;
    gfx.fillRect(x, 10, 80, 92, 1);
    x += 16;
    const b = bitmaps[i]!;
    const yOf = (piece: number) => pieceY(level, i - 1, piece) + 1;
    switch (kind) {
      case 0:
        if (section !== 1) put(b[1]!, x + W[3], yOf(1));
        put(b[0]!, x, yOf(3));
        x += W[3];
        break;
      case 1:
        put(b[0]!, x, yOf(1));
        x += W[1];
        put(b[1]!, x, yOf(2));
        break;
      case 2:
        put(b[0]!, x, yOf(0));
        break;
      case 3:
        if (section !== 7) {
          put(b[0]!, x, yOf(1));
          x += W[1];
        }
        put(b[1]!, x - (i === 2 ? 3 : 2), yOf(4));
        break;
    }
    gfx.drawStringWithShadow(`${i}`, i * 100 - 44, 12, 15);
  }
  ui.input.clear();
  ui.present();
  for (;;) {
    const e = await nextKeyOrClick(ui);
    if (isKey(e)) {
      const type = e.key.length === 1 ? e.key.charCodeAt(0) - 0x31 : -1;
      if (type >= 0 && type <= 2) return type;
    } else if (e.type === 'mousedown') {
      return Math.min(2, Math.trunc(e.x / 107));
    }
  }
}

/**
 * Widok pałacu po kliknięciu w mini-pałac w panelu (PlayerTurn: x < 80, 58 ≤ y < 72): pałac z paletą CBACK.PIC
 * do klawisza lub kliknięcia; potem wywołujący odtwarza mapę z wygaszeniem.
 */
export async function showPalaceView(ui: Ui, assets: GameAssets, state: GameState): Promise<void> {
  const gfx = ui.gfx;
  drawPalace(gfx, assets, palaceOf(state));
  gfx.fillRect(0, 0, 320, 200, 0);
  applyPalacePalette(gfx, assets);
  gfx.copy(1, 0, 0, 320, 200, 0, 0, 0);
  ui.input.clear();
  ui.present();
  await ui.waitKeyOrClick();
}

/**
 * F0_1238_14a3_DrawMiniPalace: linia podstawy (x−5…x+68, y+13, kolor 2) i części 7×15 z SP257.PIC
 * (Array_d21c: (160 + 7k, 16·styl), k = (poziom − 1)·5 + kawałek) w (x + 7i, y − 1).
 */
export function drawMiniPalace(gfx: Gfx, assets: GameAssets, state: GameState, player: number, buildCount: number, x: number, y: number): void {
  gfx.drawLine(x - 5, y + 13, x + 68, y + 13, 2);
  const m = miniPalace(state, player, buildCount);
  if (!m) return;
  const sheet = assets.pic('SP257.PIC');
  for (let i = 0; i < 9; i++) {
    const level = m.levels[i]!;
    if (level <= 0) continue;
    const k = Math.min(3, Math.max(0, level - 1)) * 5 + miniPalacePiece(m, i);
    const type = Math.min(2, Math.max(0, m.types[i]!));
    gfx.screen.blit(sheet, 160 + 7 * k, 16 * type, 7, 15, i * 7 + x, y - 1, true);
  }
}
