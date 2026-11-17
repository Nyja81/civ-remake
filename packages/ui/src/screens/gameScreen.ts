/**
 * Ekran gry w układzie oryginału (320×200):
 *   pasek menu (0,0)–(320,8)                       — Menus.F0_1238_0fea_DrawMainMenu,
 *   minimapa (0,8) 80×50                            — MapManagement.F0_2aea_0008_DrawVisibleMap,
 *   panel pałacu, roku i skarbca (0,58) 80×39       — GameEngine.F0_1238_107e_ReportHumanTaxAndPopulation,
 *   panel jednostki (0,97) 80×103                   — PlayerTurn.F0_1403_4060_DrawStatusPanel,
 *   mapa (80,8) 15×12 pól po 16 pikseli.
 * Rozwijane menu: Menus.F0_2c84_0000_ShowTopMenu i podmenu. Źródło: OpenCivOne (MIT).
 *
 * Interfejs nie zna jeszcze zasad gry: nie ma jednostek, miast ani mgły wojny (robi je silnik w osobnym wątku pracy),
 * dlatego panel jednostki pokazuje stan „End of Turn”, a cała mapa jest odkryta (hak `isVisible`).
 */
import { MAP_HEIGHT, MAP_WIDTH, Terrain, type World } from '@civ-remake/engine';
import { renderTerrain, type IndexedImage } from '@civ-remake/gfx';
import type { GameAssets } from '../assets';
import { colorCode } from '../font';
import { isKey, type UiEvent } from '../input';
import { showDialog, showMenuBox } from '../menuBox';
import { Palette, readPaletteRange } from '../palette';
import { yearToString } from '../text';
import type { Ui } from '../ui';
import type { NewGameSettings } from './newGame';

export const MAP_VIEW = { x: 80, y: 8, columns: 15, rows: 12, cell: 16 } as const;

/** Etykiety paska menu. Pierwsza litera biała (15), reszta szara (kod koloru 7) — jak "G\x87AME" we wzorcu. */
export const TOP_MENU_LABELS: readonly { readonly text: string; readonly x: number }[] = [
  { text: `G${colorCode(7)}AME`, x: 8 },
  { text: `O${colorCode(7)}RDERS`, x: 64 },
  { text: `A${colorCode(7)}DVISORS`, x: 128 },
  { text: `W${colorCode(7)}ORLD`, x: 192 },
  // Wzorzec ma tu "ENCYCLOP." (zmiana nazwy w OpenCivOne); oryginał otwiera to menu przez Alt+C — przyjmujemy "CIVILOPEDIA".
  // Do sprawdzenia z napisami w CIV.EXE.
  { text: `C${colorCode(7)}IVILOPEDIA`, x: 240 },
];

export const GAME_MENU = ' Tax Rate\n Luxuries Rate\n FindCity\n Preferences\n Save Game\n REVOLUTION!\n \n View Replay\n Retire\n QUIT\n';
/** Ustawienia gry (bity 0–7 GameSettingFlags). "Civilopedia Text" — we wzorcu "Encyclopedia Text". */
export const PREFERENCES_MENU = 'Game:\n Instant Advice\n AutoSave\n End of Turn\n Animations\n Sound\n Enemy Moves\n Civilopedia Text\n Palace\n';
export const ADVISORS_MENU =
  ' City Status (F1)\n Military Advisor (F2)\n Intelligence Advisor (F3)\n Attitude Advisor (F4)\n Trade Advisor (F5)\n Science Advisor (F6)\n';
export const WORLD_MENU = ' Wonders of the World (F7)\n Top 5 Cities (F8)\n Civilization Score (F9)\n World Map (F10)\n Demographics\n SpaceShips\n';
export const CIVILOPEDIA_MENU = ' Complete\n Technology Advances\n City Improvements\n Unit Types\n Terrain Types\n Miscellaneous\n';

/** Pozycje rozwijanych menu (x, y = 8). */
const MENU_X = [16, 72, 112, 144, 182] as const;

export type GameScreenResult = 'quit' | 'retire';

