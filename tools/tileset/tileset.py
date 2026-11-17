"""Odczyt zestawu grafik w formacie Freeciv (.spec + .png) i składanie mapy z dopasowaniem do sąsiadów."""
import re
from pathlib import Path
from PIL import Image

class Tileset:
    def __init__(self, data_dir, name='trident'):
        self.sprites = {}
        base = Path(data_dir)
        for spec in sorted((base / name).glob('*.spec')):
            self._load(base, spec)

    def _load(self, base, spec):
        text = spec.read_text(encoding='utf-8', errors='replace')
        m = re.search(r'^gfx\s*=\s*"([^"]+)"', text, re.M)
        if not m:
            return
        sheet = Image.open(base / (m.group(1) + '.png')).convert('RGBA')
        for block in re.split(r'^\[grid_[^\]]*\]', text, flags=re.M)[1:]:
            num = lambda key, default=0: int((re.search(rf'^{key}\s*=\s*(\d+)', block, re.M) or [0, default])[1])
            x0, y0, dx, dy, border = num('x_top_left'), num('y_top_left'), num('dx'), num('dy'), num('pixel_border')
            pos = None
            for line in block.splitlines():
                line = line.split(';')[0]
                mm = re.match(r'\s*(\d+)\s*,\s*(\d+)\s*,(.*)$', line)
                if mm:
                    pos = (int(mm.group(1)), int(mm.group(2)))
                    rest = mm.group(3)
                elif pos and line.strip().startswith('"'):
                    rest = line  # dalszy ciąg listy nazw dla tej samej komórki
                else:
                    continue
                x, y = x0 + pos[1] * (dx + border), y0 + pos[0] * (dy + border)
                for tag in re.findall(r'"([^"]+)"', rest):
                    self.sprites.setdefault(tag, sheet.crop((x, y, x + dx, y + dy)))

    def get(self, tag):
        return self.sprites[tag]

WATER = {'~': 'coast', '=': 'floor'}
LAND = {'g': 'grassland', 'p': 'plains', 'd': 'desert', 'f': 'forest', 'j': 'jungle', 'h': 'hills',
        'm': 'mountains', 't': 'tundra', 'a': 'arctic', 's': 'swamp'}
GROUP = {'arctic': 'tundra'}  # w trident arktyka dopasowuje się razem z tundrą
CELLS = {'u': (0, 0), 'd': (15, 15), 'r': (15, 0), 'l': (0, 15)}
T = 30

def compose(ts, rows, rivers=(), specials=(), cities=(), units=()):
    H, W = len(rows), len(rows[0])
    at = lambda x, y: rows[y][x] if 0 <= x < W and 0 <= y < H else '~'
    water = lambda x, y: at(x, y) in WATER
    river = lambda x, y: (x, y) in rivers
    img = Image.new('RGBA', (W * T, H * T))
    paste = lambda tag, x, y: img.alpha_composite(ts.get(tag), (x * T, y * T))
    flags = lambda x, y, test: ''.join(f'{d}{int(test(x + dx, y + dy))}' for d, dx, dy in (('n', 0, -1), ('e', 1, 0), ('s', 0, 1), ('w', -1, 0)))
    for y in range(H):
        for x in range(W):
            c = at(x, y)
            if c in WATER:
                kind = WATER[c]
                for cell, (ox, oy) in CELLS.items():
                    img.alpha_composite(ts.get(f't.l0.{kind}_cell_{cell}000'), (x * T + ox, y * T + oy))
                paste(f't.l1.{kind}_{flags(x, y, water)}', x, y)
                for d, dx, dy in (('n', 0, -1), ('e', 1, 0), ('s', 0, 1), ('w', -1, 0)):
                    if river(x + dx, y + dy):
                        paste(f'road.river_outlet_{d}:0', x, y)
            else:
                kind = LAND[c]
                if kind == 'grassland':
                    paste('t.l0.grassland1', x, y)
                else:
                    group = GROUP.get(kind, kind)
                    same = lambda nx, ny: at(nx, ny) in LAND and GROUP.get(LAND[at(nx, ny)], LAND[at(nx, ny)]) == group
                    paste(f't.l0.{kind}_{flags(x, y, same)}', x, y)
                    if kind == 'arctic':  # lód to osobna warstwa, łączy się z wodą i sąsiednią arktyką
                        paste(f't.l1.arctic_{flags(x, y, lambda nx, ny: water(nx, ny) or at(nx, ny) == "a")}', x, y)
                if river(x, y):
                    paste(f'road.river_s_{flags(x, y, lambda nx, ny: river(nx, ny) or water(nx, ny))}:0', x, y)
    for tag, x, y in specials:
        paste(tag, x, y)
    def square(color, x, y):
        dark = tuple(int(v * 0.55) for v in color)
        sq = Image.new('RGBA', (T, T), dark + (255,))
        sq.paste(color + (255,), (1, 1, T - 1, T - 1))
        img.alpha_composite(sq, (x * T, y * T))
    for tag, size, color, x, y in cities:
        square(color, x, y)
        paste(tag, x, y)
        paste(f'city.size_{size}', x, y)
    for tag, color, x, y in units:
        square(color, x, y)
        paste(tag, x, y)
    return img
