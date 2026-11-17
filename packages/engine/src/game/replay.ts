/**
 * Dane powtórki gry (Replay). Źródło: Segment_1866.F0_1866_250e (AddReplayData) z dosłownego tłumaczenia asemblera
 * w OpenCivOne (MIT) i Replay.cs (DisplayGameReplay — odczyt wpisów, Overlay_9.F9_0000_0000).
 *
 * Bufor ReplayData ma 4096 bajtów (zapis .SVE). Wpis: bajt (rodzaj << 4) + (tura >> 8), bajt tura & 0xff, potem dane.
 * Wpis nie trafia do bufora, gdy długość + liczba danych + 2 ≥ 0x1000. W stanie silnika trzymamy tylko zajętą część
 * (`state.replay`, brak w starszych zapisach JSON = pusta powtórka).
 *
 * Rodzaje wpisów i miejsca wywołań w oryginale:
 *   1  założenie miasta (gracz, nazwa, x, y) — Overlay_20 (FindNewCity), albo zniszczenie (gracz 0xff) — F0_1ade_018e_DeleteCity,
 *   2  wypowiedzenie wojny (p1 << 4 | p2) — F0_2517_0aa1_ClearDiplomacyFlags(Peace),
 *   3  pokój (p1 << 4 | p2) — F0_2517_0a30_SetDiplomacyFlags(Peace),
 *   5  pierwsze odkrycie technologii (gracz, technologia) — F0_1ade_… (ResearchFinished),
 *   6  pierwsza jednostka danego typu (gracz, typ) — CityWorker (Segment_1d12),
 *   8  nowy ustrój (gracz, ustrój) — F0_2517_04a1_ChangeCurrentGovernment,
 *   9  zdobycie miasta (gracz, nazwa, x, y) — F0_2459 (CityTakeover),
 *   10 cud (gracz, cud) — CityWorker (Segment_1d12) i GiveWonderToAI (Segment_1238),
 *   11 co 50 tur: liczba miast człowieka, ludność >> 8, ludność & 0xff — GameTurn,
 *   12 co 50 tur: ranking (4 bajty, po dwa numery graczy) — GameTurn,
 *   13 zniszczenie cywilizacji (gracz, zwycięzca) — Overlay_5 (TestIfAIPlayerIsDestroyed).
 */
import type { GameState } from './types';

export const REPLAY_SIZE = 0x1000;

export const ReplayKind = {
  CityFounded: 1, WarDeclared: 2, Peace: 3, TechDiscovered: 5, FirstUnit: 6, Government: 8, CityCaptured: 9,
  Wonder: 10, HumanStatus: 11, Ranking: 12, CivDestroyed: 13,
} as const;

/** Liczba bajtów danych po nagłówku wpisu (wg odczytu w DisplayGameReplay; rodzaje 4 i 7 nie mają danych). */
export function replayDataLength(kind: number): number {
  switch (kind) {
    case 1: case 9: case 12: return 4;
    case 2: case 3: return 1;
    case 5: case 6: case 8: case 10: case 13: return 2;
    case 11: return 3;
    default: return 0;
  }
}

/** F0_1866_250e_AddReplayData: dopisuje wpis z bieżącą turą (dane jako bajty). */
export function addReplayData(state: GameState, kind: number, ...data: number[]): void {
  const replay = (state.replay ??= []);
  if (replay.length + data.length + 2 >= REPLAY_SIZE) return;
  replay.push((((kind << 4) & 0xff) + ((state.turn & 0xffff) >> 8)) & 0xff, state.turn & 0xff);
  for (const d of data) replay.push(d & 0xff);
}

export interface ReplayEntry {
  kind: number;
  turn: number;
  data: number[];
}

/** Odczyt wpisów jak w F9_0000_0000: tura = ((bajt0 & 0xf) << 8) + bajt1, rodzaj = bajt0 >> 4. */
export function replayEntries(state: GameState): ReplayEntry[] {
  const replay = state.replay ?? [];
  const out: ReplayEntry[] = [];
  for (let p = 0; p < replay.length; ) {
    const b0 = replay[p]!;
    const turn = ((b0 & 0xf) << 8) + (replay[p + 1] ?? 0);
    const kind = b0 >> 4;
    p += 2;
    const n = replayDataLength(kind);
    out.push({ kind, turn, data: replay.slice(p, p + n) });
    p += n;
  }
  return out;
}
