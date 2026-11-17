/**
 * Civilopedia — encyklopedia gry w układzie oryginału. Port Overlay 8 (Encyclopedia.cs w OpenCivOne, MIT), sprawdzony
 * z dosłownym tłumaczeniem asemblera (`Segments/Overlay_8.cs` z pierwszego commitu wzorca):
 *   F8_0000_0000 ShowEncyclopedia      — pętla stron listy (MORE przesuwa o 78 tematów),
 *   F8_0000_0066 ShowEncyclopediaWindow — lista tematów w kolumnach (sortowanie wyborem jak w oryginale),
 *   F8_0000_062a DisplayEncyclopediaTopic — strona tematu (rysunek, nagłówek, opis, dane z tabel),
 *   F8_0000_16f7 DrawEncyclopediaImage, F8_0000_16c4/1790/17c3 — numery rysunków w plikach ICONPG*.PIC.
 *
 * Rodzaje tematów jak w oryginale: -1 wszystkie (Complete), 0 technologie, 1 budynki i cuda, 2 jednostki, 3 tereny,
 * 4 pojęcia gry. Ta sama cyfra wybiera plik opisów BLURB0–4.TXT z kopii gry gracza; bez pliku — własne teksty
 * z `data/civilopediaText.ts`.
 *
 * Napisy stałe (`CIVILOPEDIA_STRINGS`) są odczytane z CIV.EXE (`npm run extract`): wzorzec po refaktoryzacji zmienił część
 * z nich (tytuł listy to „ENCYCLOPAEDIA of CIVILIZATION”, wymaganie −1 to pusty napis spod DS:0x4c4).
 */
import { BUILDINGS, improvementDef, TECHS, TERRAIN, TERRAIN_MODIFICATIONS, UNITS, type GameState } from '@civ-remake/engine';
import { prepareSprites, type MapSprites } from '@civ-remake/gfx';
import type { GameAssets } from '../assets';
import type { Gfx } from '../gfx';
import { vga6to8 } from '../palette';
import { textSection } from '../text';
import type { Ui } from '../ui';
import { ownCivilopediaText } from '../data/civilopediaText';
import { CIVILOPEDIA_STRINGS, GAME_CONCEPTS, TECH_PICTURES, TERRAIN_PICTURES, UNIT_PICTURES } from '../data/screenTables';
import { drawRandomFoodIcons } from './newGame';
import { drawImprovementIcon, trimToWidth } from './advisors';

/** Rodzaje tematów (EncyclopediaTopicEnum oryginału − 1; -1 = lista wszystkich). */
export const Topic = { All: -1, Technology: 0, Improvement: 1, Unit: 2, Terrain: 3, Concept: 4 } as const;
export type TopicType = 0 | 1 | 2 | 3 | 4;

/**
 * Pojęcia gry (Array_3c64), napisy stron, numery rysunków (F8_0000_16c4/1790/17c3) — z CIV.EXE (data/screenTables).
 * Rysunki: indeks = numer rysunku, wartość = temat; tablica technologii ma 72 bajty (ostatnie 4 to już początek tablicy
 * jednostek) — tyle czyta pętla oryginału.
 */
export { CIVILOPEDIA_STRINGS, GAME_CONCEPTS };

const pictureOf = (table: readonly number[], topic: number) => table.indexOf(topic);

export interface CivilopediaContext {
  readonly ui: Ui;
  readonly assets: GameAssets;
  readonly state: GameState;
}

export interface CivilopediaItem {
  readonly type: TopicType;
  readonly index: number;
  readonly name: string;
}

/** Nazwa tematu z tabel silnika (jak w oryginale: teren 0–11, budynki 1–24 i cuda 25–45). */
export function topicName(type: TopicType, index: number): string {
  switch (type) {
    case 0: return TECHS[index]?.name ?? '';
    case 1: return improvementDef(index).name;
    case 2: return UNITS[index]?.name ?? '';
    case 3: return TERRAIN[index]?.name ?? '';
    case 4: return GAME_CONCEPTS[index] ?? '';
  }
}

