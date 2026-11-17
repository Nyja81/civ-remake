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

### 2026-11-17 — etap 7: punktacja, koniec gry, statek kosmiczny; paczka 0.3.0
- `score.ts`: `civilizationScore` wg ShowCivilizationScorePopup; `turn.ts`: koniec gry (podbój, przylot statku, rok 2100 − 20·poziom),
  zdarzenie `gameEnd` z wynikiem i informacją, czy można grać dalej (*FAME).
- `spaceship.ts`: plan 15×12, obliczenia okna statku, części komputera i człowieka, decyzja komputera o starcie, start, utrata
  statku przy zdobyciu stolicy; kalendarz co rok po starcie statku.
- UI: `screens/reports.ts` (DrawReportScreen, CIVILIZATION SCORE), `screens/spaceship.ts` (plan z DOCKER.PIC, LAUNCH,
  WORLD → SpaceShips); `showDialog` przyjmuje maskę nieaktywnych opcji. DOCKER.PIC na liście plików opcjonalnych.
- Zapis: brakujące pola gracza i stanu ze starszych zapisów uzupełniane wartościami początkowymi.
- Paczka 0.3.0 (arm64, niepodpisana). Testy: 89 (12 pominiętych bez `CIV1_DIR`).
- Do zrobienia: MeetWithKing (rozmowy z władcami) i dyplomacja komputer–komputer, Hall of Fame, GoTo oryginału.

