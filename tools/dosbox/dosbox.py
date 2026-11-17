#!/usr/bin/env python3
"""
Sterowanie oryginałem w DOSBoxie (bez okna, Xvfb): uruchomienie, klawisze, mysz, zrzuty ekranu 320×200.

Pliki oryginału czytane z CIV1_DIR i kopiowane do katalogu roboczego (domyślnie /tmp/civ-dosbox);
zrzuty trafiają do <katalog>/shots — nigdy do repozytorium.

Użycie (każde polecenie to osobne wywołanie; stan = działający DOSBox na ekranie :100):
  dosbox.py start [--fresh]           # Xvfb + DOSBox; odpowiada na pytania o grafikę (VGA), dźwięk (brak) i mysz
  dosbox.py serve [--fresh]           # DOSBox na pierwszym planie (gdy środowisko zabija procesy w tle), potem `boot`
  dosbox.py boot                      # tylko odpowiedzi na pytania startowe
  dosbox.py keep N                    # CIVILN.SVE/.MAP z gry → katalog zapisów (CIV_DOSBOX_SAVES, domyślnie <katalog>/saves)
  dosbox.py keys Return sleep:2 a ... # klawisze xdotool (keydown/keyup), sleep:<s> = przerwa
  dosbox.py type "Napis"              # wpisanie tekstu
  dosbox.py click X Y [button]        # kliknięcie w punkt ekranu gry 320×200 (przez ruch względny myszy DOSBoxa)
  dosbox.py shot NAZWA                # Ctrl+F5 → shots/NAZWA.png (320×200, paleta)
  dosbox.py run SCENARIUSZ            # kroki z pliku: keys/type/click/shot/sleep, po jednym w wierszu
  dosbox.py stop
"""
import os
import shutil
import subprocess
import sys
import time

WORK = os.environ.get('CIV_DOSBOX_WORK', '/tmp/civ-dosbox')
DISPLAY = os.environ.get('CIV_DOSBOX_DISPLAY', ':107')
ENV = dict(os.environ, DISPLAY=DISPLAY, SDL_AUDIODRIVER='dummy')
# Okno DOSBoxa: tryb 320×200 z podwojeniem (scaler=normal2x) daje 640×400 — mysz przeliczamy 2:1.
CONF = """[sdl]
fullscreen=false
output=surface
autolock=true
sensitivity=100
[dosbox]
machine=svga_s3
memsize=16
captures={work}/cap
[cpu]
core=auto
cycles={cycles}
[render]
scaler=normal2x
aspect=false
frameskip=0
[mixer]
nosound=true
[sblaster]
sbtype=none
[gus]
gus=false
[speaker]
pcspeaker=false
tandy=off
disney=false
[autoexec]
mount c {work}/game
c:
civ
"""


def sh(*args, check=True):
    return subprocess.run(args, env=ENV, check=check, capture_output=True, text=True).stdout.strip()


def window():
    for _ in range(50):
        out = sh('xdotool', 'search', '--name', 'DOSBox', check=False)
        if out:
            return out.splitlines()[0]
        time.sleep(0.2)
    raise SystemExit('Brak okna DOSBoxa')


def press(key, hold=0.12):
    w = window()
    sh('xdotool', 'windowfocus', '--sync', w, check=False)
    sh('xdotool', 'keydown', '--window', w, key)
    time.sleep(hold)
    sh('xdotool', 'keyup', '--window', w, key)
    time.sleep(0.25)


def keys(seq):
    for k in seq:
        if k.startswith('sleep:'):
            time.sleep(float(k[6:]))
        else:
            press(k)


KEYNAMES = {' ': 'space', '.': 'period', ',': 'comma', '-': 'minus', "'": 'apostrophe'}


def type_text(text):
    for ch in text:
        k = KEYNAMES.get(ch, ch)
        if ch.isupper():
            k = 'shift+' + ch.lower()
        press(k, 0.06)