/** Zakresy indeksów tematów w pętlach F8_0000_0066. */
const TOPIC_RANGES: readonly (readonly [number, number])[] = [[0, 67], [1, 46], [0, 28], [0, 12], [0, 21]];

/** stricmp z biblioteki MS C: porównanie po zamianie na małe litery. */
function stricmp(a: string, b: string): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    const d = x.charCodeAt(i) - y.charCodeAt(i);
    if (d !== 0) return d;
  }
  return x.length - y.length;
}

/**
 * Kolejny temat listy jak w F8_0000_0066: najmniejsza nazwa ściśle większa od poprzedniej (początkowo "a", górna granica
 * "zzz"); przy równych nazwach wygrywa wcześniejszy rodzaj, a temat o tej samej nazwie z dalszego rodzaju znika z listy.
 */
function nextTopic(listType: number, previous: string): CivilopediaItem | null {
  let best = 'zzz';
  let found: CivilopediaItem | null = null;
  for (let type = 0 as TopicType; type <= 4; type++) {
    if (listType !== -1 && listType !== type) continue;
    const [from, to] = TOPIC_RANGES[type]!;
    for (let j = from; j < to; j++) {
      const name = topicName(type, j);
      if (stricmp(name, previous) > 0 && stricmp(name, best) < 0) {
        found = { type, index: j, name };
        best = name;
      }
    }
  }
  return found;
}

/** Pełna lista tematów danego rodzaju w kolejności oryginału. */
export function civilopediaTopics(listType: number): CivilopediaItem[] {
  const items: CivilopediaItem[] = [];
  let previous = 'a';
  for (let item = nextTopic(listType, previous); item; item = nextTopic(listType, previous)) {
    items.push(item);
    previous = item.name;
  }
  return items;
}

/** Tekst opisu: plik BLURB<rodzaj>.TXT z kopii gry (klucz *NAZWA albo *NAZWA2), a bez pliku — własny tekst. */
export function civilopediaText(assets: GameAssets, type: TopicType, name: string, second: boolean): string | null {
  const file = assets.optional(`BLURB${type}.TXT`);
  if (file) return textSection(file, `*${name.toUpperCase()}${second ? '2' : ''}`);
  return ownCivilopediaText(type, name, second);
}

/**
 * F8_0000_0000 ShowEncyclopedia: listy kolejnych stron aż do wyjścia (EXIT, prawy przycisk, klawisz).
 * Na koniec oryginał przerysowuje mapę z wygaszeniem — robi to wywołujący (ekran gry).
 */
export async function showCivilopedia(ctx: CivilopediaContext, listType: number): Promise<void> {
  let start = 0;
  for (;;) {
    const { result, more } = await showCivilopediaWindow(ctx, listType, start);
    if (result === -2) break;
    if (result === -1) start = more ? start + 78 : 0;
  }
}

/** Układ listy (do testów i obsługi myszy). */
export interface CivilopediaPage {
  readonly items: readonly CivilopediaItem[];
  /** Szerokość kolumny: 100 (wszystkie, technologie) albo 150. */
  readonly columnWidth: number;
  /** Var_6808: strona zapełniona do końca — MORE pokaże następną (inaczej wraca do początku). */
  readonly more: boolean;
}

/** F8_0000_0066 — rysunek listy od tematu `start`. */
export function drawCivilopediaPage(ctx: CivilopediaContext, listType: number, start: number): CivilopediaPage {
  const g = ctx.ui.gfx;
  g.fillRect(0, 0, 320, 200, 14);
  g.fillRect(60, 2, 200, 9, 15);
  g.drawCenteredString(CIVILOPEDIA_STRINGS.title, 161, 4, 0);
  g.drawCenteredString(CIVILOPEDIA_STRINGS.title, 160, 3, 10);
  g.drawString(CIVILOPEDIA_STRINGS.exit, 286, 4, 12);
  if (listType === -1) g.drawString(CIVILOPEDIA_STRINGS.more, 8, 4, 12);
  g.fillRect(2, 14, 316, 184, 15);
  const columnWidth = listType <= 0 ? 100 : 150;
  const items: CivilopediaItem[] = [];
  let x = 10;
  let y = 16;
  let count = 0;
  let previous = 'a';
  while (x < 300) {
    const item = nextTopic(listType, previous);
    if (!item) break;
    if (count >= start) {
      g.drawString(trimToWidth(g, item.name, columnWidth), x, y, 0);
      items.push(item);
      y += 7;
      if (y > 192) {
        x += columnWidth;
        y = 16;
      }
    }
    count++;
    previous = item.name;
  }
  return { items, columnWidth, more: x >= 300 };
}

