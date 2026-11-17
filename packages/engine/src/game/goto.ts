/**
 * „Idź do” (GoTo) oryginału: segment 2e31 CIV.EXE (F0_2e31_000e GetNextMove, 05e6 ComputeGoToPath, 0a2c CanUnitMove,
 * 0c1d FindShortestPath, 111c CheckUnitPath, 119b) i tablice ścieżek 20×13 liczone przy tworzeniu mapy
 * (overlay 7: F7_0000_1188 ConstructLandPathArray, F7_0000_1440 ConstructWaterPathArray).
 *
 * Źródło: dosłowne tłumaczenie asemblera z historii OpenCivOne (MIT) — Segment_2e31.cs, Overlay_7.cs. Nowsza wersja
 * wzorca (UnitGoTo.cs, region „Old unfixable GoTo algorithm”, MapInitAndIntro.cs) ma błędy przepisania; przy każdej
 * rozbieżności obowiązuje asembler, a rozbieżności są opisane przy kodzie (C#: …).
 *
 * Jak to działa: mapa jest podzielona na bloki 4×4 (siatka 20×13); tablica ścieżek mówi, między którymi sąsiednimi
 * blokami da się przejść (ląd: dojście piechura w < 20 punktach ruchu; woda: pas wody wzdłuż linii). Daleki cel —
 * BFS po blokach wyznacza pośredni punkt w sąsiednim bloku; bliski cel (okno 15×15) — FindShortestPath liczy koszty
 * dojścia od celu i wybiera najtańszego sąsiada. Gdy nic nie działa — zachłanny krok w stronę celu.
 *
 * Stan pomocniczy (decyzja): zmienne globalne oryginału, które przed każdym użyciem są ustawiane od nowa
 * (Var_6590/6592 — cel pośredni, Var_6794 — koszt, kolejki Arr_6594/6694, Arr_d816), są zmiennymi modułu.
 * Pamięć FindShortestPath (Var_6796/6798 — ostatni cel, Arr_b780 — koszty) przenosi się między wywołaniami
 * i zmienia wynik (trafienie w pamięć daje koszt 0), więc należy do stanu gry: `GameMap.gotoCache` — zapisywana
 * razem z mapą, tworzona przy budowie tablic ścieżek (oryginał zostawia ją w stanie po ostatnim CheckUnitPath).
 *
 * Arytmetyka: bajty jak w oryginale (współrzędne jednostki i celu bez znaku, koszty i kolejki ze znakiem — Int8Array).
 * Odczyty poza tablicami (oryginał czyta wtedy sąsiednią pamięć) — przyjęte 0, zapisy poza tablicą — pominięte.
 */
import { MovementType } from '../data/enums';
import { TERRAIN } from '../data/terrain';
import { UNITS } from '../data/units';
import { Terrain } from '../world/generate';
import { DIRECTIONS, cellIndex, isValid, wrapX } from './map';
import { Improvement, NO_UNIT, type GameMap, type GameState, type GotoCache, type Unit } from './types';
import { activeUnitAt, cellOwner, emptyUnit, isEnemyUnitAdjacent, occupantPlayer, stackCount } from './units';

/** Liczba pól tablicy ścieżek (20×13). */
export const PATH_CELLS = 20 * 13;

export const emptyGotoCache = (): GotoCache => ({ lastX: 0, lastY: 0, costs: new Int8Array(256) });

// ── zmienne globalne oryginału bez pamięci między wywołaniami ──────────────────────────
let destX = 0; // Var_6590: cel (pośredni)
let destY = 0; // Var_6592
let pathCost = 0; // Var_6794: koszt dojścia znaleziony przez FindShortestPath
const queueX = new Int8Array(256); // Arr_6594 (bajty, odczyt ze znakiem — CBW)
const queueY = new Int8Array(256); // Arr_6694
const blockDist = new Int8Array(PATH_CELLS); // Arr_d816: odległość w blokach od bloku celu
let scratchUnit: Unit | undefined; // rekord jednostki 127 barbarzyńców, gdy nie ma jeszcze stanu gry (generator mapy)

