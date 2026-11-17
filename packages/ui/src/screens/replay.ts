/**
 * Powtórka gry. Źródło: Replay.cs z OpenCivOne (MIT), sprawdzane z dosłownym tłumaczeniem asemblera (Overlay_9):
 *   F9_0000_0000 DisplayGameReplay — okno „See Replay?”, mapa świata 4×4 piksele na pole, kolejne wpisy z napisem na górze,
 *   F9_0000_08a3 WriteReplayText — pasek (0, 0, 320, 8) kolor 15, napis w (4, 1) kolorem 0 przycięty do 312 pikseli;
 *     wpis gracza-człowieka WIELKIMI LITERAMI (strupr, gdy gracz wpisu = człowiek); przy zapisie na dysk — wiersz pliku,
 *   F9_0000_09dc / 0a22 / 0a64 — lista miast (gracz, położenie) i najbliższe miasto (odległość F0_2dc4_0289: dłuższa
 *     różnica + połowa krótszej), F9_0000_0ac8 DrawReplayMapCell — kolory pól wokół miasta,
 *   F9_0000_0c30 WriteMapToFile — mapa tekstowa na początku REPLAY.TXT,
 *   F9_0000_0d5d — nazwy narodu wg numeru nacji (na czas powtórki nacje komputera wg PlayerIdentityFlags),
 *   F9_0000_0dde DisplayHailTheConquerorMessage, F9_0000_0f79 ShowDestroyPlayerWithLeaderAnimation.
 * Różnice z nowszym wzorcem (C#), w których idziemy za asemblerem: tura wpisu = ((bajt0 & 0xf) << 8) + bajt1; ludność
 * w rodzaju 11 = (bajt2 << 8) + bajt3; pola wokół miasta w wierszach 2–48 (clamp(y ± 5, 2, 49)); ranking (rodzaj 12)
 * bez roku (strcpy "*** "); miejsce w galerii pokonanych władców = reszta z dzielenia licznika przez 7.
 *
 * Pominięte: dźwięk (PlayTune), animacja twarzy władcy i położenie twarzy (Array_36fa w CIV.EXE), wygaszanie palety
 * w HSV (tu liniowe — Ui.fadePalette). Bez plików SLAM1/SLAM2/KING??.PIC ekran pokonanego władcy jest uproszczony.
 */
import {
  GOVERNMENT_NAMES, NATIONS, replayEntries, shortestDistance, TECHS, Terrain, terrainAt, turnToYear, UNITS, WONDERS, type GameState,
} from '@civ-remake/engine';
import { PLAYER_COLORS } from '@civ-remake/gfx';
import type { GameAssets } from '../assets';
import { isKey } from '../input';
import { showDialog } from '../menuBox';
import { readPaletteRange, Palette } from '../palette';
import { yearToString } from '../text';
import type { Ui } from '../ui';
import { populationText, trimToWidth } from './advisors';
import { leaderFile, NATION_LEADER_IDS } from './king';

export const REPLAY_MENU = 'See Replay?\n No replay\n Quick Replay\n Complete Replay\n Write Replay to Disk\n';

/** Tryb powtórki (Var_680a): 1 szybka, 2 pełna (klawisz po każdym wpisie), 3 zapis na dysk, 4 „hail the conqueror” (bez rysowania). */
export type ReplayMode = 1 | 2 | 3 | 4;

export interface ReplayOptions {
  /** Zapis REPLAY.TXT (w aplikacji: folder danych aplikacji). Bez niego „Write Replay to Disk” kończy się „File Error”. */
  writeReplay?: (text: string) => Promise<void>;
}

/** Nazwy narodu wg numeru nacji (F9_0000_0d5d). */
function nationNames(nation: number): { plural: string; adjective: string } {
  const n = NATIONS[nation];
  if (!n) return { plural: '', adjective: '' };
  return { plural: n.plural || `${n.adjective}s`, adjective: n.adjective };
}

interface ReplayCity {
  player: number;
  x: number;
  y: number;
}

/** Przebieg jednej powtórki — stan list z F9_0000_09dc/0a22 i nazwy narodów na czas powtórki. */
class ReplayRun {
  readonly cities: ReplayCity[] = Array.from({ length: 128 }, () => ({ player: -1, x: 0, y: 0 }));
  readonly nations: number[] = [];
  readonly names: { plural: string; adjective: string }[] = [];
  readonly lines: string[] = [];
  /** Gracz bieżącego wpisu (Var_6810) — napisy człowieka wielkimi literami. */
  current = -1;

