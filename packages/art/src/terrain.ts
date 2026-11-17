/**
 * Kafle terenu: widok z góry, siatka kwadratów, rysunek wektorowy generowany kodem.
 * Każda funkcja zwraca zawartość SVG w układzie 0..TILE; przycięcie do kafla robi wywołujący.
 */
import { between, f, makeRand, type Rand } from './rand';

export const TILE = 96;

export type TerrainKind =
  | 'ocean' | 'grassland' | 'plains' | 'desert' | 'forest' | 'jungle'
  | 'hills' | 'mountains' | 'tundra' | 'arctic' | 'swamp' | 'river';

export interface RiverLinks { n: boolean; e: boolean; s: boolean; w: boolean }

const base = (color: string) => `<rect width="${TILE}" height="${TILE}" fill="${color}"/>`;

function blobs(r: Rand, color: string, count: number, opacity = 0.35): string {
  let out = '';
  for (let i = 0; i < count; i++) {
    out += `<ellipse cx="${f(between(r, 6, 90))}" cy="${f(between(r, 6, 90))}" rx="${f(between(r, 12, 24))}" ry="${f(between(r, 7, 15))}" fill="${color}" opacity="${opacity}"/>`;
  }
  return out;
}

function tufts(r: Rand, color: string, count: number): string {
  let d = '';
  for (let i = 0; i < count; i++) {
    const x = between(r, 8, 88);
    const y = between(r, 12, 90);
    d += `M${f(x)} ${f(y)}l-2.5 -5M${f(x)} ${f(y)}l0 -6.5M${f(x)} ${f(y)}l2.5 -5`;
  }
  return `<path d="${d}" stroke="${color}" stroke-width="1.4" stroke-linecap="round" fill="none"/>`;
}

function grassland(r: Rand): string {
  return base('#6fae4e') + blobs(r, '#5c9a41', 3) + blobs(r, '#86c261', 3) + tufts(r, '#4a8734', 12);
}

function plains(r: Rand): string {
  let dashes = '';
  let light = '';
  for (let i = 0; i < 16; i++) {
    const x = between(r, 8, 78);
    const y = between(r, 8, 90);
    const seg = `M${f(x)} ${f(y)}h${f(between(r, 6, 11))}`;
    if (i % 4 === 0) light += seg;
    else dashes += seg;
  }
  return (
    base('#c6bd62') + blobs(r, '#b2a74c', 3) + blobs(r, '#d8d07e', 2) +
    `<path d="${dashes}" stroke="#9a8d36" stroke-width="1.6" stroke-linecap="round"/>` +
    `<path d="${light}" stroke="#ece6a6" stroke-width="1.6" stroke-linecap="round"/>` +
    tufts(r, '#8f8a3a', 4)
  );
}

function desert(r: Rand): string {
  let shade = '';
  let lightEdge = '';
  let dots = '';
  for (let i = 0; i < 7; i++) {
    const x = between(r, 6, 66);
    const y = between(r, 14, 88);
    const w = between(r, 18, 26);
    shade += `M${f(x)} ${f(y)}q${f(w / 2)} -9 ${f(w)} 0`;
    lightEdge += `M${f(x)} ${f(y + 2.2)}q${f(w / 2)} -9 ${f(w)} 0`;
  }
  for (let i = 0; i < 16; i++) {
    dots += `<circle cx="${f(between(r, 6, 90))}" cy="${f(between(r, 6, 90))}" r="0.9" fill="#b88c42"/>`;
  }
  return (
    base('#e7c880') + blobs(r, '#d7b262', 3) + blobs(r, '#f3dca0', 2) +
    `<path d="${lightEdge}" stroke="#f6e3ae" stroke-width="2" stroke-linecap="round" fill="none"/>` +
    `<path d="${shade}" stroke="#c49a4e" stroke-width="2" stroke-linecap="round" fill="none"/>` + dots
  );
}

export const OCEAN_COLOR = '#2f6fb5';

/** Sam rysunek fal i przebarwień, bez tła — do układania na jednolitej tafli wody bez szwów między kaflami. */
export function oceanDetail(seed: number): string {
  return ocean(makeRand(seed), false);
}

