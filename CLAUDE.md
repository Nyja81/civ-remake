# CLAUDE.md — civ-remake

Własna, napisana od nowa gra strategiczna na Maca, zgodna zasadami z oryginałem z 1991 r.
Projekt hobbystyczny. Notatka Obsidian: `Projekty/civ-remake.md`.

## Zasady obowiązkowe

1. **PRZED pracą** — przeczytaj `docs/ARCHITECTURE.v2.md` (najnowsza wersja) oraz notatkę `Projekty/civ-remake.md` w Obsidianie.
2. **PO pracy** — dopisz zmiany do sekcji „Historia zmian” poniżej.
3. **PO pracy — AKTUALIZACJA OBSIDIAN (obowiązkowe).** Jeśli praca dodała lub zmieniła moduł,
   pakiet, format danych, etap lub istotną decyzję — zaktualizuj `Projekty/civ-remake.md`
   (edycja w miejscu + wpis z datą w „Historia zmian (notatka Obsidian)”).

Wersjonowanie dokumentów: zmiana o więcej niż ~20% treści = nowy plik (`<nazwa>.v2.md`), bez nadpisywania.
Nie dotyczy kodu — ten wersjonuje Git.

## Zasady projektu

- **Specyfikacją jest oryginał** (DOS, wersja 475.05). Żadnej reguły nie piszemy „z pamięci”:
  każda liczba i każdy wzór muszą mieć źródło we wzorcu i test porównawczy.
- **Pliki oryginału nigdy nie trafiają do repozytorium.** Narzędzia czytają je z `CIV1_DIR`.
- Tabele w `packages/engine/src/data/{techs,units,terrain}.ts` są **generowane** (`npm run extract`) — nie edytuj ich ręcznie.
- Silnik (`packages/engine`) nie importuje niczego z interfejsu ani z `packages/oracle`.
- Identyfikatory po angielsku; komentarze i dokumentacja po polsku; teksty w grze po angielsku.
- Grafika: oryginalna, wczytywana z kopii gry Damiana (`CIV1_DIR`) i wygładzana lokalnie; do repozytorium nie trafiają
  ani pliki oryginału, ani zrzuty z nimi. Teksty encyklopedii piszemy własne.

## Polecenia

```
npm install
npm test                          # testy silnika
CIV1_DIR=/sciezka/do/gry npm test # dodatkowo porównanie z oryginalnym CIV.EXE
npm run typecheck
npm run art:preview                # próbki grafiki -> docs/samples/
npm run desktop:build              # buduje aplikację (apps/desktop/dist)
CIV1_DIR=/sciezka/do/gry npm run extract   # ponowne wygenerowanie tabel
```

## Historia zmian

### 2026-11-17 — start projektu (etap 0, część 1)
- Szkielet repozytorium: npm workspaces, TypeScript, Vitest.
- `packages/engine`: generator losowy `MscRand` (Microsoft C `rand()`), stałe mapy i limity stanu gry,
  typy tabel danych.
- `packages/oracle`: rozpakowanie EXEPACK, odczyt tabel technologii (67), jednostek (28) i terenu (24)
  z CIV.EXE, generator tabel silnika, test zgodności z oryginałem.
- `docs/ARCHITECTURE.md`: architektura, decyzje, etapy.
- Do zrobienia w etapie 0: pozostałe tabele (budynki, cuda, nacje), odczyt i zapis `.SVE`,
  uruchomienie wykonywalnego wzorca bez okna.

### 2026-11-17 — pierwsze próbki grafiki
- Nowy pakiet `packages/art`: kafle terenu (12 typów), żetony jednostek (Settlers, Phalanx, Legion, Trireme),
  kafel miasta; wszystko jako SVG generowane kodem z deterministycznym ziarnem.
- `npm run art:preview` zapisuje próbki do `docs/samples/` (pojedyncze SVG, `map-sample.svg`, `sheet.svg`);
  `preview.png` to zrzut arkusza.
- Fragment mapy: zaokrąglone wybrzeża, płycizny, rzeka łącząca się z sąsiednimi kaflami i morzem.
- Styl do akceptacji przez Damiana przed rysowaniem reszty.

