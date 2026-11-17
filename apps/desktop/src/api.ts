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

/** Pliki oryginału potrzebne do narysowania mapy. */
export const REQUIRED_FILES = ['TER257.PIC', 'SP257.PIC', 'SP299.PIC', 'MAP.PIC'] as const;
