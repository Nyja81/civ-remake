import { describe, expect, it } from 'vitest';
import {
  addReplayData, advanceToHuman, base64ToBytes, bytesToBase64, chooseResearch, decodePicPixels, encodePicPixels, endHumanTurn,
  loadGame, loadSve, newGame, NO_UNIT, REPLAY_SIZE, replayEntries, ReplayKind, resumeLoadedGame, saveGame, saveMapPixels, saveSve,
  setGovernment, SVE_LAYOUT, SVE_SIZE, sveInfo, unitOrder, type GameState,
} from '../src';

/** Rozgrywa n tur, w których człowiek tylko pomija ruchy (jak w simulation.test.ts). */
function play(s: GameState, turns: number): void {
  const h = s.humanPlayer;
  for (let i = 0; i < turns && s.gameOver === 0; i++) {
    for (const e of s.events) {
      if (e.kind === 'chooseResearch') chooseResearch(s, (e.options as number[] | undefined)?.[0] ?? -1);
      if (e.kind === 'chooseGovernment') setGovernment(s, h, (e.options as number[])[0]!);
    }
    s.events.length = 0;
    s.players[h]!.units.forEach((u, id) => { if (u.type !== NO_UNIT) unitOrder(s, h, id, 'skip'); });
    endHumanTurn(s);
  }
}

let cached: GameState | null = null;
/** Gra po kilkudziesięciu turach (wspólna dla testów — symulacja trwa kilka sekund). */
function playedGame(): GameState {
  if (cached) return cached;
  const s = newGame({ seed: 4242, difficulty: 2, civilizations: 7, nation: 4 });
  advanceToHuman(s);
  unitOrder(s, s.humanPlayer, 0, 'build');
  play(s, 60);
  cached = s;
  return s;
}

const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

describe('format .SVE', () => {
  it('ma układ pól zapisu oryginału (37 856 bajtów)', () => {
    expect(SVE_SIZE).toBe(37856);
    expect(SVE_LAYOUT.leader).toBe(16);
    expect(SVE_LAYOUT.nation).toBe(128);
    expect(SVE_LAYOUT.cities).toBe(5384);
    expect(SVE_LAYOUT.units).toBe(9920);
    expect(SVE_LAYOUT.cityNames).toBe(26992);
    expect(SVE_LAYOUT.replayLength).toBe(30320);
    expect(SVE_LAYOUT.landPath).toBe(35494);
    expect(SVE_LAYOUT.identity).toBe(37854);
  });
});

describe('obraz .PIC (plik .MAP)', () => {
  it('koder i dekoder są zgodne: szum, długie serie, bajt 0x90, wielokrotny restart słownika LZW', () => {
    let seed = 1;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) >> 16);
    const pixels = new Uint8Array(320 * 200);
    for (let i = 0; i < pixels.length; i++) {
      const region = Math.floor(i / 8000);
      pixels[i] = region === 0 ? rand() & 0xff : region === 1 ? 0x90 : region === 2 ? (rand() % 3) + 0x8f : region === 3 ? i % 7 : 5;
    }
    const file = encodePicPixels(320, 200, pixels);
    const decoded = decodePicPixels(file);
    expect(decoded.width).toBe(320);
    expect(decoded.height).toBe(200);
    expect(same(decoded.pixels, pixels)).toBe(true);
    // obraz pusty i jednolity
    for (const fill of [0, 0x90, 255]) {
      const flat = new Uint8Array(320 * 200).fill(fill);
      expect(same(decodePicPixels(encodePicPixels(320, 200, flat)).pixels, flat)).toBe(true);
    }
  });
});

