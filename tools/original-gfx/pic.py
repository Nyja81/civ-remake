"""Dekoder plików .PIC oryginału (bloki E0/M0/X0/X1; LZW 9..n bitów + RLE ze znacznikiem 0x90)."""
import struct
from PIL import Image

def lzw(data, max_bits, start_bits=9):
    out = bytearray(); bits = start_bits; mask = (1 << bits) - 1
    table = [bytes([i]) for i in range(256)]; w = b'\0'
    acc = 0; n = 0; pos = 0
    while True:
        while n < bits and pos < len(data):
            acc |= data[pos] << n; n += 8; pos += 1
        if n < bits:
            break
        code = acc & mask; acc >>= bits; n -= bits
        if code < len(table):
            entry = table[code]
        elif code == len(table):
            entry = w + w[:1]
        else:
            entry = b''
        out += entry
        if entry:
            w += entry[:1]
        if len(table) >= mask:
            bits += 1; mask = (1 << bits) - 1
        if bits > max_bits:
            bits = start_bits; mask = (1 << bits) - 1
            table = [bytes([i]) for i in range(256)]; w = b'\0'
        else:
            if w:
                table.append(w)
            w = entry
    return bytes(out)

def rle(data):
    out = bytearray(); last = 0; i = 0
    while i < len(data):
        c = data[i]; i += 1
        if c == 0x90:
            if i >= len(data): break
            count = data[i]; i += 1
            if count == 0:
                last = 0x90; out.append(last)
            else:
                out += bytes([last]) * (count - 1)
        else:
            last = c; out.append(c)
    return bytes(out)

def load(path):
    """Zwraca (obraz w trybie P, czy_ma_palete_256)."""
    d = open(path, 'rb').read(); p = 0; palette = None; img = None
    while p + 4 <= len(d):
        sig, length = struct.unpack_from('<HH', d, p); block = d[p + 4:p + 4 + length]; p += 4 + length
        if sig == 0x304d:
            first, last = block[0], block[1]
            palette = [0] * 768
            for i in range(last - first + 1):
                for c in range(3):
                    palette[(first + i) * 3 + c] = (block[2 + i * 3 + c] & 0x3f) * 255 // 63
        elif sig in (0x3058, 0x3158) and (img is None or sig == 0x3058):
            w, h, max_bits = struct.unpack_from('<HHB', block, 0)
            raw = rle(lzw(block[5:], max_bits))
            if sig == 0x3158:
                px = bytearray()
                for b in raw: px += bytes([b & 15, b >> 4])
                raw = bytes(px)
            raw = raw[:w * h].ljust(w * h, b'\0')
            img = Image.frombytes('P', (w, h), raw)
    return img, palette
