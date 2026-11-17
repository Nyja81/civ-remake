/**
 * Etap 1: przewijana mapa świata rysowana oryginalnymi grafikami z kopii gry gracza, wygładzonymi 4×.
 * Sterowanie: przeciąganie myszą lub strzałki — przewijanie; kółko lub +/- — powiększenie; N — nowy świat; E — Ziemia.
 */
import {
  DEFAULT_WORLD, generateWorld, hasSpecialResource, hasTribalHut, MAP_HEIGHT, MAP_WIDTH, mscRandom,
  Terrain, TERRAIN, worldFromMapPixels, type World,
} from '@civ-remake/engine';
import { CELL, decodePic, renderTerrain, toRgba, type Sheets } from '@civ-remake/gfx';
import { xbr4x } from 'xbr-js/dist/xBRjs.esm.js';
import type { CivApi, LoadResult } from '../api';

declare global {
  interface Window { civ: CivApi }
}

const SCALE = 4; // krotność wygładzania
const TILE = CELL * SCALE; // rozmiar pola w wygładzonym obrazie
const WORLD_W = MAP_WIDTH * TILE;
const WORLD_H = MAP_HEIGHT * TILE;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('map');
const ctx = canvas.getContext('2d')!;
const overlay = $('overlay');

let sheets: Sheets | null = null;
let earthPixels: { pixels: Uint8Array; width: number } | null = null;
let world: World | null = null;
let seed = 0;
let label = '';
let mapImage: HTMLCanvasElement | null = null;
const view = { x: 0, y: 0, zoom: 0.5 }; // x, y: lewy górny róg widoku we współrzędnych wygładzonej mapy

function showOverlay(title: string, text = '', withButton = false): void {
  $('overlayTitle').textContent = title;
  $('overlayText').textContent = text;
  $<HTMLButtonElement>('overlayButton').hidden = !withButton;
  overlay.classList.remove('hidden');
}

/** Rysuje teren w rozdzielczości oryginału, wygładza go 4× i lekko zmiękcza. */
function buildMapImage(): void {
  if (!sheets || !world) return;
  const indexed = renderTerrain(world, sheets, { seed });
  const rgba = toRgba(indexed, sheets.sp.palette!);
  const smooth = xbr4x(new Uint32Array(rgba.buffer), indexed.width, indexed.height, { blendColors: true, scaleAlpha: false });
  const sharp = document.createElement('canvas');
  sharp.width = WORLD_W;
  sharp.height = WORLD_H;
  const pixels = new Uint8ClampedArray(smooth.length * 4);
  pixels.set(new Uint8Array(smooth.buffer, smooth.byteOffset, smooth.byteLength));
  sharp.getContext('2d')!.putImageData(new ImageData(pixels, WORLD_W, WORLD_H), 0, 0);
  const soft = document.createElement('canvas');
  soft.width = WORLD_W;
  soft.height = WORLD_H;
  const softCtx = soft.getContext('2d')!;
  softCtx.filter = 'blur(0.6px)';
  softCtx.drawImage(sharp, 0, 0);
  mapImage = soft;
}

function clampView(): void {
  const viewH = canvas.clientHeight / view.zoom;
  view.x = ((view.x % WORLD_W) + WORLD_W) % WORLD_W; // świat zawija się w poziomie
  view.y = viewH >= WORLD_H ? (WORLD_H - viewH) / 2 : Math.min(Math.max(view.y, 0), WORLD_H - viewH);
}