### 2026-11-17 — zmiana kierunku grafiki: zestaw Freeciv „trident”
- Decyzja Damiana: grafika ma wyglądać jak w oryginale; bierzemy zestaw „trident” z Freeciv (GPL-2.0+) i wygładzamy.
- `tools/tileset/` (prototyp w Pythonie + Pillow): odczyt plików `.spec`, składanie mapy z dopasowaniem kafli
  do sąsiadów (wybrzeża, rzeki z ujściami, lasy, góry, arktyka), wygładzanie hq4x + lekkie zmiękczenie.
  Uruchomienie: `FREECIV_DATA=/sciezka/freeciv/data python3 tools/tileset/preview.py` (wymaga `pip install pillow hqx numpy`).
- Próbka: `docs/samples/freeciv-trident-preview.png`. Pliki Freeciv nie są jeszcze w repozytorium.
- Do zrobienia: przeniesienie składania kafli do TypeScriptu (warstwa interfejsu), atlas wygładzonych kafli.

### 2026-11-17 — decyzja: oryginalne grafiki, wygładzone
- Damian chce dokładnie grafik oryginału, tylko w wyższej rozdzielczości i wygładzonych — bez zamienników.
- `tools/original-gfx/` (prototyp, Python + Pillow + numpy + hqx): dekoder `.PIC` (LZW + RLE), odczyt czcionek `FONTS.CV`,
  rysowanie mapy według reguł oryginału (ocean z ćwiartek 8×8, maski sąsiadów terenu, rzeki i ujścia, zasoby,
  miasto, jednostki z podmianą kolorów gracza), wygładzanie 4×.
  Uruchomienie: `python3 tools/original-gfx/preview.py /sciezka/do/gry wynik.png`.
- Zestaw Freeciv i pakiet wektorowy zostają jako pakiety zastępcze.
- Do zrobienia: przeniesienie dekodera i reguł rysowania do TypeScriptu, wygładzanie atlasu kafli zamiast gotowej klatki.

### 2026-11-17 — etap 0: komplet tabel i dekoder grafik w TypeScripcie
- `packages/engine/src/data`: doszły `buildings.ts` (24 budynki, 21 cudów z technologią wygaszającą) i `nations.ts` (16 nacji);
  wszystkie tabele generowane z CIV.EXE i porównywane z nim w teście.
- Nowy pakiet `packages/gfx`: `decodePic()` — dekoder `.PIC` (LZW + RLE, palety), zgodny z prototypem w Pythonie
  na wszystkich 106 plikach z kopii gry.
- Stan testów: 15 z ustawionym `CIV1_DIR` (8 bez niego).
- Do zrobienia w etapie 0: odczyt i zapis `.SVE`, uruchomienie wykonywalnego wzorca bez okna.

### 2026-11-17 — repozytorium na GitHubie; etap 1: generator świata
- Repozytorium `Nyja81/civ-remake` podłączone, historia wypchnięta na `main`.
- `packages/engine/src/world/`: `generateWorld()` — etapy 1–5 generatora (lądy, temperatura, klimat, wiek planety, rzeki),
  interfejs `RandomSource` i `mscRandom()`. Źródło: GenerateNewMap z OpenCivOne (MIT).
  **Niezweryfikowane z oryginałem** (w tym wyprowadzanie zakresów z `rand()`) — wymaga porównania z dosłownym tłumaczeniem.
- Testy: determinizm, niezmienniki na 200 ziarnach, wpływ ustawienia masy lądowej (11 testów bez `CIV1_DIR`, 18 z nim).
- Ustalenie: pole `terrainChangeId` w tabeli terenu to wartość piksela danego terenu na mapie oryginału
  (14 pustynia, 6 równiny, 10 łąka, 2 las, 12 wzgórza, 13 góry…) — do zmiany nazwy przy pracy nad zapisem `.SVE`.
- Do zrobienia: etap 6 generatora (numeracja kontynentów i oceanów), zasoby specjalne, chaty, wartość ziemi;
  rysowanie mapy w TypeScripcie; aplikacja na Maca.
- Notatka Obsidian `Projekty/civ-remake.md` nadal nieutworzona — brak dostępu do vaulta z tej sesji.

### 2026-11-17 — mapa Ziemi
- Wymaganie Damiana: gra ma mieć mapę Ziemi (opcja EARTH oryginału), obok światów losowych.
- `packages/engine/src/world/earth.ts`: `worldFromMapPixels()` — zamiana pikseli `MAP.PIC` (obszar 80×50) na typy terenu
  według tabeli terenu z CIV.EXE. Plik czyta `decodePic` z `packages/gfx`; sama mapa nie trafia do repozytorium.
