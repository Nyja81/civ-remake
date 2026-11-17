// PLIK GENEROWANY — nie edytuj ręcznie. Źródło: tablice ekranów w CIV.EXE (te same dane w wersjach 474.01 i 475.05).
// Odtworzenie: CIV1_DIR=... npm run extract

/** Numer portretu KING??.PIC dla nacji (Array_3938). */
export const NATION_LEADER_IDS = [3, 10, 7, 12, 1, 4, 13, 2, 3, 8, 3, 11, 9, 6, 0, 5] as const;

/** Pojęcia gry — tematy Civilopedii z menu Miscellaneous (Array_3c64). */
export const GAME_CONCEPTS = [
  "Veteran Units", "Fortify", "Irrigation", "Mining", "Roads", "RailRoads", "Anarchy", "Despotism",
  "Monarchy", "Communism", "Republic", "Democracy", "Fortress", "Pillage", "Disband", "Pollution",
  "Sentry", "Luxuries", "Taxes", "Science", "Trade Routes",
] as const;

/**
 * Napisy stron Civilopedii (Overlay 8). `noTech` — tak oryginał wypisuje wymaganie -1: nazwa technologii o indeksie -1,
 * czyli napis 22 bajty przed tabelą technologii (DS:0x4c4).
 */
export const CIVILOPEDIA_STRINGS = {
  title: "ENCYCLOPAEDIA of CIVILIZATION",
  exit: "EXIT",
  more: "MORE",
  technology: "Civilization Advance",
  cityImprovement: "City Improvement",
  wonder: "Wonder of the World",
  unit: "Military Unit",
  terrain: "Terrain Type",
  concept: "Game Concept",
  requires: "Requires ",
  cost: "Cost: ",
  shields: " shields.",
  maintenance: "Maintenance: $",
  andNuclearFission: " and Nuclear Fission",
  unitCost: "Cost: ",
  unitCostSuffix: " resources.",
  attack: "Attack Strength: ",
  defense: "Defense Strength: ",
  moves: "Movement Rate: ",
  noTech: "",
} as const;

/**
 * Numery rysunków Civilopedii (segment 0x371e): indeks = numer rysunku, wartość = temat. Technologie — 72 bajty czytane
 * przez F8_0000_16c4 (za 68. bajtem zaczyna się już tablica jednostek), jednostki (F8_0000_1790), tereny (F8_0000_17c3).
 */
export const TECH_PICTURES = [
  24, 32, 11, 65, 26, 36, 13, 59, 53, 44, 39, 5, 1, 51, 4, 35, 16, 50, 52, 38, 29, 49, 22, 0,
  21, 10, 33, 60, 19, 37, 45, 12, 15, 43, 30, 40, 2, 41, 17, 27, 18, 3, 61, 56, 57, 6, 34, 55,
  14, 62, 20, 58, 23, 8, 64, 66, 63, 31, 9, 48, 42, 7, 47, 54, 28, 25, 46, -1, 4, 21, 19, 14,
] as const;
export const UNIT_PICTURES = [4, 21, 19, 14, 24, 15, 13, 18, 16, 17, 8, 9, 12, 26, 20, 6, 1, 22, 25, 23, 11, 0, 10, 5, 2, 3, 27, 7] as const;
export const TERRAIN_PICTURES = [6, 7, 8, 9, 10, 11, 0, 2, 3, 1, 4, 5] as const;

/** Szerokości kawałków pałacu (DS:0x4b2c). */
export const PALACE_PIECE_WIDTHS = [48, 24, 24, 25, 25] as const;
/** Przesunięcia kawałków pałacu w pionie (DS:0x4b36): [poziom][styl][kawałek]. */
export const PALACE_PIECE_Y: readonly (readonly (readonly number[])[])[] = [
  [[1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]],
  [[1, 0, 0, 2, 2], [1, 0, 0, 1, 1], [1, 0, 0, 2, 2]],
  [[1, 0, 0, 2, 2], [1, 0, 0, 1, 1], [1, 0, 0, 2, 2]],
  [[1, 3, 3, 2, 2], [1, 0, 0, 1, 1], [1, 0, 0, 2, 2]],
  [[1, 3, 3, 2, 2], [1, 0, 0, 1, 1], [1, 0, 0, 2, 2]],
];

