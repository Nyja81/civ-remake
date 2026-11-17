// PLIK GENEROWANY — nie edytuj ręcznie. Źródło: tablice liczbowe segmentu danych w CIV.EXE (te same dane w wersjach 474.01 i 475.05).
// Odtworzenie: CIV1_DIR=... npm run extract
import type { SpaceshipPartDefinition } from './enums';

/**
 * 49 kierunków (DS:0x1882 dx, DS:0x18e4 dy): 0 = brak ruchu, 1–8 sąsiedzi od północy zgodnie z ruchem wskazówek zegara,
 * 9–24 pierścień o promieniu 2, 25–48 pierścień o promieniu 3.
 */
export const DIRECTIONS: readonly (readonly [number, number])[] = [
  [0, 0], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1],
  [0, -2], [1, -2], [2, -1], [2, 0], [2, 1], [1, 2], [0, 2], [-1, 2], [-2, 1],
  [-2, 0], [-2, -1], [-1, -2], [2, 2], [2, -2], [-2, -2], [-2, 2], [0, -3], [1, -3],
  [2, -3], [3, -2], [3, -1], [3, 0], [3, 1], [3, 2], [2, 3], [1, 3], [0, 3],
  [-1, 3], [-2, 3], [-3, 2], [-3, 1], [-3, 0], [-3, -1], [-3, -2], [-2, -3], [-1, -3],
  [3, 3], [3, -3], [-3, 3], [-3, -3],
];

/** 21 pól wokół miasta (DS:0x2498 dx, DS:0x24c2 dy; ostatnie = samo miasto). */
export const CITY_OFFSETS: readonly (readonly [number, number])[] = [
  [0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1], [0, -2],
  [2, 0], [0, 2], [-2, 0], [-1, -2], [1, -2], [2, -1], [2, 1], [1, 2], [-1, 2],
  [-2, 1], [-2, -1], [0, 0],
];

/** Kolory graczy (DS:0x1946) i ich ciemniejsze odcienie (DS:0x1956) — numery kolorów palety. */
export const PLAYER_COLORS = [12, 15, 10, 9, 14, 11, 13, 7] as const;
export const PLAYER_DARK_COLORS = [4, 7, 2, 1, 10, 3, 4, 8] as const;

/**
 * Wybór technologii przez komputer (GradeTechnology, DS:0xb0a): [podstawa, mnożnik ideologii nacji] dla 72 pozycji
 * tabeli technologii; ocena = ideologia × mnożnik + podstawa.
 */
export const TECH_AI_GRADES: readonly (readonly [number, number])[] = [
  [5, 0], [4, 1], [4, 1], [4, 0], [3, 2], [6, 1], [4, 0], [6, -1], [6, -1], [6, -1], [4, 0], [3, 0],
  [4, 0], [3, 1], [3, -2], [3, 0], [3, 1], [6, -1], [5, -2], [3, 0], [4, 0], [3, 0], [3, 1], [4, -1],
  [4, 1], [5, 0], [4, 0], [8, -2], [3, 1], [3, 2], [3, 2], [4, -1], [5, -1], [4, -2], [8, -2], [5, -1],
  [5, -1], [6, -1], [4, -1], [5, -1], [4, 1], [6, 0], [6, 1], [2, 0], [5, 1], [4, 0], [6, -2], [4, 0],
  [6, -2], [4, 0], [3, 0], [3, 1], [4, -1], [4, 1], [3, 1], [4, 0], [5, -1], [2, 1], [8, -1], [2, 2],
  [4, 1], [2, 1], [5, -2], [5, -1], [6, -1], [4, -1], [3, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0],
];

/** Wartość piksela mapy (MAP.PIC, warstwa terenu zapisu .MAP) → teren (DS:0x2ba6); -1 = żaden. */
export const PIXEL_TERRAIN: readonly number[] = [-1, 10, 3, 8, -1, -1, 1, 6, -1, 11, 2, 9, 4, 5, 0, 7];

/** Pozycje startowe na mapie Ziemi wg nacji (Array_35da, pary bajtów x, y). */
export const EARTH_START: readonly (readonly [number, number])[] = [
  [0, 0], [36, 19], [45, 22], [38, 15], [41, 24], [12, 18], [39, 18], [57, 24],
  [0, 0], [44, 12], [42, 42], [33, 16], [5, 23], [66, 19], [31, 14], [49, 19],
];

/**
 * Plan statku kosmicznego (segment 0x375a): [x, y, rysunek] w kolejności zajmowania; 0–32 struktura, 33+ — kolejne
 * moduły i komponenty (z dalszymi strukturami). Rysunek: 0–2 struktura, 3 napęd, 4 paliwo, 6 mieszkania, 7 podtrzymanie
 * życia, 8 panel słoneczny.
 */
export const SPACESHIP_CELLS: readonly (readonly [number, number, number])[] = [
  [11, 5, 1], [11, 4, 2], [11, 6, 1], [11, 7, 2], [12, 4, 0], [13, 4, 0], [12, 5, 4], [13, 5, 3], [12, 7, 0], [13, 7, 0], [12, 6, 4], [13, 6, 3],
  [12, 8, 4], [13, 8, 3], [12, 3, 4], [13, 3, 3], [11, 9, 1], [11, 10, 2], [12, 10, 0], [13, 10, 0], [12, 9, 4], [13, 9, 3], [11, 3, 2], [11, 2, 1],
  [11, 1, 2], [12, 1, 0], [13, 1, 0], [12, 2, 4], [13, 2, 3], [12, 11, 4], [13, 11, 3], [12, 0, 4], [13, 0, 3], [11, 5, 1], [11, 4, 2], [11, 6, 1],
  [11, 7, 2], [9, 6, 6], [9, 4, 7], [11, 3, 2], [10, 3, 0], [9, 3, 0], [8, 1, 8], [11, 8, 2], [10, 8, 0], [9, 8, 0], [8, 8, 0], [7, 8, 0],
  [7, 6, 7], [8, 3, 0], [7, 3, 0], [8, 9, 8], [7, 4, 6], [6, 3, 0], [5, 3, 0], [5, 4, 7], [6, 8, 0], [5, 8, 0], [4, 9, 8], [5, 6, 6],
  [4, 3, 0], [3, 3, 0], [3, 6, 7], [4, 8, 0], [3, 8, 0], [4, 1, 8], [3, 4, 6],
];

/** Części statku (DS:0x4bd0): nazwa, masa (dziesiątki ton), rysunek w DOCKER.PIC; indeks = numer rysunku. */
export const SPACESHIP_PARTS: readonly SpaceshipPartDefinition[] = [
  { name: "Structure1", mass: 1, rect: [0, 16, 16, 16] },
  { name: "Structure2", mass: 1, rect: [16, 16, 16, 16] },
  { name: "Structure3", mass: 1, rect: [32, 16, 16, 16] },
  { name: "Propulsion", mass: 4, rect: [256, 48, 32, 16] },
  { name: "Fuel", mass: 4, rect: [0, 80, 16, 16] },
  { name: "NONE", mass: 4, rect: [192, 96, 32, 32] },
  { name: "Habitation", mass: 16, rect: [224, 96, 32, 32] },
  { name: "Life Support", mass: 16, rect: [288, 96, 32, 32] },
  { name: "Solar Panel", mass: 4, rect: [0, 96, 32, 32] },
];
