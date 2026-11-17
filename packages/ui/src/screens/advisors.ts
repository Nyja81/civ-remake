/**
 * Raporty doradców (menu ADVISORS, F1–F6) i świata (menu WORLD, F7–F10), raport historyka i wykres potęgi —
 * rysunek w układzie oryginału. Źródło: Reports.* z OpenCivOne (MIT), nazwy funkcji wzorca przy każdym raporcie;
 * liczby liczy silnik (`packages/engine/src/game/reports.ts`).
 *
 * Grafiki: ikony mieszkańców (SP257.PIC, 8×16 z (i·8, 128) — Array_6e96), żarówka (SP257.PIC (129, 41) — Array_d4ce[12]),
 * jednostki w kolorach graczy (prepareSprites z packages/gfx — Array_d4ce[64 + gracz·32 + typ]), budynki i cuda oraz kafle
 * mapy świata (SP299.PIC, fragment, który LoadBitmaps kopiuje na ekran 2), portrety doradców z GOVT?A/M.PIC
 * (LoadGovernmentImage kopiuje je na ekran 2 w (160, 140)); bez pliku GOVT portret jest pomijany.
 */
import {
  attitudeReport, BUILDINGS, cityStatusReport, Diplomacy, continentStatistics, demographicsReport, GOVERNMENT_NAMES, HISTORIANS, HISTORY_GRADES, HISTORY_TEXTS, HISTORY_TYPES, LEADER_TITLES,
  improvementDef, intelligenceDetail, intelligenceReport, militaryLossesReport, militaryReport, palaceLevelFromScore, playerHasTech, powerGraph, scienceReport,
  Tech, techName, topFiveCities, tradeReport, turnToYear, UNITS, wonderName, wondersOfTheWorld, worldMapReport,
  type DemographicsKey, type GameState, type HistoryReport, type ReportCity,
} from '@civ-remake/engine';
import { PLAYER_COLORS, prepareSprites, type MapSprites } from '@civ-remake/gfx';
import type { GameAssets } from '../assets';
import { colorCode } from '../font';
import type { Gfx } from '../gfx';
import { isKey, type UiEvent } from '../input';
import { yearToString } from '../text';
import type { Ui } from '../ui';
import { drawReportScreen, showScoreScreen } from './reports';
import { drawMiniPalace } from './palace';


/** Raporty menu ADVISORS (kolejność opcji) i WORLD (bez SpaceShips). */
export type AdvisorReport = 'cityStatus' | 'military' | 'intelligence' | 'attitude' | 'trade' | 'science';
export type WorldReport = 'wonders' | 'topCities' | 'score' | 'worldMap' | 'demographics';
export const ADVISOR_REPORTS: readonly AdvisorReport[] = ['cityStatus', 'military', 'intelligence', 'attitude', 'trade', 'science'];
export const WORLD_REPORTS: readonly WorldReport[] = ['wonders', 'topCities', 'score', 'worldMap', 'demographics'];

/** Klawisze funkcyjne PlayerTurn: F1–F6 doradcy, F7–F10 świat. */
export const REPORT_KEYS: Readonly<Record<string, AdvisorReport | WorldReport>> = {
  F1: 'cityStatus', F2: 'military', F3: 'intelligence', F4: 'attitude', F5: 'trade', F6: 'science',
  F7: 'wonders', F8: 'topCities', F9: 'score', F10: 'worldMap',
};

/** Raport klawisza funkcyjnego albo null. */
export const reportForKey = (key: string): AdvisorReport | WorldReport | null =>
  Object.prototype.hasOwnProperty.call(REPORT_KEYS, key) ? REPORT_KEYS[key]! : null;

const sprites = new WeakMap<GameAssets, MapSprites>();
function unitSprites(assets: GameAssets): MapSprites {
  let s = sprites.get(assets);
  if (!s) {
    s = prepareSprites({ ter: assets.pic('TER257.PIC'), sp: assets.pic('SP257.PIC'), sp299: assets.pic('SP299.PIC') });
    sprites.set(assets, s);
  }
  return s;
}

/** Jednostka w kolorach gracza (15×15, kolor 0 przezroczysty). */
function drawUnitIcon(g: Gfx, assets: GameAssets, player: number, type: number, x: number, y: number): void {
  const s = unitSprites(assets).units[player]?.[type];
  if (!s) return;
  for (let j = 0; j < s.h; j++) {
    for (let i = 0; i < s.w; i++) {
      const c = s.pixels[j * s.w + i]!;
      if (c !== 0) g.screen.setPixel(x + i, y + j, c);
    }
  }
}

