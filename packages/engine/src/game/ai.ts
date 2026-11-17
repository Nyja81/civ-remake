/**
 * Przeciwnik komputerowy (etap 6) — AIEngine i GameEngine.SelectCityProduction z OpenCivOne (MIT).
 * TYMCZASOWO: uproszczone zachowanie, żeby gra toczyła się dalej — do zastąpienia przeniesionym AIEngine.
 */
import { UNITS } from '../data/units';
import { playerHasTech } from './techs';
import { NO_UNIT, UnitStatus, type GameState } from './types';
import { unitOrder } from './turn';

export function aiPlayerTurnStart(_state: GameState, _player: number): void {}

/** Jednostki komputera: osadnicy zakładają miasto, reszta fortyfikuje się (tymczasowo). */
export function aiMoveUnit(state: GameState, player: number, unitId: number): void {
  const u = state.players[player]!.units[unitId]!;
  if (u.type === 0 && player !== 0) {
    unitOrder(state, player, unitId, 'build');
    if (state.players[player]!.units[unitId]!.type === NO_UNIT) return;
  }
  if (u.type !== NO_UNIT && UNITS[u.type]!.movementType === 0 && u.type !== 0 && !(u.status & UnitStatus.Fortified)) {
    unitOrder(state, player, unitId, 'fortify');
    return;
  }
  unitOrder(state, player, unitId, 'skip');
}

/**
 * Wybór produkcji (SelectCityProduction) — TYMCZASOWO: obrońca, gdy miasto nie ma jednostki, potem osadnicy.
 * Zwraca numer jednostki (≥0) albo -id budynku; 99 = brak decyzji.
 */
export function aiSelectProduction(state: GameState, player: number, cityId: number): number {
  const city = state.cities[cityId]!;
  const defenders = state.players[player]!.units.filter((u) => u.type !== NO_UNIT && u.x === city.x && u.y === city.y && u.type !== 0).length;
  if (defenders === 0) {
    for (const t of [12, 5, 4, 2, 1]) if (playerHasTech(state, player, UNITS[t]!.requiredTech) && !playerHasTech(state, player, UNITS[t]!.obsoleteTech)) return t;
    return 1;
  }
  return city.size >= 3 ? 0 : 1;
}
