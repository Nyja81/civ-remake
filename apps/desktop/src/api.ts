/** Kontrakt między procesem głównym a stroną gry (przez preload). */
export type LoadResult =
  | { ok: true; folder: string; files: Record<string, Uint8Array> }
  | { ok: false; reason: 'no-folder' }
  | { ok: false; reason: 'missing'; folder: string; missing: string[] };

/** Wynik zapisu CIVILn.SVE/.MAP (kod błędu systemu: EACCES, EPERM, EROFS, ENOSPC…). */
export type SaveWriteResult = { ok: true } | { ok: false; file: 'map' | 'sve'; code: string };

/** Wygładzanie obrazu: brak (piksele oryginału), lekkie (xBR bez mieszania kolorów), mocne (xBR z mieszaniem + zmiękczenie). */
export type Smoothing = 'none' | 'light' | 'strong';

/** Karta dźwiękowa: sterownik ASOUND.CVL (AdLib), ISOUND.CVL (głośnik PC) albo bez dźwięku. */
export type SoundCardChoice = 'adlib' | 'speaker' | 'none';

export interface CivApi {
  /** Wczytuje pliki grafik i mapy z zapamiętanego folderu z oryginalną grą. */
  load(): Promise<LoadResult>;
  /** Pokazuje okno wyboru folderu, zapamiętuje wybór i wczytuje pliki. */
  choose(): Promise<LoadResult>;
  /** Zapisy gry w folderze danych aplikacji (na Macu ~/Library/Application Support/<aplikacja>/saves). */
  listSaves(): Promise<string[]>;
  readSave(name: string): Promise<string>;
  writeSave(name: string, json: string): Promise<void>;
  removeSave(name: string): Promise<void>;
  /** Co ile tur cichy autozapis (GAME → Autosave...); 0 = wyłączony, domyślnie 5. */
  getAutosaveTurns(): Promise<number>;
  setAutosaveTurns(turns: number): Promise<void>;
  /** Zapisy oryginału CIVIL0–9.SVE z plikiem .MAP w folderze gry (odczyt, zapis z GAME → Save Game i autozapisu). */
  listGameSaves(): Promise<number[]>;
  readGameSave(index: number): Promise<{ sve: Uint8Array; map: Uint8Array }>;
  writeGameSave(index: number, sve: Uint8Array, map: Uint8Array): Promise<SaveWriteResult>;
  /** Zapamiętane wygładzanie (menu View → Smoothing). */
  getSmoothing(): Promise<Smoothing>;
  /** Zamyka aplikację (Exit w menu głównym). */
  quit(): void;
  /** Wywoływane po zmianie wygładzania w menu. */
  onSmoothing(callback: (mode: Smoothing) => void): void;
  /** Zapamiętana karta dźwiękowa (menu View → Sound). */
  getSoundCard(): Promise<SoundCardChoice>;
  /** Wywoływane po zmianie karty dźwiękowej w menu. */
  onSoundCard(callback: (card: SoundCardChoice) => void): void;
}

import { UI_OPTIONAL_FILES, UI_REQUIRED_FILES } from '@civ-remake/ui/files';

/** Pliki oryginału potrzebne interfejsowi (ekrany startowe, menu, mapa). */
export const REQUIRED_FILES: readonly string[] = UI_REQUIRED_FILES;
/** Pliki wczytywane, jeśli są w folderze gry (intro, teksty, palety, kursor). */
export const OPTIONAL_FILES: readonly string[] = UI_OPTIONAL_FILES;
