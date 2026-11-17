/*
 * Nuked OPL3 — przeniesienie do TypeScriptu (emulator układu Yamaha YMF262/YM3812).
 *
 * Oryginał: Nuked OPL3 1.8, Copyright (C) 2013-2020 Nuke.YKT, https://github.com/nukeykt/Nuked-OPL3
 *
 * Nuked OPL3 is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as
 * published by the Free Software Foundation, either version 2.1
 * of the License, or (at your option) any later version.
 *
 * Nuked OPL3 is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with Nuked OPL3. If not, see <https://www.gnu.org/licenses/>.
 *
 * Ten plik (i tylko on) jest utworem zależnym od Nuked OPL3 i podlega licencji LGPL-2.1-or-later.
 * Przeniesienie zachowuje logikę 1:1 (bez rozszerzenia stereo; z opóźnieniem próbki kanałów jak w oryginale).
 * Wskaźniki C (mod, out[], trem) zastąpiono indeksami we wspólnej tablicy sygnałów.
 */

const RSM_FRAC = 10;
const WRITEBUF_SIZE = 1024;
const WRITEBUF_DELAY = 2;
/** Częstotliwość próbkowania układu: 14,31818 MHz / 288. */
export const OPL_RATE = 49716;

const CH_2OP = 0, CH_4OP = 1, CH_4OP2 = 2, CH_DRUM = 3;
const EGK_NORM = 0x01, EGK_DRUM = 0x02;
const EG_ATTACK = 0, EG_DECAY = 1, EG_SUSTAIN = 2, EG_RELEASE = 3;

const logsinrom = new Uint16Array([
  0x859, 0x6c3, 0x607, 0x58b, 0x52e, 0x4e4, 0x4a6, 0x471, 0x443, 0x41a, 0x3f5, 0x3d3, 0x3b5, 0x398, 0x37e, 0x365,
  0x34e, 0x339, 0x324, 0x311, 0x2ff, 0x2ed, 0x2dc, 0x2cd, 0x2bd, 0x2af, 0x2a0, 0x293, 0x286, 0x279, 0x26d, 0x261,
  0x256, 0x24b, 0x240, 0x236, 0x22c, 0x222, 0x218, 0x20f, 0x206, 0x1fd, 0x1f5, 0x1ec, 0x1e4, 0x1dc, 0x1d4, 0x1cd,
  0x1c5, 0x1be, 0x1b7, 0x1b0, 0x1a9, 0x1a2, 0x19b, 0x195, 0x18f, 0x188, 0x182, 0x17c, 0x177, 0x171, 0x16b, 0x166,
  0x160, 0x15b, 0x155, 0x150, 0x14b, 0x146, 0x141, 0x13c, 0x137, 0x133, 0x12e, 0x129, 0x125, 0x121, 0x11c, 0x118,
  0x114, 0x10f, 0x10b, 0x107, 0x103, 0x0ff, 0x0fb, 0x0f8, 0x0f4, 0x0f0, 0x0ec, 0x0e9, 0x0e5, 0x0e2, 0x0de, 0x0db,
  0x0d7, 0x0d4, 0x0d1, 0x0cd, 0x0ca, 0x0c7, 0x0c4, 0x0c1, 0x0be, 0x0bb, 0x0b8, 0x0b5, 0x0b2, 0x0af, 0x0ac, 0x0a9,
  0x0a7, 0x0a4, 0x0a1, 0x09f, 0x09c, 0x099, 0x097, 0x094, 0x092, 0x08f, 0x08d, 0x08a, 0x088, 0x086, 0x083, 0x081,
  0x07f, 0x07d, 0x07a, 0x078, 0x076, 0x074, 0x072, 0x070, 0x06e, 0x06c, 0x06a, 0x068, 0x066, 0x064, 0x062, 0x060,
  0x05e, 0x05c, 0x05b, 0x059, 0x057, 0x055, 0x053, 0x052, 0x050, 0x04e, 0x04d, 0x04b, 0x04a, 0x048, 0x046, 0x045,
  0x043, 0x042, 0x040, 0x03f, 0x03e, 0x03c, 0x03b, 0x039, 0x038, 0x037, 0x035, 0x034, 0x033, 0x031, 0x030, 0x02f,
  0x02e, 0x02d, 0x02b, 0x02a, 0x029, 0x028, 0x027, 0x026, 0x025, 0x024, 0x023, 0x022, 0x021, 0x020, 0x01f, 0x01e,
  0x01d, 0x01c, 0x01b, 0x01a, 0x019, 0x018, 0x017, 0x017, 0x016, 0x015, 0x014, 0x014, 0x013, 0x012, 0x011, 0x011,
  0x010, 0x00f, 0x00f, 0x00e, 0x00d, 0x00d, 0x00c, 0x00c, 0x00b, 0x00a, 0x00a, 0x009, 0x009, 0x008, 0x008, 0x007,
  0x007, 0x007, 0x006, 0x006, 0x005, 0x005, 0x005, 0x004, 0x004, 0x004, 0x003, 0x003, 0x003, 0x002, 0x002, 0x002,
  0x002, 0x001, 0x001, 0x001, 0x001, 0x001, 0x001, 0x001, 0x000, 0x000, 0x000, 0x000, 0x000, 0x000, 0x000, 0x000,
]);