/** CityWorker.F0_1d12_7045_DrawWonderOrImprovement: budynek 1–24 (bez części statku 22–24) albo cud (25–45), 18×10 z SP299.PIC. */
export function drawImprovementIcon(g: Gfx, assets: GameAssets, id: number, x: number, y: number): void {
  if (id >= 22 && id <= 24) return;
  let k = id - 1;
  if (k >= 24) k -= 3;
  const sp299 = assets.pic('SP299.PIC');
  if (k >= 40) g.screen.blit(sp299, (k & 1) * 19 + 161, 100, 18, 10, x, y);
  else g.screen.blit(sp299, Math.trunc(k / 5) * 19 + 161, (k % 5) * 10 + 50, 18, 10, x, y);
}

/** CityWorker.F0_1d12_6ed4_DrawResources: mieszkańcy miasta (zadowoleni, spokojni, niezadowoleni, specjaliści) w szerokości `width`. */
export function drawCitizens(g: Gfx, assets: GameAssets, city: ReportCity, x: number, y: number, width: number): number {
  const sp = assets.pic('SP257.PIC');
  const spacing = city.size * 7 > width ? Math.trunc(width / city.size) : 7;
  const icon = (index: number) => {
    g.screen.blit(sp, index * 8, 128, 8, 16, x, y, true);
    x += spacing;
  };
  for (let i = 0; i < city.happy; i++) icon(i & 1);
  let i = 0;
  for (; i < city.size - city.specialists.length - city.happy - city.unhappy; i++) icon(2 + (i & 1));
  if (i !== 0) x += 2;
  // Wzorzec przebarwia część niezadowolonych (Var_6542 — stan okna miasta); w raportach zawsze 0
  for (let j = 0; j < city.unhappy; j++) icon(4 + (j & 1));
  x += 4;
  for (const type of city.specialists) icon(5 + type);
  return spacing;
}

/** LanguageTools.F0_2f4d_04f7_TrimStringToWidth */
export function trimToWidth(g: Gfx, text: string, maxWidth: number): string {
  while (text.length > 1 && g.stringWidth(text) > maxWidth) {
    text = text[text.length - 2] !== ' ' ? `${text.slice(0, -2)}.` : text.slice(0, -1);
  }
  return text;
}

/** Segment_2459.F0_2459_08c6_GetCityName */
export const cityNameOf = (state: GameState, cityId: number): string =>
  cityId >= 0 && cityId < 128 ? (state.cityNames[state.cities[cityId]!.nameId] ?? '') : 'NONE';

/** GameEngine.PopulationValueToString: liczba × 1000 z separatorami tysięcy. */
export const populationText = (value: number): string => (value * 1000).toLocaleString('en-US');

/** StartGameMenu.F5_0000_1af6_LoadGovernmentImage: GOVT{ustrój/2}{A|M}.PIC (komunizm: GOVT3A; po Invention — „M”). */
export function governmentPicName(state: GameState): string {
  const p = state.players[state.humanPlayer]!;
  if (p.government === 3) return 'GOVT3A.PIC';
  return `GOVT${p.government >> 1}${playerHasTech(state, state.humanPlayer, Tech.Invention) ? 'M' : 'A'}.PIC`;
}

/** Portret doradcy 40×60 w (278, 2): fragment obrazu ustroju (ekran 2 (160 + `sx`, 140) w oryginale). */
function drawAdvisor(g: Gfx, assets: GameAssets, state: GameState, sx: number): void {
  const name = governmentPicName(state);
  if (!assets.optional(name)) return;
  g.screen.blit(assets.pic(name), sx, 0, 40, 60, 278, 2);
}

/** Zapamiętanie ekranu 0 na ekranie 1 (początek każdego raportu) i przywrócenie po klawiszu. */
const saveScreen = (g: Gfx) => g.copy(0, 0, 0, 320, 200, 1, 0, 0);
async function waitAndRestore(ui: Ui): Promise<void> {
  ui.present();
  await ui.waitKeyOrClick();
  ui.gfx.copy(1, 0, 0, 320, 200, 0, 0, 0);
  ui.present();
}
async function nextPage(ui: Ui): Promise<void> {
  ui.present();
  await ui.waitKeyOrClick();
}

