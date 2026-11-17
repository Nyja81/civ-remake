/**
 * Karawany i dyplomaci: wejście do miasta, przekupienie jednostki, podburzenie miasta do buntu.
 * Źródło: OpenCivOne (MIT) — Actions.F0_2459_0948_CaravanArrivesAtDestinationCity, DiplomatActions
 * (F22_0000_0000_DiplomatActionOnCity, F22_0000_0639_DiplomatInteractionWithUnit, F22_0000_0af5_InciteCityRevolt),
 * Diplomacy.F0_2517_0d97_GetMinimumDistanceFromPalace i część PlayerTurn.MoveUnit (Segment_1403 L1ed2–L219c).
 * Wszystko sprawdzone z dosłownym tłumaczeniem asemblera z pierwszego commitu wzorca (ec23ac3: Overlay_22.cs,
 * Segment_2459.cs, Segment_1403.cs); teksty z segmentu danych CIV.EXE (DS:0x519e–0x536c, 0x1ee4, 0x2918–0x2958).
 *
 * Rozbieżności nowszego wzorca z asemblerem (idziemy za asemblerem):
 * - komputer: dyplomata zawsze kradnie technologię (opcja 2); gdy miasto już okradziono — sabotaż; usuwany bez akcji
 *   tylko wtedy, gdy miasto należy do człowieka, a człowiek ma z nim pokój (wzorzec: pokój dyplomaty z właścicielem
 *   albo barbarzyńcy);
 * - brak nowej technologii: człowiek dostaje „No new technology found.” i dyplomata zostaje (wzorzec: ponowne menu),
 *   komputer przechodzi do sabotażu;
 * - kradzież i sabotaż losują inaczej (Next(72) od losowego miejsca; sabotaż: Next(2), potem do 99 losowań Next(24)
 *   z pominięciem 0) i pokazują komunikat zawsze, zwykłym oknem (Var_2f9e = 0), nie „Spies report”;
 * - teksty: „Revenue: $…”, „will revolt for $…”, „ Forget it.\n Incite revolt\n Subvert city ($x2)\n”,
 *   „will desert for …$.\nTreasury: …$\n Forget it.\n Pay\n” — z danych CIV.EXE;
 * - karawana: grupa (kontynent) miasta macierzystego czytana jako F0_2aea_1942(x, x) — błąd oryginału, zachowany;
 * - przekupienie: ActiveUnits zmniejszane/zwiększane dwa razy (DeleteUnit/CreateUnit i jeszcze raz jawnie) — jak w oryginale.
 */
import { UNITS } from '../data/units';
import { Tech, TECHS } from '../data/techs';
import { BuildingId, hasBuilding } from './buildings';
import { cityName, cityTakeover } from './cities';
import { confirmBreakTreaty } from './combat';
import { clearDiplomacyFlags } from './diplomacy';
import { improvementDef } from './economy';
import { pageGroupAt } from './goto';
import { meetWithKing, type KingMeeting } from './kingMeeting';
import { CITY_OFFSETS, cellIndex, distance, isValid, wrapX } from './map';
import { playerHasTech, researchFinished } from './techs';
import { CityStatus, Diplomacy, Improvement, NO_UNIT, type GameState } from './types';
import { createUnit, deleteUnit, setCellOwner, unitsAt } from './units';
import { CARAVAN_GOODS } from '../data/names';

const s16 = (v: number) => (v << 16) >> 16;
const trunc = Math.trunc;

/** Menu dyplomaty (DS:0x51b4); opcje 0–5. */
export const DIPLOMAT_ACTIONS = ['Establish Embassy', 'Investigate City', 'Steal Technology', 'Industrial Sabotage', 'Incite a Revolt', 'Meet with King'] as const;

const breakTreatyQuestion = (state: GameState, target: number) =>
  `We have signed a\npeace treaty with\nthe ${state.players[target]!.nationPlural}!\n Cancel action.\n Break treaty.\n`;

/** Komunikat dla człowieka w oknie w (x, y) — Var_2f9e = 0 (zwykłe okno). */
function message(state: GameState, text: string, x: number, y: number, extra: Record<string, unknown> = {}): void {
  state.events.push({ kind: 'message', text, dialogX: x, dialogY: y, ...extra });
}