const exprom = new Uint16Array([
  0x7fa, 0x7f5, 0x7ef, 0x7ea, 0x7e4, 0x7df, 0x7da, 0x7d4, 0x7cf, 0x7c9, 0x7c4, 0x7bf, 0x7b9, 0x7b4, 0x7ae, 0x7a9,
  0x7a4, 0x79f, 0x799, 0x794, 0x78f, 0x78a, 0x784, 0x77f, 0x77a, 0x775, 0x770, 0x76a, 0x765, 0x760, 0x75b, 0x756,
  0x751, 0x74c, 0x747, 0x742, 0x73d, 0x738, 0x733, 0x72e, 0x729, 0x724, 0x71f, 0x71a, 0x715, 0x710, 0x70b, 0x706,
  0x702, 0x6fd, 0x6f8, 0x6f3, 0x6ee, 0x6e9, 0x6e5, 0x6e0, 0x6db, 0x6d6, 0x6d2, 0x6cd, 0x6c8, 0x6c4, 0x6bf, 0x6ba,
  0x6b5, 0x6b1, 0x6ac, 0x6a8, 0x6a3, 0x69e, 0x69a, 0x695, 0x691, 0x68c, 0x688, 0x683, 0x67f, 0x67a, 0x676, 0x671,
  0x66d, 0x668, 0x664, 0x65f, 0x65b, 0x657, 0x652, 0x64e, 0x649, 0x645, 0x641, 0x63c, 0x638, 0x634, 0x630, 0x62b,
  0x627, 0x623, 0x61e, 0x61a, 0x616, 0x612, 0x60e, 0x609, 0x605, 0x601, 0x5fd, 0x5f9, 0x5f5, 0x5f0, 0x5ec, 0x5e8,
  0x5e4, 0x5e0, 0x5dc, 0x5d8, 0x5d4, 0x5d0, 0x5cc, 0x5c8, 0x5c4, 0x5c0, 0x5bc, 0x5b8, 0x5b4, 0x5b0, 0x5ac, 0x5a8,
  0x5a4, 0x5a0, 0x59c, 0x599, 0x595, 0x591, 0x58d, 0x589, 0x585, 0x581, 0x57e, 0x57a, 0x576, 0x572, 0x56f, 0x56b,
  0x567, 0x563, 0x560, 0x55c, 0x558, 0x554, 0x551, 0x54d, 0x549, 0x546, 0x542, 0x53e, 0x53b, 0x537, 0x534, 0x530,
  0x52c, 0x529, 0x525, 0x522, 0x51e, 0x51b, 0x517, 0x514, 0x510, 0x50c, 0x509, 0x506, 0x502, 0x4ff, 0x4fb, 0x4f8,
  0x4f4, 0x4f1, 0x4ed, 0x4ea, 0x4e7, 0x4e3, 0x4e0, 0x4dc, 0x4d9, 0x4d6, 0x4d2, 0x4cf, 0x4cc, 0x4c8, 0x4c5, 0x4c2,
  0x4be, 0x4bb, 0x4b8, 0x4b5, 0x4b1, 0x4ae, 0x4ab, 0x4a8, 0x4a4, 0x4a1, 0x49e, 0x49b, 0x498, 0x494, 0x491, 0x48e,
  0x48b, 0x488, 0x485, 0x482, 0x47e, 0x47b, 0x478, 0x475, 0x472, 0x46f, 0x46c, 0x469, 0x466, 0x463, 0x460, 0x45d,
  0x45a, 0x457, 0x454, 0x451, 0x44e, 0x44b, 0x448, 0x445, 0x442, 0x43f, 0x43c, 0x439, 0x436, 0x433, 0x430, 0x42d,
  0x42a, 0x428, 0x425, 0x422, 0x41f, 0x41c, 0x419, 0x416, 0x414, 0x411, 0x40e, 0x40b, 0x408, 0x406, 0x403, 0x400,
]);

/** Mnożniki częstotliwości ×2: 1/2, 1, 2, 3, … 15. */
const mt = [1, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 20, 24, 24, 30, 30];
const kslrom = [0, 32, 40, 45, 48, 51, 53, 55, 56, 58, 59, 60, 61, 62, 63, 64];
const kslshift = [8, 1, 2, 0];
const eg_incstep = [[0, 0, 0, 0], [1, 0, 0, 0], [1, 0, 1, 0], [1, 1, 1, 0]];
const ad_slot = [
  0, 1, 2, 3, 4, 5, -1, -1, 6, 7, 8, 9, 10, 11, -1, -1,
  12, 13, 14, 15, 16, 17, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
];
const ch_slot = [0, 1, 2, 6, 7, 8, 12, 13, 14, 18, 19, 20, 24, 25, 26, 30, 31, 32];

/** Indeks „zera” (zeromod) we wspólnej tablicy sygnałów. */
const ZERO = 72;
const sigOut = (slot: number) => slot * 2;
const sigFb = (slot: number) => slot * 2 + 1;