const productionLabel = (g: Gfx, production: number): string =>
  production < 0 ? trimToWidth(g, improvementDef(-production).name, 96) : (UNITS[production]?.name ?? '');

// ───────────────────────── doradcy ─────────────────────────

/** Reports.F14_0000_186f_CityStatusReport */
export async function showCityStatus(ui: Ui, assets: GameAssets, state: GameState): Promise<void> {
  const g = ui.gfx;
  saveScreen(g);
  drawReportScreen(ui, state, 'CITY STATUS', 8);
  let y = 32;
  for (const c of cityStatusReport(state, state.humanPlayer)) {
    if (y >= 192) {
      await nextPage(ui);
      drawReportScreen(ui, state, 'CITY STATUS', 8);
      y = 32;
    }
    g.drawString(`${cityNameOf(state, c.cityId)} (${c.size})`, 8, y, 15);
    // '{' żywność, '|' tarcze, '}' handel (znaki czcionki gry)
    g.drawString(`${c.food}{ ${c.shields}| ${c.trade}}`, 90, y, 15);
    if (c.cost !== null) g.drawString(`${productionLabel(g, c.production)}${colorCode(7)} (${c.stored}/${c.cost})`, 172, y, 15);
    y += 8;
  }
  await waitAndRestore(ui);
}

/** Reports.F14_0000_03ad_MilitaryReport, po nim F14_0000_061f_MilitaryLossesReport. */
export async function showMilitary(ui: Ui, assets: GameAssets, state: GameState): Promise<void> {
  const g = ui.gfx;
  const player = state.humanPlayer;
  saveScreen(g);
  drawReportScreen(ui, state, 'MILITARY STATUS', 1);
  let line = 0;
  let y = 32;
  for (const r of militaryReport(state, player)) {
    const u = UNITS[r.type]!;
    g.drawLine(36, y - 2, 319, y - 2, 9);
    drawUnitIcon(g, assets, player, r.type, (line & 1) * 16 + 2, y - 4);
    line++;
    g.drawString(u.name, 36, y, 15);
    g.drawString(`(${u.attack}/${u.defense}/${u.moves})`, 112, y, 11);
    if (r.active > 0) g.drawString(`${r.active} active`, 168, y, 15);
    if (r.inProduction > 0) g.drawString(`${r.inProduction} in production`, 232, y, 11);
    y += 9;
  }
  drawAdvisor(g, assets, state, 0);
  await waitAndRestore(ui);
  await showMilitaryLosses(ui, assets, state);
}

/** Reports.F14_0000_061f_MilitaryLossesReport: straty gracza (kolumna w ramce) i pozostałych cywilizacji. */
export async function showMilitaryLosses(ui: Ui, assets: GameAssets, state: GameState): Promise<void> {
  const g = ui.gfx;
  const player = state.humanPlayer;
  saveScreen(g);
  drawReportScreen(ui, state, 'MILITARY LOSSES', 4);
  let line = 0;
  let y = 28;
  for (const r of militaryLossesReport(state)) {
    g.drawLine(36, y - 1, 319, y - 1, 8);
    drawUnitIcon(g, assets, player, r.type, (line & 1) * 16 + 2, y - 4);
    line++;
    g.drawString(UNITS[r.type]!.name, 36, y, 15);
    if (r.lost[player]! > 0) g.drawString(`${r.lost[player]}`, 104, y, 12);
    let x = 104;
    for (let j = 1; j < 8; j++) {
      if (j === player) continue;
      x += 28;
      if (r.lost[j]! > 0) g.drawString(`${r.lost[j]}`, x, y, PLAYER_COLORS[j]!);
    }
    y += 7;
  }
  g.drawRectangle(100, 25, 18, y - 25, PLAYER_COLORS[player]!);
  await waitAndRestore(ui);
}

/**
 * Reports.F14_0000_0d43_IntelligenceReport: wiersz każdej cywilizacji; INFO1–7 (klawisz cyfry albo klik w przycisk po prawej)
 * otwiera szczegóły F14_0000_1164 cywilizacji z ambasadą. Inny klawisz zamyka raport.
 */
