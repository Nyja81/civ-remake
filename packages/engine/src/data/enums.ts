/** Wymiary mapy oryginału. */
export const MAP_WIDTH = 80;
export const MAP_HEIGHT = 50;

/** Limity stanu gry wynikające z formatu zapisu oryginału. */
export const MAX_PLAYERS = 8; // gracz 0 = barbarzyńcy
export const MAX_CITIES = 128;
export const MAX_UNITS_PER_PLAYER = 128;

/** Sposób poruszania się jednostki (wartości jak w tabeli w CIV.EXE). */
export const MovementType = {
  Land: 0,
  Air: 1,
  Water: 2,
} as const;
export type MovementType = (typeof MovementType)[keyof typeof MovementType];

/** Rola jednostki, którą posługuje się przeciwnik komputerowy. */
export const UnitRole = {
  Settle: 0,
  LandAttack: 1,
  Defense: 2,
  SeaAttack: 3,
  AirAttack: 4,
  SeaTransport: 5,
  Neutral: 6,
} as const;
export type UnitRole = (typeof UnitRole)[keyof typeof UnitRole];

export interface UnitDefinition {
  /** Indeks w tabeli = identyfikator typu jednostki w zapisie gry. */
  readonly id: number;
  readonly name: string;
  /** Technologia, po której jednostki nie można już budować (127 = nigdy). */
  readonly obsoleteTech: number;
  readonly movementType: MovementType;
  readonly moves: number;
  /** Liczba tur poza miastem/lotniskowcem (samoloty); 0 = bez limitu. */
  readonly turnsOutside: number;
  readonly attack: number;
  readonly defense: number;
  /** Koszt w dziesiątkach tarcz. */
  readonly cost: number;
  readonly sightRange: number;
  readonly transportCapacity: number;
  readonly role: UnitRole;
  /** Wymagana technologia (-1 = brak). */
  readonly requiredTech: number;
}

export interface TerrainDefinition {
  /** Indeks w tabeli: 0–11 teren podstawowy, 12–23 ten sam teren z zasobem specjalnym. */
  readonly id: number;
  readonly name: string;
  readonly movementCost: number;
  /** Mnożnik obrony w połówkach (2 = ×1,0; 3 = ×1,5; 6 = ×3,0). */
  readonly defenseBonus: number;
  readonly food: number;
  readonly production: number;
  readonly trade: number;
  /** Pole o nieustalonym jeszcze znaczeniu — do wyjaśnienia ze wzorcem. */
  readonly unknown1: number;
  /** Pole związane z przekształcaniem terenu — znaczenie do potwierdzenia. */
  readonly terrainChangeId: number;
}

export interface TechDefinition {
  /** Indeks w tabeli = identyfikator technologii w zapisie gry. */
  readonly id: number;
  readonly name: string;
  /** Wymagane technologie (-1 = brak). */
  readonly prereq1: number;
  readonly prereq2: number;
}