/**
 * F8_0000_0066 z obsługą myszy (oryginał z myszą): klik w temat — strona tematu, potem lista od nowa; klik nad listą
 * w pierwszej kolumnie — MORE (-1), w pozostałych — wyjście (-2); prawy przycisk i każdy klawisz — wyjście.
 * Tryb bez myszy (Var_1a3c = 0: ramka wyboru, strzałki, M, Esc/X) pominięty — aplikacja zawsze ma mysz.
 */
export async function showCivilopediaWindow(ctx: CivilopediaContext, listType: number, start: number): Promise<{ result: number; more: boolean }> {
  const ui = ctx.ui;
  const page = drawCivilopediaPage(ctx, listType, start);
  ui.present();
  const e = await ui.waitKeyOrClick();
  let column: number;
  let row: number;
  if (e.type === 'mousedown' && e.button !== 'right') {
    column = Math.trunc((e.x - 10) / page.columnWidth);
    row = e.y >= 16 ? Math.trunc((e.y - 16) / 7) : -1;
  } else {
    column = 2;
    row = -1;
  }
  const selected = 26 * column + row;
  ui.input.clear();
  if (row < 0) return { result: column !== 0 ? -2 : -1, more: page.more };
  if (selected >= page.items.length) return { result: 0, more: page.more };
  const item = page.items[selected]!;
  await showCivilopediaTopic(ctx, item.type, item.index);
  ui.input.clear();
  return { result: selected, more: page.more };
}

export interface TopicOptions {
  /**
   * Var_3c62: strona bez rysunku (pomoc z listy produkcji, rozmowa z władcą) — tło w kolorze 255, nagłówek
   * na środku ekranu, bez zmiany palety.
   */
  readonly noPicture?: boolean;
}

/** Wynik rysowania strony tematu (dla testów). */
export interface TopicPage {
  readonly background: number;
  readonly headerX: number;
  /** Rysunek z pliku ICONPG / CITYPIX2 (nazwa pliku) albo null. */
  readonly picture: string | null;
  readonly lines: string[];
}