function ocean(r: Rand, withBase = true): string {
  let waves = '';
  for (let i = 0; i < 7; i++) {
    const x = between(r, 6, 68);
    const y = between(r, 10, 88);
    waves += `M${f(x)} ${f(y)}q5 -4 10 0q5 4 10 0`;
  }
  return (
    (withBase ? base(OCEAN_COLOR) : '') + blobs(r, '#285f9e', 3) + blobs(r, '#3b7ec6', 2) +
    `<path d="${waves}" stroke="#8fbfec" stroke-width="1.6" stroke-linecap="round" fill="none" opacity="0.75"/>`
  );
}

function tree(x: number, y: number, radius: number, r: Rand): string {
  const lobes = [
    [0, 0, 1], [-0.55, 0.25, 0.7], [0.55, 0.2, 0.72], [0.05, -0.5, 0.68],
  ] as const;
  let crown = '';
  for (const [dx, dy, k] of lobes) {
    crown += `<circle cx="${f(x + dx * radius)}" cy="${f(y + dy * radius)}" r="${f(radius * k * between(r, 0.92, 1.06))}"/>`;
  }
  return (
    `<ellipse cx="${f(x + 2.5)}" cy="${f(y + 3.5)}" rx="${f(radius * 1.15)}" ry="${f(radius)}" fill="#1c4420" opacity="0.45"/>` +
    `<g fill="#2f7a35" stroke="#1f5a28" stroke-width="0.8">${crown}</g>` +
    `<circle cx="${f(x - radius * 0.3)}" cy="${f(y - radius * 0.35)}" r="${f(radius * 0.42)}" fill="#58a850" opacity="0.8"/>`
  );
}

function forest(r: Rand): string {
  const trees: { x: number; y: number; radius: number }[] = [];
  for (let gy = 0; gy < 3; gy++) {
    for (let gx = 0; gx < 3; gx++) {
      trees.push({ x: 18 + gx * 30 + between(r, -5, 5), y: 19 + gy * 29 + between(r, -5, 5), radius: between(r, 9.5, 12.5) });
    }
  }
  trees.sort((a, b) => a.y - b.y);
  return base('#5f9c45') + blobs(r, '#4d8a3a', 3) + trees.map((t) => tree(t.x, t.y, t.radius, r)).join('');
}

function jungle(r: Rand): string {
  const items: { x: number; y: number; radius: number; palm: boolean }[] = [];
  for (let gy = 0; gy < 4; gy++) {
    for (let gx = 0; gx < 4; gx++) {
      items.push({ x: 14 + gx * 23 + between(r, -4, 4), y: 14 + gy * 23 + between(r, -4, 4), radius: between(r, 7.5, 9.5), palm: (gx + gy) % 2 === 0 });
    }
  }
  items.sort((a, b) => a.y - b.y);
  let out = base('#3c8f4a') + blobs(r, '#2c7a3d', 4, 0.45);
  for (const it of items) {
    if (it.palm) {
      let leaves = '';
      const turn = between(r, 0, 30);
      for (let k = 0; k < 6; k++) {
        leaves += `<ellipse cx="${f(it.x)}" cy="${f(it.y)}" rx="${f(it.radius * 1.2)}" ry="${f(it.radius * 0.34)}" transform="rotate(${f(turn + k * 30)} ${f(it.x)} ${f(it.y)})"/>`;
      }
      out += `<g fill="#3fb86f" stroke="#1c7a44" stroke-width="0.6">${leaves}</g><circle cx="${f(it.x)}" cy="${f(it.y)}" r="1.8" fill="#175c33"/>`;
    } else {
      out +=
        `<ellipse cx="${f(it.x + 2)}" cy="${f(it.y + 3)}" rx="${f(it.radius * 1.1)}" ry="${f(it.radius)}" fill="#123d22" opacity="0.5"/>` +
        `<circle cx="${f(it.x)}" cy="${f(it.y)}" r="${f(it.radius)}" fill="#1f6e3b" stroke="#145029" stroke-width="0.8"/>` +
        `<circle cx="${f(it.x - 2.5)}" cy="${f(it.y - 3)}" r="${f(it.radius * 0.4)}" fill="#3f9a57" opacity="0.8"/>`;
    }
  }
  return out;
}

