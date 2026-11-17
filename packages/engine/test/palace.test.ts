/** Pałac człowieka (palace.ts) i panorama miasta (cityView.ts): progi, wybór części, mini-pałac, rozkład panoramy. */
import { describe, expect, it } from 'vitest';
import {
  addBuilding, advanceToHuman, BuildingId, checkPalaceUpgrade, cityName, cityViewCell, cityViewLayout, civilizationScore, loadGame,
  miniPalace, miniPalacePiece, newGame, newPalace, normalizePalaceSection, palaceBuildThreshold, palaceCanUpgrade, palaceGardenOffered,
  palaceLevelFromScore, palaceNewLevel, palaceOf, palaceSectionAccepted, palaceSectionOffered, saveGame, unitOrder, upgradePalace,
  WonderId, type GameState,
} from '../src';

function withCapital(seed = 51): { s: GameState; city: number } {
  const s = newGame({ seed, difficulty: 1, civilizations: 5, nation: 1 });
  advanceToHuman(s);
  unitOrder(s, s.humanPlayer, 0, 'build');
  s.events.length = 0;
  return { s, city: s.cities.findIndex((c) => c.status !== -1 && c.owner === s.humanPlayer) };
}

describe('pałac: stan i progi', () => {
  it('nowa gra: części 3–5 i ogrody na poziomie 0, reszta −1, bez rozbudów', () => {
    const s = newGame({ seed: 3, difficulty: 2, civilizations: 5, nation: 1 });
    expect(s.palace).toEqual(newPalace());
    expect(newPalace().levels).toEqual([-1, -1, -1, 0, 0, 0, -1, -1, -1, 0, 0, 0]);
    expect(newPalace().types).toEqual(new Array(12).fill(0));
  });

  it('F0_1238_16e7: próg = (Σ i·(7 − poziom)) / 2 + 1', () => {
    const s = newGame({ seed: 3, difficulty: 0, civilizations: 5, nation: 1 });
    expect(palaceBuildThreshold(s, 1)).toBe(4); // 7/2 + 1
    expect(palaceBuildThreshold(s, 2)).toBe(11); // (7 + 14)/2 + 1
    s.difficulty = 4;
    expect(palaceBuildThreshold(s, 3)).toBe(10); // (3 + 6 + 9)/2 + 1
  });

  it('F0_1238_1c98: rozbudowy z wyniku', () => {
    expect(palaceLevelFromScore(0)).toBe(0);
    expect(palaceLevelFromScore(5)).toBe(0);
    expect(palaceLevelFromScore(6)).toBe(1);
    expect(palaceLevelFromScore(15)).toBe(1);
    expect(palaceLevelFromScore(16)).toBe(2);
    expect(palaceLevelFromScore(100)).toBe(5);
  });

  it('GameTurn: zdarzenie `palace` po przekroczeniu progu, licznik rośnie raz na turę; bez opcji Palace nic', () => {
    const { s, city } = withCapital();
    s.cities[city]!.size = 8;
    const score = civilizationScore(s, s.humanPlayer, false).total;
    expect(score).toBeGreaterThanOrEqual(palaceBuildThreshold(s, 1));
    s.settings.palace = false;
    expect(checkPalaceUpgrade(s)).toBe(false);
    s.settings.palace = true;
    expect(checkPalaceUpgrade(s)).toBe(true);
    expect(palaceOf(s).buildCount).toBe(1);
    expect(s.events.at(-1)).toMatchObject({ kind: 'palace', buildCount: 1 });
    palaceOf(s).buildCount = 37;
    s.difficulty = 7; // próg 1 — zawsze przekroczony
    expect(checkPalaceUpgrade(s)).toBe(false); // 38. rozbudowa: licznik rośnie, okna nie ma
    expect(palaceOf(s).buildCount).toBe(38);
  });

  it('bez miasta z pałacem — brak rozbudowy', () => {
    const s = newGame({ seed: 3, difficulty: 1, civilizations: 5, nation: 1 });
    advanceToHuman(s);
    s.difficulty = 7;
    expect(checkPalaceUpgrade(s)).toBe(false);
    expect(palaceOf(s).buildCount).toBe(0);
  });

  it('koniec tury wywołuje sprawdzenie (licznik po kolejnych turach rośnie)', async () => {
    const { s, city } = withCapital();
    s.cities[city]!.size = 8;
    const { endHumanTurn } = await import('../src');
    for (let i = 0; i < 3; i++) endHumanTurn(s);
    expect(palaceOf(s).buildCount).toBeGreaterThan(0);
    expect(s.events.some((e) => e.kind === 'palace')).toBe(true);
  });

  it('stary zapis bez pałacu: wartości początkowe; nowy zapis zachowuje pałac', () => {
    const { s } = withCapital();
    upgradePalace(s, 4, 2);
    const json = JSON.parse(saveGame(s));
    expect(loadGame(JSON.stringify(json)).palace!.levels[4]).toBe(1);
    delete json.palace;
    const old = loadGame(JSON.stringify(json));
    expect(palaceOf(old)).toEqual(newPalace());
  });
});

