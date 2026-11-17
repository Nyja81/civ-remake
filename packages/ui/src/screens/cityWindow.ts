/**
 * Okno miasta (ekran statusu miasta) jak w oryginale, ekran 320×200 czcionką 2:
 *   tytuł z liczbą ludności (2,1)–(208,21) i mieszkańcy (8,8)          — ProcessCityState (tryb 1), F0_1d12_6ed4_DrawResources,
 *   zasoby miasta (2,23)–(124,65)                                      — część „City Resources” ProcessCityState,
 *   jednostki utrzymywane (2,67)–(124,104)                              — pętla po etykiecie L32e0,
 *   mapka 5×5 pól (127,23)–(208,104) z plonami pól                     — F0_2aea_03ba_DrawCell, F0_1d12_692d_CityResources,
 *   magazyn żywności (2,106), zakładki INFO/HAPPY/MAP/VIEW (95,106)–(227,197),
 *   budynki i cuda (211,1)–(317,97)                                    — F0_1d12_7045_DrawWonderOrImprovement,
 *   produkcja (230,99) z CHANGE/AUTO i BUY, RENAME, EXIT.
 * Mapa świata na zakładce MAP — F0_1d12_72b7_DrawCityWorldMap i F0_1d12_73ea_DrawCityRectangle. Źródło: CityWorker
 * z OpenCivOne (MIT); zakup sprawdzony z dosłownym tłumaczeniem (Segment_1d12, ec23ac3).
 *
 * Liczby liczy silnik (`processCity(…, 1)`, `supportedUnits`), działania gracza też (`toggleCityTile`, `cycleSpecialist`,
 * `sellBuilding`, `activateUnitInCity`, `toggleAutoProduction`, `buyProduction`, `setProduction`). Oryginał po każdej
 * zmianie wraca do etykiety L045f (całe okno od nowa) albo L12c2 (bez mapki); tu okno zawsze rysuje się od nowa —
 * wynik jest ten sam poza kolejnością nakładania się ikon plonów na sąsiednich polach po zdjęciu mieszkańca z pola.
 *
 * Do zrobienia: zakładka VIEW (CityView.F19_0000_0000_ShowCityLayout — panorama miasta); na razie wraca do INFO.
 */
import {
  activateUnitInCity, buyCost, buyProduction, CITY_OFFSETS, CityStatus, cellIndex, cityNeighborArea, cityTileIndex, cycleSpecialist,
  Government, hasBuilding, improvementDef, isValid, NO_UNIT, occupantPlayer, playerHasTech, processCity, productionOptions,
  sellBuilding, setProduction, specialistAt, supportedUnits, Tech, terrainAt, Terrain, tileResource, toggleAutoProduction,
  toggleCityTile, UNITS, UnitStatus, WONDERS, BUILDINGS, wrapX, BuildingId, type CityReport, type GameState,
} from '@civ-remake/engine';
import { drawCell, drawCellWithUnit, drawUnit, type MapSprites, type TextDrawer } from '@civ-remake/gfx';
import type { GameAssets } from '../assets';
import { editBox } from '../editBox';
import type { UiEvent } from '../input';
import { showMenuBox } from '../menuBox';
import type { Ui } from '../ui';

export interface CityWindowContext {
  readonly ui: Ui;
  readonly assets: GameAssets;
  readonly state: GameState;
  readonly sprites: MapSprites;
  readonly text: TextDrawer;
}

export interface CityWindowResult {
  /** Var_6b64: po zamknięciu trzeba przerysować mapę z wygaszeniem (zmiana nazwy, kursor pól, sprzedaż murów). */
  readonly redraw: boolean;
}

/** Wzór tła paneli okna miasta: SP299.PIC (208,100) 16×16 na ekranie 2. */
const PATTERN = [208, 100, 16, 16] as const;

/** Małe ikony 7×7 z SP257.PIC (Array_d4ce[8…15] wg LoadBitmaps). */
export const Icon = { Food: 0, Shield: 1, Trade: 2, Coin: 3, Bulb: 4, Sad: 5, Luxury: 6 } as const;

/** Stan okna między przebiegami (zmienne lokalne ProcessCityState). */
interface WindowState {
  /** Var_2496: 0 INFO, 1 HAPPY, 2 MAP, 3 VIEW. */
  tab: number;
  /** previousImprovementIndex: pierwszy budynek bieżącej strony listy. */
  page: number;
  /** flag_b8: wybór pola klawiaturą (P) trwa. */
  tileMode: boolean;
  cursorX: number;
  cursorY: number;
  redraw: boolean;
}

/** Wynik rysowania potrzebny do obsługi wejścia. */
interface Layout {
  readonly report: CityReport;
  /** Odstęp mieszkańców w górnym wierszu (wynik DrawResources). */
  readonly spacing: number;
  /** Jednostki stojące w mieście (zakładka INFO, najwyżej 18). */
  readonly cityUnits: number[];
  /** Budynki na bieżącej stronie listy (identyfikatory 1–24). */
  readonly shownBuildings: number[];
  readonly wonderCount: number;
  /** currentImprovementIndex, gdy jest kolejna strona (MORE); inaczej -1. */
  readonly nextPage: number;
  /** Przycisk CHANGE miga — bieżąca produkcja jest niemożliwa (budynek stoi, cud zbudowany, za dużo jednostek). */
  readonly flashChange: boolean;
}

type Step = 'stay' | 'exit';

/**
 * CityWorker.F0_1d12_0045_ProcessCityState(cityId, 1): okno miasta z obsługą myszy i klawiatury.
 * Przed wywołaniem ekran gry warto zapamiętać na ekranie 1 (GameEngine.F0_1ade_03ea_ProcessCityState1AndRefreshMap).
 */
