/**
 * Hall of Fame i „Famous persons”. Źródło: HallOfFame.cs (ShowHallOfFameWindow, AddNewEntryToHallOfFame,
 * ShowFamousPersonsWindow), HallOfFameEntry.cs (format FAME.DTA), UnitManagement.F0_1866_260e_DrawRandomFoodIcons
 * z OpenCivOne (MIT). Wyniki zapisywane w folderze danych aplikacji (nie w folderze gry); przy pierwszym uruchomieniu
 * wczytywany jest FAME.DTA z kopii gry, jeśli jest.
 */
import {
  addHallOfFameEntry, civilizationRating, DIFFICULTY_TITLES, emptyHallOfFame, FAMOUS_PERSONS, famousPersonIndex, type HallOfFameEntry,
} from '@civ-remake/engine';
import { isKey } from '../input';
import { yearToString } from '../text';
import type { Ui } from '../ui';

/** Magazyn tabeli wyników (w aplikacji: plik w folderze danych). */
export interface FameStore {
  read(): Promise<HallOfFameEntry[] | null>;
  write(entries: HallOfFameEntry[]): Promise<void>;
}

/** HallOfFameEntry.ReadFromStream: 6 rekordów po 46 bajtów (7 słów 16-bit + dwa napisy po 16 bajtów). */
export function decodeFameDta(data: Uint8Array): HallOfFameEntry[] {
  const entries = emptyHallOfFame();
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const str = (o: number) => {
    let s = '';
    for (let i = 0; i < 15 && o + i < data.length && data[o + i] !== 0; i++) s += String.fromCharCode(data[o + i]!);
    return s;
  };
  for (let i = 0; i < 6 && (i + 1) * 46 <= data.length; i++) {
    const o = i * 46;
    const w = (k: number) => view.getInt16(o + k * 2, true);
    entries[i] = {
      totalScore: w(0), difficulty: w(1), finalYear: w(3), achievements: w(4), citizens: w(5), population: w(6),
      leader: str(o + 14), nation: str(o + 30),
    };
  }
  return entries;
}

/** Liczba ludności jak PopulationValueToString: wartość × 1000 z separatorami tysięcy. */
const populationText = (value: number) => (value * 1000).toLocaleString('en-US');

/** ShowHallOfFameWindow: zwraca true, gdy przy nowym wpisie (`highlight` ≠ -1) wciśnięto C (Clear). */
export async function showHallOfFame(ui: Ui, entries: readonly HallOfFameEntry[], highlight = -1): Promise<boolean> {
  const g = ui.gfx;
  g.fillRect(0, 0, 320, 200, 15);
  g.drawCenteredString('CIVILIZATION', 160, 16, 0);
  g.drawCenteredString('HALL OF FAME', 160, 24, 0);
  g.drawLine(80, 32, 240, 32, 14);
  let y = 40;
  entries.forEach((e, i) => {
    const x = 8;
    if (e.totalScore <= 0) {
      g.drawString(' ---', 8, y, 0);
      y += 26;
      return;
    }
    g.drawString(`${i + 1}. ${e.leader}, ${DIFFICULTY_TITLES[e.difficulty] ?? ''} of the ${e.nation} to ${yearToString(e.finalYear)}`, x, y, 0);
    y += 8;
    g.drawString(`Population: ${populationText(e.population)}, Score: ${e.totalScore}`, x + 12, y, 7);
    y += 8;
    g.drawString(`    --- CIVILIZATION RATING: ${civilizationRating(e.totalScore, e.difficulty)}% ---`, x + 12, y, 12);
    y += 10;
    if (i === highlight) g.screen.replaceColor(x - 4, y - 28, 296, 26, 15, 14);
  });
  if (highlight !== -1) {
    g.drawString("'C\x83lear'", 252, 189, 0);
    g.drawRectangle(236, 187, 60, 10, 11);
  }
  ui.present();
  ui.input.clear();
  const e = await ui.waitKeyOrClick();
  return highlight !== -1 && (isKey(e, 'c') || isKey(e, 'C'));
}

/** DrawRandomFoodIcons: ramka ekranu z ikon 8×8 z ekranu 2 (SP299.PIC). */
function drawFoodFrame(ui: Ui, rnd: () => number): void {
  const g = ui.gfx;
  const x = rnd() * 32 + 192;
  const y = 120;
  g.copy(2, x, 120, 8, 8, 0, 0, 0);
  g.copy(2, x + 8, 120, 8, 8, 0, 312, 0);
  g.copy(2, x + 24, 120, 8, 8, 0, 312, 192);
  g.copy(2, x + 16, 120, 8, 8, 0, 0, 192);
  for (let i = 1; i < 24; i++) {
    g.copy(2, x + 24, y + 8, 8, 8, 0, 0, i * 8);
    g.copy(2, x + 8, y + 8, 8, 8, 0, 312, i * 8);
  }
  for (let i = 1; i < 39; i++) {
    g.copy(2, x, y + 8, 8, 8, 0, i * 8, 0);
    g.copy(2, x + 16, y + 8, 8, 8, 0, i * 8, 192);
  }
}

/** ShowFamousPersonsWindow (wariant z wynikiem): „Sire, your Civilization Rating of …% exceeds even …!”. */
export async function showFamousPersons(ui: Ui, score: number, difficulty: number, rnd: () => number): Promise<void> {
  const index = famousPersonIndex(score, difficulty);
  if (index < 0) return;
  const g = ui.gfx;
  g.copy(0, 0, 0, 320, 200, 1, 0, 0);
  g.fillRect(0, 0, 320, 200, 15);
  drawFoodFrame(ui, rnd);
  g.copy(2, 200, 140, 40, 60, 0, 10, 10);
  g.copy(2, 240, 140, 40, 60, 0, 270, 10);
  const font = g.fontId;
  g.fontId = 7;
  g.fillRectangleWithPattern(80, 4, 160, 27);
  g.drawShadowRectangle(80, 4, 159, 26, 11, 8);
  g.drawCenteredString('Sire, your Civilization', 160, 6, 15);
  g.drawCenteredString(`Rating of ${civilizationRating(score, difficulty)}% exceeds even`, 160, 14, 15);
  g.drawCenteredString(`${FAMOUS_PERSONS[index]}!`, 160, 22, 15);
  for (let i = 0; i <= index; i++) g.drawCenteredString(FAMOUS_PERSONS[i]!, 160, 184 - i * 8, i === index ? 0 : 7);
  g.screen.replaceColor(80, 183 - index * 8, 160, 8, 15, 14);
  ui.present();
  ui.input.clear();
  await ui.waitKeyOrClick();
  g.fontId = font;
  g.copy(1, 0, 0, 320, 200, 0, 0, 0);
}

/** EndGame: postaci sławne, potem dopisanie do Hall of Fame (C = wyczyść tabelę i pokaż ponownie). */
export async function endGameHallOfFame(ui: Ui, store: FameStore | undefined, initial: HallOfFameEntry[] | null,
  entry: HallOfFameEntry, rnd: () => number): Promise<void> {
  await showFamousPersons(ui, entry.totalScore, entry.difficulty, rnd);
  let entries = (store ? await store.read() : null) ?? initial ?? emptyHallOfFame();
  for (;;) {
    const rank = addHallOfFameEntry(entries, entry);
    if (store) await store.write(entries);
    if (!(await showHallOfFame(ui, entries, rank))) return;
    entries = emptyHallOfFame();
  }
}
