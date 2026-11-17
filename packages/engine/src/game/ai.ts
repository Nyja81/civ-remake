/**
 * Przeciwnik komputerowy (etap 6) — AIEngine z OpenCivOne (MIT).
 * Na razie jednostki komputera stoją w miejscu (ufortyfikowane albo pomijają turę).
 */
import type { GameState } from './types';
import { unitOrder } from './turn';

export function aiPlayerTurnStart(_state: GameState, _player: number): void {}

export function aiMoveUnit(state: GameState, player: number, unitId: number): void {
  unitOrder(state, player, unitId, 'skip');
}
