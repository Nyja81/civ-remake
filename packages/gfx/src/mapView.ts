/**
 * Widok mapy w trakcie gry, rysowany do ekranu 320×200 dokładnie jak w oryginale:
 * 15×12 pól po 16 px od punktu (80, 8), teren z ulepszeniami, mgła wojny, miasta, jednostki, minimapa.
 * Źródło reguł: MapManagement.DrawVisibleMap, DrawCell, DrawUnit, DrawUnitWithStatus, DrawCellWithUnit
 * oraz StartGameMenu.LoadBitmaps (położenie rysunków w SP257.PIC) z OpenCivOne (MIT).
 */
import {
  activeUnitAt, bestDefender, cellIndex, cityAt, DIRECTIONS, hasBuilding, hasSpecialResource, Improvement,
  MAP_HEIGHT, MAP_WIDTH, MovementType, NO_UNIT, occupantPlayer, PLAYER_COLORS, PLAYER_DARK_COLORS, playerHasTech, Tech, Terrain,
  UNITS, UnitStatus,
  unitsAt, wrapX, type GameState,
} from '@civ-remake/engine';
import type { PicImage } from './pic';
import type { Sheets } from './mapRenderer';

/** Obraz w indeksach palety (np. ekran 320×200). */
export interface Surface {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
}

/** Rysowanie napisu czcionką oryginału (dostarcza warstwa interfejsu). */
export type TextDrawer = (surface: Surface, text: string, x: number, y: number, color: number, shadow?: boolean) => void;

export const MAP_VIEW = { x: 80, y: 8, columns: 15, rows: 12 } as const;

/** Kolory graczy (Array_1946_PlayerColours) i ich ciemniejsze odcienie (Array_1956) — z CIV.EXE (engine/data/ruleTables). */
export { PLAYER_COLORS, PLAYER_DARK_COLORS };

interface Sprite {
  readonly w: number;
  readonly h: number;
  readonly pixels: Uint8Array;
}

/** Rysunki wycięte z arkuszy oryginału raz, przy wczytaniu gry (LoadBitmaps). */
export interface MapSprites {
  readonly sheets: Sheets;
  /** Jednostki w kolorach graczy: [gracz][typ]. */
  readonly units: Sprite[][];
}

function cut(src: PicImage, sx: number, sy: number, w: number, h: number): Sprite {
  const pixels = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) pixels[y * w + x] = src.pixels[(sy + y) * src.width + sx + x]!;
  return { w, h, pixels };
}

/** Jednostki: SP257, wiersze 160–191 (20 w rzędzie), kolory 10 i 2 zamieniane na kolory gracza. */
export function prepareSprites(sheets: Sheets): MapSprites {
  const units: Sprite[][] = [];
  for (let p = 0; p < 8; p++) {
    const row: Sprite[] = [];
    for (let j = 0; j < 28; j++) {
      const s = cut(sheets.sp, (j % 20) * 16 + 1, Math.trunc(j / 20) * 16 + 161, 15, 15);
      const main = PLAYER_COLORS[p]!;
      for (let i = 0; i < s.pixels.length; i++) {
        let c = s.pixels[i]!;
        if (main === 15 && c === 15) c = 11;
        if (main === 7 && c === 7) c = 3;
        if (c === 10) c = main;
        else if (c === 2) c = PLAYER_DARK_COLORS[p]!;
        s.pixels[i] = c;
      }
      row.push(s);
    }
    units.push(row);
  }
  return { sheets, units };
}

function blit(dst: Surface, dx: number, dy: number, src: PicImage, sx: number, sy: number, w: number, h: number, transparent: boolean, clip?: Clip): void {
  for (let y = 0; y < h; y++) {
    const ty = dy + y;
    if (ty < 0 || ty >= dst.height || (clip && (ty < clip.y0 || ty >= clip.y1))) continue;
    for (let x = 0; x < w; x++) {
      const tx = dx + x;
      if (tx < 0 || tx >= dst.width || (clip && (tx < clip.x0 || tx >= clip.x1))) continue;
      const c = src.pixels[(sy + y) * src.width + sx + x]!;
      if (transparent && c === 0) continue;
      dst.pixels[ty * dst.width + tx] = c;
    }
  }
}

function drawSprite(dst: Surface, dx: number, dy: number, s: Sprite, clip?: Clip): void {
  for (let y = 0; y < s.h; y++) {
    const ty = dy + y;
    if (ty < 0 || ty >= dst.height || (clip && (ty < clip.y0 || ty >= clip.y1))) continue;
    for (let x = 0; x < s.w; x++) {
      const tx = dx + x;
      if (tx < 0 || tx >= dst.width || (clip && (tx < clip.x0 || tx >= clip.x1))) continue;
      const c = s.pixels[y * s.w + x]!;
      if (c !== 0) dst.pixels[ty * dst.width + tx] = c;
    }
  }
}

