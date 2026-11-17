/**
 * Arkusz poglądowy grafik: kafle terenu, żetony, miasto i przykładowy fragment mapy.
 * Użycie: npm run art:preview  ->  docs/samples/*.svg
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CIV_BLUE, CIV_RED, cityTile, unitToken, type CivColor, type UnitKind } from './tokens';
import { OCEAN_COLOR, TILE, oceanDetail, terrainTile, type RiverLinks, type TerrainKind } from './terrain';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/samples');
mkdirSync(outDir, { recursive: true });

const FONT = 'font-family="Helvetica, Arial, sans-serif"';
const svgFile = (inner: string, w = TILE, h = TILE) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * 2}" height="${h * 2}">${inner}</svg>\n`;
const boxed = (inner: string, x: number, y: number, size: number) =>
  `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 ${TILE} ${TILE}">${inner}</svg>`;

// ---------- pojedyncze grafiki ----------
const terrainList: [TerrainKind, string][] = [
  ['ocean', 'Ocean'], ['grassland', 'Grassland'], ['plains', 'Plains'], ['desert', 'Desert'],
  ['forest', 'Forest'], ['jungle', 'Jungle'], ['hills', 'Hills'], ['mountains', 'Mountains'],
  ['tundra', 'Tundra'], ['arctic', 'Arctic'], ['swamp', 'Swamp'], ['river', 'River'],
];
const tokenList: [string, string, string][] = [
  ['unit-settlers', 'Settlers', unitToken('settlers', CIV_BLUE)],
  ['unit-phalanx', 'Phalanx', unitToken('phalanx', CIV_BLUE)],
  ['unit-legion', 'Legion', unitToken('legion', CIV_BLUE)],
  ['unit-trireme', 'Trireme', unitToken('trireme', CIV_BLUE)],
  ['city', 'City (size 5)', terrainTile('grassland', 7) + cityTile(CIV_BLUE, 5, 3)],
  ['unit-phalanx-red', 'Phalanx (rival)', unitToken('phalanx', CIV_RED)],
];
terrainList.forEach(([kind], i) => writeFileSync(join(outDir, `terrain-${kind}.svg`), svgFile(terrainTile(kind, 100 + i))));
tokenList.forEach(([file, , inner]) => writeFileSync(join(outDir, `${file}.svg`), svgFile(inner)));

// ---------- fragment mapy ----------
const MAP = [
  '~~~~~~~~~~~~',
  '~~ggrff~~~~~',
  '~gpgrhmm~~t~',
  '~gpgrfhm~~a~',
  '~~ggrrdd~~~~',
  '~~jsgpdd~g~~',
  '~~~jj~~~~~~~',
  '~~~~~~~~~~~~',
];
const KIND: Record<string, TerrainKind> = {
  '~': 'ocean', g: 'grassland', p: 'plains', d: 'desert', f: 'forest', j: 'jungle',
  h: 'hills', m: 'mountains', t: 'tundra', a: 'arctic', s: 'swamp', r: 'river',
};
const COLS = MAP[0]!.length;
const ROWS = MAP.length;
const at = (x: number, y: number) => (y < 0 || y >= ROWS || x < 0 || x >= COLS ? '~' : MAP[y]![x]!);
const isWater = (x: number, y: number) => at(x, y) === '~';

/** Prostokąt z zaokrągleniem wybranych rogów (kolejność: NW, NE, SE, SW), powiększony o `grow`. */
function roundedPath(x: number, y: number, radii: [number, number, number, number], grow = 0): string {
  const x0 = x - grow, y0 = y - grow, x1 = x + TILE + grow, y1 = y + TILE + grow;
  const [nw, ne, se, sw] = radii.map((r) => (r > 0 ? r + grow : 0)) as [number, number, number, number];
  return (
    `M${x0 + nw} ${y0}H${x1 - ne}` + (ne ? `A${ne} ${ne} 0 0 1 ${x1} ${y0 + ne}` : '') +
    `V${y1 - se}` + (se ? `A${se} ${se} 0 0 1 ${x1 - se} ${y1}` : '') +
    `H${x0 + sw}` + (sw ? `A${sw} ${sw} 0 0 1 ${x0} ${y1 - sw}` : '') +
    `V${y0 + nw}` + (nw ? `A${nw} ${nw} 0 0 1 ${x0 + nw} ${y0}` : '') + 'Z'
  );
}

