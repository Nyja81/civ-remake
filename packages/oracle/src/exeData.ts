/**
 * Odczyt tablic z segmentów danych CIV.EXE (po rozpakowaniu EXEPACK) — tablice, które wcześniej były przepisane
 * ręcznie ze wzorca OpenCivOne. Tylko dla dewelopera: wyniki trafiają do plików generowanych przez `npm run extract`.
 *
 * Jak znajdujemy dane (wersje 474.01 i 475.05 mają inny układ segmentu danych):
 * - **Segment danych (DS)** — po podpisie biblioteki MS C („MS Run-Time Library…”), który leży w DS:0x0008.
 * - Początek DS (do ok. DS:0x2660: tabele reguł, nazwy, wskaźniki) jest w 474.01 i 475.05 identyczny bajt po bajcie,
 *   dalej (napisy interfejsu) wersje się rozjeżdżają (474.01: przesunięcie −0x50, od ok. DS:0x5100 −0x5e). Dlatego
 *   każda tablica jest szukana po treści: tablice wskaźników do napisów — po pierwszym napisie i ciągłości kolejnych,
 *   tablice liczb — za unikalnym napisem-kotwicą, który w oryginale leży tuż przed nimi (z wyrównaniem do słowa,
 *   jak robi kompilator). Odległości od kotwic sprawdzone na obu wersjach (dla 475.05 na obrazie danych dołączonym
 *   do wzorca, BinaryResources.bin).
 * - **Dalekie segmenty danych** (nazwy miast, postaci sławne, numery rysunków encyklopedii, plan statku, prostokąty
 *   cudów) leżą przed DS; w obu wersjach mają tę samą treść i ten sam układ względem siebie (sprawdzone). Kotwica:
 *   początek tablicy nazw miast („Rome” dopełnione spacjami do 12 znaków).
 *
 * Adresy w komentarzach (DS:0x…, segment 0x3604/0x36d4/0x371e) — wg dosłownego tłumaczenia wzorca (475.05, commit ec23ac3).
 */

const RTL_SIGNATURE = 'MS Run-Time Library - Copyright (c) 1988, Microsoft Corp';

/** Obraz programu z położeniem segmentu danych. */
export interface ExeImage {
  /** Rozpakowany obraz (albo sam obraz danych — dla porównania z BinaryResources.bin wzorca). */
  readonly bytes: Uint8Array;
  /** Przesunięcie DS:0000 w `bytes`. */
  readonly ds: number;
}

const latin1 = new TextDecoder('latin1');
const encode = (text: string) => Uint8Array.from(text, (c) => c.charCodeAt(0));

function findAll(hay: Uint8Array, needle: Uint8Array, from = 0, to = hay.length): number[] {
  const hits: number[] = [];
  outer: for (let i = from; i <= to - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    hits.push(i);
  }
  return hits;
}

function findOne(hay: Uint8Array, needle: Uint8Array, what: string, from = 0, to = hay.length): number {
  const hits = findAll(hay, needle, from, to);
  if (hits.length !== 1) throw new Error(`CIV.EXE: oczekiwano jednego wystąpienia ${what}, znaleziono ${hits.length}`);
  return hits[0]!;
}

/** Znajduje segment danych w rozpakowanym obrazie CIV.EXE. */
export function locateDataSegment(image: Uint8Array): ExeImage {
  const at = findOne(image, encode(RTL_SIGNATURE), 'podpisu biblioteki MS C');
  return { bytes: image, ds: at - 8 };
}

const u8 = (img: ExeImage, off: number) => img.bytes[img.ds + off]!;
const i8 = (img: ExeImage, off: number) => (u8(img, off) << 24) >> 24;
const u16 = (img: ExeImage, off: number) => u8(img, off) | (u8(img, off + 1) << 8);
const i16 = (img: ExeImage, off: number) => (u16(img, off) << 16) >> 16;

/** Napis zakończony zerem w DS. */
export function dsString(img: ExeImage, off: number): string {
  let end = off;
  while (u8(img, end) !== 0) end++;
  return latin1.decode(img.bytes.subarray(img.ds + off, img.ds + end));
}

