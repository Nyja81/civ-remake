# Porównanie z oryginałem w DOSBoxie

Stan na 2026-11-18. Oryginał: kopia gry Damiana (CIV.EXE **474.01**), DOSBox 0.74 bez okna (Xvfb). Nasz interfejs: te same
scenariusze odtwarzane na wirtualnym ekranie 320×200 (`packages/ui`) z plikami gry z `CIV1_DIR`. Zrzuty i pliki oryginału
zostają lokalnie (`/tmp/civ-dosbox`) — do repozytorium trafiają tylko narzędzia, scenariusze i ten opis.

## Narzędzia (`tools/dosbox`)

| Plik | Rola |
|---|---|
| `dosbox.py` | Xvfb (:107) + DOSBox z kopią gry w `/tmp/civ-dosbox/game`; `serve [--fresh]` (DOSBox na pierwszym planie — uruchamiać jako zadanie w tle), `boot` (pytania o grafikę/dźwięk/mysz, intro), `keys`, `type`, `click`, `move`, `shot NAZWA` (Ctrl+F5 → PNG 320×200 z paletą), `run SCENARIUSZ`, `keep N` (CIVILN.SVE/.MAP z gry → `CIV_DOSBOX_SAVES`, domyślnie `/tmp/civ-dosbox/saves`) |
| `render.ts` | ten sam scenariusz w naszym UI (`npx tsx tools/dosbox/render.ts scenariusz.txt`); zegar wirtualny, zrzut, gdy ekran czeka na wejście; zapisy oryginału z `CIV1_SAVES_DIR` |
| `compare.py` | porównanie zrzutów: zgodność kolorów (RGB w 6 bitach VGA), zgodność indeksów palety, liczba różnych pikseli, prostokąt różnic; obrazy różnic w `/tmp/civ-dosbox/diff` |
| `worldcheck.ts` | zapis oryginału → mapa z silnika z tym samym ziarnem (z przesunięciem N losowań), kontynenty, ocena pól, gracze |
| `scenarios/*.txt` | kroki: `keys`, `type`, `click x y`, `move`, `sleep s`, `shot nazwa`; przedrostek `dosbox ` / `ours ` — krok tylko dla jednej strony |

Przebieg: `python3 dosbox.py serve --fresh` (w tle), potem `python3 dosbox.py boot && python3 dosbox.py run scenarios/menus.txt`,
`CIV1_DIR=… CIV1_SAVES_DIR=/tmp/civ-dosbox/saves npx tsx tools/dosbox/render.ts tools/dosbox/scenarios/menus.txt`,
`python3 tools/dosbox/compare.py menu-main custom-landmass …`. Mysz w DOSBoxie: kliknięcie blokujące, potem ruch względny
(2 piksele okna = 1 piksel gry). Klawisze: `keydown`/`keyup` z `windowfocus` (sam `key` DOSBox gubi).

Scenariusze `game`, `reports`, `city` zaczynają się od wczytania CIVIL0 (zapis zrobiony w DOSBoxie i zachowany `keep 0`), więc
stan gry jest ten sam po obu stronach. Scenariusz `menus` zaczyna nową grę — mapa i tekst *INIT zależą od ziarna `srand(time)`.

## Wyniki

