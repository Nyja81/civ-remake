# civ-remake

Własna, napisana od nowa gra strategiczna na Maca, której zasady są zgodne z klasykiem z 1991 r.
Projekt prywatny, hobbystyczny. Nie zawiera żadnych plików oryginalnej gry.

- Architektura, decyzje i etapy: [docs/ARCHITECTURE.v2.md](docs/ARCHITECTURE.v2.md)
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

Silnik: etapy 2–3 gotowe (jednostki, ruch, mgła wojny, walka, miasta, gospodarka), etapy 4–5 w dużej części,
przeciwnik komputerowy tymczasowy. Interfejs 320×200 jak w oryginale — w toku. Szczegóły: docs/ARCHITECTURE.v2.md.
