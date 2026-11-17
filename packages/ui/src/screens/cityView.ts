/**
 * Panorama miasta — CityView.F19_0000_0000_ShowCityLayout i funkcje pomocnicze: F19_0000_0ff4 (ulica),
 * F19_0000_102e (dom), F19_0000_106c (budynek albo cud), F19_0000_111f (mieszkańcy z POP.PIC),
 * F19_0000_137f (wycinanie rysunków), F19_0000_1606 (rysunek cudu), animacje F19_0000_167b (najazd),
 * F19_0000_18c1 (zamieszki), F19_0000_1ae1 („We love the King”). Źródło: dosłowne tłumaczenie asemblera z pierwszego
 * commitu wzorca OpenCivOne (MIT), `Overlay_19.cs`; tam, gdzie nowsza wersja `CityView.cs` się różni, idziemy
 * za asemblerem (m.in. elektrownia od x = 45 przy Wielkim Murze, komunikacja miejska z rysunków 21 i 11, wymiary cudów
 * x2 − x1 + 1, położenie cudu liczone z wiersza siatki, nazwa i rok w dwóch wierszach).
 *
 * Rozkład domów, ulic i budynków liczy silnik (`cityViewLayout`, ustawia ziarno generatora gry jak oryginał).
 * `item` (parametr wonderID oryginału): −1 widok z okna miasta (z mieszkańcami), −2 tło do animacji (bez czekania),
 * −3 rozjaśnienie z HILL.PAL; ≥ 0 — numer nowego budynku (1–24) albo 24 + numer cudu: najpierw panorama bez niego,
 * po 60 jednostkach zegara nowa wersja wchodzi efektem rozpuszczania.
 *
 * Bez plików HILL.PIC i CITYPIX1–3.PIC — wariant uproszczony: czarne tło z nazwą miasta albo komunikatem.
 */
import {
  BACKGROUND_WONDERS, BuildingId, cityName, cityViewCell, cityViewLayout, hasBuilding, playerHasTech, processCity, specialistAt, Tech,
  type CityViewLayout, type GameState,
} from '@civ-remake/engine';
import type { GameAssets } from '../assets';
import { measureText } from '../font';
import type { Gfx } from '../gfx';
import { showMenuBox } from '../menuBox';
import { Palette, readPaletteRange } from '../palette';
import { PaletteCycles } from '../paletteCycle';
import { Surface } from '../surface';
import { yearToString } from '../text';
import type { Ui } from '../ui';

/**
 * Prostokąty cudów na WONDERS.PIC / WONDERS2.PIC (x1, y1, x2, y2) — tablica w danych CIV.EXE przepisana ze wzorca
 * (do dodania do `npm run extract`); F19_0000_1606 zamienia x2/y2 na szerokość i wysokość = x2 − x1 + 1, y2 − y1 + 1.
 */
export const WONDER_RECTS: readonly (readonly [number, number, number, number])[] = [
  [0, 0, 0, 0], [131, 54, 318, 82], [159, 149, 227, 198], [88, 97, 211, 135], [229, 116, 268, 198], [61, 117, 101, 172],
  [164, 97, 227, 147], [1, 38, 66, 118], [268, 53, 318, 114], [9, 117, 59, 172], [126, 1, 182, 53], [276, 1, 318, 51],
  [103, 139, 157, 198], [184, 1, 224, 69], [40, 69, 101, 115], [1, 14, 147, 33], [253, 1, 274, 47], [226, 1, 251, 47],
  [103, 79, 162, 137], [270, 116, 318, 198], [63, 1, 124, 54], [240, 60, 266, 114],
];
const wonderHeight = (w: number) => WONDER_RECTS[w]![3] - WONDER_RECTS[w]![1] + 1;

/** Przesunięcia postaci w animacjach zamieszek i święta (Array_4f42). */
const FIGURE_OFFSETS = [-96, -36, 0, -56] as const;

