/**
 * Porównanie generatora świata z zapisem oryginału: CIVIL?.SVE + .MAP (zapisane w DOSBoxie) → teren z warstwy mapy,
 * ziarno RandomSeed z zapisu. Oryginał woła srand(time) raz, przy uruchomieniu (F0_2dc4_0042), a przed budową mapy
 * zużywa nieznaną liczbę losowań — szukamy jej: dla N = 0, 1, 2… generator dostaje rand() przesunięty o N kroków.
 *
 * Uruchomienie: npx tsx tools/dosbox/worldcheck.ts PLIK.SVE [ląd temperatura klimat wiek] [maks. N]
 * (ustawienia Customize World 0–2; domyślnie 1 1 1 1). Wynik: najlepsze N i zgodność pól; przy pełnej zgodności
 * także porównanie ze wszystkimi warstwami createGameMap (kontynenty, ocena pól pod miasta).
 */
import { readFileSync } from 'node:fs';
import { createGameMap, generateWorld, loadSve, mscRandom, Terrain } from '../../packages/engine/src/index';

const [svePath, ...rest] = process.argv.slice(2);
if (!svePath) throw new Error('Podaj plik .SVE');
const [land = 1, temp = 1, climate = 1, age = 1, maxN = 20000] = rest.map(Number);
const sve = new Uint8Array(readFileSync(svePath));
const map = new Uint8Array(readFileSync(svePath.replace(/\.SVE$/i, '.MAP')));
const state = loadSve(sve, map);
const seed = state.mapSeed;
const target = state.map.terrain;
const options = { landMass: land, temperature: temp, climate, age };
console.log(`ziarno ${seed}, ustawienia ${JSON.stringify(options)}`);

const names = Object.fromEntries(Object.entries(Terrain).map(([k, v]) => [v, k]));
function score(terrain: Uint8Array): number {
  let same = 0;
  for (let i = 0; i < 4000; i++) if (terrain[i] === target[i]) same++;
  return same;
}

let best = { n: -1, same: -1 };
const t0 = Date.now();
for (let n = 0; n <= maxN; n++) {
  const rng = mscRandom(seed);
  for (let k = 0; k < n; k++) rng.next(1);
  const world = generateWorld(rng, options);
  const full = createGameMap(world, rng, seed);
  const same = score(full.terrain);
  if (same > best.same) {
    best = { n, same };
    console.log(`N=${n}: ${same}/4000 (${((100 * same) / 4000).toFixed(2)}%)`);
  }
  if (same === 4000) break;
}
console.log(`najlepsze N=${best.n}: ${best.same}/4000; czas ${((Date.now() - t0) / 1000).toFixed(1)} s`);

if (best.n >= 0) {
  const rng = mscRandom(seed);
  for (let k = 0; k < best.n; k++) rng.next(1);
  const full = createGameMap(generateWorld(rng, options), rng, seed);
  const diffs: string[] = [];
  for (let i = 0; i < 4000 && diffs.length < 20; i++) {
    if (full.terrain[i] !== target[i]) diffs.push(`(${i % 80},${Math.trunc(i / 80)}) ${names[full.terrain[i]!]}≠${names[target[i]!]}`);
  }
  if (diffs.length) console.log('różnice terenu:', diffs.join('; '));
  let g = 0;
  let b = 0;
  for (let i = 0; i < 4000; i++) {
    if (full.group[i] === state.map.group[i]) g++;
    if (full.buildScore[i] === state.map.buildScore[i]) b++;
  }
  console.log(`kontynenty/oceany: ${g}/4000, ocena pól pod miasta: ${b}/4000`);
}

// ── gracze: nowa gra silnika z tym samym ziarnem i wyborami co w zapisie ──
import { newGame, NO_UNIT, TECHS } from '../../packages/engine/src/index';
{
  const human = state.humanPlayer;
  const ours = newGame({
    seed, world: options, difficulty: state.difficulty, civilizations: state.aiOpponents + 1,
    nation: state.players[human]!.nation, leaderName: state.players[human]!.leader,
  });
  const techList = (p: { techs: boolean[] }) => TECHS.filter((t) => p.techs[t.id]).map((t) => t.name).join(', ') || '-';
  for (let p = 0; p < 8; p++) {
    const a = state.players[p]!;
    const b = ours.players[p]!;
    const units = (pl: typeof a) => pl.units.filter((u) => u.type !== NO_UNIT).length;
    console.log(
      `gracz ${p}: nacja ${a.nation}/${b.nation}, xStart ${a.xStart}/${b.xStart}, jednostki ${units(a)}/${units(b)}, ` +
        `technologie [${techList(a)}] / [${techList(b)}]`,
    );
  }
  console.log(`aktywni ${state.activeCivs.toString(2)}/${ours.activeCivs.toString(2)}, następny raport historyka ${state.nextHistoryTurn}/${ours.nextHistoryTurn}`);
}
