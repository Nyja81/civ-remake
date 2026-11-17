import sys, types
import numpy as np
from PIL import Image, ImageFilter

def scale2x(img):
    """EPX/Scale2x na obrazie RGBA."""
    a = np.asarray(img.convert('RGBA')).copy()
    p = a.view(np.uint32).reshape(a.shape[0], a.shape[1])
    pad = np.pad(p, 1, mode='edge')
    A, B, C, D = pad[:-2, 1:-1], pad[1:-1, 2:], pad[1:-1, :-2], pad[2:, 1:-1]  # góra, prawo, lewo, dół
    out = np.empty((p.shape[0] * 2, p.shape[1] * 2), np.uint32)
    ok = (C != B) & (A != D)
    out[0::2, 0::2] = np.where(ok & (C == A), A, p)
    out[0::2, 1::2] = np.where(ok & (A == B), B, p)
    out[1::2, 0::2] = np.where(ok & (D == C), C, p)
    out[1::2, 1::2] = np.where(ok & (B == D), D, p)
    return Image.fromarray(out.view(np.uint8).reshape(out.shape[0], out.shape[1], 4), 'RGBA')

def hq4x(img):
    if 'PIL.PyAccess' not in sys.modules:
        m = types.ModuleType('PIL.PyAccess'); m.PyAccess = object; sys.modules['PIL.PyAccess'] = m
    import hqx
    return hqx.hq4x(img.convert('RGB'))

def lanczos4(img):
    big = img.convert('RGB').resize((img.width * 4, img.height * 4), Image.LANCZOS)
    return big.filter(ImageFilter.UnsharpMask(radius=2, percent=60, threshold=2))
