/**
 * Stan gry. Układ odwzorowuje dane oryginału (zapis .SVE i warstwy mapy z OpenCivOne, MIT):
 * 8 graczy (0 = barbarzyńcy), po 128 jednostek, 128 miast, mapa 80×50.
 */
import type { RandomSource } from '../world/random';

/** Flagi stanu jednostki (bajt „status” w zapisie). Prace osadników to kombinacje bitów. */
export const UnitStatus = {
  None: 0,
  Sentry: 0x1,
  BuildRoad: 0x2,
  Fortifying: 0x4,
  Fortified: 0x8,
  AiFlag: 0x10,
  Veteran: 0x20,
  BuildIrrigation: 0x40,
  BuildMine: 0x80,
  BuildFortress: 0xc0,
  CleanPollution: 0x82,
} as const;

/** Ulepszenia terenu (warstwa mapy oryginału). */
export const Improvement = {
  None: 0,
  City: 0x1,
  Irrigation: 0x2,
  Mine: 0x4,
  Road: 0x8,
  Railroad: 0x10,
  Fortress: 0x20,
  Pollution: 0x40,
  /** Znacznik wariantu rysunku przy rzece. */
  Flag80: 0x80,
  PillageMask: 0x1e,
} as const;

/** Flagi stanu miasta. */
export const CityStatus = {
  CivilDisorder: 0x1, WaterAccess: 0x2, StoredUnitsRestored: 0x4, NearRiverOrMountains: 0x8,
  AutoProduction: 0x10, TechStolen: 0x20, Celebrating: 0x40, BuildingSold: 0x80,
} as const;

export const Government = { Anarchy: 0, Despotism: 1, Monarchy: 2, Communism: 3, Republic: 4, Democracy: 5 } as const;

export const Diplomacy = {
  None: 0, Contact: 0x1, Peace: 0x2, Allied: 0x4, Vendetta: 0x8, FormalContact: 0x10, EverFought: 0x20,
  Embassy: 0x40, TributeDemanded: 0x80, PeaceTreaty: 0x100, WarDeclared: 0x200,
} as const;

/** Brak jednostki w danym miejscu tablicy. */
export const NO_UNIT = -1;

export interface Unit {
  /** Typ jednostki (indeks w UNITS) albo -1, gdy miejsce jest wolne. */
  type: number;
  status: number;
  x: number;
  y: number;
  /** Pozostały ruch w trzecich częściach punktu ruchu. */
  movesLeft: number;
  /** Dla samolotów: tury poza miastem; dla osadników: postęp pracy. */
  specialMoves: number;
  gotoX: number;
  gotoY: number;
  gotoNextDirection: number;
  /** Maska graczy, którzy widzą tę jednostkę. */
  visibleBy: number;
  homeCity: number;
}

export interface Player {
  /** Nacja 0–15 albo -1 (gracz nieaktywny). */
  nation: number;
  leader: string;
  /** Liczba mnoga, np. „Romans”. */
  nationPlural: string;
  /** Przymiotnik, np. „Roman”. */
  nationAdjective: string;
  gold: number;
  government: number;
  /** Stawka podatku w dziesiątkach procent (0–10). */
  taxRate: number;
  scienceRate: number;
  researchProgress: number;
  /** Punkty cywilizacji liczone co turę (Score). */
  score: number;
  /** Badana technologia albo -1. */
  researching: number;
  /** Bitowa mapa odkrytych technologii (72 bity). */
  techs: boolean[];
  techCount: number;
  futureTechs: number;
  /** Statek kosmiczny: rok przylotu (-1 — nie wystartował), szansa sukcesu w %, liczba kolonistów (tys.). */
  spaceshipEta: number;
  spaceshipSuccess: number;
  spaceshipPopulation: number;
  spaceshipLaunchYear: number;
  /** Plan statku 15×12 (indeks x·12 + y): numer rysunku części albo -1. */
  spaceship: number[];
  cityCount: number;
  totalCitySize: number;
  settlerCount: number;
  ranking: number;
  contactCountdown: number;
  xStart: number;
  /** Jednostka odłożona rozkazem „wait” (W) — wraca na koniec kolejki. */
  waiting: number;
  diplomacy: number[];
  units: Unit[];
  /** Dane przeciwnika komputerowego (AIEngine): strategie kontynentów, cele jednostek, siła militarna. */
  continents: PlayerContinent[];
  unitPolicies: Policy[];
  continentPolicies: Policy[];
  militaryPower: number;
  unitCount: number;
  /** Liczba jednostek danego typu na mapie. */
  activeUnits: number[];
  lostUnits: number[];
  unitsDestroyed: number[];
  unitsInProduction: number[];
}