interface Clip { x0: number; y0: number; x1: number; y1: number }

export function fillRect(dst: Surface, x: number, y: number, w: number, h: number, color: number): void {
  for (let j = Math.max(0, y); j < Math.min(dst.height, y + h); j++) {
    for (let i = Math.max(0, x); i < Math.min(dst.width, x + w); i++) dst.pixels[j * dst.width + i] = color;
  }
}

/** Ramka prostokąta (DrawRectangle: szerokość i wysokość podane jak w oryginale, ramka ma w+1 × h+1 px). */
export function drawRect(dst: Surface, x: number, y: number, w: number, h: number, color: number): void {
  fillRect(dst, x, y, w + 1, 1, color);
  fillRect(dst, x, y + h, w + 1, 1, color);
  fillRect(dst, x, y, 1, h + 1, color);
  fillRect(dst, x + w, y, 1, h + 1, color);
}

function replaceColor(dst: Surface, x: number, y: number, w: number, h: number, from: number, to: number): void {
  for (let j = Math.max(0, y); j < Math.min(dst.height, y + h); j++) {
    for (let i = Math.max(0, x); i < Math.min(dst.width, x + w); i++) {
      if (dst.pixels[j * dst.width + i] === from) dst.pixels[j * dst.width + i] = to;
    }
  }
}

export interface MapViewOptions {
  /** Lewy górny róg widoku w polach mapy (Var_d4cc_MapViewX, Var_d75e_MapViewY). */
  readonly viewX: number;
  readonly viewY: number;
  /** Jednostka do pominięcia (miganie aktywnej jednostki). */
  readonly hideUnit?: { player: number; unitId: number };
  /** Pokazuje całą mapę (tryb debugowania oryginału). */
  readonly revealAll?: boolean;
  readonly text?: TextDrawer;
}

/** DrawVisibleMap: widok 15×12 pól (bez minimapy). */
export function drawMapView(dst: Surface, state: GameState, sprites: MapSprites, options: MapViewOptions): void {
  const clip: Clip = { x0: MAP_VIEW.x, y0: MAP_VIEW.y, x1: MAP_VIEW.x + MAP_VIEW.columns * 16, y1: MAP_VIEW.y + MAP_VIEW.rows * 16 };
  const human = state.humanPlayer;
  const cities: { sx: number; sy: number; id: number }[] = [];
  for (let i = 0; i < MAP_VIEW.columns; i++) {
    for (let j = 0; j < MAP_VIEW.rows; j++) {
      const mx = wrapX(options.viewX + i);
      const my = options.viewY + j;
      const sx = MAP_VIEW.x + i * 16;
      const sy = MAP_VIEW.y + j * 16;
      if (my < 0 || my >= MAP_HEIGHT) {
        fillRect(dst, sx, sy, 16, 16, 0);
        continue;
      }
      if (options.revealAll || state.map.explored[cellIndex(mx, my)]! & (1 << human)) {
        const city = drawCell(dst, state, sprites, mx, my, sx, sy, clip, options);
        if (city !== -1) cities.push({ sx, sy, id: city });
        drawCellUnit(dst, state, sprites, mx, my, sx, sy, clip, options);
      } else {
        fillRect(dst, sx, sy, 16, 16, 0);
      }
    }
  }
  if (options.text) {
    for (const c of cities) {
      if (c.sy >= 184) continue;
      const name = state.cityNames[state.cities[c.id]!.nameId] ?? '';
      options.text(dst, name, Math.max(c.sx - 8, 80), c.sy + 16, 11, true);
    }
  }
}