const i16 = (v: number) => (v << 16) >> 16;

function envelopeCalcExp(level: number): number {
  if (level > 0x1fff) level = 0x1fff;
  return (exprom[level & 0xff]! << 1) >> (level >> 8);
}

function envelopeSin(wf: number, phase: number, envelope: number): number {
  let out = 0;
  let neg = 0;
  phase &= 0x3ff;
  switch (wf) {
    case 0:
      if (phase & 0x200) neg = 0xffff;
      out = (phase & 0x100) ? logsinrom[(phase & 0xff) ^ 0xff]! : logsinrom[phase & 0xff]!;
      break;
    case 1:
      if (phase & 0x200) out = 0x1000;
      else out = (phase & 0x100) ? logsinrom[(phase & 0xff) ^ 0xff]! : logsinrom[phase & 0xff]!;
      break;
    case 2:
      out = (phase & 0x100) ? logsinrom[(phase & 0xff) ^ 0xff]! : logsinrom[phase & 0xff]!;
      break;
    case 3:
      out = (phase & 0x100) ? 0x1000 : logsinrom[phase & 0xff]!;
      break;
    case 4:
      if ((phase & 0x300) === 0x100) neg = 0xffff;
      if (phase & 0x200) out = 0x1000;
      else if (phase & 0x80) out = logsinrom[((phase ^ 0xff) << 1) & 0xff]!;
      else out = logsinrom[(phase << 1) & 0xff]!;
      break;
    case 5:
      if (phase & 0x200) out = 0x1000;
      else if (phase & 0x80) out = logsinrom[((phase ^ 0xff) << 1) & 0xff]!;
      else out = logsinrom[(phase << 1) & 0xff]!;
      break;
    case 6:
      if (phase & 0x200) neg = 0xffff;
      return i16(envelopeCalcExp(envelope << 3) ^ neg);
    default: // 7
      if (phase & 0x200) {
        neg = 0xffff;
        phase = (phase & 0x1ff) ^ 0x1ff;
      }
      out = (phase << 3) & 0xffff;
      break;
  }
  return i16(envelopeCalcExp(out + (envelope << 3)) ^ neg);
}

class Slot {
  channel!: Channel;
  out = 0;
  fbmod = 0;
  /** Indeks źródła modulacji w tablicy sygnałów. */
  mod = ZERO;
  prout = 0;
  eg_rout = 0x1ff;
  eg_out = 0x1ff;
  eg_gen = EG_RELEASE;
  eg_ksl = 0;
  tremOn = false;
  reg_vib = 0;
  reg_type = 0;
  reg_ksr = 0;
  reg_mult = 0;
  reg_ksl = 0;
  reg_tl = 0;
  reg_ar = 0;
  reg_dr = 0;
  reg_sl = 0;
  reg_rr = 0;
  reg_wf = 0;
  key = 0;
  pg_reset = 0;
  pg_phase = 0;
  pg_phase_out = 0;
  constructor(readonly slot_num: number) {}
}

class Channel {
  slotz: [Slot, Slot];
  pair: Channel | null = null;
  /** Indeksy wyjść w tablicy sygnałów. */
  out = [ZERO, ZERO, ZERO, ZERO];
  chtype = CH_2OP;
  f_num = 0;
  f_num_reg = 0;
  block = 0;
  block_reg = 0;
  fb = 0;
  con = 0;
  alg = 0;
  ksv = 0;
  cha = 0xffff;
  chb = 0xffff;
  chc = 0;
  chd = 0;
  constructor(readonly ch_num: number, a: Slot, b: Slot) {
    this.slotz = [a, b];
  }
}

export class Opl3 {
  private readonly channel: Channel[] = [];
  private readonly slot: Slot[] = [];
  /** Wyjścia i sprzężenia operatorów (out, fbmod) + zero na końcu. */
  private readonly sig = new Int16Array(ZERO + 1);
  private timer = 0;
  /** 36-bitowy licznik obwiedni (liczba, nie operacje bitowe). */
  private eg_timer = 0;
  private eg_timerrem = 0;
  private eg_state = 0;
  private eg_add = 0;
  private eg_timer_lo = 0;
  private newm = 0;
  private nts = 0;
  private rhy = 0;
  private vibpos = 0;
  private vibshift = 1;
  private tremolo = 0;
  private tremolopos = 0;
  private tremoloshift = 4;
  private noise = 1;
  private readonly mixbuff = [0, 0, 0, 0];
  private rm_hh_bit2 = 0;
  private rm_hh_bit3 = 0;
  private rm_hh_bit7 = 0;
  private rm_hh_bit8 = 0;
  private rm_tc_bit3 = 0;
  private rm_tc_bit5 = 0;
  private rateratio: number;
  private samplecnt = 0;
  private readonly oldsamples = [0, 0, 0, 0];
  private readonly samples = [0, 0, 0, 0];
  private writebuf_samplecnt = 0;
  private writebuf_cur = 0;
  private writebuf_last = 0;
  private writebuf_lasttime = 0;
  private readonly wbTime = new Float64Array(WRITEBUF_SIZE);
  private readonly wbReg = new Uint16Array(WRITEBUF_SIZE);
  private readonly wbData = new Uint8Array(WRITEBUF_SIZE);
  private readonly buf4 = [0, 0, 0, 0];