/** Kontekst wywołania: mapa i (w czasie gry) stan z jednostkami. */
interface Env {
  map: GameMap;
  state: GameState | null;
}

const dx = (d: number) => DIRECTIONS[d]![0]; // tabela DS:0x1882
const dy = (d: number) => DIRECTIONS[d]![1]; // tabela DS:0x18e4
const isWater = (t: number) => t === Terrain.Water;

function unitOf(env: Env, player: number, id: number): Unit {
  if (env.state) return env.state.players[player]!.units[id]!;
  return (scratchUnit ??= emptyUnit());
}

/** F0_2e31_119b: jednorazowe zawinięcie współrzędnej X. */
const adjustX = (x: number): number => (x < 0 ? x + 80 : x >= 80 ? x - 80 : x);

/** F0_2dc4_0208: odległość oryginału — dłuższa różnica + połowa krótszej (z zawijaniem w poziomie). */
export function shortestDistance(ddx: number, ddy: number): number {
  let w = Math.abs(ddx);
  const h = Math.abs(ddy);
  if (w > 40) w = 80 - w;
  return w > h ? (h >> 1) + w : (w >> 1) + h;
}

// ── odczyt mapy jak w oryginale ─────────────────────────────────────────────────────────

/** Wartość piksela → teren (tablica DS:0x2ba6; piksel = `terrainChangeId`); brak = -1 (nie woda). */
const PIXEL_TO_TERRAIN: number[] = (() => {
  const t = new Array<number>(256).fill(-1);
  for (let i = 0; i < 12; i++) t[TERRAIN[i]!.terrainChangeId] = i;
  return t;
})();

/**
 * Piksel strony mapy oryginału (320×200): (x, y) teren, (x+80, y) własność ziemi, (x+160, y) zajętość pola,
 * (x, y+50) numer kontynentu/oceanu, (x+80, y+50) atrakcyjność pola. Oryginał czyta tę stronę bez sprawdzania
 * granic, więc współrzędne poza mapą trafiają w sąsiednie warstwy; poza tymi warstwami — 0.
 */
function pagePixel(map: GameMap, px: number, py: number): number {
  if (px < 0 || py < 0) return 0;
  if (py < 50) {
    const i = py * 80 + (px % 80);
    if (px < 80) return TERRAIN[map.terrain[i]!]!.terrainChangeId;
    if (px < 160) return map.landOwner[i]!;
    if (px < 240) return map.occupant[i]!;
    return 0;
  }
  if (py < 100) {
    const i = (py - 50) * 80 + (px % 80);
    if (px < 80) return map.group[i]!;
    if (px < 160) return map.buildScore[i]!;
  }
  return 0;
}

/** F7_0000_176d: teren bez zawijania X (piksel strony mapy). */
function pageTerrain(map: GameMap, x: number, y: number): number {
  if (x >= 0 && x < 80 && y >= 0 && y < 50) return map.terrain[y * 80 + x]!;
  return PIXEL_TO_TERRAIN[pagePixel(map, x, y)]!;
}

/** F7_0000_178e / F0_2aea_1942: numer kontynentu/oceanu — piksel (x, y+50), bez zawijania X. */
const pageGroup = (map: GameMap, x: number, y: number) => pagePixel(map, x, y + 50);

/** F0_2aea_134a: teren pola (X zawijane; Y poza mapą — piksel strony mapy). */
const terrainOf = (map: GameMap, x: number, y: number) => pageTerrain(map, wrapX(x), y);

/** F0_2aea_1585: ulepszenia pola — warstwa RZECZYWISTA (u nas `map.improvements`). */
const improvementsOf = (map: GameMap, x: number, y: number) => (isValid(x, y) ? map.improvements[cellIndex(x, y)]! : 0);

/** F0_2aea_1570: czy na polu jest droga. */
const hasRoad = (map: GameMap, x: number, y: number) => (improvementsOf(map, x, y) & Improvement.Road) !== 0;

/** F0_2aea_195d: wielkość kontynentu/oceanu, do którego należy pole. */
function groupSize(map: GameMap, x: number, y: number): number {
  const i = cellIndex(x, y);
  const list = isWater(map.terrain[i]!) ? map.oceans : map.continents;
  return list[map.group[i]!]?.size ?? 0;
}