export async function showCityWindow(ctx: CityWindowContext, cityId: number): Promise<CityWindowResult> {
  const { ui, state } = ctx;
  const w: WindowState = { tab: 0, page: 0, tileMode: false, cursorX: 0, cursorY: 0, redraw: false };
  const savedFont = ui.gfx.fontId;
  try {
    for (;;) {
      const city = state.cities[cityId];
      if (!city || city.status === -1) break;
      const layout = drawCityWindow(ctx, cityId, w);
      ui.present();
      if (city.owner !== state.humanPlayer) {
        // okno cudzego miasta: tylko podgląd (F0_2459_0918_WaitForKeyPressOrMouseClick)
        await ui.waitKeyOrClick();
        break;
      }
      const e = w.tileMode ? null : await waitInput(ui, layout.flashChange);
      if ((await handleInput(ctx, cityId, w, layout, e)) === 'exit') break;
    }
  } finally {
    ui.gfx.fontId = savedFont;
  }
  return { redraw: w.redraw };
}

/** Pętla oczekiwania okna: przy niemożliwej produkcji przycisk CHANGE miga (zamiana kolorów 9 ↔ 14 co 10 jednostek zegara). */
async function waitInput(ui: Ui, flash: boolean): Promise<UiEvent> {
  ui.input.peekKeyOrClick();
  let selected = flash ? 1 : 0;
  for (;;) {
    const e = selected ? await ui.waitEvent(10 * 12) : await ui.waitKeyOrClick();
    if (e && (e.type === 'key' || e.type === 'mousedown')) return e;
    if (!e && selected) {
      selected++;
      if (selected & 1) ui.gfx.screen.replaceColor(231, 106, 32, 8, 14, 9);
      else ui.gfx.screen.replaceColor(231, 106, 32, 8, 9, 14);
      ui.present();
    }
  }
}

// ───────────────────────────── rysowanie ─────────────────────────────