def shot(name):
    cap = os.path.join(WORK, 'cap')
    os.makedirs(cap, exist_ok=True)
    before = set(os.listdir(cap))
    w = window()
    sh('xdotool', 'windowfocus', '--sync', w, check=False)
    sh('xdotool', 'keydown', '--window', w, 'ctrl')
    sh('xdotool', 'key', '--window', w, 'F5')
    sh('xdotool', 'keyup', '--window', w, 'ctrl')
    for _ in range(50):
        time.sleep(0.1)
        new = set(os.listdir(cap)) - before
        if new:
            time.sleep(0.2)
            src = os.path.join(cap, sorted(new)[0])
            os.makedirs(os.path.join(WORK, 'shots'), exist_ok=True)
            dst = os.path.join(WORK, 'shots', name + '.png')
            shutil.move(src, dst)
            print(dst)
            return dst
    raise SystemExit('Zrzut się nie pojawił')


# Mysz: DOSBox z autolock=true przechwytuje kursor (pierwsze kliknięcie w okno), potem przekazuje grze ruch względny.
# Zmierzone: 2 piksele ruchu X = 1 piksel ekranu gry w obu osiach. Kliknięcie: dosunięcie kursora do (0, 0) dużym ruchem
# w lewo-górę, potem ruch o (2x, 2y) w krokach po 50 px (bez przyspieszenia wskaźnika).
_locked = os.path.join(WORK, 'mouse-locked')


def _rel(dx, dy):
    while dx or dy:
        sx = max(-50, min(50, dx))
        sy = max(-50, min(50, dy))
        sh('xdotool', 'mousemove_relative', '--', str(sx), str(sy))
        dx -= sx
        dy -= sy
        time.sleep(0.03)


def move(x, y):
    w = window()
    sh('xdotool', 'windowfocus', '--sync', w, check=False)
    if not os.path.exists(_locked):
        geo = sh('xdotool', 'getwindowgeometry', w)
        pos = [l for l in geo.splitlines() if 'Position' in l][0].split()[1].split(',')
        sh('xdotool', 'mousemove', str(int(pos[0]) + 320), str(int(pos[1]) + 200))
        sh('xdotool', 'click', '1')  # przechwycenie myszy przez DOSBox (to kliknięcie nie trafia do gry)
        open(_locked, 'w').close()
        time.sleep(0.3)
    _rel(-800, -500)
    time.sleep(0.1)
    _rel(2 * x, 2 * y)
    time.sleep(0.3)


def park():
    """Kursor w prawy dolny róg drogą wzdłuż górnej i prawej krawędzi (omija okna menu); róg maskuje compare.py."""
    if not os.path.exists(_locked):
        move(319, 199)
        return
    _rel(0, -500)
    _rel(800, 0)
    _rel(0, 500)
    time.sleep(0.3)


def click(x, y, button=1):
    move(x, y)
    sh('xdotool', 'mousedown', str(button))
    time.sleep(0.15)
    sh('xdotool', 'mouseup', str(button))
    time.sleep(0.4)


SAVES = os.environ.get('CIV_DOSBOX_SAVES', os.path.join(WORK, 'saves'))


