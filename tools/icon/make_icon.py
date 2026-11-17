"""Ikona aplikacji (własny rysunek, bez elementów oryginału): pikselowy glob w złotym wieńcu laurowym na granatowym tle.
Uruchomienie: python3 tools/icon/make_icon.py  -> apps/desktop/assets/icon.png (1024 px) i icon.icns (wymaga Pillow)."""
import math, os, random
from PIL import Image, ImageDraw, ImageFilter

S = 1024
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'apps', 'desktop', 'assets')

def squircle_mask(size, margin, radius):
    m = Image.new('L', (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle([margin, margin, size - margin, size - margin], radius=radius, fill=255)
    return m

def background():
    img = Image.new('RGBA', (S, S))
    top, bottom = (24, 44, 92), (8, 16, 40)
    px = img.load()
    for y in range(S):
        t = y / (S - 1)
        c = tuple(int(top[i] * (1 - t) + bottom[i] * t) for i in range(3))
        for x in range(S):
            px[x, y] = c + (255,)
    # delikatna poświata za globem
    glow = Image.new('L', (S, S), 0)
    ImageDraw.Draw(glow).ellipse([212, 182, 812, 782], fill=110)
    glow = glow.filter(ImageFilter.GaussianBlur(90))
    img = Image.composite(Image.new('RGBA', (S, S), (70, 140, 220, 255)), img, glow)
    return img

def pixel_globe(n=28, seed=1991):
    """Glob n×n „pikseli”: ocean w dwóch odcieniach, lądy z prostego szumu, oświetlenie z lewej góry."""
    rnd = random.Random(seed)
    # szum wartości na siatce
    grid = [[rnd.random() for _ in range(n + 1)] for _ in range(n + 1)]
    def noise(x, y):
        return grid[int(y) % n][int(x) % n]
    land = [[False] * n for _ in range(n)]
    for y in range(n):
        for x in range(n):
            v = 0
            for k, w in ((4, 0.6), (2, 0.3), (1, 0.1)):
                v += noise(x / k + k * 3, y / k + k * 5) * w
            land[y][x] = v > 0.56
    # wygładzenie (automat komórkowy)
    for _ in range(2):
        new = [[False] * n for _ in range(n)]
        for y in range(n):
            for x in range(n):
                c = sum(land[(y + dy) % n][(x + dx) % n] for dy in (-1, 0, 1) for dx in (-1, 0, 1))
                new[y][x] = c >= 5
        land = new
    img = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    px = img.load()
    r = n / 2 - 0.5
    for y in range(n):
        for x in range(n):
            dx, dy = x - r, y - r
            d = math.hypot(dx, dy) / (r + 0.5)
            if d > 1:
                continue
            light = 1.0 - 0.45 * max(0.0, (dx + dy) / (2 * r)) - 0.25 * d * d
            if y < 1 + (x * 5 + 3) % 3 or y > n - 2 - (x * 7 + 1) % 3:
                base = (225, 232, 240)
            elif land[y][x]:
                base = (70, 160, 60) if (x * 7 + y * 3) % 5 else (120, 170, 70)
            else:
                base = (40, 90, 200) if (x + y) % 2 else (46, 100, 212)
            px[x, y] = tuple(max(0, min(255, int(c * light))) for c in base) + (255,)
    return img

def leaf(draw, x, y, ang, length, width, fill):
    pts = []
    for t in range(32):
        u = t / 31 * 2 * math.pi
        # liść zaostrzony na obu końcach
        ex = length / 2 * math.cos(u)
        ey = width / 2 * math.sin(u) * abs(math.sin(u)) ** 0.3
        pts.append((x + ex * math.cos(ang) - ey * math.sin(ang), y + ex * math.sin(ang) + ey * math.cos(ang)))
    draw.polygon(pts, fill=fill)

def laurel(draw, cx, cy, radius, side):
    """Gałąź laurowa: łodyga po łuku i parami liście skierowane wzdłuż łodygi, na zewnątrz i do środka."""
    gold, dark, stem = (238, 192, 78, 255), (176, 128, 40, 255), (190, 140, 50, 255)
    start, end, steps = 100, 245, 9
    angles = [math.radians(start + (end - start) * i / (steps - 1)) for i in range(steps)]
    if side > 0:
        angles = [math.pi - a for a in angles]
    pts = [(cx + radius * math.cos(a), cy + radius * math.sin(a)) for a in angles]
    draw.line(pts, fill=stem, width=14, joint='curve')
    for i, (a, (x, y)) in enumerate(zip(angles, pts)):
        tangent = a + (math.pi / 2 if side < 0 else -math.pi / 2)
        size = 1.0 - 0.35 * i / (steps - 1)
        for out in (1, -1):
            ang = tangent + out * math.radians(38) * (1 if side < 0 else -1)
            lx = x + out * 34 * size * math.cos(a) + 26 * size * math.cos(tangent)
            ly = y + out * 34 * size * math.sin(a) + 26 * size * math.sin(tangent)
            leaf(draw, lx + 4, ly + 5, ang, 92 * size, 38 * size, dark)
            leaf(draw, lx, ly, ang, 92 * size, 38 * size, gold)
    # liść na czubku gałęzi
    a = angles[-1]
    tangent = a + (math.pi / 2 if side < 0 else -math.pi / 2)
    leaf(draw, pts[-1][0] + 30 * math.cos(tangent), pts[-1][1] + 30 * math.sin(tangent), tangent, 70, 30, gold)

def main():
    os.makedirs(OUT, exist_ok=True)
    img = background()
    d = ImageDraw.Draw(img)
    laurel(d, S / 2, S / 2 + 10, 350, -1)
    laurel(d, S / 2, S / 2 + 10, 350, 1)
    globe = pixel_globe().resize((560, 560), Image.NEAREST)
    shadow = Image.new('L', (S, S), 0)
    ImageDraw.Draw(shadow).ellipse([242, 262, 802, 822], fill=140)
    shadow = shadow.filter(ImageFilter.GaussianBlur(24))
    img = Image.composite(Image.new('RGBA', (S, S), (0, 0, 0, 255)), img, shadow)
    img.alpha_composite(globe, (232, 222))
    # złota wstęga u dołu wieńca
    d = ImageDraw.Draw(img)
    d.polygon([(430, 842), (594, 842), (640, 902), (512, 872), (384, 902)], fill=(176, 128, 40, 255))
    d.polygon([(430, 836), (594, 836), (632, 890), (512, 862), (392, 890)], fill=(226, 176, 66, 255))
    mask = squircle_mask(S, 40, 200)
    out = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    out.save(os.path.join(OUT, 'icon.png'))
    out.save(os.path.join(OUT, 'icon.icns'), sizes=[(16, 16), (32, 32), (64, 64), (128, 128), (256, 256), (512, 512), (1024, 1024)])
    print('ok')

main()