- Testy: 2 w silniku + 1 na pliku oryginału (21 testów z `CIV1_DIR`).
- Do zrobienia: wybór „Earth / losowy świat / własne ustawienia” w menu nowej gry; pozycje startowe cywilizacji na Ziemi.

### 2026-11-17 — etap 1: aplikacja na Maca z przewijaną mapą (wersja 0.1.0)
- `packages/engine/src/world/features.ts`: `hasSpecialResource()` i `hasTribalHut()` — wyliczane z położenia pola i ziarna gry
  (wzory z OpenCivOne, MIT).
- `packages/gfx/src/mapRenderer.ts`: `renderTerrain()` i `toRgba()` — rysowanie terenu z arkuszy oryginału według reguł oryginału.
  Wynik identyczny z prototypem w Pythonie dla trzech ziaren (bez wariantów rzek, których prototyp nie rysuje).
- `apps/desktop` (Electron 33, esbuild): okno z mapą 80×50, przeciąganie i strzałki, zoom kółkiem, zawijanie w poziomie,
  „New World” (losowe ziarno), „Earth” (MAP.PIC), wybór folderu z oryginalną grą zapamiętywany w ustawieniach,
  pasek stanu z typem terenu, zasobem i chatą. Wygładzanie: xBR 4× (`xbr-js`, MIT) + lekkie zmiękczenie —
  wygląd bardzo bliski zatwierdzonej próbce hq4x.
- Sprawdzone: strona gry w Chrome bez okna (zrzut ekranu z mapą Ziemi). **Niesprawdzone:** uruchomienie paczki `.app` na Macu
  (okno wyboru folderu, podpis ad hoc z rcodesign).
- Pakowanie (ręcznie, na Linuksie): `npm run desktop:build`, skopiowanie `apps/desktop/dist` + minimalnego `package.json`
  do katalogu roboczego, `npx @electron/packager <katalog> "Civ Remake" --platform=darwin --arch=arm64`, `rcodesign sign`, `zip -ry`.
- Odstępstwo od planu: mapa rysowana na zwykłym canvasie 2D (bez PixiJS i Reacta) — wystarcza na tym etapie.
- Do zrobienia: etap 6 generatora (kontynenty/oceany), weryfikacja generatora z oryginałem, etap 2 (jednostki, ruch, mgła wojny).


### 2026-11-17 — etapy 2–3 w silniku, część 4–6, widok mapy jak w oryginale
- Wzorzec do przenoszenia reguł: OpenCivOne z codeberg.org/rhorvat/OpenCivOne (MIT) — dosłowne tłumaczenie kodu oryginału
  (`src/Game/CodeObjects/*.cs`); klonować obok repozytorium, nie do niego.
- `packages/engine/src/game/`: `types.ts` (stan gry jak w zapisie oryginału), `map.ts` (warstwy mapy, etapy 6–8 generatora:
  kontynenty/oceany, atrakcyjność pól, czapy polarne; 49 kierunków), `units.ts` (tworzenie/usuwanie, zajętość pól, widoczność),
  `movement.ts` (MoveUnit: ZOC, koszt terenu z losowaniem, drogi/kolej, statki z ładunkiem, ziemia innych cywilizacji),
  `combat.ts` (AttackUnit, najlepszy obrońca), `huts.ts`, `cities.ts` (FindNewCity, DeleteCity, CityTakeover),
  `techs.ts` (ResearchFinished, wybór badań komputera), `economy.ts` (ProcessCityState bez okna: praca mieszkańców, wzrost,
  produkcja, handel, korupcja, podatki, nauka, zadowolenie, utrzymanie, zanieczyszczenie), `production.ts` (lista produkcji,
  zakup), `government.ts`, `barbarians.ts`, `turn.ts` (rozkazy, kolejka jednostek, przebieg tury, kalendarz), `save.ts` (JSON),
  `players.ts` (nowa gra, rozstawienie cywilizacji, mapa Ziemi), `ai.ts` (**tymczasowy** prosty przeciwnik).
- Ważne ustalenie: we wzorcu `GetVisibleTerrainImprovements` czyta warstwę RZECZYWISTĄ, a `GetTerrainImprovements` — widok
  człowieka (nazwy zamienione). Silnik: logika czyta `map.improvements`, rysowanie — `map.visibleImprovements`.
- `packages/gfx/src/mapView.ts`: rysowanie widoku mapy do ekranu 320×200 jak w oryginale (DrawVisibleMap/DrawCell/DrawUnit):
  teren, ulepszenia, mgła, miasta, jednostki w kolorach graczy (SP257 wg LoadBitmaps), minimapa.
