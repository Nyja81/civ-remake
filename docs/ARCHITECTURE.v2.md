# Architektura

> Wersja 2 — 2026-11-17 (wieczór). Poprzednia wersja: [ARCHITECTURE.md](ARCHITECTURE.md).
> Zmiana o więcej niż ~20% treści = nowy plik `ARCHITECTURE.v3.md`.

## Cel

Własna, napisana od nowa gra strategiczna na Maca, której zasady są zgodne 1:1
z oryginałem z 1991 r. (wersja DOS 475.05). Oryginał jest **specyfikacją zasad**,
a nie źródłem kodu ani zasobów.

## Decyzje (2026-11-17)

| Temat | Decyzja |
|---|---|
| Platforma | macOS, aplikacja desktopowa (Electron) |
| Sterowanie | mysz + klawiatura; bez dotyku |
| Tryb gry | jeden gracz; bez gry wieloosobowej |
| Zasady | 1:1 z oryginałem; ewentualne poprawki tylko jako przełączane opcje |
| Interfejs | decyzja 2026-11-17: **ekrany, menu i ekrany startowe takie same jak w oryginale** — cały ekran rysowany w rozdzielczości 320×200 (256 kolorów) i wygładzany xBR 4× + lekkie zmiękczenie |
| Grafika | decyzja ostateczna 2026-11-17: **oryginalne grafiki**, wczytywane z kopii gry właściciela licencji i wygładzane u niego na komputerze (hq4x + lekkie zmiękczenie, 4×). Bez plików oryginału gra używa pakietu zastępczego: zestawu „trident” z Freeciv (GPL-2.0+) albo własnego pakietu wektorowego `packages/art` |
| Język gry | angielski |
| Język kodu i dokumentacji | identyfikatory po angielsku, komentarze i dokumentacja po polsku |
| Repozytorium | prywatne `Nyja81/civ-remake` |

## Warstwy

| # | Warstwa | Pakiet | Stan |
|---|---|---|---|
| 1 | Silnik zasad — stan gry i reguły, bez grafiki | `packages/engine` (`src/game/*`) | stan gry, ruch, walka, miasta, gospodarka, badania, ustroje, barbarzyńcy, zapis JSON i `.SVE`/`.MAP` oryginału |
| 2 | Tabele danych — generowane z CIV.EXE właściciela licencji | `packages/engine/src/data` | technologie, jednostki, teren, budynki, cuda, nacje; ręcznie ze wzorca (do weryfikacji): przekształcenia terenu, nazwy miast |
| 3 | Przeciwnik komputerowy — gra tymi samymi komendami co gracz | `packages/engine/src/game/ai.ts` | port AIEngine i oceny produkcji (SelectCityProduction); „idź do” — GoTo oryginału (`goto.ts`) |
| 4 | Komendy i zdarzenia — interfejs wydaje rozkazy, silnik odpowiada zdarzeniami i prośbami o decyzję | `packages/engine` | `unitMove`, `unitOrder`, `state.events`, odpowiedzi `confirm` |
| 5 | Interfejs — ekran 320×200 jak w oryginale, wygładzany 4× | `packages/ui`, `apps/desktop` | ekrany startowe, menu, okna, ekran gry z mapą, rozkazami, oknem miasta, zapisem (scalone do `main`) |
| 5a | Grafiki oryginału — dekoder `.PIC`, czcionki `FONTS.CV`, reguły rysowania mapy | `packages/gfx` | teren, ulepszenia, mgła, miasta, jednostki, minimapa (`mapView.ts`) |
| 6 | Pakiet zastępczy grafiki — wektorowy (SVG) i Freeciv „trident” | `packages/art`, `tools/tileset` | próbki |
| 7 | Aplikacja na Maca — Electron, zapisy w `~/Library/Application Support/<aplikacja>/saves` | `apps/desktop` | paczka 0.4.0 (arm64, niepodpisana) |
| 8 | Wzorzec i testy porównawcze — tylko dla dewelopera | `packages/oracle` | odczyt tabel z CIV.EXE |

### Zasady projektowe silnika

- Stan gry odwzorowuje układ zapisu `.SVE` oryginału: 8 graczy (gracz 0 = barbarzyńcy),
  128 miast, 128 jednostek na gracza, mapa 80×50.
- Arytmetyka 16-bitowa ze znakiem wszędzie tam, gdzie oryginał na niej polega
  (przepełnienia są częścią zachowania gry).
- Jeden generator losowy (`MscRand`), którego stan jest częścią stanu gry.
- Silnik nie zna interfejsu. Gdy potrzebuje decyzji gracza, zatrzymuje się i zwraca prośbę;
  w oryginale okna dialogowe są wplecione w logikę tury — tu są rozdzielone.
