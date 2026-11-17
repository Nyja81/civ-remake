/**
 * Panorama miasta — część obliczeniowa CityView.F19_0000_0000_ShowCityLayout: rozkład domów, ulic, budynków i cudów
 * na siatce 19 × 12 pól. Źródło: dosłowne tłumaczenie asemblera z pierwszego commitu wzorca OpenCivOne (MIT),
 * `Overlay_19.cs` (F19_0000_0000 do adresu 0x08e4). Nowsza wersja `CityView.cs` ma tu błędy przepisania:
 * generator MT19937 zamiast rand() z ziarnem z nazwy miasta, budynki w kolejności rosnącej z pałacem włącznie
 * (oryginał: bity 23…1 malejąco), pola akweduktu w wierszu y+1 zamiast y−1.
 *
 * Uwaga: jak w oryginale funkcja ustawia ziarno WSPÓLNEGO generatora gry (srand z sumy kodów znaków nazwy miasta),
 * więc obejrzenie panoramy zmienia dalsze losowania gry.
 */
import { cityName } from './cities';
import type { GameState } from './types';
import { MOVE_DIRECTIONS } from '../world/generate';

/** Wymiary siatki panoramy: 19 kolumn × 12 wierszy; komórka (x, y) ma indeks x · 12 + y (bajty ze znakiem). */
export const CITY_VIEW_WIDTH = 19;
export const CITY_VIEW_HEIGHT = 12;

/**
 * Wartości komórek: −1 puste, −2 ulica, 0–9 dom (poziom: kolumna arkusza CITYPIX1 · 2 + wariant), 15 pole zajęte przez
 * większy rysunek, 16–38 budynek (14 + numer budynku), 65–85 cud (64 + numer cudu).
 */
export interface CityViewLayout {
  readonly cells: Int8Array;
}

/** Odczyt komórki jak w oryginale: tablica płaska (y = 12 to już następna kolumna); poza tablicą −1. */
export function cityViewCell(layout: CityViewLayout, x: number, y: number): number {
  const i = x * CITY_VIEW_HEIGHT + y;
  return i >= 0 && i < layout.cells.length ? layout.cells[i]! : -1;
}

/** F0_2dc4_007c_CheckValueRange: najpierw dolna granica, potem górna. */
const checkValueRange = (v: number, min: number, max: number) => {
  if (v < min) v = min;
  if (v > max) v = max;
  return v;
};

/** F0_2dc4_0208: odległość oryginału — dłuższa różnica + połowa krótszej (bez zawijania). */
const distance = (dx: number, dy: number) => {
  const a = Math.abs(dx);
  const b = Math.abs(dy);
  return a > b ? Math.trunc(b / 2) + a : Math.trunc(a / 2) + b;
};

/** Wonders w tle wzgórza (Piramidy, Kolos, Wielki Mur, Zapora Hoovera) — maska 0x808a; nie stoją na siatce. */
export const BACKGROUND_WONDERS = 0x808a;

/**
 * Rozkład panoramy miasta `cityId` (zużywa i przestawia generator gry jak oryginał).
 * Losowanie zakresu: F0_2dc4_005d = (n · rand()) >> 15.
 */