  /** OPL3_Reset. */
  constructor(samplerate = OPL_RATE) {
    for (let n = 0; n < 36; n++) this.slot.push(new Slot(n));
    for (let n = 0; n < 18; n++) {
      const s = ch_slot[n]!;
      const ch = new Channel(n, this.slot[s]!, this.slot[s + 3]!);
      this.slot[s]!.channel = ch;
      this.slot[s + 3]!.channel = ch;
      this.channel.push(ch);
    }
    for (let n = 0; n < 18; n++) {
      const ch = this.channel[n]!;
      if (n % 9 < 3) ch.pair = this.channel[n + 3]!;
      else if (n % 9 < 6) ch.pair = this.channel[n - 3]!;
      this.setupAlg(ch);
    }
    this.rateratio = Math.floor((samplerate * (1 << RSM_FRAC)) / OPL_RATE);
  }

  // ------------------------------------------------------------ obwiednia

  private updateKSL(slot: Slot): void {
    let ksl = (kslrom[slot.channel.f_num >> 6]! << 2) - ((0x08 - slot.channel.block) << 5);
    if (ksl < 0) ksl = 0;
    slot.eg_ksl = ksl & 0xff;
  }

  private envelopeCalc(slot: Slot): void {
    let reg_rate = 0;
    let reset = 0;
    slot.eg_out = (slot.eg_rout + (slot.reg_tl << 2) + (slot.eg_ksl >> kslshift[slot.reg_ksl]!) + (slot.tremOn ? this.tremolo : 0)) & 0xffff;
    if (slot.key && slot.eg_gen === EG_RELEASE) {
      reset = 1;
      reg_rate = slot.reg_ar;
    } else {
      switch (slot.eg_gen) {
        case EG_ATTACK: reg_rate = slot.reg_ar; break;
        case EG_DECAY: reg_rate = slot.reg_dr; break;
        case EG_SUSTAIN: if (!slot.reg_type) reg_rate = slot.reg_rr; break;
        case EG_RELEASE: reg_rate = slot.reg_rr; break;
      }
    }
    slot.pg_reset = reset;
    const ks = slot.channel.ksv >> ((slot.reg_ksr ^ 1) << 1);
    const nonzero = reg_rate !== 0;
    const rate = ks + (reg_rate << 2);
    let rate_hi = rate >> 2;
    const rate_lo = rate & 0x03;
    if (rate_hi & 0x10) rate_hi = 0x0f;
    const eg_shift = rate_hi + this.eg_add;
    let shift = 0;
    if (nonzero) {
      if (rate_hi < 12) {
        if (this.eg_state) {
          switch (eg_shift) {
            case 12: shift = 1; break;
            case 13: shift = (rate_lo >> 1) & 0x01; break;
            case 14: shift = rate_lo & 0x01; break;
          }
        }
      } else {
        shift = ((rate_hi & 0x03) + eg_incstep[rate_lo]![this.eg_timer_lo]!) & 0xff;
        if (shift & 0x04) shift = 0x03;
        if (!shift) shift = this.eg_state;
      }
    }
    let eg_rout = slot.eg_rout;
    let eg_inc = 0;
    let eg_off = 0;
    if (reset && rate_hi === 0x0f) eg_rout = 0x00;
    if ((slot.eg_rout & 0x1f8) === 0x1f8) eg_off = 1;
    if (slot.eg_gen !== EG_ATTACK && !reset && eg_off) eg_rout = 0x1ff;
    switch (slot.eg_gen) {
      case EG_ATTACK:
        if (!slot.eg_rout) slot.eg_gen = EG_DECAY;
        else if (slot.key && shift > 0 && rate_hi !== 0x0f) eg_inc = i16(~slot.eg_rout >> (4 - shift));
        break;
      case EG_DECAY:
        if ((slot.eg_rout >> 4) === slot.reg_sl) slot.eg_gen = EG_SUSTAIN;
        else if (!eg_off && !reset && shift > 0) eg_inc = 1 << (shift - 1);
        break;
      case EG_SUSTAIN:
      case EG_RELEASE:
        if (!eg_off && !reset && shift > 0) eg_inc = 1 << (shift - 1);
        break;
    }
    slot.eg_rout = (eg_rout + eg_inc) & 0x1ff;
    if (reset) slot.eg_gen = EG_ATTACK;
    if (!slot.key) slot.eg_gen = EG_RELEASE;
  }

  // ------------------------------------------------------------ faza

