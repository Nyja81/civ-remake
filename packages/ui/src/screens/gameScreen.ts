/**
 * Ekran gry w układzie oryginału (320×200):
 *   pasek menu (0,0)–(320,8)                       — Menus.F0_1238_0fea_DrawMainMenu,
 *   minimapa (0,8) 80×50                            — część MapManagement.F0_2aea_0008_DrawVisibleMap,
 *   panel pałacu, roku i skarbca (0,58) 80×39       — GameEngine.F0_1238_107e_ReportHumanTaxAndPopulation,
 *   panel jednostki (0,97) 80×103                   — PlayerTurn.F0_1403_4060_DrawStatusPanel,
 *   mapa (80,8) 15×12 pól po 16 pikseli            — drawMapView z packages/gfx (teren, mgła, miasta, jednostki).
 * Rozwijane menu: Menus.F0_2c84_0000_ShowTopMenu i podmenu; obsługa wejścia: część PlayerTurn. Źródło: OpenCivOne (MIT).
 *
 * Zasady gry liczy silnik (`packages/engine`): ekran tylko zamienia klawisze i kliknięcia na jego komendy
 * (unitMove, unitOrder, nextUnit, endHumanTurn) i pokazuje zdarzenia jako okna.
 */
import {
  advanceToHuman, aiRequestMeeting, palaceOf, envoyMeeting, meetWithKing, type KingKeywords, type KingMeeting, BUILDINGS, civilizationScore, GOVERNMENT_NAMES, hallOfFameEntry, type HallOfFameEntry, buyCost, CityStatus, buyProduction, cellIndex, chooseResearch, cityAt, endHumanTurn, Improvement, MAP_HEIGHT,
  MovementType, nextUnit, NO_UNIT, playerHasTech, productionOptions, revolution, setGovernment, setProduction, Tech, TECHS,
  TERRAIN, TERRAIN_MODIFICATIONS, PIXEL_TO_TERRAIN, canIrrigate, terrainAt, UNITS, UnitStatus, unitMove, unitOrder, unitsAt, WONDERS, wrapX, type GameEvent, type GameState, type MoveResult, type Order,
} from '@civ-remake/engine';
import { drawMapView, drawMiniMap, drawUnit, prepareSprites, type MapSprites, type TextDrawer } from '@civ-remake/gfx';
import type { GameAssets } from '../assets';
import { colorCode } from '../font';
import { isKey, type KeyEvent, type UiEvent } from '../input';
import { showDialog, showMenuBox } from '../menuBox';
import { editBox } from '../editBox';
import { Palette, readPaletteRange } from '../palette';
import { Surface } from '../surface';
import { loadTextSection, replaceKeywords, textSection, yearToString } from '../text';
import type { Ui } from '../ui';
import { combatTune, longTune, TUNE } from '../sound';
import { showScoreScreen } from './reports';
import { endGameHallOfFame, type FameStore } from './hallOfFame';
import { spaceshipNationDialog, spaceshipPartDialog } from './spaceship';
import { runKingMeeting } from './king';
import { ADVISOR_REPORTS, reportForKey, showHistoryReport, showIntelligenceDetail, showPowerGraph, showReport, WORLD_REPORTS, type AdvisorReport, type WorldReport } from './advisors';
import { resolveUnitAction, type UnitActionHooks } from './unitActions';
import { showCityWindow } from './cityWindow';
import { showCivilopedia, showCivilopediaTopic, Topic } from './civilopedia';
import { settlerAdvice, showCivilizationNote } from './note';
import { displayGameReplay, displayHailTheConqueror } from './replay';
import { autosaveSlot, showSaveGameDialog, type OriginalSaveStore } from './saveGame';
import { civilDisorderAnimation, foundNewCityAnimation, invadersAnimation, loveOurLeaderAnimation, showCityView } from './cityView';
import { drawMiniPalace, showPalaceUpgrade, showPalaceView } from './palace';

export const MAP_VIEW = { x: 80, y: 8, columns: 15, rows: 12, cell: 16 } as const;

/** Etykiety paska menu. Pierwsza litera biała (15), reszta szara (kod koloru 7) — jak "G\x87AME" we wzorcu. */
export const TOP_MENU_LABELS: readonly { readonly text: string; readonly x: number }[] = [
  { text: `G${colorCode(7)}AME`, x: 8 },
  { text: `O${colorCode(7)}RDERS`, x: 64 },
  { text: `A${colorCode(7)}DVISORS`, x: 128 },
  { text: `W${colorCode(7)}ORLD`, x: 192 },
  // "CIVILOPEDIA" — tak w CIV.EXE 474.01 i na zrzutach z DOSBoxa (wzorzec: "ENCYCLOP.").
  { text: `C${colorCode(7)}IVILOPEDIA`, x: 240 },
];

/** Menu GAME (napisy z CIV.EXE 474.01); " View Replay" dopisywane na końcu przy SpaceshipFlags & 0x100 (F0_2c84_00ad). */
export const GAME_MENU = ' Tax Rate\n Luxuries Rate\n FindCity\n Options\n Save Game\n REVOLUTION!\n \n Retire\n QUIT to DOS\n';
export const GAME_MENU_REPLAY = ' View Replay\n';
/** Ustawienia gry (bity 0–7 GameSettingFlags), okno w (24, 16) — napis z CIV.EXE. */
export const PREFERENCES_MENU = 'Options:\n Instant Advice\n AutoSave\n End of Turn\n Animations\n Sound\n Enemy Moves\n Civilopedia Text\n Palace\n';
export const ADVISORS_MENU =
  ' City Status (F1)\n Military Advisor (F2)\n Intelligence Advisor (F3)\n Attitude Advisor (F4)\n Trade Advisor (F5)\n Science Advisor (F6)\n';
export const WORLD_MENU = ' Wonders of the World (F7)\n Top 5 Cities (F8)\n Civilization Score (F9)\n World Map (F10)\n Demographics\n SpaceShips\n';
/** Napisy menu (ADVISORS, WORLD, CIVILOPEDIA) jak w CIV.EXE 474.01 (F0_2c84_0615/06e4/07af). */
export const CIVILOPEDIA_MENU = ' Complete\n Civilization Advances\n City Improvements\n Military Units\n Terrain Types\n Miscellaneous\n';

/** Pozycje rozwijanych menu (x, y = 8). */
const MENU_X = [16, 72, 112, 144, 182] as const;
const SETTING_KEYS = ['instantAdvice', 'autoSave', 'endOfTurn', 'animations', 'sound', 'enemyMoves', 'civilopediaText', 'palace'] as const;

/** Klawisze kierunku (strzałki, klawiatura numeryczna) → kierunek 1–8 oryginału (1 = północ, zgodnie z zegarem). */
export const DIRECTION_KEYS: Readonly<Record<string, number>> = {
  ArrowUp: 1, '8': 1, PageUp: 2, '9': 2, ArrowRight: 3, '6': 3, PageDown: 4, '3': 4,
  ArrowDown: 5, '2': 5, End: 6, '1': 6, ArrowLeft: 7, '4': 7, Home: 8, '7': 8,
};

/** Klawisze rozkazów oryginału (Menus.F0_2c84_01d8_OrdersMenu, PlayerTurn). */
export const ORDER_KEYS: Readonly<Record<string, Order>> = {
  ' ': 'skip', b: 'build', f: 'fortify', s: 'sentry', r: 'road', i: 'irrigate', m: 'mine', p: 'pollution',
  P: 'pillage', h: 'home', w: 'wait', u: 'unload', D: 'disband',
};

export type GameScreenResult = 'quit' | 'retire' | 'gameOver';

