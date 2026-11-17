/** Karawany, dyplomaci (człowiek i komputer), przekupienie, bunt, odległość oryginału, powrót samolotu. */
import { describe, expect, it } from 'vitest';
import {
  addBuilding, BuildingId, removeBuilding, bribeCost, caravanArrives, cellIndex, CityStatus, createUnit, deleteUnit, Diplomacy, diplomatAction,
  diplomatMenu, distance, distanceDoubled, distanceOf, foundCity, Government, Improvement, inciteCityRevolt, minimumDistanceFromPalace,
  aiUnitCommand, moveUnit, nearestCityDirection, newGame, NO_UNIT, processCity, Tech, Terrain, unitsAt, type GameState,
} from '../src';

/** Płaski ląd (łąka, kontynent 1) w pasie y 5–44, bez jednostek, chat i miast; człowiek i jeden komputer w kontakcie. */
function world(seed = 3): { s: GameState; h: number; ai: number; ai2: number } {
  const s = newGame({ seed, difficulty: 1, civilizations: 4, nation: 1 });
  const h = s.humanPlayer;
  const [ai, ai2] = [1, 2, 3, 4].filter((p) => p !== h) as [number, number];
  s.players.forEach((pl, p) => pl.units.forEach((u, i) => { if (u.type !== NO_UNIT) deleteUnit(s, p, i); }));
  for (let y = 0; y < 50; y++) {
    for (let x = 0; x < 80; x++) {
      const i = cellIndex(x, y);
      const land = y >= 5 && y < 45;
      s.map.terrain[i] = land ? Terrain.Grassland : Terrain.Water;
      s.map.group[i] = land ? 1 : 2;
      s.map.improvements[i] = 0;
      s.map.visibleImprovements[i] = 0;
      s.map.occupant[i] = 0;
      s.map.landOwner[i] = 0;
      s.map.explored[i] = 0xffff; // bit 0 — chaty odwiedzone
    }
  }
  s.turn = 30;
  for (const p of [h, ai, ai2]) {
    const pl = s.players[p]!;
    pl.techs.fill(false);
    pl.techCount = 0;
    pl.diplomacy.fill(0);
    pl.gold = 0;
    pl.government = Government.Despotism;
  }
  for (const [a, b] of [[h, ai], [h, ai2], [ai, ai2]] as const) {
    s.players[a]!.diplomacy[b] = Diplomacy.Contact;
    s.players[b]!.diplomacy[a] = Diplomacy.Contact;
  }
  s.events.length = 0;
  return { s, h, ai, ai2 };
}

const messages = (s: GameState) => s.events.filter((e) => e.kind === 'message').map((e) => e.text as string);

/** Podstawia kolejne wyniki losowań (rng.next(n)) — do sprawdzania gałęzi zależnych od losu. */
function scriptRng(s: GameState, values: number[]): void {
  const rng = s.rng as unknown as { next: (n: number) => number };
  const original = rng.next.bind(rng);
  rng.next = (n: number) => (values.length > 0 ? values.shift()! : original(n));
}

describe('odległość oryginału (F0_2dc4_0289 / 0208 / 0243)', () => {
  it('dłuższa różnica + połowa krótszej, z zawijaniem X; 0208 bez zawijania; 0243 = 2·dłuższa + krótsza', () => {
    expect(distance(0, 0, 3, 1)).toBe(3);
    expect(distance(0, 0, 3, 2)).toBe(4);
    expect(distance(0, 0, 2, 2)).toBe(3);
    expect(distance(10, 10, 10, 15)).toBe(5);
    expect(distance(79, 3, 1, 4)).toBe(2); // przez szew mapy: |Δx| = 78 → 2
    expect(distance(0, 0, 41, 0)).toBe(39);
    expect(distanceOf(-3, 2)).toBe(4);
    expect(distanceOf(78, 0)).toBe(78); // bez zawijania
    expect(distanceDoubled(3, -1)).toBe(7);
    expect(distanceDoubled(79, 0)).toBe(2);
  });

  it('odległość od pałacu (F0_2517_0d97): najwyżej 16', () => {
    const { s, ai } = world();
    const c = foundCity(s, ai, 20, 20, 3); // pierwsze miasto dostaje pałac
    expect(minimumDistanceFromPalace(s, ai, 30, 24)).toBe(12);
    removeBuilding(s.cities[c]!, BuildingId.Palace);
    expect(minimumDistanceFromPalace(s, ai, 30, 20)).toBe(16);
  });
});

