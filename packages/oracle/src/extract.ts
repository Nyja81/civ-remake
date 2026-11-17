/**
 * Generuje tabele danych silnika z CIV.EXE właściciela licencji.
 * Użycie: CIV1_DIR=/sciezka/do/gry npm run extract
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBuildingTables, parseNationTable, parseTechTable, parseTerrainTable, parseUnitTable, unpackExepack } from './exeTables';
import {
  locateDataSegment, parseCityMapOffsets, parseCityNames, parseCityOffsets, parseCivilopediaStrings, parseDifficultyTitles, parseEarthStart,
  parseFaceSegment, parseFamousPersons, parseFigureOffsets, parseKingAnimation, parseGameConcepts, parseHistorianTables, parseNationLeaderIds, parsePalaceTables,
  parsePictureSegment, parsePixelToTerrain, parseStoryTables, parsePlayerTables, parseSpaceshipParts, parseTechGrades, parseTerrainModifications,
} from './exeData';

const dir = process.env.CIV1_DIR;
if (!dir) {
  console.error('Ustaw CIV1_DIR na folder z oryginalną grą (CIV.EXE).');
  process.exit(1);
}

const exe = unpackExepack(new Uint8Array(readFileSync(join(dir, 'CIV.EXE'))));
const img = locateDataSegment(exe);
const dataDir = join(dirname(fileURLToPath(import.meta.url)), '../../engine/src/data');
const uiDataDir = join(dirname(fileURLToPath(import.meta.url)), '../../ui/src/data');

const header = (what: string) =>
  `// PLIK GENEROWANY — nie edytuj ręcznie. Źródło: ${what} w CIV.EXE (te same dane w wersjach 474.01 i 475.05).\n` +
  `// Odtworzenie: CIV1_DIR=... npm run extract\n`;

/** Literał tablicy liczb/napisów/krotek w jednej linii. */
const lit = (v: unknown): string => JSON.stringify(v).replace(/,/g, ', ');
/** Literał tablicy z łamaniem co `perLine` elementów. */
const block = (items: readonly unknown[], perLine: number, indent = '  '): string => {
  const lines: string[] = [];
  for (let i = 0; i < items.length; i += perLine) lines.push(indent + items.slice(i, i + perLine).map(lit).join(', ') + ',');
  return `[\n${lines.join('\n')}\n]`;
};

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

// ── tablice dotąd przepisane ręcznie ze wzorca ─────────────────────────────────────────────

const mods = parseTerrainModifications(img);
writeFileSync(
  join(dataDir, 'terrainModifications.ts'),
  header('tabela przekształceń terenu (DS:0x44a, tuż za tabelą terenu)') +
    `import type { TerrainModification } from './enums';\n\n` +
    `/** Skutki nawadniania i kopalń dla 12 podstawowych typów terenu (indeks = teren). */\n` +
    `export const TERRAIN_MODIFICATIONS: readonly TerrainModification[] = [\n` +
    mods
      .map(
        (m, t) =>
          `  { irrigationEffect: ${m.irrigationEffect}, irrigationTurns: ${m.irrigationTurns}, miningEffect: ${m.miningEffect}, ` +
          `miningTurns: ${m.miningTurns}, aiBeforeMonarchy: ${m.aiBeforeMonarchy}, aiAfterMonarchy: ${m.aiAfterMonarchy} }, // ${terrain[t]!.name}`,
      )
      .join('\n') +
    `\n];\n`,
);

const cityNames = parseCityNames(img);
writeFileSync(
  join(dataDir, 'cityNames.ts'),
  header('tablica nazw miast (segment 0x3604)') +
    `\n/**\n * Nazwy miast: 16 na każdą z 14 nacji (w kolejności nacji 1–7, 9–15) i 32 zapasowe (224–255).\n` +
    ` * W CIV.EXE każda zajmuje 13 bajtów i jest dopełniona spacjami do 12 znaków; oryginał obcina spacje przy zakładaniu\n` +
    ` * miasta (CreateCity), więc tu są już obcięte.\n */\n` +
    `export const CITY_NAMES: readonly string[] = ${block(cityNames.names, 8)};\n`,
);