- Silnik działa w Node bez okna, żeby dało się rozgrywać tysiące partii testowych.

## Weryfikacja zgodności z oryginałem

1. **Tabele danych**: `npm run extract` czyta je wprost z CIV.EXE (po rozpakowaniu EXEPACK);
   test w `packages/oracle` porównuje je z tabelami silnika.
2. **Wykonywalny wzorzec**: wczesna wersja projektu OpenCivOne (MIT) to dosłowne tłumaczenie
   kodu oryginału instrukcja po instrukcji. Uruchamiana obok silnika z tym samym ciągiem
   liczb losowych służy do porównywania wyników funkcji na tysiącach stanów gry.
3. **Oryginał w DOSBoxie**: ten sam zapis wczytany w oryginale i w nowej grze, koniec tury,
   porównanie zapisów pole po polu.
4. **Masowe partie samych przeciwników komputerowych** i porównanie przebiegu
   (miasta, osadnicy, technologie, wojny w czasie).
5. **Niezmienniki** sprawdzane po każdej turze.

## Granice prawne

- Kod jest w całości własny.
- Pliki oryginału (EXE, grafiki, teksty, zapisy) **nigdy** nie trafiają do repozytorium
  (`.gitignore`); narzędzia czytają je z folderu wskazanego zmienną `CIV1_DIR`.
- Liczby i reguły gry odtwarzamy jako fakty. Grafika, teksty encyklopedii i dźwięk są własne —
  oryginalne grafiki nie są kopiowane ani przerysowywane: gra czyta je z kopii gracza w chwili uruchomienia,
  a wygładzone wersje powstają i zostają wyłącznie na jego komputerze. Zrzutów z oryginalną grafiką nie umieszczamy w repozytorium.
- Grafiki Freeciv są na licencji GPL-2.0-or-later: przy jakimkolwiek udostępnieniu gry trzeba zachować licencję i autorów
  oraz udostępnić je na tych samych warunkach. Pakiet grafiki pozostaje wymienny i oddzielony od kodu.
- Nazwa gry nie może zawierać „Civilization”, jeśli projekt miałby wyjść poza użytek prywatny.

## Etapy

| Etap | Zakres | Stan (2026-11-17) |
|---|---|---|
| 0 | Repozytorium, tabele danych, generator losowy, uruchomienie wzorca, odczyt i zapis `.SVE` | w toku: zapis JSON i **odczyt/zapis `.SVE` + `.MAP`** (`sve.ts`, `picCodec.ts`, wczytanie z folderu gry w „Load a Saved Game”) gotowe; uruchomienie wzorca — do zrobienia |
| 1 | Generator świata, mapa z grafiką oryginału, aplikacja na Maca | etapy 1–8 generatora (6–8 dodane), Ziemia, paczka 0.1.0 |
| 2 | Jednostki, ruch, mgła wojny | **gotowe w silniku**: ruch z ZOC i kosztem terenu, statki z ładunkiem, widoczność, chaty, rozkazy osadników; widok mapy w `gfx` |
| 3 | Miasta i ekonomia | **gotowe w silniku**: zakładanie/zdobywanie, praca mieszkańców, wzrost, produkcja, handel, korupcja, podatki, zadowolenie, utrzymanie, zakup |
| 4 | Technologie, ustroje, zadowolenie, cuda | w dużej części: odkrycia i wybór badań, ustroje i rewolucja, efekty cudów w gospodarce; encyklopedia — Civilopedia (etap 8); brak: część cudów (statek, Manhattan) |
| 5 | Walka, barbarzyńcy | walka i powstania barbarzyńców gotowe; brak: atak jądrowy, klęski w miastach, globalne ocieplenie |
| 6 | Przeciwnik komputerowy | **gotowe w silniku**: strategie kontynentów, cele jednostek, ruchy jednostek i barbarzyńców, wybór produkcji, ustroje komputera, GoTo oryginału z tablicami ścieżek 20×13 (`goto.ts`, człowiek i komputer), karawany i dyplomaci komputera (szlak od razu po zbudowaniu karawany, kradzież/sabotaż, przekupywanie jednostkami ataku), rakieta obok celu, odległość oryginału F0_2dc4_0289 we wszystkich modułach |
| 7 | Dyplomacja, statek kosmiczny, koniec gry, punktacja | **gotowe**: punktacja (`score.ts`), koniec gry (podbój, statek, koniec panowania), statek kosmiczny (`spaceship.ts` + okno), dyplomacja komputer–komputer, prośby komputera, Hall of Fame, rozmowy z władcami (`kingMeeting.ts` + `screens/king.ts`, bez animacji twarzy, także po wizycie dyplomaty); karawany i dyplomaci człowieka (`unitActions.ts` + `screens/unitActions.ts`), **powtórka gry** (`replay.ts` w silniku i UI, „hail the CONQUEROR”) |
| 8 | Widok miasta, pałac, doradcy, dźwięk | ekrany startowe, menu, ekran gry, **okno miasta** (`screens/cityWindow.ts`: zasoby, mapka pól z przydziałem, specjaliści, budynki ze sprzedażą, jednostki, produkcja z CHANGE/AUTO/BUY, zakładki INFO/HAPPY/MAP), **raporty doradców i świata** (ADVISORS, WORLD, F1–F10, historyk, wykres potęgi — `reports.ts` w silniku, `screens/advisors.ts`), **Civilopedia** (`screens/civilopedia.ts`: listy, strony tematów, pomoc z wyboru badań i produkcji; opisy z BLURB0–4.TXT gracza albo własne) gotowe; panorama miasta (VIEW, CityView), pałac, intro, dźwięk — do zrobienia |

