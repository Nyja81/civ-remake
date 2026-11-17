/** Kontrakt między procesem głównym a stroną gry (przez preload). */
export type LoadResult =
  | { ok: true; folder: string; files: Record<string, Uint8Array> }
  | { ok: false; reason: 'no-folder' }
  | { ok: false; reason: 'missing'; folder: string; missing: string[] };

export interface CivApi {
  /** Wczytuje pliki grafik i mapy z zapamiętanego folderu z oryginalną grą. */
  load(): Promise<LoadResult>;
  /** Pokazuje okno wyboru folderu, zapamiętuje wybór i wczytuje pliki. */
  choose(): Promise<LoadResult>;
}

import { UI_OPTIONAL_FILES, UI_REQUIRED_FILES } from '@civ-remake/ui/files';

/** Pliki oryginału potrzebne interfejsowi (ekrany startowe, menu, mapa). */
export const REQUIRED_FILES: readonly string[] = UI_REQUIRED_FILES;
/** Pliki wczytywane, jeśli są w folderze gry (intro, teksty, palety, kursor). */
export const OPTIONAL_FILES: readonly string[] = UI_OPTIONAL_FILES;