const player = parsePlayerTables(img);
const grades = parseTechGrades(img);
const earth = parseEarthStart(img);
const pixels = parsePixelToTerrain(img);
const cityOffsets = parseCityOffsets(img);
const parts = parseSpaceshipParts(img);
const pictures = parsePictureSegment(img);
writeFileSync(
  join(dataDir, 'ruleTables.ts'),
  header('tablice liczbowe segmentu danych') +
    `import type { SpaceshipPartDefinition } from './enums';\n\n` +
    `/**\n * 49 kierunków (DS:0x1882 dx, DS:0x18e4 dy): 0 = brak ruchu, 1–8 sąsiedzi od północy zgodnie z ruchem wskazówek zegara,\n` +
    ` * 9–24 pierścień o promieniu 2, 25–48 pierścień o promieniu 3.\n */\n` +
    `export const DIRECTIONS: readonly (readonly [number, number])[] = ${block(player.directions, 9)};\n\n` +
    `/** 21 pól wokół miasta (DS:0x2498 dx, DS:0x24c2 dy; ostatnie = samo miasto). */\n` +
    `export const CITY_OFFSETS: readonly (readonly [number, number])[] = ${block(cityOffsets, 9)};\n\n` +
    `/** Kolory graczy (DS:0x1946) i ich ciemniejsze odcienie (DS:0x1956) — numery kolorów palety. */\n` +
    `export const PLAYER_COLORS = ${lit(player.playerColors)} as const;\n` +
    `export const PLAYER_DARK_COLORS = ${lit(player.playerDarkColors)} as const;\n\n` +
    `/**\n * Wybór technologii przez komputer (GradeTechnology, DS:0xb0a): [podstawa, mnożnik ideologii nacji] dla 72 pozycji\n` +
    ` * tabeli technologii; ocena = ideologia × mnożnik + podstawa.\n */\n` +
    `export const TECH_AI_GRADES: readonly (readonly [number, number])[] = ${block(grades, 12)};\n\n` +
    `/** Wartość piksela mapy (MAP.PIC, warstwa terenu zapisu .MAP) → teren (DS:0x2ba6); -1 = żaden. */\n` +
    `export const PIXEL_TERRAIN: readonly number[] = ${lit(pixels)};\n\n` +
    `/** Pozycje startowe na mapie Ziemi wg nacji (Array_35da, pary bajtów x, y). */\n` +
    `export const EARTH_START: readonly (readonly [number, number])[] = ${block(earth, 8)};\n\n` +
    `/**\n * Plan statku kosmicznego (segment 0x375a): [x, y, rysunek] w kolejności zajmowania; 0–32 struktura, 33+ — kolejne\n` +
    ` * moduły i komponenty (z dalszymi strukturami). Rysunek: 0–2 struktura, 3 napęd, 4 paliwo, 6 mieszkania, 7 podtrzymanie\n * życia, 8 panel słoneczny.\n */\n` +
    `export const SPACESHIP_CELLS: readonly (readonly [number, number, number])[] = ${block(pictures.spaceshipCells, 12)};\n\n` +
    `/** Części statku (DS:0x4bd0): nazwa, masa (dziesiątki ton), rysunek w DOCKER.PIC; indeks = numer rysunku. */\n` +
    `export const SPACESHIP_PARTS: readonly SpaceshipPartDefinition[] = [\n` +
    parts.map((q) => `  { name: ${JSON.stringify(q.name)}, mass: ${q.mass}, rect: ${lit(q.rect)} },`).join('\n') +
    `\n];\n`,
);