/** Bity tablicy ścieżek dla bloku (indeks x·13+y jak w oryginale; poza tablicą — 0). */
function pathBits(arr: Uint8Array, sx: number, sy: number): number {
  const i = sx * 13 + sy;
  return i >= 0 && i < PATH_CELLS ? arr[i]! : 0;
}

function getBlockDist(sx: number, sy: number): number {
  const i = sx * 13 + sy;
  return i >= 0 && i < PATH_CELLS ? blockDist[i]! : 0;
}

function setBlockDist(sx: number, sy: number, v: number): void {
  const i = sx * 13 + sy;
  if (i >= 0 && i < PATH_CELLS) blockDist[i] = v;
}

// ── F0_2e31_0c1d FindShortestPath ───────────────────────────────────────────────────────

/**
 * Najtańszy pierwszy krok jednostki do celu (Var_6590, Var_6592) w oknie 15×15 wokół celu albo -1.
 * Koszty dojścia od celu (Arr_b780) są pamiętane: ten sam cel i znane pole jednostki — bez przeliczania (Var_6794 = 0).
 * Przeliczanie: kolejka od celu, rozwijane pola o koszcie ≤ Var_6794 (na początku `maxCost`); dojście do jednostki
 * ustala Var_6794 na jej koszt; najwyżej 225 pól z kolejki. Krok: sąsiad o najmniejszym koszcie, remis — mniej
 * jednostek na polu (×4) + odległość od celu.
 * Przy -1 cel pośredni wraca na cel jednostki.
 */
function findShortestPath(env: Env, player: number, unitId: number, maxCost: number): number {
  const map = env.map;
  const cache = map.gotoCache;
  const unit = unitOf(env, player, unitId);
  const def = UNITS[unit.type]!;
  const water = def.movementType === MovementType.Water;
  const ux = unit.x & 0xff;
  const uy = unit.y & 0xff;
  const ox = destX - 8;
  const oy = destY - 8;
  const costIndex = (x: number, y: number) => (x - ox) * 16 + (y - oy);
  // poza tablicą 16×16 (np. jednostka za szwem mapy przy tym samym celu) oryginał czyta sąsiednią pamięć — przyjęte 0
  const costAt = (x: number, y: number) => {
    const i = costIndex(x, y);
    return i >= 0 && i < 256 ? cache.costs[i]! : 0;
  };
  pathCost = 0;

  if (destX !== cache.lastX || destY !== cache.lastY || costAt(ux, uy) === 0) {
    cache.lastX = destX;
    cache.lastY = destY;
    cache.costs.fill(0);
    let write = 0;
    let read = 0;
    queueX[write] = destX;
    queueY[write++] = destY;
    cache.costs[costIndex(destX, destY)] = 1;
    pathCost = maxCost;
    const oneMove = def.moves === 1;
    do {
      const cx = queueX[read]!;
      const cy = queueY[read]!;
      read = (read + 1) & 0xff;
      const c = costAt(cx, cy);
      if (c > pathCost) continue;
      if (adjustX(cx) === ux && cy === uy) {
        pathCost = c;
        continue;
      }
      const road = hasRoad(map, adjustX(cx), cy);
      for (let d = 1; d <= 8; d++) {
        const nx = dx(d) + cx;
        if (Math.abs(nx - destX) >= 8) continue;
        const ax = adjustX(nx);
        const ny = dy(d) + cy;
        if (Math.abs(ny - destY) >= 8) continue;
        if (!isValid(ax, ny)) continue; // F0_2aea_1326
        const t = terrainOf(map, ax, ny);
        if (isWater(t) !== water && !(improvementsOf(map, ax, ny) & Improvement.City)) continue;
        let cost: number;
        if (road && hasRoad(map, ax, ny)) cost = c + 1;
        else if (oneMove) cost = c + 3;
        else cost = 3 * TERRAIN[t]!.movementCost + c;
        const i = costIndex(nx, ny);
        const old = cache.costs[i]!;
        if (old !== 0 && old <= cost) continue;
        cache.costs[i] = cost; // bajt (Int8Array obcina jak oryginał)
        queueX[write] = nx;
        queueY[write] = ny;
        write = (write + 1) & 0xff;
      }
    } while (read !== write && read < 225);
  }

  let best = -1;
  if (maxCost > pathCost) {
    let bestCost = 99;
    let bestScore = 0; // local_e — w oryginale żyje przez całą pętlę (C#: zerowane w każdym kierunku, remisy nie działały)
    const score = (x: number, y: number) => {
      let s = 0;
      if (env.state) {
        const id = activeUnitAt(env.state, x, y); // F0_2aea_1458
        // F0_1866_1251(gracz, id, 2): liczba jednostek w stosie — numer z pola, ale tablica jednostek ruszającego gracza
        if (id !== -1) {
          const u = env.state.players[player]!.units[id]!;
          s = (u.type === NO_UNIT ? 0 : stackCount(env.state, player, u.x, u.y)) << 2;
        }
      }
      return s + shortestDistance(destX - x, destY - y); // F0_2dc4_0289
    };
    for (let d = 1; d <= 8; d++) {
      let nx = dx(d) + ux;
      if (Math.abs(nx - destX) >= 72) nx += nx <= destX ? 80 : -80;
      if (Math.abs(nx - destX) >= 8) continue;
      const ax = adjustX(nx);
      const ny = dy(d) + uy;
      if (Math.abs(ny - destY) >= 8) continue;
      if (isWater(terrainOf(map, ax, ny)) !== water && !(improvementsOf(map, ax, ny) & Improvement.City)) continue;
      const c = costAt(nx, ny);
      if (c === 0) continue;
      if (c < bestCost) {
        bestCost = c;
        best = d;
        bestScore = score(ax, ny);
      }
      if (c === bestCost) {
        // oryginał po „<” przechodzi także przez gałąź remisu (wynik ten sam)
        const s = score(ax, ny);
        if (s < bestScore) {
          best = d;
          bestScore = s;
        }
      }
    }
  }
  if (best !== -1) return best;
  destX = unit.gotoX & 0xff;
  destY = unit.gotoY & 0xff;
  return -1;
}