function draw(): void {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(canvas.clientWidth * dpr);
  const h = Math.round(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#10141c';
  ctx.fillRect(0, 0, w, h);
  if (!mapImage) return;
  clampView();
  const k = view.zoom * dpr;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  for (let offset = -view.x; offset * k < w; offset += WORLD_W) {
    ctx.drawImage(mapImage, offset * k, -view.y * k, WORLD_W * k, WORLD_H * k);
  }
  $('zoom').textContent = `Zoom ${Math.round(view.zoom * 100)}%`;
}

function showWorld(next: World, nextSeed: number, nextLabel: string): void {
  world = next;
  seed = nextSeed;
  label = nextLabel;
  buildMapImage();
  $('info').textContent = label;
  overlay.classList.add('hidden');
  draw();
}

function newWorld(): void {
  if (!sheets) return;
  const s = Math.floor(Math.random() * 32768);
  showWorld(generateWorld(mscRandom(s), DEFAULT_WORLD), s, `Random world · seed ${s}`);
}

function earth(): void {
  if (!sheets || !earthPixels) return;
  showWorld(worldFromMapPixels(earthPixels.pixels, earthPixels.width), 0, 'Earth');
}

function applyLoad(result: LoadResult): void {
  if (!result.ok) {
    sheets = null;
    $<HTMLButtonElement>('newWorld').disabled = true;
    $<HTMLButtonElement>('earth').disabled = true;
    if (result.reason === 'no-folder') {
      showOverlay('Choose your game folder', 'This game draws the map with the graphics from your own copy of the original 1991 game. Select the folder that contains its files (for example TER257.PIC and SP257.PIC).', true);
    } else {
      showOverlay('Files not found', `The selected folder is missing: ${result.missing.join(', ')}.`, true);
    }
    return;
  }
  try {
    const pic = (name: string) => decodePic(result.files[name]!);
    sheets = { ter: pic('TER257.PIC'), sp: pic('SP257.PIC'), sp299: pic('SP299.PIC') };
    const map = pic('MAP.PIC');
    earthPixels = { pixels: map.pixels, width: map.width };
  } catch (error) {
    showOverlay('Could not read the game files', String(error), true);
    return;
  }
  $<HTMLButtonElement>('newWorld').disabled = false;
  $<HTMLButtonElement>('earth').disabled = false;
  view.x = 0;
  view.y = 0;
  earth();
}

function tileAt(clientX: number, clientY: number): { x: number; y: number } | null {
  const rect = canvas.getBoundingClientRect();
  const wx = view.x + (clientX - rect.left) / view.zoom;
  const wy = view.y + (clientY - rect.top) / view.zoom;
  if (wy < 0 || wy >= WORLD_H) return null;
  return { x: Math.floor((((wx % WORLD_W) + WORLD_W) % WORLD_W) / TILE), y: Math.floor(wy / TILE) };
}

function describe(x: number, y: number): string {
  if (!world) return '';
  const t = world.terrain[y * MAP_WIDTH + x]!;
  const parts = [`(${x}, ${y})`, TERRAIN[t]!.name];
  if (hasSpecialResource(x, y, seed)) {
    const special = TERRAIN[t + 12]!.name;
    if (special !== TERRAIN[t]!.name) parts.push(special);
    else if (t === Terrain.Grassland || t === Terrain.River) parts.push('resources');
  }
  if (hasTribalHut(x, y, t, seed)) parts.push('tribal hut');
  return parts.join(' · ');
}

function zoomAt(factor: number, clientX: number, clientY: number): void {
  const rect = canvas.getBoundingClientRect();
  const px = clientX - rect.left;
  const py = clientY - rect.top;
  const before = { x: view.x + px / view.zoom, y: view.y + py / view.zoom };
  view.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom * factor));
  view.x = before.x - px / view.zoom;
  view.y = before.y - py / view.zoom;
  draw();
}

// ----- sterowanie -----
let drag: { x: number; y: number } | null = null;
canvas.addEventListener('mousedown', (e) => {
  drag = { x: e.clientX, y: e.clientY };
  canvas.classList.add('dragging');
});
window.addEventListener('mouseup', () => {
  drag = null;
  canvas.classList.remove('dragging');
});
window.addEventListener('mousemove', (e) => {
  if (drag) {
    view.x -= (e.clientX - drag.x) / view.zoom;
    view.y -= (e.clientY - drag.y) / view.zoom;
    drag = { x: e.clientX, y: e.clientY };
    draw();
  }
  const tile = tileAt(e.clientX, e.clientY);
  if (tile && world && e.target === canvas) $('status').textContent = describe(tile.x, tile.y);
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX, e.clientY);
}, { passive: false });
window.addEventListener('keydown', (e) => {
  const step = TILE;
  const center = canvas.getBoundingClientRect();
  const cx = center.left + center.width / 2;
  const cy = center.top + center.height / 2;
  switch (e.key) {
    case 'ArrowLeft': view.x -= step; break;
    case 'ArrowRight': view.x += step; break;
    case 'ArrowUp': view.y -= step; break;
    case 'ArrowDown': view.y += step; break;
    case '+': case '=': zoomAt(1.25, cx, cy); return;
    case '-': zoomAt(0.8, cx, cy); return;
    case 'n': case 'N': newWorld(); return;
    case 'e': case 'E': earth(); return;
    default: return;
  }
  e.preventDefault();
  draw();
});
window.addEventListener('resize', draw);
$('newWorld').addEventListener('click', newWorld);
$('earth').addEventListener('click', earth);
const choose = () => void window.civ.choose().then(applyLoad);
$('folder').addEventListener('click', choose);
$('overlayButton').addEventListener('click', choose);

showOverlay('Loading…');
void window.civ.load().then(applyLoad);