interface Bitmaps {
  houses: (Surface | null)[];
  roads: (Surface | null)[];
  /** Indeks i = budynek o numerze i + 2 (21 i 22: tory i mur). */
  buildings: (Surface | null)[];
  wonders: (Surface | null)[];
}

/** Czy są pliki do narysowania panoramy. */
export function hasCityViewGraphics(assets: GameAssets): boolean {
  return ['HILL.PIC', 'CITYPIX1.PIC', 'CITYPIX2.PIC', 'CITYPIX3.PIC'].every((f) => assets.has(f));
}

/** F19_0000_137f_LoadCityViewBitmaps: domy (CITYPIX1), ulice (bez/z Automobile), budynki (CITYPIX2/3 wg Combustion), cuda. */
function loadBitmaps(gfx: Gfx, assets: GameAssets, state: GameState, cityId: number, item: number): Bitmaps {
  const city = state.cities[cityId]!;
  const owner = city.owner;
  const b: Bitmaps = { houses: new Array(20).fill(null), roads: new Array(16).fill(null), buildings: new Array(23).fill(null), wonders: new Array(22).fill(null) };
  gfx.loadPic(1, 0, 0, assets.pic('CITYPIX1.PIC'));
  for (let i = 0; i < 5; i++) {
    const x = i * 64;
    b.houses[i * 4] = gfx.cut(1, x + 1, 1, 31, 31);
    b.houses[i * 4 + 1] = gfx.cut(1, x + 33, 1, 31, 31);
    b.houses[i * 4 + 2] = gfx.cut(1, x + 1, 33, 31, 31);
    b.houses[i * 4 + 3] = gfx.cut(1, x + 33, 33, 31, 31);
  }
  const roadY = playerHasTech(state, owner, Tech.Automobile) ? 81 : 65;
  for (let i = 0; i < 16; i++) b.roads[i] = gfx.cut(1, (i & 7) * 24, roadY + (i >> 3) * 8, 24, 8);
  gfx.loadPic(1, 0, 0, assets.pic(playerHasTech(state, owner, Tech.Combustion) ? 'CITYPIX3.PIC' : 'CITYPIX2.PIC'));
  for (let i = 0; i < 23; i++) {
    if (((city.buildings >>> (i + 1)) & 1) !== 0 || item - 1 === i || i > 20) {
      b.buildings[i] = gfx.cut(1, (i >> 2) * 50 + 1, (i & 3) * 50 + 1, 49, 49);
    }
  }
  for (const [file, background] of [['WONDERS.PIC', false], ['WONDERS2.PIC', true]] as const) {
    if (!assets.has(file)) continue;
    gfx.loadPic(1, 0, 0, assets.pic(file));
    for (let w = 1; w < 22; w++) {
      if (state.wonderCity[w] !== cityId || (((1 << w) & BACKGROUND_WONDERS) !== 0) !== background) continue;
      const [x1, y1, x2, y2] = WONDER_RECTS[w]!;
      b.wonders[w] = gfx.cut(1, x1, y1, x2 - x1 + 1, y2 - y1 + 1);
    }
  }
  return b;
}

/** Usunięcie ulic, przy których nic nie stoi (pętla L0a2f); sąsiedzi wg siatki z przesuniętymi wierszami. */
function pruneStreets(layout: CityViewLayout): void {
  for (let y = 0; y < 12; y++) {
    for (let x = 0; x < 19; x++) {
      if (cityViewCell(layout, x, y) !== -2) continue;
      let found = false;
      for (let d = 1; d < 9; d++) {
        const [nx, ny] = neighbour(x, y, d);
        if (cityViewCell(layout, nx, ny) >= 0) found = true;
      }
      if (!found) layout.cells[x * 12 + y] = -1;
    }
  }
}