/** Rola jednostki w strategii komputera (UnitStrategyTypeEnum): -1 brak, 0 osadnictwo, 1 atak, 2 obrona, 3 atak morski, 4 lotnictwo, 5 transport. */
export interface PlayerContinent {
  strategy: number;
  cityCount: number;
  attack: number;
  defense: number;
}

/** Cel dla jednostek komputera (UnitPolicy / ContinentPolicy). */
export interface Policy {
  x: number;
  y: number;
  role: number;
  policy: number;
}

export interface City {
  /** -1 = miejsce wolne. */
  status: number;
  x: number;
  y: number;
  size: number;
  visibleSize: number;
  owner: number;
  originalOwner: number;
  /** Produkcja: 0–27 jednostka, -1…-24 budynek, -25…-45 cud. */
  production: number;
  food: number;
  shields: number;
  baseTrade: number;
  /** Bitowa maska pól pracujących (21 pól wokół miasta). */
  workers: number;
  /** Specjaliści zakodowani po 2 bity. */
  specialists: number;
  /** Budynki: bit (id - 1) dla budynku o identyfikatorze id (1–24), jak w zapisie oryginału. */
  buildings: number;
  nameId: number;
  /** Jednostki ufortyfikowane w mieście przechowywane poza tablicą jednostek (oryginał: 2 bajty). */
  storedUnits: number[];
  tradeRoutes: number[];
}

export interface Continent {
  size: number;
  buildSiteCount: number;
}

export interface GameMap {
  terrain: Uint8Array;
  riverVariant: Uint8Array;
  /** Rzeczywiste ulepszenia terenu. */
  improvements: Uint8Array;
  /** Ulepszenia, które widział gracz-człowiek (oryginał trzyma tylko jego widok). */
  visibleImprovements: Uint8Array;
  /** Numer kontynentu (ląd) albo oceanu (woda), 1–15. */
  group: Uint8Array;
  /** Atrakcyjność pola na miasto (8–15, 0 = nie nadaje się). */
  buildScore: Uint8Array;
  /** Właściciel ziemi (gracz 1–7) lub wartość pomocnicza (oryginał zapisuje tu też atrakcyjność). */
  landOwner: Uint8Array;
  /** Właściciel jednostek lub miasta na polu: bity 0–2 gracz, bit 3 = stoją jednostki. */
  occupant: Uint8Array;
  /** Maska graczy, którzy odkryli pole. */
  explored: Uint16Array;
  continents: Continent[];
  oceans: Continent[];
}

export interface GameSettings {
  instantAdvice: boolean;
  autoSave: boolean;
  endOfTurn: boolean;
  animations: boolean;
  sound: boolean;
  enemyMoves: boolean;
  civilopediaText: boolean;
  palace: boolean;
}

/** Zdarzenie dla interfejsu (komunikat, dźwięk, porada). Silnik ich nie wyświetla. */
export interface GameEvent {
  kind: string;
  player?: number;
  text?: string;
  x?: number;
  y?: number;
  [key: string]: unknown;
}

export interface GameState {
  turn: number;
  year: number;
  /** Gracz, którego faza tury trwa (0–7; 8 = koniec tury). */
  currentPlayer: number;
  difficulty: number;
  /** Ziarno mapy (decyduje o zasobach specjalnych i chatach). */
  mapSeed: number;
  earth: boolean;
  humanPlayer: number;
  /** Maska aktywnych cywilizacji. */
  activeCivs: number;
  aiOpponents: number;
  playerIdentity: number;
  nextHistoryTurn: number;
  peaceTurns: number;
  settings: GameSettings;
  map: GameMap;
  players: Player[];
  cities: City[];
  /** Miasto z cudem (indeks = numer cudu 1–21); -1 = niezbudowany, 128 = zniszczony. */
  wonderCity: number[];
  /** Nazwy miast (gracz może je zmieniać) i zajęte nazwy. */
  cityNames: string[];
  cityNameTaken: boolean[];
  techFirstDiscoveredBy: number[];
  /** Wyrównanie kosztu badań co 50 tur (Var_d2de). */
  techCatchUp: number;
  globalWarming: number;
  /** Poziom skutków zanieczyszczenia (PollutionEffectLevel). */
  pollutionLevel: number;
  pollutedSquares: number;
  /** Flagi AIEngine: gracze z siłami na kontynentach człowieka (AIPlayerFlags) i chęć kontaktu (MakeContactWithPlayer). */
  aiFlags: number;
  aiMakeContact: boolean;
  /** Człowiek na ostatnim miejscu rankingu (Var_8078) — komputer szuka kontaktu. */
  humanLowest: boolean;
  /** 0 = gra trwa. */
  gameOver: number;
  /** Bity 0–7: statek wystrzelony; bity 8–15: statek w budowie. */
  spaceshipFlags: number;
  aiSpaceshipSuccess: number;
  rng: RandomSource;
  events: GameEvent[];
}