/** Całe okno: przebieg od etykiety L045f do oczekiwania na wejście. */
export function drawCityWindow(ctx: CityWindowContext, cityId: number, w: { tab: number; page: number }): Layout {
  const { ui, state, sprites } = ctx;
  const g = ui.gfx;
  const city = state.cities[cityId]!;
  const owner = city.owner;
  const human = state.humanPlayer;
  const pl = state.players[owner]!;
  g.fontId = 2;
  const report = processCity(state, cityId, 1)!;

  // ── tytuł i mapka 5×5 (L045f) ──
  g.fillRect(0, 0, 320, 200, 0);
  g.drawRectangleAndFillWithPattern(2, 1, 208, 21, ...PATTERN);
  let population = 0;
  for (let i = 1; i <= city.size; i++) population += i;
  g.drawCenteredString(`${cityNameOf(state, cityId)} (Population:${populationText(population)})`, 104, 2, 15);
  g.drawRectangleAndFillWithPattern(127, 23, 208, 104, ...PATTERN);
  const neighbors = cityNeighborArea(state, cityId);
  drawCell(g.screen, state, sprites, wrapX(city.x), city.y, 160, 56, undefined, { text: ctx.text });
  for (let i = 0; i < 21; i++) {
    const [dx, dy] = CITY_OFFSETS[i]!;
    const nx = city.x + dx;
    const ny = city.y + dy;
    if (!isValid(nx, ny)) continue;
    if (owner === human && !(state.map.explored[cellIndex(nx, ny)]! & (1 << owner))) continue;
    const sx = 160 + dx * 16;
    const sy = 56 + dy * 16;
    const occupant = occupantPlayer(state, nx, ny);
    if (occupant !== -1 && occupant !== owner) {
      drawCellWithUnit(g.screen, state, sprites, wrapX(nx), ny, sx, sy, ctx.text);
    } else {
      drawCell(g.screen, state, sprites, wrapX(nx), ny, sx, sy, undefined, { text: ctx.text });
      if (neighbors.has((dx + 2) * 5 + (dy + 2))) g.drawRectangle(sx, sy, 15, 15, 12);
    }
  }
  // F0_1d12_692d_CityResources: plony pól w kolejności przydziału mieszkańców
  for (const i of report.workOrder) drawTileResources(ctx, cityId, i);

  // ── panele i zakładki (część po L2307) ──
  g.drawRectangleAndFillWithPattern(2, 67, 124, 104, ...PATTERN);
  g.drawRectangleAndFillWithPattern(95, 106, 227, 197, ...PATTERN);
  g.drawFilledRectangleWithCenteredText(95, 106, 128, 114, 'INFO', 9);
  g.drawFilledRectangleWithCenteredText(129, 106, 160, 114, 'HAPPY', 9);
  g.drawFilledRectangleWithCenteredText(161, 106, 193, 114, 'MAP', 9);
  g.drawFilledRectangleWithCenteredText(194, 106, 226, 114, 'VIEW', 9);
  g.screen.replaceColor(33 * w.tab + 96, 107, 32, 7, 9, 15);
  if (w.tab === 2) drawCityWorldMap(ctx);

  // ── zakładka HAPPY: kolejne kroki zadowolenia ──
  const specialists = report.specialists;
  if (w.tab === 1) drawHappiness(ctx, cityId, report);

  // ── jednostki utrzymywane i stojące w mieście (L32e0) ──
  let ux = 8;
  let uy = 69;
  for (const e of supportedUnits(state, cityId)) {
    const u = pl.units[e.unitId]!;
    if (u.type !== 26 && u.type !== 27) {
      if (e.shield) icon(ctx, Icon.Shield, ux + 8, uy + 12);
      if (u.type === 0) {
        icon(ctx, Icon.Food, ux, uy + 12);
        if (e.food > 1) icon(ctx, Icon.Food, ux + 2, uy + 12);
      } else if (e.unhappy > 0) {
        icon(ctx, Icon.Sad, ux, uy + 12);
        if (e.unhappy > 1) icon(ctx, Icon.Sad, ux + 2, uy + 12);
      }
    }
    unitSprite(ctx, owner, u.type, ux, uy);
    if (w.tab === 2) drawCityRectangle(ctx, u.x, u.y, 7);
    ux += 16;
    if (ux >= 112) {
      ux = 8;
      uy += 16;
      if (uy > 85) uy -= 24;
    }
  }
  const cityUnits: number[] = [];
  if (w.tab === 0) {
    let cx = 100;
    let cy = 116;
    pl.units.forEach((u, i) => {
      if (cityUnits.length >= 18 || u.type === NO_UNIT || u.x !== city.x || u.y !== city.y) return;
      drawUnit(g.screen, state, sprites, owner, i, cx, cy, false, undefined, ctx.text);
      const home = state.cities[u.homeCity];
      let name = home && home.status !== -1 ? cityNameOf(state, u.homeCity) : '';
      if (name.length > 3) name = `${name.slice(0, 3)}.`;
      g.drawString(name, cx, cy + 15, 0);
      cityUnits.push(i);
      cx += 18;
      if (cityUnits.length % 6 === 0) {
        cx = 100;
        cy += 16;
      }
    });
  }

  // ── budynki i cuda (211,1)–(317,97) ──
  g.drawRectangleAndFillWithPattern(211, 1, 317, 97, ...PATTERN);
  let row = 2;
  let by = 2;
  let wonderCount = 0;
  if (w.page === 0) {
    for (let i = 0; i < 21; i++) {
      if (state.wonderCity[i + 1] !== cityId) continue;
      g.drawString(trimToWidth(ctx, WONDERS[i]!.name.toUpperCase(), 63), 253, by + 2, 15);
      drawWonderOrImprovement(ctx, i + 25, row & 1 ? 213 : 233, by - 2);
      by += 6;
      row++;
      wonderCount++;
    }
  }
  const shownBuildings: number[] = [];
  let nextPage = -1;
  for (let i = w.page; i < 24; i++) {
    if (!hasBuilding(city, i + 1)) continue;
    if (row >= 16) {
      nextPage = i;
      break;
    }
    shownBuildings.push(i + 1);
    icon(ctx, Icon.Coin, 309, by + 1);
    g.drawString(trimToWidth(ctx, BUILDINGS[i]!.name, 56), 253, by + 2, 15);
    drawWonderOrImprovement(ctx, i + 1, row & 1 ? 213 : 233, by - 2);
    by += 6;
    row++;
  }
  g.drawLine(231, 0, 250, 0, 0);
  g.drawLine(231, 1, 250, 1, 1);
  if (nextPage !== -1) g.drawFilledRectangleWithCenteredText(287, 88, 315, 96, 'MORE', 9);
  g.screen.replaceColor(309, 2, 8, 96, 14, 12);

  // ── produkcja (230,99) ──
  const ratio = report.difficultyRatio;
  const cost = city.production >= 0 ? UNITS[city.production]!.cost : improvementDef(-city.production).cost;
  const spacing = checkRange(Math.trunc((cost - 1) / 10) + 1, Math.trunc((city.shields - 1) / 100) + 1, 99);
  let step = Math.trunc(80 / ratio);
  const boxW = Math.trunc((spacing * 8 - 8) / spacing) + ratio * step;
  const boxH = Math.trunc((cost - 1) / spacing) * 8 + 8;
  g.fillRect(230, 99, boxW + 3, boxH + 19, 1);
  if (owner === human) {
    g.drawFilledRectangleWithCenteredText(231, 106, 263, 114, city.status & CityStatus.AutoProduction ? 'AUTO' : 'CHANGE', 9);
    g.drawFilledRectangleWithCenteredText(294, 106, 311, 114, 'BUY', 9);
  }
  if (city.production >= 0) unitSprite(ctx, owner, city.production, 264, 100);
  else g.drawCenteredString(trimToWidth(ctx, improvementDef(-city.production).name, 86), 274, 100, 15);
  g.fillRectangleWithPattern(231, 116, boxW + 1, boxH + 1, ...PATTERN);
  for (let i = 0; i < city.shields; i++) {
    icon(ctx, Icon.Shield, Math.trunc(((i % (ratio * spacing)) * step) / spacing) + 232, Math.trunc(i / (ratio * spacing)) * 8 + 117);
  }

  // ── magazyn żywności (2,106) ──
  step = city.size !== 0 ? checkRange(Math.trunc(80 / city.size), 1, 8) : 1;
  const rowH = Math.trunc(80 / ratio);
  g.fillRect(2, 106, 91, ratio * rowH + 12, 1);
  g.drawString('Food Storage', 8, 108, 15);
  g.fillRectangleWithPattern(3, 115, city.size * step + 9, ratio * rowH + 2, ...PATTERN);
  if (hasBuilding(city, BuildingId.Granary)) g.drawLine(5, 155, city.size * step + 9, 155, 1);
  const food = checkRange(city.food, 0, (city.size + 1) * ratio);
  for (let i = 0; i < food; i++) icon(ctx, Icon.Food, (i % (city.size + 1)) * step + 4, Math.trunc(i / (city.size + 1)) * rowH + 116);

  // ── zasoby miasta (2,23)–(124,65) ──
  drawCityResources(ctx, report);

  // ── mieszkańcy w nagłówku ──
  g.fillRectangleWithPattern(8, 8, 200, 13, ...PATTERN);
  const citizenSpacing = drawResources(ctx, cityId, { happy: report.happy, unhappy: report.unhappy, extra: report.extraUnhappy }, 8, 8, specialists, 192);

  // ── szlaki handlowe (INFO: napisy, MAP: punkty) ──
  city.tradeRoutes.forEach((t, i) => {
    if (t === -1) return;
    const other = state.cities[t]!;
    if (w.tab === 0) {
      const bonus = Math.trunc((city.baseTrade + other.baseTrade + 4) / (other.owner !== owner ? 8 : 16));
      g.drawString(`{${cityNameOf(state, t)}:+${bonus}} `, 98, i * 6 + 179, 10);
    } else if (w.tab === 2) {
      drawCityRectangle(ctx, other.x, other.y, 10);
    }
  });
  if (w.tab === 2) drawCityRectangle(ctx, city.x, city.y, 15);

  // ── zanieczyszczenie (INFO) ──
  if (w.tab === 0) {
    const pollution = report.pollution;
    const pStep = checkRange(Math.trunc(100 / checkRange(pollution, 1, 99)), 1, 8);
    for (let i = 0; i < pollution; i++) g.screen.blit(sprites.sheets.sp, 48, 32, 16, 16, i * pStep + 98, (i & 1) + 161, true);
  }

  // ── przyciski człowieka ──
  let flashChange = false;
  if (owner === human) {
    g.drawFilledRectangleWithCenteredText(284, 190, 316, 198, 'EXIT', 12);
    g.drawFilledRectangleWithCenteredText(231, 190, 272, 198, 'RENAME', 9);
    const p = city.production;
    if (p < 0 && p >= -21 && hasBuilding(city, -p)) flashChange = true;
    if (p < -21 && p >= -24 && state.spaceshipFlags & (1 << owner)) flashChange = true;
    if (p < -24 && state.wonderCity[-p - 24] !== -1) flashChange = true;
    if (p >= 0 && pl.units.filter((u) => u.type !== NO_UNIT).length >= 127) flashChange = true;
  }
  return { report, spacing: citizenSpacing, cityUnits, shownBuildings, wonderCount, nextPage, flashChange };
}

