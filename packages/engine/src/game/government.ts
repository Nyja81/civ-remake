/**
 * Ustroje. Źródło: Diplomacy.ChangeCurrentGovernment i rozkaz „Revolution” w PlayerTurn z OpenCivOne (MIT).
 */
import { Tech } from '../data/techs';
import { playerHasWonder } from './cities';
import { WonderId } from './buildings';
import { playerHasTech } from './techs';
import { addReplayData, ReplayKind } from './replay';
import { Government, type GameState } from './types';

/** Ustroje do wyboru po anarchii (Piramidy dają wszystkie). */
export function availableGovernments(state: GameState, player: number): number[] {
  const list: number[] = [];
  const pyramids = playerHasWonder(state, player, WonderId.Pyramids);
  const need: Record<number, number> = { 2: Tech.Monarchy, 3: Tech.Communism, 4: Tech.TheRepublic, 5: Tech.Democracy };
  for (let g = 1; g < 6; g++) {
    if (pyramids) list.push(g);
    else if (g in need && playerHasTech(state, player, need[g]!)) list.push(g);
  }
  if (list.length === 0) list.push(Government.Despotism);
  return list;
}

/** Rewolucja (rozkaz z menu GAME): ustrój zmienia się na anarchię. */
export function revolution(state: GameState, player: number): void {
  state.players[player]!.government = Government.Anarchy;
  state.events.push({ kind: 'news', text: `The ${state.players[player]!.nationPlural} are\nrevolting! Citizens\ndemand new government.\n` });
}

/** ChangeCurrentGovernment (człowiek, po wyborze z listy): wpis do powtórki, gdy ustrój się zmienia. */
export function setGovernment(state: GameState, player: number, government: number): void {
  if (state.players[player]!.government !== government) addReplayData(state, ReplayKind.Government, player, government);
  state.players[player]!.government = government;
  state.events.push({ kind: 'governmentChanged', player, government });
}