/** Sąsiad pola w kierunku 1–8 (MoveDirections) z przesunięciem wierszy parzystych/nieparzystych. */
function neighbour(x: number, y: number, d: number): [number, number] {
  const [dx, dy] = DIRS[d]!;
  const off = (y & 1) === 0 ? (dy > 0 ? -1 : 0) : dy < 0 ? 1 : 0;
  return [x + off + dx, y + dy];
}
const DIRS = [[0, 0], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]] as const;

/** Panorama na ekranie 1 (pętla od L0913 do napisu): wzgórze, cuda w tle, elektrownia, ulice, domy, budynki, mury, tory, tytuł. */
function drawScene(ui: Ui, assets: GameAssets, state: GameState, cityId: number, layout: CityViewLayout, b: Bitmaps, item: number, message: string | null): void {
  const gfx = ui.gfx;
  const s1 = gfx.screens[1];
  const city = state.cities[cityId]!;
  const put = (bitmap: Surface | null | undefined, x: number, y: number) => {
    if (bitmap) gfx.drawBitmap(bitmap, x, y, 1);
  };
  const clampX = (v: number) => Math.min(999, Math.max(0, v));
  gfx.loadPic(1, 0, 0, assets.pic('HILL.PIC'));
  // cuda w tle: 1, 15 (zamiast 2), 3…7
  for (let i = 1; i < 8; i++) {
    const w = i === 2 ? 15 : i;
    if (state.wonderCity[w] !== cityId || w + 24 === item || ((1 << w) & BACKGROUND_WONDERS) === 0) continue;
    const [x1, y1] = WONDER_RECTS[w]!;
    put(b.wonders[w], (w === 3 ? 80 : 0) + (x1 < 10 ? -1 : 2) + x1, w <= 7 ? 0 : y1 - 6);
  }
  if (hasBuilding(city, BuildingId.PowerPlant) && item !== BuildingId.PowerPlant) {
    for (let x = state.wonderCity[7] === cityId ? 45 : 0; x < 310; x += 45) put(b.buildings[17], x, 2);
  }
  pruneStreets(layout);
  const road = (x: number, y: number, index: number) => put(b.roads[index], (y & 1) * 8 + x * 16 - 5, y * 8 + 50);
  const house = (x: number, y: number, i1: number, i2: number) => put(b.houses[i1 + i2 * 4], ((y & 1) << 3) + (x << 4), (y << 3) + 26);
  for (let y = 0; y < 12; y++) {
    for (let x = 0; x < 19; x++) {
      const v = cityViewCell(layout, x, y);
      if (v === -1 && x > 2 && cityViewCell(layout, x - 1, y) !== -1 && ((x + y) & 1) !== 0) road(x, y, 0);
      if (v === -1 || v === 15) continue;
      if (v === -2) {
        let flag = 0;
        for (let d = 1; d < 9; d += 2) {
          flag >>= 1;
          const [nx, ny] = neighbour(x, y, d);
          if (cityViewCell(layout, nx, ny) === -2) flag |= 8;
        }
        road(x, y, flag);
      } else if (v < 16) {
        if (v < 2) house(x, y, ((v & 1) << 1) + (cityId & 1), v >> 1);
        else house(x, y, ((x + y) & 1) + ((v & 1) << 1), v >> 1);
      } else if (item + 14 !== v && item + 40 !== v) {
        // F19_0000_106c: budynek (< 48) albo cud
        const id = v - 16;
        const px = clampX((y & 1) * 8 + x * 16 - 9);
        if (id < 48) put(b.buildings[id], px, 16 + (y << 3));
        else put(b.wonders[id - 48], px, 76 + y * 8 - wonderHeight(id - 48) - 10);
      }
    }
  }
  if (hasBuilding(city, BuildingId.CityWalls) && item !== BuildingId.CityWalls) {
    for (let x = 0; x < 320; x += 43) {
      if (x === 172) x += 19;
      put(b.buildings[22], x, 108);
    }
    put(b.buildings[6], 142, 108);
  }
  if (hasBuilding(city, BuildingId.MassTransit) && item !== BuildingId.MassTransit) {
    for (let x = 0; x < 310; x += 46) put(b.buildings[21], x, 115);
    put(b.buildings[11], 0, 115);
  }
  drawTitle(ui, state, cityId, message, s1);
}

