/**
 * Porównanie tabel silnika z oryginalnym CIV.EXE.
 * Uruchamia się tylko, gdy CIV1_DIR wskazuje folder z grą.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BUILDINGS, CARAVAN_GOODS, DIFFICULTY_TITLES, CITY_NAMES, CITY_OFFSETS, DIRECTIONS, EARTH_START, FAMOUS_PERSONS, GOVERNMENT_NAMES, HISTORIANS,
  HISTORY_GRADES, HISTORY_TEXTS, HISTORY_TYPES, LEADER_TITLES, NATIONS, PIXEL_TERRAIN, PLAYER_COLORS, PLAYER_DARK_COLORS,
  SPACESHIP_CELLS, SPACESHIP_PARTS, TECH_AI_GRADES, TECHS, TERRAIN, TERRAIN_MODIFICATIONS, UNITS, WONDERS,
} from '@civ-remake/engine';
import * as UI from '../../ui/src/data/screenTables';
import {
  locateDataSegment, parseCityMapOffsets, parseCityNames, parseCityOffsets, parseCivilopediaStrings, parseDifficultyTitles, parseEarthStart,
  parseFaceSegment, parseFamousPersons, parseFigureOffsets, parseKingAnimation, parseGameConcepts, parseHistorianTables, parseNationLeaderIds, parsePalaceTables,
  parsePictureSegment, parsePixelToTerrain, parseStoryTables, parsePlayerTables, parseSpaceshipParts, parseTechGrades, parseTerrainModifications,
  type ExeImage,
} from '../src/exeData';
import {
  parseBuildingTables, parseNationTable, parseTechTable, parseTerrainTable, parseUnitTable, unpackExepack,
} from '../src/exeTables';

const dir = process.env.CIV1_DIR;
const exePath = dir ? join(dir, 'CIV.EXE') : '';

describe.skipIf(!exePath || !existsSync(exePath))('zgodność z oryginalnym CIV.EXE', () => {
  const exe = () => unpackExepack(new Uint8Array(readFileSync(exePath)));

  it('tabela technologii jest identyczna', () => {
    expect(parseTechTable(exe())).toEqual(TECHS);
  });

  it('tabela jednostek jest identyczna', () => {
    expect(parseUnitTable(exe())).toEqual(UNITS);
  });

  it('tabela terenu jest identyczna', () => {
    expect(parseTerrainTable(exe())).toEqual(TERRAIN);
  });

  it('tabele budynków i cudów są identyczne', () => {
    expect(parseBuildingTables(exe())).toEqual({ buildings: BUILDINGS, wonders: WONDERS });
  });

  it('tabela nacji jest identyczna', () => {
    expect(parseNationTable(exe())).toEqual(NATIONS);
  });
});

describe.skipIf(!exePath || !existsSync(exePath))('tablice dotąd przepisane ze wzorca — zgodność z CIV.EXE', () => {
  const img = () => locateDataSegment(unpackExepack(new Uint8Array(readFileSync(exePath))));

  it('przekształcenia terenu i współczynniki wyboru technologii', () => {
    const i = img();
    expect(parseTerrainModifications(i)).toEqual(TERRAIN_MODIFICATIONS);
    expect(parseTechGrades(i)).toEqual(TECH_AI_GRADES);
  });

  it('kierunki, pola miasta, kolory graczy, piksele terenu, Ziemia', () => {
    const i = img();
    const p = parsePlayerTables(i);
    expect(p.directions).toEqual(DIRECTIONS);
    expect(p.playerColors).toEqual(PLAYER_COLORS);
    expect(p.playerDarkColors).toEqual(PLAYER_DARK_COLORS);
    expect(parseCityOffsets(i)).toEqual(CITY_OFFSETS);
    expect(parsePixelToTerrain(i)).toEqual(PIXEL_TERRAIN);
    expect(parseEarthStart(i)).toEqual(EARTH_START);
  });

  it('napisy: ustroje, tytuły władców, towary, historycy, postaci sławne, nazwy miast', () => {
    const i = img();
    const p = parsePlayerTables(i);
    expect(p.governmentNames).toEqual(GOVERNMENT_NAMES);
    expect(p.leaderTitles).toEqual(LEADER_TITLES);
    expect(p.caravanGoods).toEqual(CARAVAN_GOODS);
    expect(parseDifficultyTitles(i)).toEqual(DIFFICULTY_TITLES);
    const h = parseHistorianTables(i);
    expect(h.historians).toEqual(HISTORIANS);
    expect(h.grades).toEqual(HISTORY_GRADES);
    expect(h.types).toEqual(HISTORY_TYPES);
    expect(h.texts).toEqual(HISTORY_TEXTS);
    expect([...parseFamousPersons(i)].reverse()).toEqual(FAMOUS_PERSONS);
    expect(parseCityNames(i).names).toEqual(CITY_NAMES);
  });

  it('statek kosmiczny: plan i części', () => {
    const i = img();
    expect(parsePictureSegment(i).spaceshipCells).toEqual(SPACESHIP_CELLS);
    expect(parseSpaceshipParts(i)).toEqual(SPACESHIP_PARTS);
  });

  it('tablice ekranów: portrety, Civilopedia, pałac, panorama, mapka miasta', () => {
    const i = img();
    const pics = parsePictureSegment(i);
    expect(parseNationLeaderIds(i)).toEqual(UI.NATION_LEADER_IDS);
    expect(parseGameConcepts(i).strings).toEqual(UI.GAME_CONCEPTS);
    expect(parseCivilopediaStrings(i)).toEqual(UI.CIVILOPEDIA_STRINGS);
    expect(pics.techPictures).toEqual(UI.TECH_PICTURES);
    expect(pics.unitPictures).toEqual(UI.UNIT_PICTURES);
    expect(pics.terrainPictures).toEqual(UI.TERRAIN_PICTURES);
    expect(pics.wonderRects).toEqual(UI.WONDER_RECTS);
    const palace = parsePalaceTables(i);
    expect(palace.widths).toEqual(UI.PALACE_PIECE_WIDTHS);
    expect(palace.pieceY).toEqual(UI.PALACE_PIECE_Y);
    const fig = parseFigureOffsets(i);
    expect(fig.x).toEqual(UI.FIGURE_OFFSETS_X);
    expect(fig.y).toEqual(UI.FIGURE_OFFSETS_Y);
    expect(parseCityMapOffsets(i)).toEqual(UI.CITY_MAP_OFFSETS);
    const story = parseStoryTables(i);
    expect(story.paletteCycles).toEqual(UI.STORY_PALETTE_CYCLES);
    expect(story.eventTicks).toEqual(UI.STORY_EVENT_TICKS);
    const king = parseKingAnimation(i);
    expect([king.eyes, king.mouth, king.control, king.advisorX])
      .toEqual([UI.KING_EYE_SEQUENCE, UI.KING_MOUTH_SEQUENCE, UI.KING_SEQUENCE_CONTROL, UI.ADVISOR_X]);
    const faces = parseFaceSegment(i);
    expect(faces.leaderFonts).toEqual(UI.LEADER_FONTS);
    expect(faces.facePoints).toEqual(UI.KING_FACE_POINTS);
    expect(faces.headPoints).toEqual(UI.ADVISOR_HEAD_POINTS);
  });
});

/**
 * Porównanie wersji: CIV.EXE z CIV1_DIR (u Damiana 474.01) z obrazem danych 475.05 dołączonym do wzorca OpenCivOne
 * (`src/Resources/BinaryResources.bin`, segment 0x35cf; DS = 0x3b01). Wymaga OPENCIV1_DIR = folder wzorca.
 */
