/**
 * Muzyka i efekty jak w oryginale: numery utworów PlayTune i wybór utworu w miejscach, gdzie oryginał woła
 * Segment_11a8.F0_11a8_046c (dosłowne tłumaczenie asemblera, commit ec23ac3 wzorca). Odtwarza gospodarz
 * (`UiHost.playTune`, w aplikacji sterownik .CVL z kopii gry na emulatorze — pakiet @civ-remake/sound).
 */
import { NATIONS, UNITS, type GameEvent, type GameState } from '@civ-remake/engine';

/**
 * Numery utworów i efektów (procedury 0–44 sterownika; większe numery sterownik pomija).
 * Hymny narodów — z tabeli nacji: ShortTune 19–32, LongTune 5–18.
 */
export const TUNE = {
  /** Cisza — koniec programu (Main). */
  silence: 0,
  /** Koniec bieżącego utworu — po komunikatach, ekranach i rozmowach. */
  stop: 1,
  /** Napisy początkowe (MainIntro.F2_0000_0000) i lot statku na Alfa Centauri (F2_0000_0bd7). */
  intro: 3,
  /** Historia świata „In the beginning…” (MapInitAndIntro.F7_0000_17cf). */
  worldHistory: 4,
  /** Groźby i żądania władcy (MeetWithKing, THREAT_KEYS). */
  threat: 33,
  /** „We love the King”, Hall of Fame, zwycięstwo statkiem kosmicznym. */
  celebration: 34,
  /** Koniec święta, przegrana (ARCH.PIC). */
  sad: 35,
  /** Głód, test jądrowy, niepokoje, upadek demokracji, katastrofa elektrowni jądrowej. */
  disaster: 36,
  /** Ruch zablokowany strefą kontroli (MoveUnit, przed poradą *ZOC). */
  zoneOfControl: 37,
  /** Walka: wygrana człowieka / przegrana albo walka obcych; „Heavy” — silna zwycięska jednostka. */
  combatWon: 38,
  combatLost: 39,
  combatWonHeavy: 40,
  combatLostHeavy: 41,
  /** Wybuch jądrowy (Animations.F22_0000_0967_NukeAnimation). */
  nuclearExplosion: 42,
  /** Zwycięski atak bombowca. */
  bomber: 43,
  /** Nowy budynek wchodzi do panoramy miasta (CityView.F19_0000_0000). */
  newBuilding: 44,
} as const;

/** Drugi parametr PlayTune przy hymnach (rozmowy, pałac, koniec gry). */
export const ANTHEM = 3;

const nationOf = (state: GameState, player: number) => NATIONS[state.players[player]?.nation ?? 0] ?? NATIONS[0]!;
/** Krótki hymn gracza (Nations[...].ShortTune). */
export const shortTune = (state: GameState, player: number) => nationOf(state, player).shortTune;
/** Długi hymn gracza (Nations[...].LongTune). */
export const longTune = (state: GameState, player: number) => nationOf(state, player).longTune;

/** Klucze KING.TXT, przy których władca grozi (MeetWithKing: PlayTune(33) przed tekstem; *CANCEL tylko jako żądanie). */
export const THREAT_KEYS: ReadonlySet<string> = new Set(['*CANCEL', '*TRIBUTE', '*TAKECIV', '*PROVOKE', '*REJECT', '*RID', '*MOBILIZE']);

/** Bombowiec (UnitTypeEnum.Bomber). */
const BOMBER = 15;

/**
 * Segment_29f3.F0_29f3_000e (AttackUnit, 0x29f3:0x0416–0x04ad): dźwięk walki widocznej dla człowieka.
 * „Ciężka” walka: zwycięska jednostka ma atak > 4 albo obronę > 2 (asembler sprawdza atakującego przy jego wygranej,
 * obrońcę przy przegranej atakującego; nowsza wersja wzorca sprawdza atakującego zawsze).
 * Wygrana bombowca — 43; wygrana człowieka (jako atakującego albo obrońcy) — 38/40; pozostałe — 39/41.
 */
export function combatTune(state: GameState, ev: GameEvent): number {
  const attackerType = ev.attackerType as number;
  const defenderType = ev.defenderType as number;
  const won = ev.attackerWon === true;
  const big = (t: number) => (UNITS[t]?.attack ?? 0) > 4 || (UNITS[t]?.defense ?? 0) > 2;
  const heavy = won ? big(attackerType) : big(defenderType);
  if (won && attackerType === BOMBER) return TUNE.bomber;
  const human = state.humanPlayer;
  const humanWon = (won && ev.attacker === human) || (!won && ev.defender === human);
  if (humanWon) return heavy ? TUNE.combatWonHeavy : TUNE.combatWon;
  return heavy ? TUNE.combatLostHeavy : TUNE.combatLost;
}