/** F8_0000_062a DisplayEncyclopediaTopic: strona tematu; czeka na klawisz albo kliknięcie (po opisie — dwa razy). */
export async function showCivilopediaTopic(ctx: CivilopediaContext, type: TopicType, index: number, options: TopicOptions = {}): Promise<TopicPage> {
  const { ui, assets, state } = ctx;
  const g = ui.gfx;
  const noPicture = options.noPicture === true;
  const lines: string[] = [];
  const draw = (text: string, x: number, y: number, color: number, centered = false) => {
    lines.push(text);
    if (centered) g.drawCenteredString(text, x, y, color);
    else g.drawString(text, x, y, color);
  };

  // tło: kolor 255 albo 253 ustawiony na jasnoszary (61,61,61) — wariant VGA (Var_d762 ≠ 0)
  const background = noPicture ? 255 : 253;
  const setBackgroundColor = () => g.palette.setColor(253, vga6to8(61), vga6to8(61), vga6to8(61));
  if (!noPicture) {
    setBackgroundColor();
    g.paletteVersion++;
  }
  g.fillRect(0, 0, 320, 200, background);
  drawRandomFoodIcons(ui);
  const oldFont = g.fontId;
  g.fontId = 7;

  let headerX = 204;
  if (type === 2) headerX = 224;
  if (type === 4 || (type === 1 && index > 24) || noPicture) headerX = 160;

  const name = topicName(type, index);
  let picture: string | null = null;
  const loadPicture = (file: string, palette: string | null): boolean => {
    if (!assets.has(file)) return false;
    g.loadPic(1, 0, 0, assets.pic(file));
    const pal = palette ? assets.optional(palette) : undefined;
    if (pal) g.setPaletteFromFile(pal);
    picture = file;
    return true;
  };

  switch (type) {
    case 0: {
      if (!noPicture) {
        const n = pictureOf(TECH_PICTURES, index);
        if (n >= 0 && loadPicture(`ICONPG${Math.trunc(n / 9) + 1}.PIC`, 'ICONPG1.PAL')) {
          drawEncyclopediaImage(g, (n % 3) * 111 + 1, Math.trunc((n % 9) / 3) * 69 + 1, 110, 68, 62, 42);
        }
      }
      draw(CIVILOPEDIA_STRINGS.technology, headerX, 36, 7, true);
      break;
    }
    case 1: {
      if (index > 1 && index <= 21 && !noPicture && loadPicture('CITYPIX2.PIC', 'HILL.PAL')) {
        const i = index - 2;
        g.drawBitmap(g.cut(1, (i >> 2) * 50 + 1, (i & 3) * 50 + 1, 49, 49), 37, 17);
      }
      draw(index > 24 ? CIVILOPEDIA_STRINGS.wonder : CIVILOPEDIA_STRINGS.cityImprovement, headerX, 36, 7, true);
      break;
    }
    case 2: {
      if (!noPicture) {
        const n = pictureOf(UNIT_PICTURES, index);
        if (n >= 0 && loadPicture(`ICONPG${String.fromCharCode(65 + Math.trunc(n / 6))}.PIC`, 'ICONPGA.PAL')) {
          drawEncyclopediaImage(g, (n & 1) * 160 + 1, ((n % 6) >> 1) * 61, 158, 61, 88, 42);
        }
      }
      draw(CIVILOPEDIA_STRINGS.unit, headerX, 36, 7, true);
      // Array_d4ce[96 + typ]: jednostka w kolorach gracza 1
      drawUnitSprite(g, ctx.assets, 1, index, 216, 48);
      break;
    }
    case 3: {
      if (!noPicture) {
        const n = pictureOf(TERRAIN_PICTURES, index);
        if (n >= 0 && loadPicture(`ICONPGT${Math.trunc(n / 6) + 1}.PIC`, 'SP256.PAL')) {
          setBackgroundColor();
          g.paletteVersion++;
          drawEncyclopediaImage(g, (n % 3) * 107 + 1, Math.trunc((n % 6) / 3) * 87 + 5, 106, 77, 76, 46);
        }
      }
      draw(CIVILOPEDIA_STRINGS.terrain, headerX, 36, 7, true);
      break;
    }
    case 4:
      draw(CIVILOPEDIA_STRINGS.concept, headerX, 36, 7, true);
      break;
  }

  g.fontId = 6;
  draw(name.toUpperCase(), headerX, 20, 0, true);
  g.fontId = 7;

  // opis (*NAZWA) przy włączonej opcji „Civilopedia Text”: osobna strona zamykana klawiszem
  if (state.settings.civilopediaText) {
    const text = civilopediaText(assets, type, name, false);
    if (text !== null) {
      lines.push(text);
      g.drawTextBlock(12, 76, text, 296, 1);
      ui.present();
      await ui.waitKeyOrClick();
      g.fillRect(8, 76, 304, 116, background);
    }
  }

  let y = 76;
  // zasady (*NAZWA2) — zawsze, poza technologiami
  if (type !== 0) {
    const text2 = civilopediaText(assets, type, name, true);
    if (text2 !== null) {
      lines.push(text2);
      y = g.drawTextBlock(12, y, text2, 288, 1);
    }
    y += 8;
  }

  switch (type) {
    case 0:
      y = drawTechnologyDetails(ctx, index, y, background, headerX, draw);
      break;
    case 1: {
      const def = improvementDef(index);
      draw(`${CIVILOPEDIA_STRINGS.requires}${techOrNone(def.requiredTech)}`, 12, y, 9);
      y += 8;
      draw(`${CIVILOPEDIA_STRINGS.cost}${10 * def.cost}${CIVILOPEDIA_STRINGS.shields}`, 12, y, 9);
      y += 8;
      // cuda nie mają utrzymania (w tabeli oryginału 0)
      draw(`${CIVILOPEDIA_STRINGS.maintenance}${index <= 24 ? BUILDINGS[index - 1]!.upkeep : 0}`, 12, y, 12);
      y += 8;
      break;
    }
    case 2: {
      const def = UNITS[index]!;
      draw(`${CIVILOPEDIA_STRINGS.requires}${techOrNone(def.requiredTech)}${index === 25 ? CIVILOPEDIA_STRINGS.andNuclearFission : ''}`, 100, y, 9);
      y += 8;
      draw(`${CIVILOPEDIA_STRINGS.unitCost}${10 * def.cost}${CIVILOPEDIA_STRINGS.unitCostSuffix}`, 100, y, 9);
      y += 8;
      draw(`${CIVILOPEDIA_STRINGS.attack}${def.attack}`, 100, y, 12);
      y += 8;
      draw(`${CIVILOPEDIA_STRINGS.defense}${def.defense}`, 100, y, 12);
      y += 8;
      draw(`${CIVILOPEDIA_STRINGS.moves}${def.moves}`, 100, y, 0);
      y += 8;
      break;
    }
    case 3:
      y = drawTerrainDetails(index, y, draw);
      break;
  }

  g.fontId = 1;
  ui.present();
  await ui.waitKeyOrClick();
  // Var_3934 == -1 (poza rozmową z władcą): wnętrze ekranu czyszczone kolorem tła
  g.fillRect(8, 8, 304, 184, background);
  g.fontId = oldFont;
  return { background, headerX, picture, lines };
}