const historian = parseHistorianTables(img);
const famous = parseFamousPersons(img);
writeFileSync(
  join(dataDir, 'names.ts'),
  header('tablice napisów segmentu danych') +
    `\n/** Nazwy ustrojów (DS:0x1966) — menu wyboru ustroju, komunikaty o zmianie ustroju, raporty, powtórka. */\n` +
    `export const GOVERNMENT_NAMES = ${lit(player.governmentNames)} as const;\n\n` +
    `/** Tytuły władców wg ustroju (DS:0x19b2) — „King ” ze spacją, jak w CIV.EXE. */\n` +
    `export const LEADER_TITLES = ${lit(player.leaderTitles)} as const;\n\n` +
    `/** Towary karawany wg numeru jednostki & 7 (DS:0x1972). */\n` +
    `export const CARAVAN_GOODS = ${lit(player.caravanGoods)} as const;\n\n` +
    `/** Krótkie nazwy poziomów trudności (DS:0x33a2) — wiersz zapisu gry i tabela Hall of Fame (menu nowej gry ma pełne nazwy). */\n` +
    `export const DIFFICULTY_TITLES = ${lit(parseDifficultyTitles(img))} as const;\n\n` +
    `/**\n * Postaci sławne (segment 0x36d4) w kolejności indeksu gry: od najsłabszej do najlepszej. W CIV.EXE leżą odwrotnie —\n` +
    ` * oryginał czyta wpis 19 − indeks (F3_0000_065d).\n */\n` +
    `export const FAMOUS_PERSONS = ${block([...famous].reverse(), 4)} as const;\n\n` +
    `/** Raport historyka (F12_0000_09e2): historycy (DS:0x4516), oceny (DS:0x451e), rodzaje rankingu (DS:0x452c). */\n` +
    `export const HISTORIANS = ${lit(historian.historians)} as const;\n` +
    `export const HISTORY_GRADES = ${lit(historian.grades)} as const;\n` +
    `export const HISTORY_TYPES = ${lit(historian.types)} as const;\n` +
    `/** Napisy raportu historyka: „<historyk> completes…”, „'The <RODZAJ> Civilizations…'”, „<n>. The <ocena> Civilization of the <naród>.” */\n` +
    `export const HISTORY_TEXTS = {\n` +
    Object.entries(historian.texts).map(([k, v]) => `  ${k}: ${JSON.stringify(v)},`).join('\n') +
    `\n} as const;\n`,
);