// ── F0_2e31_111c CheckUnitPath ──────────────────────────────────────────────────────────

/**
 * Koszt dojścia z (x, y) do (x1, y1) piechurem (Militia) albo triremą albo -1 — FindShortestPath z tymczasową
 * jednostką 127 barbarzyńców (oryginał nadpisuje jej X, Y i typ, a po wszystkim ustawia typ 0xff; X i Y zostają).
 * Warunek wstępny w asemblerze: |Δx| ≤ 7 LUB |Δy| ≤ 7 (C#: I).
 */
export function checkUnitPath(env: Env, x: number, y: number, x1: number, y1: number, water: boolean, maxCost: number): number {
  if (Math.abs(x - x1) > 7 && Math.abs(y - y1) > 7) return -1;
  const u = unitOf(env, 0, 127);
  u.x = x & 0xff;
  u.y = y & 0xff;
  u.type = water ? 16 : 1;
  destX = x1;
  destY = y1;
  const r = findShortestPath(env, 0, 127, maxCost);
  u.type = NO_UNIT;
  return r === -1 ? -1 : pathCost;
}

// ── F0_2e31_0a2c CanUnitMove ────────────────────────────────────────────────────────────

/**
 * Blok tablicy ścieżek dla pola (x, y): własny, jeśli ma jakiekolwiek przejście; inaczej najbliższy sąsiedni blok,
 * z którego jednostka dojdzie do pola (CheckUnitPath z limitem 18). Wynik w Var_6590/6592 (współrzędne bloku).
 * C#: przelicza blok na współrzędne mapy (blok·4 + kierunek) i sprawdza teren w (blok + 1) zamiast (blok·4 + 1).
 */
