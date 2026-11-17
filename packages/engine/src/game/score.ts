/**
 * Punktacja cywilizacji. Źródło: GameEngine.F20_0000_0ca9_ShowCivilizationScorePopup z OpenCivOne (MIT) — część licząca
 * (okno rysuje interfejs). Wynik liczony dla człowieka jak w oryginale (wartości zapisywane w polach gracza człowieka).
 */
import { processCity } from './economy';
import type { GameState } from './types';

export interface CivilizationScore {
  /** Mieszkańcy: rozmiar + zadowoleni − niezadowoleni (przy luksusie 40%). */
  citizens: number;
  /** Cuda: 20 za każdy. */
  wonders: number;
  /** Statek kosmiczny: sukces% × koloniści / 2; liczony do wyniku tylko w roku przylotu. */
  spaceship: number;
  spaceshipArrived: boolean;
  /** Zanieczyszczenie: −10 za pole. */
  pollution: number;
  /** Pokój: 3 za turę po naszej erze, najwyżej 100. */
  peace: number;
  /** Technologie przyszłości: 5 za każdą. */
  futureTech: number;
  /** Premia za podbój świata albo -1. */
  bonus: number;
  total: number;
  /** Liczby mieszkańców wg kategorii do rysunku (zadowoleni, zwykli, niezadowoleni, specjaliści) — dla każdego miasta. */
  cities: { happy: number; content: number; unhappy: number; specialists: number }[];
}

export function civilizationScore(state: GameState, player: number, conquest = state.gameOver === 1): CivilizationScore {
  const p = state.players[player]!;
  const oldTax = p.taxRate;
  p.taxRate = 6 - p.scienceRate;
  let citizens = 0;
  const cities: CivilizationScore['cities'] = [];
  state.cities.forEach((c, i) => {
    if (c.status === -1 || c.owner !== player) return;
    const r = processCity(state, i, 1);
    if (!r) return;
    cities.push({ happy: r.happy, content: c.size - r.happy - r.unhappy - r.specialists, unhappy: r.unhappy, specialists: r.specialists });
    citizens += c.size + r.happy - r.unhappy;
  });
  p.taxRate = oldTax;
  let wonders = 0;
  for (let w = 1; w < 22; w++) {
    const c = state.wonderCity[w]!;
    if (c !== -1 && c !== 128 && state.cities[c]!.owner === player) wonders += 20;
  }
  let total = wonders + citizens;
  const h = state.players[state.humanPlayer]!;
  let spaceship = 0;
  const spaceshipArrived = h.spaceshipEta === state.year;
  if (h.spaceshipPopulation !== 0 && h.spaceshipSuccess !== 0) {
    spaceship = Math.max(Math.trunc((h.spaceshipSuccess * h.spaceshipPopulation) / 2), 0);
    if (spaceshipArrived) total += spaceship;
  }
  const pollution = state.pollutedSquares * -10;
  total += pollution;
  const peace = state.year > 0 && state.peaceTurns !== 0 ? Math.min(100, Math.max(0, state.peaceTurns * 3)) : 0;
  total += peace;
  const futureTech = h.futureTechs * 5;
  total += futureTech;
  if (total < 0) total = 0;
  const bonus = conquest ? (550 - state.turn) * 2 + state.aiOpponents * 100 + 400 : -1;
  if (bonus > total) total = bonus;
  return { citizens, wonders, spaceship, spaceshipArrived, pollution, peace, futureTech, bonus, total, cities };
}