| Ekran | Zgodność kolorów | Zgodność indeksów | Uwagi |
|---|---|---|---|
| menu główne, Customize World (4 ekrany), DIFFS: poziom, liczba cywilizacji, plemię | 100% | 100% | |
| DIFFS: imię | 99,93% | 99,93% | migający kursor pola tekstowego |
| tekst *INIT | 87,26% | 87,26% | zależy od ziarna gry (wzór ramki DrawRandomFoodIcons, technologie startowe) — u nas ziarno 1, w oryginale czas |
| ekran gry, notatka „Civilization Note”, menu GAME/ORDERS/ADVISORS/WORLD/CIVILOPEDIA | 99,95–100% | 100% | cykl palety wody (kolory 0x60–0x67) na polu rzeki/oceanu |
| raporty F1, F2, F4–F6, F8–F10 | 100% | 100% | |
| raporty F3, F7 | 99,60%, 99,95% | 99,65%, 100% | miganie aktywnej jednostki / cykl palety |
| Civilopedia: Complete, Advances | 100% | 100% | |
| nazwa miasta, panorama po założeniu miasta | 100% | 100% | |
| okno miasta (INFO, HAPPY, MAP, lista produkcji) | 98,96–99,00% | 99,00% | różnice wersji 474.01 ↔ 475.05: „(Pop:” zamiast „(Population:”, brak przycisku RENAME |

Przed poprawkami: generator świata 66% pól, lista produkcji 83%, ekran gry i raporty z różnicami w menu, panelu i napisach.

## Poprawione po porównaniu

- **Generator świata** (`world/generate.ts`) przepisany z dosłownego tłumaczenia F7_0000_0012 (strona mapy 320×200 jak w oryginale):
  teren, kontynenty/oceany i ocena pól pod miasta identyczne z zapisami oryginału (2 gry, ziarna 20851 i 24104 — 4000/4000 pól).
  Oryginał buduje mapę zaraz po `srand(RandomSeed)`. Test: `packages/engine/test/originalWorld.test.ts` (z `CIV1_SAVES_DIR`).
- **Wyrównanie startu** F5_0000_0fe6 (drugi osadnik, technologie) — nacje, xStart i technologie wszystkich graczy jak w oryginale.
- **Okna menu** (F0_2d05_0475/0031): geometria, ramka tylko przy parzystym Y, podświetlenie, opcje nieaktywne, napis pomocy, mysz.
- **Tekst *INIT**: wczytanie sekcji, łamanie i blok tekstu jak F0_2f4d_01ad/0000/0088.
- **Ekran gry**: menu GAME/Options/CIVILOPEDIA z napisami CIV.EXE, panel (złoto, podatki, żarówka), widok startowy i wybór
  pierwszej jednostki jak w PlayerTurn, rozkazy osadników zależne od terenu.
- **Porady** (Instant Advice): „--- Civilization Note ---” z HELP.TXT (F4_0000_02d3) i porady dla osadników (F4_0000_00af);
  *FIRSTPRODUCT przed oknem pierwszego miasta.
- **Założenie miasta**: nazwa → notatka → animacja → okno miasta; osadnik znika dopiero po całej sekwencji.
- **Raporty**: liczba mieszkańców (F0_2dc4_0337), nagłówek Attitude, „Total Income”, odstęp za zadowolonymi mieszkańcami.
- **Lista produkcji** (F0_1ade_0421): wiersze wg napisów CIV.EXE („, ADM:a/d/m”, „turn” przy 1, gwiazdka przed nazwą cudu),
  domyślnie pierwsza pozycja, czcionka 2 przy ponad 19 pozycjach, okna „Military Advisor” / „Domestic Advisor” z PRODUCE.TXT.

## Rozwój przeciwnika komputerowego (2026-11-18)

Pytanie Damiana: komputer za mało buduje osadników i zakłada miast. Oryginał 474.01: nowa gra (Warlord, 7 cywilizacji),
człowiek zakłada jedno miasto i pomija ruchy; autozapisy CIVIL4–6 z tur 50/100/150. Silnik: start z CIVIL4 (ten sam stan),
człowiek nic nie robi, trzy przebiegi z przesuniętym losowaniem (`tools/stress/aiFromSve.ts`).

| Tura (rok) | Oryginał: miasta / ludność 6 komputerów | Silnik (3 przebiegi) |
|---|---|---|
| 50 (3000 BC) | 9 / 18 | — (stan wyjściowy) |
| 100 (2000 BC) | 13 / 34 | 15 / 37, 14 / 39, 14 / 39 |
| 150 (1000 BC) | 18 / 58 | 17 / 59, 16 / 59, 17 / 60 |

Tempo jak w oryginale. Na niskich poziomach komputer ma drożej: mnożnik żywności i produkcji 16 − 2·poziom (Chieftain 16,
Warlord 14, Prince 12, King 10, Emperor 8) wobec 10 u człowieka. Osadnicy komputera po drodze nawadniają i budują drogi
przy miastach (jak w oryginale).

## Rozbieżności otwarte

- **Wyrównanie startu, zapis z ziarnem 24104**: oryginał dał graczowi 5 drugiego osadnika (różnica ocen 4), u nas różnica 1 —
  technologie te same. Gracz 5 jest sam na kontynencie (u nas +4 za odległość); w oryginale wynik wskazuje na +1 (sąsiad
  10–19 pól na tym samym kontynencie). Nie znaleziono przyczyny (wielkości kontynentów i grupy pól zgodne). Test liczby
  osadników tylko z `CIV1_STRICT_START=1`.
- **DrawVisibleMap zużywa generator** (F0_2dc4_005d(0x100) przy rysowaniu) — u nas rysowanie nie losuje, więc po każdym
  przerysowaniu mapy ciąg losowań się rozjeżdża (przebieg gry od drugiej tury nie jest porównywalny los w los).
- **Cykl palety wody** na mapie (kolory 0x60–0x67) i miganie minimapy — nie ma.
- **Chieftain, tura 0**: oryginał pokazuje opisy części ekranu (Menu Bar, Map Window, Active Unit… — napisy w CIV.EXE) — nie ma.
- **Minimapa** jest w oryginale osobną warstwą strony mapy (zapis .MAP, x 240+), u nas rysowana z warstw odkrycia.
- **Lista produkcji** bez stron „more...”.
- **474.01 ↔ 475.05** (potwierdzone w DOSBoxie): tytuł okna miasta „(Pop:x)” zamiast „(Population:x)”, brak przycisku RENAME.
  Silnik i UI idą za 475.05 (specyfikacja). Komunikatu o pięciu mieszkańcach dla specjalistów i „Bonus Score” nie sprawdzano.
- Nie porównano jeszcze: rozmowy z władcą, pałacu, panoramy z budynkami, Civilopedii poza listami, okien dyplomaty i karawany,
  przebiegu tur (wymaga losowań DrawVisibleMap).
