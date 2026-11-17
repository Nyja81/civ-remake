// PLIK GENEROWANY — nie edytuj ręcznie. Źródło: tabela przekształceń terenu (DS:0x44a, tuż za tabelą terenu) w CIV.EXE (te same dane w wersjach 474.01 i 475.05).
// Odtworzenie: CIV1_DIR=... npm run extract
import type { TerrainModification } from './enums';

/** Skutki nawadniania i kopalń dla 12 podstawowych typów terenu (indeks = teren). */
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
