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
  /** Zapisy gry w folderze danych aplikacji (na Macu ~/Library/Application Support/<aplikacja>/saves). */
  listSaves(): Promise<string[]>;
  readSave(name: string): Promise<string>;
  writeSave(name: string, json: string): Promise<void>;
  /** Zapisy oryginału CIVIL0–9.SVE z plikiem .MAP w folderze gry (tylko odczyt; zapis gry zostaje w folderze aplikacji). */
  listGameSaves(): Promise<number[]>;
  readGameSave(index: number): Promise<{ sve: Uint8Array; map: Uint8Array }>;
}

import { UI_OPTIONAL_FILES, UI_REQUIRED_FILES } from '@civ-remake/ui/files';

/** Pliki oryginału potrzebne interfejsowi (ekrany startowe, menu, mapa). */
export const REQUIRED_FILES: readonly string[] = UI_REQUIRED_FILES;
/** Pliki wczytywane, jeśli są w folderze gry (intro, teksty, palety, kursor). */
export const OPTIONAL_FILES: readonly string[] = UI_OPTIONAL_FILES;