export async function showIntelligence(ui: Ui, assets: GameAssets, state: GameState, debug = false): Promise<void> {
  const g = ui.gfx;
  const human = state.humanPlayer;
  saveScreen(g);
  drawReportScreen(ui, state, 'INTELLIGENCE REPORT', 1);
  const ids: number[] = [];
  for (const e of intelligenceReport(state, debug)) {
    const p = state.players[e.player]!;
    const color = PLAYER_COLORS[e.player]!;
    let y = ids.length * 24 + 32;
    g.drawLine(4, y - 2, 316, y - 2, 9);
    if (!e.known) {
      g.drawString('No embassy established.', 96, y, color);
      ids.push(-1);
      continue;
    }
    g.drawStringWithShadow(`${p.nationPlural}: ${p.leader}`, 8, y, 15);
    const gov = GOVERNMENT_NAMES[p.government] ?? '';
    g.drawString(state.difficulty <= 1 ? `${gov}, ${p.gold}$, ${p.unitCount} units.` : `${gov}, ${p.gold}$`, 160, y, color);
    y += 8;
    let x = 16;
    for (const r of e.relations) {
      if (x > 240) {
        x = 16;
        y += 8;
      }
      const label = r.status === 'war' ? `${colorCode(12)} WAR` : `${colorCode(15)} ${r.status === 'allied' ? 'ALLIED' : 'PEACE'}`;
      g.drawString(`${state.players[r.player]!.nationPlural}:${label}`, x, y, 7);
      x += 96;
    }
    ids.push(e.player);
    const n = ids.length;
    if (e.player !== human) g.drawFilledRectangleWithCenteredText(281, n * 24 + 20, 318, n * 24 + 29, `INFO${n}`, color);
  }
  for (;;) {
    ui.present();
    const e: UiEvent = await ui.waitKeyOrClick();
    let selected = -1;
    if (isKey(e) && e.key >= '1' && e.key <= '7' && e.key.length === 1) selected = e.key.charCodeAt(0) - 49;
    if (selected === -1 && e.type === 'mousedown' && e.button === 'left' && e.x > 281) selected = Math.trunc((e.y - 28) / 24);
    if (selected < 0 || selected >= ids.length) break;
    const id = ids[selected]!;
    const embassy = (state.players[human]!.diplomacy[id]! & Diplomacy.Embassy) !== 0;
    if (id === -1 || id === human || !(embassy || debug)) break;
    await showIntelligenceDetail(ui, assets, state, id, debug);
    ui.input.clear();
  }
  g.copy(1, 0, 0, 320, 200, 0, 0, 0);
  ui.present();
}

/** Reports.F14_0000_1164_IntelligenceReport — szczegóły cywilizacji (także po założeniu ambasady i w rozmowie z władcą). */
export async function showIntelligenceDetail(ui: Ui, assets: GameAssets, state: GameState, player: number, debug = false): Promise<void> {
  const g = ui.gfx;
  const p = state.players[player]!;
  const d = intelligenceDetail(state, player);
  const white = colorCode(15);
  saveScreen(g);
  drawReportScreen(ui, state, 'INTELLIGENCE REPORT', 1);
  let y = 32;
  g.drawStringWithShadow(`Subject: the ${p.nationPlural}`, 16, 32, 15);
  y += 12;
  g.drawString(`Leader:${white} ${LEADER_TITLES[p.government] ?? ''} ${p.leader}`, 16, y, 9);
  y += 8;
  for (const t of d.traits) {
    g.drawString(t, 24, y, 7);
    y += 8;
  }
  y += 4;
  g.drawString(`Capital:${white} ${cityNameOf(state, d.capital)}`, 16, y, 9);
  y += 8;
  g.drawString(`Government:${white} ${GOVERNMENT_NAMES[p.government] ?? ''}`, 16, y, 9);
  y += 8;
  g.drawString(`Treasury:${white} ${p.gold}$`, 16, y, 9);
  y += 8;
  if (state.difficulty <= 1 || debug) {
    g.drawString(`Military:${white} ${p.unitCount} units.`, 16, y, 9);
    y += 12;
  }
  g.drawString('Foreign Affairs:', 16, y, 9);
  y += 8;
  for (const r of d.relations) {
    const text = `${r.peace ? `At${white} PEACE` : ''}${r.war ? `At${colorCode(12)} WAR` : ''}${colorCode(7)} with the ${state.players[r.player]!.nationPlural}.`;
    g.drawString(text, 24, y, 7);
    y += 8;
  }
  y += 4;
  g.drawString('Technologies:', 16, y, 9);
  y += 8;
  for (const t of d.techs) {
    g.drawString(techName(t), 24, y, 7);
    y += 8;
    if (y >= 192) break;
  }
  await waitAndRestore(ui);
}