/** Napis zakończony zerem pod przesunięciem w obrazie (dalekie segmenty). */
function rawString(bytes: Uint8Array, at: number, size: number): string {
  let end = at;
  while (end < at + size && bytes[end] !== 0) end++;
  return latin1.decode(bytes.subarray(at, end));
}

/** Przesunięcie w DS jedynego wystąpienia ciągu bajtów (w samym DS — za początkiem segmentu). */
function dsFind(img: ExeImage, text: string, what = JSON.stringify(text)): number {
  return findOne(img.bytes, encode(text), what, img.ds) - img.ds;
}

/** Koniec kotwicy wyrównany do słowa — tam kompilator kładzie następną tablicę liczb. */
function afterAnchor(img: ExeImage, text: string): number {
  const end = dsFind(img, text) + text.length;
  return (end + 1) & ~1;
}

/**
 * Tablica wskaźników (słowa) do `count` kolejnych napisów zaczynających się od `first`: szuka napisu, potem słowa
 * równego jego przesunięciu, takiego, że następne słowa wskazują kolejne napisy leżące jeden za drugim.
 */
export function findStringTable(img: ExeImage, first: string, count: number): { at: number; strings: string[] } {
  const found = findStringTables(img, first, count);
  if (found.length !== 1) throw new Error(`CIV.EXE: tablica wskaźników do napisów od "${first}" — znaleziono ${found.length}`);
  return found[0]!;
}

/** Wszystkie tablice wskaźników pasujące do opisu z `findStringTable`. */
export function findStringTables(img: ExeImage, first: string, count: number): { at: number; strings: string[] }[] {
  const found: { at: number; strings: string[] }[] = [];
  for (const s of findAll(img.bytes, encode(first + '\0'), img.ds)) {
    const target = s - img.ds;
    for (let p = img.ds; p + count * 2 <= img.bytes.length; p += 2) {
      if ((img.bytes[p]! | (img.bytes[p + 1]! << 8)) !== target) continue;
      const at = p - img.ds;
      const strings: string[] = [];
      let next = target;
      let ok = true;
      for (let k = 0; k < count && ok; k++) {
        const ptr = u16(img, at + k * 2);
        if (ptr !== next) ok = false;
        else {
          const str = dsString(img, ptr);
          strings.push(str);
          next = ptr + str.length + 1;
        }
      }
      if (ok) found.push({ at, strings });
    }
  }
  return found;
}

// ── tablice reguł z początku DS (te same w 474.01 i 475.05) ──────────────────────────────────────────

const TERRAIN_RECORD = 19;
const TECH_RECORD = 22;
const TECH_SLOTS = 72; // 67 technologii + 4 przyszłe + „Future Tech.”

export interface TerrainModificationRecord {
  irrigationEffect: number;
  irrigationTurns: number;
  miningEffect: number;
  miningTurns: number;
  aiBeforeMonarchy: boolean;
  aiAfterMonarchy: boolean;
}

/** Skutki nawadniania i kopalń (DS:0x44a): 12 × 6 słów tuż za tabelą terenu (24 × 19 B od „Desert”). */
export function parseTerrainModifications(img: ExeImage): TerrainModificationRecord[] {
  const start = dsFind(img, 'Desert\0') + 24 * TERRAIN_RECORD;
  return Array.from({ length: 12 }, (_, t) => {
    const w = (k: number) => i16(img, start + t * 12 + k * 2);
    return {
      irrigationEffect: w(0), irrigationTurns: w(1), miningEffect: w(2), miningTurns: w(3),
      aiBeforeMonarchy: w(4) !== 0, aiAfterMonarchy: w(5) !== 0,
    };
  });
}

/**
 * Współczynniki wyboru technologii przez komputer (F0_1ade_2317 GradeTechnology, DS:0xb0a): pary bajtów ze znakiem
 * [podstawa, mnożnik ideologii nacji] dla 72 pozycji, tuż za tabelą technologii (72 × 22 B od „Alphabet”).
 */
