/**
 * Ustawienia nowej gry na ekranie DIFFS.PIC — StartGameMenu.F5_0000_0000_InitNewGameData (OpenCivOne, MIT):
 * poziom trudności, liczba cywilizacji, plemię, imię władcy, a na koniec tekst powitalny (*INIT z KING.TXT).
 * Funkcja zbiera tylko wybory gracza; stan gry tworzy silnik (`newGame`), a tekst powitalny pokazuje `showInitText`
 * — w oryginale po przydzieleniu startowych technologii, dlatego jest osobno.
 */
import { NATIONS } from '@civ-remake/engine';
import type { GameAssets } from '../assets';
import { playerNameDialog, tribeNameDialog } from '../editBox';
import { showMenuBox } from '../menuBox';
import { kingSectionText } from '../text';
import type { Ui } from '../ui';
import type { MapChoice } from './mainMenu';

export interface NewGameSettings {
  readonly map: MapChoice;
  /** 0 Chieftain … 4 Emperor. */
  readonly difficulty: number;
  /** Liczba przeciwników komputerowych 2–6 (AIOpponentCount); cywilizacji jest o jedną więcej. */
  readonly opponents: number;
  /** Maska aktywnych graczy 0–7 (ActiveCivilizations, bit 0 = barbarzyńcy). */
  readonly activeCivilizations: number;
  /** Numer gracza człowieka 1–7. */
  readonly humanPlayer: number;
  /** Numer nacji 0–15 w tabeli NATIONS (gracz k ma nację k albo k + 8). */
  readonly nationalityId: number;
  readonly leaderName: string;
  /** Naród w liczbie mnogiej, np. "Romans". */
  readonly nation: string;
  /** Przymiotnik, np. "Roman". */
  readonly nationality: string;
  /** Gracz wpisał własną nazwę plemienia (Esc przy wyborze plemienia). */
  readonly customTribe: boolean;
}

export const DIFFICULTY_MENU = 'Difficulty Level...\n Chieftain (easiest)\n Warlord\n Prince\n King\n Emperor (toughest)\n';
export const DIFFICULTY_NAMES = ['Chieftain', 'Warlord', 'Prince', 'King', 'Emperor'] as const;

/** Naród w liczbie mnogiej: gdy tabela nie ma osobnej nazwy, oryginał dodaje 's' do przymiotnika. */
export const nationPlural = (id: number) => NATIONS[id]!.plural || NATIONS[id]!.adjective + 's';

export function competitionMenu(): string {
  let text = 'Level of Competition...\n ';
  for (let i = 7; i > 2; i--) text += `${i} Civilizations\n `;
  return text;
}

export function tribeMenu(opponents: number): string {
  let text = 'Pick your tribe...\n ';
  for (let i = 1; i < opponents + 2; i++) text += `${NATIONS[i]!.adjective}\n `;
  for (let i = 1; i < opponents + 2; i++) text += `${NATIONS[8 + i]!.adjective}\n `;
  return text;
}

/** Portret władcy dla poziomu trudności z ekranu 1 (DIFFS.PIC): 53×47. */
function drawDifficultyImage(ui: Ui, difficulty: number, x: number, y: number): void {
  ui.gfx.copy(1, difficulty & 1 ? 80 : 21, 35 * difficulty + 6, 53, 47, 0, x, y);
}

export interface InitNewGameOptions {
  /** Losowanie (0 ≤ wynik < n) — przy własnym plemieniu numer gracza jest losowy. */
  readonly random?: (n: number) => number;
}