export function cityViewLayout(state: GameState, cityId: number): CityViewLayout {
  const city = state.cities[cityId]!;
  const cells = new Int8Array(CITY_VIEW_WIDTH * CITY_VIEW_HEIGHT).fill(-1);
  const at = (x: number, y: number) => {
    const i = x * CITY_VIEW_HEIGHT + y;
    return i >= 0 && i < cells.length ? cells[i]! : -1;
  };
  const set = (x: number, y: number, v: number) => {
    const i = x * CITY_VIEW_HEIGHT + y;
    if (i >= 0 && i < cells.length) cells[i] = v;
  };

  const techHalf = Math.trunc(state.players[city.owner]!.techCount / 2);
  const size = city.size;

  // srand(suma znaków nazwy miasta)
  let seed = 0;
  for (const ch of cityName(state, cityId)) seed = (seed + (ch.charCodeAt(0) << 24 >> 24)) & 0xffff;
  state.rng.state = seed;
  const random = (n: number) => (n * state.rng.next(0x8000)) >> 15;

  // domy: błądzenie od (9, 11) — L00dc…L0216
  let x = 9;
  let y = 11;
  let attempts = 0;
  for (let i = 0; size * 8 > i; i++) {
    if (at(x, y) !== -1) {
      attempts++;
      if (attempts < 999) i--;
    } else {
      const dist = distance(x - 9, y - 10);
      let v = checkValueRange(Math.trunc((techHalf - dist) / 3) - random(2), Math.trunc(techHalf / 6), Math.trunc(size / 4) + 6);
      v = (v << 24) >> 24;
      if (v > 9) v = 9;
      set(x, y, v);
      if (dist * dist > size * 8) {
        x = 9;
        y = 11;
      }
    }
    const [dx, dy] = MOVE_DIRECTIONS[random(8) + 1]!;
    x = checkValueRange(x + dx, 0, 18);
    y = checkValueRange(y + dy, 0, 11);
  }

  // ulice: dwie poziome i dwie ukośne
  let streetY = random(2) + 4;
  for (let i = 2; i < 17; i++) set(i, streetY, -2);
  set(18, streetY, -1);
  set(0, streetY, -1);
  streetY = random(2) + 8;
  for (let i = 2; i < 17; i++) set(i, streetY, -2);
  set(18, streetY, -1);
  set(0, streetY, -1);
  const lowerStreetY = streetY;
  for (const base of [9, 14]) {
    const sx = random(4) + base;
    for (let i = 1; i < 12; i++) set(sx - ((i + 1) >> 1), i, -2);
  }

  // Wielki Mur zajmuje lewy górny róg
  if (state.wonderCity[7] === cityId) {
    for (const [cx, cy] of [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [0, 2]] as const) set(cx, cy, 15);
  }

  // cuda na siatce (L0364)
  for (let w = 1; w <= 21; w++) {
    if (state.wonderCity[w] !== cityId || ((1 << w) & BACKGROUND_WONDERS) !== 0) continue;
    let tries = 0;
    for (;;) {
      x = random(15) + 1;
      y = random(10) + 1;
      let flags = 0;
      const area = [at(x, y), at(x + 1, y), at(x + 2, y), at(x - 1, y + 1), at(x, y + 1), at(x + 1, y + 1)];
      if (area.some((c) => c >= 0) || tries > 400) flags |= 1;
      if (area.some((c) => c >= 15) || at(x + 2, y + 1) >= 15) flags |= 2;
      if ([at(x, y), at(x + 1, y), at(x - 1, y + 1), at(x, y + 1), at(x + 1, y + 1)].includes(-2)) flags |= 2;
      if (flags === 1) break;
      tries++;
      if (tries >= 500) break;
    }
    if (tries >= 500) continue;
    set(x, y, w + 64);
    for (const [cx, cy] of [[1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [-1, 1], [1, -1], [2, -1], [3, -1]] as const) set(x + cx, y + cy, 15);
    if (y < 7 && (at(x + 1, y + 2) & 7) === 0) set(x + 1, y + 2, -1);
  }

  // budynki (L0826): bity 23…1 bez murów, akweduktu, komunikacji miejskiej, elektrowni i hydroelektrowni
  for (let bit = 23; bit >= 1; bit--) {
    if (((city.buildings >>> bit) & 1) === 0 || bit === 7 || bit === 8 || bit === 12 || bit === 18 || bit === 19) continue;
    let tries = 0;
    for (;;) {
      x = random(16) + 1;
      y = random(10) + 1;
      let flags = 0;
      const area = [at(x, y), at(x + 1, y), at(x - 1, y + 1), at(x, y + 1), at(x + 1, y + 1)];
      if (area.some((c) => c >= 0) || tries > 350) flags |= 1;
      if (area.some((c) => c >= 15) || area.includes(-2)) flags |= 2;
      if (flags === 1) break;
      tries++;
      if (tries >= 500) break;
    }
    if (tries >= 500) continue;
    set(x, y, bit + 15);
    for (const [cx, cy] of [[1, 0], [0, 1], [1, 1], [-1, 1]] as const) set(x + cx, y + cy, 15);
    if (y < 7 && (at(x + 1, y + 2) & 7) === 0) set(x + 1, y + 2, -1);
  }

  // hydroelektrownia (bit 19) w prawym dolnym rogu, akwedukt (bit 8) przy dolnej ulicy
  if ((city.buildings >>> 19) & 1) {
    set(17, 7, 34);
    set(17, 8, 15);
    set(18, 7, 15);
    set(18, 8, 15);
  }
  if ((city.buildings >>> 8) & 1) {
    set(0, lowerStreetY - 1, 23);
    for (const [cx, cy] of [[1, -1], [2, -1], [0, 0], [1, 0], [2, 0]] as const) set(cx, lowerStreetY + cy, 15);
  }
  return { cells };
}