/** Nazwa i rok (czcionka 6, cień czarny 1 px w prawo i w dół) albo komunikat w oknie (80, 8) — na ekranie 1. */
function drawTitle(ui: Ui, state: GameState, cityId: number, message: string | null, target: Surface): void {
  const gfx = ui.gfx;
  const savedFont = gfx.fontId;
  gfx.fontId = 6;
  if (!message) {
    const font = gfx.font;
    const centered = (text: string, y: number) => {
      const x = 160 - Math.trunc(measureText(font, text).width / 2);
      target.drawText(font, text, x + 1, y + 1, 0);
      target.drawText(font, text, x, y, 15);
    };
    centered(cityName(state, cityId), 2);
    centered(yearToString(state.year), 15);
  } else {
    // okno rysowane na ekranie 1 (Var_aa.ScreenID = 1): przez ekran 0, który potem wraca
    const screen0 = gfx.cut(0, 0, 0, 320, 200);
    gfx.screen.blit(target, 0, 0, 320, 200, 0, 0);
    void showMenuBox(ui, message, 80, 8, { noWait: true });
    target.blit(gfx.screen, 0, 0, 320, 200, 0, 0);
    gfx.screen.blit(screen0, 0, 0, 320, 200, 0, 0);
  }
  gfx.fontId = savedFont;
}

/**
 * F19_0000_111f_DrawCityPopulation: mieszkańcy 34×50 z POP.PIC (z Industrialization człowieka — wiersz y = 1,
 * bez — y = 52) na ekranie 0: zadowoleni, spokojni, niezadowoleni, potem specjaliści; odstęp 12 albo szerokość / liczba.
 */
export function drawCityPopulation(gfx: Gfx, assets: GameAssets, state: GameState, cityId: number, x: number, y: number, width: number): void {
  if (!assets.has('POP.PIC')) return;
  const city = state.cities[cityId]!;
  const report = processCity(state, cityId, 1);
  if (!report) return;
  gfx.loadPic(1, 0, 0, assets.pic('POP.PIC'));
  const row = playerHasTech(state, state.humanPlayer, Tech.Industrialization) ? 1 : 52;
  const bitmaps = Array.from({ length: 9 }, (_, i) => gfx.cut(1, 35 * i + 1, row, 34, 50));
  const size = city.size;
  const step = size * 12 > width ? Math.trunc(width / size) : 12;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const specialists = report.specialists;
  let happy = clamp(report.happy, 0, size);
  let unhappy = clamp(report.unhappy, 0, size);
  while (happy + unhappy > clamp(size - specialists, 0, 99)) {
    happy = clamp(happy - 1, 0, size);
    unhappy = clamp(unhappy - 1, 0, size);
  }
  for (let i = 0; i < happy; i++, x += step) gfx.drawBitmap(bitmaps[i & 1]!, x, y);
  if (happy !== 0) x += 8;
  let j = 0;
  for (; size - happy - unhappy - specialists > j; j++, x += step) gfx.drawBitmap(bitmaps[2 + (j & 1)]!, x, y);
  if (j !== 0) x += 8;
  for (let i = 0; i < unhappy; i++, x += step) gfx.drawBitmap(bitmaps[4 + (i & 1)]!, x, y);
  x += 12;
  for (let i = 0; i < specialists; i++, x += step) gfx.drawBitmap(bitmaps[5 + specialistAt(state, cityId, i)]!, x, y);
}

/** Opcje panoramy. */
export interface CityViewOptions {
  /** Paleta przywracana po panoramie (CommonTools.LoadAndApplyDefaultColorPalette). */
  readonly palette?: Palette;
}

