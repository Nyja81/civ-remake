# civ-remake

Własna, napisana od nowa gra strategiczna na Maca, której zasady są zgodne z klasykiem z 1991 r.
Projekt prywatny, hobbystyczny. Nie zawiera żadnych plików oryginalnej gry.

- Architektura, decyzje i etapy: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Zasady pracy i historia zmian: [CLAUDE.md](CLAUDE.md)
- Źródła i podziękowania: [NOTICE.md](NOTICE.md)

## Szybki start

```
npm install
npm test
```

Testy porównujące tabele silnika z oryginałem uruchamiają się po wskazaniu folderu
z własną, licencjonowaną kopią gry:

```
CIV1_DIR=/sciezka/do/gry npm test
```

## Stan

Etap 0 w toku: szkielet, generator losowy, tabele technologii, jednostek i terenu
zweryfikowane z oryginalnym CIV.EXE. Gry jeszcze nie da się uruchomić.