export function parseTechGrades(img: ExeImage): [number, number][] {
  const start = dsFind(img, 'Alphabet\0') + TECH_SLOTS * TECH_RECORD;
  return Array.from({ length: TECH_SLOTS }, (_, t) => [i8(img, start + t * 2), i8(img, start + t * 2 + 1)]);
}

/** Napis „przed” tabelą nazw technologii — tak oryginał wypisuje wymaganie −1 (nazwa technologii −1 = DS:0x4c4). */
export function parseTechNameBefore(img: ExeImage): string {
  return dsString(img, dsFind(img, 'Alphabet\0') - TECH_RECORD);
}

/**
 * Tablice wokół nazw ustrojów (DS:0x1882–0x19be): kierunki dx/dy (2 × 49 słów), kolory graczy (DS:0x1946) i ich ciemne
 * odcienie (DS:0x1956), wskaźniki: nazwy ustrojów (DS:0x1966), towary karawan (DS:0x1972), tytuły władców (DS:0x19b2).
 * Kotwica: tablica wskaźników do „Anarchy”, „Despotism”, … (6 napisów jeden za drugim).
 */
export function parsePlayerTables(img: ExeImage) {
  // „Anarchy”, „Despotism”… występują też w pojęciach Civilopedii — tablica ustrojów to ta, za którą leżą towary karawan
  const goods = findStringTable(img, 'Silk', 8);
  const govs = findStringTables(img, 'Anarchy', 6).filter((t) => t.at + 12 === goods.at);
  if (govs.length !== 1) throw new Error('CIV.EXE: nie znaleziono tablicy nazw ustrojów (DS:0x1966)');
  const gov = govs[0]!;
  const colors = gov.at - 0x20;
  const dy = colors - 49 * 2;
  const dx = dy - 49 * 2;
  const words = (at: number, n: number) => Array.from({ length: n }, (_, k) => i16(img, at + k * 2));
  const xs = words(dx, 49);
  const ys = words(dy, 49);
  const titles = findStringTable(img, 'Mr.', 6);
  if (titles.at !== gov.at + 0x4c) throw new Error('CIV.EXE: nieoczekiwany układ tablic wskaźników DS:0x1966–0x19b2');
  return {
    directions: xs.map((x, k) => [x, ys[k]!] as [number, number]),
    playerColors: words(colors, 8),
    playerDarkColors: words(colors + 0x10, 8),
    governmentNames: gov.strings,
    caravanGoods: goods.strings,
    leaderTitles: titles.strings,
  };
}

/**
 * 21 pól wokół miasta (DS:0x2498 x, DS:0x24c2 y — po 21 słów) za komunikatem „… the effect of\n”, „.\n”
 * i jednym słowem zmiennej (DS:0x2494–0x2497).
 */
export function parseCityOffsets(img: ExeImage): [number, number][] {
  const start = afterAnchor(img, 'the effect of\n\0.\n\0') + 4;
  return Array.from({ length: 21 }, (_, k) => [i16(img, start + k * 2), i16(img, start + 42 + k * 2)]);
}

// ── tablice z dalszej części DS (adresy różnią się między wersjami) ─────────────────────────────────

/** Wartość piksela mapy → teren (DS:0x2ba6, 16 słów; −1 = brak) — za napisami „F”, „G”, „ ” po „SDI protects …”. */
export function parsePixelToTerrain(img: ExeImage): number[] {
  const sdi = dsFind(img, 'SDI protects \0');
  const start = dsFind(img, 'F\0G\0 \0') + 6;
  if (start < sdi || start - sdi > 32) throw new Error('CIV.EXE: tablica piksel → teren nie leży za „SDI protects”');
  return Array.from({ length: 16 }, (_, k) => i16(img, start + k * 2));
}

/** Pozycje startowe na mapie Ziemi wg nacji (Array_35da: 16 par bajtów x, y) — za „…and Roads.\n” (tekst *INIT). */
export function parseEarthStart(img: ExeImage): [number, number][] {
  const start = afterAnchor(img, 'and Roads.\n\0');
  return Array.from({ length: 16 }, (_, k) => [u8(img, start + k * 2), u8(img, start + k * 2 + 1)]);
}

