#!/usr/bin/env python3
"""
Porównanie zrzutów piksel po pikselu: oryginał (dosbox.py → shots/) i nasz interfejs (render.ts → ours/).

Kolor piksela porównywany w 6 bitach na składową (paleta VGA): DOSBox zapisuje (v<<2)|(v>>4), my 255·v/63.
Wynik: tabela z odsetkiem zgodnych pikseli i prostokątem różnic; obrazy różnic w <katalog>/diff/NAZWA.png
(lewa: oryginał, środek: nasz, prawa: różnice na czerwono) — tylko lokalnie, nie do repozytorium.

Użycie: compare.py [--work /tmp/civ-dosbox] [--mask X0,Y0,X1,Y1 …] [NAZWA …]
Maska kursora: oryginał rysuje kursor myszy w obrazie; scenariusze odstawiają go w (319,199), więc róg
(317–319, 197–199) jest domyślnie pomijany.
"""
import argparse
import os
import sys

import numpy as np
from PIL import Image


def load6(path):
    im = Image.open(path)
    rgb = np.array(im.convert('RGB')).astype(np.int32)
    return rgb >> 2 if 'shots' in path else np.rint(rgb * 63 / 255).astype(np.int32)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--work', default=os.environ.get('CIV_DOSBOX_WORK', '/tmp/civ-dosbox'))
    ap.add_argument('--mask', action='append', default=[])
    ap.add_argument('names', nargs='*')
    a = ap.parse_args()
    shots = os.path.join(a.work, 'shots')
    ours = os.path.join(a.work, 'ours')
    out = os.path.join(a.work, 'diff')
    os.makedirs(out, exist_ok=True)
    names = a.names or sorted(n[:-4] for n in os.listdir(shots) if n.endswith('.png'))
    masks = [(317, 197, 320, 200)] + [tuple(map(int, m.split(','))) for m in a.mask]
    print(f"{'ekran':28} {'zgodność':>9}  {'różne':>6}  prostokąt różnic")
    for name in names:
        po, pu = os.path.join(shots, name + '.png'), os.path.join(ours, name + '.png')
        if not os.path.exists(pu) or not os.path.exists(po):
            print(f'{name:28} {"brak":>9}')
            continue
        o, u = load6(po), load6(pu)
        diff = np.any(o != u, axis=2)
        for x0, y0, x1, y1 in masks:
            diff[y0:y1, x0:x1] = False
        n = int(diff.sum())
        pct = 100.0 * (1 - n / diff.size)
        box = ''
        if n:
            ys, xs = np.nonzero(diff)
            box = f'({xs.min()},{ys.min()})–({xs.max()},{ys.max()})'
        print(f'{name:28} {pct:8.2f}%  {n:6d}  {box}')
        vis = np.concatenate([o, u, np.where(diff[..., None], np.array([63, 0, 0]), o // 3)], axis=1)
        Image.fromarray((vis * 255 // 63).astype(np.uint8)).save(os.path.join(out, name + '.png'))


if __name__ == '__main__':
    sys.exit(main())