/** F0_2517_0d97_GetMinimumDistanceFromPalace: najmniejsza odległość (F0_2dc4_0289) od pałacu gracza, najwyżej 16. */
export function minimumDistanceFromPalace(state: GameState, player: number, x: number, y: number): number {
  let best = 16;
  for (const c of state.cities) {
    if (c.status === -1 || c.owner !== player || !hasBuilding(c, BuildingId.Palace)) continue;
    const d = distance(c.x, c.y, x, y);
    if (d < best) best = d;
  }
  return best;
}

// ───────────────────────────── karawana ─────────────────────────────

/**
 * Actions.F0_2459_0948_CaravanArrivesAtDestinationCity: przychód jednorazowy (złoto i postęp badań), komunikat dla
 * człowieka (80, 80), usunięcie karawany i szlak handlowy miasta macierzystego (zastępuje najsłabszy szlak).
 */
export function caravanArrives(state: GameState, player: number, unitId: number, cityId: number): void {
  const p = state.players[player]!;
  const unit = p.units[unitId]!;
  const homeId = unit.homeCity;
  const city = state.cities[cityId]!;
  const home = state.cities[homeId]!;
  let worth = distance(city.x, city.y, home.x, home.y) + 10; // F0_2dc4_0289
  worth = s16(worth * (city.baseTrade + home.baseTrade));
  worth = trunc(worth / 24);
  // F0_2aea_1942(home.x, home.x): oryginał podaje X miasta macierzystego jako obie współrzędne
  if (pageGroupAt(state.map, home.x, home.x) === pageGroupAt(state.map, city.x, city.y)) worth = trunc(worth / 2);
  if (city.owner === player) worth = trunc(worth / 2);
  if (playerHasTech(state, city.owner, Tech.RailRoad)) worth -= trunc(worth / 3);
  if (playerHasTech(state, city.owner, Tech.Flight)) worth -= trunc(worth / 3);
  p.gold = s16(p.gold + worth);
  p.researchProgress = s16(p.researchProgress + worth);
  if (player === state.humanPlayer) {
    message(state, `${CARAVAN_GOODS[unitId & 7]} caravan from ${cityName(state, homeId)}\narrives in ${cityName(state, cityId)}\n` +
      `Trade route established\nRevenue: $${worth}.\n`, 80, 80, { player, caravan: true, revenue: worth });
  }
  deleteUnit(state, player, unitId);
  let weakest = city.baseTrade;
  if (city.owner !== player) weakest *= 2;
  let slot = -1;
  for (let i = 0; i < 3; i++) {
    const t = home.tradeRoutes[i]!;
    if (t === cityId) return;
    let w = -1;
    if (t !== -1) {
      w = state.cities[t]!.baseTrade;
      if (state.cities[t]!.owner !== player) w *= 2;
    }
    if (w < weakest) {
      weakest = w;
      slot = i;
    }
  }
  if (slot !== -1) home.tradeRoutes[slot] = cityId;
}

/** Wynik wejścia karawany do miasta dla MoveUnit: pytanie do człowieka albo wykonana akcja. */
export type CaravanStep =
  | { kind: 'caravan'; city: number; question: string; disabled: number }
  | { kind: 'action'; action: 'caravan' | 'wonder' };

/**
 * Część PlayerTurn.MoveUnit (L1fd2–L2154): karawana wchodzi do miasta (nx, ny). Bez okna (zwykły ruch, wynik
 * `undefined`) — gdy to własne miasto, nie buduje cudu, jest bliżej niż 10 pól od miasta macierzystego i na tym samym
 * kontynencie. Obce miasto — od razu szlak handlowy. Własne — okno (100, 80) „Will you?” z opcjami Keep moving (0),
 * Establish trade route (1), Help build WONDER (2; tylko przy budowie cudu, wtedy przy odległości < 10 szlak jest
 * nieaktywny — Var_b276 = 2). `choice` — odpowiedź człowieka (poprzednie wywołanie zwróciło pytanie).
 * Odstępstwa: karawana bez miasta macierzystego (oryginał czyta Cities[-1]) porusza się zwyczajnie; karawana komputera
 * we własnym mieście nie pyta (oryginał pokazałby okno człowiekowi) — wybiera „Keep moving”.
 */
