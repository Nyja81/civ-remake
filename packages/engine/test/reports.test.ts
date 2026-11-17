import { describe, expect, it } from 'vitest';
import {
  addBuilding, advanceToHuman, attitudeReport, BuildingId, cityStatusReport, createUnit, deleteUnit, demographicsReport, Diplomacy,
  endHumanTurn, foundCity, intelligenceDetail, intelligenceReport, militaryLossesReport, militaryReport, newGame, NO_UNIT,
  playerHistoryReport, playerPopulation, powerGraph, rankPlayers, scienceReport, Tech, topFiveCities, tradeReport, unitOrder,
  wondersOfTheWorld, worldMapReport, type GameState,
} from '../src';

/** Gra po założeniu stolicy przez człowieka. */
function start(seed = 41, difficulty = 2): { s: GameState; city: number } {
  const s = newGame({ seed, difficulty, civilizations: 5, nation: 1 });
  advanceToHuman(s);
  unitOrder(s, s.humanPlayer, 0, 'build');
  const city = s.cities.findIndex((c) => c.status !== -1 && c.owner === s.humanPlayer);
  return { s, city };
}

describe('raporty doradców', () => {
  it('City Status: miasta gracza z produkcją i kosztem ×10', () => {
    const { s, city } = start();
    const lines = cityStatusReport(s, s.humanPlayer);
    expect(lines.map((l) => l.cityId)).toEqual([city]);
    const l = lines[0]!;
    expect(l.size).toBe(s.cities[city]!.size);
    expect(l.food).toBeGreaterThan(0);
    s.cities[city]!.production = -BuildingId.Temple;
    expect(cityStatusReport(s, s.humanPlayer)[0]!.cost).toBe(40);
  });

  it('Military: aktywne i budowane typy; straty wszystkich graczy', () => {
    const { s, city } = start();
    const h = s.humanPlayer;
    const c = s.cities[city]!;
    createUnit(s, h, 1, c.x, c.y);
    const rows = militaryReport(s, h);
    expect(rows.find((r) => r.type === 1)?.active).toBe(1);
    const lostBefore = militaryLossesReport(s);
    const id = createUnit(s, h, 2, c.x, c.y);
    deleteUnit(s, h, id, true);
    const lost = militaryLossesReport(s);
    expect(lost.length).toBe(lostBefore.length + (lostBefore.some((r) => r.type === 2) ? 0 : 1));
    expect(lost.find((r) => r.type === 2)!.lost[h]).toBeGreaterThanOrEqual(1);
  });

  it('Trade: podatki miast, utrzymanie budynków (koszary — liczba z dopłaty), czas odkrycia', () => {
    const { s, city } = start(41, 2);
    const c = s.cities[city]!;
    addBuilding(c, BuildingId.Temple);
    addBuilding(c, BuildingId.Barracks);
    const r = tradeReport(s, s.humanPlayer);
    expect(r.cities.length).toBe(1);
    expect(r.totalIncome).toBe(r.cities[0]!.tax);
    const temple = r.maintenance.find((m) => m.building === BuildingId.Temple)!;
    expect(temple).toEqual({ building: BuildingId.Temple, count: 1, cost: 1 });
    // poziom 2: dopłata 1 (poziom/2), koszary bez własnego utrzymania
    expect(r.maintenance.find((m) => m.building === BuildingId.Barracks)).toEqual({ building: BuildingId.Barracks, count: 1, cost: 1 });
    expect(r.totalCost).toBe(2);
    if (r.cities[0]!.science > 0) expect(r.discoveryTurns).not.toBeNull();
  });

  it('Science: koszt odkrycia, pasek postępu i lista odkryć w kolejności numerów', () => {
    const { s } = start(41, 2);
    const p = s.players[s.humanPlayer]!;
    p.techs.fill(false); // bez technologii z wyrównania startu (F5_0000_0fe6)
    p.techs[Tech.Alphabet] = true;
    p.techs[Tech.BronzeWorking] = true;
    p.techCount = 2;
    p.researchProgress = 5;
    s.techFirstDiscoveredBy[Tech.Alphabet] = s.humanPlayer;
    const r = scienceReport(s, s.humanPlayer);
    // 2 odkrycia · 1 (przed naszą erą) · max(2·2 + 0 + 6, 11 − 2) = 20
    expect(r.cost).toBe(20);
    expect(r.spacing).toBe(64);
    expect(r.width).toBe(168);
    expect(r.x).toBe(76);
    expect(r.progress).toBe(5);
    expect(r.techs).toEqual([{ tech: Tech.Alphabet, own: true }, { tech: Tech.BronzeWorking, own: false }].sort((a, b) => a.tech - b.tech));
  });

  it('Attitude: procenty mieszkańców i budynki zadowolenia', () => {
    const { s, city } = start();
    addBuilding(s.cities[city]!, BuildingId.Temple);
    addBuilding(s.cities[city]!, BuildingId.Granary);
    const r = attitudeReport(s, s.humanPlayer);
    expect(r.cities[0]!.buildings).toEqual([BuildingId.Temple]);
    expect(r.happyPercent + r.contentPercent + r.unhappyPercent).toBeLessThanOrEqual(100);
    expect(r.population).toBe(playerPopulation(s, s.humanPlayer));
  });

  it('Intelligence: bez ambasady tylko nazwa; z ambasadą stosunki i szczegóły', () => {
    const { s } = start();
    const h = s.humanPlayer;
    const other = [1, 2, 3, 4, 5, 6, 7].find((i) => i !== h && s.activeCivs & (1 << i))!;
    expect(intelligenceReport(s).find((e) => e.player === other)!.known).toBe(false);
    s.players[h]!.diplomacy[other]! |= Diplomacy.Embassy;
    s.players[other]!.diplomacy[h]! |= Diplomacy.Contact;
    const e = intelligenceReport(s).find((x) => x.player === other)!;
    expect(e.known).toBe(true);
    expect(e.relations).toContainEqual({ player: h, status: 'war' });
    const d = intelligenceDetail(s, other);
    expect(d.relations).toContainEqual({ player: h, peace: false, war: true });
    expect(d.capital).toBe(-1);
  });
});