export interface GameScreenOptions {
  /** Pokazuje całą mapę (tryb debugowania oryginału). */
  readonly revealAll?: boolean;
  /** Autozapis (co 50 tur, gdy włączony w Preferences); dostaje numer tury. */
  readonly autosave?: (state: GameState) => void | Promise<void>;
  /** Zapis z menu GAME → Save Game (JSON silnika — gdy nie ma zapisu w formacie oryginału). */
  readonly save?: (state: GameState) => void | Promise<void>;
  /**
   * Zapisy oryginału w folderze gry: z funkcją `write` GAME → Save Game i autozapis idą przez okna oryginału
   * (F11_0000_036a) do CIVIL0–3.SVE / CIVIL4–9.SVE.
   */
  readonly originalSaves?: OriginalSaveStore;
  /** Tabela Hall of Fame (koniec gry); `fameInitial` — tabela startowa, gdy magazyn jest pusty (FAME.DTA z gry). */
  readonly fame?: FameStore;
  readonly fameInitial?: () => Promise<HallOfFameEntry[]>;
  /** Zapis REPLAY.TXT („Write Replay to Disk” w powtórce gry). */
  readonly writeReplay?: (text: string) => Promise<void>;
}


export class GameScreen {
  viewX = 0;
  viewY = 0;
  /** Aktywna jednostka gracza albo -1 („End of Turn”). */
  activeUnit = -1;
  private readonly sprites: MapSprites;
  private readonly gamePalette: Palette;
  private readonly textDrawer: TextDrawer;
  private eventsSeen = 0;
  private blinkHidden = false;
  /** Tura, w której PlayerTurn pokazał już poradę dla jednostki (zmienna lokalna bp-8 w oryginale). */
  private adviceTurn = -1;
  /** Var_6b92: animacja niepokojów najwyżej raz na turę. */
  private disorderShownTurn = -1;
  /** Array_30b8 — słowa kluczowe tekstów KING.TXT, trwałe między rozmowami (początkowo jak po *INIT). */
  private readonly kingKeywords: KingKeywords;

  constructor(
    private readonly ui: Ui,
    private readonly assets: GameAssets,
    readonly state: GameState,
    private readonly options: GameScreenOptions = {},
  ) {
    this.sprites = prepareSprites({ ter: assets.pic('TER257.PIC'), sp: assets.pic('SP257.PIC'), sp299: assets.pic('SP299.PIC') });
    this.gamePalette = buildGamePalette(assets);
    const me = state.players[state.humanPlayer]!;
    // Sound (GameSettingFlags 0x10) — ustawienie gry; Preferences i Alt+V zmieniają je w miejscu
    ui.soundSettings = state.settings;
    this.kingKeywords = { US: me.nationPlural, RPLC1: me.leader };
    this.textDrawer = (dst, text, x, y, color, shadow) => {
      const s = dst instanceof Surface ? dst : (Object.assign(Object.create(Surface.prototype), dst) as Surface);
      if (shadow) s.drawText(ui.gfx.font, text, x, y + 1, 0);
      s.drawText(ui.gfx.font, text, x, y, color);
    };
  }

  get human(): number {
    return this.state.humanPlayer;
  }

  /** Główna pętla ekranu gry; kończy się przy Retire, QUIT albo końcu gry. */
  async run(): Promise<GameScreenResult> {
    if (this.state.currentPlayer !== this.human) advanceToHuman(this.state);
    this.eventsSeen = 0;
    // Widok startowy: GameTurn w turze 0 (0x1238:0x00f8) — pierwsza jednostka człowieka − (7, 6);
    // po wczytaniu zapisu StartGame (0x11a8:0x0152) — XStart − 7 i wiersz 19. Potem CenterMap tylko przy krawędzi.
    const p = this.state.players[this.human]!;
    const first = p.units[0]!;
    if (this.state.turn === 0 && first.type !== NO_UNIT) {
      this.viewX = wrapX(first.x - 7);
      this.viewY = clamp(first.y - 6, 0, MAP_HEIGHT - MAP_VIEW.rows);
    } else {
      this.viewX = wrapX(p.xStart - 7);
      this.viewY = clamp(19, 0, MAP_HEIGHT - MAP_VIEW.rows);
    }
    this.selectNextUnit(-1);
    await this.redrawMapWithBlankingEffect();
    // GameTurn (0x1238:0x013f): w pierwszej turze milknie hymn z ekranu *INIT
    if (this.state.turn === 0) this.ui.playTune(TUNE.stop);
    await this.processEvents();
    for (;;) {
      if (this.state.gameOver === 1) {
        // podbój świata w trakcie ruchu człowieka: tura dobiega końca, silnik ogłasza koniec gry
        endHumanTurn(this.state);
        await this.processEvents();
      }
      if (this.state.gameOver !== 0) return 'gameOver';
      await this.unitAdvice();
      const e = await this.waitWithBlink();
      const result = await this.handle(e);
      if (result === 'retire') {
        // Retire (GAME): koniec gry z oknem wyniku i Hall of Fame (EndGame)
        await this.endGame(await showScoreScreen(this.ui, this.assets, this.state), false, true);
      }
      if (result) return result;
    }
  }

  /**
   * PlayerTurn (0x1403:0x05d5–0x0646), raz na turę: w turze 0 notatka *FIRSTMOVE ($RPLC1 = naród), potem — gdy wybraną
   * jednostką są osadnicy — porada F4_0000_00af. Inne jednostki nie zużywają porady w tej turze.
   */
  private async unitAdvice(): Promise<void> {
    if (this.adviceTurn === this.state.turn || this.activeUnit === -1) return;
    const p = this.state.players[this.human]!;
    const u = p.units[this.activeUnit];
    if (!u || u.type === NO_UNIT) return;
    if (this.state.turn === 0) {
      this.adviceTurn = this.state.turn;
      await showCivilizationNote(this.ui, this.assets, this.state, '*FIRSTMOVE', { RPLC1: p.nationPlural });
    } else if (u.type === 0) {
      this.adviceTurn = this.state.turn;
      await settlerAdvice(this.ui, this.assets, this.state, this.human, this.activeUnit, (x, y) => {
        this.drawVisibleMap(x, y);
        this.ui.present();
      });
    }
  }

  /** Czeka na zdarzenie; w tym czasie aktywna jednostka miga (co ~0,25 s). */
  private async waitWithBlink(): Promise<UiEvent> {
    for (;;) {
      const e = this.activeUnit === -1 ? await this.ui.input.next() : await this.ui.waitEvent(250, true);
      if (e && e.type !== 'mouseup' && e.type !== 'mousemove') {
        if (this.blinkHidden) {
          this.blinkHidden = false;
          this.drawMap();
          this.ui.present();
        }
        return e;
      }
      if (!e && this.activeUnit !== -1) {
        this.blinkHidden = !this.blinkHidden;
        this.drawMap();
        this.ui.present();
      }
    }
  }

  /** Obsługa jednego zdarzenia (osobno, żeby dało się ją testować). */
  async handle(e: UiEvent): Promise<GameScreenResult | null> {
    if (e.type === 'mousedown') return this.handleClick(e.x, e.y, e.button);
    if (!isKey(e)) return null;
    if (e.alt && e.key.toLowerCase() === 'v') {
      // PlayerTurn (Alt+V, 0x1403:0x384e): przełączenie dźwięku z komunikatem „Sounds ON/OFF”
      this.state.settings.sound = !this.state.settings.sound;
      await showDialog(this.ui, `Sounds ${this.state.settings.sound ? 'ON' : 'OFF'}\n`, 100, 80);
      return null;
    }
    if (e.alt) {
      const index = { g: 0, o: 1, a: 2, w: 3, c: 4 }[e.key.toLowerCase()];
      return index === undefined ? null : this.showTopMenu(index);
    }
    // PlayerTurn: F1–F6 doradcy, F7–F10 raporty świata
    const report = reportForKey(e.key);
    if (report) {
      await this.showReport(report, e.key);
      return null;
    }
    return this.command(e);
  }