/** F0_1d12_692d_CityResources (tryb 1): pole od nowa (DrawCell) i ikony jego plonów; pole bez plonów — ikona 13. */
function drawTileResources(ctx: CityWindowContext, cityId: number, tile: number): void {
  const { state } = ctx;
  const city = state.cities[cityId]!;
  const [dx, dy] = CITY_OFFSETS[tile]!;
  const nx = city.x + dx;
  const ny = city.y + dy;
  drawCell(ctx.ui.gfx.screen, state, ctx.sprites, wrapX(nx), ny, 160 + dx * 16, 56 + dy * 16, undefined, { text: ctx.text });
  const counts = [0, 1, 2].map((t) => tileResource(state, city.owner, cityId, nx, ny, t));
  const total = counts[0]! + counts[1]! + counts[2]!;
  const xStep = total < 5 ? 8 : total < 7 ? 5 : 3;
  let xo = 0;
  let yo = 0;
  for (let t = 0; t < 3; t++) {
    for (let k = 0; k < counts[t]!; k++) {
      icon(ctx, t, 161 + dx * 16 + xo, 57 + dy * 16 + yo);
      if (xo < 8) xo += xStep;
      else {
        xo = 0;
        yo += 8;
      }
    }
  }
  if (total === 0) icon(ctx, Icon.Sad, 165 + dx * 16, 61 + dy * 16);
}

/** Część „City Resources”: żywność, tarcze, handel, potem luksus/podatek/nauka; braki wyczernione (ReplaceColor 15 → 0). */
function drawCityResources(ctx: CityWindowContext, r: CityReport): void {
  const g = ctx.ui.gfx;
  g.drawRectangleAndFillWithPattern(2, 23, 124, 65, ...PATTERN);
  g.fillRect(2, 23, 122, 9, 1);
  g.drawString('City Resources', 8, 25, 15);
  const y = 33;
  const totals = [r.food, r.shields, r.trade];
  for (let i = 0; i < 3; i++) {
    let x = 4;
    const xStep = i === 0
      ? checkRange(Math.trunc(116 / (checkRange(r.food, r.foodUpkeep, 999) + 1)), 1, 8)
      : checkRange(Math.trunc(116 / (totals[i]! + 1)), 1, 8);
    for (let j = 0; j < totals[i]!; j++) {
      if (i === 0 && r.foodUpkeep === j) x += 4;
      if (i === 1 && r.unitSupport !== 0 && j === r.unitSupport) x += 4;
      if (i === 2 && r.trade - r.corruption === j) x += 2;
      icon(ctx, i, x, i * 8 + y);
      x += xStep;
    }
  }
  let x = 8;
  let xStep = checkRange(Math.trunc(224 / (r.luxury + r.science + r.tax + r.corruption + 2)), 1, 16);
  for (let i = 0; i < r.luxury; i++, x += xStep) icon(ctx, Icon.Luxury, Math.trunc(x / 2), y + 24);
  if (r.luxury !== 0) x += 8;
  for (let i = 0; i < r.tax; i++, x += xStep) icon(ctx, Icon.Coin, Math.trunc(x / 2), y + 24);
  if (r.tax !== 0) x += 8;
  for (let i = 0; i < r.science; i++, x += xStep) icon(ctx, Icon.Bulb, Math.trunc(x / 2), y + 24);
  if (r.foodUpkeep > r.food) {
    xStep = checkRange(Math.trunc(116 / (r.foodUpkeep + 1)), 1, 8);
    for (let i = r.food; i < r.foodUpkeep; i++) icon(ctx, Icon.Food, i * xStep + 8, y);
    g.screen.replaceColor(xStep * r.food + 8, y, (r.foodUpkeep - r.food) * xStep + 4, 8, 15, 0);
  }
  if (r.shields < r.unitSupport) {
    xStep = checkRange(Math.trunc(116 / (r.shields + 1)), 1, 8);
    for (let i = r.shields; i < r.unitSupport; i++) icon(ctx, Icon.Shield, i * xStep + 8, y + 8);
    g.screen.replaceColor(r.shields * xStep + 8, y + 8, (r.unitSupport - r.shields) * xStep, 8, 15, 0);
  }
  if (r.corruption !== 0) {
    xStep = checkRange(Math.trunc(116 / (r.trade + 1)), 1, 8);
    g.screen.replaceColor((r.trade - r.corruption) * xStep + 6, y + 16, xStep * r.corruption + 2, 8, 15, 0);
  }
}