type DrawText = (text: string, x: number, y: number, color: number, centered?: boolean) => void;

const techOrNone = (tech: number) => (tech >= 0 ? (TECHS[tech]?.name ?? '') : CIVILOPEDIA_STRINGS.noTech);

/** Część F8_0000_062a dla technologii (L0bb5–L0f2b): wymagania, „Allows:”, jednostki i budynki, źródło technologii. */
function drawTechnologyDetails(ctx: CivilopediaContext, topic: number, y: number, background: number, headerX: number, draw: DrawText): number {
  const { state } = ctx;
  const g = ctx.ui.gfx;
  y += 8;
  const tech = TECHS[topic]!;
  let requires = '';
  if (tech.prereq1 !== -1) requires = `Requires ${TECHS[tech.prereq1]!.name}`;
  if (tech.prereq2 !== -1) requires += ` and ${TECHS[tech.prereq2]!.name}`;
  draw(requires, 32, y, 1);
  y += 16;
  draw('Allows: ', 32, y, 1);
  y += 8;
  const start = y;
  for (const other of TECHS) {
    if (other.prereq1 === topic) {
      draw(`${other.name}${other.prereq2 !== -1 ? ` (with ${TECHS[other.prereq2]!.name})` : ''}`, 40, y, 9);
      y += 8;
    }
    if (other.prereq2 === topic) {
      draw(`${other.name}${other.prereq1 !== -1 ? ` (with ${TECHS[other.prereq1]!.name})` : ''}`, 40, y, 9);
      y += 8;
    }
  }
  y += 4;
  const human = state.humanPlayer;
  UNITS.forEach((u, i) => {
    if (u.requiredTech !== topic) return;
    drawUnitSprite(g, ctx.assets, human, i, 40, y - 4);
    draw(`${u.name} unit`, 60, y, 12);
    y += 12;
  });
  for (let i = 1; i <= 45; i++) {
    const def = improvementDef(i);
    if (def.requiredTech !== topic) continue;
    drawImprovementIcon(g, ctx.assets, i, 40, y - 2);
    draw(`${def.name}${i > 24 ? ' Wonder' : ' improvement'}`, 60, y, 2);
    y += 12;
  }
  // nic nie wynika z tej technologii — „Allows:” zamazane kolorem tła
  if (start + 4 === y) g.drawString('Allows: ', 32, y - 12, background);
  const source = state.players[human]?.techSource?.[topic] ?? -1;
  let from = '';
  if (source === -2) from = '(from Great Library)';
  else if (source === 0) from = '(Discovered)';
  else if (source > 0) from = `(Taken from ${state.players[source]?.nationPlural ?? ''})`;
  if (from) draw(from, headerX, 48, 7, true);
  return y;
}

