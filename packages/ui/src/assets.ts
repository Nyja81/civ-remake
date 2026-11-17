/**
 * Pliki oryginału potrzebne interfejsowi. Czytane z folderu gry gracza w chwili uruchomienia;
 * nigdy nie trafiają do repozytorium.
 */
import { decodePic, type PicImage } from '@civ-remake/gfx';
import { FontSet, parseFonts } from './font';
import { UI_REQUIRED_FILES } from './files';

export { UI_OPTIONAL_FILES, UI_REQUIRED_FILES } from './files';

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