  private phaseGenerate(slot: Slot): void {
    let f_num = slot.channel.f_num;
    if (slot.reg_vib) {
      let range = (f_num >> 7) & 7;
      const vibpos = this.vibpos;
      if (!(vibpos & 3)) range = 0;
      else if (vibpos & 1) range >>= 1;
      range >>= this.vibshift;
      if (vibpos & 4) range = -range;
      f_num = (f_num + range) & 0xffff;
    }
    const basefreq = ((f_num << slot.channel.block) >>> 1) >>> 0;
    const phase = (slot.pg_phase >>> 9) & 0xffff;
    if (slot.pg_reset) slot.pg_phase = 0;
    slot.pg_phase = (slot.pg_phase + ((basefreq * mt[slot.reg_mult]!) >>> 1)) >>> 0;
    const noise = this.noise;
    slot.pg_phase_out = phase;
    if (slot.slot_num === 13) {
      this.rm_hh_bit2 = (phase >> 2) & 1;
      this.rm_hh_bit3 = (phase >> 3) & 1;
      this.rm_hh_bit7 = (phase >> 7) & 1;
      this.rm_hh_bit8 = (phase >> 8) & 1;
    }
    if (slot.slot_num === 17 && (this.rhy & 0x20)) {
      this.rm_tc_bit3 = (phase >> 3) & 1;
      this.rm_tc_bit5 = (phase >> 5) & 1;
    }
    if (this.rhy & 0x20) {
      const rm_xor = (this.rm_hh_bit2 ^ this.rm_hh_bit7) | (this.rm_hh_bit3 ^ this.rm_tc_bit5) | (this.rm_tc_bit3 ^ this.rm_tc_bit5);
      switch (slot.slot_num) {
        case 13:
          slot.pg_phase_out = rm_xor << 9;
          slot.pg_phase_out |= (rm_xor ^ (noise & 1)) ? 0xd0 : 0x34;
          break;
        case 16:
          slot.pg_phase_out = (this.rm_hh_bit8 << 9) | ((this.rm_hh_bit8 ^ (noise & 1)) << 8);
          break;
        case 17:
          slot.pg_phase_out = (rm_xor << 9) | 0x80;
          break;
      }
    }
    const n_bit = ((noise >> 14) ^ noise) & 0x01;
    this.noise = (noise >>> 1) | (n_bit << 22);
  }

  // ------------------------------------------------------------ rejestry operatorów

  private slotWrite20(slot: Slot, data: number): void {
    slot.tremOn = ((data >> 7) & 0x01) !== 0;
    slot.reg_vib = (data >> 6) & 0x01;
    slot.reg_type = (data >> 5) & 0x01;
    slot.reg_ksr = (data >> 4) & 0x01;
    slot.reg_mult = data & 0x0f;
  }
  private slotWrite40(slot: Slot, data: number): void {
    slot.reg_ksl = (data >> 6) & 0x03;
    slot.reg_tl = data & 0x3f;
    this.updateKSL(slot);
  }
  private slotWrite60(slot: Slot, data: number): void {
    slot.reg_ar = (data >> 4) & 0x0f;
    slot.reg_dr = data & 0x0f;
  }
  private slotWrite80(slot: Slot, data: number): void {
    slot.reg_sl = (data >> 4) & 0x0f;
    if (slot.reg_sl === 0x0f) slot.reg_sl = 0x1f;
    slot.reg_rr = data & 0x0f;
  }
  private slotWriteE0(slot: Slot, data: number): void {
    slot.reg_wf = data & 0x07;
    if (this.newm === 0x00) slot.reg_wf &= 0x03;
  }

  private processSlot(slot: Slot): void {
    const sig = this.sig;
    const n = slot.slot_num;
    // OPL3_SlotCalcFB
    const ch = slot.channel;
    if (ch.fb !== 0x00) sig[sigFb(n)] = (slot.prout + slot.out) >> (0x09 - ch.fb);
    else sig[sigFb(n)] = 0;
    slot.fbmod = sig[sigFb(n)]!;
    slot.prout = slot.out;
    this.envelopeCalc(slot);
    this.phaseGenerate(slot);
    // OPL3_SlotGenerate
    slot.out = envelopeSin(slot.reg_wf, (slot.pg_phase_out + sig[slot.mod]!) & 0xffff, slot.eg_out);
    sig[sigOut(n)] = slot.out;
  }

  // ------------------------------------------------------------ kanały

  private updateRhythm(data: number): void {
    this.rhy = data & 0x3f;
    const c6 = this.channel[6]!, c7 = this.channel[7]!, c8 = this.channel[8]!;
    if (this.rhy & 0x20) {
      c6.out = [sigOut(c6.slotz[1].slot_num), sigOut(c6.slotz[1].slot_num), ZERO, ZERO];
      c7.out = [sigOut(c7.slotz[0].slot_num), sigOut(c7.slotz[0].slot_num), sigOut(c7.slotz[1].slot_num), sigOut(c7.slotz[1].slot_num)];
      c8.out = [sigOut(c8.slotz[0].slot_num), sigOut(c8.slotz[0].slot_num), sigOut(c8.slotz[1].slot_num), sigOut(c8.slotz[1].slot_num)];
      for (let n = 6; n < 9; n++) this.channel[n]!.chtype = CH_DRUM;
      this.setupAlg(c6);
      this.setupAlg(c7);
      this.setupAlg(c8);
      const key = (slot: Slot, on: boolean) => { if (on) slot.key |= EGK_DRUM; else slot.key &= ~EGK_DRUM; };
      key(c7.slotz[0], (this.rhy & 0x01) !== 0); // hh
      key(c8.slotz[1], (this.rhy & 0x02) !== 0); // tc
      key(c8.slotz[0], (this.rhy & 0x04) !== 0); // tom
      key(c7.slotz[1], (this.rhy & 0x08) !== 0); // sd
      key(c6.slotz[0], (this.rhy & 0x10) !== 0); // bd
      key(c6.slotz[1], (this.rhy & 0x10) !== 0);
    } else {
      for (let n = 6; n < 9; n++) {
        const ch = this.channel[n]!;
        ch.chtype = CH_2OP;
        this.setupAlg(ch);
        ch.slotz[0].key &= ~EGK_DRUM;
        ch.slotz[1].key &= ~EGK_DRUM;
      }
    }
  }

