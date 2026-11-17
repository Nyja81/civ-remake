# CLAUDE.md — civ-remake

Własna, napisana od nowa gra strategiczna na Maca, zgodna zasadami z oryginałem z 1991 r.
Projekt hobbystyczny. Notatka Obsidian: `Projekty/civ-remake.md`.

## Zasady obowiązkowe

1. **PRZED pracą** — przeczytaj `docs/ARCHITECTURE.md` oraz notatkę `Projekty/civ-remake.md` w Obsidianie.
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

