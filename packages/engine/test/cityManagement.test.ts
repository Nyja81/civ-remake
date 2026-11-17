/** Działania w oknie miasta: przydział pól, specjaliści, sprzedaż budynków, jednostki w mieście, raport okna. */
import { describe, expect, it } from 'vitest';
import {
  activateUnitInCity, addBuilding, advanceToHuman, BuildingId, buildingSellPrice, CITY_OFFSETS, CityStatus, cellIndex, cityTileIndex,
  createUnit, cycleSpecialist, endHumanTurn, Government, newGame, processCity, sellBuilding, specialistAt, supportedUnits,
  toggleAutoProduction, toggleCityTile, unitOrder, UnitStatus, type GameState,
} from '../src';

function foundCapital(seed: number): { s: GameState; city: number } {
  const s = newGame({ seed, difficulty: 1, civilizations: 5, nation: 1 });
  advanceToHuman(s);
  unitOrder(s, s.humanPlayer, 0, 'build');
  const city = s.cities.findIndex((c) => c.status !== -1 && c.owner === s.humanPlayer);
  return { s, city };
}

/** Odkrywa wszystkie pola miasta dla właściciela (żeby dało się je przydzielać). */
function exploreAround(s: GameState, city: number): void {
  const c = s.cities[city]!;
  for (const [dx, dy] of CITY_OFFSETS) s.map.explored[cellIndex(c.x + dx, c.y + dy)]! |= 1 << c.owner;
}

const workedTiles = (s: GameState, city: number) => [...Array(21).keys()].filter((i) => (s.cities[city]!.workers >>> i) & 1);

describe('okno miasta: przydział pól', () => {
  it('FindCityOffset: przesunięcie → numer pola, poza obszarem -1', () => {
    expect(cityTileIndex(0, -1)).toBe(0);
    expect(cityTileIndex(0, 0)).toBe(20);
    expect(cityTileIndex(-2, 1)).toBe(18);
    expect(cityTileIndex(2, 2)).toBe(-1);
  });

  it('zdjęcie mieszkańca z pola robi artystę; ponowny klik oddaje go na pole', () => {
    const { s, city } = foundCapital(41);
    exploreAround(s, city);
    processCity(s, city, 1);
    const before = workedTiles(s, city).filter((i) => i !== 20);
    expect(before.length).toBe(1);
    const tile = before[0]!;
    expect(toggleCityTile(s, city, tile)).toBe(true);
    let r = processCity(s, city, 1)!;
    expect(workedTiles(s, city)).toEqual([20]);
    expect(r.specialists).toBe(1);
    expect(specialistAt(s, city, 0)).toBe(3); // nowy specjalista to artysta
    expect(r.luxury).toBeGreaterThanOrEqual(2);
    // inne wolne pole: specjalista wraca do pracy na nim (przydział się nie przelicza)
    const other = [...Array(20).keys()].find((i) => i !== tile && toggleCityTile(s, city, i))!;
    r = processCity(s, city, 1)!;
    expect(workedTiles(s, city).sort((a, b) => a - b)).toEqual([other, 20].sort((a, b) => a - b));
    expect(r.specialists).toBe(0);
  });

  it('zajęcie pola bez wolnego mieszkańca przelicza przydział od nowa; pole miasta nie przełącza się', () => {
    const { s, city } = foundCapital(42);
    exploreAround(s, city);
    processCity(s, city, 1);
    const worked = workedTiles(s, city);
    expect(toggleCityTile(s, city, 20)).toBe(false);
    const free = [...Array(20).keys()].find((i) => !worked.includes(i))!;
    expect(toggleCityTile(s, city, free)).toBe(true);
    const r = processCity(s, city, 1)!;
    // za dużo pól — oryginał wraca do automatycznego przydziału: znów 1 pole + środek, bez specjalistów
    expect(workedTiles(s, city).length).toBe(2);
    expect(r.specialists).toBe(0);
  });

  it('pola nieodkrytego nie da się zająć', () => {
    const { s, city } = foundCapital(43);
    const c = s.cities[city]!;
    const tile = 9; // (2, 0)
    const [dx, dy] = CITY_OFFSETS[tile]!;
    s.map.explored[cellIndex(c.x + dx, c.y + dy)] = 0;
    processCity(s, city, 1);
    const before = c.workers;
    expect(toggleCityTile(s, city, tile)).toBe(false);
    expect(c.workers).toBe(before);
  });
});