describe('karawana (F0_2459_0948, MoveUnit)', () => {
  it('obce miasto: przychód jednorazowy, szlak handlowy, komunikat; karawana znika', () => {
    const { s, h, ai } = world();
    const home = foundCity(s, h, 20, 20, 5);
    const dest = foundCity(s, ai, 30, 20, 5);
    s.cities[home]!.baseTrade = 10;
    s.cities[dest]!.baseTrade = 14;
    const u = createUnit(s, h, 27, 29, 20);
    s.players[h]!.units[u]!.homeCity = home;
    s.events.length = 0;
    const r = moveUnit(s, h, u, 3);
    expect(r).toEqual({ kind: 'action', action: 'caravan' });
    // (10 + 10) · 24 / 24 = 20; ten sam kontynent (odczyt grupy (20, 20)) → 10
    expect(s.players[h]!.gold).toBe(10);
    expect(s.players[h]!.researchProgress).toBe(10);
    expect(s.cities[home]!.tradeRoutes).toEqual([dest, -1, -1]);
    expect(s.players[h]!.units[u]!.type).toBe(NO_UNIT);
    expect(messages(s)[0]).toMatch(/caravan from .*\narrives in .*\nTrade route established\nRevenue: \$10\.\n/);
  });

  it('kontynent miasta macierzystego czytany jako (x, x): dla x ≥ 50 poza warstwą — bez połowy; kolej i lotnictwo celu −1/3', () => {
    const { s, h, ai } = world();
    const home = foundCity(s, h, 60, 20, 5);
    const dest = foundCity(s, ai, 70, 20, 5);
    s.cities[home]!.baseTrade = 10;
    s.cities[dest]!.baseTrade = 14;
    s.players[ai]!.techs[Tech.RailRoad] = true;
    const u = createUnit(s, h, 27, 69, 20);
    s.players[h]!.units[u]!.homeCity = home;
    caravanArrives(s, h, u, dest);
    expect(s.players[h]!.gold).toBe(20 - Math.trunc(20 / 3));
  });

  it('szlak zastępuje najsłabszy; istniejący szlak do tego miasta się nie dubluje', () => {
    const { s, h, ai } = world();
    const home = foundCity(s, h, 20, 20, 5);
    const a = foundCity(s, h, 24, 20, 3);
    const b = foundCity(s, ai, 30, 20, 3);
    const c = foundCity(s, ai, 36, 20, 3);
    const d = foundCity(s, ai, 42, 20, 3);
    for (const [id, t] of [[a, 2], [b, 5], [c, 1], [d, 9]] as const) s.cities[id]!.baseTrade = t;
    s.cities[home]!.tradeRoutes = [a, b, c];
    const u1 = createUnit(s, h, 27, 41, 20);
    s.players[h]!.units[u1]!.homeCity = home;
    caravanArrives(s, h, u1, d); // waga: a 2, b 10, c 2 (obce ×2), d 18 → zastępuje a (pierwszy najmniejszy)
    expect(s.cities[home]!.tradeRoutes).toEqual([d, b, c]);
    const u2 = createUnit(s, h, 27, 29, 20);
    s.players[h]!.units[u2]!.homeCity = home;
    caravanArrives(s, h, u2, b);
    expect(s.cities[home]!.tradeRoutes).toEqual([d, b, c]);
  });

  it('własne miasto budujące cud: pytanie „Will you?” z Help build WONDER; szlak nieaktywny przy odległości < 10', () => {
    const { s, h } = world();
    const home = foundCity(s, h, 20, 20, 5);
    const city = foundCity(s, h, 26, 20, 5);
    s.cities[city]!.production = -26; // cud 2
    s.cities[city]!.shields = 7;
    const u = createUnit(s, h, 27, 25, 20);
    s.players[h]!.units[u]!.homeCity = home;
    const q = moveUnit(s, h, u, 3);
    expect(q).toEqual({ kind: 'caravan', city, question: 'Will you?\n Keep moving\n Establish trade route\n Help build WONDER.\n', disabled: 2 });
    expect(moveUnit(s, h, u, 3, { caravan: 2 })).toEqual({ kind: 'action', action: 'wonder' });
    expect(s.cities[city]!.shields).toBe(57);
    expect(s.players[h]!.units[u]!.type).toBe(NO_UNIT);
  });

  it('własne miasto blisko, bez cudu — zwykły ruch; daleko — pytanie, „Keep moving” wchodzi do miasta', () => {
    const { s, h } = world();
    const home = foundCity(s, h, 20, 20, 5);
    const near = foundCity(s, h, 24, 20, 3);
    const far = foundCity(s, h, 40, 20, 3);
    const u = createUnit(s, h, 27, 23, 20);
    s.players[h]!.units[u]!.homeCity = home;
    s.players[h]!.units[u]!.movesLeft = 3;
    expect(moveUnit(s, h, u, 3).kind).toBe('moved');
    expect(s.players[h]!.units[u]!.x).toBe(24);
    const v = createUnit(s, h, 27, 39, 20);
    s.players[h]!.units[v]!.homeCity = home;
    s.players[h]!.units[v]!.movesLeft = 3;
    const q = moveUnit(s, h, v, 3);
    expect(q).toMatchObject({ kind: 'caravan', city: far, disabled: 0 });
    expect(moveUnit(s, h, v, 3, { caravan: 0 }).kind).toBe('moved');
    expect(s.players[h]!.units[v]!.x).toBe(40);
    expect(near).toBeGreaterThanOrEqual(0);
  });

  it('komputer: zbudowana karawana od razu zakłada szlak z obcym miastem komputera o największym handlu', () => {
    const { s, h, ai, ai2 } = world();
    const city = foundCity(s, ai, 20, 20, 4);
    const rich = foundCity(s, ai2, 40, 20, 3);
    const poor = foundCity(s, ai2, 50, 20, 3);
    const human = foundCity(s, h, 30, 30, 3);
    s.cities[rich]!.baseTrade = 12;
    s.cities[poor]!.baseTrade = 2;
    s.cities[human]!.baseTrade = 30;
    s.cities[city]!.production = 27;
    s.cities[city]!.shields = 200;
    processCity(s, city, 0);
    expect(s.cities[city]!.tradeRoutes[0]).toBe(rich);
    expect(s.players[ai]!.units.some((u) => u.type === 27)).toBe(false);
    expect(s.players[ai]!.gold).toBeGreaterThan(0);
  });
});