  private updateFrequency(ch: Channel): void {
    ch.ksv = (ch.block << 1) | ((ch.f_num >> (0x09 - this.nts)) & 0x01);
    this.updateKSL(ch.slotz[0]);
    this.updateKSL(ch.slotz[1]);
  }
  private restoreFrequency(ch: Channel): void {
    ch.f_num = ch.f_num_reg;
    ch.block = ch.block_reg;
    this.updateFrequency(ch);
  }
  private sync4Op(ch: Channel): void {
    const p = ch.pair!;
    p.f_num = ch.f_num;
    p.block = ch.block;
    this.updateFrequency(p);
  }
  private writeA0(ch: Channel, data: number): void {
    ch.f_num_reg = (ch.f_num_reg & 0x300) | data;
    if (ch.chtype === CH_4OP2) return;
    this.restoreFrequency(ch);
    if (ch.chtype === CH_4OP) this.sync4Op(ch);
  }
  private writeB0(ch: Channel, data: number): void {
    ch.f_num_reg = (ch.f_num_reg & 0xff) | ((data & 0x03) << 8);
    ch.block_reg = (data >> 2) & 0x07;
    if (ch.chtype === CH_4OP2) return;
    this.restoreFrequency(ch);
    if (ch.chtype === CH_4OP) this.sync4Op(ch);
  }

  private setupAlg(ch: Channel): void {
    const s0 = ch.slotz[0], s1 = ch.slotz[1];
    const o = (s: Slot) => sigOut(s.slot_num);
    const fb = (s: Slot) => sigFb(s.slot_num);
    if (ch.chtype === CH_DRUM) {
      if (ch.ch_num === 7 || ch.ch_num === 8) {
        s0.mod = ZERO;
        s1.mod = ZERO;
        return;
      }
      if ((ch.alg & 0x01) === 0) { s0.mod = fb(s0); s1.mod = o(s0); }
      else { s0.mod = fb(s0); s1.mod = ZERO; }
      return;
    }
    if (ch.alg & 0x08) return;
    if (ch.alg & 0x04) {
      const p = ch.pair!;
      const p0 = p.slotz[0], p1 = p.slotz[1];
      p.out = [ZERO, ZERO, ZERO, ZERO];
      switch (ch.alg & 0x03) {
        case 0x00:
          p0.mod = fb(p0); p1.mod = o(p0); s0.mod = o(p1); s1.mod = o(s0);
          ch.out = [o(s1), ZERO, ZERO, ZERO];
          break;
        case 0x01:
          p0.mod = fb(p0); p1.mod = o(p0); s0.mod = ZERO; s1.mod = o(s0);
          ch.out = [o(p1), o(s1), ZERO, ZERO];
          break;
        case 0x02:
          p0.mod = fb(p0); p1.mod = ZERO; s0.mod = o(p1); s1.mod = o(s0);
          ch.out = [o(p0), o(s1), ZERO, ZERO];
          break;
        case 0x03:
          p0.mod = fb(p0); p1.mod = ZERO; s0.mod = o(p1); s1.mod = ZERO;
          ch.out = [o(p0), o(s0), o(s1), ZERO];
          break;
      }
    } else if ((ch.alg & 0x01) === 0) {
      s0.mod = fb(s0); s1.mod = o(s0);
      ch.out = [o(s1), ZERO, ZERO, ZERO];
    } else {
      s0.mod = fb(s0); s1.mod = ZERO;
      ch.out = [o(s0), o(s1), ZERO, ZERO];
    }
  }

  private updateAlg(ch: Channel): void {
    ch.alg = ch.con;
    if (ch.chtype === CH_4OP) {
      const p = ch.pair!;
      p.alg = 0x04 | (ch.con << 1) | p.con;
      ch.alg = 0x08;
      this.setupAlg(p);
    } else if (ch.chtype === CH_4OP2) {
      ch.alg = 0x04 | (ch.pair!.con << 1) | ch.con;
      ch.pair!.alg = 0x08;
      this.setupAlg(ch);
    } else {
      this.setupAlg(ch);
    }
  }

