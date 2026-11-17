/**
 * „--- Civilization Note ---” — porady z HELP.TXT (Help, Overlay 4 w dosłownym tłumaczeniu asemblera ec23ac3):
 * F4_0000_02d3 (okno notatki) i F4_0000_00af (porady dla osadników: miejsce na miasto, kopalnia, nawadnianie, droga).
 * Sprawdzone ze zrzutami oryginału w DOSBoxie (tools/dosbox, scenariusz game.txt).
 */
import {
  cellIndex, canIrrigate, Improvement, MOVE_DIRECTIONS, NO_UNIT, nearestCity, distance, Terrain, TERRAIN, terrainAt, wrapX,
  type GameState,
} from '@civ-remake/engine';
import type { GameAssets } from '../assets';
import { loadTextSectionLines, replaceKeywords } from '../text';
import type { Ui } from '../ui';

/**
 * F4_0000_02d3: tylko przy włączonej Instant Advice i przed naszą erą. Okno (56, 16) 208 × (6·wiersze + 10) w kolorze 2
 * z obrysem 10, tytuł czcionką 2 wyśrodkowany w (160, 19) kolorem 0, tekst sekcji (bez łamania — '^' kończy wiersz)
 * blokiem 256 px od (64, 25) kolorem 15; potem klawisz albo kliknięcie i ekran sprzed okna.
 * Zwraca false, gdy okna nie było.
 */
export async function showCivilizationNote(
  ui: Ui, assets: GameAssets, state: GameState, key: string, values: Parameters<typeof replaceKeywords>[1] = {},
): Promise<boolean> {
  if (!state.settings.instantAdvice || state.year >= 0) return false;
  const file = assets.optional('HELP.TXT');
  const section = file ? loadTextSectionLines(file, key) : null;
  if (!section) return false;
  const text = replaceKeywords(section.text, values);
  const gfx = ui.gfx;
  gfx.copy(0, 0, 0, 320, 200, 1, 0, 0); // F0_1866_25b6
  const height = 6 * section.lines + 10;
  gfx.fillRect(56, 16, 208, height, 2);
  gfx.drawRectangle(56, 16, 208, height, 10);
  const fontId = gfx.fontId;
  gfx.fontId = 2;
  gfx.drawCenteredString('--- Civilization Note ---', 160, 19, 0);
  gfx.drawTextBlockUnits(text, 0x20, 64, 25, 15);
  gfx.fontId = fontId;
  ui.present();
  ui.input.clear();
  await ui.waitKeyOrClick();
  gfx.copy(1, 0, 0, 320, 200, 0, 0, 0); // F0_1866_25d7
  ui.present();
  return true;
}

/**
 * F4_0000_00af — porada dla osadników człowieka (PlayerTurn, raz na turę, gdy pierwszą wybraną jednostką są osadnicy):
 * - pole z żywnością + produkcją ≥ 2, oceną miejsca (warstwa (80 + x, y) strony mapy — u nas `landOwner`) ≥ 10 i nie
 *   mniejszą niż u ośmiu sąsiadów → mapa od nowa w (x − 7, y − 6) i *BUILDCITY;
 * - w przeciwnym razie, gdy najbliższe miasto należy do gracza i jest tuż obok (odległość 1): $RPLC1 = nazwa miasta,
 *   wzgórza bez nawadniania/kopalni → *MINING; równina z dostępem do wody bez nawadniania/kopalni → *IRRIGATE (koniec);
 *   teren o koszcie ruchu 1 bez drogi (nie rzeka), gdy gracz ma mniej niż 2 osadników → *ROAD.
 */
export async function settlerAdvice(
  ui: Ui, assets: GameAssets, state: GameState, player: number, unitId: number, redraw: (x: number, y: number) => void,
): Promise<void> {
  const u = state.players[player]!.units[unitId];
  if (!u || u.type === NO_UNIT) return;
  const map = state.map;
  const t = terrainAt(map, u.x, u.y);
  const def = TERRAIN[t]!;
  let good = def.food + def.production >= 2;
  const score = map.landOwner[cellIndex(u.x, u.y)]!;
  if (score < 10) good = false;
  for (let d = 1; d <= 8; d++) {
    const [dx, dy] = MOVE_DIRECTIONS[d]!;
    const y = u.y + dy;
    const v = y >= 0 && y < 50 ? map.landOwner[cellIndex(wrapX(u.x + dx), y)]! : 0;
    if (v > score) good = false;
  }
  if (good) {
    redraw(u.x - 7, u.y - 6);
    await showCivilizationNote(ui, assets, state, '*BUILDCITY');
    return;
  }
  const c = nearestCity(state, u.x, u.y);
  if (c === -1) return;
  const city = state.cities[c]!;
  if (city.owner !== player || distance(u.x, u.y, city.x, city.y) !== 1) return;
  const imp = map.improvements[cellIndex(u.x, u.y)]!;
  const values = { RPLC1: state.cityNames[city.nameId] ?? '' };
  const worked = Improvement.Irrigation | Improvement.Mine;
  if (t === Terrain.Hills && !(imp & worked)) await showCivilizationNote(ui, assets, state, '*MINING', values);
  if (t === Terrain.Plains && canIrrigate(state, u.x, u.y) && !(imp & worked)) {
    await showCivilizationNote(ui, assets, state, '*IRRIGATE', values);
    return;
  }
  if (def.movementCost === 1 && !(imp & Improvement.Road) && t !== Terrain.River && (state.players[player]!.activeUnits[0] ?? 0) < 2) {
    await showCivilizationNote(ui, assets, state, '*ROAD', values);
  }
}