/**
 * CityView.F19_0000_0000_ShowCityLayout. Przy `item` = −2 obraz zostaje na ekranie (dla animacji), w pozostałych
 * przypadkach panorama czeka na klawisz albo kliknięcie, po czym ekran jest czarny z przywróconą paletą gry.
 */
export async function showCityView(ui: Ui, assets: GameAssets, state: GameState, cityId: number, item: number, message: string | null,
  options: CityViewOptions = {}): Promise<void> {
  const gfx = ui.gfx;
  const layout = cityViewLayout(state, cityId);
  const cycles = new PaletteCycles(ui);
  const graphics = hasCityViewGraphics(assets);
  const bitmaps = graphics ? loadBitmaps(gfx, assets, state, cityId, item) : null;
  let init = false;
  for (;;) {
    if (bitmaps) drawScene(ui, assets, state, cityId, layout, bitmaps, item, message);
    else {
      gfx.fillRect(0, 0, 320, 200, 0, 1);
      drawTitle(ui, state, cityId, message, gfx.screens[1]);
    }
    if (init) {
      await ui.dissolve(1);
    } else {
      gfx.fillRect(0, 0, 320, 200, 0);
      if (item !== -3 && graphics) gfx.setPaletteFromFile(assets.file('HILL.PIC'));
      gfx.copy(1, 0, 0, 320, 200, 0, 0, 0);
      if (item === -3 && assets.has('HILL.PAL')) {
        const p = gfx.palette.clone();
        const range = readPaletteRange(assets.file('HILL.PAL'));
        if (range) p.apply(range);
        await ui.fadePalette(p, 15);
      }
      if (graphics) {
        cycles.add(4, 15, 64, 79);
        cycles.start(4);
      }
    }
    if (item === -1 && !init) drawCityPopulation(gfx, assets, state, cityId, 24, 140, 256);
    ui.present();
    if (item <= -1 || ui.hasKeyOrClick()) break;
    item = -1;
    init = true;
    if (await cycles.pause(60)) break;
  }
  if (item === -2) {
    cycles.stop(4);
    return;
  }
  if (ui.hasKeyOrClick()) ui.input.clear();
  else await cycles.wait();
  cycles.stop(4);
  gfx.fillRect(0, 0, 320, 200, 0);
  if (options.palette) gfx.setPalette(options.palette);
  ui.present();
}

/** Wspólny przebieg animacji w dolnej połowie: tło z ekranu 0 kopiowane na ekran 1 (0,0) i odświeżane co krok. */
async function animate(ui: Ui, steps: Iterable<number>, draw: (i: number, j: number, put: (b: Surface | null, x: number, y: number) => void) => void): Promise<void> {
  const gfx = ui.gfx;
  gfx.copy(0, 0, 100, 320, 100, 1, 0, 0);
  const put = (b: Surface | null, x: number, y: number) => {
    if (b) gfx.drawBitmap(b, x, y, 1);
  };
  let j = 0;
  for (const i of steps) {
    gfx.copy(1, 0, 0, 320, 100, 1, 0, 100);
    draw(i, j++, put);
    gfx.copy(1, 0, 100, 320, 100, 0, 0, 100);
    ui.present();
    // ResetWaitTimer … GetTimerValue() < 10
    const e = await ui.waitEvent(10 * 12);
    if (e && (e.type === 'key' || e.type === 'mousedown')) break;
  }
  ui.input.clear();
}

/** Kadry 10 rysunków z arkusza: (x0 + (i % 4)·dx, y0 + (i >> 2)·dy), w × h. */
function frames(gfx: Gfx, x0: number, dx: number, y0: number, dy: number, w: number, h: number): Surface[] {
  return Array.from({ length: 10 }, (_, i) => gfx.cut(1, x0 + (i % 4) * dx, y0 + (i >> 2) * dy, w, h));
}