/** Reports.F14_0000_15f4_AttitudeReport */
export async function showAttitude(ui: Ui, assets: GameAssets, state: GameState): Promise<void> {
  const g = ui.gfx;
  const report = attitudeReport(state, state.humanPlayer);
  saveScreen(g);
  drawReportScreen(ui, state, 'ATTITUDE SURVEY', 9);
  let y = 32;
  let count = 0;
  for (const c of report.cities) {
    if (y > 190) {
      await nextPage(ui);
      drawReportScreen(ui, state, 'ATTITUDE SURVEY', 9);
      y = 32;
    }
    g.drawString(`${cityNameOf(state, c.cityId)}:`, 16, y, 15);
    drawCitizens(g, assets, c, 80 + (count & 7), y - 3, 124);
    let x = 212;
    g.fillRect(212, y - 1, 90, 10, 11);
    for (const b of c.buildings) {
      drawImprovementIcon(g, assets, b, x, y - 1);
      x += 18;
    }
    count += 4;
    y += 10;
  }
  g.drawString(`Population: ${populationText(report.population)}, Happy: ${report.happyPercent}%, Content: ${report.contentPercent}%, ` +
    `Unhappy: ${report.unhappyPercent}%`, 16, y + 8, 15);
  await waitAndRestore(ui);
}

/** Reports.F14_0000_07f1_TradeReport */
export async function showTrade(ui: Ui, assets: GameAssets, state: GameState): Promise<void> {
  const g = ui.gfx;
  const report = tradeReport(state, state.humanPlayer);
  saveScreen(g);
  drawReportScreen(ui, state, 'TRADE REPORT', 2);
  drawAdvisor(g, assets, state, 40);
  g.drawString('City Trade', 8, 32, 15);
  let y = 40;
  for (const c of report.cities) {
    if (y >= 180) {
      await nextPage(ui);
      drawReportScreen(ui, state, 'TRADE REPORT', 2);
      y = 40;
    }
    g.drawStringWithShadow(trimToWidth(g, cityNameOf(state, c.cityId), 62), 16, y, 15);
    // luksus, podatek ($), nauka (~) — znaki czcionki gry
    g.drawString(c.disorder ? ` ${colorCode(12)}(Disorder)` : ` ${c.luxury}\\/${c.tax}$/${c.science}~`, 80, y, 10);
    y += 8;
  }
  g.drawString(`Total Income: ${report.totalIncome} $`, 8, y + 4, 10);
  if (report.discoveryTurns !== null && y < 180) g.drawString(`Discoveries: ${report.discoveryTurns} turns`, 8, y + 12, 10);
  g.drawString('Maintenance Costs', 160, 32, 15);
  y = 40;
  for (const m of report.maintenance) {
    if (y < 180) {
      g.drawString(`${m.count} ${BUILDINGS[m.building - 1]!.name}, ${m.cost}$`, 160, y, 14);
      y += 8;
    }
  }
  g.drawString(`Total Cost: ${report.totalCost}$`, 160, y + 4, 14);
  await waitAndRestore(ui);
}

/** Reports.F14_0000_014b_ScienceReport (napis „Researching …” jak w dosłownym tłumaczeniu — bez liczb postępu z nowszego wzorca). */
export async function showScience(ui: Ui, assets: GameAssets, state: GameState): Promise<void> {
  const g = ui.gfx;
  const r = scienceReport(state, state.humanPlayer);
  const sp = assets.pic('SP257.PIC');
  saveScreen(g);
  drawReportScreen(ui, state, 'SCIENCE REPORT', 1);
  if (r.x > 40) drawAdvisor(g, assets, state, 120);
  g.fillRect(r.x, 25, r.width, 16, 9);
  for (let i = 0; i < r.progress; i++) g.screen.blit(sp, 129, 41, 7, 7, r.x + Math.trunc((r.spacing * i) / 8), 33, true);
  if (r.researching !== -1) {
    const text = `Researching ${techName(r.researching)}`;
    g.drawCenteredString(text, 161, 26, 0);
    g.drawCenteredString(text, 160, 26, 15);
  }
  let y = 42;
  let column = 0;
  for (const t of r.techs) {
    g.drawString(techName(t.tech), (column % 3) * 100 + 8, y, t.own ? 15 : 11);
    column++;
    if (column % 3 === 0) y += 7;
    if (y > 192) break;
  }
  await waitAndRestore(ui);
}