function canUnitMove(env: Env, x: number, y: number, water: boolean): boolean {
  const map = env.map;
  const arr = water ? map.waterPath : map.landPath;
  const sx = Math.trunc(x / 4);
  const sy = Math.trunc(y / 4);
  let dir = pathBits(arr, sx, sy) !== 0 ? 0 : -1;
  if (dir === -1) {
    let best = 99;
    for (let d = 1; d <= 8; d++) {
      const nsx = sx + dx(d);
      const nsy = sy + dy(d);
      if (pathBits(arr, nsx, nsy) === 0) continue;
      const dist = shortestDistance(x - nsx * 4 - 1, y - nsy * 4 - 1); // F0_2dc4_0208
      if (dist >= best) continue;
      // pole startowe w bloku: (1,1), (2,1), (2,2), (1,2) — pierwsze właściwego rodzaju (ląd/woda)
      let tx = nsx * 4 + 1;
      let ty = nsy * 4 + 1;
      const ok = () => isWater(terrainOf(map, tx, ty)) === water;
      if (!ok()) {
        tx++;
        if (!ok()) {
          ty++;
          if (!ok()) {
            tx--;
            if (!ok()) continue;
          }
        }
      }
      if (checkUnitPath(env, tx, ty, x, y, water, 18) !== -1) {
        best = dist;
        dir = d;
      }
    }
  }
  if (dir === -1) return false;
  destX = dx(dir) + sx;
  destY = dy(dir) + sy;
  return true;
}

// ── F0_2e31_05e6 ComputeGoToPath ────────────────────────────────────────────────────────

/**
 * Cel pośredni dla dalekiej drogi: BFS po blokach od bloku celu do bloku jednostki; cel pośredni = pole (1,1)
 * sąsiedniego bloku leżącego najbliżej celu (remis — bliżej celu jednostki), przesunięte na pole właściwego rodzaju.
 * Zwraca wartość rejestru AX oryginału: 1/0 (znaleziono/nie) albo — gdy blok jednostki nie ma przejść — Y celu
 * (C#: false; w oryginale funkcja wychodzi wtedy z AX = Y celu, czyli zwykle „prawda”).
 */
function computeGoToPath(env: Env, player: number, unitId: number): number {
  const map = env.map;
  const unit = unitOf(env, player, unitId);
  const water = UNITS[unit.type]!.movementType === MovementType.Water;
  const gx = unit.gotoX & 0xff;
  const gy = unit.gotoY & 0xff;
  destX = gx;
  destY = gy;
  if (!canUnitMove(env, unit.x & 0xff, unit.y & 0xff, water)) {
    destX = gx;
    destY = gy;
    return gy;
  }
  const ux = destX; // blok jednostki
  const uy = destY;
  canUnitMove(env, gx, gy, water); // wynik pominięty jak w oryginale: blok celu albo to, co zostawiło CheckUnitPath
  const arr = water ? map.waterPath : map.landPath;
  blockDist.fill(0);
  let write = 0;
  let read = 0;
  queueX[write] = destX;
  queueY[write++] = destY;
  setBlockDist(destX, destY, 1);
  let found = 0;
  for (;;) {
    const cx = queueX[read]!;
    const cy = queueY[read]!;
    if (cx === ux && cy === uy) {
      found = 1;
      break;
    }
    const c = getBlockDist(cx, cy);
    read = (read + 1) & 0xff;
    const flags = pathBits(arr, cx, cy);
    for (let d = 1; d <= 8; d++) {
      if (!(flags & (1 << (d - 1)))) continue;
      let nx = dx(d) + cx;
      if (nx === 20) nx = 0;
      if (nx === -1) nx = 19;
      const ny = dy(d) + cy;
      if (getBlockDist(nx, ny) !== 0) continue;
      setBlockDist(nx, ny, c + 1);
      queueX[write] = nx;
      queueY[write] = ny;
      write = (write + 1) & 0xff;
    }
    if (read === write) break;
  }
  destX = -1;
  if (found) {
    let bestDist = 99;
    let dir = -1;
    let bestGoal = 0;
    const flags = pathBits(arr, ux, uy);
    for (let d = 1; d <= 8; d++) {
      if (!(flags & (1 << (d - 1)))) continue;
      let nx = dx(d) + ux;
      const ny = dy(d) + uy;
      if (nx === 20) nx = 0;
      if (nx === -1) nx = 19;
      const c = getBlockDist(nx, ny);
      if (c === 0) continue;
      if (c < bestDist) {
        bestDist = c;
        dir = d;
        bestGoal = shortestDistance(gx - (nx * 4 + 1), gy - (ny * 4 + 1)); // F0_2dc4_0289
      } else if (c === bestDist) {
        const g = shortestDistance(gx - (nx * 4 + 1), gy - (ny * 4 + 1));
        if (g < bestGoal) {
          dir = d;
          bestGoal = g;
        }
      }
    }
    if (dir !== -1) {
      destX = adjustX((dx(dir) + ux) * 4 + 1);
      destY = (dy(dir) + uy) * 4 + 1;
      if (isWater(terrainOf(map, destX, destY)) !== water) {
        destX++;
        if (isWater(terrainOf(map, destX, destY)) !== water) destY++;
      }
    }
  }
  if (destX === -1) {
    destX = gx;
    destY = gy;
  }
  return found;
}