describe('dyplomata człowieka (F22_0000_0000)', () => {
  function diplomatAt(s: GameState, p: number, x: number, y: number): number {
    return createUnit(s, p, 26, x, y);
  }

  it('wejście do obcego miasta zwraca menu; maska: ambasada (1), okradzione (4), pałac (0x10)', () => {
    const { s, h, ai } = world();
    foundCity(s, ai, 10, 20, 4); // stolica z pałacem
    const city = foundCity(s, ai, 30, 20, 4);
    const d = diplomatAt(s, h, 29, 20);
    let r = moveUnit(s, h, d, 3);
    expect(r).toMatchObject({ kind: 'diplomat', city, disabled: 0 });
    expect(r.kind === 'diplomat' && r.question).toBe(`${s.players[h]!.nationAdjective} diplomat arrives\nin ${s.cityNames[s.cities[city]!.nameId]}...\n` +
      ' Establish Embassy\n Investigate City\n Steal Technology\n Industrial Sabotage\n Incite a Revolt\n Meet with King\n');
    s.players[h]!.diplomacy[ai]! |= Diplomacy.Embassy;
    s.cities[city]!.status |= CityStatus.TechStolen;
    addBuilding(s.cities[city]!, BuildingId.Palace);
    expect(diplomatMenu(s, h, city).disabled).toBe(0x15);
    r = moveUnit(s, h, d, 3);
    expect(s.players[h]!.units[d]!.x).toBe(29); // dyplomata nie wchodzi do miasta
  });

  it('ambasada: flaga u człowieka, dyplomata znika, raport wywiadu', () => {
    const { s, h, ai } = world();
    const city = foundCity(s, ai, 30, 20, 4);
    const d = diplomatAt(s, h, 29, 20);
    expect(diplomatAction(s, h, d, city, 0)).toEqual({ kind: 'embassy', target: ai });
    expect(s.players[h]!.diplomacy[ai]! & Diplomacy.Embassy).toBeTruthy();
    expect(s.players[h]!.units[d]!.type).toBe(NO_UNIT);
  });

  it('obejrzenie miasta: okno miasta, dyplomata znika', () => {
    const { s, h, ai } = world();
    const city = foundCity(s, ai, 30, 20, 4);
    const d = diplomatAt(s, h, 29, 20);
    expect(diplomatAction(s, h, d, city, 1)).toEqual({ kind: 'investigate', city });
    expect(s.players[h]!.units[d]!.type).toBe(NO_UNIT);
  });

  it('kradzież technologii: przy pokoju pytanie o traktat; potem technologia, znacznik miasta i koniec pokoju', () => {
    const { s, h, ai } = world();
    const city = foundCity(s, ai, 30, 20, 4);
    s.players[ai]!.techs[Tech.Flight] = true;
    s.players[h]!.diplomacy[ai]! |= Diplomacy.Peace;
    s.players[ai]!.diplomacy[h]! |= Diplomacy.Peace;
    const d = diplomatAt(s, h, 29, 20);
    const q = diplomatAction(s, h, d, city, 2);
    expect(q.kind).toBe('confirm');
    expect(diplomatAction(s, h, d, city, 2, { confirm: true })).toEqual({ kind: 'done' });
    expect(s.players[h]!.techs[Tech.Flight]).toBe(true);
    expect(s.cities[city]!.status & CityStatus.TechStolen).toBeTruthy();
    expect(s.players[h]!.diplomacy[ai]! & Diplomacy.Peace).toBe(0);
    expect(s.players[ai]!.diplomacy[h]! & Diplomacy.Peace).toBe(0);
    expect(messages(s)).toContain(`${s.players[h]!.nationPlural} steal\nFlight.\n`);
    expect(s.players[h]!.units[d]!.type).toBe(NO_UNIT);
    // drugi dyplomata: miasto już okradzione — nic się nie dzieje
    const d2 = diplomatAt(s, h, 29, 20);
    expect(diplomatAction(s, h, d2, city, 2)).toEqual({ kind: 'done' });
    expect(s.players[h]!.units[d2]!.type).toBe(26);
  });

  it('brak nowej technologii: komunikat, dyplomata zostaje', () => {
    const { s, h, ai } = world();
    const city = foundCity(s, ai, 30, 20, 4);
    const d = diplomatAt(s, h, 29, 20);
    diplomatAction(s, h, d, city, 2);
    expect(messages(s)).toContain('No new technology found.\n');
    expect(s.players[h]!.units[d]!.type).toBe(26);
  });

  it('sabotaż: Next(2) = 0 przy pełnym magazynie — utrata produkcji', () => {
    const { s, h, ai } = world();
    const city = foundCity(s, ai, 30, 20, 4);
    s.cities[city]!.shields = 40;
    s.cities[city]!.production = 2; // Phalanx
    const d = diplomatAt(s, h, 29, 20);
    scriptRng(s, [0]);
    diplomatAction(s, h, d, city, 3);
    expect(s.cities[city]!.shields).toBe(0);
    expect(messages(s)).toContain(`Phalanx production sabotaged\nin ${s.cityNames[s.cities[city]!.nameId]}.\n`);
    expect(s.players[h]!.units[d]!.type).toBe(NO_UNIT);
  });

  it('sabotaż budynku: losowanie Next(24); r = 15 kasuje naraz budynki 16–24 (maska 16-bitowa z CWD)', () => {
    const { s, h, ai } = world();
    const city = foundCity(s, ai, 30, 20, 4);
    const c = s.cities[city]!;
    addBuilding(c, BuildingId.Temple);
    addBuilding(c, BuildingId.SdiDefense);
    addBuilding(c, BuildingId.PowerPlant);
    const d = diplomatAt(s, h, 29, 20);
    scriptRng(s, [1, 0, 16, 15]); // Next(2) = 1 → losowanie budynku; 0 pomijane, 16 nie trafia, 15 — budynki 16–24
    diplomatAction(s, h, d, city, 3);
    const palace = 1 << (BuildingId.Palace - 1); // pierwsze miasto komputera; r = 0 (pałac) jest pomijane
    expect(c.buildings).toBe(palace | (1 << (BuildingId.Temple - 1)));
    expect(messages(s)[0]).toMatch(/^Mfg\. Plant destroyed\nin /);
    const d2 = diplomatAt(s, h, 29, 20);
    scriptRng(s, [1, 3]);
    diplomatAction(s, h, d2, city, 3);
    expect(c.buildings).toBe(palace);
    expect(messages(s)[1]).toMatch(/^Temple destroyed\n/);
  });

  it('bunt: koszt ((złoto + 1000) / (odległość od pałacu + 3)) · wielkość; miasto i jednostki obok przechodzą do człowieka', () => {
    const { s, h, ai } = world();
    const capital = foundCity(s, ai, 20, 20, 6);
    addBuilding(s.cities[capital]!, BuildingId.Palace);
    const city = foundCity(s, ai, 30, 20, 4);
    s.players[ai]!.gold = 300;
    s.players[h]!.gold = 2000;
    const guard = createUnit(s, ai, 2, 30, 20);
    const outside = createUnit(s, ai, 1, 31, 21);
    const d = diplomatAt(s, h, 29, 20);
    const cost = Math.trunc(1300 / (10 + 3)) * 4; // odległość 10 → 400
    const q = diplomatAction(s, h, d, city, 4);
    expect(q).toEqual({ kind: 'revolt', cost, question: `Dissidents in ${s.cityNames[s.cities[city]!.nameId]}\nwill revolt for $${cost}.\n Forget it.\n Incite revolt\n` });
    expect(diplomatAction(s, h, d, city, 4, { revolt: 1 })).toEqual({ kind: 'done' });
    expect(s.cities[city]!.owner).toBe(h);
    expect(s.players[h]!.gold).toBe(2000 - cost + 300); // + złoto zrabowane przy przejęciu (CityTakeover)
    expect(s.players[ai]!.units[guard]!.type).toBe(NO_UNIT);
    expect(s.players[ai]!.units[outside]!.type).toBe(NO_UNIT);
    const taken = unitsAt(s, h, 30, 20).map((i) => s.players[h]!.units[i]!).filter((u) => u.type === 2);
    expect(taken).toHaveLength(1);
    expect(taken[0]!.homeCity).toBe(city);
    expect(unitsAt(s, h, 31, 21)).toHaveLength(1);
    expect(s.cities[city]!.size).toBe(3); // CityTakeover z flagą: bez niszczenia budynków, miasto maleje o 1
    expect(messages(s).some((m) => m.includes('rebel!\nCivil War in\n'))).toBe(true);
  });

  it('bunt przy pokoju: „Subvert city ($x2)” bez zrywania pokoju; „Incite revolt” zrywa pokój i daje vendetę; stolicy nie można', () => {
    const { s, h, ai } = world();
    const capital = foundCity(s, ai, 20, 20, 6);
    addBuilding(s.cities[capital]!, BuildingId.Palace);
    const city = foundCity(s, ai, 26, 20, 2);
    s.players[h]!.diplomacy[ai]! |= Diplomacy.Peace;
    s.players[ai]!.diplomacy[h]! |= Diplomacy.Peace;
    s.players[h]!.gold = 5000;
    const d = diplomatAt(s, h, 27, 20);
    const q = diplomatAction(s, h, d, city, 4);
    expect(q.kind === 'revolt' && q.question.endsWith(' Subvert city ($x2)\n')).toBe(true);
    const cost = q.kind === 'revolt' ? q.cost : 0;
    diplomatAction(s, h, d, city, 4, { revolt: 2 });
    expect(s.players[h]!.gold).toBe(5000 - cost * 2);
    expect(s.players[ai]!.diplomacy[h]! & Diplomacy.Peace).toBeTruthy();
    const d2 = diplomatAt(s, h, 21, 20);
    expect(diplomatAction(s, h, d2, capital, 4)).toEqual({ kind: 'done' }); // odległość od pałacu 0
    expect(s.players[h]!.units[d2]!.type).toBe(26);
  });

  it('rozmowa z władcą: wizyta (MeetWithKing z param4 = 1), dyplomata bez ruchu', () => {
    const { s, h, ai } = world();
    const city = foundCity(s, ai, 30, 20, 4);
    const d = diplomatAt(s, h, 29, 20);
    const r = diplomatAction(s, h, d, city, 5);
    expect(r.kind).toBe('meeting');
    expect(s.players[h]!.units[d]!.movesLeft).toBe(0);
    expect(s.players[h]!.units[d]!.type).toBe(26);
  });
});