describe('pałac: wybór części (F17_0000_0000)', () => {
  it('na początku: numery 3–5 i litery A–C', () => {
    const p = newPalace();
    expect([1, 2, 3, 4, 5, 6, 7].filter((i) => palaceSectionOffered(p, i))).toEqual([3, 4, 5]);
    p.levels[3] = 1;
    expect(palaceSectionOffered(p, 2)).toBe(true); // sąsiad z poziomem > 0
    expect([0, 1, 2].filter((i) => palaceGardenOffered(p, i))).toEqual([0, 1, 2]);
    expect(palaceCanUpgrade(p)).toBe(true);
  });

  it('pusta część przesuwa się ku środkowi, aż dotknie istniejącej', () => {
    const p = newPalace();
    expect(normalizePalaceSection(p, 1)).toBe(3); // L02ce: 1 → 2 → 3 (3 ma poziom 0)
    expect(normalizePalaceSection(p, 7)).toBe(5);
    expect(normalizePalaceSection(p, 10)).toBe(10);
    p.levels[3] = 1;
    expect(normalizePalaceSection(p, 1)).toBe(2); // sąsiad 3 ma poziom > 0
  });

  it('poziomy 1–4, ogrody do 3; rozbudowa zapisuje styl', () => {
    const { s } = withCapital();
    const p = palaceOf(s);
    expect(palaceNewLevel(p, 4)).toBe(1);
    upgradePalace(s, 4, 1);
    expect(p.levels[4]).toBe(1);
    expect(p.types[4]).toBe(1);
    p.levels[4] = 4;
    expect(palaceSectionAccepted(p, 4)).toBe(false);
    expect(palaceNewLevel(p, 4)).toBe(4);
    p.levels[9] = 3;
    expect(palaceSectionAccepted(p, 9)).toBe(false);
    expect(palaceSectionAccepted(p, 10)).toBe(true);
    expect(palaceSectionAccepted(p, 0)).toBe(false);
    upgradePalace(s, 10);
    expect(p.levels[10]).toBe(1);
    expect(p.types[10]).toBe(0);
  });
});

describe('mini-pałac (F0_1238_14a3)', () => {
  it('człowiek: jego pałac; kawałki wg sąsiadów', () => {
    const { s } = withCapital();
    upgradePalace(s, 4, 0);
    upgradePalace(s, 3, 2);
    const m = miniPalace(s, s.humanPlayer, 0)!;
    expect(m.levels.slice(0, 9)).toEqual([-1, -1, -1, 1, 1, 0, -1, -1, -1]);
    expect(m.types[3]).toBe(2);
    expect(miniPalacePiece(m, 3)).toBe(0); // lewy skraj
    expect(miniPalacePiece(m, 4)).toBe(2);
    expect(miniPalacePiece(m, 5)).toBe(4); // prawy skraj
  });

  it('komputer: losowany deterministycznie (gracz · ziarno), poziomy ≤ min(3, rozbudowy/5), styl = gracz % 3', () => {
    const { s } = withCapital();
    const ai = [1, 2, 3, 4, 5, 6, 7].find((i) => i !== s.humanPlayer && s.players[i]!.cityCount > 0)
      ?? (() => { const i = s.humanPlayer === 1 ? 2 : 1; s.players[i]!.cityCount = 1; return i; })();
    const a = miniPalace(s, ai, 20)!;
    const b = miniPalace(s, ai, 20)!;
    expect(a).toEqual(b);
    expect(Math.max(...a.levels)).toBeLessThanOrEqual(Math.min(3, Math.trunc(23 / 5)));
    for (let i = 0; i < 9; i++) if (a.levels[i]! > 0) expect(a.types[i]).toBe(ai % 3);
    s.players[ai]!.cityCount = 0;
    expect(miniPalace(s, ai, 20)).toBeNull();
  });
});