/** Zakładka HAPPY: wiersz mieszkańców po każdym kroku zadowolenia, z przyczyną zmiany po prawej stronie. */
function drawHappiness(ctx: CityWindowContext, cityId: number, r: CityReport): void {
  const { state } = ctx;
  const g = ctx.ui.gfx;
  const city = state.cities[cityId]!;
  const owner = city.owner;
  const [base, luxury, buildings, military, wonders] = r.happinessSteps;
  let y = 116;
  const line = () => {
    y += 16;
    g.drawLine(100, y - 2, 222, y - 2, 1);
  };
  drawResources(ctx, cityId, base!, 100, y, r.specialists, 92);
  line();
  if (luxury!.happy !== 0) {
    drawResources(ctx, cityId, luxury!, 100, y, r.specialists, 92);
    icon(ctx, Icon.Luxury, 208, y + 4);
    line();
  }
  let x = 208;
  if (hasBuilding(city, BuildingId.Colosseum)) {
    drawWonderOrImprovement(ctx, BuildingId.Colosseum, x, y);
    x -= 16;
  }
  if (playerHasTech(state, owner, Tech.Religion) && hasBuilding(city, BuildingId.Cathedral)) {
    drawWonderOrImprovement(ctx, BuildingId.Cathedral, x, y);
    x -= 16;
  }
  if (hasBuilding(city, BuildingId.Temple)) drawWonderOrImprovement(ctx, BuildingId.Temple, x, y);
  if (hasBuilding(city, BuildingId.Colosseum) || hasBuilding(city, BuildingId.Cathedral) || hasBuilding(city, BuildingId.Temple)) {
    drawResources(ctx, cityId, buildings!, 100, y, r.specialists, 92);
    line();
  }
  x = 208;
  if (state.players[owner]!.government <= Government.Communism) {
    for (const type of r.martialLawUnits) {
      unitSprite(ctx, owner, type, x, y - 1);
      x -= 2;
    }
  } else {
    for (let i = 0; i < r.militaryUnhappy; i++, x -= 2) icon(ctx, Icon.Sad, x, y + 4);
  }
  drawResources(ctx, cityId, military!, 100, y, r.specialists, 92);
  line();
  if (wonders!.happy - wonders!.unhappy !== military!.happy - military!.unhappy) {
    drawResources(ctx, cityId, wonders!, 100, y, r.specialists, 92);
    g.drawString('WONDERS', 190, y + 5, 15);
    line();
  }
}

/**
 * F0_1d12_6ed4_DrawResources: zadowoleni, spokojni, niezadowoleni (ci „ponad miarę” — Var_6542 — z kolorem 5 zamienionym
 * na 12), potem specjaliści. Zwraca odstęp między mieszkańcami.
 */
function drawResources(ctx: CityWindowContext, cityId: number, h: { happy: number; unhappy: number; extra: number },
  x: number, y: number, specialists: number, width: number): number {
  const g = ctx.ui.gfx;
  const size = ctx.state.cities[cityId]!.size;
  const spacing = size * 7 > width ? Math.trunc(width / size) : 7;
  for (let i = 0; i < h.happy; i++, x += spacing) citizen(ctx, i & 1, x, y);
  let i = 0;
  for (; i < size - specialists - h.happy - h.unhappy; i++, x += spacing) citizen(ctx, 2 + (i & 1), x, y);
  if (i !== 0) x += 2;
  for (i = 0; i < h.unhappy; i++, x += spacing) {
    citizen(ctx, 4 + (i & 1), x, y);
    if (i < h.extra) g.screen.replaceColor(x, y, 12, 14, 5, 12);
  }
  x += 4;
  for (i = 0; i < specialists; i++, x += spacing) citizen(ctx, 5 + specialistAt(ctx.state, cityId, i), x, y);
  return spacing;
}

/**
 * F0_1d12_7045_DrawWonderOrImprovement: rysunek budynku (1–21) albo cudu (25–45) 18×10 z SP299.PIC (ekran 2);
 * części statku kosmicznego (22–24) nie mają rysunku.
 */
function drawWonderOrImprovement(ctx: CityWindowContext, id: number, x: number, y: number): void {
  if (id >= 22 && id <= 24) return;
  let n = id - 1;
  if (n >= 24) n -= 3;
  if (n >= 40) ctx.ui.gfx.copy(2, (n & 1) * 19 + 161, 100, 18, 10, 0, x, y);
  else ctx.ui.gfx.copy(2, Math.trunc(n / 5) * 19 + 161, (n % 5) * 10 + 50, 18, 10, 0, x, y);
}

/** Przesunięcia punktów 2×2 mapy świata w kratce 3×3 dla parzystości pola (cityMapOffsets). */
const CITY_MAP_OFFSETS = [[0, -1], [2, 0], [0, 1], [1, 2]] as const;

/** F0_1d12_72b7_DrawCityWorldMap: mapa świata (zakładka MAP) wyśrodkowana na stolicy człowieka (XStart). */
function drawCityWorldMap(ctx: CityWindowContext): void {
  const { state } = ctx;
  const g = ctx.ui.gfx;
  const human = state.humanPlayer;
  g.fillRect(101, 117, 120, 75, 0);
  for (let y = 0; y < 50; y++) {
    for (let x = 0; x < 80; x++) {
      const mx = wrapX(state.players[human]!.xStart + x - 40);
      if (!(state.map.explored[cellIndex(mx, y)]! & (1 << human))) continue;
      const [ox, oy] = CITY_MAP_OFFSETS[(y & 1) * 2 + (x & 1)]!;
      g.fillRect(101 + Math.trunc(x / 2) * 3 + ox, 118 + Math.trunc(y / 2) * 3 + oy, 2, 2, terrainAt(state.map, mx, y) === Terrain.Water ? 1 : 2);
    }
  }
  g.drawRectangle(100, 117, 121, 75, 9);
}