describe('zapis .SVE/.MAP', () => {
  it('zapis → odczyt → zapis daje te same bajty; stan po odczycie zgadza się z grą', () => {
    const s = playedGame();
    const first = saveSve(s);
    expect(first.sve.length).toBe(SVE_SIZE);
    const loaded = loadSve(first.sve, first.map);
    const second = saveSve(loaded);
    expect(same(second.sve, first.sve)).toBe(true);
    expect(same(second.map, first.map)).toBe(true);

    // pola gry
    expect(loaded.turn).toBe(s.turn);
    expect(loaded.year).toBe(s.year);
    expect(loaded.humanPlayer).toBe(s.humanPlayer);
    expect(loaded.currentPlayer).toBe(s.humanPlayer);
    expect(loaded.mapSeed).toBe(s.mapSeed);
    expect(loaded.activeCivs).toBe(s.activeCivs);
    expect(loaded.settings).toEqual(s.settings);
    expect(loaded.cities).toEqual(s.cities.map((c) => ({ ...c, originalOwner: c.owner })));
    expect(loaded.cityNames).toEqual(s.cityNames);
    expect(loaded.cityNameTaken).toEqual(s.cityNameTaken);
    expect(loaded.wonderCity).toEqual(s.wonderCity);
    expect(loaded.techFirstDiscoveredBy).toEqual(s.techFirstDiscoveredBy);
    expect(loaded.replay).toEqual(s.replay);
    expect(loaded.scoreGraph).toEqual(s.scoreGraph);
    expect(loaded.peaceGraph).toEqual(s.peaceGraph);
    for (let i = 1; i < 8; i++) {
      const a = loaded.players[i]!;
      const b = s.players[i]!;
      expect(a.units).toEqual(b.units);
      expect(a.techs).toEqual(b.techs);
      for (const k of ['leader', 'nationPlural', 'nationAdjective', 'gold', 'government', 'taxRate', 'scienceRate', 'researchProgress',
        'techCount', 'cityCount', 'unitCount', 'settlerCount', 'totalCitySize', 'militaryPower', 'ranking', 'score', 'contactCountdown',
        'xStart', 'nation', 'diplomacy', 'continents', 'continentPolicies', 'activeUnits', 'lostUnits', 'unitsDestroyed',
        'unitsInProduction', 'spaceship', 'spaceshipEta'] as const) {
        expect(a[k], `gracz ${i}: ${k}`).toEqual(b[k]);
      }
    }
    expect(loaded.players[s.humanPlayer]!.researching).toBe(s.players[s.humanPlayer]!.researching);
    // warstwy mapy (tablica ścieżek wody jest przeliczana przy odczycie — F7_0000_1440 widzi już wypełnione warstwy)
    for (const k of ['terrain', 'improvements', 'visibleImprovements', 'group', 'buildScore', 'landOwner', 'occupant', 'landPath'] as const) {
      expect(same(loaded.map[k], s.map[k]), k).toBe(true);
    }
    expect(Array.from(loaded.map.explored)).toEqual(Array.from(s.map.explored, (v) => v & 0xff));
    expect(loaded.map.continents.map((c) => c.size)).toEqual(s.map.continents.map((c) => c.size));
  });

  it('gra wczytana z .SVE toczy się dalej', () => {
    const s = playedGame();
    const { sve, map } = saveSve(s);
    const loaded = resumeLoadedGame(loadSve(sve, map));
    play(loaded, 10);
    expect(loaded.turn).toBe(s.turn + 10);
    const again = saveSve(loaded);
    expect(again.sve.length).toBe(SVE_SIZE);
  });

  it('pola, których silnik nie ma, wracają w ponownym zapisie bez zmian', () => {
    const s = playedGame();
    const { sve, map } = saveSve(s);
    const L = SVE_LAYOUT;
    const sveCopy = sve.slice();
    const pix = decodePicPixels(map).pixels.slice();
    // MapCellCount, pałac, TechnologyAcquiredFrom, druga część tablicy kontynentów, bity 72–79 technologii,
    // wyższe bity ustawień, RuleDebugFlags, śmieci za zerem w nazwie miasta, bajty wolnego miejsca jednostki
    sveCopy[L.mapCellCount + 2] = 77;
    sveCopy[L.palaceLevels + 3] = 5;
    sveCopy[L.techFrom + 100] = 3;
    sveCopy[L.continentSize + 40] = 9;
    sveCopy[L.techFlags + 2 * 5 * 2 + 9] = sveCopy[L.techFlags + 2 * 5 * 2 + 9]! | 0x80;
    sveCopy[L.settings + 1] = 0x01;
    sveCopy[L.ruleDebug] = 0x05;
    const nameAt = L.cityNames + 200 * 13;
    const nameLength = s.cityNames[200]!.length;
    if (nameLength < 11) sveCopy[nameAt + nameLength + 1] = 0x41;
    const freeUnit = s.players[0]!.units.findIndex((u) => u.type === NO_UNIT);
    sveCopy[L.units + freeUnit * 12 + 5] = 0x33;
    // nieużywane obszary obrazu mapy i minimapa
    pix[60 * 320 + 200] = 7;
    pix[150 * 320 + 250] = 9;
    pix[10 * 320 + 245] = 2;
    const mapCopy = encodePicPixels(320, 200, pix);

    const loaded = loadSve(sveCopy, mapCopy);
    const again = saveSve(loaded);
    expect(same(again.sve, sveCopy)).toBe(true);
    expect(same(decodePicPixels(again.map).pixels, pix)).toBe(true);
    // zmiana w silniku trafia do pliku, reszta zostaje
    loaded.players[1]!.gold = 1234;
    const changed = saveSve(loaded).sve;
    expect(changed[L.gold + 2]! | (changed[L.gold + 3]! << 8)).toBe(1234);
    expect(changed[L.mapCellCount + 2]).toBe(77);
  });

  it('JSON zachowuje wzorzec .SVE i powtórkę; nagłówek do listy zapisów', () => {
    const s = playedGame();
    const { sve, map } = saveSve(s);
    const loaded = loadSve(sve, map);
    const viaJson = loadGame(saveGame(loaded));
    expect(viaJson.sveExtra).toEqual(loaded.sveExtra);
    expect(same(saveSve(viaJson).sve, sve)).toBe(true);
    const info = sveInfo(sve);
    expect(info).toMatchObject({ turn: s.turn, year: s.year, difficulty: 2, humanPlayer: s.humanPlayer, leader: s.players[s.humanPlayer]!.leader });
    expect(same(base64ToBytes(bytesToBase64(sve)), sve)).toBe(true);
    // minimapa: pola odkryte przez człowieka mają 1 (woda) albo 2 (ląd)
    const pix = saveMapPixels(s, null);
    const h = 1 << s.humanPlayer;
    for (let i = 0; i < 4000; i++) {
      const v = pix[Math.floor(i / 80) * 320 + 240 + (i % 80)]!;
      expect(v).toBe(s.map.explored[i]! & h ? (s.map.terrain[i] === 10 ? 1 : 2) : 0);
    }
  });
});

