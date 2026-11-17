/**
 * Skutki nawadniania i kopalń dla 12 podstawowych typów terenu.
 * Wartość ujemna: -1 = niemożliwe, -2 = +1 do żywności/produkcji, -3 = +2 itd.
 * Wartość nieujemna: identyfikator terenu po przekształceniu (wartość piksela, jak terrainChangeId).
 *
 * ŹRÓDŁO: tabela TerrainModifications z OpenCivOne (MIT), odpowiadająca tabeli w CIV.EXE.
 * DO ZROBIENIA: dodać tę tabelę do `npm run extract` i porównać z CIV.EXE (tabela przepisana ręcznie).
 */
export interface TerrainModification {
  readonly irrigationEffect: number;
  readonly irrigationTurns: number;
  readonly miningEffect: number;
  readonly miningTurns: number;
  /** Przeciwnik komputerowy może ulepszać ten teren przed Monarchią. */
  readonly aiBeforeMonarchy: boolean;
  /** …i po Monarchii. */
  readonly aiAfterMonarchy: boolean;
}

export const TERRAIN_MODIFICATIONS: readonly TerrainModification[] = [
  { irrigationEffect: -2, irrigationTurns: 5, miningEffect: -2, miningTurns: 5, aiBeforeMonarchy: false, aiAfterMonarchy: false }, // Desert
  { irrigationEffect: -2, irrigationTurns: 5, miningEffect: 2, miningTurns: 15, aiBeforeMonarchy: true, aiAfterMonarchy: true }, // Plains
  { irrigationEffect: -2, irrigationTurns: 5, miningEffect: 2, miningTurns: 10, aiBeforeMonarchy: false, aiAfterMonarchy: true }, // Grassland
  { irrigationEffect: 6, irrigationTurns: 5, miningEffect: -1, miningTurns: 5, aiBeforeMonarchy: false, aiAfterMonarchy: false }, // Forest
  { irrigationEffect: -2, irrigationTurns: 10, miningEffect: -4, miningTurns: 10, aiBeforeMonarchy: true, aiAfterMonarchy: true }, // Hills
  { irrigationEffect: -1, irrigationTurns: 0, miningEffect: -2, miningTurns: 10, aiBeforeMonarchy: false, aiAfterMonarchy: false }, // Mountains
  { irrigationEffect: -1, irrigationTurns: 0, miningEffect: -1, miningTurns: 0, aiBeforeMonarchy: false, aiAfterMonarchy: false }, // Tundra
  { irrigationEffect: -1, irrigationTurns: 0, miningEffect: -1, miningTurns: 0, aiBeforeMonarchy: false, aiAfterMonarchy: false }, // Arctic
  { irrigationEffect: 10, irrigationTurns: 15, miningEffect: 2, miningTurns: 15, aiBeforeMonarchy: false, aiAfterMonarchy: false }, // Swamp
  { irrigationEffect: 10, irrigationTurns: 15, miningEffect: 2, miningTurns: 15, aiBeforeMonarchy: false, aiAfterMonarchy: false }, // Jungle
  { irrigationEffect: -1, irrigationTurns: 0, miningEffect: -1, miningTurns: 0, aiBeforeMonarchy: false, aiAfterMonarchy: false }, // Ocean
  { irrigationEffect: -2, irrigationTurns: 5, miningEffect: -1, miningTurns: 0, aiBeforeMonarchy: false, aiAfterMonarchy: true }, // River
];