- Decyzja Damiana: interfejs, menu i ekrany startowe mają być takie same jak w oryginale, wygładzone 4× — robi to drugi agent
  na gałęzi `ui-screens` (pakiet `packages/ui`).
- Testy: 37 (silnik: gra, gospodarka, produkcja, symulacja 200 tur, zapis/odczyt; gfx: widok mapy na danych syntetycznych).
- `docs/ARCHITECTURE.v2.md` — nowa wersja dokumentu (stan etapów, odstępstwa). Notatka Obsidian `Projekty/civ-remake.md` utworzona.
- Do zrobienia: port AIEngine i GoTo (etap 6), dyplomacja i spotkania z władcami, statek kosmiczny, koniec gry i punktacja
  (etap 7), atak jądrowy, klęski, globalne ocieplenie, okno miasta, pałac, doradcy, encyklopedia, dźwięk (etap 8), zapis `.SVE`.

### 2026-11-17 — interfejs jak w oryginale (gałąź ui-screens)
- Wymaganie Damiana: interfejs, menu i ekrany startowe takie same jak w oryginale, tylko lekko wygładzone i w wyższej rozdzielczości.
- Nowy pakiet `packages/ui`: wirtualny ekran 320×200 w indeksach palety (trzy ekrany jak w oryginale, wspólna paleta z bloków M0
  plików `.PIC`/`.PAL`), prymitywy oryginału (kopiowanie z przezroczystością, linie, prostokąty, zamiana kolorów, tekst z kodami
  kolorów 0x80+n), czcionki `FONTS.CV` (przeniesione z prototypu Pythona), funkcje DrawTools (ramki okien, wzór tła z SP299.PIC,
  bloki tekstu), okno menu `showMenuBox` (MenuBoxDialog: strzałki, Enter/spacja, Esc, litery, mysz, opcje nieaktywne
  i zaznaczone, pomoc) i pole tekstowe `editBox` (EditBoxDialog). Źródło: OpenCivOne (MIT), nazwy funkcji wzorca w komentarzach.
- Ekrany: intro z logo (z napisami na BIRTH0/1, gdy są pliki), menu główne (100,140), Customize World na CUSTOM.PIC,
  Hall of Fame (puste miejsca), nowa gra na DIFFS.PIC (poziom, liczba cywilizacji, plemię, imię, własne plemię przez Esc),
  tekst *INIT z KING.TXT, ekran gry (pasek menu GAME/ORDERS/ADVISORS/WORLD/CIVILOPEDIA z rozwijanymi menu, minimapa,
  panel roku i skarbca, panel jednostki, mapa z `drawMapView` z packages/gfx).
- Rozgrywka podpięta do silnika (`newGame`, `unitMove`, `unitOrder`, `nextUnit`, `endHumanTurn`): miganie aktywnej jednostki,
  klawisze oryginału (strzałki i klawiatura numeryczna, Space, b, f, s, r, i, m, p, P, h, w, u, D, c, Enter = koniec tury,
  Shift+strzałki przewijanie), klik na mapie centruje, klik w minimapę przesuwa widok, zdarzenia silnika jako okna
  (komunikaty, porady z HELP.TXT/KING.TXT przy Instant Advice, pytania confirm, wybór badań i ustroju, nazwa miasta),
  REVOLUTION!, uproszczone okno miasta (lista „What shall we build in …?”, zakup), Preferences zmieniające ustawienia gry.
  Zapis z menu GAME, autozapis co 50 tur, „Load a Saved Game” — JSON silnika w `<folder danych aplikacji>/saves`
  (na Macu `~/Library/Application Support/<aplikacja>/saves`).
- `apps/desktop`: renderer prowadzi ekrany z `packages/ui`; klatka: paleta → RGBA → xBR 4× → blur 0.6 px → okno z zachowaniem
  16:10; mysz przeliczana na 320×200, Alt+litera na Macu z kodu klawisza. Dawny podgląd mapy z wersji 0.1.0 zastąpiony ekranem gry.
  Proces główny czyta pliki wymagane i opcjonalne (lista w `packages/ui/src/files.ts`) i obsługuje zapisy (IPC `saves:*`).