// ───────────────────────── świat ─────────────────────────

/** Reports.F12_0000_080d_ShowWondersOfTheWorldReport — ekran tylko wtedy, gdy jest choć jeden cud. */
export async function showWonders(ui: Ui, assets: GameAssets, state: GameState): Promise<void> {
  const g = ui.gfx;
  saveScreen(g);
  let y = 999;
  for (const w of wondersOfTheWorld(state)) {
    if (y > 180) {
      if (y !== 999) await nextPage(ui);
      g.fillRect(0, 0, 320, 200, 3);
      g.drawStringWithShadow('The Wonders of the World', 100, 12, 15);
      y = 32;
    }
    const text = w.destroyed
      ? `${w.wonder < 8 ? 'The ' : ''}${wonderName(w.wonder)} (Destroyed)`
      : `${wonderName(w.wonder)} in ${cityNameOf(state, w.cityId)}. (${state.players[w.owner]!.nationAdjective})`;
    g.drawRectangle(8, y, 303, 15, PLAYER_COLORS[w.owner]!);
    drawImprovementIcon(g, assets, w.wonder + 24, 16, y + 3);
    g.drawString(trimToWidth(g, text, 270), 40, y + 5, 15);
    y += 24;
  }
  await waitAndRestore(ui);
}

/** Reports.ShowTopFiveCitiesReport */
export async function showTopFiveCities(ui: Ui, assets: GameAssets, state: GameState): Promise<void> {
  const g = ui.gfx;
  const cities = topFiveCities(state);
  saveScreen(g);
  g.fillRect(0, 0, 320, 200, 3);
  g.drawStringWithShadow('The Top Five Cities in the World', 80, 12, 15);
  let y = 32;
  cities.forEach((c, i) => {
    const color = PLAYER_COLORS[c.owner]!;
    g.drawCenteredString(`${i + 1}. ${cityNameOf(state, c.cityId)} (${state.players[c.owner]!.nationAdjective})`, 160, y + 3, color);
    drawCitizens(g, assets, c, 48, y + 10, 160);
    let x = 48 + Math.min(Math.max(c.size * 8, 0), 160) + 8;
    for (const w of c.wonders) {
      if (x < 293) drawImprovementIcon(g, assets, w + 24, x, y + 12);
      x += 19;
    }
    g.drawRectangle(8, y, 303, 25, color);
    y += 32;
  });
  await waitAndRestore(ui);
}

/** Reports.F12_0000_0000_ShowWorldMapReport (z parametrem 1: kafle terenu 4×4 z SP299.PIC); `debug` — cała mapa bez przesunięcia. */
export async function showWorldMap(ui: Ui, assets: GameAssets, state: GameState, debug = false): Promise<void> {
  const g = ui.gfx;
  const sp299 = assets.pic('SP299.PIC');
  saveScreen(g);
  g.fillRect(0, 0, 320, 200, 0);
  for (const c of worldMapReport(state, debug)) {
    g.screen.blit(sp299, 160 + c.terrain * 4, 111 + c.parity * 4, 4, 4, c.sx, c.sy);
    if (c.marker?.kind === 'city') g.fillRect(c.sx, c.sy, 4, 4, PLAYER_COLORS[c.marker.player]!);
    else if (c.marker) {
      g.fillRect(c.sx + 1, c.sy + 1, 3, 3, 0);
      g.fillRect(c.sx, c.sy, 3, 3, PLAYER_COLORS[c.marker.player]!);
    }
  }
  await waitAndRestore(ui);
}

/** Reports.F12_0000_03ac_ShowContinentStatisticReport — tylko w trybie debugowania (F9). */
export async function showContinentStatistics(ui: Ui, assets: GameAssets, state: GameState): Promise<void> {
  const g = ui.gfx;
  saveScreen(g);
  g.fillRect(0, 0, 320, 200, 4);
  for (let i = 1; i < 8; i++) {
    g.drawStringWithShadow(state.players[i]!.nationAdjective, i * 40, 8, PLAYER_COLORS[i]!);
    drawUnitIcon(g, assets, i, 0, i * 40, 16);
  }
  for (const c of continentStatistics(state)) {
    const y = 24 + c.continent * 8;
    g.drawString(`${c.size}`, 8, y, 0);
    for (const p of c.players) g.drawString(`${p.defense}/${p.attack}/${p.cities}`, p.player * 40, y, PLAYER_COLORS[p.player]!);
  }
  await waitAndRestore(ui);
}

