import { describe, expect, it } from 'vitest';
import { encodePicPixels } from '@civ-remake/engine';
import { decodePic } from '../src/pic';

describe('plik .MAP z silnika (encodePicPixels)', () => {
  it('dekoder obrazów .PIC odczytuje te same piksele', () => {
    const pixels = new Uint8Array(320 * 200);
    let seed = 99;
    for (let i = 0; i < pixels.length; i++) {
      seed = (seed * 214013 + 2531011) & 0x7fffffff;
      pixels[i] = i < 20000 ? (seed >> 16) & 0xff : i < 40000 ? (i >> 6) & 0x0f : 0x90;
    }
    const image = decodePic(encodePicPixels(320, 200, pixels));
    expect(image.width).toBe(320);
    expect(image.height).toBe(200);
    expect(image.palette).toBeNull();
    expect(Array.from(image.pixels)).toEqual(Array.from(pixels));
  });
});
