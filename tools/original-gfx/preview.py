"""Arkusz poglądowy: oryginalne grafiki z kopii gry użytkownika, wygładzone 4x (hq4x + lekkie zmiękczenie)."""
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from civmap import Original, render, to_image, blit
from scalers import hq4x
import demo_map

def smooth(img):
    return hq4x(img).filter(ImageFilter.GaussianBlur(1.0)).filter(ImageFilter.UnsharpMask(radius=2, percent=80, threshold=3))

o = Original(sys.argv[1]); out = sys.argv[2]
m = to_image(o, render(o, *demo_map.args()))
big = smooth(m)

strip = np.zeros((2 * 18 + 2, 14 * 18 + 2), np.uint8)
for i in range(28):
    blit(strip, 2 + (i % 14) * 18, 2 + (i // 14) * 18, o.unit(i, 3), False)
strip_big = smooth(to_image(o, strip))

box = (32, 32, 144, 112)
before = m.crop(box); after = big.crop(tuple(v * 4 for v in box))
W, pad = big.width, 24
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 26)
half = (W - 16) // 2; hh = half * before.height // before.width
sh = W * strip_big.height // strip_big.width
H = pad + 44 + big.height + 24 + 44 + hh + 24 + 44 + sh + pad
sheet = Image.new('RGB', (W + 2 * pad, H), (22, 27, 38)); d = ImageDraw.Draw(sheet); y = pad
def title(t):
    global y
    d.text((pad, y), t, font=font, fill=(232, 236, 244)); y += 44
title('Original graphics, smoothed 4x'); sheet.paste(big, (pad, y)); y += big.height + 24
title('Before (original pixels) / after')
sheet.paste(before.resize((half, hh), Image.NEAREST), (pad, y)); sheet.paste(after.resize((half, hh), Image.LANCZOS), (pad + half + 16, y)); y += hh + 24
title('All 28 units'); sheet.paste(strip_big.resize((W, sh), Image.LANCZOS), (pad, y))
sheet.save(out); print(sheet.size)