  private async handleClick(x: number, y: number, button: 'left' | 'right' | 'none'): Promise<GameScreenResult | null> {
    if (y < 8) return this.showTopMenu(clamp(Math.trunc(x / 60), 0, 4));
    if (x < 80) {
      if (y < 58) {
        // PlayerTurn: kliknięcie w minimapę przesuwa widok
        const { xMap, yMap } = this.miniMapOrigin();
        this.drawVisibleMap(wrapX(x - 7 + xMap), clamp(y - 14 + yMap, 0, 49));
        this.ui.present();
      } else if (y < 72) {
        // PlayerTurn (0x1403:0x07af): kliknięcie w mini-pałac pokazuje pałac
        await showPalaceView(this.ui, this.assets, this.state);
        await this.redrawMapWithBlankingEffect();
      } else if (y >= 97 && this.activeUnit === -1) {
        await this.endTurn();
      }
      return null;
    }
    const cell = this.cellAt(x, y);
    const city = cell ? cityAt(this.state, cell.x, cell.y) : -1;
    if (cell && button === 'left' && city !== -1 && this.state.cities[city]!.owner === this.human) {
      await this.cityDialog(city);
      return null;
    }
    if (cell && button === 'left') {
      // PlayerTurn: kliknięcie w pole bez własnej jednostki centruje mapę (miasta i lista jednostek — kolejne etapy)
      this.drawVisibleMap(cell.x - 7, cell.y - 6);
      this.ui.present();
    }
    return null;
  }

  /** Klawisz z kolejki PlayerTurn: ruch, rozkaz, koniec tury. */
  private async command(e: KeyEvent): Promise<GameScreenResult | null> {
    const h = this.human;
    const id = this.activeUnit;
    if (id === -1) {
      if (e.key === 'Enter' || e.key === ' ') await this.endTurn();
      else if (DIRECTION_KEYS[e.key] !== undefined) this.scrollView(DIRECTION_KEYS[e.key]!);
      return this.state.gameOver !== 0 ? 'gameOver' : null;
    }
    if (e.shift && DIRECTION_KEYS[e.key] !== undefined && e.key.startsWith('Arrow')) {
      this.scrollView(DIRECTION_KEYS[e.key]!); // Shift+strzałki przewijają mapę
      return null;
    }
    if (e.key === 'c') {
      this.centerOnUnit(true);
      this.ui.present();
      return null;
    }
    const direction = DIRECTION_KEYS[e.key];
    let result: MoveResult | undefined;
    if (direction !== undefined) {
      result = unitMove(this.state, h, id, direction);
      if (result.kind === 'confirm' && (await showMenuBox(this.ui, result.question, 100, 80, { clearInput: true })).index === 1) {
        this.redrawAll();
        result = unitMove(this.state, h, id, direction, { confirm: true });
      }
      // karawana, przekupienie, dyplomata w obcym mieście (screens/unitActions.ts)
      result = await resolveUnitAction(this.ui, this.state, id, direction, result, this.unitActionHooks());
    } else {
      const order = ORDER_KEYS[e.key];
      if (!order) return null;
      result = unitOrder(this.state, h, id, order);
      if (result?.kind === 'confirm' && (await showMenuBox(this.ui, result.question, 100, 80, { clearInput: true })).index === 1) {
        this.redrawAll();
        result = unitOrder(this.state, h, id, order, { confirm: true });
      }
    }
    this.redrawAll();
    if (result?.kind === 'blocked' && result.reason) await showDialog(this.ui, result.reason.endsWith('\n') ? result.reason : `${result.reason}\n`, 100, 80);
    await this.processEvents();
    const u = this.state.players[h]!.units[id]!;
    if (u.type === NO_UNIT || u.movesLeft === 0 || u.status & (UnitStatus.Sentry | UnitStatus.Fortified | UnitStatus.Fortifying) || this.state.players[h]!.waiting === id) {
      this.selectNextUnit(id);
      await this.processEvents();
    } else {
      this.centerOnUnit(false);
    }
    this.redrawAll();
    this.ui.present();
    return this.state.gameOver !== 0 ? 'gameOver' : null;
  }

  /** Koniec tury człowieka: tury pozostałych graczy w silniku, potem pierwsza jednostka nowej tury. */
  async endTurn(): Promise<void> {
    endHumanTurn(this.state);
    // Autozapis co 50 tur (ustawienie AutoSave w Preferences): w oryginale F11_0000_036a(4 + ((tura / 50 − 1) % 6)) —
    // CIVIL4–9.SVE w folderze gry; zostaje też cichy zapis JSON silnika (pełny stan, w tym stan generatora)
    if (this.state.settings.autoSave && this.state.turn > 0 && this.state.turn % 50 === 0) {
      if (this.options.originalSaves?.write) {
        await showSaveGameDialog(this.ui, this.state, this.options.originalSaves, autosaveSlot(this.state.turn));
      }
      if (this.options.autosave) await this.options.autosave(this.state);
    }
    await this.processEvents();
    this.selectNextUnit(-1);
    this.redrawAll();
    this.ui.present();
    await this.processEvents();
  }

  private selectNextUnit(after: number, forceCenter = false): void {
    this.activeUnit = this.state.gameOver === 0 ? nextUnit(this.state, this.human, after) : -1;
    this.blinkHidden = false;
    if (this.activeUnit !== -1) this.focusActiveUnit(forceCenter);
  }

  /**
   * PlayerTurn (0x1403:0x0361–0x040c) po wybraniu jednostki człowieka: gdy nie leży w widoku
   * (X widoku < x ≤ X + 14, Y widoku < y < Y + 10 — porównania bez znaku, bez zawijania), mapa od nowa w (x − 7, y − 6).
   */
  private focusActiveUnit(force = false): void {
    const u = this.state.players[this.human]!.units[this.activeUnit];
    if (!u || u.type === NO_UNIT) return;
    const visible = this.viewX < u.x && this.viewX + 14 >= u.x && this.viewY < u.y && this.viewY + 10 > u.y;
    if (force || !visible) {
      this.viewX = wrapX(u.x - 7);
      this.viewY = clamp(u.y - 6, 0, MAP_HEIGHT - MAP_VIEW.rows);
    }
  }

  /** MapManagement.F0_1866_16a9_CenterMap — przesuwa widok, gdy jednostka jest przy krawędzi (albo zawsze z `force`). */
  private centerOnUnit(force: boolean): void {
    const u = this.state.players[this.human]!.units[this.activeUnit];
    if (!u || u.type === NO_UNIT) return;
    let x = u.x;
    if (x < 16 && this.viewX > 64) x += 80;
    if (force || x < this.viewX + 2 || x > this.viewX + 13 || u.y < this.viewY + 2 || u.y > this.viewY + 9) {
      this.viewX = wrapX(x - 8);
      this.viewY = clamp(u.y - 6, 0, MAP_HEIGHT - MAP_VIEW.rows);
    }
  }

