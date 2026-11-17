/**
 * Dyplomacja. Źródło: Diplomacy.cs z OpenCivOne (MIT): UpdateDiplomacyStatus (kontakt, traktaty komputer–komputer),
 * SetDiplomacyFlags/ClearDiplomacyFlags, DetermineWhoIsStrongest, CanExchangeTechnologies oraz część
 * UpdatePlayerGovernmentAndDiplomacy (wygasanie traktatów, kontakt formalny, prośby komputera o pomoc i krucjatę).
 * Rozmowy z władcami (MeetWithKing) — interfejs; silnik zgłasza zdarzenia `meetLeader` i `aiRequest`.
 * Pominięte: zapis do powtórki (Replay), flagi debugowania reguł (przyjęte wartości domyślne — wszystkie bity ustawione).
 */
import { NATIONS } from '../data/nations';
import { playerHasWonder } from './cities';
import { WonderId } from './buildings';
import { playerHasTech, researchFinished } from './techs';
import { Diplomacy, Government, type GameState } from './types';

/** SetDiplomacyFlags: obustronnie; pokój kasuje zapis o walkach. */
export function setDiplomacyFlags(state: GameState, p1: number, p2: number, flags: number): void {
  const a = state.players[p1]!.diplomacy;
  const b = state.players[p2]!.diplomacy;
  a[p2]! |= flags;
  b[p1]! |= flags;
  if (flags === Diplomacy.Peace) {
    a[p2]! &= ~Diplomacy.EverFought;
    b[p1]! &= ~Diplomacy.EverFought;
  }
}

/** ClearDiplomacyFlags: obustronnie; koniec pokoju kasuje też sojusz. */
export function clearDiplomacyFlags(state: GameState, p1: number, p2: number, flags: number): void {
  const a = state.players[p1]!.diplomacy;
  const b = state.players[p2]!.diplomacy;
  a[p2]! &= ~flags;
  b[p1]! &= ~flags;
  if (flags & Diplomacy.Peace) {
    a[p2]! &= ~Diplomacy.Allied;
    b[p1]! &= ~Diplomacy.Allied;
  }
}

/** DetermineWhoIsStrongest: czy p1 może sobie pozwolić na wojnę z p2. */
export function isStronger(state: GameState, p1: number, p2: number): boolean {
  const h = state.humanPlayer;
  const A = state.players[p1]!;
  const B = state.players[p2]!;
  const H = state.players[h]!;
  const threatened = (p: typeof A) => (p.diplomacy[h]! & (Diplomacy.Contact | Diplomacy.Peace)) === Diplomacy.Contact &&
    p.militaryPower < H.militaryPower && !(p.diplomacy[h]! & Diplomacy.Allied);
  if (threatened(A) || threatened(B)) return false;
  if (A.activeUnits[25]! < B.activeUnits[25]!) return false;
  let peace = 0;
  for (let i = 1; i < 8; i++) {
    if (i !== p1 && i !== p2 && (A.diplomacy[i]! & (Diplomacy.Contact | Diplomacy.Peace)) === Diplomacy.Contact) peace++;
  }
  if (A.diplomacy[p2]! & Diplomacy.Peace) peace++;
  peace -= NATIONS[A.nation]?.mood ?? 0;
  peace += 4;
  let cities = 0;
  let defense = 0;
  let ratio = 1;
  for (let i = 1; i < 15; i++) {
    const a = A.continents[i]!;
    const b = B.continents[i]!;
    if (a.cityCount !== 0 && (a.defense >> 1) + a.attack < b.defense) return false;
    if (a.defense !== 0 && b.attack !== 0) {
      cities += a.cityCount;
      defense += a.defense;
      ratio += (b.defense >> 1) + b.attack;
    }
  }
  return cities === 0 || Math.trunc((defense * 4) / ratio) >= peace;
}

/** CanExchangeTechnologies: wymiana po jednej technologii (ostatniej w kolejności), gdy obie strony mają coś do dania. */
export function exchangeTechnologies(state: GameState, p1: number, p2: number): void {
  let missing1 = -1;
  let missing2 = -1;
  for (let i = 0; i < 72; i++) {
    const a = playerHasTech(state, p1, i);
    const b = playerHasTech(state, p2, i);
    if (!a && b) missing1 = i;
    if (a && !b) missing2 = i;
  }
  if (missing1 !== -1 && missing2 !== -1) {
    researchFinished(state, p1, p2, missing1);
    researchFinished(state, p2, p1, missing2);
  }
}

const embassyWith = (state: GameState, p: number) => (state.players[state.humanPlayer]!.diplomacy[p]! & Diplomacy.Embassy) !== 0;
const peaceful = (state: GameState, p: number) => {
  const g = state.players[p]!.government;
  return g === Government.Republic || g === Government.Democracy;
};