/** DrawCell: teren, ulepszenia widziane przez człowieka, zasoby, chata, brzegi mgły, miasto. Zwraca numer narysowanego miasta. */
export function drawCell(dst: Surface, state: GameState, sprites: MapSprites, x: number, y: number, sx: number, sy: number,
  clip?: Clip, options: { revealAll?: boolean; text?: TextDrawer } = {}): number {
  const { ter, sp, sp299 } = sprites.sheets;
  const map = state.map;
  const at = (ax: number, ay: number) => (ay >= 0 && ay < MAP_HEIGHT ? map.terrain[ay * MAP_WIDTH + wrapX(ax)]! : -1);
  const t = at(x, y);
  const imp = options.revealAll ? map.improvements[cellIndex(x, y)]! : map.visibleImprovements[cellIndex(x, y)]!;
  const human = state.humanPlayer;

  if (t === Terrain.Water) {
    let mask = 0;
    for (let i = 1; i < 9; i++) {
      mask >>= 1;
      const [dx, dy] = DIRECTIONS[i]!;
      if (at(x + dx, y + dy) !== Terrain.Water && y + dy >= 0 && y + dy < MAP_HEIGHT) mask |= 0x80;
    }
    const quarters = ((mask >> 6) & 3) + (mask << 2);
    for (let i = 0; i < 4; i++) {
      const v = (quarters >> (i * 2)) & 7;
      if (i < 2) blit(dst, sx + (i & 1) * 8, sy, ter, v * 16 + (i & 1) * 8, 176, 8, 8, false, clip);
      else blit(dst, sx - (i & 1) * 8 + 8, sy + 8, ter, v * 16 - (i & 1) * 8 + 8, 184, 8, 8, false, clip);
    }
    const special: Record<number, number> = { 0x1c: 224, 0xc1: 240, 0x07: 256, 0x70: 272, 0x8f: 288, 0xf8: 304 };
    if (special[mask] !== undefined) blit(dst, sx, sy, sp299, special[mask]!, 100, 16, 16, false, clip);
    for (let i = 1; i < 9; i += 2) {
      const [dx, dy] = DIRECTIONS[i]!;
      if (at(x + dx, y + dy) === Terrain.River) blit(dst, sx, sy, ter, ((i - 1) / 2) * 16 + 128, 176, 16, 16, true, clip);
    }
  } else {
    blit(dst, sx, sy, sp299, 256, 120, 16, 16, false, clip);
  }
  if (imp & Improvement.Irrigation && t !== Terrain.Water && !(imp & Improvement.City)) blit(dst, sx, sy, sp, 4 * 16, 32, 16, 16, true, clip);
  if (t === Terrain.River) {
    let mask = 0;
    for (let i = 1; i < 9; i += 2) {
      mask >>= 1;
      const [dx, dy] = DIRECTIONS[i]!;
      const n = at(x + dx, y + dy);
      if (n === Terrain.Water || n === Terrain.River) mask |= 8;
    }
    if (map.improvements[cellIndex(x, y)]! & Improvement.Flag80) mask += 16;
    if (mask > 0) blit(dst, sx, sy, sp, (mask & 15) * 16, mask > 15 ? 80 : 64, 16, 16, true, clip);
  }
  if (t !== Terrain.Water && t !== Terrain.River) {
    let mask = 0;
    for (let i = 1; i < 9; i += 2) {
      mask >>= 1;
      const [dx, dy] = DIRECTIONS[i]!;
      if (at(x + dx, y + dy) === t && y + dy >= 0 && y + dy < MAP_HEIGHT) mask |= 8;
    }
    blit(dst, sx, sy, ter, (t < 6 ? mask : 0) * 16, t * 16, 16, 16, true, clip);
    if (t === Terrain.Grassland && ((7 * x + 11 * y) & 2) === 0) blit(dst, sx + 4, sy + 4, sp, 153, 41, 7, 7, true, clip);
  }
  if (imp & Improvement.Pollution) blit(dst, sx, sy, sp, 6 * 16, 32, 16, 16, true, clip);
  if (imp & Improvement.Road) {
    let single = imp & Improvement.Railroad ? 0 : 6;
    for (let i = 1; i < 9; i++) {
      const [dx, dy] = DIRECTIONS[i]!;
      const ny = y + dy;
      if (ny < 0 || ny >= MAP_HEIGHT) continue;
      const n = options.revealAll ? map.improvements[cellIndex(x + dx, ny)]! : map.visibleImprovements[cellIndex(x + dx, ny)]!;
      if (!(n & Improvement.Road)) continue;
      single = -1;
      const rc = Improvement.Railroad | Improvement.City;
      if (!(imp & rc) || !(n & rc)) blit(dst, sx, sy, sp, (i - 1) * 16, 48, 16, 16, true, clip);
      else blit(dst, sx, sy, sp, (i - 1) * 16 + 128, 96, 16, 16, true, clip);
    }
    if (single !== -1) fillRect(dst, sx + 7, sy + 7, 2, 2, single);
  }
  if (imp & Improvement.Mine) blit(dst, sx, sy, sp, 5 * 16, 32, 16, 16, true, clip);
  if (hasSpecialResource(x, y, state.mapSeed)) blit(dst, sx, sy, sp, t * 16 + 1, 113, 15, 15, true, clip);
  if (hutVisible(state, x, y, t)) blit(dst, sx, sy, sp, 15 * 16 + 1, 113, 15, 15, true, clip);
  if (imp & Improvement.Fortress) blit(dst, sx, sy, sp, 14 * 16 + 1, 113, 15, 15, true, clip);
  if (!options.revealAll) {
    for (let i = 1; i < 9; i += 2) {
      const [dx, dy] = DIRECTIONS[i]!;
      const ny = y + dy;
      const seen = ny >= 0 && ny < MAP_HEIGHT ? map.explored[cellIndex(x + dx, ny)]! : 0;
      if (!(seen & (1 << human))) blit(dst, sx, sy, sp, ((i - 1) / 2) * 16 + 80, 128, 16, 16, true, clip);
    }
  }
  if (imp & Improvement.City) {
    const id = cityAt(state, x, y);
    if (id !== -1) {
      const c = state.cities[id]!;
      if (c.owner === human || c.visibleSize > 0 || options.revealAll) {
        drawRect(dst, sx + 1, sy + 1, 13, 13, 15);
        drawRect(dst, sx + 2, sy + 1, 12, 12, PLAYER_DARK_COLORS[c.owner]!);
        fillRect(dst, sx + 2, sy + 2, 12, 12, PLAYER_COLORS[c.owner]!);
        blit(dst, sx + 1, sy + 1, sp, 12 * 16 + 1, 113, 15, 15, true, clip);
        replaceColor(dst, sx + 2, sy + 2, 12, 12, 5, PLAYER_DARK_COLORS[c.owner]!);
        const size = c.owner === human || options.revealAll ? c.size : c.visibleSize;
        if (c.status & 1) blit(dst, sx + 5, sy + 2, sp, 4 * 8, 128, 8, 16, true, clip);
        else options.text?.(dst, String(size), (size < 10 ? 6 : 3) + sx, sy + 5, 0);
        if (activeUnitAt(state, x, y) !== -1 || c.storedUnits[0] !== -1) drawRect(dst, sx, sy, 15, 15, 0);
        if (hasBuilding(c, 8)) blit(dst, sx + 1, sy + 1, sp, 13 * 16 + 1, 113, 15, 15, true, clip);
        return id;
      }
    }
  }
  return -1;
}