describe('dyplomata komputera', () => {
  it('kradnie technologię w mieście innego komputera; w okradzionym — sabotaż', () => {
    const { s, ai, ai2 } = world();
    const city = foundCity(s, ai2, 30, 20, 4);
    s.players[ai2]!.techs[Tech.Flight] = true;
    const d = createUnit(s, ai, 26, 29, 20);
    expect(moveUnit(s, ai, d, 3)).toEqual({ kind: 'action', action: 'diplomat' });
    expect(s.players[ai]!.techs[Tech.Flight]).toBe(true);
    expect(s.cities[city]!.status & CityStatus.TechStolen).toBeTruthy();
    expect(messages(s)).toContain(`${s.players[ai]!.nationPlural} steal\nFlight.\n`);
    s.cities[city]!.shields = 30;
    const d2 = createUnit(s, ai, 26, 29, 20);
    scriptRng(s, [0]);
    moveUnit(s, ai, d2, 3);
    expect(s.cities[city]!.shields).toBe(0);
    expect(s.players[ai]!.units[d2]!.type).toBe(NO_UNIT);
  });

  it('w mieście człowieka, z którym ma pokój, znika bez akcji', () => {
    const { s, h, ai } = world();
    const city = foundCity(s, h, 30, 20, 4);
    s.players[h]!.techs[Tech.Flight] = true;
    s.players[h]!.diplomacy[ai]! |= Diplomacy.Peace;
    s.players[ai]!.diplomacy[h]! |= Diplomacy.Peace;
    const d = createUnit(s, ai, 26, 29, 20);
    moveUnit(s, ai, d, 3);
    expect(s.players[ai]!.units[d]!.type).toBe(NO_UNIT);
    expect(s.players[ai]!.techs[Tech.Flight]).toBe(false);
    expect(s.cities[city]!.status & CityStatus.TechStolen).toBe(0);
  });
});