/** Etykiety i jednostki wierszy demografii (F12_0000_0d6d): tekst wartości gracza i dopisek przy najlepszej cywilizacji. */
const DEMOGRAPHICS: Readonly<Record<DemographicsKey, { label: string; value: (v: number) => string; unit: string }>> = {
  approval: { label: 'Approval Rating:', value: (v) => `${v}%`, unit: '%' },
  population: { label: 'Population:', value: populationText, unit: '0000' },
  gnp: { label: 'GNP:', value: (v) => `${v} million $`, unit: 'M$' },
  goods: { label: 'Mfg. Goods:', value: (v) => `${v} Mtons`, unit: ' Mtons' },
  land: { label: 'Land Area:', value: (v) => `${v},000 sq.miles`, unit: ',000' },
  literacy: { label: 'Literacy:', value: (v) => `${v}%`, unit: '%' },
  disease: { label: 'Disease:', value: (v) => `${v}%`, unit: '%' },
  pollution: { label: 'Pollution:', value: (v) => `${v}0 tons/year`, unit: '0 tons' },
  lifeExpectancy: { label: 'Life Expectancy:', value: (v) => `${v} years`, unit: ' years' },
  familySize: { label: 'Family Size:', value: (v) => `${Math.trunc(v / 10)}.${v % 10} children`, unit: '' },
  military: { label: 'Military Service:', value: (v) => `${v} years`, unit: ' years' },
  income: { label: 'Annual Income:', value: (v) => `${v}$ per capita`, unit: '$' },
  productivity: { label: 'Productivity:', value: (v) => `${v}`, unit: '' },
};

const ordinal = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

/** Reports.F12_0000_0d6d_ShowsDemographicsReport z PrintPlayerRank (miejsce gracza i najlepsza cywilizacja z ambasadą). */
export async function showDemographics(ui: Ui, assets: GameAssets, state: GameState): Promise<void> {
  void assets;
  const g = ui.gfx;
  const player = state.humanPlayer;
  const rows = demographicsReport(state, player);
  saveScreen(g);
  g.fillRect(0, 0, 320, 200, 1);
  g.drawCenteredString(`${state.players[player]!.nationAdjective} Demographics`, 160, 4, 15);
  let y = 24;
  for (const r of rows) {
    const def = DEMOGRAPHICS[r.key];
    g.drawStringWithShadow(def.label, 8, y, 15);
    g.drawString(def.value(r.value), 104, y, 15);
    g.drawLine(4, y - 3, 316, y - 3, 9);
    g.drawStringWithShadow(ordinal(r.rank), 192, y, 15);
    if (r.leader !== -1) {
      const stats = `(${state.players[r.leader]!.nationPlural}: ${r.leaderValue}${def.unit})`;
      g.drawString(stats, 318 - g.stringWidth(stats), y, PLAYER_COLORS[r.leader]!);
    }
    y += 12;
  }
  await waitAndRestore(ui);
}

/**
 * Reports.F12_0000_09e2_PlayerHistoryRankingReport — okno raportu historyka (losowanie i ranking robi silnik w turze).
 * Przy każdym wierszu mini-pałac władcy (F0_1238_14a3_DrawMiniPalace w (128, y − 13), liczba rozbudów
 * z F0_1238_1c98_GetPalaceLevelFromScore) — gdy podano `assets` (arkusz SP257.PIC).
 */
