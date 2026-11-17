/** Powtórka gry (DisplayGameReplay) i „hail the CONQUEROR” na syntetycznych plikach gry. */
import { describe, expect, it } from 'vitest';
import { addReplayData, advanceToHuman, newGame, nextUnit, ReplayKind, type GameState } from '@civ-remake/engine';
import type { UiEvent } from '../src/input';
import { GameScreen } from '../src/screens/gameScreen';
import { displayGameReplay, displayHailTheConqueror, replayMapText } from '../src/screens/replay';
import { drive, makeUi } from './synthetic';

const key = (k: string): UiEvent => ({ type: 'key', key: k });

/** Gra z kilkoma wpisami powtórki: założenie miasta człowieka i komputera, odkrycie, wojna, zniszczenie cywilizacji. */
function replayGame(): GameState {
  const s = newGame({ seed: 31, difficulty: 1, civilizations: 5, nation: 1 });
  advanceToHuman(s);
  s.events.length = 0;
  s.replay = [];
  const h = s.humanPlayer;
  const ai = h === 2 ? 3 : 2;
  const u = s.players[h]!.units[0]!;
  addReplayData(s, ReplayKind.CityFounded, h, 0, u.x, u.y);
  s.turn = 10;
  addReplayData(s, ReplayKind.CityFounded, ai, 16, (u.x + 20) % 80, u.y);
  addReplayData(s, ReplayKind.TechDiscovered, ai, 0);
  s.turn = 60;
  addReplayData(s, ReplayKind.WarDeclared, (h << 4) | ai);
  addReplayData(s, ReplayKind.CityCaptured, h, 16, (u.x + 20) % 80, u.y);
  addReplayData(s, ReplayKind.CivDestroyed, ai, h);
  return s;
}

describe('powtórka gry', () => {
  it('szybka powtórka, potem okno wraca; „No replay” kończy i przywraca ekran', async () => {
    const { ui, assets } = makeUi();
    const s = replayGame();
    ui.gfx.fillRect(0, 0, 320, 200, 5);
    await drive(ui, [key('ArrowDown'), key('Enter'), key('Enter')], () => displayGameReplay(ui, assets, s));
    expect(ui.gfx.screen.pixels[100 * 320 + 100]).toBe(5);
  });

  it('pełna powtórka czeka na klawisz po każdym wpisie; Esc przerywa', async () => {
    const { ui, assets } = makeUi();
    const s = replayGame();
    await drive(ui, [key('ArrowDown'), key('ArrowDown'), key('Enter'), key('a'), key('Escape'), key('Enter')], () => displayGameReplay(ui, assets, s));
  });

  it('zapis na dysk: mapa tekstowa i wiersze wpisów, wpisy człowieka wielkimi literami', async () => {
    const { ui, assets } = makeUi();
    const s = replayGame();
    let written = '';
    await drive(ui, [key('ArrowDown'), key('ArrowDown'), key('ArrowDown'), key('Enter')],
      () => displayGameReplay(ui, assets, s, { writeReplay: async (t) => { written = t; } }));
    const lines = written.split('\r\n');
    expect(lines.slice(0, 50)).toEqual(replayMapText(s));
    const human = s.players[s.humanPlayer]!.nationPlural;
    expect(lines[50]).toBe(`4000 BC: ${human} found the city of ${s.cityNames[0]}`.toUpperCase());
    expect(lines[51]).toMatch(/^3800 BC: \w+ found the city of /);
    expect(lines.some((l) => / declare war on /.test(l))).toBe(true);
    expect(lines.some((l) => / civilization destroyed by /.test(l))).toBe(true);
    // stan gry bez zmian po powtórce (nazwy narodów tylko na czas powtórki)
    expect(s.players[s.humanPlayer]!.nationPlural).toBe(human);
  });

  it('„hail the CONQUEROR”: ekran pokonanego władcy (bez SLAM*.PIC uproszczony) i napis na koniec', async () => {
    const { ui, assets } = makeUi();
    const s = replayGame();
    await drive(ui, [key('Enter')], () => displayHailTheConqueror(ui, assets, s));
  });

  it('GAME → View Replay tylko przy SpaceshipFlags & 0x100', async () => {
    const { ui, assets } = makeUi();
    ui.gfx.patternAvailable = true;
    ui.gfx.loadPic(2, 0, 0, assets.pic('SP299.PIC'));
    const s = replayGame();
    const screen = new GameScreen(ui, assets, s);
    screen.activeUnit = nextUnit(s, s.humanPlayer);
    screen.redrawAll();
    s.spaceshipFlags |= 0x100;
    // menu GAME: „View Replay” dopisane na końcu (opcja 9), potem „See Replay?” → No replay
    const down = Array.from({ length: 9 }, () => key('ArrowDown'));
    await drive(ui, [...down, key('Enter'), key('Enter')], () => screen.showTopMenu(0));
  });
});