/** Chata widoczna, dopóki nikt jej nie odwiedził (bit 0 maski odkrycia) i nie stoi tam miasto. */
function hutVisible(state: GameState, x: number, y: number, t: number): boolean {
  const i = cellIndex(x, y);
  if (state.map.explored[i]! & 1 || state.map.visibleImprovements[i]! & Improvement.City) return false;
  if (y <= 1 || y >= 48 || t === Terrain.Water) return false;
  const pattern = (x & 3) * 4 + (y & 3);
  return pattern === ((((x >> 2) * 13 + (y >> 2) * 11 + state.mapSeed) + 8) & 0x1f);
}

/** DrawCellWithUnit: jednostka widoczna dla człowieka (najlepszy obrońca stosu albo okręt z ładunkiem). */
function drawCellUnit(dst: Surface, state: GameState, sprites: MapSprites, x: number, y: number, sx: number, sy: number,
  clip: Clip, options: MapViewOptions): void {
  const id = activeUnitAt(state, x, y);
  if (id === -1) return;
  const player = occupantPlayer(state, x, y);
  const u = state.players[player]!.units[id]!;
  if (!options.revealAll && player !== state.humanPlayer && !(u.visibleBy & (1 << state.humanPlayer))) return;
  if (state.map.visibleImprovements[cellIndex(x, y)]! & Improvement.City) return;
  const stack = unitsAt(state, player, x, y);
  let show = id;
  const water = state.map.terrain[cellIndex(x, y)] === Terrain.Water;
  if (stack.length > 1 && water && UNITS[u.type]!.movementType !== MovementType.Water) {
    show = stack.find((i) => UNITS[state.players[player]!.units[i]!.type]!.movementType === MovementType.Water) ?? id;
  } else {
    show = bestDefender(state, player, x, y);
  }
  if (options.hideUnit && options.hideUnit.player === player && stack.includes(options.hideUnit.unitId)) return;
  drawUnit(dst, state, sprites, player, show, sx, sy, stack.length > 1, clip, options.text);
}

/**
 * MapManagement.F0_2aea_11d4_DrawCellWithUnit — pole (DrawCell) i stojąca na nim jednostka widoczna dla człowieka
 * (bez miast). Używane m.in. w oknie miasta dla pól z obcymi jednostkami.
 */