export interface GameScreenOptions {
  /** Ziarno gry (zasoby specjalne i chaty). */
  readonly seed: number;
  /** Czy pole jest odkryte dla gracza (mgła wojny — dostarczy silnik). Domyślnie wszystko widać. */
  readonly isVisible?: (x: number, y: number) => boolean;
}

export class GameScreen {
  viewX = 0;
  viewY = 0;
  miniMapX = 0;
  miniMapY = 0;
  year = -4000;
  coins: number;
  taxRate = 5;
  scienceRate = 5;
  /** GameSettingFlags: 0 Instant Advice, 1 AutoSave, 2 End of Turn, 3 Animations, 4 Sound, 5 Enemy Moves, 6 Civilopedia Text, 7 Palace. */
  settingFlags: number;
  private readonly terrain: IndexedImage;
  private readonly gamePalette: Palette;
  private readonly isVisible: (x: number, y: number) => boolean;

  constructor(
    private readonly ui: Ui,
    private readonly assets: GameAssets,
    readonly settings: NewGameSettings,
    readonly world: World,
    options: GameScreenOptions,
  ) {
    this.isVisible = options.isVisible ?? (() => true);
    this.terrain = renderTerrain(world, { ter: assets.pic('TER257.PIC'), sp: assets.pic('SP257.PIC'), sp299: assets.pic('SP299.PIC') }, { seed: options.seed });
    this.gamePalette = buildGamePalette(assets);
    this.coins = settings.difficulty === 0 ? 50 : 0;
    // StartGameMenu: Instant Advice tylko na poziomie Chieftain; dźwięk wyłączony (brak sterownika dźwięku)
    this.settingFlags = (settings.difficulty === 0 ? 1 : 0) | 0b0010 | 0b1000 | 0b100000 | 0b1000000 | 0b10000000;
    this.viewX = 33;
    this.viewY = 19;
  }

  /** Główna pętla ekranu gry; kończy się przy Retire albo QUIT. */
  async run(): Promise<GameScreenResult> {
    await this.redrawMapWithBlankingEffect();
    for (;;) {
      const e = await this.ui.input.next();
      const result = await this.handle(e);
      if (result) return result;
    }
  }

  /** Obsługa jednego zdarzenia (osobno, żeby dało się ją testować). */
  async handle(e: UiEvent): Promise<GameScreenResult | null> {
    if (e.type === 'mousedown') {
      if (e.y < 8) return this.showTopMenu(clamp(Math.trunc(e.x / 60), 0, 4));
      if (e.x < 80) {
        if (e.y < 58) {
          // PlayerTurn: kliknięcie w minimapę przesuwa widok
          this.drawVisibleMap(wrapX(e.x - 7 + this.miniMapX), clamp(e.y - 14 + this.miniMapY, 0, 49));
          this.ui.present();
        }
        return null;
      }
      if (e.button === 'left') {
        const cell = this.cellAt(e.x, e.y);
        if (cell) {
          // PlayerTurn: kliknięcie w pole bez jednostki i miasta centruje mapę
          this.drawVisibleMap(cell.x - 7, cell.y - 6);
          this.ui.present();
        }
      }
      return null;
    }
    if (isKey(e)) {
      if (e.alt) {
        const index = { g: 0, o: 1, a: 2, w: 3, c: 4 }[e.key.toLowerCase()];
        if (index !== undefined) return this.showTopMenu(index);
        return null;
      }
      // Tymczasowo (brak jednostek): strzałki przesuwają widok o jedno pole. W oryginale ruszają aktywną jednostką.
      const scroll: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      const d = scroll[e.key];
      if (d) {
        this.drawVisibleMap(this.viewX + d[0], this.viewY + d[1]);
        this.ui.present();
      }
    }
    return null;
  }

  /** Pole mapy pod punktem ekranu albo null. */
  cellAt(x: number, y: number): { x: number; y: number } | null {
    if (x < MAP_VIEW.x || y < MAP_VIEW.y || x >= MAP_VIEW.x + MAP_VIEW.columns * 16 || y >= MAP_VIEW.y + MAP_VIEW.rows * 16) return null;
    return { x: wrapX(Math.trunc((x - 80) / 16) + this.viewX), y: Math.trunc((y - 8) / 16) + this.viewY };
  }