  constructor(readonly ui: Ui, readonly assets: GameAssets, readonly state: GameState, readonly mode: ReplayMode,
    readonly hail: HailState | null) {
    for (let i = 0; i < 8; i++) {
      const p = state.players[i]!;
      if (i === state.humanPlayer || i === 0) {
        this.nations[i] = p.nation;
        this.names[i] = { plural: p.nationPlural, adjective: p.nationAdjective };
      } else {
        this.setNation(i, state.playerIdentity & (1 << i) ? i + 8 : i);
      }
    }
  }

  setNation(player: number, nation: number): void {
    this.nations[player] = nation;
    if (player !== this.state.humanPlayer) this.names[player] = nationNames(nation);
  }

  plural = (player: number) => this.names[player]?.plural ?? '';
  adjective = (player: number) => this.names[player]?.adjective ?? '';

  /** F9_0000_08a3 WriteReplayText */
  write(text: string): void {
    if (this.mode === 4) return;
    if (this.current === this.state.humanPlayer) text = text.toUpperCase();
    if (this.mode === 3) this.lines.push(text);
    const g = this.ui.gfx;
    g.fillRect(0, 0, 320, 8, 15);
    g.drawString(trimToWidth(g, text, 312), 4, 1, 0);
    this.ui.present();
  }

  /** F9_0000_0a64: najbliższe miasto na liście (odległość 999, gdy lista pusta). */
  nearest(x: number, y: number): { index: number; distance: number } {
    let distance = 999;
    let index = -1;
    this.cities.forEach((c, i) => {
      if (c.player === -1) return;
      const d = shortestDistance(x - c.x, y - c.y);
      if (d < distance) {
        distance = d;
        index = i;
      }
    });
    return { index, distance };
  }

  /** F9_0000_0ac8 DrawReplayMapCell: pola lądu w promieniu 5 dostają kolor gracza najbliższego miasta. */
  drawCell(cx: number, cy: number): void {
    if (this.mode === 4) return;
    const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
    const g = this.ui.gfx;
    const map = this.state.map;
    for (let y = clamp(cy - 5, 2, 49); y < clamp(cy + 5, 2, 49); y++) {
      for (let x = clamp(cx - 5, 0, 80); x < clamp(cx + 5, 0, 80); x++) {
        if (terrainAt(map, x, y) === Terrain.Water) continue;
        const { index, distance } = this.nearest(x, y);
        let color = 8;
        if (distance < 6) {
          const c = this.cities[index]!;
          if (map.group[c.y * 80 + c.x] === map.group[y * 80 + x]) {
            color = distance !== 0 ? (PLAYER_COLORS[c.player] ?? 8) : c.player === 1 ? 7 : 15;
          }
        }
        g.fillRect(x * 4, y * 4 + 4, 4, 4, color);
      }
    }
    this.ui.present();
  }
}

/** Stan galerii pokonanych władców (DisplayHailTheConquerorMessage). */
interface HailState {
  count: number;
  leaders: number[];
}

/** F9_0000_0c30 WriteMapToFile: '*' miasto, '.' ląd, ' ' woda. */
export function replayMapText(state: GameState): string[] {
  const lines: string[] = [];
  for (let y = 0; y < 50; y++) {
    let line = '';
    for (let x = 0; x < 80; x++) {
      if (terrainAt(state.map, x, y) === Terrain.Water) line += ' ';
      else line += state.cities.some((c) => c.status !== -1 && c.x === x && c.y === y) ? '*' : '.';
    }
    lines.push(line);
  }
  return lines;
}