describe('raporty świata', () => {
  it('Top 5 Cities: wielkość + zadowolenie, +10 za cud; remis — wcześniejsze miasto', () => {
    const { s, city } = start();
    const h = s.humanPlayer;
    const c = s.cities[city]!;
    const second = foundCity(s, h, c.x + 6, c.y, 1);
    expect(second).not.toBe(-1);
    let top = topFiveCities(s);
    expect(top.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < top.length; i++) expect(top[i - 1]!.score).toBeGreaterThanOrEqual(top[i]!.score);
    s.wonderCity[1] = second;
    top = topFiveCities(s);
    expect(top[0]!.cityId).toBe(second);
    expect(top[0]!.wonders).toEqual([1]);
  });

  it('Wonders of the World: zbudowane i zniszczone', () => {
    const { s, city } = start();
    s.wonderCity[3] = city;
    s.wonderCity[5] = 128;
    expect(wondersOfTheWorld(s)).toEqual([
      { wonder: 3, cityId: city, owner: s.humanPlayer, destroyed: false },
      { wonder: 5, cityId: 128, owner: 0, destroyed: true },
    ]);
  });

  it('Demographics: 13 wierszy, miejsca 1–7, ludność jak GetPlayerPopulationCount', () => {
    const { s } = start();
    const rows = demographicsReport(s, s.humanPlayer);
    expect(rows.map((r) => r.key)).toEqual([
      'approval', 'population', 'gnp', 'goods', 'land', 'literacy', 'disease', 'pollution', 'lifeExpectancy', 'familySize',
      'military', 'income', 'productivity',
    ]);
    for (const r of rows) {
      expect(r.rank).toBeGreaterThanOrEqual(1);
      expect(r.rank).toBeLessThanOrEqual(7);
      expect(r.leader).toBe(-1); // brak ambasad
    }
    const value = (k: string) => rows.find((r) => r.key === k)!.value;
    expect(value('population')).toBe(playerPopulation(s, s.humanPlayer));
    expect(value('literacy')).toBeLessThanOrEqual(100);
    expect(value('lifeExpectancy')).toBeGreaterThanOrEqual(20);
    expect(value('lifeExpectancy')).toBeLessThanOrEqual(99);
    expect(value('land')).toBeGreaterThan(0);
  });

  it('World Map: tylko odkryte pola, miasto człowieka oznaczone jego kolorem', () => {
    const { s, city } = start();
    const cells = worldMapReport(s);
    const c = s.cities[city]!;
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.length).toBeLessThan(80 * 50);
    expect(cells.find((x) => x.x === c.x && x.y === c.y)?.marker).toEqual({ kind: 'city', player: s.humanPlayer });
    expect(worldMapReport(s, true).length).toBe(80 * 50);
  });

  it('raport historyka: dwa losowania generatora, ranking od najlepszego, punkty historii', () => {
    const { s } = start();
    for (let i = 1; i < 8; i++) s.players[i]!.gold = i * 10;
    let draws = 0;
    const next = s.rng.next.bind(s.rng);
    s.rng.next = (n: number) => {
      draws++;
      return n === 5 ? 0 : next(n); // „Wealthiest”
    };
    const r = playerHistoryReport(s);
    expect(draws).toBe(2);
    expect(r.type).toBe(0);
    const golds = r.entries.map((e) => s.players[e.player]!.gold);
    expect(golds).toEqual([...golds].sort((a, b) => b - a));
    expect(r.entries.find((e) => e.player === s.humanPlayer)!.shown).toBe(true);
    expect(s.historyScores![r.entries[0]!.player]).toBe(7);
    expect(s.historyScores![0]).toBe(1);
  });

  it('wykres potęgi: RankPlayers zapisuje wartości co 4 tury', () => {
    const { s } = start();
    s.turn = 8;
    rankPlayers(s);
    s.turn = 12;
    const g = powerGraph(s);
    expect(g.series.length).toBeGreaterThan(0);
    expect(g.series[0]!.values.length).toBe(3);
    expect(g.marks).toEqual([{ turn: 0, label: true }]);
    expect(g.maximum).toBeGreaterThanOrEqual(50);
    expect(s.scoreGraph![2 * 8 + s.humanPlayer]).toBeGreaterThanOrEqual(0);
  });

  it('koniec tury zgłasza raport historyka z danymi', () => {
    const { s } = start();
    s.nextHistoryTurn = s.turn + 1;
    for (const [id, u] of s.players[s.humanPlayer]!.units.entries()) if (u.type !== NO_UNIT) unitOrder(s, s.humanPlayer, id, 'sentry');
    s.events.length = 0;
    endHumanTurn(s);
    const ev = s.events.find((e) => e.kind === 'historyReport');
    expect(ev?.report).toBeDefined();
  });
});