function scene(): string {
  const R = 24;
  let water = '', shallows = '', beach = '', land = '', defs = '';
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const px = x * TILE, py = y * TILE, seed = 1000 + y * 31 + x * 7;
      if (isWater(x, y)) {
        water += `<g transform="translate(${px} ${py})">${oceanDetail(seed)}</g>`;
        continue;
      }
      const n = isWater(x, y - 1), e = isWater(x + 1, y), s = isWater(x, y + 1), w = isWater(x - 1, y);
      const radii: [number, number, number, number] = [n && w ? R : 0, n && e ? R : 0, s && e ? R : 0, s && w ? R : 0];
      shallows += `<path d="${roundedPath(px, py, radii, 9)}"/>`;
      beach += `<path d="${roundedPath(px, py, radii, 3.5)}"/>`;
      const kind = KIND[at(x, y)]!;
      const linked = (dx: number, dy: number) => at(x + dx, y + dy) === 'r' || isWater(x + dx, y + dy);
      const links: RiverLinks = { n: linked(0, -1), e: linked(1, 0), s: linked(0, 1), w: linked(-1, 0) };
      const id = `clip-${x}-${y}`;
      defs += `<clipPath id="${id}"><path d="${roundedPath(0, 0, radii)}"/></clipPath>`;
      land += `<g transform="translate(${px} ${py})" clip-path="url(#${id})">${terrainTile(kind, seed, links)}</g>`;
    }
  }
  const place = (inner: string, x: number, y: number, scale = 0.8) => {
    const size = TILE * scale, pad = (TILE - size) / 2;
    return boxed(inner, x * TILE + pad, y * TILE + pad, size);
  };
  const unit = (kind: UnitKind, color: CivColor, x: number, y: number) => place(unitToken(kind, color), x, y);
  const label = (text: string, x: number, y: number) =>
    `<text x="${x * TILE + TILE / 2}" y="${(y + 1) * TILE + 17}" text-anchor="middle" ${FONT} font-weight="700" font-size="17" fill="#fff" stroke="#1d2433" stroke-width="4" paint-order="stroke" stroke-linejoin="round">${text}</text>`;
  return (
    `<defs>${defs}</defs><rect width="${COLS * TILE}" height="${ROWS * TILE}" fill="${OCEAN_COLOR}"/>` + water +
    `<g fill="#63a3de" opacity="0.6">${shallows}</g><g fill="#ecdca6">${beach}</g>` + land +
    place(cityTile(CIV_BLUE, 5, 3), 3, 3, 1) + label('Aurelia', 3, 3) +
    unit('legion', CIV_BLUE, 2, 3) + unit('settlers', CIV_BLUE, 4, 5) +
    unit('trireme', CIV_BLUE, 1, 5) + unit('phalanx', CIV_RED, 9, 5)
  );
}
const sceneInner = scene();
writeFileSync(join(outDir, 'map-sample.svg'), svgFile(sceneInner, COLS * TILE, ROWS * TILE));

// ---------- arkusz ----------
const W = 840, CELL = 120, GAP = 16, LEFT = 20;
let sheet = '';
let y = 34;
const heading = (text: string) => {
  sheet += `<text x="${LEFT}" y="${y}" ${FONT} font-weight="700" font-size="20" fill="#e8ecf4">${text}</text>`;
  y += 16;
};
const row = (items: [string, string][]) => {
  items.forEach(([name, inner], i) => {
    const x = LEFT + i * (CELL + GAP);
    sheet += boxed(inner, x, y, CELL) + `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" fill="none" stroke="#0b0f18" stroke-width="1"/>` +
      `<text x="${x + CELL / 2}" y="${y + CELL + 20}" text-anchor="middle" ${FONT} font-size="14" fill="#c3cad8">${name}</text>`;
  });
  y += CELL + 38;
};
const terrainCells = terrainList.map(([kind, name], i) => [name, terrainTile(kind, 100 + i)] as [string, string]);
heading('Terrain');
row(terrainCells.slice(0, 6));
row(terrainCells.slice(6));
y += 20;
heading('Units and city');
row(tokenList.map(([, name, inner]) => [name, inner] as [string, string]));
y += 20;
heading('Map sample');
const mapW = W - 2 * LEFT, mapH = (mapW * ROWS) / COLS;
sheet += `<svg x="${LEFT}" y="${y}" width="${mapW}" height="${mapH}" viewBox="0 0 ${COLS * TILE} ${ROWS * TILE}">${sceneInner}</svg>`;
y += mapH + 24;
writeFileSync(
  join(outDir, 'sheet.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${y}" width="${W}" height="${y}"><rect width="${W}" height="${y}" fill="#161b26"/>${sheet}</svg>\n`,
);
console.log(`sheet ${W}x${Math.ceil(y)}`);
