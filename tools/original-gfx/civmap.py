"""
Rysowanie mapy z oryginalnych arkuszy (TER257/SP257/SP299.PIC) według reguł oryginału
(kolejność warstw i maski sąsiadów odtworzone za funkcją DrawCell z OpenCivOne, MIT).
Pracuje na indeksach palety, żeby działała podmiana kolorów graczy.
"""
import struct
import numpy as np
import pic

DIRS = [(0, 0), (0, -1), (1, -1), (1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0), (-1, -1)]
DESERT, PLAINS, GRASS, FOREST, HILLS, MOUNTAINS, TUNDRA, ARCTIC, SWAMP, JUNGLE, WATER, RIVER = range(12)
PLAYER_COLOR = [12, 15, 10, 9, 14, 11, 13, 7]
PLAYER_DARK = [4, 7, 2, 1, 10, 3, 4, 8]

class Original:
    def __init__(self, folder):
        load = lambda n: pic.load(f'{folder}/{n}')
        ter, _ = load('TER257.PIC'); sp, self.palette = load('SP257.PIC'); sp299, _ = load('SP299.PIC')
        self.ter, self.sp, self.sp299 = (np.array(i) for i in (ter, sp, sp299))
        self.font = open(f'{folder}/FONTS.CV', 'rb').read()

    def cut(self, sheet, x, y, w=16, h=16):
        return sheet[y:y + h, x:x + w].copy()

    def unit(self, kind, player):
        row = self.sp[160:192].copy()
        color, dark = PLAYER_COLOR[player], PLAYER_DARK[player]
        if color == 15: row[row == 15] = 11
        if color == 7: row[row == 7] = 3
        ten, two = row == 10, row == 2
        row[ten] = color; row[two] = dark
        x, y = (kind % 20) * 16 + 1, (kind // 20) * 16 + 1
        return row[y:y + 15, x:x + 15]

    def glyph(self, font_id, ch):
        d = self.font; p = struct.unpack_from('<H', d, 2 + font_id * 2)[0]
        first, last, bpc, height = d[p - 8], d[p - 7], d[p - 6], d[p - 4]
        rng = last - first; width = d[p - 9 - rng + (ord(ch) - first)]
        row_size = (rng + 1) << (bpc - 1)
        g = np.zeros((height, width), bool)
        for r in range(height):
            bits = int.from_bytes(d[p + r * row_size + (ord(ch) - first) * bpc:][:bpc], 'big')
            for c in range(width):
                g[r, c] = (bits >> (bpc * 8 - 1 - c)) & 1
        return g

def blit(canvas, x, y, bmp, transparent=True):
    h, w = bmp.shape
    x0, y0 = max(x, 0), max(y, 0); x1, y1 = min(x + w, canvas.shape[1]), min(y + h, canvas.shape[0])
    if x1 <= x0 or y1 <= y0: return
    src = bmp[y0 - y:y1 - y, x0 - x:x1 - x]; dst = canvas[y0:y1, x0:x1]
    if transparent: dst[src != 0] = src[src != 0]
    else: dst[:] = src

def rect(canvas, x, y, w, h, color):
    canvas[y, x:x + w + 1] = color; canvas[y + h, x:x + w + 1] = color
    canvas[y:y + h + 1, x] = color; canvas[y:y + h + 1, x + w] = color

def render(o, terrain, specials=(), cities=(), units=(), origin=(10, 10)):
    """terrain[y][x] = typ terenu; cities: (x, y, gracz, rozmiar); units: (x, y, gracz, typ)."""
    H, W = len(terrain), len(terrain[0])
    canvas = np.zeros((H * 16, W * 16), np.uint8)
    inside = lambda x, y: 0 <= x < W and 0 <= y < H
    at = lambda x, y: terrain[y][x] if inside(x, y) else WATER
    occupied = {(x, y) for x, y, *_ in units}
    for y in range(H):
        for x in range(W):
            t = at(x, y); sx, sy = x * 16, y * 16
            if t == WATER:
                mask = 0
                for i in range(1, 9):
                    mask >>= 1
                    dx, dy = DIRS[i]
                    if inside(x + dx, y + dy) and at(x + dx, y + dy) != WATER: mask |= 0x80
                bm = ((mask >> 6) & 3) + (mask << 2)
                for i in range(4):
                    v = (bm >> (i * 2)) & 7
                    if i < 2: blit(canvas, sx + (i & 1) * 8, sy, o.cut(o.ter, v * 16 + (i & 1) * 8, 176, 8, 8), False)
                    else: blit(canvas, sx - (i & 1) * 8 + 8, sy + 8, o.cut(o.ter, v * 16 - (i & 1) * 8 + 8, 184, 8, 8), False)
                special = {0x1c: 224, 0xc1: 240, 0x07: 256, 0x70: 272, 0x8f: 288, 0xf8: 304}.get(mask)
                if special: blit(canvas, sx, sy, o.cut(o.sp299, special, 100), False)
                for i in range(1, 9, 2):
                    dx, dy = DIRS[i]
                    if at(x + dx, y + dy) == RIVER: blit(canvas, sx, sy, o.cut(o.ter, ((i - 1) // 2) * 16 + 128, 176))
                continue
            blit(canvas, sx, sy, o.cut(o.sp299, 256, 120), False)  # tło: trawa
            mask = 0
            for i in range(1, 9, 2):
                mask >>= 1
                dx, dy = DIRS[i]; n = at(x + dx, y + dy)
                if (n in (WATER, RIVER)) if t == RIVER else (inside(x + dx, y + dy) and n == t): mask |= 8
            if t == RIVER:
                if mask: blit(canvas, sx, sy, o.cut(o.sp, mask * 16, 64))
            else:
                blit(canvas, sx, sy, o.cut(o.ter, (mask if t < 6 else 0) * 16, t * 16))
                wx, wy = x + origin[0], y + origin[1]
                if t == GRASS and ((7 * wx + 11 * wy) & 2) == 0: blit(canvas, sx + 4, sy + 4, o.cut(o.sp, 153, 41, 7, 7))
    for x, y in specials:
        blit(canvas, x * 16, y * 16, o.cut(o.sp, at(x, y) * 16 + 1, 113, 15, 15))
    for x, y, player, size in cities:
        sx, sy = x * 16, y * 16; color, dark = PLAYER_COLOR[player], PLAYER_DARK[player]
        rect(canvas, sx + 1, sy + 1, 13, 13, 15); rect(canvas, sx + 2, sy + 1, 12, 12, dark)
        canvas[sy + 2:sy + 14, sx + 2:sx + 14] = color
        blit(canvas, sx + 1, sy + 1, o.cut(o.sp, 12 * 16 + 1, 113, 15, 15))
        area = canvas[sy + 2:sy + 14, sx + 2:sx + 14]; area[area == 5] = dark
        tx = sx + (6 if size < 10 else 3)
        for ch in str(size):
            g = o.glyph(1, ch); gh, gw = g.shape
            region = canvas[sy + 5:sy + 5 + gh, tx:tx + gw]; region[g] = 5  # czarny
            tx += gw + 1
        if (x, y) in occupied: rect(canvas, sx, sy, 15, 15, 5)
    for x, y, player, kind in units:
        if any((x, y) == (cx, cy) for cx, cy, *_ in cities): continue
        blit(canvas, x * 16, y * 16, o.unit(kind, player))
    return canvas

def to_image(o, canvas):
    from PIL import Image
    img = Image.fromarray(canvas, 'P'); img.putpalette(o.palette)
    return img.convert('RGB')
