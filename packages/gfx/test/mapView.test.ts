/** Widok mapy na danych syntetycznych (prawdziwe arkusze sprawdza test z CIV1_DIR). */
import { describe, expect, it } from 'vitest';
import { advanceToHuman, createUnit, newGame, unitOrder } from '@civ-remake/engine';
import { drawMapView, drawMiniMap, MAP_VIEW, PLAYER_COLORS, prepareSprites, type Surface } from '../src';
import type { PicImage } from '../src';

/** Arkusz 320×200, w którym każdy piksel ma kolor 10 (zamieniany na kolor gracza), poza obramowaniem kafli. */
const fakeSheet = (color = 10): PicImage => ({ width: 320, height: 200, pixels: new Uint8Array(320 * 200).fill(color), palette: null });

describe('widok mapy', () => {
  it('rysuje teren tylko na odkrytych polach i jednostkę gracza w jego kolorze', () => {
    const state = newGame({ seed: 77, difficulty: 1, civilizations: 5, nation: 1 });
    advanceToHuman(state);
    const sheets = { ter: fakeSheet(3), sp: fakeSheet(10), sp299: fakeSheet(3) };
    const sprites = prepareSprites(sheets);
    const screen: Surface = { width: 320, height: 200, pixels: new Uint8Array(320 * 200) };
    const u = state.players[state.humanPlayer]!.units[0]!;
    const viewX = u.x - 7;
    const viewY = Math.min(Math.max(u.y - 6, 0), 38);
    drawMapView(screen, state, sprites, { viewX, viewY });
    const sx = MAP_VIEW.x + (u.x - viewX) * 16;
    const sy = MAP_VIEW.y + (u.y - viewY) * 16;
    // środek jednostki w kolorze gracza
    expect(screen.pixels[(sy + 7) * 320 + sx + 7]).toBe(PLAYER_COLORS[state.humanPlayer]);
    // róg widoku daleko od jednostki jest nieodkryty → czarny
    const far = MAP_VIEW.y * 320 + MAP_VIEW.x;
    if (Math.abs(viewX - u.x) > 2) expect(screen.pixels[far]).toBe(0);
    // nic nie wychodzi poza obszar mapy (lewy panel pusty)
    for (let y = 60; y < 200; y++) for (let x = 0; x < 80; x++) expect(screen.pixels[y * 320 + x]).toBe(0);
    drawMiniMap(screen, state, viewX, viewY);
  });

  it('miasto ma ramkę i kolor właściciela', () => {
    const state = newGame({ seed: 78, difficulty: 1, civilizations: 5, nation: 1 });
    advanceToHuman(state);
    const h = state.humanPlayer;
    const u = state.players[h]!.units[0]!;
    const { x, y } = u;
    createUnit(state, h, 2, x, y);
    unitOrder(state, h, 0, 'build');
    const sprites = prepareSprites({ ter: fakeSheet(3), sp: fakeSheet(0), sp299: fakeSheet(3) });
    const screen: Surface = { width: 320, height: 200, pixels: new Uint8Array(320 * 200) };
    const viewY = Math.min(Math.max(y - 6, 0), 38);
    drawMapView(screen, state, sprites, { viewX: x - 7, viewY });
    const sx = MAP_VIEW.x + 7 * 16;
    const sy = MAP_VIEW.y + (y - viewY) * 16;
    expect(screen.pixels[(sy + 1) * 320 + sx + 1]).toBe(15); // biała ramka
    expect(screen.pixels[(sy + 8) * 320 + sx + 8]).toBe(PLAYER_COLORS[h]); // wypełnienie
    expect(screen.pixels[sy * 320 + sx]).toBe(0); // czarna ramka obrońców
  });
});