const palace = parsePalaceTables(img);
const figures = parseFigureOffsets(img);
const civilopedia = parseCivilopediaStrings(img);
const story = parseStoryTables(img);
const kingAnimation = parseKingAnimation(img);
const faces = parseFaceSegment(img);
writeFileSync(
  join(uiDataDir, 'screenTables.ts'),
  header('tablice ekranów') +
    `\n/** Numer portretu KING??.PIC dla nacji (Array_3938). */\n` +
    `export const NATION_LEADER_IDS = ${lit(parseNationLeaderIds(img))} as const;\n\n` +
    `/** Pojęcia gry — tematy Civilopedii z menu Miscellaneous (Array_3c64). */\n` +
    `export const GAME_CONCEPTS = ${block(parseGameConcepts(img).strings, 8)} as const;\n\n` +
    `/**\n * Napisy stron Civilopedii (Overlay 8). \`noTech\` — tak oryginał wypisuje wymaganie -1: nazwa technologii o indeksie -1,\n` +
    ` * czyli napis 22 bajty przed tabelą technologii (DS:0x4c4).\n */\n` +
    `export const CIVILOPEDIA_STRINGS = {\n` +
    Object.entries(civilopedia).map(([k, v]) => `  ${k}: ${JSON.stringify(v)},`).join('\n') +
    `\n} as const;\n\n` +
    `/**\n * Numery rysunków Civilopedii (segment 0x371e): indeks = numer rysunku, wartość = temat. Technologie — 72 bajty czytane\n` +
    ` * przez F8_0000_16c4 (za 68. bajtem zaczyna się już tablica jednostek), jednostki (F8_0000_1790), tereny (F8_0000_17c3).\n */\n` +
    `export const TECH_PICTURES = ${block(pictures.techPictures, 24)} as const;\n` +
    `export const UNIT_PICTURES = ${lit(pictures.unitPictures)} as const;\n` +
    `export const TERRAIN_PICTURES = ${lit(pictures.terrainPictures)} as const;\n\n` +
    `/** Szerokości kawałków pałacu (DS:0x4b2c). */\n` +
    `export const PALACE_PIECE_WIDTHS = ${lit(palace.widths)} as const;\n` +
    `/** Przesunięcia kawałków pałacu w pionie (DS:0x4b36): [poziom][styl][kawałek]. */\n` +
    `export const PALACE_PIECE_Y: readonly (readonly (readonly number[])[])[] = ${block(palace.pieceY, 1)};\n\n` +
    `/**\n * Prostokąty cudów na WONDERS.PIC / WONDERS2.PIC (x1, y1, x2, y2; segment 0x371e:0x490); F19_0000_1606 zamienia x2/y2\n` +
    ` * na szerokość i wysokość = x2 − x1 + 1, y2 − y1 + 1.\n */\n` +
    `export const WONDER_RECTS: readonly (readonly [number, number, number, number])[] = ${block(pictures.wonderRects, 6)};\n\n` +
    `/** Przesunięcia postaci w animacjach zamieszek i święta (DS:0x4f42 x, DS:0x4f4a y). */\n` +
    `export const FIGURE_OFFSETS_X = ${lit(figures.x)} as const;\n` +
    `export const FIGURE_OFFSETS_Y = ${lit(figures.y)} as const;\n\n` +
    `/** Pola mapki świata w oknie miasta (DS:0x280c dx, DS:0x2810 dy). */\n` +
    `export const CITY_MAP_OFFSETS: readonly (readonly [number, number])[] = ${lit(parseCityMapOffsets(img))};\n\n` +
    `/**\n * Historia świata (F7_0000_17cf, segment 0x3710): cykle palety obrazów BIRTH1–8 — [od, do, dzielnik], szybkość cyklu\n` +
    ` * = 300 / dzielnik — i czasy kolejnych wierszy w jednostkach zegara muzyki (indeks = numer wiersza dłuższego niż 3 znaki).\n */\n` +
    `export const STORY_PALETTE_CYCLES: readonly (readonly (readonly [number, number, number])[])[] = ${block(story.paletteCycles, 1)};\n` +
    `export const STORY_EVENT_TICKS: readonly number[] = ${block(story.eventTicks, 16)};\n\n` +
    `/**\n * Animacja twarzy władcy w rozmowie (F6_0000_1b33): numer klatki oczu i ust dla kroku sekwencji (DS:0x3a94, DS:0x3aa6)\n` +
    ` * i sterowanie (DS:0x3ab8: 0 = koniec, > 0 = dalej, −1/−2/−3 = skok do kroku 0/6/14).\n */\n` +
    `export const KING_EYE_SEQUENCE = ${lit(kingAnimation.eyes)} as const;\n` +
    `export const KING_MOUTH_SEQUENCE = ${lit(kingAnimation.mouth)} as const;\n` +
    `export const KING_SEQUENCE_CONTROL = ${lit(kingAnimation.control)} as const;\n` +
    `/** X ciał doradców w sali tronowej (DS:0x3afe). */\n` +
    `export const ADVISOR_X = ${lit(kingAnimation.advisorX)} as const;\n` +
    `/** Czcionka władcy wg nacji (segment 0x36fa; F6_0000_16cd: + 8, wynik 10 → 3). */\n` +
    `export const LEADER_FONTS = ${lit(faces.leaderFonts)} as const;\n` +
    `/** Punkty zaczepienia klatek twarzy wg numeru portretu (segment 0x36fa:0x10/0x48): [x, x w klatce, y, y w klatce]. */\n` +
    `export const KING_FACE_POINTS: readonly (readonly [number, number, number, number])[] = ${block(faces.facePoints, 7)};\n` +
    `/**\n * Punkty zaczepienia głów doradców (segment 0x36fa:0x80/0xF0): [wariant sali][doradca] = [x w ciele, x w GOVT??.PIC,\n` +
    ` * y w ciele, y w GOVT??.PIC]; wariant = ustrój / 2 % 3 (komunizm 6, z Invention + 3).\n */\n` +
    `export const ADVISOR_HEAD_POINTS: readonly (readonly (readonly [number, number, number, number])[])[] = ${block(faces.headPoints, 1)};\n`,
);

console.log(
  `Zapisano: ${techs.length} technologii, ${units.length} jednostek, ${terrain.length} typów terenu, ` +
    `${buildings.length} budynków, ${wonders.length} cudów, ${nations.length} nacji, ` +
    `${cityNames.names.length} nazw miast, ${pictures.spaceshipCells.length} pól statku i pozostałe tablice (ruleTables, names, screenTables).`,
);