export async function initNewGameData(ui: Ui, assets: GameAssets, map: MapChoice, options: InitNewGameOptions = {}): Promise<NewGameSettings> {
  const gfx = ui.gfx;
  const random = options.random ?? ((n: number) => Math.floor(Math.random() * n));

  gfx.loadPic(1, 0, 0, assets.pic('DIFFS.PIC'), assets.file('DIFFS.PIC'), true);
  gfx.copy(1, 0, 0, 320, 200, 0, 0, 0);
  gfx.fontId = 7;

  // poziom trudności; kliknięcie w portret po lewej (x < 135) wybiera poziom według wysokości
  const d = await showMenuBox(ui, DIFFICULTY_MENU, 160, 35, { frame: false, clearInput: true });
  let difficulty = d.index;
  if (d.mousePressed && d.mouse.x < 135) difficulty = clamp(Math.trunc((d.mouse.y - 12) / 35), 0, 4);
  // Odstępstwo: wzorzec poprawia tylko wartości < -1, więc Esc dawał poziom -1; tu Esc = Chieftain.
  if (difficulty < 0) difficulty = 0;

  gfx.fillRect(0, 0, 150, 200, 0);
  drawDifficultyImage(ui, difficulty, 20, 100);
  gfx.copy(1, 150, 0, 160, 200, 0, 150, 0);

  let competition = -1;
  while (competition === -1) competition = (await showMenuBox(ui, competitionMenu(), 160, 35, { frame: false, clearInput: true })).index;
  const opponents = clamp(6 - competition, 2, 6);
  const activeCivilizations = 0xff >> (6 - opponents);
  for (let i = opponents; i >= 0; i--) drawDifficultyImage(ui, difficulty, i * 2 + 20, i * 3 + 100);

  gfx.copy(1, 150, 0, 160, 200, 0, 150, 0);
  const tribe = (await showMenuBox(ui, tribeMenu(opponents), 160, 35, { frame: false, clearInput: true })).index;

  let humanPlayer: number;
  let nationalityId: number;
  let leaderName: string;
  let nation: string;
  let nationality: string;
  const customTribe = tribe === -1;
  if (!customTribe) {
    // opcje 0..opponents to nacje 1..opponents+1, dalsze to nacje 9..
    const id = tribe <= opponents ? tribe + 1 : tribe - opponents + 8;
    humanPlayer = id & 7;
    nationalityId = id > 7 ? humanPlayer + 8 : humanPlayer;
    leaderName = NATIONS[nationalityId]!.leader;
    nationality = NATIONS[nationalityId]!.adjective;
    nation = nationPlural(nationalityId);
  } else {
    // Esc: własne plemię w losowym miejscu
    humanPlayer = random(opponents) + 1;
    nationalityId = humanPlayer;
    leaderName = NATIONS[humanPlayer]!.leader;
    const named = await tribeNameDialog(ui, nationPlural(humanPlayer));
    nation = named.nation;
    nationality = named.nationality;
  }

  gfx.drawCenteredString(nation, 46, 92, 15);
  gfx.fillRect(150, 0, 170, 200, 0);
  ui.present();
  leaderName = await playerNameDialog(ui, leaderName);
  gfx.fontId = 1;

  return { map, difficulty, opponents, activeCivilizations, humanPlayer, nationalityId, leaderName, nation, nationality, customTribe };
}

/**
 * Tekst powitalny (koniec F5_0000_0000_InitNewGameData): białe tło z ramką z ikon jedzenia,
 * portret władcy i tekst *INIT z KING.TXT z listą znanych technologii. Bez KING.TXT ekran jest pomijany.
 */
export async function showInitText(
  ui: Ui, assets: GameAssets, settings: Pick<NewGameSettings, 'nation' | 'leaderName' | 'difficulty'>, technologies: readonly string[],
): Promise<void> {
  const king = assets.optional('KING.TXT');
  const section = king ? kingSectionText(king, '*INIT', { US: settings.nation, RPLC1: settings.leaderName }) : null;
  if (section === null) return;
  const gfx = ui.gfx;
  // F5_0000_0000 L06b6: nazwy znanych technologii z ", ", po drugiej — "\n"; na końcu "and Roads.\n"
  let text = section;
  technologies.forEach((t, i) => {
    text += `${t}, `;
    if (i === 1) text += '\n';
  });
  text += 'and Roads.\n';

  gfx.fillRect(0, 0, 320, 200, 15);
  drawRandomFoodIcons(ui);
  drawDifficultyImage(ui, settings.difficulty, 134, 20);
  gfx.drawTextBlockUnits(text, 0x63, 88, 81, 0);
  ui.present();
  ui.input.clear();
  await ui.waitKeyOrClick();
}

/** UnitManagement.F0_1866_260e_DrawRandomFoodIcons — ramka ekranu z ikon 8×8 z ekranu 2 (SP299.PIC). */
export function drawRandomFoodIcons(ui: Ui, random: (n: number) => number = (n) => Math.floor(Math.random() * n)): void {
  const gfx = ui.gfx;
  const x = random(2) * 32 + 192;
  const y = 120;
  gfx.copy(2, x, y, 8, 8, 0, 0, 0);
  gfx.copy(2, x + 8, y, 8, 8, 0, 312, 0);
  gfx.copy(2, x + 24, y, 8, 8, 0, 312, 192);
  gfx.copy(2, x + 16, y, 8, 8, 0, 0, 192);
  for (let i = 1; i < 24; i++) {
    gfx.copy(2, x + 24, y + 8, 8, 8, 0, 0, i * 8);
    gfx.copy(2, x + 8, y + 8, 8, 8, 0, 312, i * 8);
  }
  for (let i = 1; i < 39; i++) {
    gfx.copy(2, x, y + 8, 8, 8, 0, i * 8, 0);
    gfx.copy(2, x + 16, y + 8, 8, 8, 0, i * 8, 192);
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