export async function showHistoryReport(ui: Ui, state: GameState, report: HistoryReport, assets?: GameAssets): Promise<void> {
  const g = ui.gfx;
  saveScreen(g);
  g.fillRect(0, 0, 320, 200, 3);
  // napisy z CIV.EXE (DS:0x44b6–0x4513): „Herodotus completes his epic history:”, „'The WEALTHIEST Civilizations in the World'”
  g.drawCenteredString(`${HISTORIANS[report.historian]}${HISTORY_TEXTS.completes}`, 160, 4, 15);
  g.drawCenteredString(`${HISTORY_TEXTS.the}${HISTORY_TYPES[report.type]}${HISTORY_TEXTS.civilizations}`, 160, 12, 15);
  let y = 32;
  for (const e of report.entries) {
    if (!e.shown) continue;
    ui.present();
    await ui.waitTimer(60);
    const p = state.players[e.player]!;
    if (assets) drawMiniPalace(g, assets, state, e.player, palaceLevelFromScore(p.score), 128, y - 13);
    g.drawRectangle(8, y, 303, 15, PLAYER_COLORS[e.player]!);
    // „1. The Glorious Civilization of the Romans.” (itoa(ranga + 1) + DS:0x44f6 + ocena + DS:0x44fd + naród + DS:0x4513)
    g.drawString(`${e.rank + 1}${HISTORY_TEXTS.dotThe}${HISTORY_GRADES[e.rank]}${HISTORY_TEXTS.civilizationOf}${p.nationPlural}${HISTORY_TEXTS.dot}`, 40, y + 5, 15);
    y += 24;
  }
  ui.input.clear();
  await waitAndRestore(ui);
}

/** Reports.F12_0000_0573_ShowPowerGraphReport — wykres siły cywilizacji (koniec gry). */
export async function showPowerGraph(ui: Ui, state: GameState): Promise<void> {
  const g = ui.gfx;
  const graph = powerGraph(state);
  saveScreen(g);
  g.fillRect(0, 0, 320, 200, 8);
  g.drawRectangle(4, 9, 311, 183, 0);
  const font = g.fontId;
  g.fontId = 2;
  for (const m of graph.marks) {
    const x = Math.trunc(m.turn / 2);
    g.drawLine(x + 4, 9, x + 4, 192, 0);
    if (m.label) g.drawString(yearToString(turnToYear(m.turn)), x, 194, 15);
  }
  g.fontId = 1;
  for (const s of graph.series) g.drawString(state.players[s.player]!.nationAdjective, 8, s.player * 8 + 4, PLAYER_COLORS[s.player]!);
  // Napis jak we wzorcu (do sprawdzenia w oryginale)
  g.drawStringWithShadow('CIVILIZATION POWERGraph', 100, 2, 15);
  for (const s of graph.series) {
    let sx = 0;
    let sy = 0;
    s.values.forEach((v, j) => {
      const ex = j * 2;
      const ey = Math.trunc((180 * v) / graph.maximum);
      g.drawLine(sx + 4, 192 - sy, ex + 4, 192 - ey, PLAYER_COLORS[s.player]!);
      sx = ex;
      sy = ey;
    });
  }
  g.fontId = font;
  await waitAndRestore(ui);
}

/**
 * Raport z menu ADVISORS/WORLD albo klawisza F1–F10 (Menus.F0_2c84_0615_AdvisorsMenu, F0_2c84_06e4_ShowWorldMenu, PlayerTurn).
 * `debug` (tryb debugowania oryginału): World Map bez przesunięcia, F9 — statystyka kontynentów, F8 — wykres potęgi.
 */
export async function showReport(ui: Ui, assets: GameAssets, state: GameState, report: AdvisorReport | WorldReport, debug = false, key?: string): Promise<void> {
  if (debug && key === 'F9') return showContinentStatistics(ui, assets, state);
  if (debug && key === 'F8') return showPowerGraph(ui, state);
  switch (report) {
    case 'cityStatus': return showCityStatus(ui, assets, state);
    case 'military': return showMilitary(ui, assets, state);
    case 'intelligence': return showIntelligence(ui, assets, state, debug);
    case 'attitude': return showAttitude(ui, assets, state);
    case 'trade': return showTrade(ui, assets, state);
    case 'science': return showScience(ui, assets, state);
    case 'wonders': return showWonders(ui, assets, state);
    case 'topCities': return showTopFiveCities(ui, assets, state);
    case 'worldMap': return showWorldMap(ui, assets, state, debug);
    case 'demographics': return showDemographics(ui, assets, state);
    case 'score': {
      // GameEngine.F20_0000_0ca9_ShowCivilizationScorePopup(człowiek, true): okno wyniku i powrót do mapy
      saveScreen(ui.gfx);
      await showScoreScreen(ui, assets, state);
      ui.gfx.copy(1, 0, 0, 320, 200, 0, 0, 0);
      ui.present();
      return;
    }
  }
}