/** F0_1d12_73ea_DrawCityRectangle: punkt 2×2 na mapie świata (zakładka MAP). */
function drawCityRectangle(ctx: CityWindowContext, x: number, y: number, color: number): void {
  const xs = wrapX(x - ctx.state.players[ctx.state.humanPlayer]!.xStart + 40);
  ctx.ui.gfx.fillRect(Math.trunc((xs * 3) / 2) + 101, Math.trunc((y * 3) / 2) + 118, 2, 2, color);
}

/** Mała ikona 7×7 (Array_d4ce[8 + n]) z SP257.PIC, z przezroczystością. */
function icon(ctx: CityWindowContext, n: number, x: number, y: number): void {
  ctx.ui.gfx.screen.blit(ctx.sprites.sheets.sp, (n & 3) * 8 + 129, (n & 4) * 2 + 33, 7, 7, x, y, true);
}

/** Mieszkaniec 8×16 (Array_6e96[n]): 0–1 zadowoleni, 2–3 spokojni, 4–5 niezadowoleni, 6 poborca, 7 naukowiec, 8 artysta. */
function citizen(ctx: CityWindowContext, n: number, x: number, y: number): void {
  ctx.ui.gfx.screen.blit(ctx.sprites.sheets.sp, n * 8, 128, 8, 16, x, y, true);
}

/** Jednostka w kolorach gracza (Array_d4ce[64 + typ + gracz·32]). */
function unitSprite(ctx: CityWindowContext, player: number, type: number, x: number, y: number): void {
  const s = ctx.sprites.units[player]![type]!;
  const dst = ctx.ui.gfx.screen;
  for (let j = 0; j < s.h; j++) {
    for (let i = 0; i < s.w; i++) {
      const c = s.pixels[j * s.w + i]!;
      if (c !== 0 && dst.contains(x + i, y + j)) dst.setPixel(x + i, y + j, c);
    }
  }
}

/** LanguageTools.F0_2f4d_04f7_TrimStringToWidth: skraca napis z kropką na końcu, aż zmieści się w `maxWidth`. */
function trimToWidth(ctx: CityWindowContext, text: string, maxWidth: number): string {
  while (text.length > 1 && ctx.ui.gfx.stringWidth(text) > maxWidth) {
    text = text[text.length - 2] !== ' ' ? `${text.slice(0, -2)}.` : text.slice(0, -1);
  }
  return text;
}

/** GameEngine.PopulationValueToString: wartość × 1000 z przecinkami tysięcy. */
const populationText = (value: number) => (value * 1000).toLocaleString('en-US');

const cityNameOf = (state: GameState, cityId: number) => state.cityNames[state.cities[cityId]!.nameId] ?? '';

/** CommonTools.CheckValueRange: najpierw dolna granica, potem górna. */
function checkRange(v: number, lo: number, hi: number): number {
  if (v < lo) v = lo;
  if (v > hi) v = hi;
  return v;
}

// ───────────────────────────── wejście ─────────────────────────────

/** Klawisze kierunku jak w GetNavigationKey (strzałki, Home/PgUp/End/PgDn i klawiatura numeryczna bez NumLock). */
const NAV: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0], Home: [-1, -1], ArrowUp: [0, -1], PageUp: [1, -1], ArrowRight: [1, 0], End: [-1, 1], ArrowDown: [0, 1], PageDown: [1, 1],
};

const isConfirm = (key: string) => key === 'Enter' || key === ' ';

/** Obsługa jednego klawisza lub kliknięcia — kolejność sprawdzeń jak w ProcessCityState (po narysowaniu przycisku EXIT). */
async function handleInput(ctx: CityWindowContext, cityId: number, w: WindowState, layout: Layout, e: UiEvent | null): Promise<Step> {
  const { state } = ctx;
  const city = state.cities[cityId]!;
  const key = e === null ? 'p' : e.type === 'key' ? e.key : null;
  const mouse = e && e.type === 'mousedown' ? e : { x: 0, y: 0, button: 'none' as const };
  const left = mouse.button === 'left';
  const { x: mx, y: my } = mouse;

  // AUTO: klawisz A albo prawy przycisk na CHANGE
  if ((mouse.button === 'right' && mx >= 230 && mx < 270 && my >= 106 && my <= 116) || key === 'A') {
    toggleAutoProduction(state, cityId);
    return 'stay';
  }
  if (key !== null || (left && my >= 106 && my <= 116)) {
    if (mx >= 296 || key === 'b') {
      await buyDialog(ctx, cityId);
      return 'stay';
    }
    if (key !== 'Escape' && key !== 'Enter' && ((mx >= 230 && mx < 270) || key === 'c')) {
      city.status &= ~CityStatus.AutoProduction;
      await productionDialog(ctx, cityId);
      return 'stay';
    }
    const tabKeys: Record<string, number> = { i: 0, h: 1, m: 2, v: 3 };
    let tab = key !== null && tabKeys[key] !== undefined ? tabKeys[key]! : -1;
    if (tab === -1 && key !== 'Escape' && key !== 'Enter' && mx >= 96 && mx < 224) tab = Math.trunc((mx - 96) / 32);
    if (tab !== -1) {
      // VIEW (CityView.F19_0000_0000_ShowCityLayout) — do zrobienia; oryginał po panoramie wraca do INFO
      w.tab = tab === 3 ? 0 : tab;
      if (tab === 3) w.redraw = true;
      return 'stay';
    }
  }
  if (key === 'a' && layout.cityUnits.length > 0) {
    await selectCityUnit(ctx, cityId, layout);
    return 'stay';
  }
  let sellIndex: number | null = null;
  if (key === 's' && layout.shownBuildings.length > 0 && !(city.status & CityStatus.BuildingSold)) {
    const r = await selectBuilding(ctx, layout);
    if (r !== -1) sellIndex = r;
  }
  if (sellIndex === null) {
    if (key !== null && key.length === 1 && key >= '1' && key <= '9') {
      const index = key.charCodeAt(0) - 0x31;
      if (index < layout.report.specialists) {
        if (city.size > 4) {
          cycleSpecialist(state, cityId, index);
          return 'stay';
        }
        await specialistMessage(ctx);
      }
      return 'stay';
    }
    if (key === 'p') return tileCursor(ctx, cityId, w);
    if (key === 'M' && layout.nextPage !== -1) {
      w.page = layout.nextPage;
      return 'stay';
    }
    if (key === 'r' || (left && mx >= 231 && my > 190 && mx < 270)) {
      ctx.ui.input.clear();
      await cityNameDialog(ctx, cityId);
      w.redraw = true;
      return 'stay';
    }
    if (!left) return 'exit';
    if (mx >= 288 && my < 96 && my > 88 && layout.nextPage !== -1) {
      w.page = layout.nextPage;
      return 'stay';
    }
    if (mx >= 300 && my < 94) sellIndex = Math.trunc((my - 2) / 6) - layout.wonderCount;
  }
  // L5740: sprzedaż budynku o numerze `sellIndex` na bieżącej stronie
  if (sellIndex !== null) {
    let index = sellIndex;
    for (let i = w.page; i < 24; i++) {
      if (!hasBuilding(city, i + 1)) continue;
      index--;
      if (index === -1 && !(city.status & CityStatus.BuildingSold)) {
        await sellDialog(ctx, cityId, i + 1, w);
        return 'stay';
      }
    }
  }
  // L58ac: specjaliści w nagłówku
  if (mx < 200 && my < 20) {
    if (city.size < 5) {
      await specialistMessage(ctx);
      return 'stay';
    }
    const index = Math.trunc((mx - 16) / layout.spacing) - (city.size - layout.report.specialists);
    if (index >= 0 && index < layout.report.specialists) cycleSpecialist(state, cityId, index);
    return 'stay';
  }
  // jednostka w mieście (kliknięcie liczone co 16 pikseli, choć rysunki są co 18 — jak w oryginale)
  if (mx >= 100 && mx < 320 && my >= 116) {
    const selected = Math.trunc((my - 116) / 16) * 6 + Math.trunc((mx - 100) / 16);
    if (selected < layout.cityUnits.length) {
      activateUnitInCity(state, city.owner, layout.cityUnits[selected]!);
      return 'stay';
    }
  }
  // L5a74: pole mapki miasta
  if (my >= 24 && my < 104) {
    toggleCityTile(state, cityId, cityTileIndex(Math.trunc(mx / 16) - 10, Math.trunc((my - 24) / 16) - 2));
    return 'stay';
  }
  return 'exit';
}

