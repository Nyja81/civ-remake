/**
 * Okna karawany i dyplomaty człowieka (silnik: packages/engine/src/game/unitActions.ts):
 *   karawana we własnym mieście — „Will you?” (100, 80): Keep moving / Establish trade route / Help build WONDER
 *                                   (PlayerTurn.MoveUnit, Segment_1403 L2066–L20dd, Var_b276 = 2 przy cudzie blisko),
 *   przekupienie jednostki        — „… will desert for …$.” (100, 80): Forget it. / Pay (F22_0000_0639),
 *   dyplomata w obcym mieście     — „… diplomat arrives in …” (80, 80), sześć opcji z maską nieaktywnych
 *                                   (F22_0000_0000, L0078–L00d2), potem: pytanie o traktat (ConfirmAttackAction),
 *                                   „Dissidents in …” (100, 80), raport wywiadu (F14_0000_1164), okno miasta
 *                                   (ProcessCityState1AndRefreshMap — cudze miasto tylko do podglądu), rozmowa z władcą.
 * Komunikaty skutków (kradzież, sabotaż, bunt, przychód karawany) silnik zgłasza zdarzeniami `message`
 * z położeniem okna (`dialogX`, `dialogY`) — pokazuje je `GameScreen.processEvents`.
 */
import { diplomatAction, unitMove, type DiplomatResult, type GameState, type KingMeeting, type MoveResult } from '@civ-remake/engine';
import { showDialog, showMenuBox } from '../menuBox';
import type { Ui } from '../ui';

/** Działania ekranu gry potrzebne oknom dyplomaty. */
export interface UnitActionHooks {
  /** Rozmowa z władcą (screens/king.ts). */
  kingMeeting(meeting: KingMeeting): Promise<void>;
  /** Okno miasta (dla obcego miasta — podgląd). */
  showCity(cityId: number): Promise<void>;
  /** Raport wywiadu o graczu (szczegóły F14_0000_1164). */
  intelligence(player: number): Promise<void>;
  /** Przerysowanie mapy i panelu po zamknięciu okna. */
  redraw(): void;
}

/**
 * Prowadzi pytania silnika po ruchu jednostki człowieka (`unitMove`) aż do wyniku końcowego: okno karawany,
 * okno przekupienia, menu dyplomaty z kolejnymi oknami. Zwraca ostatni wynik ruchu.
 */
export async function resolveUnitAction(ui: Ui, state: GameState, unitId: number, direction: number, result: MoveResult,
  hooks: UnitActionHooks): Promise<MoveResult> {
  const h = state.humanPlayer;
  for (let guard = 0; guard < 4; guard++) {
    if (result.kind === 'caravan') {
      const choice = await showDialog(ui, result.question, 100, 80, result.disabled);
      hooks.redraw();
      result = unitMove(state, h, unitId, direction, { caravan: choice });
    } else if (result.kind === 'bribe') {
      const choice = await showDialog(ui, result.question, 100, 80);
      hooks.redraw();
      result = unitMove(state, h, unitId, direction, { bribe: result.canPay && choice === 1 });
    } else if (result.kind === 'diplomat') {
      const choice = await showDialog(ui, result.question, 80, 80, result.disabled);
      hooks.redraw();
      await runDiplomatAction(ui, state, unitId, result.city, choice, hooks);
      return result;
    } else return result;
  }
  return result;
}

/**
 * Wykonuje wybraną akcję dyplomaty (DiplomatActions.F22_0000_0000) z oknami pośrednimi.
 * `choice` — numer opcji menu (0–5) albo -1 (Esc: dyplomata zostaje).
 */
export async function runDiplomatAction(ui: Ui, state: GameState, unitId: number, cityId: number, choice: number,
  hooks: UnitActionHooks): Promise<void> {
  const h = state.humanPlayer;
  let r: DiplomatResult = diplomatAction(state, h, unitId, cityId, choice);
  for (let guard = 0; guard < 4; guard++) {
    switch (r.kind) {
      case 'confirm': {
        // F0_29f3_0c9e_ConfirmAttackAction: opcja 1 = zerwanie traktatu
        const answer = (await showMenuBox(ui, r.question, 100, 80, { clearInput: true })).index;
        hooks.redraw();
        if (answer !== 1) return;
        r = diplomatAction(state, h, unitId, cityId, choice, { confirm: true });
        break;
      }
      case 'revolt': {
        const answer = await showDialog(ui, r.question, 100, 80);
        hooks.redraw();
        r = diplomatAction(state, h, unitId, cityId, choice, { revolt: answer });
        break;
      }
      case 'embassy':
        await hooks.intelligence(r.target);
        hooks.redraw();
        return;
      case 'investigate':
        await hooks.showCity(r.city);
        hooks.redraw();
        return;
      case 'meeting':
        await hooks.kingMeeting(r.meeting);
        return;
      default:
        return;
    }
  }
}