export function caravanEntersCity(state: GameState, player: number, unitId: number, cityId: number, choice?: number): CaravanStep | undefined {
  const unit = state.players[player]!.units[unitId]!;
  if (unit.homeCity < 0 || state.cities[unit.homeCity]!.status === -1) return undefined;
  const city = state.cities[cityId]!;
  const home = state.cities[unit.homeCity]!;
  const dist = distance(city.x, city.y, home.x, home.y); // F0_2dc4_0289(nx, home.x, ny, home.y)
  const wonder = city.production < -24;
  if (city.owner === player && !wonder && dist < 10 &&
    pageGroupAt(state.map, home.x, home.y) === pageGroupAt(state.map, city.x, city.y)) return undefined;
  let selected = 1;
  if (city.owner === player) {
    if (player !== state.humanPlayer) selected = 0;
    else if (choice === undefined) {
      let question = 'Will you?\n Keep moving\n Establish trade route\n';
      let disabled = 0;
      if (wonder) {
        question += ' Help build WONDER.\n';
        if (dist < 10) disabled = 2;
      }
      return { kind: 'caravan', city: cityId, question, disabled };
    } else selected = choice;
  }
  if (selected === 1) {
    caravanArrives(state, player, unitId, cityId);
    return { kind: 'action', action: 'caravan' };
  }
  if (selected === 2) {
    city.shields += 10 * UNITS[unit.type]!.cost;
    deleteUnit(state, player, unitId);
    return { kind: 'action', action: 'wonder' };
  }
  return undefined;
}

// ───────────────────────────── dyplomata w mieście ─────────────────────────────

/** Menu dyplomaty człowieka (F22_0000_0000, L0078–L00d2): tekst okna (80, 80) i maska nieaktywnych opcji (Var_b276). */
export function diplomatMenu(state: GameState, player: number, cityId: number): { question: string; disabled: number } {
  const city = state.cities[cityId]!;
  const owner = city.owner;
  let disabled = 0;
  if (state.players[state.humanPlayer]!.diplomacy[owner]! & Diplomacy.Embassy || owner === 0) disabled = 0x1;
  if (city.status & CityStatus.TechStolen) disabled |= 0x4;
  if (hasBuilding(city, BuildingId.Palace)) disabled |= 0x10;
  if (owner === 0) disabled |= 0x20;
  const question = `${state.players[player]!.nationAdjective} diplomat arrives\nin ${cityName(state, cityId)}...\n` +
    DIPLOMAT_ACTIONS.map((a) => ` ${a}\n`).join('');
  return { question, disabled };
}

/** Wynik akcji dyplomaty (dla interfejsu). Komunikaty idą zdarzeniami `message` (z `dialogX`, `dialogY`). */
export type DiplomatResult =
  /** Akcja wykonana albo przerwana — nic więcej do pokazania. */
  | { kind: 'done' }
  /** Kradzież przy traktacie (F0_29f3_0c9e_ConfirmAttackAction): opcja 1 = zerwanie; ponowić z `confirm`. */
  | { kind: 'confirm'; question: string }
  /** Okno „Dissidents in …” (100, 80): ponowić z `revolt` = numer opcji (1 — bunt, 2 — przejęcie za podwójną cenę). */
  | { kind: 'revolt'; question: string; cost: number }
  /** Ambasada: raport wywiadu o graczu (F14_0000_1164_IntelligenceReport). */
  | { kind: 'embassy'; target: number }
  /** Okno miasta (GameEngine.F0_1ade_03ea_ProcessCityState1AndRefreshMap) — dla obcego miasta tylko podgląd. */
  | { kind: 'investigate'; city: number }
  /** Rozmowa z władcą (MeetWithKing.F6_0000_0000(gracz, x, y, 1)). */
  | { kind: 'meeting'; meeting: KingMeeting };

export interface DiplomatOptions {
  /** Odpowiedź „Break treaty.” na pytanie o traktat. */
  confirm?: boolean;
  /** Odpowiedź na okno buntu (numer opcji; < 1 — rezygnacja). */
  revolt?: number;
}

/**
 * DiplomatActions.F22_0000_0000_DiplomatActionOnCity: działanie dyplomaty `unitId` gracza `player` w obcym mieście.
 * Człowiek podaje `action` (0–5 jak w menu, inne — rezygnacja); komputer — `action` pomijane (wybór jak w L010c).
 * Gracz człowiek wywołuje ją po pytaniu `diplomat` z `moveUnit`; dla komputera woła ją sam `moveUnit`.
 */
