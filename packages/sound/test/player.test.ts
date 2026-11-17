import { describe, expect, it } from 'vitest';
import { CvlDriver, DRIVER_ENTRY, parseCvl } from '../src/cvlDriver';
import { AdLibDevice, PcSpeakerDevice } from '../src/devices';
import { Opl3, OPL_RATE } from '../src/opl3';
import { SoundPlayer, VGA_REFRESH_HZ } from '../src/player';
import { SYNTH_NOTE, SYNTH_NOTE_HZ, syntheticDriver, zeroCrossingHz } from './synthetic';

describe('sterownik .CVL', () => {
  it('nagłówek: nazwa i 11 punktów wejścia', () => {
    const info = parseCvl(syntheticDriver());
    expect(info.name).toBe('TEST Synth 00-00');
    expect(info.entries).toHaveLength(11);
    expect(info.entries[DRIVER_ENTRY.play]).toBe(0x80);
  });

  it('punkty wejścia: PlayTune zapisuje rejestry karty, licznik taktów', () => {
    const adlib = new AdLibDevice(OPL_RATE);
    adlib.log = [];
    const d = new CvlDriver(syntheticDriver(), adlib);
    expect(d.call(DRIVER_ENTRY.init)).toBe(0);
    d.call(DRIVER_ENTRY.play, [7, 3]);
    expect(adlib.log).toEqual(SYNTH_NOTE);
    expect(d.cpu.rb(0x1000, 0x200)).toBe(7);
    d.call(DRIVER_ENTRY.tick);
    d.call(DRIVER_ENTRY.tick);
    expect(d.call(DRIVER_ENTRY.counter)).toBe(2);
  });
});

describe('emulator OPL (Nuked OPL3 w trybie OPL2)', () => {
  it('sinus 437,7 Hz po zapisie rejestrów, cisza bez dźwięku', () => {
    const chip = new Opl3(OPL_RATE);
    const buf = [0, 0];
    let peak = 0;
    for (let i = 0; i < 2000; i++) { chip.generate(buf); peak = Math.max(peak, Math.abs(buf[0]!)); }
    expect(peak).toBe(0);
    for (const [r, v] of SYNTH_NOTE) chip.writeReg(r, v);
    const out = new Float32Array(OPL_RATE / 2);
    for (let i = 0; i < out.length; i++) { chip.generate(buf); out[i] = buf[0]!; }
    expect(Math.max(...out)).toBeGreaterThan(1000);
    expect(zeroCrossingHz(out.subarray(4000), OPL_RATE)).toBeCloseTo(SYNTH_NOTE_HZ, 0);
  });

  it('YM3812: bez bitu WSE (rejestr 0x01) kształt fali zawsze sinus', () => {
    const render = (wse: boolean) => {
      const dev = new AdLibDevice(OPL_RATE);
      if (wse) dev.write(0x01, 0x20);
      dev.write(0xe3, 0x01); // półsinus na nośnej
      for (const [r, v] of SYNTH_NOTE) dev.write(r, v);
      const buf = [0, 0];
      let min = 0;
      for (let i = 0; i < 20000; i++) { dev.chip.generateResampled(buf); min = Math.min(min, buf[0]!); }
      return min;
    };
    expect(render(false)).toBeLessThan(-1000); // sinus: wartości ujemne
    expect(render(true)).toBeGreaterThanOrEqual(-2); // półsinus: bez ujemnych
  });

  it('wykrywanie karty: zegar T1 ustawia bity 0xC0 statusu po 80 µs', () => {
    const dev = new AdLibDevice(OPL_RATE);
    dev.portOut(0x388, 4); dev.portOut(0x389, 0x60);
    dev.portOut(0x388, 4); dev.portOut(0x389, 0x80);
    expect(dev.portIn(0x388)! & 0xe0).toBe(0);
    dev.portOut(0x388, 2); dev.portOut(0x389, 0xff);
    dev.portOut(0x388, 4); dev.portOut(0x389, 0x21);
    for (let i = 0; i < 200; i++) dev.portIn(0x388);
    expect(dev.portIn(0x388)! & 0xe0).toBe(0xc0);
  });
});

describe('odtwarzacz', () => {
  it('takt sekwencera 6 z 7 klatek VGA (≈60 Hz), szybki zegar 4 przerwania na klatkę', () => {
    const rate = 48000;
    const p = new SoundPlayer(syntheticDriver(), { card: 'adlib', sampleRate: rate });
    const buf = new Float32Array(rate * 2);
    p.render(buf);
    const expected = 2 * VGA_REFRESH_HZ * 6 / 7;
    expect(Math.abs(p.sequencerTicks - expected)).toBeLessThanOrEqual(2);
    const fast = p.driver.cpu.rw(0x1000, 0x204);
    expect(Math.abs(fast - 2 * VGA_REFRESH_HZ * 4)).toBeLessThanOrEqual(8);
  });

  it('PlayTune przed następną próbką: dźwięk z karty i licznik od zera', () => {
    const rate = 44100;
    const p = new SoundPlayer(syntheticDriver(), { card: 'adlib', sampleRate: rate });
    const silent = new Float32Array(rate / 2);
    p.render(silent);
    expect(silent.every((v) => v === 0)).toBe(true);
    p.play(12, 3);
    const buf = new Float32Array(rate);
    p.render(buf);
    expect(p.driver.cpu.rb(0x1000, 0x200)).toBe(12);
    expect(Math.max(...buf)).toBeGreaterThan(0.05);
    expect(zeroCrossingHz(buf.subarray(rate / 10), rate)).toBeCloseTo(SYNTH_NOTE_HZ, 0);
    const c = p.counter();
    expect(c).toBeGreaterThan(55);
    expect(c).toBeLessThan(65);
  });

  it('głośnik PC: fala prostokątna z dzielnika kanału 2', () => {
    const rate = 48000;
    const spk = new PcSpeakerDevice(rate);
    spk.portOut(0x43, 0xb6);
    spk.portOut(0x42, 0xa9); spk.portOut(0x42, 0x0a); // 2729 → 437,2 Hz
    spk.portOut(0x61, 0x03);
    const out = new Float32Array(rate / 2);
    for (let i = 0; i < out.length; i++) out[i] = spk.sample();
    expect(zeroCrossingHz(out, rate)).toBeCloseTo(1193182 / 0x0aa9, 0);
    spk.portOut(0x61, 0x00);
    for (let i = 0; i < 100; i++) spk.sample();
    expect(Math.abs(spk.sample())).toBeLessThan(1e-6);
  });
});