describe('przekupienie jednostki (F22_0000_0639)', () => {
  it('człowiek: pytanie z kosztem; po zapłacie jednostka zmienia stronę, liczniki ActiveUnits ±2 jak w oryginale', () => {
    const { s, h, ai } = world();
    const capital = foundCity(s, ai, 20, 20, 6);
    addBuilding(s.cities[capital]!, BuildingId.Palace);
    s.players[ai]!.gold = 250;
    s.players[h]!.gold = 900;
    const target = createUnit(s, ai, 3, 31, 30); // Legion, koszt 2 (×10 w tabeli: 20?)
    const d = createUnit(s, h, 26, 30, 30);
    const cost = bribeCost(s, ai, target);
    const legionCost = s.players[ai]!.units[target]!.type;
    expect(legionCost).toBe(3);
    const q = moveUnit(s, h, d, 3);
    expect(q).toEqual({ kind: 'bribe', canPay: true,
      question: `${s.players[ai]!.nationAdjective} Legion\nwill desert for ${cost}$.\nTreasury: 900$\n Forget it.\n Pay\n` });
    const beforeAi = s.players[ai]!.activeUnits[3]!;
    const beforeH = s.players[h]!.activeUnits[3]!;
    moveUnit(s, h, d, 3, { bribe: true });
    expect(s.players[ai]!.units[target]!.type).toBe(NO_UNIT);
    expect(unitsAt(s, h, 31, 30).map((i) => s.players[h]!.units[i]!.type)).toEqual([3]);
    expect(s.players[h]!.gold).toBe(900 - cost);
    expect(s.players[ai]!.activeUnits[3]).toBe(beforeAi - 2);
    expect(s.players[h]!.activeUnits[3]).toBe(beforeH + 2);
    expect(s.players[h]!.units[d]!.x).toBe(30); // dyplomat zostaje na miejscu (atak dyplomaty zablokowany)
  });

  it('za mało złota: okno bez opcji; stos dwóch jednostek — bez przekupienia; komputer potrzebuje 2× koszt', () => {
    const { s, h, ai } = world();
    s.players[ai]!.gold = 250;
    const t = createUnit(s, ai, 3, 31, 30);
    const d = createUnit(s, h, 26, 30, 30);
    s.players[h]!.gold = 1;
    const q = moveUnit(s, h, d, 3);
    expect(q.kind === 'bribe' && q.canPay).toBe(false);
    expect(q.kind === 'bribe' && q.question.endsWith('$\n')).toBe(true);
    createUnit(s, ai, 3, 31, 30);
    s.players[h]!.gold = 99999;
    expect(moveUnit(s, h, d, 3).kind).toBe('blocked');
    // komputer
    const { s: s2, h: h2, ai: a2 } = world();
    s2.players[h2]!.gold = 100;
    const victim = createUnit(s2, h2, 1, 31, 30);
    const cost = bribeCost(s2, h2, victim);
    const dd = createUnit(s2, a2, 26, 30, 30);
    s2.players[a2]!.gold = cost * 2 - 2;
    moveUnit(s2, a2, dd, 3);
    expect(s2.players[h2]!.units[victim]!.type).toBe(1);
    s2.players[a2]!.gold = cost * 2;
    moveUnit(s2, a2, dd, 3);
    expect(s2.players[h2]!.units[victim]!.type).toBe(NO_UNIT);
    expect(s2.events.some((e) => e.kind === 'message' && /unit\nbribed by /.test(e.text as string))).toBe(true);
    expect(t).toBeGreaterThanOrEqual(0);
  });
});

