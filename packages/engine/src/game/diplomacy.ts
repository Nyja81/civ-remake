/**
 * Dyplomacja — na razie tylko nawiązanie kontaktu (Diplomacy.UpdateDiplomacyStatus z OpenCivOne, MIT).
 * Rozmowy z władcami (MeetWithKing), traktaty między komputerami, wymiana technologii — etap 7.
 */
import { Diplomacy, type GameState } from './types';

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
  state.players[p1]!.diplomacy[p2]! |= Diplomacy.Contact | Diplomacy.FormalContact;
  state.players[p2]!.diplomacy[p1]! |= Diplomacy.Contact | Diplomacy.FormalContact;
}
