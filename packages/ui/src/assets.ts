/**
 * Pliki oryginału potrzebne interfejsowi. Czytane z folderu gry gracza w chwili uruchomienia;
 * nigdy nie trafiają do repozytorium.
 */
import { decodePic, type PicImage } from '@civ-remake/gfx';
import { FontSet, parseFonts } from './font';

/** Bez tych plików interfejs nie wystartuje. */
export const UI_REQUIRED_FILES = [
  'FONTS.CV', // czcionki
  'LOGO.PIC', // logo na ekranie tytułowym
  'DIFFS.PIC', // ekran wyboru poziomu trudności, przeciwników i plemienia
  'CUSTOM.PIC', // ekran „Customize World”
  'SP257.PIC', // arkusz jednostek, paleta gry
  'SP299.PIC', // wzór tła okien i paneli, ikony
  'TER257.PIC', // arkusz terenu
  'MAP.PIC', // mapa Ziemi
] as const;

/** Pliki opcjonalne — bez nich odpowiedni fragment (intro, tekst startowy, paleta gry) jest pomijany lub uproszczony. */
export const UI_OPTIONAL_FILES = [
  'SP256.PAL', 'BACK0A.PAL', // paleta ekranu gry (CommonTools.LoadAndApplyDefaultColorPalette)
  'BIRTH0.PIC', 'BIRTH1.PIC', 'CREDITS.TXT', // intro z napisami (MainIntro)
  'KING.TXT', // tekst powitalny nowej gry (*INIT)
  'TORCH.PIC', // kursor myszy
  'STORY.TXT', 'BIRTH2.PIC', 'BIRTH3.PIC', 'BIRTH4.PIC', 'BIRTH5.PIC', 'BIRTH6.PIC', 'BIRTH7.PIC', 'BIRTH8.PIC',
  'BIRTH1.PAL', 'BIRTH2.PAL', 'BIRTH3.PAL', 'BIRTH4.PAL', 'BIRTH5.PAL', 'BIRTH6.PAL', 'BIRTH7.PAL', 'BIRTH8.PAL',
] as const;

export class GameAssets {
  private readonly pics = new Map<string, PicImage>();
  readonly fonts: FontSet;

  /** `files`: nazwa pliku WIELKIMI LITERAMI → zawartość. */
  constructor(private readonly files: Readonly<Record<string, Uint8Array>>) {
    const missing = UI_REQUIRED_FILES.filter((f) => !files[f]);
    if (missing.length > 0) throw new Error(`Brak plików gry: ${missing.join(', ')}`);
    this.fonts = new FontSet(parseFonts(files['FONTS.CV']!));
  }

  has(name: string): boolean {
    return !!this.files[name.toUpperCase()];
  }

  file(name: string): Uint8Array {
    const f = this.files[name.toUpperCase()];
    if (!f) throw new Error(`Brak pliku gry ${name}`);
    return f;
  }

  optional(name: string): Uint8Array | undefined {
    return this.files[name.toUpperCase()];
  }

  pic(name: string): PicImage {
    const key = name.toUpperCase();
    let image = this.pics.get(key);
    if (!image) {
      image = decodePic(this.file(key));
      this.pics.set(key, image);
    }
    return image;
  }
}
