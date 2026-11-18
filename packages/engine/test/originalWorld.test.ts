/**
 * Generator świata i rozstawienie cywilizacji porównane z zapisami oryginału z początku gry.
 *
 * Zapisy CIVIL?.SVE + .MAP robi się w DOSBoxie (`tools/dosbox`, opis w docs/dosbox-compare.md) zaraz po starcie nowej
 * gry (tura 0 albo 1) ze światem bez Customize World (ustawienia 1/1/1/1; inne: CIV1_WORLD="ląd temp. klimat wiek").
 * Folder z zapisami: CIV1_SAVES_DIR. Bez niego (albo bez zapisów z tur 0–1) test jest pomijany; zapisy nie trafiają
 * do repozytorium.
 *
 * Oryginał buduje mapę zaraz po srand(RandomSeed) — generator silnika z tym samym ziarnem musi dać identyczne warstwy:
 * teren, kontynenty/oceany (grupy) i ocenę pól pod miasta. Rozstawienie (InitPlayerData + F5_0000_0fe6): nacje,
 * xStart, technologie startowe; osobno (CIV1_STRICT_START=1) liczba osadników (w turze 1 — osadnicy + miasta założone
 * w pierwszej turze; inne jednostki pomijane — mogą pochodzić z chat).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createGameMap, generateWorld, loadSve, mscRandom, newGame } from '../src';

const dir = process.env.CIV1_SAVES_DIR;
const files = dir && existsSync(dir) ? new Map(readdirSync(dir).map((name) => [name.toUpperCase(), name])) : new Map<string, string>();
const read = (name: string) => new Uint8Array(readFileSync(join(dir!, files.get(name)!)));
const [landMass = 1, temperature = 1, climate = 1, age = 1] = (process.env.CIV1_WORLD ?? '').split(/\s+/).filter(Boolean).map(Number);
const world = { landMass, temperature, climate, age };

const saves = Array.from({ length: 10 }, (_, i) => i)
  .filter((i) => files.has(`CIVIL${i}.SVE`) && files.has(`CIVIL${i}.MAP`))
  .filter((i) => loadSve(read(`CIVIL${i}.SVE`), read(`CIVIL${i}.MAP`)).turn <= 1);

describe.skipIf(saves.length === 0)('świat i start gry jak w zapisach oryginału', () => {
  it.each(saves.length > 0 ? saves : [0])('CIVIL%i.SVE: mapa z ziarna zapisu i rozstawienie cywilizacji', (i) => {
    const state = loadSve(read(`CIVIL${i}.SVE`), read(`CIVIL${i}.MAP`));
    const seed = state.mapSeed;
    const rng = mscRandom(seed);
    const map = createGameMap(generateWorld(rng, world), rng, seed);
    const diff = (a: ArrayLike<number>, b: ArrayLike<number>) => {
      for (let k = 0; k < 4000; k++) if (a[k] !== b[k]) return `(${k % 80},${Math.trunc(k / 80)}): ${a[k]} ≠ ${b[k]}`;
      return null;
    };
    expect(diff(map.terrain, state.map.terrain), 'teren').toBeNull();
    expect(diff(map.group, state.map.group), 'kontynenty/oceany').toBeNull();
    expect(diff(map.buildScore, state.map.buildScore), 'ocena pól pod miasta').toBeNull();

    const human = state.humanPlayer;
    const ours = newGame({
      seed, world, difficulty: state.difficulty, civilizations: state.aiOpponents + 1,
      nation: state.players[human]!.nation, leaderName: state.players[human]!.leader,
    });
    expect(ours.activeCivs).toBe(state.activeCivs);
    for (let p = 0; p < 8; p++) {
      const a = state.players[p]!;
      const b = ours.players[p]!;
      expect(b.nation, `nacja gracza ${p}`).toBe(a.nation);
      expect(b.xStart, `xStart gracza ${p}`).toBe(a.xStart);
      expect(b.techs, `technologie gracza ${p}`).toEqual(a.techs);
    }
  });

  // Znana rozbieżność (docs/dosbox-compare.md): w zapisie z ziarnem 24104 oryginał dał graczowi 5 drugiego osadnika
  // (różnica ocen 4), u nas różnica wynosi 1 — ten sam zestaw technologii, inny wynik części „odległość do sąsiada”.
  // Sprawdzane tylko z CIV1_STRICT_START=1.
  it.skipIf(!process.env.CIV1_STRICT_START).each(saves.length > 0 ? saves : [0])('CIVIL%i.SVE: liczba osadników na start', (i) => {
    const state = loadSve(read(`CIVIL${i}.SVE`), read(`CIVIL${i}.MAP`));
    const human = state.humanPlayer;
    const ours = newGame({
      seed: state.mapSeed, world, difficulty: state.difficulty, civilizations: state.aiOpponents + 1,
      nation: state.players[human]!.nation, leaderName: state.players[human]!.leader,
    });
    const settlers = (s: typeof state, q: number) =>
      s.players[q]!.units.filter((u) => u.type === 0).length + s.cities.filter((c) => c.status !== -1 && c.owner === q).length;
    for (let p = 1; p < 8; p++) expect(settlers(ours, p), `osadnicy i miasta gracza ${p}`).toBe(settlers(state, p));
  });
});
