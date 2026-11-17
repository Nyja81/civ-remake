/** Żetony jednostek i kafel miasta — własny rysunek, układ 0..96. */
import { between, f, makeRand } from './rand';

export interface CivColor { fill: string; dark: string; light: string }

export const CIV_BLUE: CivColor = { fill: '#2f5fd0', dark: '#1b3c94', light: '#6f94ee' };
export const CIV_RED: CivColor = { fill: '#c8402f', dark: '#8a271b', light: '#ea7a69' };

export type UnitKind = 'settlers' | 'phalanx' | 'legion' | 'trireme';

const INK = '#1d2433';
const icon: Record<UnitKind, string> = {
  settlers:
    `<path d="M24 58V46Q48 20 72 46V58Z" fill="#fff" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>` +
    `<path d="M40 31V58M56 31V58" stroke="${INK}" stroke-width="1.4" opacity="0.5"/>` +
    `<rect x="20" y="58" width="56" height="8" rx="2" fill="#e9d3a4" stroke="${INK}" stroke-width="2"/>` +
    `<g fill="#fff" stroke="${INK}" stroke-width="2"><circle cx="33" cy="70" r="8.5"/><circle cx="63" cy="70" r="8.5"/></g>` +
    `<g fill="${INK}"><circle cx="33" cy="70" r="2.2"/><circle cx="63" cy="70" r="2.2"/></g>`,
  phalanx:
    `<path d="M68 80V26" stroke="#e9d3a4" stroke-width="4.5" stroke-linecap="round"/><path d="M68 80V26" stroke="${INK}" stroke-width="1" opacity="0.4"/>` +
    `<path d="M61 28L68 10L75 28Z" fill="#fff" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>` +
    `<circle cx="42" cy="52" r="21" fill="#fff" stroke="${INK}" stroke-width="2"/>` +
    `<circle cx="42" cy="52" r="14" fill="none" stroke="${INK}" stroke-width="1.6" opacity="0.55"/>` +
    `<circle cx="42" cy="52" r="5" fill="#e9d3a4" stroke="${INK}" stroke-width="1.6"/>`,
  legion:
    `<rect x="22" y="26" width="30" height="46" rx="6" fill="#fff" stroke="${INK}" stroke-width="2"/>` +
    `<path d="M37 28V70M24 49H50" stroke="${INK}" stroke-width="1.4" opacity="0.5"/>` +
    `<circle cx="37" cy="49" r="5.5" fill="#e9d3a4" stroke="${INK}" stroke-width="1.6"/>` +
    `<path d="M66 14L72 24V56H60V24Z" fill="#fff" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>` +
    `<rect x="55" y="56" width="22" height="5.5" rx="2" fill="#e9d3a4" stroke="${INK}" stroke-width="1.8"/>` +
    `<rect x="63" y="61.5" width="6" height="11" fill="#fff" stroke="${INK}" stroke-width="1.8"/>` +
    `<circle cx="66" cy="76" r="4" fill="#e9d3a4" stroke="${INK}" stroke-width="1.8"/>`,
  trireme:
    `<path d="M28 64L22 80M39 66L35 82M50 67V83M61 66L65 82M72 64L78 80" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>` +
    `<path d="M47 56V18" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>` +
    `<path d="M28 22H66Q61 34 66 46H28Q33 34 28 22Z" fill="#fff" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>` +
    `<path d="M36 34H58" stroke="${INK}" stroke-width="1.4" opacity="0.45"/>` +
    `<path d="M12 50Q16 56 22 56H82L86 48Q80 68 62 68H34Q18 68 12 50Z" fill="#e9d3a4" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`,
};

export function unitToken(kind: UnitKind, color: CivColor): string {
  return (
    `<rect x="9" y="11" width="80" height="80" rx="15" fill="#000" opacity="0.28"/>` +
    `<rect x="7" y="7" width="82" height="82" rx="15" fill="${color.fill}" stroke="${color.dark}" stroke-width="3"/>` +
    `<path d="M22 10.5H74Q85.5 10.5 85.5 22" fill="none" stroke="${color.light}" stroke-width="2" stroke-linecap="round" opacity="0.8"/>` +
    icon[kind]
  );
}

/** Miasto widziane z góry: mur, dachy w kolorze cywilizacji, rozmiar na placu. */
export function cityTile(color: CivColor, size: number, seed: number): string {
  const r = makeRand(seed);
  let roofs = '';
  const slots = [
    [18, 18], [41, 16], [62, 18], [17, 40], [63, 41], [18, 62], [41, 65], [62, 62],
  ] as const;
  for (const [sx, sy] of slots) {
    const w = between(r, 14, 18);
    const h = between(r, 12, 16);
    const x = sx + between(r, -1.5, 1.5);
    const y = sy + between(r, -1.5, 1.5);
    const wide = w >= h;
    roofs +=
      `<rect x="${f(x + 1.5)}" y="${f(y + 2)}" width="${f(w)}" height="${f(h)}" rx="1.5" fill="#000" opacity="0.25"/>` +
      `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="1.5" fill="${color.fill}" stroke="${color.dark}" stroke-width="1.4"/>` +
      (wide
        ? `<path d="M${f(x)} ${f(y)}h${f(w)}v${f(h / 2)}h${f(-w)}Z" fill="${color.light}" opacity="0.55"/><path d="M${f(x + 1)} ${f(y + h / 2)}h${f(w - 2)}" stroke="${color.dark}" stroke-width="1"/>`
        : `<path d="M${f(x)} ${f(y)}h${f(w / 2)}v${f(h)}h${f(-w / 2)}Z" fill="${color.light}" opacity="0.55"/><path d="M${f(x + w / 2)} ${f(y + 1)}v${f(h - 2)}" stroke="${color.dark}" stroke-width="1"/>`);
  }
  let towers = '';
  for (const [tx, ty] of [[10, 10], [86, 10], [10, 86], [86, 86]] as const) {
    towers += `<circle cx="${tx}" cy="${ty}" r="6" fill="#cdbf9f" stroke="#6a5a45" stroke-width="2"/>`;
  }
  return (
    `<rect x="10" y="10" width="76" height="76" rx="6" fill="#dcd2ba" stroke="#6a5a45" stroke-width="4"/>` +
    `<path d="M48 10V86M10 48H86" stroke="#c4b796" stroke-width="5"/>` +
    roofs + towers +
    `<circle cx="48" cy="48" r="13" fill="#f4ecd8" stroke="#6a5a45" stroke-width="2"/>` +
    `<text x="48" y="54.5" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="18" fill="${color.dark}">${size}</text>`
  );
}