// ── F0_2e31_000e GetNextMove ────────────────────────────────────────────────────────────

/**
 * Kierunek następnego ruchu jednostki z rozkazem „idź do” (1–8), 0 — brak ruchu albo -1 — koniec „idź do”
 * (PlayerTurn kasuje wtedy cel i ostatni kierunek). Ten sam algorytm dla człowieka, komputera i barbarzyńców.
 *
 * Człowiek obok celu (|Δ| ≤ 1): krok wprost na cel, X celu = -1 (Y zostaje), na samym celu — 0 (C#: -1).
 * Samolot: od razu krok zachłanny. Inaczej: bliski cel (|Δx| < 7 albo > 73, |Δy| < 7) — FindShortestPath(999)
 * (C#: warunek odwrócony); potem ComputeGoToPath i FindShortestPath do celu pośredniego.
 * Krok zachłanny: ocena = koszt terenu (droga 1; jednostka z 1 ruchem 3) + 4·wektor + |Δx| + |Δy| + kwadrat skrętu
 * względem ostatniego kierunku; wektor = max(|Δx|,|Δy|) + |Δx| + |Δy| (C#: bez nawiasów — dla |Δx| > |Δy| sam |Δx|).
 * Człowiek nie robi kroku, który oddala od celu. Zawrócenie (kierunek ^ 4) kończy ruch i „idź do”.
 */
