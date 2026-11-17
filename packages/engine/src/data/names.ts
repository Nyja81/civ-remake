// PLIK GENEROWANY — nie edytuj ręcznie. Źródło: tablice napisów segmentu danych w CIV.EXE (te same dane w wersjach 474.01 i 475.05).
// Odtworzenie: CIV1_DIR=... npm run extract

/** Nazwy ustrojów (DS:0x1966) — menu wyboru ustroju, komunikaty o zmianie ustroju, raporty, powtórka. */
export const GOVERNMENT_NAMES = ["Anarchy", "Despotism", "Monarchy", "Communist", "Republic", "Democratic"] as const;

/** Tytuły władców wg ustroju (DS:0x19b2) — „King ” ze spacją, jak w CIV.EXE. */
export const LEADER_TITLES = ["Mr.", "Emperor", "King ", "Comrade", "President", "President"] as const;

/** Towary karawany wg numeru jednostki & 7 (DS:0x1972). */
export const CARAVAN_GOODS = ["Silk", "Silver", "Wine", "Copper", "Gems", "Dye", "Salt", "Spice"] as const;

/** Krótkie nazwy poziomów trudności (DS:0x33a2) — wiersz zapisu gry i tabela Hall of Fame (menu nowej gry ma pełne nazwy). */
export const DIFFICULTY_TITLES = ["Chief", "Lord", "Prince", "King", "Emperor"] as const;

/**
 * Postaci sławne (segment 0x36d4) w kolejności indeksu gry: od najsłabszej do najlepszej. W CIV.EXE leżą odwrotnie —
 * oryginał czyta wpis 19 − indeks (F3_0000_065d).
 */
export const FAMOUS_PERSONS = [
  "Dan Quayle", "Emperor Nero", "Ferdinand Marcos", "Neville Chamberlain",
  "Louis the XVI", "Kaiser Wilhelm", "Eric the Red", "Otto von Bismarck",
  "Simon Bolivar", "Vladimir Lenin", "Charles De Gaulle", "Cleopatra",
  "Winston Churchill", "Sulayman the Magnificent", "Franklin Roosevelt", "Shogun Tokugawa",
  "Thomas Jefferson", "King Charlemagne", "Emperor Augustus", "Solomon the Wise",
] as const;

/** Raport historyka (F12_0000_09e2): historycy (DS:0x4516), oceny (DS:0x451e), rodzaje rankingu (DS:0x452c). */
export const HISTORIANS = ["Herodotus", "Pliny", "Toynbee", "Gibbon"] as const;
export const HISTORY_GRADES = ["Glorious", "Great", "Fine", "Mediocre", "Puny", "Pathetic", "Hopeless"] as const;
export const HISTORY_TYPES = ["WEALTHIEST", "MOST POWERFUL", "MOST ADVANCED", "HAPPIEST", "LARGEST"] as const;
/** Napisy raportu historyka: „<historyk> completes…”, „'The <RODZAJ> Civilizations…'”, „<n>. The <ocena> Civilization of the <naród>.” */
export const HISTORY_TEXTS = {
  completes: " completes his epic history:",
  the: "'The ",
  civilizations: " Civilizations in the World'",
  dotThe: ". The ",
  civilizationOf: " Civilization of the ",
  dot: ".",
} as const;