- Sprawdzone: 77 testów (bez `CIV1_DIR`) na syntetycznych plikach (koder `.PIC` i czcionki w `packages/ui/test/synthetic.ts`),
  strona renderera w Chrome bez okna na danych syntetycznych: przejście od intro przez menu, Customize World, nową grę,
  ekran gry, menu, zapis — bez błędów w konsoli, ok. 22 ms na wygładzenie klatki.
- **Niesprawdzone na plikach oryginału**: wygląd wszystkich ekranów (położenie obrazów DIFFS/CUSTOM/LOGO, kolory ramek, czcionki),
  tempo intro (przyjęte 60 jednostek zegara muzyki na sekundę), kursor z TORCH.PIC, paleta gry z BACK0A.PAL + SP256.PAL,
  teksty *INIT, *REV i porad. Testy na plikach oryginału: `CIV1_DIR=... npm test` (`packages/ui/test/original.test.ts`).
- Odstępstwa od wzorca (do sprawdzenia z oryginałem): etykieta „CIVILOPEDIA” i „Civilopedia Text” (wzorzec: „ENCYCLOP.”,
  „Encyclopedia Text”; Alt+C wskazuje na oryginalną nazwę); ramki `DrawShadowRectangle` dokładnie jak we wzorcu (górna i prawa
  krawędź ciemna) — `drawMiniMap` w packages/gfx rysuje odwrotnie, ekran gry nadpisuje ją wersją wzorca; luksusy w panelu
  = 10 − podatek − nauka (wzorzec: 10 − podatek + nauka); menu reaguje na ruch myszy w jednej osi; Esc przy poziomie = Chieftain;
  kody kolorów nie mają szerokości przy mierzeniu napisów.
- Do zrobienia: pełny widok miasta, Civilopedia i doradcy, okna podatków, FindCity, pomoc (HELP AVAILABLE), mini-pałac
  i liczba mieszkańców w panelu, animowana historia świata (STORY.TXT, BIRTH2–8), cykle palety (animacje kolorów w intro i na mapie),
  podział długiej listy produkcji na strony, odczyt Hall of Fame, porównanie wyglądu z oryginałem w DOSBoxie.

### 2026-11-17 — scalenie interfejsu, kolejne części etapów 5–7, paczka 0.2.0
- Gałąź `ui-screens` scalona do `main`; ramka minimapy rysowana wg `DrawShadowRectangle` wzorca (góra/prawa kolor 8, dół/lewa 15).
- Silnik: broń jądrowa i katastrofa elektrowni (`catastrophes.ts`), globalne ocieplenie, klęski w miastach (`disasters.ts`),
  ranking i cuda komputera (`ranking.ts`), wyrównanie kosztu badań co 50 tur, punkty za cuda, kontakt dyplomatyczny i zdarzenie
  `meetLeader` (`diplomacy.ts`), „idź do” po najtańszej drodze (tymczasowo zamiast GoTo oryginału).
- Paczka 0.2.0 (arm64) zbudowana `electron-packager`em na Linuksie; **niepodpisana** (rcodesign niedostępny w tej sesji) —
  na Macu: `xattr -cr "Civ Remake.app" && codesign --force --deep -s - "Civ Remake.app"`.
- Testy: 78 (12 pominiętych bez `CIV1_DIR`).

### 2026-11-17 — etap 6: przeciwnik komputerowy z oryginału
- `ai.ts` zastąpił tymczasowego przeciwnika portem AIEngine: RecalculateStatsAndPolicies (strategie kontynentów, mapa ról 20×13,
  przydział celów), polityki jednostek i kontynentów, MoveUnit (osadnicy, obrona miast, transport i atak morski, broń jądrowa,
  ocena 8 kierunków), MoveBarbarianUnit, ChangeCityProduction, ocena produkcji z SelectCityProduction, zmiana ustroju komputera.
- `turn.ts`: pętla rozkazów komputera jak w PlayerTurn (rozkaz ≠ 0 kasuje „idź do”, po 5 próbach — czekanie, kilka przejść);
  „idź do” komputera po całej mapie i z podejściem do celu nieosiągalnego (statki do miast w głębi lądu).
- Ustalenie: nowsza wersja wzorca ma błędy przepisania — weryfikacja z `Segment_*.cs` z historii wzorca (opis w ARCHITECTURE.v2).
- Testy: 80 (12 pominiętych bez `CIV1_DIR`); test gospodarki sprawdza maksymalny rozmiar miasta (komputer teraz atakuje).
- Do zrobienia w etapie 6: GoTo oryginału, karawany i dyplomaci komputera.