  /** GameEngine.F0_1238_1b44_RedrawMapWithBlankingEffect — wygaszenie, narysowanie ekranu, rozjaśnienie paletą gry. */
  async redrawMapWithBlankingEffect(): Promise<void> {
    await this.ui.fadePalette([0, 0, 0], 5);
    this.drawVisibleMap(this.viewX, this.viewY);
    this.drawStatusPanel();
    await this.ui.fadePalette(this.gamePalette, 5);
  }

  /** Menus.F0_1238_0fea_DrawMainMenu */
  drawMainMenu(): void {
    const gfx = this.ui.gfx;
    gfx.fillRect(0, 0, 320, 8, 0);
    for (const label of TOP_MENU_LABELS) gfx.drawString(label.text, label.x, 1, 15);
  }

  /** MapManagement.F0_2aea_0008_DrawVisibleMap — pasek menu, panel stanu, pola mapy i minimapa. */
  drawVisibleMap(x: number, y: number): void {
    const gfx = this.ui.gfx;
    this.drawMainMenu();
    this.reportTaxAndPopulation();
    this.viewX = wrapX(x);
    this.viewY = clamp(y, 0, MAP_HEIGHT - MAP_VIEW.rows);

    for (let i = 0; i < MAP_VIEW.columns; i++) {
      for (let j = 0; j < MAP_VIEW.rows; j++) {
        const mapX = wrapX(this.viewX + i);
        const mapY = this.viewY + j;
        const sx = MAP_VIEW.x + i * 16;
        const sy = MAP_VIEW.y + j * 16;
        if (this.isVisible(mapX, mapY)) gfx.screen.blit(this.terrain, mapX * 16, mapY * 16, 16, 16, sx, sy);
        else gfx.fillRect(sx, sy, 16, 16, 0);
      }
    }

    // Minimapa: widok zawsze w tym samym miejscu (prostokąt 31,26), mapa przesuwa się pod nim.
    // Odstępstwo: wzorzec liczy przesunięcie z argumentów przed przycięciem; tu z położenia po przycięciu.
    // Bez technologii Navigation minimapa przesuwa się też w pionie (yMap = y − 19).
    this.miniMapX = this.viewX - 32;
    this.miniMapY = this.viewY - 19;
    gfx.fillRect(0, 8, 80, 50, 0);
    for (let r = 0; r < 50; r++) {
      const mapY = r + this.miniMapY;
      if (mapY < 0 || mapY >= MAP_HEIGHT) continue;
      for (let c = 0; c < 80; c++) {
        const mapX = wrapX(c + this.miniMapX);
        if (!this.isVisible(mapX, mapY)) continue;
        // UnitManagement: odkryte pole na minimapie ma kolor 1 (woda) albo 2 (ląd)
        gfx.screen.setPixel(c, r + 8, this.world.terrain[mapY * MAP_WIDTH + mapX] === Terrain.Water ? 1 : 2);
      }
    }
    gfx.drawShadowRectangle(0, 8, 79, 49, 15, 8);
    gfx.drawRectangle(this.viewX - this.miniMapX - 1, this.viewY - this.miniMapY + 7, 17, 10, 15);
  }

  /** GameEngine.F0_1238_107e_ReportHumanTaxAndPopulation — panel pałacu, roku, nauki i skarbca. */
  reportTaxAndPopulation(): void {
    const gfx = this.ui.gfx;
    gfx.fillRectangleWithShadow(0, 58, 80, 39);
    gfx.fillRect(3, 60, 74, 11, 11);
    // Mini-pałac (F0_1238_14a3_DrawMiniPalace): bez miast rysuje się tylko linia podstawy.
    gfx.drawLine(8 - 5, 58 + 13, 8 + 68, 58 + 13, 2);
    gfx.drawString(yearToString(this.year), 2, 81, 0);
    // postęp badań 0–3: żarówka z ekranu 2 (SP299.PIC)
    gfx.copy(2, 160, 120, 8, 8, 0, 48, 80);
    // Odstępstwo: wzorzec wypisuje 10 − tax + science; zakładamy pomyłkę w tłumaczeniu (luksusy = 10 − tax − science).
    const luxury = 10 - this.taxRate - this.scienceRate;
    gfx.drawString(`${this.coins}$ ${luxury}(${this.taxRate}/${this.scienceRate})`, 2, 89, 0);
  }