export function diplomatAction(state: GameState, player: number, unitId: number, cityId: number, action = -1,
  options: DiplomatOptions = {}): DiplomatResult {
  const city = state.cities[cityId]!;
  const owner = city.owner;
  const h = state.humanPlayer;
  const unit = state.players[player]!.units[unitId]!;
  if (unit.type === NO_UNIT || city.status === -1) return { kind: 'done' };
  unit.gotoX = -1;
  const done = { kind: 'done' } as const;
  const del = () => deleteUnit(state, player, unitId);

  if (player !== h) {
    // L010c: komputer kradnie; dyplomata w mieście człowieka, z którym komputer ma pokój — znika
    if (owner === h && state.players[h]!.diplomacy[player]! & Diplomacy.Peace) {
      del();
      return done;
    }
    action = 2;
  }

  switch (action) {
    case 0: // L014c: ambasada
      state.players[h]!.diplomacy[owner]! |= Diplomacy.Embassy;
      del();
      return { kind: 'embassy', target: owner };
    case 1: // L012d: okno miasta, potem usunięcie dyplomaty
      del();
      return { kind: 'investigate', city: cityId };
    case 2: { // L017a: kradzież technologii
      if (player === h) {
        if (city.status & CityStatus.TechStolen) return done;
        if (state.players[h]!.diplomacy[owner]! & Diplomacy.Peace && !options.confirm) {
          return { kind: 'confirm', question: breakTreatyQuestion(state, owner) };
        }
        if (confirmBreakTreaty(state, owner, options.confirm === true) === -1) return done;
        clearDiplomacyFlags(state, h, owner, Diplomacy.Peace);
      } else if (city.status & CityStatus.TechStolen) {
        return sabotage(state, player, unitId, cityId);
      }
      // L01e2: od losowego miejsca pierwsza technologia właściciela, której dyplomata nie zna
      const start = state.rng.next(72);
      for (let i = 0; i < 72; i++) {
        const t = (start + i) % 72;
        if (player === 0) continue;
        if (!playerHasTech(state, owner, t) || playerHasTech(state, player, t)) continue;
        researchFinished(state, player, owner, t);
        message(state, `${state.players[player]!.nationPlural} steal\n${TECHS[t]!.name}.\n`, 80, 80, { stolen: t });
        city.status |= CityStatus.TechStolen;
        del();
        return done;
      }
      if (player === h) {
        message(state, 'No new technology found.\n', 80, 80);
        return done;
      }
      return sabotage(state, player, unitId, cityId);
    }
    case 3:
      return sabotage(state, player, unitId, cityId);
    case 4: { // L0442: podburzenie do buntu
      const d = minimumDistanceFromPalace(state, owner, city.x, city.y);
      if (d === 0) return done;
      let cost = s16(trunc(s16(state.players[owner]!.gold + 1000) / (d + 3)) * city.size);
      if (city.status & CityStatus.CivilDisorder) cost = trunc(cost / 2);
      const coins = state.players[player]!.gold;
      if (options.revolt === undefined) {
        let question = `Dissidents in ${cityName(state, cityId)}\nwill revolt for $${cost}.\n`;
        if (cost <= coins) {
          question += ' Forget it.\n Incite revolt\n';
          if (s16(cost * 2) <= coins && state.players[player]!.diplomacy[owner]! & Diplomacy.Peace) question += ' Subvert city ($x2)\n';
        }
        return { kind: 'revolt', question, cost };
      }
      const selected = options.revolt;
      if (selected < 1) return done;
      if (selected === 1 && state.players[owner]!.diplomacy[player]! & Diplomacy.Peace) {
        clearDiplomacyFlags(state, owner, player, Diplomacy.Peace);
        state.players[owner]!.diplomacy[player]! |= Diplomacy.Vendetta;
      }
      state.players[player]!.gold = s16(coins - s16(cost * selected));
      inciteCityRevolt(state, cityId, player);
      del();
      return done;
    }
    case 5: { // L05eb: rozmowa z władcą; dyplomata zostaje bez ruchu
      unit.movesLeft = 0;
      if (owner === 0) return done;
      return { kind: 'meeting', meeting: meetWithKing(state, owner, { x: unit.x, y: unit.y, visit: true }) };
    }
    default:
      return done;
  }
}