describe('bunt z klęski (GenerateCityDisaster → InciteCityRevolt)', () => {
  it('jednostki w mieście i obok przechodzą z miastem; jednostka w innym mieście obok zostaje', () => {
    const { s, ai, ai2 } = world();
    const city = foundCity(s, ai, 30, 20, 5);
    const other = foundCity(s, ai, 31, 20, 3);
    const inside = createUnit(s, ai, 1, 30, 20);
    const inOther = createUnit(s, ai, 1, 31, 20);
    inciteCityRevolt(s, city, ai2);
    expect(s.cities[city]!.owner).toBe(ai2);
    expect(s.players[ai]!.units[inside]!.type).toBe(NO_UNIT);
    expect(s.players[ai]!.units[inOther]!.type).toBe(1);
    expect(s.cities[other]!.owner).toBe(ai);
    expect(s.map.improvements[cellIndex(30, 20)]! & Improvement.City).toBeTruthy();
  });
});

describe('powrót samolotu (F0_1866_226d)', () => {
  it('kierunek do najbliższego własnego miasta wg 2·dłuższa + krótsza; obce miasto na drodze pomijane', () => {
    const { s, h, ai } = world();
    foundCity(s, h, 20, 20, 3);
    const f = createUnit(s, h, 14, 25, 22);
    expect(nearestCityDirection(s, h, f)).toBe(8); // na północny zachód
    foundCity(s, ai, 24, 21, 3);
    expect(nearestCityDirection(s, h, f)).toBe(7); // pole NW to obce miasto — na zachód
  });
});