### 2026-11-17 — etap 7: dyplomacja komputer–komputer, prośby komputera, Hall of Fame
- `diplomacy.ts`: SetDiplomacyFlags/ClearDiplomacyFlags, DetermineWhoIsStrongest, CanExchangeTechnologies, traktaty i zerwania
  między komputerami, wygasanie traktatów i kontaktu formalnego, prośby *HELPME/*CRUSADE (zdarzenie `aiRequest`, `acceptAiRequest`).
- `score.ts`: Hall of Fame (wpis, ocena, wstawianie wg asemblera — wynik × (poziom + 2), słabszy wpis na ostatnie miejsce),
  postaci sławne. UI `screens/hallOfFame.ts`: tabela z Clear, „Sire, your Civilization Rating…”, odczyt FAME.DTA z gry (tylko odczyt),
  własna tabela `fame.dat` w folderze danych aplikacji.
- Testy: 96 (12 pominiętych bez `CIV1_DIR`).

### 2026-11-17 — etap 7: rozmowy z władcami (MeetWithKing)
- Silnik: `packages/engine/src/game/kingMeeting.ts` — port F6_0000_0000 przepisany z wersji „goto” na kod strukturalny
  (etykiety wzorca w komentarzach): ocena sił na kontynentach (obawa komputera, kwota trybutu), broń jądrowa, Wielki Mur/ONZ,
  chęć pokoju z wojen z innymi, senat republiki komputera (przejście na monarchię), wymiana technologii (*EXCHANGE
  z portem AcquireTechnologyFromAnotherPlayer), *CANCEL, *TRIBUTE, *TAKECIV, wypowiedzenie wojny (*PROVOKE/*REJECT/*RID),
  *PEACE z *TREATY (F6_0000_1a3f/1a99, na Chieftainie usuwanie jednostek komputera przy miastach człowieka), senat człowieka,
  *GIVECIV/*GIVECASH/*GROVEL/*MOBILIZE, *ATTITUDE / powitanie przyjaźni, opcje człowieka *THREAT (*GIVEMORE, „You must attack
  the evil”, *NOCONTACT/*ATWAR/*MERCENARY/*UNFORTUNATE), PeaceTreaty, *SCHISM; F6_0000_16cd (poseł, powitanie F6_0000_1874).
  Interfejs silnik↔UI: `meetWithKing()` / `aiRequestMeeting()` / `envoyMeeting()` zwracają `KingMeeting` — `step` (emissary,
  portrait, speech, dialog, advice, close; klucz KING.TXT + słowa kluczowe albo gotowy tekst, maska nieaktywnych opcji)
  i `answer(numer opcji)`; skutki wykonuje silnik. `runMeeting()` prowadzi rozmowę bez interfejsu (testy).
  Zdarzenie `meetLeader` niesie `previousCountdown` (licznik sprzed kontaktu).
- UI: `packages/ui/src/screens/king.ts` — sala tronowa BACK??.PIC wg ustroju (wariant M z Invention) z portretem KING??.PIC
  w (90, 0) i kolorami 64–143 z KING??.PAL, okno bez ramki F6_0000_251d w (36, 139) z wierszem 8 px (nowa opcja `lineHeight`
  w `showMenuBox`), teksty KING.TXT (`kingText`: sekcja, słowa kluczowe, łamanie do 80/40 znaków) z własnymi tekstami
  zastępczymi, gdy brak pliku. `gameScreen.ts` obsługuje `meetLeader`, `aiRequest` (*HELPME/*CRUSADE przez posła i portret)
  i `envoy` (*GAPE). Pliki BACK??.PIC, KING00–13.PIC/.PAL na liście opcjonalnych; bez nich ekran uproszczony.
- Testy: 103 (12 pominiętych bez `CIV1_DIR`): silnik — trybut przy przewadze komputera, pokój z traktatem i *THREAT,
  *GIVECIV, wymiana technologii, odprawiony poseł, zdarzenie kontaktu, *HELPME; UI — rozmowa bez KING.TXT i portretów,
  *HELPME z syntetycznym KING.TXT, salą i portretem, odprawiony poseł.
- Odstępstwa / niepewne: rozmowa odbywa się po ruchu komputera (oryginał — w trakcie; flagę kontaktu sprzed spotkania niesie
  zdarzenie); pytanie o posła przy *HELPME/*CRUSADE/*GAPE zawsze zadawane (wzorzec zostawia Var_3934 = −1 po każdej rozmowie,
  co blokowałoby te prośby — do sprawdzenia w oryginale); *GIVECASH i *GIVEMORE: kwota odejmowana komputerowi (we wzorcu rejestr
  SI / wartość AX po oknie — nieczytelne); *MERCENARY nie zmienia flag dyplomacji (dosłownie jak we wzorcu); opcja
  „Check Intelligence” pominięta (brak raportu wywiadu); RuleDebugFlags.Bit0 przyjęty jako ustawiony.
- Pominięte: animacja twarzy i doradcy z GOVT??.PIC (F6_0000_1b33/2362/233c — tablice klatek i położeń w danych CIV.EXE),
  czcionka władcy (tablica w CIV.EXE; przyjęta czcionka 1), dźwięk (PlayTune). Losowania animacji (RNG) nie są wykonywane.
- DiplomatActions.cs:269 (dyplomata w mieście → rozmowa, param4 = 1) **niepodłączone**: silnik nie ma jeszcze akcji dyplomaty
  w mieście (zdarzenie `diplomatAction` bez obsługi); `meetWithKing(…, { visit: true })` jest gotowe do użycia.
- **Niesprawdzone na plikach oryginału**: układ sali tronowej, kolory tekstu na tle, rozmieszczenie opcji w sekcjach KING.TXT.
- Do zrobienia: akcje dyplomaty (w tym rozmowa), raport wywiadu, ekstrakcja tablic animacji i czcionek władców z CIV.EXE,
  Hall of Fame, GoTo oryginału.



### 2026-11-17 — etap 6: GoTo oryginału
- Nowy moduł `packages/engine/src/game/goto.ts`: port segmentu 2e31 z asemblera (`Segment_2e31.cs` z historii wzorca):
  `getNextMove` (F0_2e31_000e), ComputeGoToPath (05e6), CanUnitMove (0a2c), FindShortestPath (0c1d), `checkUnitPath` (111c),
  zawijanie X (119b), odległość oryginału `shortestDistance` (F0_2dc4_0208: dłuższa różnica + połowa krótszej).
- Tablice ścieżek 20×13 (`GameMap.landPath` = Arr_db44, `GameMap.waterPath` = Arr_7f38) liczone w `createGameMap` zaraz po etapie 6
  (F7_0000_1188 z CheckUnitPath(…, ląd, 20), F7_0000_1440), także dla Ziemi. Pamięć FindShortestPath (ostatni cel, koszty 16×16)
  w `GameMap.gotoCache` — zmienia wyniki kolejnych wywołań, więc jest częścią stanu i zapisu; pozostałe zmienne globalne
  oryginału (cel pośredni, kolejki) — zmienne modułu, ustawiane przed każdym użyciem.
- Zapis: tablice i pamięć jako base64; zapis bez nich — przeliczenie przy odczycie.
- `turn.ts`: „idź do” człowieka i komputera jak w PlayerTurn (Label151): kierunek z GetNextMove, -1 kasuje cel i ostatni kierunek,
  bez celu ostatni kierunek = -1; rozkaz 0 komputera — ponowne pytanie AIEngine (licznik prób), bez kasowania celu po nieudanym
  ruchu. `ai.ts`: MoveBarbarianUnit bierze kierunek z GetNextMove; usunięte tymczasowe `gotoDirection` (Dijkstra) i `setGotoResolver`.
- Rozbieżności nowszego wzorca z asemblerem (lista w ARCHITECTURE.v2 → „Wzorzec: dwie wersje OpenCivOne”).
- Odstępstwa: odczyty poza tablicami/stroną mapy = 0; krok zachłanny pomija pola poza mapą w pionie; nieudany ruch człowieka
  kasuje „idź do” (zabezpieczenie pętli `nextUnit`); tablica wody nie jest przeliczana przy odczycie (oryginał: F7_0000_1440 przy wczytaniu).
- Testy: `packages/engine/test/goto.test.ts` (symetria bitów tablic, szew wody, mapa syntetyczna, bliski i daleki cel z jeziorem,
  statek wzdłuż wybrzeża, cel nieosiągalny, zapis). Razem 103 (12 pominiętych bez `CIV1_DIR`).
- Do zrobienia: porównać odległość oryginału (F0_2dc4_0208) z `distance` używanym w `ai.ts`.

### 2026-11-17 — etap 8: doradcy i raporty świata
- Silnik `packages/engine/src/game/reports.ts` (czyste funkcje liczące dane raportów; miasta przez `processCity(…, 1)` jak
  ProcessCityState(i, -1)): `cityStatusReport`, `militaryReport`, `militaryLossesReport`, `tradeReport`, `intelligenceReport`,
  `intelligenceDetail`, `attitudeReport`, `scienceReport`, `wondersOfTheWorld`, `topFiveCities`, `worldMapReport`,
  `continentStatistics`, `demographicsReport` (z PrintPlayerRank), `playerHistoryReport`, `powerGraph`.
- Raport historyka (F12_0000_09e2): losowanie rodzaju i historyka oraz punkty historii (`state.historyScores`) w silniku w chwili
  zdarzenia `historyReport` (dane w `ev.report`) — generator zużyty w tej samej kolejności co w oryginale.
- Wykres potęgi (F12_0000_0573): `rankPlayers` zapisuje `state.scoreGraph` (ScoreGraphData: co 4 tury, do tury 600); wykres
  pokazywany na początku EndGame. Nowe pola stanu są opcjonalne (starsze zapisy działają bez zmian).
- UI `packages/ui/src/screens/advisors.ts`: City Status, Military + Military Losses, Intelligence (INFO1–7: cyfra albo klik →
  szczegóły F14_0000_1164), Attitude, Trade, Science, Wonders of the World, Top 5 Cities, World Map, Demographics, raport historyka,
  wykres potęgi, statystyka kontynentów (tylko tryb debugowania: F9 przy `revealAll`; F8 — wykres potęgi). Civilization Score
  podpięty do WORLD i F9. W `gameScreen.ts` zmienione tylko menu ADVISORS/WORLD, klawisze F1–F10, zdarzenie `historyReport`
  i początek `endGame`. Nagłówek DrawReportScreen z tytułem władcy (Array_19b2: Emperor, King, Comrade, President).
- Grafiki: mieszkańcy i żarówka z SP257.PIC, jednostki w kolorach graczy (`prepareSprites`), budynki/cuda i kafle mapy świata
  z SP299.PIC, portrety doradców z GOVT0A–GOVT3A.PIC (nowe pliki opcjonalne; bez nich portret pominięty).
- Testy: 136 (12 pominiętych bez `CIV1_DIR`): dane raportów w silniku, otwarcie każdego raportu z menu i klawiszami na syntetycznych
  plikach, przejście do szczegółów wywiadu, raport historyka; testy końca gry z dodatkowym ekranem wykresu potęgi.
- **Niesprawdzone na plikach oryginału**: wygląd wszystkich raportów (znaki czcionki `{ | } ~ \/` w raportach miast i handlu,
  położenie ikon budynków i kafli 4×4 w SP299.PIC, kadry portretów z GOVT*.PIC), nazwy plików GOVT*.PIC, tempo raportu historyka.
- Odstępstwa i wątpliwości: Science — „Researching …” bez liczb postępu (jak dosłowne tłumaczenie; nowszy wzorzec dopisuje
  „(postęp/koszt)”); wykres potęgi — podpisy lat co 100 tur (dosłowne tłumaczenie; nowszy wzorzec ma tu błąd), tytuł
  „CIVILIZATION POWERGraph” przepisany ze wzorca (do sprawdzenia); mini-pałac władcy w raporcie historyka (DrawMiniPalace)
  pominięty do czasu widoku pałacu; przebarwienie niezadowolonych w DrawResources (Var_6542) pominięte; tryby debugowania
  F1–F3, F7 (ShowDebugDetails) pominięte; Land Area liczy pola wg warstwy właściciela (GetCityOwner) jak wzorzec.
- Do zrobienia: powtórka gry (Replay, View Replay) — silnik nie zbiera danych powtórki; mini-pałac w raporcie historyka.


### 2026-11-17 — etap 8: okno miasta
- `packages/ui/src/screens/cityWindow.ts`: pełne okno miasta zamiast uproszczonego `cityDialog` — port części rysującej
  i interaktywnej CityWorker.F0_1d12_0045_ProcessCityState (tryb 1): tytuł z liczbą ludności, mieszkańcy z podziałem
  na zadowolonych/spokojnych/niezadowolonych i specjalistów (F0_1d12_6ed4_DrawResources), „City Resources” (żywność, tarcze,
  handel z brakami i korupcją, luksus/podatek/nauka), jednostki utrzymywane (tarcze, żywność osadników, niezadowolenie),
  mapka 5×5 z plonami pól (F0_1d12_692d_CityResources) i polami sąsiednich miast w czerwonej ramce, magazyn żywności,
  lista budynków i cudów z monetami i stroną MORE (F0_1d12_7045_DrawWonderOrImprovement), produkcja z CHANGE/AUTO/BUY
  (migający CHANGE przy niemożliwej produkcji), zakładki INFO (jednostki w mieście, szlaki handlowe, zanieczyszczenie),
  HAPPY (kolejne kroki zadowolenia: luksus, budynki, stan wojenny/jednostki poza miastem, cuda), MAP
  (F0_1d12_72b7_DrawCityWorldMap, F0_1d12_73ea_DrawCityRectangle), RENAME, EXIT.
- Obsługa jak w oryginale: klik w pole mapki (przydział mieszkańca), klik w specjalistę i klawisze 1–9, klik w jednostkę
  w mieście (budzi), klik w budynek / klawisz S (sprzedaż), B (zakup), C (zmiana produkcji), A i prawy przycisk na CHANGE (AUTO),
  I/H/M/V (zakładki), P (kursor pól), M (następna strona budynków), R (nazwa); inne klawisze i kliknięcia zamykają okno.
- Silnik: `cityManagement.ts` — `cityTileIndex` (FindCityOffset), `toggleCityTile` (L5aa6), `specialistAt`/`cycleSpecialist`
  (Get/SetSpecialWorkerFlags), `sellBuilding` (L5740, raz na turę), `activateUnitInCity`, `toggleAutoProduction`,
  `supportedUnits` (koszty jednostek jak w pętli L32e0); `economy.ts` — `cityNeighborArea` (cityArea), raport `processCity(…, 1)`
  rozszerzony o kroki zadowolenia, żywność do wyżywienia, zanieczyszczenie, kolejność pracy pól; zdarzenia `showCity`
  (Var_b1e8). Przebieg tury bez zmian.
- Ekran gry: okno po kliknięciu w miasto (ProcessCityState1AndRefreshMap: ekran zapamiętany na ekranie 1), po założeniu miasta
  i po komunikatach o mieście człowieka (budowa, niepokoje, spadek ludności — raz na miasto); `gfx`: `drawCellWithUnit`.
- Ustalenie: nowsza wersja wzorca ma błąd w zakupie — wg dosłownego tłumaczenia (Segment_1d12, 0x4e32) okno „Cost to complete”
  pokazuje się zawsze, a zakup następuje po „Yes” przy wystarczającym złocie.
- Testy: 119 (12 pominiętych bez `CIV1_DIR`); nowe `packages/engine/test/cityManagement.test.ts`, `packages/ui/test/cityWindow.test.ts`.
- **Niesprawdzone na plikach oryginału**: położenie ikon z SP257.PIC (żywność, tarcze, handel, monety, nauka, luksus, ikona 13,
  mieszkańcy 8×16, symbol zanieczyszczenia) i rysunków budynków z SP299.PIC, wzór tła (208,100), kolory i czcionka 2.
- Odstępstwa: okno zawsze rysuje się od nowa (oryginał po zmianie specjalisty lub pola nie przerysowuje mapki — możliwa różnica
  w nakładaniu się ikon plonów sąsiednich pól); `toggleCityTile` porównuje z liczbą specjalistów po ostatnim przeliczeniu,
  nie z Var_e8b8 z początku przebiegu; lista produkcji bez stron „more...”; okno nie otwiera się dla miast budujących cud
  ukończony gdzie indziej; limit 127 jednostek liczony z tablicy jednostek, nie z UnitCount.
- Do zrobienia: zakładka VIEW — panorama miasta (CityView.F19_0000_0000_ShowCityLayout); na razie wraca do INFO.
  Notatka Obsidian `Projekty/civ-remake.md` — brak dostępu do vaulta z tej sesji.

### 2026-11-17 — scalenie gałęzi agentów, paczka 0.4.0
- Do `main` scalone: `meet-with-king` (rozmowy z władcami), `original-goto` (GoTo oryginału), `advisors` (doradcy i raporty świata),
  `city-window` (okno miasta). Konflikty tylko w imporcie/obsłudze zdarzeń `gameScreen.ts` i w dokumentacji.
- Notatka Obsidian zaktualizowana przez sesję główną (agenci nie mieli dostępu do vaulta).
- Paczka 0.4.0 (arm64, niepodpisana). Testy: 179 (12 pominiętych bez `CIV1_DIR`).
- Otwarte: odległość oryginału (max + min/2) w przeciwniku komputerowym, panorama miasta (VIEW), Civilopedia, pałac, intro (historia świata),
  dźwięk, powtórka (Replay), karawany i dyplomaci (także akcje dyplomaty człowieka), zapis `.SVE`, porównanie wyglądu z oryginałem.


### 2026-11-17 — etap 8: Civilopedia
- `packages/ui/src/screens/civilopedia.ts`: port Overlay 8 (Encyclopedia) sprawdzony z dosłownym tłumaczeniem asemblera
  (`Segments/Overlay_8.cs`, commit `ec23ac3` wzorca): `showCivilopedia` (F8_0000_0000, MORE co 78 tematów, za ostatnią stroną
  powrót na początek), `drawCivilopediaPage`/`showCivilopediaWindow` (F8_0000_0066: sortowanie wyborem ze stricmp od "a" do "zzz",
  kolumny co 7 px po 26 tematów, szerokość 100 dla Complete i technologii, 150 dla reszty; tematy o tej samej nazwie z dalszego
  rodzaju znikają z Complete — University, Democracy, Monarchy, Communism; obsługa jak w oryginale z myszą: klik w temat,
  klik nad listą w 1. kolumnie = MORE, dalej = EXIT, prawy przycisk i klawisz = wyjście), `showCivilopediaTopic` (F8_0000_062a:
  tło 253 = (61,61,61) albo 255 bez rysunku, ramka DrawRandomFoodIcons, nazwa WIELKIMI czcionką 6, nagłówek czcionką 7 w x = 204/224/160;
  technologia: Requires, Allows z „(with …)”, jednostki i budynki z ikonami, „(Discovered)/(from Great Library)/(Taken from …)”;
  budynek/cud: Requires, Cost, Maintenance; jednostka: Requires (+ „and Nuclear Fission”), koszt, atak, obrona, ruch, rysunek gracza 1
  w (216,48); teren: plony z nawadnianiem/kopalnią/drogą dla terenu i wariantu z zasobem, legenda * i %, koszt ruchu, premia obrony),
  `drawEncyclopediaImage` (F8_0000_16f7) i tablice numerów rysunków (F8_0000_16c4/1790/17c3).
- Teksty: oryginał czyta opisy z BLURB0–4.TXT (cyfra = rodzaj tematu; klucz `*NAZWA` — opis, tylko przy włączonej opcji
  „Civilopedia Text”, osobna strona zamykana klawiszem; `*NAZWA2` — zasady, zawsze, poza technologiami). UI czyta te pliki
  z kopii gry (pliki opcjonalne); bez nich — własne teksty z `packages/ui/src/data/civilopediaText.ts` (wszystkie 173 tematy,
  pisane od nowa). Rysunki: ICONPG1–8.PIC + ICONPG1.PAL (technologie), ICONPGA–E.PIC + ICONPGA.PAL (jednostki),
  ICONPGT1–2.PIC + SP256.PAL (tereny), CITYPIX2.PIC + HILL.PAL (budynki 2–21) — nowe pliki opcjonalne; bez nich strona bez rysunku.
- Ekran gry: menu CIVILOPEDIA (opcja 0 = Complete, dalej rodzaje 0–4), potem mapa z wygaszeniem; pomoc (F1, Alt+H, prawy przycisk)
  w wyborze badań — strona technologii, wygaszenie i to samo pytanie. Okno miasta: pomoc w liście produkcji — strona bez rysunku
  (Var_3c62), ekran zapamiętany na ekranie 1, okno każe potem przerysować mapę (Var_6b64).
- Silnik: `Player.techSource` (TechnologyAcquiredFrom, pole opcjonalne, ustawiane w `researchFinished`).
- Testy: 201 (12 pominiętych bez `CIV1_DIR`); nowe `packages/ui/test/civilopedia.test.ts` (każda lista z menu, strony Complete, każdy
  rodzaj strony, BLURB z kopii gry, rysunki, pomoc z wyboru badań i z listy produkcji).
- **Niepewne (do sprawdzenia z CIV.EXE)**: wzorzec po refaktoryzacji zmienił część napisów — długości napisów w segmencie danych
  (odstępy adresów w dosłownym tłumaczeniu) nie pasują do jego wersji; przyjęte brzmienie pasuje długością, ale treść jest odtworzona:
  tytuł listy „The Civilization Encyclopedia” (29 znaków; wzorzec „Game Encyclopedia”), „Civilization Advance” (20; „Technology Advance”),
  „Military Unit” (13; „Unit Type”), „Maintenance: $” (14, bez dopisku po liczbie), koszt jednostki „ resources.” (11; „ shields.”),
  „Movement Rate: ” (15; „Moves: ”); wymaganie „brak” (indeks −1): oryginał dokleja nieznany napis sprzed tabeli nazw — przyjęte „None”.
  Lista `CIVILOPEDIA_STRINGS` w `civilopedia.ts`. Wzorzec ma też błędy logiki poprawione wg asemblera: warunek wiersza żywności terenu
  (żywność ≠ 0 LUB nawadnianie < −1), x nagłówka 160 tylko dla cudów (nie dla technologii o numerze > 24), `*NAZWA2` czytane także dla terenu.
- Pominięte: tryb listy bez myszy (ramka wyboru, strzałki, M, Esc/X — Var_1a3c = 0), cykle palety (Stop/StartPaletteCycleSlots).
  Gotowe do podłączenia, niepodłączone: strona technologii po odkryciu (ResearchFinished, zdarzenie `techDiscovered`), strona cudu
  po wieści o budowie cudu przez inną cywilizację, strona terenu po prawym kliknięciu w mapę (PlayerTurn), rozmowa z władcą (Var_3c62).

### 2026-11-17 — karawany, dyplomaci, odległość oryginału
- Silnik `packages/engine/src/game/unitActions.ts` (asembler z ec23ac3: `Overlay_22.cs`, `Segment_2459.cs`, `Segment_1403.cs`;
  teksty z danych CIV.EXE): `caravanArrives` (F0_2459_0948: przychód jednorazowy w złocie i postępie badań, komunikat
  „Revenue: $…”, szlak zastępujący najsłabszy), `caravanEntersCity` (MoveUnit L1fd2: obce miasto — szlak od razu; własne —
  „Will you?” Keep moving / Establish trade route / Help build WONDER (+10·koszt tarcz), szlak nieaktywny przy cudzie bliżej
  niż 10), `diplomatMenu` + `diplomatAction` (F22_0000_0000: ambasada → raport wywiadu, Investigate City, kradzież z pytaniem
  o traktat, sabotaż, bunt „Dissidents in …” z „Subvert city ($x2)” przy pokoju, Meet with King → `meetWithKing(…, { visit: true })`),
  `bribeCost`/`bribeUnit` (F22_0000_0639), `inciteCityRevolt` (F22_0000_0af5; także bunt z klęski w `disasters.ts` zamiast
  uproszczonego przejęcia), `minimumDistanceFromPalace` (F0_2517_0d97).
- `movement.ts`: nowe wyniki ruchu `caravan`, `diplomat`, `bribe` (opcje `caravan`, `bribe`); zdarzenia `diplomatAction`,
  `caravanArrived`, `diplomatVsUnit` usunięte. Dyplomata komputera działa od razu (kradzież, w okradzionym mieście sabotaż;
  w mieście człowieka przy pokoju znika).
- Komputer: `economy.ts` — zbudowana karawana od razu zakłada szlak z obcym miastem komputera o największym handlu; komputer bez
  nowej jednostki (dyplomata) traci tarcze (L1ab6); zbudowana pierwsza rakieta zeruje licznik kontaktu człowieka. `ai.ts` —
  przekupywanie jednostkami ataku lądowego (dwa miejsca w ocenie kierunków), rakieta przenoszona obok celu (L11c8), poprawka:
  dodatek `atak × 4` tylko powyżej progu. Handel ze szlaków w `processCity` był już zgodny ze wzorcem.
- Odległość oryginału: w asemblerze wszystkie odległości idą przez F0_2dc4_0289 (dłuższa różnica + połowa krótszej, |Δx| z
  zawijaniem), także najbliższe miasto/jednostka (0102/0177); wyjątki: F0_2dc4_0208 wprost na różnicach (AIEngine 0x25fb:0x2275 —
  `distanceOf`) i F0_2dc4_0243 (2·dłuższa + krótsza) w GetNearestCityDirection. `map.ts`: `distance` = 0289 (dotąd maksimum
  różnic z nowszego wzorca), `distanceOf`, `distanceDoubled`; `cities.ts` (DeleteCity) bez własnego maksimum.
  `turn.ts`: `nearestCityDirection` (F0_1866_226d) i HomeCityCommand dla samolotów człowieka i komputera (dotąd komputer leciał
  „idź do” do najbliższego miasta).
- UI: `packages/ui/src/screens/unitActions.ts` — okna karawany (100, 80), przekupienia (100, 80), menu dyplomaty (80, 80) z maską
  nieaktywnych opcji, pytanie o traktat, okno buntu (100, 80), raport wywiadu, podgląd obcego miasta, rozmowa z władcą.
  `gameScreen.ts`: wywołanie po ruchu, komunikaty z położeniem (`dialogX`, `dialogY`) i mapą (`mapX`, `mapY`).
- Testy: 211 (12 pominiętych bez `CIV1_DIR`): `packages/engine/test/unitActions.test.ts` (odległości, karawany człowieka
  i komputera, każda akcja dyplomaty, sabotaż z r = 15, bunt i przejęcie, przekupienie człowieka i komputera, rakieta, powrót
  samolotu), `packages/ui/test/unitActions.test.ts` (menu i okna na syntetycznych plikach). Test „komputer rozbudowuje się”
  przechodzi bez zmian po zmianie odległości.
- Rozbieżności nowszego wzorca z asemblerem — ARCHITECTURE.v2 → „Wzorzec: dwie wersje OpenCivOne”. Najważniejsze: dyplomata
  komputera z produkcji to w oryginale martwy kod (komputer nie dostaje dyplomatów, tarcze przepadają); grupa miasta
  macierzystego karawany czytana jako (x, x); sabotaż z 16-bitową maską; ActiveUnits ±2 przy przekupieniu.
- **Niesprawdzone na plikach oryginału**: wygląd okien (położenia wg wzorca), animacja wejścia dyplomaty komputera do miasta
  człowieka i ruchu (AnimateUnitMove, WaitTimer) — pominięte.
- Odstępstwa: pytania silnika (karawana, przekupienie) przerywają „idź do” człowieka; karawana komputera we własnym mieście
  wybiera „Keep moving”, bez obcego miasta komputera znika bez przychodu (oryginał: miasto -1); karawana bez miasta macierzystego
  porusza się zwyczajnie; Investigate City usuwa dyplomatę przed oknem (oryginał — po); pola okolicy przy buncie z zawijaniem X;
  gałąź InciteCityRevolt z graczem -1 pominięta (oba wywołania podają gracza).
- Do zrobienia: przejęcie technologii przy zdobyciu miasta (AcquireTechnologyFromAnotherPlayer w CityTakeover), animacje.

### 2026-11-17 — etap 0: zapis .SVE; powtórka gry
- Silnik `packages/engine/src/game/sve.ts`: `loadSve(sve, map)` / `saveSve(state)` — zapisy oryginału CIVIL0–9.SVE (37 856 B,
  układ pól `SVE_LAYOUT` jak w LoadGameData/SaveGameData) i CIVIL0–9.MAP (warstwy mapy jako obraz .PIC 320×200: teren = piksel
  `terrainChangeId`, właściciel ziemi (80+x), właściciel pola/jednostki (160+x), minimapa (240+x), grupy i atrakcyjność (y+50),
  ulepszenia rzeczywiste (x, y+100/150) i widziane przez człowieka (80+x, y+100/150) po 4 bity), `sveInfo` (ReadGameInfoFromFile),
  `resumeLoadedGame` (LoadGame: SpaceshipFlags bez bitu 0 — asembler AND 0xFE, nowszy wzorzec 0x7ffe).
  Mapowanie 1:1 na gracze/miasta/jednostki/mapę/statek/wykresy; pola oryginału, których silnik nie ma, zostają we wzorcu
  `state.sveExtra` (pliki z chwili odczytu, base64): MapCellCount, druga część tablic kontynentów/oceanów, tabela jednostek,
  TechnologyAcquiredFrom, MaximumTechnologyCount, RuleDebugFlags, pałac, minimapa, nieużywane obszary obrazu mapy, śmieci za
  zerem w napisach, bity 72–79 technologii, wyższe bity ustawień. Przy zapisie bajty wzorca zostają, gdy wartość silnika jest
  ta sama co odczytana — zapis → odczyt → zapis daje te same bajty. Pochodne: NextUnitID (lista cykliczna jednostek na polu;
  wzorzec zostaje, jeśli jest poprawny), CityPositions (zajęte nazwy miast ↔ `cityNameTaken`), minimapa (pola odkryte od odczytu).
  Przy odczycie: tablica ścieżek lądu z zapisu, wody przeliczana (F7_0000_1440), `gotoCache` pusta; `currentPlayer` = człowiek.
- `packages/engine/src/game/picCodec.ts`: własny dekoder i koder .PIC (RLE jak RLE.Compress, LZW zgodne z dekoderem gfx);
  silnik nie importuje gfx.
- Powtórka: `replay.ts` — `addReplayData` (F0_1866_250e, bufor 4096 B jako `state.replay`, opcjonalny w JSON), `replayEntries`.
  Wpisy we wszystkich 13 miejscach oryginału: założenie (1) / zniszczenie miasta (1, gracz 0xff), wojna (2) i pokój (3)
  w Set/ClearDiplomacyFlags, pierwsze odkrycie (5), pierwsza jednostka typu (6), ustrój (8: człowiek po wyborze, komputer,
  upadek demokracji), zdobycie miasta (9), cud (10: budowa i GiveWonderToAI), co 50 tur stan człowieka (11) i ranking (12),
  zniszczenie cywilizacji (13). Nowe pole `state.peaceGraph` (PeaceGraphData z RankPlayers).
- UI `packages/ui/src/screens/replay.ts`: `displayGameReplay` (F9_0000_0000: „See Replay?”, szybka / pełna / zapis REPLAY.TXT
  do folderu danych aplikacji, mapa 4×4, pola wokół miast w kolorach graczy, napisy człowieka wielkimi literami),
  `displayHailTheConqueror` (F9_0000_0dde z ekranem pokonanego władcy F9_0000_0f79 i galerią z SLAM2.PIC). `gameScreen.ts`:
  EndGame — powtórka po wykresie potęgi (nie po Retire), podbój — „hail” przed oknem wyniku, GAME → View Replay przy
  SpaceshipFlags & 0x100 (jak w Menus). SLAM1.PIC/SLAM2.PIC/SLAM1.PAL na liście plików opcjonalnych.
- „Load a Saved Game”: lista zapisów silnika i — z folderu gry — CIVIL?.SVE (wiersz jak w ReadGameInfoFromFile); aplikacja:
  IPC `gamesaves:list` / `gamesaves:read` (tylko odczyt z folderu gry; zapisy nadal w folderze aplikacji, w formacie JSON).
- Testy: 193 (13 pominiętych bez `CIV1_DIR`): układ pól, koder .PIC (silnik i dekoder gfx), zapis → odczyt → zapis tych samych
  bajtów po 60 turach, zachowanie pól spoza silnika, dalsza gra po odczycie, JSON z wzorcem, wpisy powtórki i limit bufora;
  UI — szybka/pełna powtórka, zapis REPLAY.TXT, „hail”, View Replay. `packages/engine/test/originalSve.test.ts` — przy `CIV1_DIR`
  każdy CIVIL?.SVE z kopii gry: te same bajty po ponownym zapisie, te same piksele .MAP.
- **Niesprawdzone na plikach oryginału** (brak zapisów w tej sesji): zgodność bajtów .SVE po ponownym zapisie (zwłaszcza
  NextUnitID niespójnych stosów, ostatni bajt napisów), bajty .MAP (koder LZW/RLE oryginału nieznany — porównujemy piksele),
  wygląd powtórki i ekranu pokonanego władcy, napisy powtórki (adresy łańcuchów w asemblerze zgadzają się długością
  z tekstami nowszego wzorca).
- Odstępstwa: po wczytaniu .SVE ruch człowieka trwa od stanu z zapisu (oryginał: GameTurn z Var_df60 — gracze przed człowiekiem
  pominięci, człowiek bez przeliczenia miast); stan `rand()` nie jest w zapisie — ziarno = RandomSeed; `techCatchUp` = 0
  (Var_d2de po uruchomieniu); badania i przyszłe technologie komputera nie są zapisywane (jak w oryginale); autozapis JSON
  powstaje po wpisach 11/12 tej samej tury (oryginał zapisuje przed nimi); brak twarzy władcy i dźwięku w „hail”;
  powtórka w trybie debugowania (F8) pominięta.
- Do zrobienia: zapis do .SVE z menu (dziś zapis w JSON), porównanie z oryginałem w DOSBoxie.

### 2026-11-17 — etap 8: pałac, panorama miasta, historia świata
- Źródło: dosłowne tłumaczenie asemblera z pierwszego commitu wzorca (`Overlay_17.cs`, `Overlay_19.cs`, `Overlay_7.cs`,
  `Segment_1238.cs`, `Overlay_5.cs`) — nowsze `Palace.cs` i `CityView.cs` są przepisane od nowa / z błędami przepisania.
- Silnik `packages/engine/src/game/palace.ts`: stan pałacu człowieka `state.palace` (poziomy 12 części DS:0xd91e, style DS:0xb222,
  PalaceBuildCount; pole opcjonalne — starsze zapisy dostają stan początkowy jak w StartGameMenu), próg F0_1238_16e7, F0_1238_1c98
  (rozbudowy z wyniku), sprawdzenie w GameTurn (`checkPalaceUpgrade` w `endOfTurn`, zdarzenie `palace` do 37. rozbudowy), wybór i
  przesuwanie części (F17_0000_0000: L0148, L0268, L02ce/L02ef), `upgradePalace`, mini-pałac F0_1238_14a3 (komputer: losowanie
  słowem 16-bitowym r = 5r + 1, część = (r & 0xff) % 9 — nowszy wzorzec liczy modulo całości).
- Silnik `cityView.ts`: rozkład panoramy F19_0000_0000 (domy, ulice, cuda, budynki, hydroelektrownia, akwedukt) na siatce 19×12;
  jak oryginał ustawia ziarno wspólnego generatora gry (srand z sumy znaków nazwy miasta).
- UI `screens/palace.ts`: F17_0000_07ec_DrawPalace (kawałki z CASTLE0–4.PIC wg F17_0000_0e95/0cfe/0e2f, CBACK.PIC, CBACKS1–3.PIC,
  CBRUSH0–5.PIC), okno rozbudowy (*PALACE, „Which section shall we improve?”, „Select new section.”), widok pałacu po kliknięciu
  w panel (x < 80, 58 ≤ y < 72), mini-pałac w panelu ekranu gry i w raporcie historyka (SP257.PIC 7×15).
- UI `screens/cityView.ts`: F19_0000_0000_ShowCityLayout (HILL.PIC, CITYPIX1–3, WONDERS/WONDERS2, tytuł czcionką 6 w dwóch wierszach,
  komunikat w oknie (80, 8), nowy budynek wchodzi po 60 jednostkach zegara efektem rozpuszczania, cykl palety 64–79),
  F19_0000_111f (mieszkańcy z POP.PIC), animacje F19_0000_167b (najazd), F19_0000_18c1 (zamieszki), F19_0000_1ae1 („We love the King”).
  Podpięte: zakładka VIEW okna miasta (potem INFO), przy włączonych animacjach — ukończony budynek/cud człowieka (bez pałacu, części
  statku i AUTO), zdobycie miasta przez człowieka lub człowiekowi, niepokoje (raz na turę, Var_6b92), święto. Silnik oznacza
  komunikaty niepokojów i święta polem `animation`.
- UI `screens/intro.ts`: historia świata `showWorldHistory` (F7_0000_17cf: STORY.TXT czcionką 7 w (160,160), obrazy BIRTH1–8.PIC
  z wygaszeniem i rozjaśnieniem do BIRTHn.PAL, cykle palety obrazów) — w `flow.ts` przed ustawieniami nowej gry; cykle palety
  w intro (slot 1: 146–152, slot 4: 224–239). Nowy moduł `paletteCycle.ts` (AddPaletteCycleSlot/CyclePaletteTimer, krok co
  jednostkę zegara), `showMenuBox` z opcją `noWait` (Var_db38 = 1). Nowe pliki opcjonalne w `files.ts`.
- Ustalenie: losowanie zakresu w oryginale to F0_2dc4_005d = (n · rand()) >> 15 (Segment_2dc4 w dosłownym tłumaczeniu);
  silnik (`mscRandom.next`) przyjmuje rand() % n — do zmiany w całym silniku po porównaniu z oryginałem (panorama już używa wzoru oryginału).
- Tablice z danych CIV.EXE przepisane ze wzorca (obraz segmentu danych `BinaryResources.bin`; do dodania do `npm run extract`):
  szerokości kawałków pałacu DS:0x4b2c, przesunięcia w pionie DS:0x4b36, prostokąty cudów panoramy.
- Testy: 208 (12 pominiętych bez `CIV1_DIR`): `packages/engine/test/palace.test.ts` (progi, zdarzenie, zapis, wybór części,
  mini-pałac, rozkład panoramy i ziarno), `packages/ui/test/palace.test.ts` (rozbudowa z plikami i bez, rysunek pałacu, mini-pałac,
  widok po kliknięciu, panorama z plikami i bez, VIEW, budowa z animacją, animacje, cykle palety, historia świata).
- **Niesprawdzone na plikach oryginału**: wygląd pałacu (położenia kawałków, tło, ogrody), panoramy (położenia budynków, cudów, murów,
  torów, tytułu) i animacji, kadry POP/INVADER/RIOT/LOVE, tempo historii świata.
- Odstępstwa / niepewne: czasy wierszy historii i cykle palety obrazów BIRTH przepisane z nowszego wzorca (w oryginale tablice
  w danych muzyki, segment Var_6416); historia idzie przed ustawieniami gry (oryginał — w trakcie budowy mapy), bez muzyki, ekran
  czyszczony na początku; styl ogrodów i dziedzińca po rozbudowie bez zmian (oryginał zapisuje niezainicjowaną zmienną);
  odczyty poza tablicami (levels[−1], levels[9] w mini-pałacu, komórki poza siatką panoramy) przyjęte jak w komentarzach kodu;
  w DrawCityPopulation dosłowne tłumaczenie ma niejasne instrukcje TEST (przyjęte jak w nowszym wzorcu); animacje najazdu,
  zamieszek i święta z nowszego wzorca (nieporównane z asemblerem); przerwanie pętli panoramy także kliknięciem (oryginał — kbhit).
- Pominięte: animacja założenia miasta (Animations.FoundNewCity, panorama z −3 — funkcja gotowa), smutny pałac SAD.PIC przy
  przegranej przez statek kosmiczny komputera (EndGame_SpaceVictory), dźwięk (PlayTune), napis „BUILDING NEW WORLD...”.