describe('okno miasta: specjaliści, budynki, jednostki', () => {
  it('specjaliści: artysta → poborca → naukowiec → artysta; podatek i nauka rosną o 2', () => {
    const { s, city } = foundCapital(44);
    const c = s.cities[city]!;
    c.size = 5;
    exploreAround(s, city);
    processCity(s, city, 1);
    const tile = workedTiles(s, city).find((i) => i !== 20)!;
    toggleCityTile(s, city, tile);
    const base = processCity(s, city, 1)!;
    expect(specialistAt(s, city, 0)).toBe(3);
    cycleSpecialist(s, city, 0);
    expect(specialistAt(s, city, 0)).toBe(1);
    const taxman = processCity(s, city, 1)!;
    expect(taxman.tax).toBe(base.tax + 2);
    cycleSpecialist(s, city, 0);
    expect(specialistAt(s, city, 0)).toBe(2);
    expect(processCity(s, city, 1)!.science).toBe(base.science + 2);
    cycleSpecialist(s, city, 0);
    expect(specialistAt(s, city, 0)).toBe(3);
  });

  it('sprzedaż budynku: złoto 10 × koszt, raz na turę; nowa tura kasuje blokadę', () => {
    const { s, city } = foundCapital(45);
    const c = s.cities[city]!;
    const p = s.players[s.humanPlayer]!;
    addBuilding(c, BuildingId.Barracks);
    addBuilding(c, BuildingId.Granary);
    const gold = p.gold;
    expect(sellBuilding(s, city, BuildingId.Barracks)).toBe(true);
    expect(p.gold).toBe(gold + buildingSellPrice(BuildingId.Barracks));
    expect(buildingSellPrice(BuildingId.Barracks)).toBe(40); // koszary: 4 × 10 tarcz
    expect(c.status & CityStatus.BuildingSold).not.toBe(0);
    expect(sellBuilding(s, city, BuildingId.Granary)).toBe(false);
    for (const [id, u] of p.units.entries()) if (u.type !== -1) unitOrder(s, s.humanPlayer, id, 'sentry');
    endHumanTurn(s);
    expect(s.cities[city]!.status & CityStatus.BuildingSold).toBe(0);
  });

  it('klik w jednostkę w mieście: koniec czuwania, pełny ruch, bez celu', () => {
    const { s, city } = foundCapital(46);
    const c = s.cities[city]!;
    const h = s.humanPlayer;
    const id = createUnit(s, h, 1, c.x, c.y);
    const u = s.players[h]!.units[id]!;
    u.status |= UnitStatus.Fortified;
    u.movesLeft = 0;
    u.gotoX = 5;
    activateUnitInCity(s, h, id);
    expect(u.status & UnitStatus.Fortified).toBe(0);
    expect(u.movesLeft).toBe(3);
    expect(u.gotoX).toBe(-1);
  });

  it('utrzymanie jednostek: w despotyzmie darmowe do wielkości miasta, osadnik je 1; w monarchii tarcza i 2 żywności', () => {
    const { s, city } = foundCapital(47);
    const c = s.cities[city]!;
    const h = s.humanPlayer;
    const a = createUnit(s, h, 0, c.x, c.y);
    const b = createUnit(s, h, 1, c.x, c.y);
    s.players[h]!.units[a]!.homeCity = city;
    s.players[h]!.units[b]!.homeCity = city;
    let list = supportedUnits(s, city);
    expect(list.map((e) => e.unitId)).toEqual([a, b]);
    expect(list[0]).toMatchObject({ shield: false, food: 1 });
    expect(list[1]!.shield).toBe(true); // druga jednostka w mieście wielkości 1
    s.players[h]!.government = Government.Monarchy;
    list = supportedUnits(s, city);
    expect(list[0]).toMatchObject({ shield: true, food: 2 });
  });

  it('automatyczna produkcja: włączenie wybiera produkcję komputera, ponowne wyłącza flagę', () => {
    const { s, city } = foundCapital(48);
    const c = s.cities[city]!;
    toggleAutoProduction(s, city);
    expect(c.status & CityStatus.AutoProduction).not.toBe(0);
    toggleAutoProduction(s, city);
    expect(c.status & CityStatus.AutoProduction).toBe(0);
  });
});

describe('raport okna miasta', () => {
  it('kroki zadowolenia, żywność do wyżywienia, kolejność pracy pól', () => {
    const { s, city } = foundCapital(49);
    const r = processCity(s, city, 1)!;
    expect(r.happinessSteps.map((h) => h.kind)).toEqual(['base', 'luxury', 'buildings', 'military', 'wonders']);
    const last = r.happinessSteps[4]!;
    expect([last.happy, last.unhappy]).toEqual([r.happy, r.unhappy]);
    expect(r.foodUpkeep).toBe(2);
    expect(r.difficultyRatio).toBe(10);
    expect(r.workOrder[0]).toBe(20); // najpierw pole miasta
    expect(r.workOrder.length).toBe(2);
  });
});