  private writeC0(ch: Channel, data: number): void {
    ch.fb = (data & 0x0e) >> 1;
    ch.con = data & 0x01;
    this.updateAlg(ch);
    if (this.newm) {
      ch.cha = ((data >> 4) & 0x01) ? 0xffff : 0;
      ch.chb = ((data >> 5) & 0x01) ? 0xffff : 0;
      ch.chc = ((data >> 6) & 0x01) ? 0xffff : 0;
      ch.chd = ((data >> 7) & 0x01) ? 0xffff : 0;
    } else {
      ch.cha = ch.chb = 0xffff;
      ch.chc = ch.chd = 0;
    }
  }

  private keyOn(ch: Channel): void {
    if (ch.chtype === CH_4OP) {
      ch.slotz[0].key |= EGK_NORM; ch.slotz[1].key |= EGK_NORM;
      ch.pair!.slotz[0].key |= EGK_NORM; ch.pair!.slotz[1].key |= EGK_NORM;
    } else if (ch.chtype === CH_2OP || ch.chtype === CH_DRUM) {
      ch.slotz[0].key |= EGK_NORM; ch.slotz[1].key |= EGK_NORM;
    }
  }
  private keyOff(ch: Channel): void {
    if (ch.chtype === CH_4OP) {
      ch.slotz[0].key &= ~EGK_NORM; ch.slotz[1].key &= ~EGK_NORM;
      ch.pair!.slotz[0].key &= ~EGK_NORM; ch.pair!.slotz[1].key &= ~EGK_NORM;
    } else if (ch.chtype === CH_2OP || ch.chtype === CH_DRUM) {
      ch.slotz[0].key &= ~EGK_NORM; ch.slotz[1].key &= ~EGK_NORM;
    }
  }

  private set4Op(data: number): void {
    for (let bit = 0; bit < 6; bit++) {
      let chnum = bit;
      if (bit >= 3) chnum += 9 - 3;
      const ch = this.channel[chnum]!, ch3 = this.channel[chnum + 3]!;
      if ((data >> bit) & 0x01) {
        ch.chtype = CH_4OP;
        ch3.chtype = CH_4OP2;
        this.sync4Op(ch);
        this.updateAlg(ch);
      } else {
        ch.chtype = CH_2OP;
        ch3.chtype = CH_2OP;
        this.restoreFrequency(ch3);
        this.updateAlg(ch);
        this.updateAlg(ch3);
      }
    }
  }

  // ------------------------------------------------------------ generowanie

  /** OPL3_Generate4Ch — jedna próbka układu (49 716 Hz); wynik w buf4 (lewy, prawy, …). */
  private generate4Ch(buf4: number[]): void {
    const clip = (v: number) => (v > 32767 ? 32767 : v < -32768 ? -32768 : v);
    const sig = this.sig;
    buf4[1] = clip(this.mixbuff[1]!);
    buf4[3] = clip(this.mixbuff[3]!);
    for (let ii = 0; ii < 15; ii++) this.processSlot(this.slot[ii]!);
    let mix0 = 0, mix1 = 0;
    for (let ii = 0; ii < 18; ii++) {
      const ch = this.channel[ii]!;
      const out = ch.out;
      const accm = i16(sig[out[0]!]! + sig[out[1]!]! + sig[out[2]!]! + sig[out[3]!]!);
      mix0 += i16(accm & ch.cha);
      mix1 += i16(accm & ch.chc);
    }
    this.mixbuff[0] = mix0;
    this.mixbuff[2] = mix1;
    for (let ii = 15; ii < 18; ii++) this.processSlot(this.slot[ii]!);
    buf4[0] = clip(this.mixbuff[0]!);
    buf4[2] = clip(this.mixbuff[2]!);
    for (let ii = 18; ii < 33; ii++) this.processSlot(this.slot[ii]!);
    mix0 = 0; mix1 = 0;
    for (let ii = 0; ii < 18; ii++) {
      const ch = this.channel[ii]!;
      const out = ch.out;
      const accm = i16(sig[out[0]!]! + sig[out[1]!]! + sig[out[2]!]! + sig[out[3]!]!);
      mix0 += i16(accm & ch.chb);
      mix1 += i16(accm & ch.chd);
    }
    this.mixbuff[1] = mix0;
    this.mixbuff[3] = mix1;
    for (let ii = 33; ii < 36; ii++) this.processSlot(this.slot[ii]!);

    if ((this.timer & 0x3f) === 0x3f) this.tremolopos = (this.tremolopos + 1) % 210;
    if (this.tremolopos < 105) this.tremolo = this.tremolopos >> this.tremoloshift;
    else this.tremolo = (210 - this.tremolopos) >> this.tremoloshift;
    if ((this.timer & 0x3ff) === 0x3ff) this.vibpos = (this.vibpos + 1) & 7;
    this.timer = (this.timer + 1) & 0xffff;

    if (this.eg_state) {
      let shift = 0;
      const low = this.eg_timer % 8192;
      while (shift < 13 && ((low >> shift) & 1) === 0) shift++;
      this.eg_add = shift > 12 ? 0 : shift + 1;
      this.eg_timer_lo = this.eg_timer % 4;
    }
    if (this.eg_timerrem || this.eg_state) {
      if (this.eg_timer === 0xfffffffff) {
        this.eg_timer = 0;
        this.eg_timerrem = 1;
      } else {
        this.eg_timer++;
        this.eg_timerrem = 0;
      }
    }
    this.eg_state ^= 1;

    for (;;) {
      const cur = this.writebuf_cur;
      if (this.wbTime[cur]! > this.writebuf_samplecnt || !(this.wbReg[cur]! & 0x200)) break;
      this.wbReg[cur] = this.wbReg[cur]! & 0x1ff;
      this.writeReg(this.wbReg[cur]!, this.wbData[cur]!);
      this.writebuf_cur = (cur + 1) % WRITEBUF_SIZE;
    }
    this.writebuf_samplecnt++;
  }