/**
 * Numer portretu KING??.PIC dla nacji (Array_3938, 16 bajtów). Leży za „*SCHISM” i dwoma słowami zmiennych
 * (Var_3934, Var_3936 — początkowo −1).
 */
export function parseNationLeaderIds(img: ExeImage): number[] {
  const vars = afterAnchor(img, '*UNFORTUNATE\0*SCHISM\0');
  return Array.from({ length: 16 }, (_, k) => i8(img, vars + 4 + k));
}

/** Krótkie nazwy poziomów trudności (DS:0x33a2) — wiersz zapisu gry (Overlay 11) i Hall of Fame (Overlay 3). */
export function parseDifficultyTitles(img: ExeImage): string[] {
  return findStringTable(img, 'Chief', 5).strings;
}

/** Pojęcia gry — tematy Civilopedii (Array_3c64, 21 wskaźników). */
export function parseGameConcepts(img: ExeImage): { at: number; strings: string[] } {
  return findStringTable(img, 'Veteran Units', 21);
}

/**
 * Napisy stron Civilopedii (Overlay 8): ciąg napisów tuż za tablicą pojęć gry — "a" (początek sortowania), tytuł listy
 * (dwa razy), EXIT, MORE, "zzz", nazwy plików rysunków i nagłówki rodzajów tematów, potem napisy stron.
 */
export function parseCivilopediaStrings(img: ExeImage) {
  const concepts = parseGameConcepts(img);
  const seq: string[] = [];
  let at = concepts.at + 21 * 2;
  for (let k = 0; k < 64; k++) {
    const s = dsString(img, at);
    seq.push(s);
    at += s.length + 1;
  }
  const after = (marker: string, n = 1, from = 0) => {
    const k = seq.indexOf(marker, from);
    if (k < 0) throw new Error(`CIV.EXE: brak napisu ${JSON.stringify(marker)} w napisach Civilopedii`);
    return seq[k + n]!;
  };
  const expectAt = (k: number, text: string) => {
    if (seq[k] !== text) throw new Error(`CIV.EXE: napisy Civilopedii — oczekiwano ${JSON.stringify(text)} na pozycji ${k}, jest ${JSON.stringify(seq[k])}`);
  };
  expectAt(0, 'a');
  expectAt(3, 'EXIT');
  expectAt(4, 'MORE');
  expectAt(5, 'zzz');
  const shields = seq.indexOf(' shields.');
  const fission = seq.indexOf(' and Nuclear Fission');
  return {
    title: seq[1]!,
    exit: seq[3]!,
    more: seq[4]!,
    technology: after('iconpg1.pal'),
    cityImprovement: after('hill.pal'),
    wonder: after('hill.pal', 2),
    unit: after('iconpga.pal'),
    terrain: after('sp256.pal'),
    concept: after('sp256.pal', 2),
    requires: after('2'),
    cost: after(' shields.', -1),
    shields: seq[shields]!,
    maintenance: seq[shields + 1]!,
    andNuclearFission: seq[fission]!,
    unitCost: seq[fission + 1]!,
    unitCostSuffix: seq[fission + 2]!,
    attack: seq[fission + 3]!,
    defense: seq[fission + 4]!,
    moves: seq[fission + 5]!,
    noTech: parseTechNameBefore(img),
  };
}

/** Raport historyka (F12_0000_09e2): historycy (DS:0x4516), oceny (DS:0x451e), rodzaje rankingu (DS:0x452c). */
export function parseHistorianTables(img: ExeImage) {
  const historians = findStringTable(img, 'Herodotus', 4);
  const grades = findStringTable(img, 'Glorious', 7);
  const types = findStringTable(img, 'WEALTHIEST', 5);
  if (grades.at !== historians.at + 8 || types.at !== grades.at + 14) throw new Error('CIV.EXE: nieoczekiwany układ tablic historyka');
  // napisy raportu leżą tuż za nazwami rodzajów: " completes his epic history:", "'The ", " Civilizations in the World'",
  // ". The ", " Civilization of the ", "."
  let at = u16(img, types.at + 8);
  const next = () => {
    const s = dsString(img, at);
    at += s.length + 1;
    return s;
  };
  next(); // "LARGEST"
  const texts = { completes: next(), the: next(), civilizations: next(), dotThe: next(), civilizationOf: next(), dot: next() };
  return { historians: historians.strings, grades: grades.strings, types: types.strings, texts };
}