/**
 * Prostokąty cudów na WONDERS.PIC / WONDERS2.PIC (x1, y1, x2, y2; segment 0x371e:0x490); F19_0000_1606 zamienia x2/y2
 * na szerokość i wysokość = x2 − x1 + 1, y2 − y1 + 1.
 */
export const WONDER_RECTS: readonly (readonly [number, number, number, number])[] = [
  [0, 0, 0, 0], [131, 54, 318, 82], [159, 149, 227, 198], [88, 97, 211, 135], [229, 116, 268, 198], [61, 117, 101, 172],
  [164, 97, 227, 147], [1, 38, 66, 118], [268, 53, 318, 114], [9, 117, 59, 172], [126, 1, 182, 53], [276, 1, 318, 51],
  [103, 139, 157, 198], [184, 1, 224, 69], [40, 69, 101, 115], [1, 14, 147, 33], [253, 1, 274, 47], [226, 1, 251, 47],
  [103, 79, 162, 137], [270, 116, 318, 198], [63, 1, 124, 54], [240, 60, 266, 114],
];

/** Przesunięcia postaci w animacjach zamieszek i święta (DS:0x4f42 x, DS:0x4f4a y). */
export const FIGURE_OFFSETS_X = [-96, -36, 0, -56] as const;
export const FIGURE_OFFSETS_Y = [-6, -4, -2, 0] as const;

/** Pola mapki świata w oknie miasta (DS:0x280c dx, DS:0x2810 dy). */
export const CITY_MAP_OFFSETS: readonly (readonly [number, number])[] = [[0, -1], [2, 0], [0, 1], [1, 2]];

/**
 * Historia świata (F7_0000_17cf, segment 0x3710): cykle palety obrazów BIRTH1–8 — [od, do, dzielnik], szybkość cyklu
 * = 300 / dzielnik — i czasy kolejnych wierszy w jednostkach zegara muzyki (indeks = numer wiersza dłuższego niż 3 znaki).
 */
export const STORY_PALETTE_CYCLES: readonly (readonly (readonly [number, number, number])[])[] = [
  [[146, 152, 21], [183, 187, 5], [188, 191, 17]],
  [[48, 56, 11], [32, 47, 10], [141, 148, 13], [176, 183, 23], [211, 215, 3], [152, 155, 1], [57, 79, 15]],
  [[80, 95, 17], [96, 111, 7], [112, 127, 30], [136, 140, 10], [184, 188, 11]],
  [[134, 138, 5], [139, 143, 10], [240, 241, 23], [96, 101, 25], [242, 244, 30], [245, 250, 12], [251, 252, 11], [102, 105, 21]],
  [[184, 187, 21], [180, 183, 16], [135, 140, 12], [214, 215, 21], [96, 102, 17]],
  [[136, 138, 21], [129, 131, 8], [246, 249, 21], [250, 254, 12]],
  [[246, 249, 21], [250, 251, 10], [208, 210, 11], [135, 138, 16]],
  [[208, 210, 16], [216, 218, 11], [131, 134, 16], [48, 53, 25], [246, 249, 64]],
];
export const STORY_EVENT_TICKS: readonly number[] = [
  0, 192, 336, 624, 768, 912, 1104, 1200, 1440, 1632, 1872, 2016, 2256, 2352, 2496, 2688,
  2880, 3168, 3456, 3648, 3744, 3840, 3936, 4032, 4224, 4416, 4608, 4800, 4992, 5184, 5376, 5568,
  5760, 6000, 6192, 6336, 6528, 6720, 7008, 7296, 7584, 7872, 8064, 8512,
];