/** „A City must have five population units…” w (32,32) — czcionką okna miasta (oryginał jej tu nie zmienia). */
async function specialistMessage(ctx: CityWindowContext): Promise<void> {
  await showMenuBox(ctx.ui, 'A City must have five\npopulation units to support\ntaxmen or scientists.\n', 32, 32, { clearInput: true });
}

/**
 * Zakup (klawisz B, przycisk BUY): „Cost to complete …” w (100,80) czcionką 1. Wg dosłownego tłumaczenia (Segment_1d12,
 * 0x4e32) okno pokazuje się zawsze, a zakup następuje po wyborze „Yes”, gdy starcza złota; w niepokojach okno nie ma opcji.
 */
async function buyDialog(ctx: CityWindowContext, cityId: number): Promise<void> {
  const { state } = ctx;
  const city = state.cities[cityId]!;
  const p = state.players[city.owner]!;
  const cost = buyCost(state, cityId);
  const name = city.production >= 0 ? UNITS[city.production]!.name : improvementDef(-city.production).name;
  let text = `Cost to complete\n${name} is ${cost} coins\nOur treasury has ${p.gold} coins.\n`;
  if (city.status & CityStatus.CivilDisorder) text += 'CIVIL DISORDER\n';
  else if (p.gold >= cost) text += 'Do you want to continue?\n Yes\n No\n';
  ctx.ui.gfx.fontId = 1;
  const r = await showMenuBox(ctx.ui, text, 100, 80, { clearInput: true });
  if (r.index === 0 && p.gold >= cost) buyProduction(state, cityId);
}

/**
 * GameEngine.F0_1ade_0421_SelectCityProduction (człowiek): „What shall we build in …?” w (80, 8) z pomocą.
 * Za długa lista nie jest dzielona na strony („more...”) — do zrobienia.
 */
async function productionDialog(ctx: CityWindowContext, cityId: number): Promise<void> {
  const { state, ui } = ctx;
  const options = productionOptions(state, cityId);
  if (options.length === 0) return;
  let text = `What shall we build in ${cityNameOf(state, cityId)}?\n `;
  for (const o of options) {
    if (o.id >= 0) {
      const u = UNITS[o.id]!;
      text += `${o.name} (${o.turns} turns, ADM: ${u.attack}/${u.defense}/${u.moves})\n `;
    } else {
      text += `${o.name}${o.obsolete ? '*' : ''} (${o.turns} turns)\n `;
    }
  }
  const current = options.findIndex((o) => o.id === state.cities[cityId]!.production);
  ui.gfx.fontId = 1;
  const r = await showMenuBox(ui, text, 80, 8, { help: true, clearInput: true, defaultIndex: current });
  if (r.index >= 0) setProduction(state, cityId, options[r.index]!.id);
}

/** Sprzedaż (L5740): „Do you want to sell your … for … coins?” w (128,80) czcionką 1; opcja 1 = tak. */
async function sellDialog(ctx: CityWindowContext, cityId: number, building: number, w: WindowState): Promise<void> {
  const def = BUILDINGS[building - 1]!;
  ctx.ui.gfx.fontId = 1;
  const r = await showMenuBox(ctx.ui, `Do you want to sell\nyour ${def.name} for ${10 * def.cost} coins?\n No.\n Yes.\n`, 128, 80, { clearInput: true });
  if (r.index === 1 && sellBuilding(ctx.state, cityId, building) && building === BuildingId.CityWalls) w.redraw = true;
}

