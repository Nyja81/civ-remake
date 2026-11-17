/**
 * Ekrany raportów. Źródło: Reports.F14_0000_001c_DrawReportScreen (nagłówek raportu) i
 * GameEngine.F20_0000_0ca9_ShowCivilizationScorePopup (okno „CIVILIZATION SCORE”) z OpenCivOne (MIT).
 * Liczby wyniku liczy silnik (`civilizationScore`); tu tylko rysunek w układzie oryginału.
 */
import { civilizationScore, GOVERNMENT_NAMES, WONDERS, type GameState } from '@civ-remake/engine';
import type { GameAssets } from '../assets';
import { yearToString } from '../text';
import type { Ui } from '../ui';

/** DrawReportScreen: tło w kolorze `fill`, tytuł i nagłówek władcy. */
export function drawReportScreen(ui: Ui, state: GameState, title: string, fill: number): void {
  const g = ui.gfx;
  const h = state.players[state.humanPlayer]!;
  g.fillRect(0, 0, 320, 200, fill);
  g.drawCenteredString(title, 160, 2, 15);
  const kind = h.government <= 1 ? 'Empire' : h.government <= 3 ? 'Kingdom' : 'Republic';
  g.drawCenteredString(`${kind} of the ${h.nationPlural}`, 160, 10, 15);
  g.drawCenteredString(`${GOVERNMENT_NAMES[h.government]} ${h.leader}: ${yearToString(state.year)}`, 160, 18, 15);
}

/**
 * Okno wyniku cywilizacji: mieszkańcy (ikony z SP257.PIC, 8×16), cuda, statek, zanieczyszczenie/pokój/technologie
 * przyszłości, wynik całkowity albo premia za podbój, pasek wyniku na dole. Gdy się nie mieści — zmniejsza odstęp wierszy.
 */
export async function showScoreScreen(ui: Ui, assets: GameAssets, state: GameState, conquest = false): Promise<number> {
  const g = ui.gfx;
  const human = state.humanPlayer;
  const p = state.players[human]!;
  const score = civilizationScore(state, human, conquest);
  const sp = assets.optional('SP257.PIC') ? assets.pic('SP257.PIC') : null;
  const wonderNames = state.wonderCity
    .map((c, w) => (w > 0 && c !== -1 && c !== 128 && state.cities[c]!.owner === human ? w : -1))
    .filter((w) => w > 0);
  for (let step = 8; ; step--) {
    drawReportScreen(ui, state, 'CIVILIZATION SCORE', 3);
    let bx = 999;
    let by = 26;
    // DrawBitmap: kolejna ikona co 8 pikseli; nowy wiersz co `step`, z przesunięciem co drugi wiersz
    const icon = (index: number) => {
      bx += 8;
      if (bx > 292) {
        by += step;
        bx = 16 + ((by >> 1) & 4);
      }
      if (by < 161 && sp) g.screen.blit(sp, index * 8, 128, 8, 16, bx, by, true);
    };
    for (const c of score.cities) {
      for (let j = 0; j < c.happy; j++) icon(j & 1);
      for (let j = 0; j < c.content; j++) icon(2 + (j & 1));
      for (let j = 0; j < c.unhappy; j++) icon(4 + (j & 1));
      // specjaliści: oryginał rozróżnia artystów, poborców i naukowców (GetSpecialWorkerFlags) — tu wspólna ikona
      for (let j = 0; j < c.specialists; j++) icon(6);
    }
    g.drawStringWithShadow(`${p.nationAdjective} Citizens (${score.citizens})`, 16, 26, 15);
    let y = by + 16;
    const y1 = y;
    let x = 999;
    for (const w of wonderNames) {
      if (y >= 180) break;
      x += 152;
      if (x > 300) {
        y += Math.max(8, step + 2);
        x = 16;
      }
      // ikona cudu (DrawWonderOrImprovement) — razem z oknem miasta
      g.drawString(WONDERS[w - 1]?.name ?? '', x + 20, y, 11);
    }
    g.drawStringWithShadow(`${p.nationAdjective} Achievements (${score.wonders})`, 16, y1, 15);
    y += 10;
    if (score.spaceship !== 0 && y < 184) {
      g.drawStringWithShadow(`SpaceShip: (${score.spaceship}${score.spaceshipArrived ? '' : ' possible'})`, 16, y, 15);
      y += 10;
    }
    const extras: string[] = [];
    if (score.pollution !== 0) extras.push(`Pollution: ${score.pollution}`);
    if (score.peace !== 0) extras.push(`Peace: ${score.peace}`);
    if (score.futureTech !== 0) extras.push(`Future Tech: ${score.futureTech}`);
    if (extras.length > 0 && y < 184) {
      g.drawStringWithShadow(extras.join(', '), 16, y, 15);
      y += 10;
    }
    if (y < 186) {
      g.drawStringWithShadow(score.bonus > 0 && score.bonus === score.total ? `Bonus Score: ${score.bonus}` : `Total Score: ${score.total}`, 16, y, 15);
    }
    if (y < 186 || step <= 1) break;
  }
  g.fillRect(35, 192, 250, 7, 8);
  if (score.total > 0) g.fillRect(35, 192, Math.min(250, Math.max(0, score.total >> 2)), 7, 11);
  ui.present();
  await ui.waitKeyOrClick();
  return score.total;
}