/** Szerokości kawałków pałacu (DS:0x4b2c, 5 słów) i przesunięcia w pionie (DS:0x4b36, [poziom 5][styl 3][kawałek 5] bajtów ze znakiem). */
export function parsePalaceTables(img: ExeImage): { widths: number[]; pieceY: number[][][] } {
  const start = afterAnchor(img, 'Select new section.\0pal1\0');
  const widths = Array.from({ length: 5 }, (_, k) => i16(img, start + k * 2));
  const y0 = start + 10;
  const pieceY = Array.from({ length: 5 }, (_, l) =>
    Array.from({ length: 3 }, (_, s) => Array.from({ length: 5 }, (_, p) => i8(img, y0 + l * 15 + s * 5 + p))));
  return { widths, pieceY };
}

/** Przesunięcia postaci w animacjach zamieszek i święta (DS:0x4f42 x, DS:0x4f4a y — po 4 słowa) za „riot2.pic”. */
export function parseFigureOffsets(img: ExeImage): { x: number[]; y: number[] } {
  const start = afterAnchor(img, 'riot2.pic\0');
  return { x: [0, 1, 2, 3].map((k) => i16(img, start + k * 2)), y: [0, 1, 2, 3].map((k) => i16(img, start + 8 + k * 2)) };
}

/** Przesunięcia pól mapki świata w oknie miasta (DS:0x280c x, DS:0x2810 y — po 4 bajty) za „can't maintain\n”, „.\n”. */
export function parseCityMapOffsets(img: ExeImage): [number, number][] {
  const start = afterAnchor(img, "can't maintain\n\0.\n\0");
  return [0, 1, 2, 3].map((k) => [i8(img, start + k), i8(img, start + 4 + k)]);
}

export interface SpaceshipPartRecord {
  name: string;
  mass: number;
  rect: [number, number, number, number];
}

/** Części statku kosmicznego (DS:0x4bd0, 9 × 26 B: nazwa 16 B, masa, prostokąt w DOCKER.PIC x, y, szer., wys.). */
export function parseSpaceshipParts(img: ExeImage): SpaceshipPartRecord[] {
  const start = dsFind(img, 'Structure1\0');
  return Array.from({ length: 9 }, (_, k) => {
    const base = start + k * 26;
    const w = (n: number) => i16(img, base + 16 + n * 2);
    return { name: rawString(img.bytes, img.ds + base, 16), mass: w(0), rect: [w(1), w(2), w(3), w(4)] };
  });
}

// ── dalekie segmenty danych ─────────────────────────────────────────────────────────────────────

const CITY_NAME_SIZE = 13;
const CITY_NAME_COUNT = 256;
const FAMOUS_SIZE = 25;
/** Segment 0x371e (numery rysunków, plan statku, prostokąty cudów) leży 0x11a0 B za segmentem nazw miast 0x3604. */
const PICTURE_SEGMENT = 0x11a0;
/** Segment 0x3710 (dane historii świata, DS:0x6416) — 0xe0 B przed segmentem 0x371e. */
const STORY_SEGMENT = PICTURE_SEGMENT - 0xe0;

/** Początek segmentu nazw miast (0x3604:0000) w obrazie. */
function cityNameSegment(img: ExeImage): number {
  return findOne(img.bytes, encode('Rome        \0Caesarea'), 'początku tablicy nazw miast');
}

/** Nazwy miast (0x3604:0000, 256 × 13 B; w CIV.EXE dopełnione spacjami do 12 znaków — oryginał obcina je przy zakładaniu miasta). */
export function parseCityNames(img: ExeImage): { raw: string[]; names: string[] } {
  const seg = cityNameSegment(img);
  const raw = Array.from({ length: CITY_NAME_COUNT }, (_, k) => rawString(img.bytes, seg + k * CITY_NAME_SIZE, CITY_NAME_SIZE));
  return { raw, names: raw.map((n) => n.replace(/ +$/, '')) };
}