function hills(r: Rand): string {
  const mounds = [
    { x: 29, y: 46, rx: 21, ry: 20 },
    { x: 67, y: 42, rx: 19, ry: 18 },
    { x: 48, y: 80, rx: 26, ry: 24 },
  ];
  let out = base('#8fb057') + blobs(r, '#7c9c49', 3) + tufts(r, '#5f8038', 5);
  for (const m of mounds) {
    const top = m.y - m.ry;
    out +=
      `<ellipse cx="${m.x}" cy="${m.y + 1}" rx="${m.rx + 3}" ry="5" fill="#5c7a36" opacity="0.5"/>` +
      `<path d="M${m.x - m.rx} ${m.y}A${m.rx} ${m.ry} 0 0 1 ${m.x + m.rx} ${m.y}Z" fill="#b4c96c"/>` +
      `<path d="M${m.x + 3} ${top + 0.4}A${m.rx} ${m.ry} 0 0 1 ${m.x + m.rx} ${m.y}L${m.x + 6} ${m.y}Q${m.x + 10} ${m.y - m.ry * 0.5} ${m.x + 3} ${top + 0.4}Z" fill="#86a04d"/>` +
      `<path d="M${m.x - m.rx} ${m.y}A${m.rx} ${m.ry} 0 0 1 ${m.x + m.rx} ${m.y}" fill="none" stroke="#56712f" stroke-width="1.4" stroke-linecap="round"/>` +
      `<path d="M${m.x - m.rx * 0.5} ${m.y - m.ry * 0.45}q4 -5 9 -6" fill="none" stroke="#d6e49a" stroke-width="1.6" stroke-linecap="round" opacity="0.8"/>`;
  }
  return out;
}

function mountains(r: Rand): string {
  const peaks = [
    { x: 30, y: 60, w: 44, h: 42 },
    { x: 63, y: 54, w: 40, h: 40 },
    { x: 49, y: 88, w: 50, h: 42 },
  ];
  let out = base('#93a079') + blobs(r, '#7f8c68', 4, 0.4);
  for (const p of peaks) {
    const ax = p.x;
    const ay = p.y - p.h;
    const lx = p.x - p.w / 2;
    const rx = p.x + p.w / 2;
    const footX = p.x + 5;
    const mix = (x1: number, y1: number, x2: number, y2: number, t: number) => `${f(x1 + (x2 - x1) * t)} ${f(y1 + (y2 - y1) * t)}`;
    out +=
      `<ellipse cx="${p.x}" cy="${p.y}" rx="${p.w / 2 + 2}" ry="4" fill="#4f5a40" opacity="0.5"/>` +
      `<path d="M${ax} ${ay}L${lx} ${p.y}L${footX} ${p.y}Z" fill="#cfcdc6"/>` +
      `<path d="M${ax} ${ay}L${footX} ${p.y}L${rx} ${p.y}Z" fill="#84838b"/>` +
      `<path d="M${ax} ${ay}L${mix(ax, ay, lx, p.y, 0.34)}L${mix(ax, ay, lx + 8, p.y, 0.25)}L${mix(ax, ay, footX - 4, p.y, 0.36)}L${mix(ax, ay, footX, p.y, 0.24)}L${mix(ax, ay, footX + 6, p.y, 0.36)}L${mix(ax, ay, rx - 6, p.y, 0.26)}L${mix(ax, ay, rx, p.y, 0.34)}Z" fill="#ffffff"/>` +
      `<path d="M${lx} ${p.y}L${ax} ${ay}L${rx} ${p.y}" fill="none" stroke="#55545c" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round"/>`;
  }
  return out;
}

function tundra(r: Rand): string {
  let snow = '';
  let shrubs = '';
  for (let i = 0; i < 5; i++) {
    snow += `<ellipse cx="${f(between(r, 12, 84))}" cy="${f(between(r, 12, 84))}" rx="${f(between(r, 9, 16))}" ry="${f(between(r, 5, 9))}" fill="#f4f8f6" opacity="0.8"/>`;
  }
  for (let i = 0; i < 11; i++) {
    const x = between(r, 8, 88);
    const y = between(r, 8, 88);
    shrubs += `<circle cx="${f(x)}" cy="${f(y)}" r="2.2" fill="#6c8056"/><circle cx="${f(x + 2.6)}" cy="${f(y + 1)}" r="1.7" fill="#7f9366"/>`;
  }
  return base('#b9c4a2') + blobs(r, '#a6b38e', 3) + snow + shrubs;
}