  /** PlayerTurn.F0_1403_4060_DrawStatusPanel — bez jednostek wariant „End of Turn”. */
  drawStatusPanel(): void {
    const gfx = this.ui.gfx;
    gfx.fillRectangleWithShadow(0, 97, 80, 103);
    gfx.drawString('End of Turn', 4, 124, 0);
    gfx.drawString('Press Enter', 4, 136, 0);
    gfx.drawString('to continue', 4, 144, 0);
  }

  /** Menus.F0_2c84_0000_ShowTopMenu — ekran zapamiętany na ekranie 1 i przywracany po zamknięciu menu. */
  async showTopMenu(index: number): Promise<GameScreenResult | null> {
    const ui = this.ui;
    const gfx = ui.gfx;
    gfx.copy(0, 0, 0, 320, 200, 1, 0, 0);
    let result: GameScreenResult | null = null;
    let action: string | null = null;
    switch (index) {
      case 0: {
        // View Replay dostępne dopiero po końcu gry (SpaceshipFlags & 0x100)
        const r = await showMenuBox(ui, GAME_MENU, MENU_X[0], 8, { disabled: 1 << 7 });
        if (r.index === 3) await this.preferences();
        else if (r.index === 8) result = 'retire';
        else if (r.index === 9) result = 'quit';
        else if (r.index >= 0 && r.index !== 6) action = 'game';
        break;
      }
      case 1:
        // Rozkazy dotyczą aktywnej jednostki; bez niej oryginał nie pokazuje menu.
        break;
      case 2:
        if ((await showMenuBox(ui, ADVISORS_MENU, MENU_X[2], 8)).index >= 0) action = 'advisor';
        break;
      case 3:
        // SpaceShips nieaktywne, dopóki nikt nie buduje statku
        if ((await showMenuBox(ui, WORLD_MENU, MENU_X[3], 8, { disabled: 0x20 })).index >= 0) action = 'world';
        break;
      case 4:
        if ((await showMenuBox(ui, CIVILOPEDIA_MENU, MENU_X[4], 8)).index >= 0) action = 'civilopedia';
        break;
    }
    ui.input.clear();
    gfx.copy(1, 0, 0, 320, 200, 0, 0, 0);
    ui.present();
    if (action) await showDialog(ui, 'Not available yet.\n', 100, 80);
    return result;
  }

  /** Podmenu Preferences z „ptaszkami” przy włączonych ustawieniach; wybór przełącza ustawienie. */
  async preferences(): Promise<void> {
    let defaultIndex = -1;
    for (;;) {
      const r = await showMenuBox(this.ui, PREFERENCES_MENU, 24, 16, { checked: this.settingFlags, defaultIndex });
      if (r.index === -1) return;
      if (!r.help) this.settingFlags ^= 1 << r.index;
      defaultIndex = r.index;
    }
  }
}

/** CommonTools.LoadAndApplyDefaultColorPalette: BACK0A.PAL (despotyzm, starożytność) z kolorami 0–127 z SP256.PAL. */
export function buildGamePalette(assets: GameAssets): Palette {
  const palette = new Palette();
  const sp257 = readPaletteRange(assets.file('SP257.PIC'));
  if (sp257) palette.apply(sp257);
  const back = assets.optional('BACK0A.PAL');
  const sprites = assets.optional('SP256.PAL');
  if (back && sprites) {
    const b = readPaletteRange(back);
    const s = readPaletteRange(sprites);
    if (b) palette.apply(b);
    if (s) palette.apply({ first: s.first, last: Math.min(s.last, 127), rgb: s.rgb.subarray(0, (Math.min(s.last, 127) - s.first + 1) * 3) });
  }
  return palette;
}

const wrapX = (x: number) => ((x % MAP_WIDTH) + MAP_WIDTH) % MAP_WIDTH;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
