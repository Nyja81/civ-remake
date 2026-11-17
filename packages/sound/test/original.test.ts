/**
 * Sterowniki dźwięku z kopii gry (CIV1_DIR) na emulatorze 8086 — pliki oryginału nie trafiają do repozytorium.
 * Wartości porównawcze zmierzono w DOSBoxie 0.74 (oryginał 474.01, VGA, AdLib przy sbtype=sb2, nagranie rejestrów
 * karty .DRO i dźwięku .WAV): utwór 3 (napisy) zaczyna się dźwiękami 291, 388 i 582 Hz, kolejne wciśnięcia klawisza
 * kanału 1 po 398 i 797 ms; na głośniku PC te same nuty o oktawę niżej (143, 191, 285 Hz).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SoundPlayer } from '../src/player';
import { zeroCrossingHz } from './synthetic';

const dir = process.env.CIV1_DIR ?? '';
const has = (name: string) => !!dir && existsSync(dir) && readdirSync(dir).some((n) => n.toUpperCase() === name);
const read = (name: string) => {
  const real = readdirSync(dir).find((n) => n.toUpperCase() === name)!;
  return new Uint8Array(readFileSync(join(dir, real)));
};

/** Wciśnięcia klawisza (B0–B8 z bitem 0x20) z czasem w ms i częstotliwością z rejestrów A0/B0. */
function keyOns(p: SoundPlayer, seconds: number): Array<{ ms: number; channel: number; hz: number }> {
  const dev = p.adlib!;
  const regs = new Uint8Array(256);
  const out: Array<{ ms: number; channel: number; hz: number }> = [];
  const write = dev.write.bind(dev);
  dev.write = (r: number, v: number) => {
    if (r >= 0xb0 && r <= 0xb8 && v & 0x20 && !(regs[r]! & 0x20)) {
      const ch = r - 0xb0;
      const fnum = regs[0xa0 + ch]! | ((v & 3) << 8);
      out.push({ ms: p.time * 1000, channel: ch, hz: (fnum * 49716) / 2 ** (20 - ((v >> 2) & 7)) });
    }
    regs[r] = v;
    write(r, v);
  };
  const buf = new Float32Array(1024);
  for (let i = 0; i < (seconds * p.sampleRate) / buf.length; i++) p.render(buf);
  dev.write = write;
  return out;
}

describe.skipIf(!has('ASOUND.CVL'))('ASOUND.CVL (AdLib) z kopii gry', () => {
  it('inicjalizacja wykrywa kartę, utwór 3 jak w DOSBoxie (nuty i czasy)', () => {
    const p = new SoundPlayer(read('ASOUND.CVL'), { card: 'adlib', sampleRate: 49716 });
    p.play(3);
    const notes = keyOns(p, 1.2).filter((n) => n.channel === 1);
    expect(notes.slice(0, 3).map((n) => Math.round(n.hz))).toEqual([291, 388, 582]);
    const t0 = notes[0]!.ms;
    expect(Math.abs(notes[1]!.ms - t0 - 398)).toBeLessThan(17);
    expect(Math.abs(notes[2]!.ms - t0 - 797)).toBeLessThan(17);
  });

  it('wszystkie 45 utworów działają na emulatorze; numer > 44 jest pomijany', () => {
    for (let tune = 0; tune <= 46; tune++) {
      const p = new SoundPlayer(read('ASOUND.CVL'), { card: 'adlib', sampleRate: 22050 });
      const before = p.adlib!.writes;
      p.play(tune, 3);
      const buf = new Float32Array(22050);
      expect(() => p.render(buf)).not.toThrow();
      if (tune > 44) expect(p.adlib!.writes).toBe(before);
    }
  });

  it('hymn (utwór 5) gra dźwięk i licznik taktów rośnie ok. 60 razy na sekundę', () => {
    const p = new SoundPlayer(read('ASOUND.CVL'), { card: 'adlib', sampleRate: 22050 });
    p.play(5, 3);
    const buf = new Float32Array(22050 * 3);
    p.render(buf);
    expect(Math.max(...buf)).toBeGreaterThan(0.02);
    expect(Math.abs(p.counter() - 180)).toBeLessThanOrEqual(3);
  });

  it('karta wykryta przy inicjalizacji (zegar T1) — sterownik pisze do 0x388', () => {
    const p = new SoundPlayer(read('ASOUND.CVL'), { card: 'adlib', sampleRate: 49716 });
    expect(p.driver.call(0)).toBe(0); // 0x41 = brak karty
    p.play(3);
    keyOns(p, 0.2);
    expect(p.adlib!.writes).toBeGreaterThan(50);
  });
});

describe.skipIf(!has('ISOUND.CVL'))('ISOUND.CVL (głośnik PC) z kopii gry', () => {
  it('utwór 3: te same nuty o oktawę niżej', () => {
    const rate = 48000;
    const p = new SoundPlayer(read('ISOUND.CVL'), { card: 'speaker', sampleRate: rate });
    p.play(3);
    const buf = new Float32Array(rate);
    p.render(buf);
    const at = (s: number) => zeroCrossingHz(buf.subarray(Math.round(s * rate), Math.round((s + 0.1) * rate)), rate);
    expect(at(0.1)).toBeCloseTo(143, -1);
    expect(at(0.5)).toBeCloseTo(191, -1);
    expect(at(0.9)).toBeCloseTo(285, -1);
  });

  it('wszystkie utwory działają na emulatorze', () => {
    for (let tune = 0; tune <= 44; tune++) {
      const p = new SoundPlayer(read('ISOUND.CVL'), { card: 'speaker', sampleRate: 11025 });
      p.play(tune, 3);
      expect(() => p.render(new Float32Array(11025))).not.toThrow();
    }
  });
});