export function getNextMove(state: GameState, player: number, unitId: number): number {
  const env: Env = { map: state.map, state };
  const map = state.map;
  const unit = state.players[player]!.units[unitId]!;
  const def = UNITS[unit.type]!;
  const ux = unit.x & 0xff;
  const uy = unit.y & 0xff;
  const gx = unit.gotoX & 0xff;
  const gy = unit.gotoY & 0xff;

  if (player === state.humanPlayer && Math.abs(gx - ux) <= 1 && Math.abs(gy - uy) <= 1) {
    const mx = gx - ux;
    // F0_2aea_1819 = znak; |Δx| ≥ 40 (zawinięcie) nie zachodzi przy |Δx| ≤ 1, ale jest w kodzie
    const sx = Math.abs(mx) < 40 ? Math.sign(mx) : -Math.sign(mx);
    const sy = Math.sign(gy - uy);
    unit.gotoX = -1;
    for (let d = 1; d <= 8; d++) if (dx(d) === sx && dy(d) === sy) return d;
    return 0;
  }

  if (def.movementType === MovementType.Air) {
    destX = gx;
    destY = gy;
  } else {
    let failedNear = false;
    const adx = Math.abs(gx - ux);
    if ((adx < 7 || adx > 73) && Math.abs(gy - uy) < 7) {
      destX = gx;
      destY = gy;
      const r = findShortestPath(env, player, unitId, 999);
      if (r !== -1) return r;
      failedNear = true;
    }
    if (computeGoToPath(env, player, unitId) !== 0 || !failedNear) {
      const r = findShortestPath(env, player, unitId, 999);
      if (r !== -1) return r;
    }
  }

  // Krok zachłanny w stronę celu (pośredniego); bez zawijania różnicy X jak w oryginale
  const mx = destX - ux;
  const my = destY - uy;
  const vector = Math.max(Math.abs(mx), Math.abs(my)) + Math.abs(mx) + Math.abs(my);
  if (mx === 0 && my === 0) {
    unit.gotoNextDirection = -1;
    unit.gotoX = -1;
    unit.movesLeft = 0;
    return -1;
  }
  const road = (improvementsOf(map, ux, uy) & Improvement.Road) !== 0;
  const near = isEnemyUnitAdjacent(state, player, ux, uy); // F0_1866_1725 IsUnitNear
  let bestCost = 9999;
  let best = 0;
  for (let d = 1; d <= 8; d++) {
    const nx = ux + dx(d);
    const ny = uy + dy(d);
    const ax = Math.abs(mx - dx(d));
    const ay = Math.abs(my - dy(d));
    const nv = Math.max(ax, ay) + ax + ay;
    if (player === state.humanPlayer && nv > vector) continue;
    // Odstępstwo: pole poza mapą w pionie pomijamy (oryginał czyta tam sąsiednią pamięć strony mapy).
    if (!isValid(nx, ny)) continue;
    const t = terrainOf(map, nx, ny);
    const owner = occupantPlayer(state, nx, ny); // F0_2aea_14e0
    let ok = false;
    if (owner === -1 || owner === player) {
      if ((def.movementType === MovementType.Water) === isWater(t) && (!near || !isEnemyUnitAdjacent(state, player, nx, ny))) ok = true;
      else if (def.movementType === MovementType.Air) ok = true;
    }
    if (!ok && improvementsOf(map, nx, ny) & Improvement.City && cellOwner(state, nx, ny) === player) ok = true; // F0_2aea_1369
    if (!ok) continue;
    if (isWater(t) && groupSize(map, nx, ny) < 5) continue;
    let cost: number;
    if (road && improvementsOf(map, nx, ny) & Improvement.Road) cost = 1;
    else cost = def.moves > 1 ? 3 * TERRAIN[t]!.movementCost : 3;
    cost += nv * 4 + ax + ay;
    if (unit.gotoNextDirection !== -1) {
      let turn = Math.abs(unit.gotoNextDirection - d);
      if (turn > 4) turn = 8 - turn;
      cost += turn * turn;
    }
    if (cost < bestCost) {
      best = d;
      bestCost = cost;
    }
  }
  if (unit.gotoNextDirection !== -1 && (unit.gotoNextDirection ^ 4) === best) {
    unit.movesLeft = 0;
    best = 0;
  }
  if (best === 0) {
    unit.gotoNextDirection = -1;
    unit.gotoX = -1;
    return -1;
  }
  unit.gotoNextDirection = best;
  return best;
}

// ── tablice ścieżek (overlay 7) ─────────────────────────────────────────────────────────

/** Pierwsze z pól (x,y), (x+1,y), (x,y+1), (x+1,y+1) danego rodzaju (ląd/woda) albo null. */
function firstOfKind(map: GameMap, x: number, y: number, water: boolean): [number, number] | null {
  for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
    if (isWater(pageTerrain(map, x + ox, y + oy)) === water) return [x + ox, y + oy];
  }
  return null;
}

/**
 * F7_0000_1188 ConstructLandPathArray: dla każdego bloku 4×4 i kierunków 1–4 (N, NE, E, SE) — przejście, gdy pola
 * lądu obu bloków leżą na tym samym kontynencie, a piechur dochodzi w < 20 punktach (CheckUnitPath(…, ląd, 20);
 * C#: nowy A* GetGoToDistance). Bit odwrotny u sąsiada tylko w granicach siatki (bez zawijania — szew mapy
 * zostaje jednokierunkowy). Teren i numer kontynentu czytane bez zawijania X (F7_0000_176d, F0_2aea_1942).
 */
