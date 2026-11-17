/**
 * Okno statku kosmicznego. Źródło: Spaceship.F18_0000_0259_ShowSpaceshipDialog (rysunek planu i panel danych),
 * F18_0000_0f83_AddSpaceshipPart (wybór rodzaju części), F18_0000_1527_ShowSpaceshipNationDialog i potwierdzenie startu
 * z OpenCivOne (MIT). Liczby liczy silnik (`spaceshipReport`). Rysunki części z DOCKER.PIC (plik opcjonalny).
 *
 * Pominięte: animacja gwiazd (AnimateSpaceshipTravel) i cykle palety DOCKER.PIC.
 */
import {
  addSpaceshipPart, isLaunched, launchSpaceship, SPACESHIP_CELLS, SPACESHIP_HEIGHT, SPACESHIP_PARTS, spaceshipPartChoices,
  spaceshipReport, BUILDINGS, type GameState,
} from '@civ-remake/engine';
import { PLAYER_COLORS } from '@civ-remake/gfx';
import type { GameAssets } from '../assets';
import { showDialog } from '../menuBox';
import type { Ui } from '../ui';


/**
 * Rysuje plan i dane statku gracza `p`; gdy `enableLaunch` i statek nie wystartował — przycisk LAUNCH
 * (klawisz L albo klik w prawy dolny róg) z potwierdzeniem. Czeka na klawisz lub klik.
 */
export async function showSpaceshipScreen(ui: Ui, assets: GameAssets, state: GameState, p: number, enableLaunch: boolean): Promise<void> {
  const g = ui.gfx;
  const pl = state.players[p]!;
  const color = PLAYER_COLORS[p]!;
  const docker = assets.optional('DOCKER.PIC') ? assets.pic('DOCKER.PIC') : null;
  const stats = spaceshipReport(state, p);
  g.copy(0, 0, 0, 320, 200, 2, 0, 0);
  if (docker) g.setPaletteFromFile(assets.file('DOCKER.PIC'));
  g.fillRect(0, 0, 320, 200, 0);
  g.fillRect(0, 0, 320, 8, color);
  g.drawCenteredString(`${pl.nationAdjective} SpaceShip: ${pl.nationAdjective.slice(0, 1)}.S.S. ${pl.leader}`, 160, 1, 0);
  for (const [x, y] of SPACESHIP_CELLS) {
    const type = pl.spaceship[x * SPACESHIP_HEIGHT + y]!;
    if (type === -1 || !docker) continue;
    const [sx, sy, w, h] = SPACESHIP_PARTS[type]!.rect;
    g.screen.blit(docker, sx, sy, w, h, x * 16 - 16, y * 16 + 8, true);
  }
  for (const [x, y, w, h] of stats.loose) g.drawRectangle(x * 16 - 16, y * 16 + 8, w * 16 - 1, h * 16 - 1, 12);
  if (stats.mass >= 80 && docker) {
    const [sx, sy, w, h] = SPACESHIP_PARTS[5]!.rect;
    g.screen.blit(docker, sx, sy, w, h, 152, 88, true);
  }
  g.fillRect(240, 8, 80, 192, color);
  g.drawLine(0, 8, 0, 199, color);
  g.drawLine(0, 199, 240, 199, color);
  let y = 16;
  const line = (text: string, warn = false) => {
    g.drawString(text, 242, y, warn ? 4 : 0);
  };
  line('Population:');
  y += 8;
  line(`${stats.population}0,000`);
  y += 8;
  line(`Support: ${stats.support}%`, stats.support < 100);
  y += 8;
  line(`Energy: ${stats.energy}%`, stats.energy < 100);
  y += 16;
  line('Mass:');
  y += 8;
  line(`${Math.trunc(stats.mass / 10)},${stats.mass % 10}00 tons`);
  y += 8;
  line(`Fuel: ${stats.fuel}%`, stats.fuel < 100);
  y += 8;
  line('Flight Time:');
  y += 8;
  line(`${Math.trunc(stats.travelTime / 10)}.${stats.travelTime % 10} Years`);
  y += 16;
  line('Prob. of Success');
  y += 8;
  line(`--- ${stats.success}% ---`);
  y += 16;
  const launched = isLaunched(state, p);
  if (launched) line(pl.spaceshipEta < state.year ? 'Landed!' : 'Launched!');
  const canLaunch = enableLaunch && !launched && p === state.humanPlayer && stats.population !== 0;
  if (canLaunch) {
    g.drawString('LAUNCH', 256, 190, 0);
    g.drawRectangle(242, 188, 76, 9, 0);
  }
  ui.present();
  ui.input.clear();
  const e = await ui.waitKeyOrClick();
  const launch = canLaunch && ((e.type === 'key' && e.key.toLowerCase() === 'l') || (e.type === 'mousedown' && e.x > 242 && e.y > 191));
  if (launch) {
    const r = await showDialog(ui, `Confirm spaceship launch.\n(${stats.success}% chance of success)\n No Launch\n Launch CONFIRMED!\n`, 80, 100);
    if (r === 1) {
      launchSpaceship(state, p);
      g.fillRect(0, 0, 320, 200, 0);
      g.drawCenteredString(`${pl.nationPlural} launched space ship!`, 160, 92, 15);
      g.drawCenteredString(`Estimated arrival in ${pl.spaceshipEta}.`, 160, 100, 15);
      ui.present();
      await ui.waitKeyOrClick();
      // komunikat o starcie już pokazany — usuwamy zdarzenie z kolejki
      const i = state.events.findIndex((ev) => ev.kind === 'spaceshipLaunched' && ev.player === p);
      if (i !== -1) state.events[i] = { kind: 'spaceshipLaunchedShown', player: p };
    }
  }
  g.copy(2, 0, 0, 320, 200, 0, 0, 0);
}

/** AddSpaceshipPart (człowiek): wybór rodzaju komponentu/modułu, wstawienie części i plan statku z przyciskiem startu. */
export async function spaceshipPartDialog(ui: Ui, assets: GameAssets, state: GameState, part: number, placed: boolean): Promise<void> {
  const p = state.humanPlayer;
  if (part > 0 && !placed) {
    for (;;) {
      const choices = spaceshipPartChoices(state, p, part);
      if (!choices.some((c) => c.available)) {
        await showDialog(ui, `No further ${BUILDINGS[21 + part]!.name} required.\n`, 100, 80);
        break;
      }
      let text = 'Type?\n';
      for (const c of choices) text += ` ${SPACESHIP_PARTS[c.bitmap]!.name}\n`;
      let disabled = 0;
      choices.forEach((c, i) => {
        if (!c.available) disabled |= 1 << i;
      });
      const r = await showDialog(ui, text, 100, 80, disabled);
      if (r < 0) return;
      if (addSpaceshipPart(state, p, part, choices[r]!.bitmap)) break;
    }
  }
  await showSpaceshipScreen(ui, assets, state, p, true);
}

/** ShowSpaceshipNationDialog: „Which nation?” — tylko cywilizacje budujące statek. */
export async function spaceshipNationDialog(ui: Ui, assets: GameAssets, state: GameState): Promise<void> {
  if ((state.spaceshipFlags & 0xfe00) === 0) return;
  let text = 'Which nation?\n';
  for (let i = 1; i < 8; i++) text += ` ${state.players[i]!.nationAdjective}\n`;
  const disabled = ((state.spaceshipFlags >> 9) ^ 0xff) & 0x7f;
  const r = await showDialog(ui, text, 100, 80, disabled);
  if (r >= 0) await showSpaceshipScreen(ui, assets, state, r + 1, r + 1 === state.humanPlayer);
}
