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
| 1 | Silnik zasad — stan gry i reguły, bez grafiki | `packages/engine` (`src/game/*`) | stan gry, ruch, walka, miasta, gospodarka, badania, ustroje, barbarzyńcy, zapis JSON |
| 2 | Tabele danych — generowane z CIV.EXE właściciela licencji | `packages/engine/src/data` | technologie, jednostki, teren, budynki, cuda, nacje; ręcznie ze wzorca (do weryfikacji): przekształcenia terenu, nazwy miast |
| 3 | Przeciwnik komputerowy — gra tymi samymi komendami co gracz | `packages/engine/src/game/ai.ts` | port AIEngine i oceny produkcji (SelectCityProduction); „idź do” komputera — tymczasowo najtańsza droga |
| 4 | Komendy i zdarzenia — interfejs wydaje rozkazy, silnik odpowiada zdarzeniami i prośbami o decyzję | `packages/engine` | `unitMove`, `unitOrder`, `state.events`, odpowiedzi `confirm` |
| 5 | Interfejs — ekran 320×200 jak w oryginale, wygładzany 4× | `packages/ui`, `apps/desktop` | ekrany startowe, menu, okna, ekran gry z mapą, rozkazami, oknem miasta, zapisem (scalone do `main`) |
| 5a | Grafiki oryginału — dekoder `.PIC`, czcionki `FONTS.CV`, reguły rysowania mapy | `packages/gfx` | teren, ulepszenia, mgła, miasta, jednostki, minimapa (`mapView.ts`) |
| 6 | Pakiet zastępczy grafiki — wektorowy (SVG) i Freeciv „trident” | `packages/art`, `tools/tileset` | próbki |
| 7 | Aplikacja na Maca — Electron, zapisy w `~/Library/Application Support/<aplikacja>/saves` | `apps/desktop` | paczka 0.2.0 (arm64, niepodpisana) |
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
| 0 | Repozytorium, tabele danych, generator losowy, uruchomienie wzorca, odczyt i zapis `.SVE` | w toku (zapis własny JSON gotowy; `.SVE` — do zrobienia) |
| 1 | Generator świata, mapa z grafiką oryginału, aplikacja na Maca | etapy 1–8 generatora (6–8 dodane), Ziemia, paczka 0.1.0 |
| 2 | Jednostki, ruch, mgła wojny | **gotowe w silniku**: ruch z ZOC i kosztem terenu, statki z ładunkiem, widoczność, chaty, rozkazy osadników; widok mapy w `gfx` |
| 3 | Miasta i ekonomia | **gotowe w silniku**: zakładanie/zdobywanie, praca mieszkańców, wzrost, produkcja, handel, korupcja, podatki, zadowolenie, utrzymanie, zakup |
| 4 | Technologie, ustroje, zadowolenie, cuda | w dużej części: odkrycia i wybór badań, ustroje i rewolucja, efekty cudów w gospodarce; brak: encyklopedia, część cudów (statek, Manhattan) |
| 5 | Walka, barbarzyńcy | walka i powstania barbarzyńców gotowe; brak: atak jądrowy, klęski w miastach, globalne ocieplenie |
| 6 | Przeciwnik komputerowy | **gotowe w silniku**: strategie kontynentów, cele jednostek, ruchy jednostek i barbarzyńców, wybór produkcji, ustroje komputera; brak: GoTo oryginału, działania dyplomatów i karawan komputera |
| 7 | Dyplomacja, statek kosmiczny, koniec gry, punktacja | do zrobienia (silnik zgłasza kontakt jako zdarzenie) |
| 8 | Widok miasta, pałac, doradcy, dźwięk | ekrany startowe, menu, ekran gry i uproszczone okno miasta gotowe; pełne okno miasta, Civilopedia, doradcy, pałac, intro, dźwięk — do zrobienia |

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
(pozycja jednostki, nie miasta). GoTo we wzorcu jest zastąpione własnym A* — oryginał zachowany jako „Old unfixable GoTo”.

## Otwarte kwestie

- Technologie startowe: wzorzec nie przyznaje żadnych (komunikat *INIT wymienia tylko drogi) — sprawdzić w oryginale (DOSBox).
- Tabele przepisane ze wzorca (przekształcenia terenu, nazwy miast) — dodać do `npm run extract`.
- Generator losowy wzorca to MT19937 (nie rand() z MS C) — zgodność ziarna z oryginałem niesprawdzona.
- Znaczenie pola `unknown1` w tabeli terenu (`terrainChangeId` to wartość piksela terenu na mapie oryginału).
- Sposób, w jaki gra wyprowadza zakresy z `rand()`.
- „Idź do” komputera: czy oryginał ogranicza drogę do pól odkrytych (u nas — tylko dla człowieka).
- Pozostałe dane w CIV.EXE: nazwy miast, teksty, tablice strategii przeciwnika komputerowego.
- Grafika: przejścia między różnymi typami terenu (na razie ostre krawędzie kafli), warianty kafli, pozostałe jednostki.