/** TextBoxDialogues.F23_0000_0000_CityNameDialog — nowa nazwa miasta (80,80) 160×32 czcionką 1. */
export async function cityNameDialog(ctx: CityWindowContext, cityId: number): Promise<void> {
  const { state, ui } = ctx;
  const gfx = ui.gfx;
  const city = state.cities[cityId]!;
  gfx.fontId = 1;
  let name = '';
  while (name.length === 0) {
    gfx.fillRect(80, 80, 160, 32, 15);
    gfx.drawRectangle(80, 80, 160, 32, 11);
    gfx.drawString('City Name...', 88, 82, 0);
    const r = await editBox(ui, 88, 96, 12, state.cityNames[city.nameId] ?? '');
    name = r.ok ? r.text.trim() : state.cityNames[city.nameId] ?? 'City';
  }
  state.cityNames[city.nameId] = name;
}

/** Czeka na klawisz; kliknięcia pomija (pętle „while (kbhit() == 0)” oryginału), co 10 jednostek zegara woła `blink`. */
async function waitKey(ui: Ui, blink: (phase: number) => void): Promise<string> {
  for (let phase = 0; ; phase++) {
    blink(phase);
    ui.present();
    const e = await ui.waitEvent(10 * 12);
    if (e && e.type === 'key') return e.key;
  }
}

/** Klawisz A: wybór jednostki w mieście strzałkami (miga), Enter/spacja budzi ją, Esc kończy. */
async function selectCityUnit(ctx: CityWindowContext, cityId: number, layout: Layout): Promise<void> {
  const { state, ui } = ctx;
  const owner = state.cities[cityId]!.owner;
  const units = layout.cityUnits;
  const busy = UnitStatus.Sentry | UnitStatus.BuildRoad | UnitStatus.Fortifying | UnitStatus.Fortified | UnitStatus.BuildIrrigation | UnitStatus.BuildMine;
  let sel = units.findIndex((id) => (state.players[owner]!.units[id]!.status & busy) !== 0);
  if (sel === -1) sel = 0;
  let key: string;
  do {
    const px = (sel % 6) * 18 + 100;
    const py = Math.trunc(sel / 6) * 16 + 116;
    key = await waitKey(ui, (phase) => {
      if (phase & 1) drawUnit(ui.gfx.screen, state, ctx.sprites, owner, units[sel]!, px, py, false, undefined, ctx.text);
      else ui.gfx.fillRectangleWithPattern(px, py, 16, 16, ...PATTERN);
    });
    const move = key === 'ArrowUp' ? -6 : key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : key === 'ArrowDown' ? 6 : 0;
    sel = checkRange(sel + move, 0, units.length - 1);
    if (isConfirm(key)) activateUnitInCity(state, owner, units[sel]!);
  } while (key !== 'Escape');
}

/** Klawisz S: wybór budynku do sprzedaży strzałkami (wiersz miga); zwraca numer na stronie albo -1 (Esc). */
async function selectBuilding(ctx: CityWindowContext, layout: Layout): Promise<number> {
  const { ui } = ctx;
  let index = 0;
  let target = 0; // outsideUnitIndex — inne klawisze nie zmieniają wyboru
  let key: string;
  do {
    const y = (index + layout.wonderCount) * 6 + 3;
    key = await waitKey(ui, (phase) => {
      if (phase & 1) ui.gfx.screen.replaceColor(252, y, 56, 7, 1, 9);
      else ui.gfx.screen.replaceColor(252, y, 56, 7, 9, 1);
    });
    ui.gfx.screen.replaceColor(252, y, 56, 7, 1, 9);
    if (key === 'ArrowUp') target = index - 1;
    else if (key === 'ArrowDown') target = index + 1;
    index = checkRange(target, 0, layout.shownBuildings.length - 1);
    if (isConfirm(key)) return index;
  } while (key !== 'Escape');
  return -1;
}

/**
 * Klawisz P: kursor pól mapki (miga ramką, pole zapamiętane na ekranie 1); kierunki w 8 stronach w obrębie pól miasta
 * odkrytych przez człowieka, Enter/spacja przełącza pracę na polu (kursor zostaje do Esc).
 */
async function tileCursor(ctx: CityWindowContext, cityId: number, w: WindowState): Promise<Step> {
  const { state, ui } = ctx;
  const g = ui.gfx;
  const city = state.cities[cityId]!;
  if (!w.tileMode) {
    w.cursorX = 0;
    w.cursorY = 0;
    w.tileMode = true;
  }
  let key: string;
  do {
    const sx = w.cursorX * 16 + 160;
    const sy = w.cursorY * 16 + 56;
    g.copy(0, sx, sy, 16, 16, 1, 0, 0);
    key = await waitKey(ui, (phase) => {
      if (phase & 1) g.copy(1, 0, 0, 16, 16, 0, sx, sy);
      else g.drawRectangle(sx, sy, 15, 15, 15);
    });
    g.copy(1, 0, 0, 16, 16, 0, sx, sy);
    w.redraw = true;
    const [px, py] = [w.cursorX, w.cursorY];
    const d = NAV[key];
    if (d) {
      w.cursorX += d[0];
      w.cursorY += d[1];
    }
    const nx = city.x + w.cursorX;
    const ny = city.y + w.cursorY;
    if (Math.abs(w.cursorX) > 2 || Math.abs(w.cursorY) > 2 || Math.abs(w.cursorX) + Math.abs(w.cursorY) >= 4 || !isValid(nx, ny) ||
      !(state.map.explored[cellIndex(nx, ny)]! & (1 << state.humanPlayer))) {
      w.cursorX = px;
      w.cursorY = py;
    }
    if (isConfirm(key)) {
      toggleCityTile(state, cityId, cityTileIndex(w.cursorX, w.cursorY));
      return 'stay';
    }
  } while (key !== 'Escape');
  w.tileMode = false;
  return 'stay';
}
