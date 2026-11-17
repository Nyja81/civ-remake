/**
 * Numery utworów i efektów przekazywane do PlayTune (Segment_11a8.F0_11a8_046c → punkt wejścia 1 sterownika).
 * Sterownik AdLib (ASOUND.CVL) ma tablicę 45 procedur (0–44, pod CS:1D0C); numery większe niż 44 są pomijane.
 * Miejsca wywołań ustalone z dosłownego tłumaczenia asemblera (commit ec23ac3 wzorca, wywołania F0_11a8_046c).
 */
export const TUNE = {
  /** Cisza — koniec programu (Main), procedura 0 sterownika woła ją też inicjalizacja. */
  silence: 0,
  /** Koniec bieżącego utworu — po komunikatach, ekranach, rozmowach. */
  stop: 1,
  /** Napisy początkowe (MainIntro.F2_0000_0000) i lot statku na Alfa Centauri (F2_0000_0bd7). */
  intro: 3,
  /** Historia świata „In the beginning…” (MapInitAndIntro.F7_0000_17cf). */
  worldHistory: 4,
  /** Groźby i żądania władcy (*CANCEL wrogie, *TRIBUTE, *TAKECIV, *PROVOKE, *REJECT, *RID, *MOBILIZE). */
  threat: 33,
  /** „We love the King”, Hall of Fame, zwycięstwo statkiem kosmicznym. */
  celebration: 34,
  /** Koniec święta, przegrana (ARCH.PIC). */
  sad: 35,
  /** Głód, test jądrowy, niepokoje, upadek demokracji, katastrofa elektrowni jądrowej. */
  disaster: 36,
  /** Ruch zablokowany strefą kontroli (MoveUnit, przed poradą *ZOC). */
  zoneOfControl: 37,
  /** Walka (AttackUnit): wygrana człowieka / przegrana albo walka obcych — słabe jednostki. */
  combatWon: 38,
  combatLost: 39,
  /** Jak wyżej, gdy któraś jednostka ma atak > 4 albo obronę > 2. */
  combatWonHeavy: 40,
  combatLostHeavy: 41,
  /** Wybuch jądrowy (Animations.F22_0000_0967_NukeAnimation). */
  nuclearExplosion: 42,
  /** Zwycięski atak bombowca. */
  bomber: 43,
  /** Nowy budynek w panoramie miasta (CityView.F19_0000_0000, wariant z wejściem budynku). */
  newBuilding: 44,
} as const;

/** Hymny narodów: LongTune 5–18 i ShortTune 19–32 są w tabeli nacji (NATIONS.longTune / shortTune). */

/** Drugi parametr PlayTune przy hymnach (wszystkie wywołania z LongTune/ShortTune w rozmowach i na ekranach). */
export const ANTHEM_PARAMETER = 3;

/** Pliki sterowników z kopii gry: AdLib/Sound Blaster i głośnik PC. */
export const SOUND_DRIVER_FILES = { adlib: 'ASOUND.CVL', speaker: 'ISOUND.CVL' } as const;