export function drawCellWithUnit(dst: Surface, state: GameState, sprites: MapSprites, x: number, y: number, sx: number, sy: number,
  text?: TextDrawer): void {
  drawCell(dst, state, sprites, x, y, sx, sy, undefined, { text });
  drawCellUnit(dst, state, sprites, x, y, sx, sy, { x0: 0, y0: 0, x1: dst.width, y1: dst.height }, { viewX: 0, viewY: 0, text });
}

/** DrawUnit + DrawUnitWithStatus. */
export function drawUnit(dst: Surface, state: GameState, sprites: MapSprites, player: number, unitId: number, sx: number, sy: number,
  stacked: boolean, clip?: Clip, text?: TextDrawer): void {
  const u = state.players[player]!.units[unitId]!;
  if (u.type === NO_UNIT) return;
  const def = UNITS[u.type]!;
  const water = state.map.terrain[cellIndex(u.x, u.y)] === Terrain.Water;
  if (u.status & UnitStatus.Sentry && water && def.movementType !== MovementType.Water) return;
  const sprite = sprites.units[player]![u.type]!;
  if (stacked) drawSprite(dst, sx + 1, sy + 1, sprite, clip);
  drawSprite(dst, sx, sy, sprite, clip);
  const letterColor = player === 1 ? 9 : 15;
  if (u.status & UnitStatus.Fortified) blit(dst, sx, sy, sprites.sheets.sp, 13 * 16 + 1, 113, 15, 15, true, clip);
  else if (u.status & UnitStatus.Fortifying) text?.(dst, 'F', sx + 4, sy + 7, letterColor, true);
  if (player === state.humanPlayer && u.gotoX !== -1) text?.(dst, 'G', sx + 4, sy + 7, letterColor, true);
  const work = UnitStatus.BuildRoad | UnitStatus.BuildIrrigation | UnitStatus.BuildMine;
  if (u.status & work && def.movementType !== MovementType.Air) {
    let s = 'R';
    if (u.status & UnitStatus.BuildIrrigation) s = u.type !== 0 ? '?' : 'I';
    if (u.status & UnitStatus.BuildMine) {
      s = 'M';
      if (u.status & UnitStatus.BuildIrrigation) s = 'F';
      if (u.status & UnitStatus.BuildRoad) s = 'P';
    }
    text?.(dst, s, sx + 4, sy + 7, letterColor, true);
    drawRect(dst, sx - 1, sy - 1, 15, 15, 7);
  }
  if (u.status & UnitStatus.Sentry) {
    replaceColor(dst, sx, sy, 16, 16, 5, 7);
    replaceColor(dst, sx, sy, 16, 16, 8, 7);
  }
}

/** Minimapa 80×50 w lewym górnym rogu (część DrawVisibleMap) — odkryte pola i miasta. */
export function drawMiniMap(dst: Surface, state: GameState, viewX: number, viewY: number): void {
  const human = state.humanPlayer;
  let xMap = viewX - 32;
  let yMap = viewY - 19;
  if (playerHasTech(state, human, Tech.Navigation)) yMap = 0;
  fillRect(dst, 0, 8, 80, 50, 0);
  for (let j = 0; j < 50; j++) {
    const my = yMap + j;
    if (my < 0 || my >= MAP_HEIGHT) continue;
    for (let i = 0; i < 80; i++) {
      const mx = wrapX(xMap + i);
      const k = cellIndex(mx, my);
      if (!(state.map.explored[k]! & (1 << human))) continue;
      dst.pixels[(8 + j) * dst.width + i] = state.map.terrain[k] === Terrain.Water ? 1 : 2;
    }
  }
  for (const c of state.cities) {
    if (c.status === -1 || (c.visibleSize === 0 && c.owner !== human)) continue;
    const cx = wrapX(c.x - xMap);
    const cy = c.y - yMap;
    if (cy >= 0 && cy < 50) dst.pixels[(cy + 8) * dst.width + cx] = PLAYER_COLORS[c.owner]!;
  }
  // DrawShadowRectangle(0, 8, 79, 49, 15, 8): góra i prawa krawędź kolorem 8, dół i lewa kolorem 15 (jak we wzorcu)
  fillRect(dst, 0, 8, 80, 1, 8);
  fillRect(dst, 0, 57, 80, 1, 15);
  fillRect(dst, 79, 8, 1, 50, 8);
  fillRect(dst, 0, 9, 1, 49, 15);
  drawRect(dst, viewX - xMap - 1, viewY - yMap + 7, 17, 10, 15);
}