  /** Tymczasowo przy „End of Turn”: kierunek przesuwa widok o jedno pole. */
  private scrollView(direction: number): void {
    const d = [[0, 0], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]][direction]!;
    this.drawVisibleMap(this.viewX + d[0]!, this.viewY + d[1]!);
    this.ui.present();
  }

  /** Nowe zdarzenia silnika jako okna: komunikaty, porady (Instant Advice), nazwa nowego miasta — z dźwiękiem oryginału. */
  async processEvents(): Promise<void> {
    const events = this.state.events;
    while (this.eventsSeen < events.length) {
      const ev = events[this.eventsSeen++]!;
      await this.eventSound(ev);
      await this.showEvent(ev);
      if (typeof ev.tuneAfter === 'number') this.ui.playTune(ev.tuneAfter);
    }
  }

  /**
   * PlayTune przed zdarzeniem: `tune` z silnika (miejsca wywołań oryginału), dźwięk walki widocznej dla człowieka
   * (AttackUnit) i wybuch jądrowy (NukeAnimation, także przy katastrofie elektrowni — przed utworem 36).
   * Animacji walki i wybuchu jeszcze nie ma: przy włączonym dźwięku odczekujemy tyle, ile trwałyby
   * (walka ok. 58 jednostek zegara, wybuch 35 × 5), żeby efekt nie został przerwany następnym utworem.
   */
  private async eventSound(ev: GameEvent): Promise<void> {
    const pause = async (ticks: number) => {
      if (this.ui.soundSettings.sound) await this.ui.waitTimer(ticks);
    };
    if (ev.nuclearCatastrophe === true) {
      this.ui.playTune(TUNE.nuclearExplosion);
      await pause(NUKE_ANIMATION_TICKS);
    }
    if (ev.kind === 'combat') {
      if (ev.seen !== true) return;
      this.ui.playTune(combatTune(this.state, ev));
      await pause(COMBAT_ANIMATION_TICKS);
      return;
    }
    if (typeof ev.tune !== 'number') return;
    this.ui.playTune(ev.tune, typeof ev.tuneArg === 'number' ? ev.tuneArg : 0);
    if (ev.kind === 'nuclear') await pause(NUKE_ANIMATION_TICKS);
  }

  private async showEvent(ev: GameEvent): Promise<void> {
    {
      if (await this.panoramaEvent(ev)) return;
      const fromAi = ev.kind === 'aiRequest' || ev.kind === 'meetLeader' || ev.kind === 'envoy';
      if (ev.player !== undefined && ev.player !== this.human && ev.kind !== 'message' && !fromAi) return;
      if (typeof ev.text === 'string' && ev.text) {
        // okna z położeniem oryginału (dialogX, dialogY); mapX/mapY — DrawVisibleMap przed oknem
        if (typeof ev.mapX === 'number' && typeof ev.mapY === 'number') {
          this.drawVisibleMap(ev.mapX, ev.mapY);
          this.ui.present();
        }
        await showDialog(this.ui, ev.text.endsWith('\n') ? ev.text : `${ev.text}\n`,
          typeof ev.dialogX === 'number' ? ev.dialogX : 100, typeof ev.dialogY === 'number' ? ev.dialogY : 80);
        if (ev.showCity === true && typeof ev.city === 'number') await this.cityAfterEvent(ev.city);
      } else if (ev.kind === 'advice' && this.state.settings.instantAdvice && typeof ev.key === 'string') {
        // HELP.TXT: okno „Civilization Note” (F4_0000_02d3); klucze spoza HELP.TXT — zwykłe okno z KING.TXT
        const help = this.assets.optional('HELP.TXT');
        if (help && loadTextSection(help, ev.key) !== null) await showCivilizationNote(this.ui, this.assets, this.state, ev.key);
        else {
          const text = this.adviceText(ev.key);
          if (text) await showDialog(this.ui, text, 60, 60);
        }
      } else if (ev.kind === 'cityFounded' && typeof ev.city === 'number') {
        await this.cityNameDialog(ev.city);
        // GameEngine (FoundNewCity): przy włączonych animacjach F22_0000_0eaf, potem okno nowego miasta i mapa z wygaszeniem
        if (this.state.cities[ev.city]?.owner === this.human) {
          if (this.state.settings.animations) {
            await foundNewCityAnimation(this.ui, this.assets, this.state, ev.city, { palette: this.gamePalette });
          }
          await this.cityDialog(ev.city);
          await this.redrawMapWithBlankingEffect();
        }
      } else if (ev.kind === 'chooseResearch' && Array.isArray(ev.options)) {
        await this.researchDialog(ev.options as number[]);
      } else if (ev.kind === 'chooseResearch' && typeof ev.suggested === 'number' && ev.suggested >= 0) {
        chooseResearch(this.state, ev.suggested);
      } else if (ev.kind === 'chooseGovernment' && Array.isArray(ev.options)) {
        await this.governmentDialog(ev.options as number[]);
      } else if (ev.kind === 'meetLeader' && typeof ev.player === 'number') {
        // Diplomacy.UpdateDiplomacyStatus → MeetWithKing.F6_0000_0000(gracz, x, y, 0)
        await this.kingMeeting(meetWithKing(this.state, ev.player, {
          x: typeof ev.x === 'number' ? ev.x : -1,
          y: typeof ev.y === 'number' ? ev.y : -1,
          previousCountdown: typeof ev.previousCountdown === 'number' ? ev.previousCountdown : undefined,
          hadContact: ev.first !== true,
        }));
      } else if (ev.kind === 'aiRequest' && typeof ev.player === 'number') {
        await this.aiRequestDialog(ev);
      } else if (ev.kind === 'envoy' && typeof ev.player === 'number' && typeof ev.tech === 'number') {
        // GameEngine.ResearchFinished: poseł z wieścią o odkryciu (*GAPE)
        await this.kingMeeting(envoyMeeting(this.state, ev.player, ev.tech));
      } else if (ev.kind === 'spaceshipPart' && typeof ev.part === 'number') {
        await spaceshipPartDialog(this.ui, this.assets, this.state, ev.part, ev.placed === true);
        await this.redrawMapWithBlankingEffect();
      } else if (ev.kind === 'historyReport' && ev.report) {
        await showHistoryReport(this.ui, this.state, ev.report as Parameters<typeof showHistoryReport>[2], this.assets);
      } else if (ev.kind === 'palace') {
        // GameTurn: rozbudowa pałacu (F17_0000_0000_UpgradePalace), potem mapa z wygaszeniem
        await showPalaceUpgrade(this.ui, this.assets, this.state);
        await this.redrawMapWithBlankingEffect();
      } else if (ev.kind === 'gameEnd') {
        await this.gameEndDialog(ev.reason === 'conquest', ev.canContinue === true);
      }
    }
  }

  /**
   * Panorama miasta zamiast okna komunikatu, gdy włączone są animacje (screens/cityView.ts):
   * ukończony budynek albo cud człowieka (CityWorker 0x1d12:0x1dbe — bez pałacu, części statku i automatycznej produkcji),
   * zdobycie miasta przez człowieka albo człowiekowi (Actions, 0x2459:0x035d — z najazdem), niepokoje (raz na turę,
   * Var_6b92 — z zamieszkami) i „We love the King” (z pochodem). Zwraca true, gdy zdarzenie zostało obsłużone.
   */
  private async panoramaEvent(ev: GameEvent): Promise<boolean> {
    const state = this.state;
    const text = typeof ev.text === 'string' ? ev.text : null;
    const cityId = typeof ev.city === 'number' ? ev.city : -1;
    const city = state.cities[cityId];
    if (!text || !city || city.status === -1) return false;
    if (ev.kind === 'cityCaptured') {
      if (ev.player !== this.human && ev.loser !== this.human) return true;
      if (!state.settings.animations) return false;
      await showCityView(this.ui, this.assets, state, cityId, -2, text);
      await invadersAnimation(this.ui, this.assets, state, ev.player as number);
      await this.redrawMapWithBlankingEffect();
      return true;
    }
    if (!state.settings.animations || city.owner !== this.human) return false;
    if (ev.kind === 'built' && ev.player === this.human && typeof ev.item === 'number') {
      const item = ev.item;
      if (!((item <= 21 || item > 24) && !(city.status & CityStatus.AutoProduction) && item !== 1)) return false;
      await showCityView(this.ui, this.assets, state, cityId, item, text, { palette: this.gamePalette });
      await this.redrawMapWithBlankingEffect();
      if (ev.showCity === true) await this.cityAfterEvent(cityId);
      return true;
    }
    if (ev.animation === 'disorder' && this.disorderShownTurn !== state.turn) {
      this.disorderShownTurn = state.turn;
      await showCityView(this.ui, this.assets, state, cityId, -2, text);
      await civilDisorderAnimation(this.ui, this.assets, state);
      await this.redrawMapWithBlankingEffect();
      if (ev.showCity === true) await this.cityAfterEvent(cityId);
      return true;
    }
    if (ev.animation === 'celebration') {
      await showCityView(this.ui, this.assets, state, cityId, -2, text);
      await loveOurLeaderAnimation(this.ui, this.assets, state);
      await this.redrawMapWithBlankingEffect();
      return true;
    }
    return false;
  }

  /**
   * Var_b1e8 (GameEngine.F0_1ade_0006_ProcessCitiesAndAdjustTaxRates): po komunikacie o mieście człowieka (budowa,
   * niepokoje, spadek ludności) okno miasta i mapa z wygaszeniem — raz na miasto, gdy kolejne komunikaty dotyczą tego samego.
   */
  private async cityAfterEvent(cityId: number): Promise<void> {
    const next = this.state.events[this.eventsSeen];
    if (next && next.showCity === true && next.city === cityId) return;
    const city = this.state.cities[cityId];
    if (!city || city.status === -1 || city.owner !== this.human) return;
    await showCityWindow({ ui: this.ui, assets: this.assets, state: this.state, sprites: this.sprites, text: this.textDrawer, palette: this.gamePalette }, cityId);
    await this.redrawMapWithBlankingEffect();
  }

  /**
   * Prośba komputera (Diplomacy: *HELPME / *CRUSADE): poseł (MeetWithKing.F6_0000_16cd), sala tronowa z portretem,
   * tekst z KING.TXT w (36, 139), opcja 1 = zgoda; na końcu F6_0000_16ac.
   */
  async aiRequestDialog(ev: GameEvent): Promise<void> {
    const request = ev.request === 'helpme' ? 'helpme' : 'crusade';
    await this.kingMeeting(aiRequestMeeting(this.state, request, ev.player as number, ev.enemy as number,
      typeof ev.amount === 'number' ? ev.amount : 0, ev.extend === true));
  }

  /** Haki okien karawany i dyplomaty (screens/unitActions.ts). */
  private unitActionHooks(): UnitActionHooks {
    return {
      kingMeeting: (meeting) => this.kingMeeting(meeting),
      showCity: (cityId) => this.cityDialog(cityId),
      intelligence: async (player) => {
        await showIntelligenceDetail(this.ui, this.assets, this.state, player, this.options.revealAll === true);
      },
      redraw: () => {
        this.redrawAll();
        this.ui.present();
      },
    };
  }

  /** Rozmowa z władcą (screens/king.ts) prowadzona krokami silnika. */
  async kingMeeting(meeting: KingMeeting): Promise<void> {
    await runKingMeeting(this.ui, this.assets, this.state, meeting, this.kingKeywords, {
      centerMap: (x, y) => {
        this.drawVisibleMap(x, y);
        this.ui.present();
      },
      advice: async (key, values) => {
        if (!this.state.settings.instantAdvice) return;
        const text = this.adviceText(key);
        if (text) await showDialog(this.ui, replaceKeywords(text, values), 60, 60);
      },
      close: () => this.redrawMapWithBlankingEffect(),
    });
    this.redrawAll();
    this.ui.present();
  }

  /**
   * Koniec gry (GameTurn): okno wyniku (EndGame), a gdy to nie podbój — pytanie *FAME z KING.TXT, czy grać dalej
   * (GameEndType = 1 − wybór: opcja 1 = gramy dalej).
   */
  async gameEndDialog(conquest: boolean, canContinue: boolean): Promise<void> {
    if (conquest) {
      // GameTurn: po „*** GAME OVER ***” — DisplayHailTheConquerorMessage, potem mapa od nowa
      await displayHailTheConqueror(this.ui, this.assets, this.state);
      this.ui.gfx.setPalette(this.gamePalette);
      await this.redrawMapWithBlankingEffect();
    }
    this.ui.gfx.copy(0, 0, 0, 320, 200, 1, 0, 0);
    const score = await showScoreScreen(this.ui, this.assets, this.state, conquest);
    this.ui.gfx.copy(1, 0, 0, 320, 200, 0, 0, 0);
    this.ui.present();
    if (!canContinue) {
      await this.endGame(score, conquest);
      return;
    }
    const king = this.assets.optional('KING.TXT');
    const section = king ? textSection(king, '*FAME') : null;
    // Bez KING.TXT — własne pytanie w tym samym układzie (opcja 1 = gramy dalej)
    const text = section ? section.replace(/\^/g, '\n').replace(/([^\n])$/, '$1\n') : 'Your reign is over.\n Retire.\n Keep playing.\n';
    if ((await showDialog(this.ui, text, 80, 80)) === 1) this.state.gameOver = 0;
    else await this.endGame(score, conquest);
  }

  /** F0_1238_08a0_EndGame: wykres potęgi (F12_0000_0573), powtórka (nie po Retire — GameEndType 2), postaci sławne i Hall of Fame. */
  async endGame(total: number, conquest = false, retired = false): Promise<void> {
    await showPowerGraph(this.ui, this.state);
    if (!retired) await this.replay();
    const score = civilizationScore(this.state, this.human, conquest);
    const entry = hallOfFameEntry(this.state, { ...score, total });
    const initial = this.options.fameInitial ? await this.options.fameInitial() : null;
    this.ui.gfx.copy(0, 0, 0, 320, 200, 1, 0, 0);
    await endGameHallOfFame(this.ui, this.options.fame, initial, entry, () => this.state.rng.next(2));
    this.ui.gfx.copy(1, 0, 0, 320, 200, 0, 0, 0);
    this.ui.present();
  }

  /** DisplayGameReplay na ekranie gry (paleta gry przywracana po powtórce). */
  async replay(): Promise<void> {
    await displayGameReplay(this.ui, this.assets, this.state, { writeReplay: this.options.writeReplay });
    this.ui.gfx.setPalette(this.gamePalette);
    this.ui.present();
  }

  /** GameEngine.F0_1ade_1584_SelectNextResearchField (człowiek): wybór badań w oknie (80, 64) z pomocą. */
  async researchDialog(options: readonly number[]): Promise<void> {
    if (options.length === 0) return;
    const who = playerHasTech(this.state, this.human, Tech.Invention) ? 'scientists' : 'wise men';
    let text = `Which research field should our\n${who} be pursuing, sire?\nPick one...\n `;
    for (const t of options) text += `${TECHS[t]?.name ?? '?'}\n `;
    for (;;) {
      this.ui.gfx.copy(0, 0, 0, 320, 200, 1, 0, 0);
      const r = await showMenuBox(this.ui, text, 80, 64, { help: true, clearInput: true });
      this.ui.gfx.copy(1, 0, 0, 320, 200, 0, 0, 0);
      // Esc = pierwsza opcja
      const tech = options[Math.max(0, r.index)]!;
      if (!r.help) {
        chooseResearch(this.state, tech);
        break;
      }
      // pomoc (Var_2f9c_MenuBoxHelpRequested): strona technologii w Civilopedii, mapa z wygaszeniem i znów to samo pytanie
      await showCivilopediaTopic({ ui: this.ui, assets: this.assets, state: this.state }, Topic.Technology, tech);
      await this.redrawMapWithBlankingEffect();
    }
    this.ui.present();
  }

  /** Diplomacy: „Select type of government:” po anarchii (ShowDialog w (100, 64)); Esc powtarza pytanie. */
  async governmentDialog(options: readonly number[]): Promise<void> {
    if (options.length === 0) return;
    let text = 'Select type of government:\n';
    for (const g of options) text += ` ${GOVERNMENT_NAMES[g] ?? '?'}\n`;
    let index = -1;
    while (index === -1) index = await showDialog(this.ui, text, 100, 64);
    setGovernment(this.state, this.human, options[index]!);
    this.redrawAll();
    this.ui.present();
  }

  /** Rozkaz REVOLUTION! z menu GAME (PlayerTurn, komenda -2): pytanie *REV z KING.TXT w (64, 80). */
  async revolutionDialog(): Promise<void> {
    const king = this.assets.optional('KING.TXT');
    const section = king ? textSection(king, '*REV') : null;
    // Bez KING.TXT — własne pytanie w tym samym układzie (opcja 1 = rewolucja)
    const text = section ? section.replace(/\^/g, '\n').replace(/([^\n])$/, '$1\n') : 'Are you sure you want\na REVOLUTION?\n No thanks.\n Yes, we need a new government.\n';
    if ((await showDialog(this.ui, text, 64, 80)) === 1) {
      revolution(this.state, this.human);
      await this.processEvents();
      await this.redrawMapWithBlankingEffect();
    }
  }

  /**
   * GameEngine.F0_1ade_03ea_ProcessCityState1AndRefreshMap: ekran gry zapamiętany na ekranie 1, okno miasta
   * (CityWorker.ProcessCityState w trybie 1, `screens/cityWindow.ts`), potem odtworzenie ekranu albo — gdy okno tego
   * wymaga — przerysowanie mapy z wygaszeniem; na koniec panel skarbca (PlayerTurn: ReportHumanTaxAndPopulation).
   */
  async cityDialog(cityId: number): Promise<void> {
    const ui = this.ui;
    ui.gfx.copy(0, 0, 0, 320, 200, 1, 0, 0);
    const r = await showCityWindow({ ui, assets: this.assets, state: this.state, sprites: this.sprites, text: this.textDrawer, palette: this.gamePalette }, cityId);
    if (r.redraw) await this.redrawMapWithBlankingEffect();
    else ui.gfx.copy(1, 0, 0, 320, 200, 0, 0, 0);
    this.reportTaxAndPopulation();
    ui.present();
  }

  /** Porada z HELP.TXT albo KING.TXT (pliki gracza), złamana do szerokości okna. */
  private adviceText(key: string): string | null {
    for (const file of ['HELP.TXT', 'KING.TXT']) {
      const data = this.assets.optional(file);
      const text = data ? textSection(data, key) : null;
      if (text) return text.replace(/\^/g, '\n').replace(/([^\n])$/, '$1\n');
    }
    return null;
  }

  /** TextBoxDialogues.F23_0000_0000_CityNameDialog — nazwa nowego miasta (80,80) 160×32. */
  private async cityNameDialog(cityId: number): Promise<void> {
    const city = this.state.cities[cityId];
    if (!city || city.owner !== this.human) return;
    const gfx = this.ui.gfx;
    gfx.copy(0, 0, 0, 320, 200, 1, 0, 0);
    let name = '';
    while (name.length === 0) {
      gfx.fillRect(80, 80, 160, 32, 15);
      gfx.drawRectangle(80, 80, 160, 32, 11);
      gfx.drawString('City Name...', 88, 82, 0);
      const r = await editBox(this.ui, 88, 96, 12, this.state.cityNames[city.nameId] ?? '');
      name = r.ok ? r.text.trim() : this.state.cityNames[city.nameId] ?? 'City';
    }
    this.state.cityNames[city.nameId] = name;
    gfx.copy(1, 0, 0, 320, 200, 0, 0, 0);
    this.redrawAll();
    this.ui.present();
  }

  /** Pole mapy pod punktem ekranu albo null. */
  cellAt(x: number, y: number): { x: number; y: number } | null {
    if (x < MAP_VIEW.x || y < MAP_VIEW.y || x >= MAP_VIEW.x + MAP_VIEW.columns * 16 || y >= MAP_VIEW.y + MAP_VIEW.rows * 16) return null;
    return { x: wrapX(Math.trunc((x - 80) / 16) + this.viewX), y: Math.trunc((y - 8) / 16) + this.viewY };
  }

  /** GameEngine.F0_1238_1b44_RedrawMapWithBlankingEffect — wygaszenie, narysowanie ekranu, rozjaśnienie paletą gry. */
  async redrawMapWithBlankingEffect(): Promise<void> {
    await this.ui.fadePalette([0, 0, 0], 5);
    this.redrawAll();
    await this.ui.fadePalette(this.gamePalette, 5);
  }

  redrawAll(): void {
    this.drawVisibleMap(this.viewX, this.viewY);
    this.drawStatusPanel();
  }

  /** Menus.F0_1238_0fea_DrawMainMenu */
  drawMainMenu(): void {
    const gfx = this.ui.gfx;
    gfx.fillRect(0, 0, 320, 8, 0);
    for (const label of TOP_MENU_LABELS) gfx.drawString(label.text, label.x, 1, 15);
  }

  /** MapManagement.F0_2aea_0008_DrawVisibleMap — pasek menu, panel stanu, pola mapy i minimapa. */
  drawVisibleMap(x: number, y: number): void {
    this.drawMainMenu();
    this.reportTaxAndPopulation();
    this.viewX = wrapX(x);
    this.viewY = clamp(y, 0, MAP_HEIGHT - MAP_VIEW.rows);
    this.drawMap();
  }

  /** Same pola mapy i minimapa (bez paneli) — także przy miganiu aktywnej jednostki. */
  private drawMap(): void {
    const gfx = this.ui.gfx;
    const hideUnit = this.blinkHidden && this.activeUnit !== -1 ? { player: this.human, unitId: this.activeUnit } : undefined;
    drawMapView(gfx.screen, this.state, this.sprites, {
      viewX: this.viewX, viewY: this.viewY, text: this.textDrawer, revealAll: this.options.revealAll, hideUnit,
    });
    this.drawActiveUnit();
    drawMiniMap(gfx.screen, this.state, this.viewX, this.viewY);
    // Ramka minimapy jak DrawShadowRectangle(0, 8, 79, 49, 15, 8) we wzorcu (górna i prawa krawędź 8, dolna i lewa 15),
    // tak samo jak ramki paneli; ramka widoku przerysowana na wierzchu.
    gfx.drawShadowRectangle(0, 8, 79, 49, 15, 8);
    const { xMap, yMap } = this.miniMapOrigin();
    gfx.drawRectangle(this.viewX - xMap - 1, this.viewY - yMap + 7, 17, 10, 15);
  }

  /**
   * Aktywna jednostka w fazie „widocznej” migania: MapManagement.F0_2aea_0e29_DrawUnit na jej polu, na wierzchu.
   * DrawVisibleMap nie rysuje jednostek w miastach, więc bez tego nowa jednostka zbudowana w mieście nie byłaby widoczna.
   */
  private drawActiveUnit(): void {
    if (this.activeUnit === -1 || this.blinkHidden) return;
    const u = this.state.players[this.human]!.units[this.activeUnit];
    if (!u || u.type === NO_UNIT) return;
    const sx = wrapX(u.x - this.viewX) * 16 + MAP_VIEW.x;
    const sy = (u.y - this.viewY) * 16 + MAP_VIEW.y;
    if (sx < MAP_VIEW.x || sx >= 320 || sy < MAP_VIEW.y || sy >= MAP_VIEW.y + MAP_VIEW.rows * 16) return;
    const stacked = unitsAt(this.state, this.human, u.x, u.y).length > 1;
    drawUnit(this.ui.gfx.screen, this.state, this.sprites, this.human, this.activeUnit, sx, sy, stacked, undefined, this.textDrawer);
  }

  /** Przesunięcie minimapy (Var_6ed6_MiniMapX / Var_70ea_MiniMapY): widok zawsze w środku; z Navigation bez przesunięcia w pionie. */
  miniMapOrigin(): { xMap: number; yMap: number } {
    const navigation = playerHasTech(this.state, this.human, Tech.Navigation);
    return { xMap: this.viewX - 32, yMap: navigation ? 0 : this.viewY - 19 };
  }

  /** GameEngine.F0_1238_107e_ReportHumanTaxAndPopulation — panel pałacu, roku, nauki i skarbca. */
  reportTaxAndPopulation(): void {
    const gfx = this.ui.gfx;
    const p = this.state.players[this.human]!;
    gfx.fillRectangleWithShadow(0, 58, 80, 39);
    gfx.fillRect(3, 60, 74, 11, 11);
    if (this.state.peaceTurns > 1) gfx.fillRect(3, 60, clamp(this.state.peaceTurns * 2, 0, 60), 2, 15);
    drawMiniPalace(gfx, this.assets, this.state, this.human, palaceOf(this.state).buildCount, 8, 58);
    // Liczba mieszkańców (PopulationValueToString) — gdy silnik będzie ją liczył.
    gfx.drawString(yearToString(this.state.year), 2, 81, 0);
    // L11d3: żarówka 0–3 = 4·postęp / ((2·poziom + Var_d2de + 6) · odkrycia · (rok ≥ 0 ? 2 : 1) + 1), z ekranu 2 (SP299.PIC)
    const cost = (this.state.difficulty * 2 + this.state.techCatchUp + 6) * p.techCount * (this.state.year >= 0 ? 2 : 1) + 1;
    gfx.copy(2, 160 + clamp(Math.trunc((p.researchProgress * 4) / cost), 0, 3) * 8, 120, 8, 8, 0, 48, 80);
    // L1288: złoto + "$" + " " + luksusy "." podatek "." nauka (napisy z CIV.EXE), luksusy = 10 − (podatek + nauka)
    const luxury = 10 - (p.taxRate + p.scienceRate);
    gfx.drawString(`${p.gold}$ ${luxury}.${p.taxRate}.${p.scienceRate}`, 2, 89, 0);
  }

  /** PlayerTurn.F0_1403_4060_DrawStatusPanel — aktywna jednostka albo „End of Turn”. */
  drawStatusPanel(): void {
    const gfx = this.ui.gfx;
    gfx.fillRectangleWithShadow(0, 97, 80, 103);
    const p = this.state.players[this.human]!;
    const u = this.activeUnit === -1 ? undefined : p.units[this.activeUnit];
    if (!u || u.type === NO_UNIT) {
      gfx.drawString('End of Turn', 4, 124, 0);
      gfx.drawString('Press Enter', 4, 136, 0);
      gfx.drawString('to continue', 4, 144, 0);
      return;
    }
    const def = UNITS[u.type]!;
    let y = 99;
    gfx.drawString(p.nationAdjective, 4, y, 0);
    y += 8;
    gfx.drawString(def.name, 4, y, 0);
    y += 8;
    if (u.status & UnitStatus.Veteran) {
      gfx.drawString('Veteran', 8, y, 0);
      y += 8;
    }
    const moves = clamp(Math.trunc(u.movesLeft / 3), 0, 99);
    const withFuel = moves + (def.turnsOutside !== 0 ? def.moves * u.specialMoves : 0);
    const third = u.movesLeft % 3;
    gfx.drawString(`Moves: ${moves}${third !== 0 ? `.${third}` : ''}${moves !== withFuel ? `(${withFuel})` : ''}`, 4, y, 0);
    y += 8;
    const home = this.state.cities[u.homeCity];
    gfx.drawString(home && home.status !== -1 ? (this.state.cityNames[home.nameId] ?? '') : 'NONE', 4, y, 0);
    y += 8;
    gfx.drawString(`(${TERRAIN[terrainAt(this.state.map, u.x, u.y)]?.name ?? ''})`, 4, y, 0);
    y += 8;
    const imp = this.state.map.visibleImprovements[cellIndex(u.x, u.y)]!;
    const line = (text: string) => {
      gfx.drawString(text, 4, y, 0);
      y += 8;
    };
    if (imp & Improvement.Railroad) line('(RailRoad)');
    else if (imp & Improvement.Road) line('(Road)');
    if (imp & Improvement.Irrigation) line('(Irrigation)');
    else if (imp & Improvement.Mine) line('(Mining)');
    if (imp & Improvement.Pollution) line('(Pollution)');
    y += 4;
    // pozostałe jednostki na polu
    let x = 8;
    const stack = unitsAt(this.state, this.human, u.x, u.y).filter((i) => i !== this.activeUnit);
    for (const other of stack) {
      if (y >= 184) break;
      drawUnit(gfx.screen, this.state, this.sprites, this.human, other, x, y, false, undefined, this.textDrawer);
      x += 16;
      if (x > 64) {
        x = 8;
        y += 16;
      }
    }
    if (stack.length > 0 && y >= 184) gfx.drawString('+', 74, 192, 0);
  }

  /** Menus.F0_2c84_0000_ShowTopMenu — ekran zapamiętany na ekranie 1 i przywracany po zamknięciu menu. */
  async showTopMenu(index: number): Promise<GameScreenResult | null> {
    const ui = this.ui;
    const gfx = ui.gfx;
    gfx.copy(0, 0, 0, 320, 200, 1, 0, 0);
    let result: GameScreenResult | null = null;
    let action: string | null = null;
    let shortcut: string | null = null;
    let report: AdvisorReport | WorldReport | null = null;
    let civilopedia: number | null = null;
    switch (index) {
      case 0: {
        // F0_2c84_00ad: " View Replay" na końcu przy SpaceshipFlags & 0x100; Save Game nieaktywne w turze 0 (Var_81d2)
        const replayAvailable = (this.state.spaceshipFlags & 0x100) !== 0;
        const r = await showMenuBox(ui, GAME_MENU + (replayAvailable ? GAME_MENU_REPLAY : ''), MENU_X[0], 8, {
          disabled: this.state.turn === 0 ? 0x10 : 0,
        });
        if (r.index === 3) await this.preferences();
        else if (r.index === 9 && replayAvailable) shortcut = 'replay';
        else if (r.index === 4 && (this.options.save || this.options.originalSaves?.write)) shortcut = 'save';
        else if (r.index === 5) shortcut = 'revolution';
        else if (r.index === 7) result = 'retire';
        else if (r.index === 8) result = 'quit';
        else if (r.index >= 0 && r.index !== 6) action = 'game';
        break;
      }
      case 1:
        shortcut = await this.ordersMenu();
        break;
      case 2: {
        const r = await showMenuBox(ui, ADVISORS_MENU, MENU_X[2], 8);
        report = ADVISOR_REPORTS[r.index] ?? null;
        break;
      }
      case 3: {
        // SpaceShips nieaktywne, dopóki nikt nie buduje statku (Menus: SpaceshipFlags & 0xfe00)
        const r = await showMenuBox(ui, WORLD_MENU, MENU_X[3], 8, { disabled: (this.state.spaceshipFlags & 0xfe00) === 0 ? 0x20 : 0 });
        if (r.index === 5) shortcut = 'spaceships';
        else report = WORLD_REPORTS[r.index] ?? null;
        break;
      }
      case 4: {
        // Menus.F0_2c84_07af_EncyclopediaMenu: opcja 0 = Complete (wszystkie tematy), dalej rodzaje 0–4
        const r = await showMenuBox(ui, CIVILOPEDIA_MENU, MENU_X[4], 8);
        if (r.index >= 0) civilopedia = r.index - 1;
        break;
      }
    }
    ui.input.clear();
    gfx.copy(1, 0, 0, 320, 200, 0, 0, 0);
    ui.present();
    if (action) await showDialog(ui, 'Not available yet.\n', 100, 80);
    if (civilopedia !== null) {
      // Encyclopedia.ShowEncyclopediaByTopic: listy i strony tematów, na koniec mapa z wygaszeniem
      await showCivilopedia({ ui, assets: this.assets, state: this.state }, civilopedia);
      await this.redrawMapWithBlankingEffect();
    }
    if (report) await this.showReport(report);
    if (shortcut === 'spaceships') {
      await spaceshipNationDialog(ui, this.assets, this.state);
      await this.redrawMapWithBlankingEffect();
    } else if (shortcut === 'revolution') await this.revolutionDialog();
    else if (shortcut === 'replay') {
      await this.replay();
      await this.redrawMapWithBlankingEffect();
    }
    else if (shortcut === 'save') {
      if (this.options.originalSaves?.write) {
        await showSaveGameDialog(ui, this.state, this.options.originalSaves);
        this.redrawAll();
        ui.present();
      } else {
        await this.options.save!(this.state);
        await showDialog(ui, 'Game saved.\n', 100, 80);
      }
    } else if (shortcut) return this.command({ type: 'key', key: shortcut });
    return result;
  }

  /** Raport doradcy albo świata (Reports); potem mapa od nowa — raport wywiadu zostawia na ekranie 1 własny obraz. */
  private async showReport(report: AdvisorReport | WorldReport, key?: string): Promise<void> {
    await showReport(this.ui, this.assets, this.state, report, this.options.revealAll === true, key);
    this.redrawAll();
    this.ui.present();
  }

  /** Menus.F0_2c84_01d8_OrdersMenu — rozkazy aktywnej jednostki; zwraca klawisz wybranego rozkazu. */
  async ordersMenu(): Promise<string | null> {
    const u = this.activeUnit === -1 ? undefined : this.state.players[this.human]!.units[this.activeUnit];
    if (!u || u.type === NO_UNIT) return null; // bez jednostki oryginał nie pokazuje menu
    const { text, keys, disabled } = ordersFor(this.state, this.human, this.activeUnit);
    const r = await showMenuBox(this.ui, text, MENU_X[1], 8, { disabled });
    return r.index >= 0 && r.index < keys.length && keys[r.index] ? keys[r.index]! : null;
  }

  /** Podmenu Preferences z „ptaszkami” przy włączonych ustawieniach; wybór przełącza ustawienie. */
  async preferences(): Promise<void> {
    let defaultIndex = -1;
    const s = this.state.settings;
    for (;;) {
      const checked = SETTING_KEYS.reduce((mask, k, i) => (s[k] ? mask | (1 << i) : mask), 0);
      const r = await showMenuBox(this.ui, PREFERENCES_MENU, 24, 16, { checked, defaultIndex });
      if (r.index === -1) return;
      if (!r.help) s[SETTING_KEYS[r.index]!] = !s[SETTING_KEYS[r.index]!];
      defaultIndex = r.index;
    }
  }
}

