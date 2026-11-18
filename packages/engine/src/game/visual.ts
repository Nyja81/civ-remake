/**
 * Zdarzenia rysunkowe dla interfejsu, wołane SYNCHRONICZNIE w chwili, gdy oryginał rysuje animację: ruch jednostki
 * (UnitManagement.F0_1866_1d55_AnimateUnitMove — przed zmianą położenia) i walka (AttackActions, 0x29f3:0x03de–0x070b —
 * przed rozstrzygnięciem skutków). Silnik nie czeka na animację: interfejs w wywołaniu zapamiętuje obraz mapy z tej chwili
 * i odtwarza animację później. Haczyk nie jest częścią stanu gry (nie trafia do zapisów).
 */
import type { GameState } from './types';

export type VisualEvent =
  | {
    readonly kind: 'move';
    readonly player: number;
    readonly unitId: number;
    readonly type: number;
    /** Pole startowe i kierunek ruchu 1–8. */
    readonly x: number;
    readonly y: number;
    readonly direction: number;
  }
  | {
    readonly kind: 'combat';
    readonly attacker: number;
    readonly attackerUnit: number;
    readonly attackerType: number;
    readonly defender: number;
    readonly defenderUnit: number;
    readonly fromX: number;
    readonly fromY: number;
    readonly x: number;
    readonly y: number;
    readonly attackerWon: boolean;
  };

const hooks = new WeakMap<GameState, (ev: VisualEvent) => void>();

/** Ustawia (albo usuwa) haczyk zdarzeń rysunkowych dla stanu gry. */
export function setVisualHook(state: GameState, hook: ((ev: VisualEvent) => void) | undefined): void {
  if (hook) hooks.set(state, hook);
  else hooks.delete(state);
}

export function emitVisual(state: GameState, ev: VisualEvent): void {
  hooks.get(state)?.(ev);
}