/**
 * Sabotaż (L02d5–L0437): przy Next(2) = 0 i niepustym magazynie tarcz — utrata produkcji; inaczej do 99 losowań
 * budynku Next(24) (0 = pałac pomijany). Oryginał liczy maskę `1 << r` na 16 bitach z rozszerzeniem znaku (CWD):
 * r = 15 sprawdza i kasuje naraz budynki 16–24 (komunikat podaje Mfg. Plant), r = 16…23 nie trafia nigdy.
 */
function sabotage(state: GameState, player: number, unitId: number, cityId: number): DiplomatResult {
  const city = state.cities[cityId]!;
  let count = 0;
  let destroyed = -1;
  if (!(state.rng.next(2) === 0 && city.shields !== 0)) {
    for (;;) {
      const r = state.rng.next(24);
      count++;
      if (count >= 99) break;
      if (r === 0) continue;
      const mask = r < 15 ? 1 << r : r === 15 ? 0xffff8000 : 0;
      if (((city.buildings & mask) >>> 0) === 0) continue;
      destroyed = r;
      break;
    }
  }
  let text: string;
  if (destroyed !== -1) {
    city.buildings = (destroyed === 15 ? city.buildings & 0x7fff : city.buildings & ~(1 << destroyed)) >>> 0;
    text = `${improvementDef(destroyed + 1).name} destroyed\n`;
  } else {
    city.shields = 0;
    text = city.production >= 0 ? `${UNITS[city.production]!.name} production sabotaged\n` : `${improvementDef(-city.production).name} production sabotaged\n`;
  }
  message(state, `${text}in ${cityName(state, cityId)}.\n`, 80, 80, { sabotage: destroyed !== -1 ? destroyed + 1 : 0 });
  deleteUnit(state, player, unitId);
  return { kind: 'done' };
}

// ───────────────────────────── bunt i przejęcie miasta ─────────────────────────────

/**
 * DiplomatActions.F22_0000_0af5_InciteCityRevolt: miasto przechodzi do gracza `actionPlayer` (bunt wzniecony przez
 * dyplomatę albo zamieszki — GameEngine.F20_0000_0540_GenerateCityDisaster). Gracz poznaje okolicę miasta,
 * jednostki właściciela w mieście i na sąsiednich polach (poza innymi miastami) przechodzą na jego stronę z tym
 * miastem jako macierzystym, potem CityTakeover(…, flag = 1) bez animacji. Komunikat (100, 32) — gdy dotyczy człowieka
 * albo człowiek ma ambasadę u którejś ze stron.
 * Pominięte: gałąź `actionPlayer = -1` (wybór sąsiada wg zadowolenia) — oba wywołania w oryginale podają gracza.
 * Odstępstwo: pola okolicy z zawijaniem X i w granicach mapy (oryginał zapisuje bajty mapy bez sprawdzania).
 */
export function inciteCityRevolt(state: GameState, cityId: number, actionPlayer: number): void {
  if (actionPlayer === -1) return;
  const city = state.cities[cityId]!;
  const owner = city.owner;
  const { x, y } = city;
  state.map.explored[cellIndex(x, y)]! |= 1 << actionPlayer;
  for (let i = 0; i < 20; i++) {
    const nx = wrapX(x + CITY_OFFSETS[i]![0]);
    const ny = y + CITY_OFFSETS[i]![1];
    if (isValid(nx, ny)) state.map.explored[cellIndex(nx, ny)]! |= 1 << actionPlayer;
  }
  const h = state.humanPlayer;
  const hd = state.players[h]!.diplomacy;
  if (owner === h || actionPlayer === h || hd[owner]! & Diplomacy.Embassy || hd[actionPlayer]! & Diplomacy.Embassy) {
    const name = cityName(state, cityId);
    const text = actionPlayer === 0
      ? `${state.players[owner]!.nationPlural} declare\nindependence in\n${name}\n`
      : `${state.players[owner]!.nationPlural} rebel!\nCivil War in\n${name}.\n${state.players[actionPlayer]!.nationAdjective} influence\nsuspected.\n`;
    // DrawVisibleMap(człowiek, x − 8, y − 5), gdy człowiek zna pole miasta
    const seen = (state.map.explored[cellIndex(x, y)]! & (1 << h)) !== 0;
    message(state, text, 100, 32, seen ? { mapX: x - 8, mapY: y - 5 } : {});
  }
  const units = state.players[owner]!.units;
  for (let i = 0; i < units.length; i++) {
    const u = units[i]!;
    if (u.type === NO_UNIT) continue;
    const d = distance(x, y, u.x, u.y);
    if (d > 1 || (d !== 0 && state.map.improvements[cellIndex(u.x, u.y)]! & Improvement.City)) continue;
    const type = u.type;
    const ux = u.x;
    const uy = u.y;
    deleteUnit(state, owner, i);
    setCellOwner(state, ux, uy, actionPlayer);
    const id = createUnit(state, actionPlayer, type, ux, uy);
    if (id !== -1) {
      const n = state.players[actionPlayer]!.units[id]!;
      n.visibleBy |= 1 << owner;
      n.homeCity = cityId;
    }
  }
  cityTakeover(state, actionPlayer, cityId, -1, true);
  setCellOwner(state, x, y, actionPlayer);
}