const refDir = process.env.OPENCIV1_DIR;
const refImage = refDir ? join(refDir, 'src/Resources/BinaryResources.bin') : '';

describe.skipIf(!exePath || !existsSync(exePath) || !refImage || !existsSync(refImage))('CIV.EXE a obraz danych 475.05 wzorca', () => {
  it('wszystkie tablice mają te same wartości w obu wersjach', () => {
    const a = locateDataSegment(unpackExepack(new Uint8Array(readFileSync(exePath))));
    const b: ExeImage = { bytes: new Uint8Array(readFileSync(refImage)), ds: (0x3b01 - 0x35cf) * 16 };
    const all = (i: ExeImage) => ({
      mods: parseTerrainModifications(i), grades: parseTechGrades(i), player: parsePlayerTables(i), offsets: parseCityOffsets(i),
      pixels: parsePixelToTerrain(i), earth: parseEarthStart(i), leaders: parseNationLeaderIds(i), concepts: parseGameConcepts(i).strings,
      civilopedia: parseCivilopediaStrings(i), historians: parseHistorianTables(i), palace: parsePalaceTables(i),
      figures: parseFigureOffsets(i), cityMap: parseCityMapOffsets(i), parts: parseSpaceshipParts(i), names: parseCityNames(i),
      famous: parseFamousPersons(i), pictures: parsePictureSegment(i), difficulty: parseDifficultyTitles(i), story: parseStoryTables(i),
      king: parseKingAnimation(i), faces: parseFaceSegment(i),
    });
    expect(all(a)).toEqual(all(b));
  });
});