def prepare(fresh=False, cycles='max'):
    """Kopia gry w katalogu roboczym (+ zapisy CIVIL?.SVE/.MAP z SAVES), konfiguracja DOSBoxa, Xvfb."""
    src = os.environ.get('CIV1_DIR')
    if not src:
        raise SystemExit('Ustaw CIV1_DIR')
    os.makedirs(WORK, exist_ok=True)
    game = os.path.join(WORK, 'game')
    if fresh and os.path.exists(game):
        shutil.rmtree(game)
    if not os.path.exists(game):
        shutil.copytree(src, game)
    if os.path.isdir(SAVES):
        for n in os.listdir(SAVES):
            if n.upper().startswith('CIVIL'):
                shutil.copy(os.path.join(SAVES, n), os.path.join(game, n.upper()))
    with open(os.path.join(WORK, 'dosbox.conf'), 'w') as f:
        f.write(CONF.format(work=WORK, cycles=cycles))
    if subprocess.run(['pgrep', '-f', f'Xvfb {DISPLAY}'], capture_output=True).returncode != 0:
        subprocess.Popen(['Xvfb', DISPLAY, '-screen', '0', '1024x768x24'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                         start_new_session=True)
        sock = '/tmp/.X11-unix/X' + DISPLAY.lstrip(':')
        for _ in range(50):
            if os.path.exists(sock):
                break
            time.sleep(0.2)
        time.sleep(0.5)
    if os.path.exists(_locked):
        os.remove(_locked)


def boot():
    """Odpowiedzi na pytania startowe: grafika VGA, bez dźwięku, mysz i klawiatura."""
    window()
    time.sleep(2.5)
    keys(['1', 'sleep:1', '1', 'sleep:1', '1', 'sleep:1'])


def start(fresh=False, cycles='max'):
    """DOSBox w tle (osobna sesja) + boot. Uwaga: środowisko może zabić proces po zakończeniu wywołania —
    wtedy użyj `serve` (DOSBox na pierwszym planie, np. jako zadanie w tle) i `boot`."""
    prepare(fresh, cycles)
    conf = os.path.join(WORK, 'dosbox.conf')
    log = os.path.join(WORK, 'dosbox.log')
    subprocess.Popen(['setsid', 'sh', '-c', f'dosbox -conf "{conf}" > "{log}" 2>&1; echo $? > "{WORK}/dosbox.exit"'], env=ENV,
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    boot()


def serve(fresh=False, cycles='max'):
    """DOSBox na pierwszym planie (kończy się razem z DOSBoxem)."""
    prepare(fresh, cycles)
    with open(os.path.join(WORK, 'dosbox.log'), 'w') as log:
        sys.exit(subprocess.run(['dosbox', '-conf', os.path.join(WORK, 'dosbox.conf')], env=ENV, stdout=log, stderr=subprocess.STDOUT).returncode)


def keep(slot):
    """Zapis CIVIL<slot>.SVE/.MAP z gry w DOSBoxie → katalog SAVES (przetrwa `--fresh`)."""
    os.makedirs(SAVES, exist_ok=True)
    for ext in ('SVE', 'MAP'):
        shutil.copy(os.path.join(WORK, 'game', f'CIVIL{slot}.{ext}'), os.path.join(SAVES, f'CIVIL{slot}.{ext}'))


def stop():
    subprocess.run(['pkill', '-f', f"dosbox -conf {WORK}"])


def run(path):
    for line in open(path):
        line = line.split('#', 1)[0].strip()
        if not line or line.startswith('ours '):
            continue
        if line.startswith('dosbox '):
            line = line[7:]
        cmd, *args = line.split()
        if cmd == 'keys':
            keys(args)
        elif cmd == 'type':
            type_text(line.split(None, 1)[1])
        elif cmd == 'click':
            click(*map(int, args))
        elif cmd == 'move':
            move(*map(int, args))
        elif cmd == 'shot':
            park()
            shot(args[0])
        elif cmd == 'park':
            park()
        elif cmd == 'sleep':
            time.sleep(float(args[0]))
        else:
            raise SystemExit(f'Nieznany krok: {line}')


if __name__ == '__main__':
    cmd, *args = sys.argv[1:] or ['help']
    if cmd == 'start':
        start('--fresh' in args)
    elif cmd == 'serve':
        serve('--fresh' in args)
    elif cmd == 'boot':
        boot()
    elif cmd == 'keep':
        keep(args[0])
    elif cmd == 'stop':
        stop()
    elif cmd == 'keys':
        keys(args)
    elif cmd == 'type':
        type_text(' '.join(args))
    elif cmd == 'click':
        click(*map(int, args))
    elif cmd == 'move':
        move(*map(int, args))
    elif cmd == 'shot':
        shot(args[0])
    elif cmd == 'run':
        run(args[0])
    else:
        print(__doc__)