/** Jedna powtórka w danym trybie (pętla po wpisach F9_0000_0000); w trybie 3 wiersze tekstu zbiera `run.lines`. */
async function playReplay(run: ReplayRun): Promise<void> {
  const { ui, state, mode } = run;
  const g = ui.gfx;
  if (mode !== 4) {
    g.fillRect(0, 0, 320, 200, 0);
    for (let y = 1; y < 49; y++) {
      for (let x = 0; x < 80; x++) g.fillRect(x * 4, y * 4 + 4, 4, 4, terrainAt(state.map, x, y) !== Terrain.Water ? 8 : 1);
    }
    ui.present();
  }
  for (const entry of replayEntries(state)) {
    const year = turnToYear(entry.turn);
    const prefix = `${yearToString(year)}: `;
    const d = entry.data;
    run.current = -1;
    switch (entry.kind) {
      case 1:
      case 9: {
        const [player = 0, nameId = 0, x = 0, y = 0] = d;
        const name = state.cityNames[nameId] ?? '';
        run.current = player;
        if (player !== 0xff) {
          if (entry.kind === 1) {
            run.write(`${prefix}${run.plural(player)} found the city of ${name}`);
            const free = run.cities.find((c) => c.player === -1);
            if (free) Object.assign(free, { player, x, y });
          } else {
            run.write(`${prefix}${run.plural(player)} capture ${name}`);
            const found = run.cities.find((c) => c.x === x && c.y === y);
            if (found) found.player = player;
          }
        } else {
          run.write(`${prefix}${name} destroyed`);
          const found = run.cities.find((c) => c.x === x && c.y === y);
          if (found) found.player = -1;
        }
        run.drawCell(x, y);
        if (mode === 1) await ui.waitTimer(30);
        break;
      }
      case 2:
      case 3: {
        const p1 = (d[0] ?? 0) >> 4;
        const p2 = (d[0] ?? 0) & 0xf;
        run.write(`${prefix}${run.plural(p1)}${entry.kind === 2 ? ' declare war on ' : ' make peace with '}${run.plural(p2)}`);
        break;
      }
      case 5:
        run.current = d[0]!;
        run.write(`${prefix}${run.plural(d[0]!)} discover ${TECHS[d[1]!]?.name ?? ''}`);
        break;
      case 6:
        run.current = d[0]!;
        run.write(`${prefix}${run.plural(d[0]!)} produce first ${UNITS[d[1]!]?.name ?? ''}`);
        break;
      case 8:
        run.current = d[0]!;
        run.write(`${prefix}${run.plural(d[0]!)} form ${GOVERNMENT_NAMES[d[1]!] ?? ''}`);
        break;
      case 10:
        run.current = d[0]!;
        run.write(`${prefix}${run.plural(d[0]!)} build ${d[1]! <= 7 ? 'the ' : ''}${WONDERS[d[1]! - 1]?.name ?? ''}`);
        break;
      case 11:
        run.current = state.humanPlayer;
        run.write(`${prefix}${run.plural(state.humanPlayer)}: ${d[0]} cities; ${populationText(((d[1] ?? 0) << 8) + (d[2] ?? 0))} population`);
        break;
      case 12:
        if (mode === 3) {
          let text = '*** ';
          d.forEach((b, i) => {
            if (b & 0xf0) text += `${i * 2 + 1}:${run.plural(b >> 4)} `;
            if (b & 0xf) text += `${i * 2 + 2}:${run.plural(b & 0xf)} `;
          });
          run.write(text);
        }
        break;
      case 13: {
        const [loser = 0, winner = 0] = d;
        run.current = loser;
        if (mode === 4 && winner === state.humanPlayer && run.hail) await destroyedLeaderScreen(run, loser, year);
        run.setNation(loser, (run.nations[loser] ?? loser) ^ 8);
        run.write(`${prefix}${run.adjective(loser)} civilization destroyed by ${run.plural(winner)}`);
        break;
      }
    }
    if (mode === 2) {
      const e = await ui.waitKeyOrClick();
      if (isKey(e, 'Escape')) break;
    }
  }
}

/**
 * F9_0000_0000 DisplayGameReplay: „See Replay?” (Esc / No replay — koniec), po szybkiej lub pełnej powtórce okno wraca;
 * po zapisie na dysk — koniec. Ekran gry jest przywracany z ekranu 1 (F0_1866_25b6 / 25d7).
 */
export async function displayGameReplay(ui: Ui, assets: GameAssets, state: GameState, options: ReplayOptions = {}, hail: HailState | null = null): Promise<void> {
  const g = ui.gfx;
  for (;;) {
    const mode = (hail ? 4 : await showDialog(ui, REPLAY_MENU, 100, 80)) as number;
    if (mode <= 0) return;
    if (mode === 3 && !options.writeReplay) {
      await showDialog(ui, 'File Error: REPLAY.TXT\n', 100, 80);
      return;
    }
    g.copy(0, 0, 0, 320, 200, 1, 0, 0);
    const run = new ReplayRun(ui, assets, state, mode as ReplayMode, hail);
    await playReplay(run);
    if (mode === 3) {
      const text = [...replayMapText(state), ...run.lines].join('\r\n') + '\r\n';
      try {
        await options.writeReplay!(text);
      } catch (error) {
        await showDialog(ui, `File Error: ${String(error).slice(0, 30)}\n`, 100, 80);
      }
    }
    if (mode !== 4) {
      g.copy(1, 0, 0, 320, 200, 0, 0, 0);
      ui.present();
    }
    if (mode >= 3) return;
  }
}

/**
 * F9_0000_0dde DisplayHailTheConquerorMessage: powtórka bez rysowania (tryb 4) z ekranami pokonanych przez człowieka
 * władców, potem „The entire world hails … the CONQUEROR!” i czekanie na klawisz.
 */