### Odstępstwa od układu oryginału (świadome)

- Stos jednostek: zamiast listy cyklicznej `NextUnitID` — wszystkie jednostki gracza na polu w kolejności numerów
  (aktywna = najniższy numer, jak w `GetCellActiveUnitID`).
- Warstwy ulepszeń: logika czyta rzeczywiste ulepszenia, rysowanie — widok człowieka; we wzorcu nazwy tych funkcji są zamienione
  (`GetVisibleTerrainImprovements` czyta warstwę rzeczywistą).
- Okna dialogowe są poza silnikiem: silnik zwraca `confirm` albo zgłasza zdarzenie z tekstem oryginału.
- Przechowywanie ufortyfikowanych jednostek poza tablicą (`FirstFortifiedCityUnits`) — pominięte.

### Wzorzec: dwie wersje OpenCivOne

Nowsza, uporządkowana wersja wzorca (C# po refaktoryzacji) ma pojedyncze błędy przepisania. Przy wątpliwościach porównujemy
z dosłownym tłumaczeniem asemblera z historii repozytorium wzorca (pliki `Segment_*.cs` sprzed commitów `fb7e4c7`, `5de93e8`).
Znalezione i poprawione u nas: ocena jednostek w SelectCityProduction (×16·(koszt+2)), mapa ról w RecalculateStatsAndPolicies
(pozycja jednostki, nie miasta), wstawianie do Hall of Fame (AddNewEntryToHallOfFame). GoTo we wzorcu jest zastąpione własnym A* — oryginał zachowany jako „Old unfixable GoTo”;
port u nas (`goto.ts`) idzie za asemblerem (`Segment_2e31.cs`, `Overlay_7.cs`). Błędy przepisania w tej części wzorca:
- GetNextMove: warunek wywołania FindShortestPath(999) odwrócony (oryginał: cel BLISKO — |Δx| < 7 lub > 73 i |Δy| < 7);
  wektor w kroku zachłannym bez nawiasów (dla |Δx| > |Δy| sam |Δx| zamiast max + |Δx| + |Δy|); na celu człowiek dostaje 0, nie -1.
- ComputeGoToPath: gdy blok jednostki nie ma przejść, oryginał zwraca Y celu (zwykle „prawda”), wzorzec — fałsz.
- CanUnitMove: wynik to współrzędne bloku (blok + kierunek), wzorzec mnoży przez 4; pole startowe sprawdzane w (blok·4 + 1),
  wzorzec — w (blok + 1).
- FindShortestPath: zmienna rozstrzygająca remisy żyje przez całą pętlę kierunków (wzorzec zeruje ją w każdym kierunku).
- CheckUnitPath: warunek wstępny |Δx| ≤ 7 LUB |Δy| ≤ 7 (wzorzec: I).
- ConstructLandPathArray: wołany CheckUnitPath(…, ląd, 20), wynik ≠ -1 i < 20 (wzorzec: nowy A*).
- ConstructWaterPathArray: numer oceanu bloku docelowego nie jest zerowany przed kierunkiem (wzorzec zeruje).
- Teren i numer kontynentu w overlayu 7 (F7_0000_176d/178e) czytane bez zawijania X — poza mapą trafiają w inne warstwy strony mapy.
- Odległość F0_2dc4_0208/0289: dłuższa różnica + połowa krótszej; nowszy wzorzec (GetDistance) liczy maksimum różnic.
  Silnik od 2026-11-17 używa oryginału wszędzie (`distance` = 0289, `distanceOf` = 0208 bez zawijania, `distanceDoubled` = 0243
  w GetNearestCityDirection) — lista wywołań w asemblerze sprawdzona (F0_2dc4_0102/0177 też liczą przez 0289).

Karawany i dyplomaci (`unitActions.ts`, asembler `Overlay_22.cs`, `Segment_2459.cs`, `Segment_1403.cs`) — rozbieżności wzorca:
- DiplomatActionOnCity komputera: zawsze kradzież, przy okradzionym mieście sabotaż; usuwany bez akcji tylko w mieście człowieka,
  z którym ma pokój (wzorzec: pokój dyplomaty z właścicielem albo barbarzyńcy). Brak nowej technologii: człowiek — komunikat
  i dyplomata zostaje (wzorzec: ponowne menu), komputer — sabotaż. Komunikaty kradzieży i sabotażu zawsze, zwykłym oknem.
- Sabotaż: Next(2), potem do 99 losowań Next(24) z pominięciem 0 (wzorzec: Next(23)+1); maska `1 << r` 16-bitowa z CWD —
  r = 15 kasuje naraz budynki 16–24, r = 16…23 nie trafia.
- Karawana: grupa miasta macierzystego czytana jako F0_2aea_1942(x, x) (wzorzec poprawia na (x, y)); tekst „Revenue: $…”.
- Przekupienie: komputer płaci przy złocie ≥ 2× koszt; ActiveUnits ±2 (DeleteUnit/CreateUnit + jawna zmiana); okno
  „ Forget it.\n Pay\n”. Teksty buntu: „will revolt for $…”, „ Subvert city ($x2)” (bez kwoty).
- Dyplomata komputera z produkcji (CityWorker L1828) to martwy kod: dla produkcji 26 komputer nie tworzy jednostki, a blok
  wymaga utworzonej — tarcze przepadają (L1ab6).
- AIEngine.MoveUnit: rakieta przenosi się na wolne pole obok celu i zwraca kierunek XOR 4 (4 → 0, 8 → 12) — jak w oryginale.
  (Poprawka naszego portu, nie wzorca: dodatek `atak × 4` do oceny pola tylko powyżej progu — L2b9d.)

## Otwarte kwestie

- Technologie startowe: wzorzec nie przyznaje żadnych (komunikat *INIT wymienia tylko drogi) — sprawdzić w oryginale (DOSBox).
- Tabele przepisane ze wzorca (przekształcenia terenu, nazwy miast, plan i części statku kosmicznego) — dodać do `npm run extract`.
- Generator losowy wzorca to MT19937 (nie rand() z MS C) — zgodność ziarna z oryginałem niesprawdzona.
- Znaczenie pola `unknown1` w tabeli terenu (`terrainChangeId` to wartość piksela terenu na mapie oryginału).
- Sposób, w jaki gra wyprowadza zakresy z `rand()`.
- Karawana komputera bez obcego miasta komputera: oryginał woła F0_2459_0948 z miastem -1 (czyta pamięć przed tablicą miast);
  u nas karawana znika bez przychodu. Karawana komputera we własnym mieście: oryginał pokazałby okno człowiekowi — u nas „Keep moving”.
- Karawana/dyplomata człowieka na „idź do”: pytanie silnika przerywa „idź do” (oryginał pokazuje okno w trakcie ruchu).
- GoTo: odczyty poza tablicami i stroną mapy (oryginał czyta sąsiednią pamięć) przyjęte jako 0; oryginał przelicza tablicę wody
  przy odczycie zapisu, u nas obie tablice i pamięć FindShortestPath są w zapisie.
- Pozostałe dane w CIV.EXE: nazwy miast, teksty, tablice strategii przeciwnika komputerowego.
- Grafika: przejścia między różnymi typami terenu (na razie ostre krawędzie kafli), warianty kafli, pozostałe jednostki.
- Zapis `.SVE`: zgodność bajtów z zapisami oryginału niesprawdzona (test `originalSve.test.ts` przy `CIV1_DIR`); `.MAP` —
  koder LZW/RLE oryginału nieznany (porównujemy piksele); po wczytaniu oryginał zaczyna GameTurn z Var_df60, u nas ruch człowieka
  trwa od stanu z zapisu; stan `rand()` nie jest zapisywany (ziarno = RandomSeed).
- Powtórka: „View Replay” w menu GAME wymaga SpaceshipFlags & 0x100 (bit statku barbarzyńców) — w zwykłej grze nigdy
  nieaktywne; sprawdzić w oryginale, czy coś ustawia ten bit.