function* range(from: number, to: number, step: number): Generator<number> {
  if (step > 0) for (let i = from; i < to; i += step) yield i;
  else for (let i = from; i > to; i += step) yield i;
}

/**
 * F19_0000_167b_InvadersAnimation: zdobywcy maszerują od lewej (8 postaci co 48 px) w y = 132. Rysunki: INVADERS.PIC
 * (Gunpowder i Automobile), INVADER2.PIC (Gunpowder), INVADER3.PIC (bez Gunpowder). Kolor 253 = (3,3,3).
 */
export async function invadersAnimation(ui: Ui, assets: GameAssets, state: GameState, player: number): Promise<void> {
  const gfx = ui.gfx;
  const gunpowder = playerHasTech(state, player, Tech.Gunpowder);
  const file = gunpowder ? (playerHasTech(state, player, Tech.Automobile) ? 'INVADERS.PIC' : 'INVADER2.PIC') : 'INVADER3.PIC';
  if (!assets.has(file)) return;
  gfx.palette.setColor(0xfd, 12, 12, 12);
  gfx.paletteVersion++;
  gfx.loadPic(1, 0, 0, assets.pic(file));
  const f = gunpowder ? frames(gfx, 0, 79, 2, 61, 78, 60) : frames(gfx, 1, 79, 1, 66, 78, 65);
  await animate(ui, range(0, 660, 3), (i, j, put) => {
    for (let k = 7; k >= 0; k--) {
      const x = i - 48 * k;
      if (x > -48 && x < 320) put(f[j % 10]!, x, 132);
    }
  });
}

/** F19_0000_18c1_CivilDisorderAnimation: zamieszki — RIOT.PIC (z University człowieka) albo RIOT2.PIC, od lewej. */
export async function civilDisorderAnimation(ui: Ui, assets: GameAssets, state: GameState): Promise<void> {
  const gfx = ui.gfx;
  const university = playerHasTech(state, state.humanPlayer, Tech.University);
  const file = university ? 'RIOT.PIC' : 'RIOT2.PIC';
  if (!assets.has(file)) return;
  gfx.loadPic(1, 0, 0, assets.pic(file));
  const f = university ? frames(gfx, 1, 79, 1, 64, 78, 63) : frames(gfx, 1, 75, 1, 66, 74, 65);
  await animate(ui, range(-48, 420, 3), (i, j, put) => {
    for (let k = 0; k < 4; k++) {
      const x = FIGURE_OFFSETS[k]! + i;
      if (x > -48 && x < 320) put(f[(k * 3 + j) % 10]!, x, 126 + k * 2);
    }
  });
}

/** F19_0000_1ae1_LoveOurLeaderAnimation: pochód od prawej — LOVE1.PIC (bez Industrialization człowieka) albo LOVE2.PIC. */
export async function loveOurLeaderAnimation(ui: Ui, assets: GameAssets, state: GameState): Promise<void> {
  const gfx = ui.gfx;
  const file = playerHasTech(state, state.humanPlayer, Tech.Industrialization) ? 'LOVE2.PIC' : 'LOVE1.PIC';
  if (!assets.has(file)) return;
  gfx.loadPic(1, 0, 0, assets.pic(file));
  const f = frames(gfx, 1, 79, 1, 66, 78, 65);
  await animate(ui, range(420, -48, -3), (i, j, put) => {
    for (let k = 0; k < 4; k++) {
      const x = Math.trunc((FIGURE_OFFSETS[k]! * 3) / 2) + i;
      if (x > -48 && x < 320) put(f[(k * 3 + j) % 10]!, x, 126 + k * 2);
    }
  });
}

/** Paleta z pliku .PAL/.PIC nałożona na kopię bieżącej. */
export function paletteWith(base: Palette, file: Uint8Array): Palette {
  const p = base.clone();
  const range = readPaletteRange(file);
  if (range) p.apply(range);
  return p;
}