export function updateDiplomacyStatus(state: GameState, p1: number, p2: number, x: number, y: number): void {
  if (p1 === 0 || p2 === 0) return;
  const h = state.humanPlayer;
  const other = p1 === h ? p2 : p2 === h ? p1 : -1;
  if (other !== -1) {
    const first = !(state.players[p1]!.diplomacy[p2]! & Diplomacy.Contact);
    if (first || state.turn - state.players[other]!.contactCountdown >= 16) {
      state.events.push({ kind: 'meetLeader', player: other, x, y, first });
      state.players[other]!.contactCountdown = state.turn;
    }
  }
  const A = state.players[p1]!;
  const B = state.players[p2]!;
  A.diplomacy[p2]! |= Diplomacy.Contact | Diplomacy.FormalContact;
  B.diplomacy[p1]! |= Diplomacy.Contact | Diplomacy.FormalContact;
  if (p1 === state.humanPlayer || p2 === state.humanPlayer) return;
  // Traktaty między komputerami (sprawdzane po ustawieniu kontaktu — dosłownie jak we wzorcu)
  if (((p1 + p2 + state.turn) & 3) !== 0 && A.diplomacy[p2]! & Diplomacy.Contact) return;
  if (A.diplomacy[p2]! & Diplomacy.Vendetta || B.diplomacy[p1]! & Diplomacy.Vendetta) return;
  const seen = embassyWith(state, p1) || embassyWith(state, p2);
  if ((!isStronger(state, p1, p2) || playerHasWonder(state, p2, WonderId.GreatWall) || peaceful(state, p1)) &&
    (!isStronger(state, p2, p1) || playerHasWonder(state, p1, WonderId.GreatWall) || peaceful(state, p2))) {
    exchangeTechnologies(state, p1, p2);
    if (!(A.diplomacy[p2]! & Diplomacy.Peace)) {
      if (seen) state.events.push({ kind: 'message', style: 'diplomats', text: `${A.nationPlural} and\n${B.nationPlural} sign\na peace treaty.\n` });
      setDiplomacyFlags(state, p1, p2, Diplomacy.Peace);
    }
    return;
  }
  if (A.diplomacy[p2]! & Diplomacy.Peace && A.diplomacy[p2]! & Diplomacy.Contact) {
    if (seen) {
      state.events.push({ kind: 'message', style: 'diplomats', text: `${A.nationPlural} and\n${B.nationPlural} cancel\npeace treaty.\n` });
    }
    clearDiplomacyFlags(state, p1, p2, Diplomacy.Peace);
  }
}

/**
 * Część UpdatePlayerGovernmentAndDiplomacy po zmianie ustroju: traktaty pokojowe wygasają losowo (1/3 na turę,
 * po czym wojna jest wypowiedziana), co 16 tur kontakt formalny wygasa, a komputer w potrzebie prosi człowieka
 * o pomoc (*HELPME) albo wspólną wojnę (*CRUSADE) — jako zdarzenia `aiRequest`.
 */
export function diplomacyTurn(state: GameState, player: number): void {
  const pl = state.players[player]!;
  const h = state.humanPlayer;
  for (let i = 1; i < 8; i++) {
    if (pl.diplomacy[i]! & Diplomacy.PeaceTreaty && state.rng.next(3) === 0) {
      pl.diplomacy[i]! &= ~(Diplomacy.PeaceTreaty | Diplomacy.Peace);
      pl.diplomacy[i]! |= Diplomacy.WarDeclared;
    }
    if ((state.turn & 0xf) === 0) {
      if (!(pl.diplomacy[i]! & Diplomacy.FormalContact)) {
        if (pl.diplomacy[i]! & Diplomacy.Contact && !(pl.diplomacy[i]! & Diplomacy.Peace) &&
          (embassyWith(state, player) || embassyWith(state, i)) && player !== h && i !== h) {
          state.events.push({ kind: 'message', style: 'diplomats',
            text: `The war between\nthe ${pl.nationPlural} and the\n${state.players[i]!.nationPlural} has ended.\n` });
        }
        pl.diplomacy[i]! &= ~Diplomacy.Contact;
        state.players[i]!.diplomacy[player]! &= ~Diplomacy.Contact;
      }
      pl.diplomacy[i]! &= ~Diplomacy.FormalContact;
      state.players[i]!.diplomacy[player]! &= ~Diplomacy.FormalContact;
    }
  }
  if (player === 0 || player === h || (state.turn & 0x1f) !== player * 4) return;
  const H = state.players[h]!;
  for (let i = 1; i < 8; i++) {
    const enemy = state.players[i]!;
    if (pl.diplomacy[i]! & Diplomacy.EverFought && H.diplomacy[i]! & Diplomacy.Peace && !(pl.diplomacy[h]! & Diplomacy.EverFought)) {
      if (pl.militaryPower * 2 < enemy.militaryPower) {
        const amount = Math.min(10, Math.max(1, Math.trunc(pl.gold / 100))) * 50;
        state.events.push({ kind: 'aiRequest', request: 'helpme', player, enemy: i, amount });
      }
      if (enemy.militaryPower > pl.militaryPower && pl.militaryPower * 2 >= enemy.militaryPower) {
        state.events.push({ kind: 'aiRequest', request: 'crusade', player, enemy: i, extend: (pl.diplomacy[h]! & Diplomacy.Peace) !== 0 });
      }
    }
    pl.diplomacy[i]! &= ~Diplomacy.EverFought;
  }
}

/** Zgoda człowieka na prośbę komputera (*HELPME: dopłata i sojusz przeciw wrogowi; *CRUSADE: pokój i wspólna wojna). */
export function acceptAiRequest(state: GameState, request: 'helpme' | 'crusade', player: number, enemy: number, amount = 0): void {
  const h = state.humanPlayer;
  if (request === 'helpme') {
    state.players[h]!.gold -= amount;
    state.players[player]!.gold += amount;
  }
  setDiplomacyFlags(state, player, h, Diplomacy.Peace);
  clearDiplomacyFlags(state, enemy, h, Diplomacy.Peace);
  state.players[enemy]!.diplomacy[h]! |= Diplomacy.Vendetta;
  if (request === 'crusade') state.players[player]!.contactCountdown = state.turn + 16;
}