describe('rakieta komputera (AIEngine.MoveUnit, L11c8)', () => {
  it('przenosi się na pierwsze wolne pole obok celu i zwraca kierunek XOR 4', () => {
    const { s, h, ai } = world();
    const target = foundCity(s, h, 40, 20, 8);
    foundCity(s, ai, 20, 20, 3);
    const A = s.players[ai]!;
    A.militaryPower = 10;
    s.players[h]!.militaryPower = 100;
    A.diplomacy[h] = Diplomacy.Contact | Diplomacy.TributeDemanded;
    // jednostki człowieka w mieście i na polach 1–5 wokół: 6 + 8/2 = 10 punktów
    createUnit(s, h, 1, 40, 20);
    for (const [dx, dy] of [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1]]) createUnit(s, h, 1, 40 + dx!, 20 + dy!);
    const nuke = createUnit(s, ai, 25, 30, 20);
    createUnit(s, ai, 25, 21, 20);
    A.units[nuke]!.movesLeft = 48;
    expect(aiUnitCommand(s, ai, nuke)).toBe(6 ^ 4);
    expect([A.units[nuke]!.x, A.units[nuke]!.y]).toEqual([39, 21]);
    expect([A.units[nuke]!.gotoX, A.units[nuke]!.gotoY]).toEqual([40, 20]);
    expect(A.contactCountdown).toBe(-2);
    expect(s.cities[target]!.owner).toBe(h);
  });
});