function arctic(r: Rand): string {
  let cracks = '';
  for (let i = 0; i < 5; i++) {
    let x = between(r, 8, 60);
    let y = between(r, 10, 86);
    cracks += `M${f(x)} ${f(y)}`;
    for (let k = 0; k < 3; k++) {
      x += between(r, 7, 13);
      y += between(r, -7, 7);
      cracks += `L${f(x)} ${f(y)}`;
    }
  }
  return (
    base('#eef5f9') + blobs(r, '#d0e2ed', 4, 0.6) + blobs(r, '#ffffff', 3, 0.9) +
    `<path d="${cracks}" stroke="#9fc1d6" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round" fill="none"/>`
  );
}

function swamp(r: Rand): string {
  let pools = '';
  let reeds = '';
  for (let i = 0; i < 4; i++) {
    pools += `<ellipse cx="${f(between(r, 16, 80))}" cy="${f(between(r, 16, 80))}" rx="${f(between(r, 9, 16))}" ry="${f(between(r, 5, 9))}" fill="#3d7d8c" stroke="#86b8ad" stroke-width="1.4"/>`;
  }
  for (let i = 0; i < 9; i++) {
    const x = between(r, 8, 86);
    const y = between(r, 16, 90);
    for (const dx of [-2.6, 0, 2.6]) {
      const h = between(r, 7, 10);
      reeds += `<path d="M${f(x + dx)} ${f(y)}v${f(-h)}" stroke="#274f2e" stroke-width="1.4" stroke-linecap="round"/><ellipse cx="${f(x + dx)}" cy="${f(y - h - 1.4)}" rx="1.1" ry="2.2" fill="#7a5230"/>`;
    }
  }
  return base('#5c8c62') + blobs(r, '#4a7852', 4, 0.5) + pools + reeds;
}

/** Rzeka na trawie; łączy środek kafla z krawędziami wskazanymi w `links`. */
function river(r: Rand, links: RiverLinks): string {
  const c = TILE / 2;
  const ends: [number, number][] = [];
  if (links.n) ends.push([c, 0]);
  if (links.e) ends.push([TILE, c]);
  if (links.s) ends.push([c, TILE]);
  if (links.w) ends.push([0, c]);
  const cx = c + between(r, -5, 5);
  const cy = c + between(r, -5, 5);
  let d = '';
  for (const [x, y] of ends) {
    const bend = between(r, -9, 9);
    const mx = (x + cx) / 2 + (y === c ? 0 : bend);
    const my = (y + cy) / 2 + (y === c ? bend : 0);
    d += `M${f(x)} ${f(y)}Q${f(mx)} ${f(my)} ${f(cx)} ${f(cy)}`;
  }
  const spring = ends.length === 1 ? `<circle cx="${f(cx)}" cy="${f(cy)}" r="7" fill="#3d80c6" stroke="#4a8236" stroke-width="2.5"/>` : '';
  return (
    grassland(r) +
    `<path d="${d}" stroke="#4a8236" stroke-width="19" stroke-linecap="round" fill="none"/>` +
    `<path d="${d}" stroke="#3d80c6" stroke-width="14" stroke-linecap="round" fill="none"/>` +
    spring +
    `<path d="${d}" stroke="#86b9ea" stroke-width="4" stroke-linecap="round" fill="none" opacity="0.8"/>`
  );
}

export function terrainTile(kind: TerrainKind, seed: number, links: RiverLinks = { n: false, e: true, s: false, w: true }): string {
  const r = makeRand(seed);
  switch (kind) {
    case 'ocean': return ocean(r);
    case 'grassland': return grassland(r);
    case 'plains': return plains(r);
    case 'desert': return desert(r);
    case 'forest': return forest(r);
    case 'jungle': return jungle(r);
    case 'hills': return hills(r);
    case 'mountains': return mountains(r);
    case 'tundra': return tundra(r);
    case 'arctic': return arctic(r);
    case 'swamp': return swamp(r);
    case 'river': return river(r, links);
  }
}