  /** OPL3_Generate4ChResampled — próbka w częstotliwości podanej w konstruktorze (interpolacja liniowa). */
  generateResampled(out: number[]): void {
    while (this.samplecnt >= this.rateratio) {
      for (let i = 0; i < 4; i++) this.oldsamples[i] = this.samples[i]!;
      this.generate4Ch(this.samples);
      this.samplecnt -= this.rateratio;
    }
    const rr = this.rateratio, sc = this.samplecnt;
    for (let i = 0; i < 2; i++) {
      out[i] = Math.trunc((this.oldsamples[i]! * (rr - sc) + this.samples[i]! * sc) / rr);
    }
    this.samplecnt += 1 << RSM_FRAC;
  }

  /** OPL3_Generate — próbka bez zmiany częstotliwości (49 716 Hz). */
  generate(out: number[]): void {
    this.generate4Ch(this.buf4);
    out[0] = this.buf4[0]!;
    out[1] = this.buf4[1]!;
  }

  /** OPL3_WriteReg — zapis rejestru od razu. */
  writeReg(reg: number, v: number): void {
    const high = (reg >> 8) & 0x01;
    const regm = reg & 0xff;
    switch (regm & 0xf0) {
      case 0x00:
        if (high) {
          switch (regm & 0x0f) {
            case 0x04: this.set4Op(v); break;
            case 0x05: this.newm = v & 0x01; break;
          }
        } else if ((regm & 0x0f) === 0x08) {
          this.nts = (v >> 6) & 0x01;
        }
        break;
      case 0x20: case 0x30: {
        const s = ad_slot[regm & 0x1f]!;
        if (s >= 0) this.slotWrite20(this.slot[18 * high + s]!, v);
        break;
      }
      case 0x40: case 0x50: {
        const s = ad_slot[regm & 0x1f]!;
        if (s >= 0) this.slotWrite40(this.slot[18 * high + s]!, v);
        break;
      }
      case 0x60: case 0x70: {
        const s = ad_slot[regm & 0x1f]!;
        if (s >= 0) this.slotWrite60(this.slot[18 * high + s]!, v);
        break;
      }
      case 0x80: case 0x90: {
        const s = ad_slot[regm & 0x1f]!;
        if (s >= 0) this.slotWrite80(this.slot[18 * high + s]!, v);
        break;
      }
      case 0xe0: case 0xf0: {
        const s = ad_slot[regm & 0x1f]!;
        if (s >= 0) this.slotWriteE0(this.slot[18 * high + s]!, v);
        break;
      }
      case 0xa0:
        if ((regm & 0x0f) < 9) this.writeA0(this.channel[9 * high + (regm & 0x0f)]!, v);
        break;
      case 0xb0:
        if (regm === 0xbd && !high) {
          this.tremoloshift = (((v >> 7) ^ 1) << 1) + 2;
          this.vibshift = ((v >> 6) & 0x01) ^ 1;
          this.updateRhythm(v);
        } else if ((regm & 0x0f) < 9) {
          const ch = this.channel[9 * high + (regm & 0x0f)]!;
          this.writeB0(ch, v);
          if (v & 0x20) this.keyOn(ch);
          else this.keyOff(ch);
        }
        break;
      case 0xc0:
        if ((regm & 0x0f) < 9) this.writeC0(this.channel[9 * high + (regm & 0x0f)]!, v);
        break;
    }
  }

  /** OPL3_WriteRegBuffered — zapis z opóźnieniem 2 próbek na zapis (jak przy prawdziwej szynie ISA). */
  writeRegBuffered(reg: number, v: number): void {
    const last = this.writebuf_last;
    if (this.wbReg[last]! & 0x200) {
      this.writeReg(this.wbReg[last]! & 0x1ff, this.wbData[last]!);
      this.writebuf_cur = (last + 1) % WRITEBUF_SIZE;
      this.writebuf_samplecnt = this.wbTime[last]!;
    }
    this.wbReg[last] = reg | 0x200;
    this.wbData[last] = v;
    let time1 = this.writebuf_lasttime + WRITEBUF_DELAY;
    const time2 = this.writebuf_samplecnt;
    if (time1 < time2) time1 = time2;
    this.wbTime[last] = time1;
    this.writebuf_lasttime = time1;
    this.writebuf_last = (last + 1) % WRITEBUF_SIZE;
  }
}