/** Lista rozkazów jednostki jak w Menus.F0_2c84_01d8_OrdersMenu (\x8f = skrót klawiszowy na biało). */
export function ordersFor(state: GameState, player: number, unitId: number): { text: string; keys: string[]; disabled: number } {
  const u = state.players[player]!.units[unitId]!;
  // F0_2aea_1585 — warstwa rzeczywista ulepszeń
  const imp = state.map.improvements[cellIndex(u.x, u.y)]!;
  const k = colorCode(15);
  const lines: string[] = [` No Orders ${k}space`];
  const keys: string[] = [' '];
  let disabled = 0;
  const has = (tech: number) => playerHasTech(state, player, tech);
  if (u.type === 0) {
    lines.push(imp & Improvement.City ? ` Add to City ${k}b` : ` Found New City ${k}b`);
    keys.push('b');
    if (!(imp & Improvement.Road)) {
      lines.push(` Build Road ${k}r`);
      keys.push('r');
    } else if (!(imp & Improvement.Railroad) && has(Tech.RailRoad)) {
      lines.push(` Build RailRoad ${k}r`);
      keys.push('r');
    }
    // Nawadnianie i kopalnia wg tabeli przekształceń terenu (DS:0x44a): −2 — budowa (nawadnianie nieaktywne bez wody
    // obok, F0_1403_3fd0), wartość ≥ 0 — „Change to” + nazwa terenu (piksel), −1 — brak opcji (F0_2c84_01d8 L02e1–L040d)
    const terrain = terrainAt(state.map, u.x, u.y);
    const mod = TERRAIN_MODIFICATIONS[terrain];
    const changeTo = (pixel: number) => ` Change to ${TERRAIN[PIXEL_TO_TERRAIN.get(pixel) ?? 0]!.name}`;
    if (!(imp & Improvement.Irrigation) && mod) {
      const e = mod.irrigationEffect;
      if (e !== -1) {
        if (e === -2 && !canIrrigate(state, u.x, u.y)) disabled |= 1 << keys.length;
        lines.push(`${e === -2 ? ' Build Irrigation' : e >= 0 ? changeTo(e) : ''} ${k}i`);
        keys.push('i');
      }
    }
    if (!(imp & Improvement.Mine) && mod) {
      const e = mod.miningEffect;
      if (e !== -1) {
        lines.push(`${e <= -2 ? ' Build Mines' : changeTo(e)} ${k}m`);
        keys.push('m');
      }
    }
    if (imp & Improvement.Pollution) {
      lines.push(` Clean up Pollution ${k}p`);
      keys.push('p');
    }
    lines.push(` Build Fortress ${k}f`);
    if (!has(Tech.Construction)) disabled |= 1 << keys.length;
    keys.push('f');
  } else if (UNITS[u.type]!.movementType === MovementType.Land) {
    lines.push(` Fortify ${k}f`);
    keys.push('f');
  }
  lines.push(` Wait ${k}w`, ` Sentry ${k}s`, ' GoTo');
  keys.push('w', 's', '');
  // Pillage: nie dla dyplomaty (26), karawany (27) i myśliwca (14)
  if (imp & Improvement.PillageMask && u.type !== 26 && u.type !== 27 && u.type !== 14) {
    lines.push(` Pillage ${k}P`);
    keys.push('P');
  }
  if (imp & Improvement.City) {
    lines.push(` Home City ${k}h`);
    keys.push('h');
  }
  // Unload: transportowiec morski (rola 5) albo lotniskowiec (23) z innymi jednostkami na polu
  if ((UNITS[u.type]!.role === 5 || u.type === 23) && unitsAt(state, player, u.x, u.y).length > 1) {
    lines.push(` Unload ${k}u`);
    keys.push('u');
  }
  lines.push(' ', ` Disband Unit ${k}D`);
  keys.push('', 'D');
  return { text: lines.join('\n') + '\n', keys, disabled };
}

/** Nazwa produkcji miasta: ≥0 jednostka, -1…-24 budynek, -25…-45 cud. */
export function productionName(id: number): string {
  if (id >= 0) return UNITS[id]?.name ?? '';
  return (-id <= 24 ? BUILDINGS[-id - 1] : WONDERS[-id - 25])?.name ?? '';
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

/** Czas animacji walki w AttackUnit (11×2 + 4×1 + 8×4 jednostek zegara) i wybuchu (NukeAnimation: 35 × 5). */
const COMBAT_ANIMATION_TICKS = 58;
const NUKE_ANIMATION_TICKS = 175;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