describe('powtórka gry (Replay)', () => {
  it('silnik zapisuje założenia miast, odkrycia, pierwsze jednostki i stan co 50 tur', () => {
    const s = playedGame();
    const entries = replayEntries(s);
    const kinds = new Set(entries.map((e) => e.kind));
    expect(kinds.has(ReplayKind.CityFounded)).toBe(true);
    expect(kinds.has(ReplayKind.TechDiscovered)).toBe(true);
    expect(kinds.has(ReplayKind.FirstUnit)).toBe(true);
    expect(kinds.has(ReplayKind.HumanStatus)).toBe(true);
    expect(kinds.has(ReplayKind.Ranking)).toBe(true);
    // wpisy są w kolejności tur, a założenie miasta ma prawdziwe położenie i nazwę
    for (let i = 1; i < entries.length; i++) expect(entries[i]!.turn).toBeGreaterThanOrEqual(entries[i - 1]!.turn);
    const founded = entries.find((e) => e.kind === ReplayKind.CityFounded && e.data[0] !== 0xff)!;
    const city = s.cities.find((c) => c.nameId === founded.data[1]);
    if (city && city.status !== -1) expect([city.x, city.y]).toEqual([founded.data[2], founded.data[3]]);
    const status = entries.find((e) => e.kind === ReplayKind.HumanStatus)!;
    expect(status.turn).toBe(50);
  });

  it('bufor 4096 bajtów: wpis, który się nie mieści, jest pomijany', () => {
    const s = newGame({ seed: 7, difficulty: 0, civilizations: 3, nation: 1 });
    s.replay = [];
    s.turn = 0x123;
    addReplayData(s, ReplayKind.TechDiscovered, 2, 40);
    expect(s.replay).toEqual([0x51, 0x23, 2, 40]);
    expect(replayEntries(s)).toEqual([{ kind: 5, turn: 0x123, data: [2, 40] }]);
    while (s.replay.length + 6 < REPLAY_SIZE) addReplayData(s, ReplayKind.Ranking, 1, 2, 3, 4);
    const length = s.replay.length;
    addReplayData(s, ReplayKind.Ranking, 1, 2, 3, 4);
    expect(s.replay.length).toBe(length);
    expect(length).toBeLessThan(REPLAY_SIZE);
  });
});