// ───────────────────────────── dyplomata wobec jednostki ─────────────────────────────

/** Koszt przekupienia (F22_0000_0639): ((złoto właściciela + 750) / (odległość od pałacu + 2)) · koszt; poza osadnikami /2. */
export function bribeCost(state: GameState, target: number, targetId: number): number {
  const u = state.players[target]!.units[targetId]!;
  const d = minimumDistanceFromPalace(state, target, u.x, u.y);
  let cost = s16(trunc(s16(state.players[target]!.gold + 750) / (d + 2)) * UNITS[u.type]!.cost);
  if (u.type !== 0) cost = trunc(cost / 2);
  return cost;
}

/**
 * DiplomatActions.F22_0000_0639_DiplomatInteractionWithUnit: gracz `player` przekupuje samotną jednostkę `targetId`
 * gracza `target` (dyplomatą człowieka albo — u komputera — także jednostką ataku lądowego z AIEngine.MoveUnit).
 * Człowiek dostaje pytanie (100, 80): wynik `{ kind: 'bribe' }`, odpowiedź przez `accept` (opcja 1 = Pay); przy braku
 * złota okno ma tylko tekst. Komputer płaci, gdy ma co najmniej dwa razy tyle. Zwraca pytanie albo `undefined`.
 */
export function bribeUnit(state: GameState, player: number, target: number, targetId: number, accept?: boolean):
  { kind: 'bribe'; question: string; canPay: boolean } | undefined {
  const tu = state.players[target]!.units[targetId]!;
  if (tu.type === NO_UNIT || unitsAt(state, target, tu.x, tu.y).length > 1) return undefined;
  const cost = bribeCost(state, target, targetId);
  const coins = state.players[player]!.gold;
  if (player !== state.humanPlayer && trunc(coins / 2) < cost) return undefined;
  if (player === state.humanPlayer) {
    if (accept === undefined) {
      const canPay = cost <= coins;
      const question = `${state.players[target]!.nationAdjective} ${UNITS[tu.type]!.name}\nwill desert for ${cost}$.\nTreasury: ${coins}$\n` +
        (canPay ? ' Forget it.\n Pay\n' : '');
      return { kind: 'bribe', question, canPay };
    }
    if (!accept) return undefined;
  }
  const type = tu.type;
  const ux = tu.x;
  const uy = tu.y;
  if (target === state.humanPlayer) {
    message(state, `${state.players[target]!.nationAdjective} ${UNITS[type]!.name} unit\nbribed by ${state.players[player]!.nationPlural}!\n`, 80, 40,
      { mapX: ux - 8, mapY: uy - 6 }); // DrawVisibleMap(ofiara, x − 8, y − 6)
  }
  deleteUnit(state, target, targetId);
  state.players[target]!.activeUnits[type]!--;
  const id = createUnit(state, player, type, ux, uy);
  if (id !== -1) {
    state.players[player]!.activeUnits[type]!++;
    state.players[player]!.units[id]!.visibleBy |= 1 << target;
  }
  state.players[player]!.gold = s16(coins - cost);
  state.events.push({ kind: 'unitBribed', player, target, x: ux, y: uy, unitType: type, cost });
  return undefined;
}