describe('panorama miasta (F19_0000_0000)', () => {
  it('ziarno generatora z sumy znaków nazwy; ten sam rozkład za każdym razem', () => {
    const { s, city } = withCapital();
    const a = cityViewLayout(s, city);
    let sum = 0;
    for (const ch of cityName(s, city)) sum += ch.charCodeAt(0);
    s.rng.state = 12345;
    const b = cityViewLayout(s, city);
    expect(Array.from(a.cells)).toEqual(Array.from(b.cells));
    // po panoramie generator jest w stanie wynikającym z ziarna nazwy, nie z wcześniejszej gry
    s.rng.state = 999;
    cityViewLayout(s, city);
    const after = s.rng.state;
    s.rng.state = sum;
    cityViewLayout(s, city);
    expect(s.rng.state).toBe(after);
  });

  it('domy w okolicy (9, 11), dwie ulice poziome w wierszach 4–5 i 8–9', () => {
    const { s, city } = withCapital();
    s.cities[city]!.size = 6;
    const l = cityViewLayout(s, city);
    const houses = Array.from(l.cells).filter((v) => v >= 0 && v <= 9).length;
    expect(houses).toBeGreaterThan(0);
    expect(houses).toBeLessThanOrEqual(6 * 8);
    const streetRows = [...Array(12).keys()].filter((y) => [...Array(15).keys()].every((i) => cityViewCell(l, i + 2, y) === -2 || cityViewCell(l, i + 2, y) === 15 || cityViewCell(l, i + 2, y) >= 16));
    expect(streetRows.filter((y) => y === 4 || y === 5).length + streetRows.filter((y) => y === 8 || y === 9).length).toBeGreaterThanOrEqual(1);
  });

  it('budynki 14 + numer (bez murów, akweduktu, kom. miejskiej, elektrowni i hydro), cud 64 + numer, Wielki Mur w rogu', () => {
    const { s, city } = withCapital();
    const c = s.cities[city]!;
    c.size = 8;
    for (const b of [BuildingId.Temple, BuildingId.Library, BuildingId.CityWalls, BuildingId.Aqueduct, BuildingId.HydroPlant]) addBuilding(c, b);
    s.wonderCity[WonderId.Oracle] = city;
    s.wonderCity[WonderId.GreatWall] = city;
    const l = cityViewLayout(s, city);
    const values = new Set(Array.from(l.cells));
    expect(values.has(14 + BuildingId.Temple)).toBe(true);
    expect(values.has(14 + BuildingId.Library)).toBe(true);
    expect(values.has(14 + BuildingId.CityWalls)).toBe(false);
    expect(values.has(64 + WonderId.Oracle)).toBe(true);
    expect(values.has(64 + WonderId.GreatWall)).toBe(false); // w tle
    expect(cityViewCell(l, 0, 0)).toBe(15);
    expect(cityViewCell(l, 17, 7)).toBe(34); // hydroelektrownia
    const aqueduct = [...Array(12).keys()].find((y) => cityViewCell(l, 0, y) === 23)!;
    expect(aqueduct === 7 || aqueduct === 8).toBe(true); // wiersz nad dolną ulicą
    expect(cityViewCell(l, 1, aqueduct)).toBe(15);
    expect(cityViewCell(l, 2, aqueduct + 1)).toBe(15);
  });
});