export function constructLandPathArray(map: GameMap): void {
  const env: Env = { map, state: null };
  const arr = map.landPath;
  arr.fill(0);
  for (let sx = 0; sx < 20; sx++) {
    for (let sy = 0; sy < 13; sy++) {
      const cx = sx * 4 + 1;
      const cy = sy * 4 + 1;
      const from = firstOfKind(map, cx, cy, false);
      if (!from) continue;
      const group = pageGroup(map, from[0], from[1]);
      for (let d = 1; d <= 4; d++) {
        const to = firstOfKind(map, dx(d) * 4 + cx, dy(d) * 4 + cy, false);
        if (!to || pageGroup(map, to[0], to[1]) !== group) continue;
        const r = checkUnitPath(env, from[0], from[1], to[0], to[1], false, 20);
        if (r === -1 || r >= 20) continue;
        arr[sx * 13 + sy]! |= 1 << (d - 1);
        const nx = dx(d) + sx;
        const ny = dy(d) + sy;
        if (nx < 0 || nx >= 20 || ny < 0 || ny >= 13) continue;
        arr[nx * 13 + ny]! |= 1 << ((d + 3) & 7);
      }
    }
  }
}

/**
 * F7_0000_1440 ConstructWaterPathArray: bloki w wierszach 0–11, kierunki 1–8; przejście, gdy pola wody obu bloków
 * należą do tego samego oceanu i na linii 5 kroków każdy kwadrat 2×2 ma ≥ 2 pola wody (wyjątek: wiersz 11, kierunek 3).
 * Numer oceanu bloku docelowego NIE jest zerowany przed kierunkiem — gdy blok nie ma wody, zostaje poprzedni
 * (C#: zerowany). Na koniec szew mapy: kolumny 0 i 19 połączone na zachód/wschód z poprawkami narożników.
 */
export function constructWaterPathArray(map: GameMap): void {
  const arr = map.waterPath;
  arr.fill(0);
  let targetGroup = -1; // local_e
  const waterCell = (x: number, y: number) => isWater(pageTerrain(map, x, y)) && isValid(x, y); // + F0_2aea_1326
  for (let sx = 0; sx < 20; sx++) {
    for (let sy = 0; sy < 12; sy++) {
      const cx = sx * 4 + 1;
      const cy = sy * 4 + 1;
      const from = firstOfKind(map, cx, cy, true);
      if (!from) continue;
      const group = pageGroup(map, from[0], from[1]);
      for (let d = 1; d <= 8; d++) {
        const to = firstOfKind(map, dx(d) * 4 + cx, dy(d) * 4 + cy, true);
        if (to) targetGroup = pageGroup(map, to[0], to[1]);
        if (group !== targetGroup) continue;
        let lx = cx;
        let ly = cy;
        let open = true;
        for (let step = 0; step <= 4; step++) {
          lx += dx(d);
          ly += dy(d);
          let count = 4;
          if (!waterCell(lx, ly)) count--;
          if (!waterCell(lx + 1, ly)) count--;
          if (!waterCell(lx, ly + 1)) count--;
          if (!waterCell(lx + 1, ly + 1)) count--;
          if (count < 2) {
            open = false;
            break;
          }
        }
        if (!open && !(sy === 11 && d === 3)) continue;
        const ny = dy(d) + sy;
        if (ny >= 12) continue;
        arr[sx * 13 + sy]! |= 1 << (d - 1);
        const nx = dx(d) + sx;
        if (nx < 0 || nx >= 20 || ny < 0 || ny > 12) continue;
        arr[nx * 13 + ny]! |= 1 << ((d + 3) & 7);
      }
    }
  }
  for (let i = 0; i < 12; i++) {
    arr[i]! |= 0xe0; // kolumna 0: SW, W, NW
    arr[19 * 13 + i]! |= 0x0e; // kolumna 19: NE, E, SE
  }
  arr[0]! &= 0x7f;
  arr[11]! &= 0xdf;
  arr[19 * 13]! &= 0xfd;
  arr[19 * 13 + 11]! &= 0xf7;
}

/** Przelicza obie tablice ścieżek (np. dla zapisu bez nich). */
export function constructPathArrays(map: GameMap): void {
  constructLandPathArray(map);
  constructWaterPathArray(map);
}