/** Postaci sławne (0x36d4:0000 = 0x3604:0d00, 20 × 25 B) w kolejności z pliku — oryginał czyta wpis 19 − indeks. */
export function parseFamousPersons(img: ExeImage): string[] {
  const seg = cityNameSegment(img) + CITY_NAME_COUNT * CITY_NAME_SIZE;
  return Array.from({ length: 20 }, (_, k) => rawString(img.bytes, seg + k * FAMOUS_SIZE, FAMOUS_SIZE));
}

/**
 * Segment 0x371e: numery rysunków Civilopedii — technologie (0x00, 72 bajty czytane przez F8_0000_16c4; za 68. bajtem
 * zaczyna się już tablica jednostek), jednostki (0x44, 28; F8_0000_1790), tereny (0x61, 12; F8_0000_17c3);
 * plan statku (0x3c0: trójki bajtów x, y, rysunek do 0xff); prostokąty cudów panoramy (0x490: 22 × 4 słowa).
 */
export function parsePictureSegment(img: ExeImage) {
  const seg = cityNameSegment(img) + PICTURE_SEGMENT;
  const b = img.bytes;
  const s8 = (at: number) => (b[seg + at]! << 24) >> 24;
  const s16 = (at: number) => ((b[seg + at]! | (b[seg + at + 1]! << 8)) << 16) >> 16;
  const techPictures = Array.from({ length: 72 }, (_, k) => s8(k));
  const unitPictures = Array.from({ length: 28 }, (_, k) => s8(0x44 + k));
  const terrainPictures = Array.from({ length: 12 }, (_, k) => s8(0x61 + k));
  const spaceshipCells: [number, number, number][] = [];
  for (let at = 0x3c0; b[seg + at] !== 0xff; at += 3) {
    if (at >= 0x490) throw new Error('CIV.EXE: brak końca planu statku (0xff)');
    spaceshipCells.push([b[seg + at]!, b[seg + at + 1]!, b[seg + at + 2]!]);
  }
  const wonderRects = Array.from({ length: 22 }, (_, k) => [0, 1, 2, 3].map((n) => s16(0x490 + k * 8 + n * 2)) as [number, number, number, number]);
  return { techPictures, unitPictures, terrainPictures, spaceshipCells, wonderRects };
}

/**
 * Historia świata (F7_0000_17cf, segment 0x3710 = DS:0x6416): cykle palety obrazów BIRTH1–8 — trójki bajtów
 * [od, do, dzielnik] zakończone zerem dla każdego obrazu (szybkość cyklu = 300 / dzielnik), a od 0x83 czasy kolejnych
 * wierszy historii w jednostkach zegara muzyki (słowa do 0xffff).
 */
export function parseStoryTables(img: ExeImage): { paletteCycles: [number, number, number][][]; eventTicks: number[] } {
  const seg = cityNameSegment(img) + STORY_SEGMENT;
  const b = img.bytes;
  const paletteCycles: [number, number, number][][] = [];
  let at = seg;
  for (let image = 0; image < 8; image++) {
    const cycles: [number, number, number][] = [];
    while (b[at] !== 0) {
      cycles.push([b[at]!, b[at + 1]!, b[at + 2]!]);
      at += 3;
    }
    at++;
    paletteCycles.push(cycles);
  }
  if (at - seg > 0x83) throw new Error('CIV.EXE: cykle palety historii świata nachodzą na tablicę czasów');
  const eventTicks: number[] = [];
  for (let p = seg + 0x83; ; p += 2) {
    const v = b[p]! | (b[p + 1]! << 8);
    if (v === 0xffff) break;
    eventTicks.push(v);
    if (eventTicks.length > 64) throw new Error('CIV.EXE: brak końca tablicy czasów historii świata');
  }
  return { paletteCycles, eventTicks };
}