/** Część F8_0000_062a dla terenu (L11ca–L1636): plony z nawadnianiem/kopalnią/drogą, wariant z zasobem, ruch i obrona. */
function drawTerrainDetails(topic: number, y: number, draw: DrawText): number {
  const mod = TERRAIN_MODIFICATIONS[topic]!;
  const base = TERRAIN[topic]!;
  for (let i = topic; i <= topic + 12; i += 12) {
    // teren z zasobem (12 dalej) pomijany, gdy teren podstawowy daje 2 żywności (łąka, rzeka)
    if (i !== topic && base.food === 2) continue;
    const t = TERRAIN[i]!;
    draw(t.name, 12, y, 1);
    y += 8;
    if (t.food !== 0 || mod.irrigationEffect < -1) {
      let s = `Food: ${t.food}${t.food >= 3 ? '*' : ''}`;
      if (mod.irrigationEffect < -1) s += ` (${t.food - mod.irrigationEffect - 1}${t.food >= 2 ? '*' : ''} with Irrigation)`;
      draw(`${s} units.`, 16, y, 9);
      y += 8;
    }
    if (t.production !== 0 || mod.miningEffect < -1) {
      let s = `Production: ${topic === 2 || topic === 11 ? '0/' : ''}${t.production}`;
      if (mod.miningEffect < -1) {
        const mined = t.production - mod.miningEffect - 1;
        s += ` (${mined}${mined >= 3 ? '*' : ''} with Mining)`;
      }
      draw(`${s} units.`, 16, y, 9);
      y += 8;
    }
    if (t.trade !== 0 || topic <= 2) {
      let s = `Trade: ${t.trade}${t.trade !== 0 ? '%' : ''}${t.trade >= 3 ? '*' : ''}`;
      if (topic <= 2) s += ` (${t.trade + 1}% with Roads)`;
      draw(s, 16, y, 9);
      y += 8;
    }
    if (i === 7) {
      draw('nothing', 16, y, 9);
      y += 8;
    }
    y += 4;
  }
  draw('*  -1 if government is Despotism/Anarchy.', 16, y, 9);
  y += 8;
  draw('%  +1 if government is Republic/Democracy.', 16, y, 9);
  y += 12;
  draw(`Movement cost: ${base.movementCost} MP`, 12, y, 12);
  y += 8;
  draw(`Defense bonus: +${50 * base.defenseBonus - 100}%`, 12, y, 12);
  y += 8;
  return y;
}

/** F8_0000_16f7 DrawEncyclopediaImage: fragment ekranu 1 wyśrodkowany w punkcie (xOffset, yOffset) ekranu 0. */
export function drawEncyclopediaImage(g: Gfx, x: number, y: number, width: number, height: number, xOffset: number, yOffset: number): void {
  if (x + width > 319) width = 319 - x;
  if (y + height > 199) height = 199 - y;
  if (xOffset < Math.trunc(width / 2)) {
    x += Math.trunc(width / 2) - xOffset;
    width = xOffset * 2;
  }
  g.copy(1, x, y, width, height, 0, xOffset - Math.trunc(width / 2), yOffset - Math.trunc(height / 2));
}

const spriteCache = new WeakMap<GameAssets, MapSprites>();

/** Jednostka w kolorach gracza (Array_d4ce[64 + typ + gracz·32]) z przezroczystością. */
function drawUnitSprite(g: Gfx, assets: GameAssets, player: number, type: number, x: number, y: number): void {
  let sprites = spriteCache.get(assets);
  if (!sprites) {
    sprites = prepareSprites({ ter: assets.pic('TER257.PIC'), sp: assets.pic('SP257.PIC'), sp299: assets.pic('SP299.PIC') });
    spriteCache.set(assets, sprites);
  }
  const s = sprites.units[player]?.[type];
  if (!s) return;
  for (let j = 0; j < s.h; j++) {
    for (let i = 0; i < s.w; i++) {
      const c = s.pixels[j * s.w + i]!;
      if (c !== 0 && g.screen.contains(x + i, y + j)) g.screen.setPixel(x + i, y + j, c);
    }
  }
}
