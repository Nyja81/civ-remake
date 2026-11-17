# Architektura

> Wersja 1 — 2026-11-17. Zmiana o więcej niż ~20% treści = nowy plik `ARCHITECTURE.v2.md`.

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
| Grafika | decyzja ostateczna 2026-11-17: **oryginalne grafiki**, wczytywane z kopii gry właściciela licencji i wygładzane u niego na komputerze (hq4x + lekkie zmiękczenie, 4×). Bez plików oryginału gra używa pakietu zastępczego: zestawu „trident” z Freeciv (GPL-2.0+) albo własnego pakietu wektorowego `packages/art` |
| Język gry | angielski |
| Język kodu i dokumentacji | identyfikatory po angielsku, komentarze i dokumentacja po polsku |
| Repozytorium | prywatne `Nyja81/civ-remake` |

## Warstwy

| # | Warstwa | Pakiet | Stan |
|---|---|---|---|
| 1 | Silnik zasad — stan gry i reguły, bez grafiki | `packages/engine` | zaczęty |
| 2 | Tabele danych — generowane z CIV.EXE właściciela licencji | `packages/engine/src/data` | technologie, jednostki, teren |
| 3 | Przeciwnik komputerowy — gra tymi samymi komendami co gracz | `packages/engine` | — |
| 4 | Komendy i zdarzenia — interfejs wysyła komendy, silnik odpowiada zdarzeniami i prośbami o decyzję | `packages/engine` | — |
| 5 | Interfejs — mapa w PixiJS (WebGL), panele i okna w React | `apps/desktop` | — |
| 6 | Pakiet grafiki — rysunek wektorowy generowany kodem (SVG), składany w atlas tekstur | `packages/art` | próbki: 12 kafli terenu, 4 żetony jednostek, miasto, fragment mapy |
| 7 | Aplikacja na Maca — Electron, zapisy w `~/Library/Application Support` | `apps/desktop` | — |
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

| Etap | Zakres | Stan |
|---|---|---|
| 0 | Repozytorium, tabele danych, generator losowy, uruchomienie wzorca, odczyt i zapis `.SVE` | w toku |
| 1 | Generator świata, mapa z nową grafiką, aplikacja na Maca | — |
| 2 | Jednostki, ruch, mgła wojny | — |
| 3 | Miasta i ekonomia | — |
| 4 | Technologie, ustroje, zadowolenie, cuda | — |
| 5 | Walka, barbarzyńcy | — |
| 6 | Przeciwnik komputerowy | — |
| 7 | Dyplomacja, statek kosmiczny, koniec gry, punktacja | — |
| 8 | Widok miasta, pałac, doradcy, dźwięk | — |

## Otwarte kwestie

- Znaczenie pól `unknown1` i `terrainChangeId` w tabeli terenu.
- Sposób, w jaki gra wyprowadza zakresy z `rand()`.
- Pozostałe tabele w CIV.EXE: budynki, cuda, nacje, charaktery przywódców.
- Grafika: przejścia między różnymi typami terenu (na razie ostre krawędzie kafli), warianty kafli, pozostałe jednostki.
