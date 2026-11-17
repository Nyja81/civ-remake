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
- Grafika i teksty w grze są własne — nie kopiujemy rysunków ani opisów z oryginału.

## Polecenia

```
npm install
npm test                          # testy silnika
CIV1_DIR=/sciezka/do/gry npm test # dodatkowo porównanie z oryginalnym CIV.EXE
npm run typecheck
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
