/**
 * Lista plików oryginału potrzebnych interfejsowi — osobny moduł bez zależności,
 * żeby proces główny aplikacji mógł go importować.
 */
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
  'HELP.TXT', // porady (Instant Advice)
  'DOCKER.PIC', // rysunki części statku kosmicznego
  // obrazy ustroju z portretami doradców (LoadGovernmentImage) — raporty wojskowy, handlu i nauki
  'GOVT0A.PIC', 'GOVT0M.PIC', 'GOVT1A.PIC', 'GOVT1M.PIC', 'GOVT2A.PIC', 'GOVT2M.PIC', 'GOVT3A.PIC',
  'FAME.DTA', // tabela Hall of Fame z kopii gry (tylko odczyt — własna tabela w folderze danych aplikacji)
  // rozmowy z władcami (MeetWithKing): tło sali tronowej wg ustroju i portrety władców z paletami
  'BACK0A.PIC', 'BACK1A.PIC', 'BACK2A.PIC', 'BACK3A.PIC', 'BACK0M.PIC', 'BACK1M.PIC', 'BACK2M.PIC',
  ...Array.from({ length: 14 }, (_, i) => `KING${String(i).padStart(2, '0')}.PIC`),
  ...Array.from({ length: 14 }, (_, i) => `KING${String(i).padStart(2, '0')}.PAL`),
  'STORY.TXT', 'BIRTH2.PIC', 'BIRTH3.PIC', 'BIRTH4.PIC', 'BIRTH5.PIC', 'BIRTH6.PIC', 'BIRTH7.PIC', 'BIRTH8.PIC',
  'BIRTH1.PAL', 'BIRTH2.PAL', 'BIRTH3.PAL', 'BIRTH4.PAL', 'BIRTH5.PAL', 'BIRTH6.PAL', 'BIRTH7.PAL', 'BIRTH8.PAL',
  // Civilopedia (Encyclopedia): opisy tematów BLURB0–4.TXT (bez nich — własne teksty), rysunki technologii, jednostek,
  // terenu i budynków z paletami
  'BLURB0.TXT', 'BLURB1.TXT', 'BLURB2.TXT', 'BLURB3.TXT', 'BLURB4.TXT',
  ...Array.from({ length: 8 }, (_, i) => `ICONPG${i + 1}.PIC`), 'ICONPG1.PAL',
  'ICONPGA.PIC', 'ICONPGB.PIC', 'ICONPGC.PIC', 'ICONPGD.PIC', 'ICONPGE.PIC', 'ICONPGA.PAL',
  'ICONPGT1.PIC', 'ICONPGT2.PIC', 'CITYPIX2.PIC', 'HILL.PAL',
  // powtórka po podboju świata (DisplayHailTheConquerorMessage): tło i galeria pokonanych władców
  'SLAM1.PIC', 'SLAM2.PIC', 'SLAM1.PAL',
  // pałac (Palace): tło, dziedziniec, części budynku wg poziomu, ogrody, smutny pałac
  'CBACK.PIC', 'SAD.PIC', 'CBACKS1.PIC', 'CBACKS2.PIC', 'CBACKS3.PIC',
  'CASTLE0.PIC', 'CASTLE1.PIC', 'CASTLE2.PIC', 'CASTLE3.PIC', 'CASTLE4.PIC',
  'CBRUSH0.PIC', 'CBRUSH1.PIC', 'CBRUSH2.PIC', 'CBRUSH3.PIC', 'CBRUSH4.PIC', 'CBRUSH5.PIC',
  // panorama miasta (CityView): wzgórze, domy i ulice, budynki, cuda, mieszkańcy, animacje najazdu, zamieszek i święta
  'HILL.PIC', 'CITYPIX1.PIC', 'CITYPIX3.PIC', 'WONDERS.PIC', 'WONDERS2.PIC', 'POP.PIC',
  'INVADERS.PIC', 'INVADER2.PIC', 'INVADER3.PIC', 'RIOT.PIC', 'RIOT2.PIC', 'LOVE1.PIC', 'LOVE2.PIC',
] as const;