export async function displayHailTheConqueror(ui: Ui, assets: GameAssets, state: GameState): Promise<void> {
  const g = ui.gfx;
  g.fillRect(0, 0, 320, 200, 0);
  const font = g.fontId;
  g.fontId = 6;
  const hail: HailState = { count: 0, leaders: new Array<number>(14).fill(-1) };
  await displayGameReplay(ui, assets, state, {}, hail);
  g.fillRect(18, 150, 284, 32, 34);
  g.drawCenteredStringWithShadow('The entire world hails', 160, 152, 23, 20);
  g.drawCenteredStringWithShadow(`${state.players[state.humanPlayer]!.leader} the CONQUEROR!`, 160, 168, 23, 20);
  ui.present();
  ui.input.clear();
  await ui.waitKeyOrClick();
  g.fontId = font;
}

/** Galeria pokonanych władców z SLAM2.PIC (ekran 1, y = 133) na ekranie `to`. */
function drawLeaderGallery(ui: Ui, hail: HailState, to: 0 | 1): void {
  hail.leaders.forEach((leader, i) => {
    if (leader === -1) return;
    ui.gfx.copy(1, 1 + (leader % 7) * 28, 133 + Math.trunc(leader / 7) * 34, 27, 33, to, 8 + (i % 7) * 46, 49 - Math.trunc(i / 7) * 42);
  });
}

/** F9_0000_0f79 ShowDestroyPlayerWithLeaderAnimation: portret pokonanego władcy, galeria i napis „… destroy the … civilization!”. */
async function destroyedLeaderScreen(run: ReplayRun, player: number, year: number): Promise<void> {
  const { ui, assets, state } = run;
  const hail = run.hail!;
  const g = ui.gfx;
  const nation = run.nations[player] ?? player;
  const leaderId = NATION_LEADER_IDS[nation] ?? 0;
  const kingFile = leaderFile(nation, 'PIC');
  const full = assets.has(kingFile) && assets.has('SLAM1.PIC') && assets.has('SLAM2.PIC');
  let portrait: ReturnType<typeof g.cut> | null = null;
  if (full) {
    g.loadPic(1, 0, 0, assets.pic(kingFile));
    portrait = g.cut(1, 181, 67, 139, 133);
    g.loadPic(1, 0, 0, assets.pic('SLAM1.PIC'));
    await ui.fadePalette([0, 0, 0], 5);
    g.copy(1, 0, 0, 320, 200, 0, 0, 0);
    g.loadPic(1, 0, 133, assets.pic('SLAM2.PIC'));
    drawLeaderGallery(ui, hail, 0);
    g.screen.blit(portrait, 0, 0, portrait.width, portrait.height, 90, 0, true);
    // paleta SLAM1.PAL z kolorami 64–143 z KING??.PAL
    const target = g.palette.clone();
    const slam = assets.optional('SLAM1.PAL') ?? assets.optional('SLAM1.PIC');
    const slamRange = slam ? readPaletteRange(slam) : null;
    if (slamRange) target.apply(slamRange);
    const kingPal = assets.optional(leaderFile(nation, 'PAL'));
    const kingRange = kingPal ? readPaletteRange(kingPal) : null;
    if (kingRange) {
      const merged = new Palette();
      merged.apply(kingRange);
      for (let c = 64; c < 144; c++) target.setColor(c, merged.rgb[c * 3]!, merged.rgb[c * 3 + 1]!, merged.rgb[c * 3 + 2]!);
    }
    await ui.fadePalette(target, 8);
  } else {
    g.fillRect(0, 0, 320, 200, 0);
    g.drawCenteredString(state.players[player]!.leader || run.adjective(player), 160, 60, 15);
  }
  // miejsce w galerii: reszta z dzielenia przez 7, na przemian od lewej i od prawej, drugi rząd od siódmego
  const r = hail.count % 7;
  let index = r & 1 ? 6 - (r >> 1) : r >> 1;
  if (hail.count >= 7) index += 7;
  hail.count++;
  hail.leaders[index] = leaderId;
  if (full) {
    g.loadPic(1, 0, 0, assets.pic('SLAM1.PIC'));
    g.loadPic(1, 0, 133, assets.pic('SLAM2.PIC'));
    drawLeaderGallery(ui, hail, 1);
  } else {
    g.copy(0, 0, 0, 320, 200, 1, 0, 0);
  }
  ui.present();
  await ui.waitTimer(240);
  g.drawCenteredStringWithShadow(`${yearToString(year)}: ${run.plural(state.humanPlayer)} destroy`, 160, 152, 23, 20);
  g.drawCenteredStringWithShadow(`the ${run.adjective(player)} civilization!`, 160, 168, 23, 20);
  g.copy(0, 0, 133, 320, 67, 1, 0, 133);
  ui.present();
  await ui.waitTimer(60);
  await ui.dissolve(1);
}
