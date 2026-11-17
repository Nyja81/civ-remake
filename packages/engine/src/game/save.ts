/**
 * Zapis i odczyt stanu gry (własny format JSON; zapis .SVE oryginału — etap 0, do zrobienia).
 */
import { mscRandom } from '../world/random';
import { emptyPlayer } from './players';
import type { GameState, Player } from './types';

const ARRAYS = ['terrain', 'riverVariant', 'improvements', 'visibleImprovements', 'group', 'buildScore', 'landOwner', 'occupant'] as const;

// base64 bez Buffer (silnik działa też w przeglądarce)
function toB64(a: Uint8Array): string {
  let s = '';
  for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const SAVE_VERSION = 1;

export function saveGame(state: GameState): string {
  const { rng, events, map, ...rest } = state;
  void events;
  const mapOut: Record<string, unknown> = { continents: map.continents, oceans: map.oceans };
  for (const k of ARRAYS) mapOut[k] = toB64(map[k]);
  mapOut.explored = toB64(new Uint8Array(map.explored.buffer, map.explored.byteOffset, map.explored.byteLength));
  return JSON.stringify({ version: SAVE_VERSION, rng: rng.state ?? 0, map: mapOut, ...rest });
}

export function loadGame(json: string): GameState {
  const data = JSON.parse(json) as Record<string, unknown> & { version: number; rng: number; map: Record<string, unknown> };
  if (data.version !== SAVE_VERSION) throw new Error(`Nieobsługiwana wersja zapisu: ${data.version}`);
  const m = data.map;
  const map: Record<string, unknown> = { continents: m.continents, oceans: m.oceans };
  for (const k of ARRAYS) map[k] = fromB64(m[k] as string);
  const explored = fromB64(m.explored as string);
  map.explored = new Uint16Array(explored.buffer, explored.byteOffset, explored.byteLength / 2).slice();
  const rng = mscRandom(0);
  rng.state = data.rng;
  const { version, rng: _r, map: _m, ...rest } = data;
  void version;
  void _r;
  void _m;
  const base = rest as unknown as GameState;
  const state: GameState = { ...base, aiFlags: base.aiFlags ?? 0, aiMakeContact: base.aiMakeContact ?? false,
    map: map as unknown as GameState['map'], rng, events: [] };
  // Zapisy ze starszych wersji: brakujące pola gracza z wartości początkowych
  state.players = state.players.map((p: Player) => ({ ...emptyPlayer(), ...p }));
  return state;
}
