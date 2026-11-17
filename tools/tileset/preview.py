"""Arkusz poglądowy: zestaw trident z Freeciv (GPL-2.0+) wygładzony hq4x + lekkie zmiękczenie."""
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from tileset import Tileset, compose, T
from scalers import hq4x
import demo_map

def smooth(img):
    big = hq4x(img)
    return big.filter(ImageFilter.GaussianBlur(1.1)).filter(ImageFilter.UnsharpMask(radius=2, percent=70, threshold=3))

ts = Tileset(os.environ.get('FREECIV_DATA', '/tmp/freeciv/data'))
m = compose(ts, *demo_map.args())
m.save('map1x.png')
big = smooth(m)

CIV1_UNITS = ['settlers', 'warriors', 'phalanx', 'legion', 'musketeers', 'riflemen', 'horsemen', 'knights', 'catapult',
              'cannon', 'chariot', 'armor', 'mech_inf', 'artillery', 'fighter', 'bomber', 'trireme', 'caravel', 'frigate',
              'ironclad', 'cruiser', 'battleship', 'submarine', 'carrier', 'transport', 'nuclear', 'diplomat', 'caravan']
strip = Image.new('RGBA', (14 * T, 2 * T), (22, 27, 38, 255))
for i, name in enumerate(CIV1_UNITS):
    x, y = (i % 14) * T, (i // 14) * T
    sq = Image.new('RGBA', (T, T), (29, 53, 118, 255)); sq.paste((52, 96, 214, 255), (1, 1, T - 1, T - 1))
    strip.alpha_composite(sq, (x, y)); strip.alpha_composite(ts.get(f'u.{name}_Idle:0'), (x, y))
strip_big = smooth(strip)

box = (75, 75, 255, 165)
before = m.crop(box).resize((720, 360), Image.NEAREST).convert('RGB')
after = big.crop(tuple(v * 4 for v in box))

W, pad = big.width, 40
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 44)
small = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 30)
H = pad + 70 + big.height + 110 + 720 + 120 + strip_big.height + 90
sheet = Image.new('RGB', (W + 2 * pad, H), (22, 27, 38)); d = ImageDraw.Draw(sheet)
y = pad
d.text((pad, y), 'Map sample: Freeciv "trident" tileset, smoothed 4x', font=font, fill=(232, 236, 244)); y += 70
sheet.paste(big, (pad, y)); y += big.height + 40
d.text((pad, y), 'Before (original pixels) / after (smoothed)', font=font, fill=(232, 236, 244)); y += 70
half = (W - 40) // 2
sheet.paste(before.resize((half, half // 2), Image.NEAREST), (pad, y)); sheet.paste(after.resize((half, half // 2), Image.LANCZOS), (pad + half + 40, y)); y += half // 2 + 40
d.text((pad, y), 'All 28 unit types of the original game', font=font, fill=(232, 236, 244)); y += 70
sheet.paste(strip_big.resize((W, W * strip_big.height // strip_big.width), Image.LANCZOS), (pad, y)); y += W * strip_big.height // strip_big.width + 30
d.text((pad, y), 'Artwork: Freeciv project (Tatu Rissanen and others), GPL-2.0-or-later', font=small, fill=(150, 160, 178))
sheet = sheet.crop((0, 0, sheet.width, y + 60))
sheet.save('preview.png'); print(sheet.size)
sheet.resize((sheet.width // 2, sheet.height // 2), Image.LANCZOS).save('preview_half.png')
