/**
 * Generuje tabele danych silnika z CIV.EXE właściciela licencji.
 * Użycie: CIV1_DIR=/sciezka/do/gry npm run extract
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBuildingTables, parseNationTable, parseTechTable, parseTerrainTable, parseUnitTable, unpackExepack } from './exeTables';

const dir = process.env.CIV1_DIR;
if (!dir) {
  console.error('Ustaw CIV1_DIR na folder z oryginalną grą (CIV.EXE).');
  process.exit(1);
}

const exe = unpackExepack(new Uint8Array(readFileSync(join(dir, 'CIV.EXE'))));
const dataDir = join(dirname(fileURLToPath(import.meta.url)), '../../engine/src/data');

const header = (what: string) =>
  `// PLIK GENEROWANY — nie edytuj ręcznie. Źródło: ${what} w CIV.EXE (wersja 475.05).\n` +
  `// Odtworzenie: CIV1_DIR=... npm run extract\n`;

/** "Code of Laws" -> "CodeOfLaws" */
const toKey = (name: string) =>
  name
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join('');

const techs = parseTechTable(exe);
const techKey = new Map<number, string>([
  [-1, 'None'],
  [127, 'Never'],
  ...techs.map((t) => [t.id, toKey(t.name)] as [number, string]),
]);
const tech = (id: number) => {
  const key = techKey.get(id);
  if (!key) throw new Error(`Nieznany identyfikator technologii: ${id}`);
  return `Tech.${key}`;
};

writeFileSync(
  join(dataDir, 'techs.ts'),
  header('tabela technologii') +
    `import type { TechDefinition } from './enums';\n\n` +
    `/** None = brak wymagania; Never = wartość „nigdy” w polu obsoleteTech jednostki. */\n` +
    `export const Tech = {\n  None: -1,\n` +
    techs.map((t) => `  ${toKey(t.name)}: ${t.id},`).join('\n') +
    `\n  Never: 127,\n} as const;\nexport type Tech = (typeof Tech)[keyof typeof Tech];\n\n` +
    `export const TECHS: readonly TechDefinition[] = [\n` +
    techs
      .map((t) => `  { id: ${t.id}, name: ${JSON.stringify(t.name)}, prereq1: ${t.prereq1}, prereq2: ${t.prereq2} },`)
      .join('\n') +
    `\n];\n`,
);

const units = parseUnitTable(exe);
writeFileSync(
  join(dataDir, 'units.ts'),
  header('tabela jednostek') +
    `import type { UnitDefinition } from './enums';\nimport { Tech } from './techs';\n\n` +
    `export const UNITS: readonly UnitDefinition[] = [\n` +
    units
      .map(
        (u) =>
          `  { id: ${u.id}, name: ${JSON.stringify(u.name)}, obsoleteTech: ${tech(u.obsoleteTech)}, ` +
          `movementType: ${u.movementType}, moves: ${u.moves}, turnsOutside: ${u.turnsOutside}, ` +
          `attack: ${u.attack}, defense: ${u.defense}, cost: ${u.cost}, sightRange: ${u.sightRange}, ` +
          `transportCapacity: ${u.transportCapacity}, role: ${u.role}, requiredTech: ${tech(u.requiredTech)} },`,
      )
      .join('\n') +
    `\n];\n`,
);

const terrain = parseTerrainTable(exe);
writeFileSync(
  join(dataDir, 'terrain.ts'),
  header('tabela terenu') +
    `import type { TerrainDefinition } from './enums';\n\n` +
    `export const TERRAIN: readonly TerrainDefinition[] = [\n` +
    terrain
      .map(
        (t) =>
          `  { id: ${t.id}, name: ${JSON.stringify(t.name)}, movementCost: ${t.movementCost}, ` +
          `defenseBonus: ${t.defenseBonus}, food: ${t.food}, production: ${t.production}, trade: ${t.trade}, ` +
          `unknown1: ${t.unknown1}, terrainChangeId: ${t.terrainChangeId} },`,
      )
      .join('\n') +
    `\n];\n`,
);

const { buildings, wonders } = parseBuildingTables(exe);
writeFileSync(
  join(dataDir, 'buildings.ts'),
  header('tabela budynków i cudów') +
    `import type { BuildingDefinition, WonderDefinition } from './enums';\nimport { Tech } from './techs';\n\n` +
    `export const BUILDINGS: readonly BuildingDefinition[] = [\n` +
    buildings
      .map((b) => `  { id: ${b.id}, name: ${JSON.stringify(b.name)}, cost: ${b.cost}, upkeep: ${b.upkeep}, requiredTech: ${tech(b.requiredTech)} },`)
      .join('\n') +
    `\n];\n\nexport const WONDERS: readonly WonderDefinition[] = [\n` +
    wonders
      .map((w) => `  { id: ${w.id}, name: ${JSON.stringify(w.name)}, cost: ${w.cost}, requiredTech: ${tech(w.requiredTech)}, obsoleteTech: ${tech(w.obsoleteTech)} },`)
      .join('\n') +
    `\n];\n`,
);

const nations = parseNationTable(exe);
writeFileSync(
  join(dataDir, 'nations.ts'),
  header('tabela nacji') +
    `import type { NationDefinition } from './enums';\n\n` +
    `export const NATIONS: readonly NationDefinition[] = [\n` +
    nations
      .map(
        (n) =>
          `  { id: ${n.id}, leader: ${JSON.stringify(n.leader)}, plural: ${JSON.stringify(n.plural)}, adjective: ${JSON.stringify(n.adjective)}, ` +
          `mood: ${n.mood}, policy: ${n.policy}, ideology: ${n.ideology}, shortTune: ${n.shortTune}, longTune: ${n.longTune} },`,
      )
      .join('\n') +
    `\n];\n`,
);

console.log(
  `Zapisano: ${techs.length} technologii, ${units.length} jednostek, ${terrain.length} typów terenu, ` +
    `${buildings.length} budynków, ${wonders.length} cudów, ${nations.length} nacji.`,
);
