/**
 * Mały interpreter procesora 8086 (tryb rzeczywisty, 1 MB pamięci) — wystarczający do wykonania kodu
 * sterowników dźwięku oryginału (pliki .CVL), które gra ładuje do pamięci i woła przez tablicę skoków.
 *
 * Zakres: pełna lista rozkazów 8086 i najczęstsze rozszerzenia 80186 (PUSH imm, IMUL imm, przesunięcia
 * o imm8, PUSHA/POPA, ENTER/LEAVE). Rozkazy koprocesora (ESC) są pomijane. Porty wejścia–wyjścia
 * i przerwania programowe obsługuje gospodarz (`CpuIo`). Rozkaz nieznany przerywa wykonanie wyjątkiem —
 * testy na prawdziwych sterownikach wychwycą brakujący rozkaz.
 */

export interface CpuIo {
  /** Odczyt z portu (rozmiar 1 albo 2 bajty). */
  portIn(port: number, size: 1 | 2): number;
  /** Zapis do portu. */
  portOut(port: number, value: number, size: 1 | 2): void;
  /** Przerwanie programowe INT n; zwraca true, gdy obsłużył je gospodarz (wtedy tablica wektorów jest pomijana). */
  interrupt(n: number, cpu: Cpu8086): boolean;
}

// Indeksy rejestrów 16-bitowych (kolejność kodowania w ModR/M).
export const AX = 0, CX = 1, DX = 2, BX = 3, SP = 4, BP = 5, SI = 6, DI = 7;
// Indeksy rejestrów segmentowych.
export const ES = 0, CS = 1, SS = 2, DS = 3;

// Bity rejestru znaczników.
const CF = 0x0001, PF = 0x0004, AF = 0x0010, ZF = 0x0040, SF = 0x0080, TF = 0x0100, IF = 0x0200, DF = 0x0400, OF = 0x0800;

const PARITY = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  let b = i, p = 1;
  while (b) { p ^= b & 1; b >>= 1; }
  PARITY[i] = p ? PF : 0;
}

/** Adres powrotu używany przez `callFar` — rozkaz HLT pod 0000:0500 kończy wywołanie. */
const RETURN_SEG = 0x0000;
const RETURN_OFF = 0x0500;

export class CpuError extends Error {}

export class Cpu8086 {
  readonly mem = new Uint8Array(0x100000);
  /** Rejestry 16-bitowe AX, CX, DX, BX, SP, BP, SI, DI. */
  readonly r = new Uint16Array(8);
  /** Rejestry segmentowe ES, CS, SS, DS. */
  readonly s = new Uint16Array(4);
  ip = 0;
  flags = 0x0202;
  halted = false;
  /** Licznik wykonanych rozkazów (do ochrony przed zapętleniem). */
  instructions = 0;

  // Stan dekodowania bieżącego rozkazu.
  private segOverride = -1;
  private eaIsReg = false;
  private eaReg = 0;
  private eaSeg = 0;
  private eaOff = 0;
  private modReg = 0;

  constructor(readonly io: CpuIo) {
    this.mem[RETURN_SEG * 16 + RETURN_OFF] = 0xf4; // HLT
  }

  // ---------------------------------------------------------------- pamięć

  rb(seg: number, off: number): number {
    return this.mem[((seg << 4) + (off & 0xffff)) & 0xfffff]!;
  }
  rw(seg: number, off: number): number {
    return this.rb(seg, off) | (this.rb(seg, off + 1) << 8);
  }
  wb(seg: number, off: number, v: number): void {
    this.mem[((seg << 4) + (off & 0xffff)) & 0xfffff] = v;
  }
  ww(seg: number, off: number, v: number): void {
    this.wb(seg, off, v & 0xff);
    this.wb(seg, off + 1, (v >> 8) & 0xff);
  }

  // ---------------------------------------------------------------- rejestry 8-bitowe

  /** Rejestr 8-bitowy wg kodowania: 0–3 = AL, CL, DL, BL; 4–7 = AH, CH, DH, BH. */
  r8(i: number): number {
    return i < 4 ? this.r[i]! & 0xff : this.r[i - 4]! >> 8;
  }
  setR8(i: number, v: number): void {
    if (i < 4) this.r[i] = (this.r[i]! & 0xff00) | (v & 0xff);
    else this.r[i - 4] = (this.r[i - 4]! & 0x00ff) | ((v & 0xff) << 8);
  }

  // ---------------------------------------------------------------- stos

  push(v: number): void {
    this.r[SP] = this.r[SP]! - 2;
    this.ww(this.s[SS]!, this.r[SP]!, v);
  }
  pop(): number {
    const v = this.rw(this.s[SS]!, this.r[SP]!);
    this.r[SP] = this.r[SP]! + 2;
    return v;
  }

  // ---------------------------------------------------------------- wywołania z zewnątrz

  /**
   * Wywołanie dalekie procedury (konwencja C: argumenty na stosie, pierwszy na wierzchu, sprząta wołający).
   * Zwraca AX po powrocie. `maxInstructions` chroni przed zapętleniem.
   */
  callFar(seg: number, off: number, args: readonly number[] = [], maxInstructions = 5_000_000): number {
    const sp0 = this.r[SP]!;
    for (let i = args.length - 1; i >= 0; i--) this.push(args[i]! & 0xffff);
    this.push(RETURN_SEG);
    this.push(RETURN_OFF);
    this.s[CS] = seg;
    this.ip = off & 0xffff;
    this.halted = false;
    const limit = this.instructions + maxInstructions;
    while (!(this.s[CS] === RETURN_SEG && this.ip === RETURN_OFF)) {
      if (this.instructions >= limit) throw new CpuError(`Przekroczono limit rozkazów w ${hex(seg)}:${hex(off)}`);
      this.step();
    }
    this.r[SP] = sp0;
    return this.r[AX]!;
  }

  // ---------------------------------------------------------------- pobieranie rozkazu

  private fetch8(): number {
    const v = this.rb(this.s[CS]!, this.ip);
    this.ip = (this.ip + 1) & 0xffff;
    return v;
  }
  private fetch16(): number {
    const v = this.rw(this.s[CS]!, this.ip);
    this.ip = (this.ip + 2) & 0xffff;
    return v;
  }
  private fetchS8(): number {
    return (this.fetch8() << 24) >> 24;
  }

  private defSeg(seg: number): number {
    return this.segOverride >= 0 ? this.segOverride : seg;
  }

  /** Dekodowanie bajtu ModR/M: pole reg w `modReg`, operand r/m w eaIsReg/eaReg albo eaSeg:eaOff. */
  private modrm(): void {
    const b = this.fetch8();
    const mod = b >> 6, rm = b & 7;
    this.modReg = (b >> 3) & 7;
    if (mod === 3) {
      this.eaIsReg = true;
      this.eaReg = rm;
      return;
    }
    this.eaIsReg = false;
    const r = this.r;
    let off = 0;
    let seg = DS;
    switch (rm) {
      case 0: off = r[BX]! + r[SI]!; break;
      case 1: off = r[BX]! + r[DI]!; break;
      case 2: off = r[BP]! + r[SI]!; seg = SS; break;
      case 3: off = r[BP]! + r[DI]!; seg = SS; break;
      case 4: off = r[SI]!; break;
      case 5: off = r[DI]!; break;
      case 6:
        if (mod === 0) off = this.fetch16();
        else { off = r[BP]!; seg = SS; }
        break;
      case 7: off = r[BX]!; break;
    }
    if (mod === 1) off += this.fetchS8();
    else if (mod === 2) off += this.fetch16();
    this.eaOff = off & 0xffff;
    this.eaSeg = this.s[this.defSeg(seg)]!;
  }

  private getEA8(): number {
    return this.eaIsReg ? this.r8(this.eaReg) : this.rb(this.eaSeg, this.eaOff);
  }
  private setEA8(v: number): void {
    if (this.eaIsReg) this.setR8(this.eaReg, v);
    else this.wb(this.eaSeg, this.eaOff, v & 0xff);
  }
  private getEA16(): number {
    return this.eaIsReg ? this.r[this.eaReg]! : this.rw(this.eaSeg, this.eaOff);
  }
  private setEA16(v: number): void {
    if (this.eaIsReg) this.r[this.eaReg] = v;
    else this.ww(this.eaSeg, this.eaOff, v & 0xffff);
  }

  // ---------------------------------------------------------------- arytmetyka i znaczniki

  private setSZP(v: number, w: boolean): void {
    let f = this.flags & ~(SF | ZF | PF);
    const mask = w ? 0xffff : 0xff;
    v &= mask;
    if (v === 0) f |= ZF;
    if (v & (w ? 0x8000 : 0x80)) f |= SF;
    f |= PARITY[v & 0xff]!;
    this.flags = f;
  }

  private alu(op: number, a: number, b: number, w: boolean): number {
    const mask = w ? 0xffff : 0xff;
    const sign = w ? 0x8000 : 0x80;
    let res: number;
    let f: number;
    switch (op) {
      case 0: // ADD
      case 2: { // ADC
        const c = op === 2 ? this.flags & CF : 0;
        res = a + b + c;
        f = this.flags & ~(CF | OF | AF);
        if (res > mask) f |= CF;
        if (((a ^ res) & (b ^ res) & sign) !== 0) f |= OF;
        if (((a ^ b ^ res) & 0x10) !== 0) f |= AF;
        this.flags = f;
        res &= mask;
        this.setSZP(res, w);
        return res;
      }
      case 3: // SBB
      case 5: // SUB
      case 7: { // CMP
        const c = op === 3 ? this.flags & CF : 0;
        res = a - b - c;
        f = this.flags & ~(CF | OF | AF);
        if (res < 0) f |= CF;
        if (((a ^ b) & (a ^ res) & sign) !== 0) f |= OF;
        if (((a ^ b ^ res) & 0x10) !== 0) f |= AF;
        this.flags = f;
        res &= mask;
        this.setSZP(res, w);
        return res;
      }
      case 1: res = a | b; break; // OR
      case 4: res = a & b; break; // AND
      case 6: res = a ^ b; break; // XOR
      default: throw new CpuError('alu');
    }
    this.flags &= ~(CF | OF | AF);
    res &= mask;
    this.setSZP(res, w);
    return res;
  }

  private inc(v: number, w: boolean): number {
    const mask = w ? 0xffff : 0xff;
    const res = (v + 1) & mask;
    let f = this.flags & ~(OF | AF);
    if (res === (w ? 0x8000 : 0x80)) f |= OF;
    if ((res & 0xf) === 0) f |= AF;
    this.flags = f;
    this.setSZP(res, w);
    return res;
  }
  private dec(v: number, w: boolean): number {
    const mask = w ? 0xffff : 0xff;
    const res = (v - 1) & mask;
    let f = this.flags & ~(OF | AF);
    if (res === (w ? 0x7fff : 0x7f)) f |= OF;
    if ((res & 0xf) === 0xf) f |= AF;
    this.flags = f;
    this.setSZP(res, w);
    return res;
  }

  /** Grupa przesunięć/obrotów (D0–D3, C0–C1). */
  private shift(op: number, v: number, count: number, w: boolean): number {
    count &= 0x1f;
    if (count === 0) return v;
    const bits = w ? 16 : 8;
    const mask = w ? 0xffff : 0xff;
    const sign = w ? 0x8000 : 0x80;
    let res = v;
    let cf = 0;
    switch (op) {
      case 0: // ROL
        for (let i = 0; i < count; i++) { cf = (res & sign) ? 1 : 0; res = ((res << 1) | cf) & mask; }
        this.flags = (this.flags & ~(CF | OF)) | (cf ? CF : 0) | (((res & sign) ? 1 : 0) ^ cf ? OF : 0);
        return res;
      case 1: // ROR
        for (let i = 0; i < count; i++) { cf = res & 1; res = (res >> 1) | (cf ? sign : 0); }
        this.flags = (this.flags & ~(CF | OF)) | (cf ? CF : 0) | ((((res >> (bits - 1)) ^ (res >> (bits - 2))) & 1) ? OF : 0);
        return res;
      case 2: { // RCL
        let c = this.flags & CF;
        for (let i = 0; i < count; i++) { const out = (res & sign) ? 1 : 0; res = ((res << 1) | c) & mask; c = out; }
        this.flags = (this.flags & ~(CF | OF)) | (c ? CF : 0) | (((res & sign) ? 1 : 0) ^ c ? OF : 0);
        return res;
      }
      case 3: { // RCR
        let c = this.flags & CF;
        const of = (((res & sign) ? 1 : 0) ^ c) ? OF : 0;
        for (let i = 0; i < count; i++) { const out = res & 1; res = (res >> 1) | (c ? sign : 0); c = out; }
        this.flags = (this.flags & ~(CF | OF)) | (c ? CF : 0) | of;
        return res;
      }
      case 4: case 6: // SHL / SAL
        res = v << count;
        cf = count <= bits ? (res >> bits) & 1 : 0;
        res &= mask;
        this.flags = (this.flags & ~(CF | OF | AF)) | (cf ? CF : 0) | ((((res & sign) ? 1 : 0) ^ cf) ? OF : 0);
        this.setSZP(res, w);
        return res;
      case 5: // SHR
        cf = count <= bits ? (v >> (count - 1)) & 1 : 0;
        res = count < bits ? v >> count : 0;
        this.flags = (this.flags & ~(CF | OF | AF)) | (cf ? CF : 0) | (count === 1 && (v & sign) ? OF : 0);
        this.setSZP(res, w);
        return res;
      case 7: { // SAR
        const sv = w ? (v << 16) >> 16 : (v << 24) >> 24;
        const n = Math.min(count, bits);
        cf = (sv >> (n - 1)) & 1;
        res = (sv >> n) & mask;
        this.flags = (this.flags & ~(CF | OF | AF)) | (cf ? CF : 0);
        this.setSZP(res, w);
        return res;
      }
    }
    return res;
  }

  private cond(c: number): boolean {
    const f = this.flags;
    let r: boolean;
    switch (c >> 1) {
      case 0: r = (f & OF) !== 0; break;
      case 1: r = (f & CF) !== 0; break;
      case 2: r = (f & ZF) !== 0; break;
      case 3: r = (f & (CF | ZF)) !== 0; break;
      case 4: r = (f & SF) !== 0; break;
      case 5: r = (f & PF) !== 0; break;
      case 6: r = ((f & SF) !== 0) !== ((f & OF) !== 0); break;
      default: r = (f & ZF) !== 0 || (((f & SF) !== 0) !== ((f & OF) !== 0)); break;
    }
    return (c & 1) ? !r : r;
  }

  /** Przerwanie: najpierw gospodarz, potem tablica wektorów (0000:4n). */
  doInt(n: number): void {
    if (this.io.interrupt(n, this)) return;
    const off = this.rw(0, n * 4), seg = this.rw(0, n * 4 + 2);
    if (off === 0 && seg === 0) return; // pusty wektor — przerwanie bez skutku
    this.push(this.flags);
    this.push(this.s[CS]!);
    this.push(this.ip);
    this.flags &= ~(IF | TF);
    this.s[CS] = seg;
    this.ip = off;
  }

  // ---------------------------------------------------------------- rozkazy łańcuchowe

  private stringOp(op: number, rep: number): void {
    const w = (op & 1) === 1;
    const size = w ? 2 : 1;
    const delta = (this.flags & DF) ? -size : size;
    const srcSeg = this.s[this.defSeg(DS)]!;
    const r = this.r;
    const body = (): boolean => {
      // zwraca false, gdy warunek REPE/REPNE kończy pętlę
      switch (op & 0xfe) {
        case 0xa4: // MOVS
          if (w) this.ww(this.s[ES]!, r[DI]!, this.rw(srcSeg, r[SI]!));
          else this.wb(this.s[ES]!, r[DI]!, this.rb(srcSeg, r[SI]!));
          r[SI] = r[SI]! + delta; r[DI] = r[DI]! + delta;
          return true;
        case 0xa6: { // CMPS
          const a = w ? this.rw(srcSeg, r[SI]!) : this.rb(srcSeg, r[SI]!);
          const b = w ? this.rw(this.s[ES]!, r[DI]!) : this.rb(this.s[ES]!, r[DI]!);
          this.alu(7, a, b, w);
          r[SI] = r[SI]! + delta; r[DI] = r[DI]! + delta;
          return true;
        }
        case 0xaa: // STOS
          if (w) this.ww(this.s[ES]!, r[DI]!, r[AX]!);
          else this.wb(this.s[ES]!, r[DI]!, r[AX]! & 0xff);
          r[DI] = r[DI]! + delta;
          return true;
        case 0xac: // LODS
          if (w) r[AX] = this.rw(srcSeg, r[SI]!);
          else this.setR8(0, this.rb(srcSeg, r[SI]!));
          r[SI] = r[SI]! + delta;
          return true;
        case 0xae: { // SCAS
          const b = w ? this.rw(this.s[ES]!, r[DI]!) : this.rb(this.s[ES]!, r[DI]!);
          this.alu(7, w ? r[AX]! : r[AX]! & 0xff, b, w);
          r[DI] = r[DI]! + delta;
          return true;
        }
      }
      throw new CpuError('string');
    };
    if (!rep) { body(); return; }
    const compares = (op & 0xfe) === 0xa6 || (op & 0xfe) === 0xae;
    while (r[CX] !== 0) {
      body();
      r[CX] = r[CX]! - 1;
      this.instructions++;
      if (compares) {
        const zf = (this.flags & ZF) !== 0;
        if (rep === 0xf3 && !zf) break;
        if (rep === 0xf2 && zf) break;
      }
    }
  }

  // ---------------------------------------------------------------- wykonanie

  /** Wykonuje jeden rozkaz (z przedrostkami). */
  step(): void {
    if (this.halted) throw new CpuError(`HLT w ${hex(this.s[CS]!)}:${hex(this.ip)}`);
    this.instructions++;
    this.segOverride = -1;
    let rep = 0;
    const startIp = this.ip;
    let op: number;
    for (;;) {
      op = this.fetch8();
      if (op === 0x26) this.segOverride = ES;
      else if (op === 0x2e) this.segOverride = CS;
      else if (op === 0x36) this.segOverride = SS;
      else if (op === 0x3e) this.segOverride = DS;
      else if (op === 0xf2 || op === 0xf3) rep = op;
      else if (op === 0xf0) { /* LOCK */ }
      else break;
    }
    const r = this.r, s = this.s;

    // ALU: 00–3F (poza przedrostkami i rozkazami specjalnymi)
    if (op < 0x40 && (op & 7) < 6) {
      const aluOp = op >> 3;
      const w = (op & 1) === 1;
      switch (op & 7) {
        case 0: { this.modrm(); const v = this.alu(aluOp, this.getEA8(), this.r8(this.modReg), false); if (aluOp !== 7) this.setEA8(v); return; }
        case 1: { this.modrm(); const v = this.alu(aluOp, this.getEA16(), r[this.modReg]!, true); if (aluOp !== 7) this.setEA16(v); return; }
        case 2: { this.modrm(); const v = this.alu(aluOp, this.r8(this.modReg), this.getEA8(), false); if (aluOp !== 7) this.setR8(this.modReg, v); return; }
        case 3: { this.modrm(); const v = this.alu(aluOp, r[this.modReg]!, this.getEA16(), true); if (aluOp !== 7) r[this.modReg] = v; return; }
        case 4: { const v = this.alu(aluOp, r[AX]! & 0xff, this.fetch8(), false); if (aluOp !== 7) this.setR8(0, v); return; }
        case 5: { const v = this.alu(aluOp, r[AX]!, this.fetch16(), w); if (aluOp !== 7) r[AX] = v; return; }
      }
    }

    switch (op) {
      case 0x06: this.push(s[ES]!); return;
      case 0x07: s[ES] = this.pop(); return;
      case 0x0e: this.push(s[CS]!); return;
      case 0x16: this.push(s[SS]!); return;
      case 0x17: s[SS] = this.pop(); return;
      case 0x1e: this.push(s[DS]!); return;
      case 0x1f: s[DS] = this.pop(); return;
      case 0x27: { // DAA
        let al = r[AX]! & 0xff;
        const oldAl = al, oldCf = this.flags & CF;
        let f = this.flags & ~(CF | AF);
        if ((al & 0xf) > 9 || (this.flags & AF)) { al += 6; f |= AF; }
        if (oldAl > 0x99 || oldCf) { al += 0x60; f |= CF; }
        this.flags = f;
        this.setR8(0, al);
        this.setSZP(al & 0xff, false);
        return;
      }
      case 0x2f: { // DAS
        let al = r[AX]! & 0xff;
        const oldAl = al, oldCf = this.flags & CF;
        let f = this.flags & ~(CF | AF);
        if ((al & 0xf) > 9 || (this.flags & AF)) { al -= 6; f |= AF; }
        if (oldAl > 0x99 || oldCf) { al -= 0x60; f |= CF; }
        this.flags = f;
        this.setR8(0, al & 0xff);
        this.setSZP(al & 0xff, false);
        return;
      }
      case 0x37: case 0x3f: { // AAA / AAS
        let ax = r[AX]!;
        if ((ax & 0xf) > 9 || (this.flags & AF)) {
          ax = op === 0x37 ? ax + 0x106 : ax - 0x106;
          this.flags |= AF | CF;
        } else this.flags &= ~(AF | CF);
        r[AX] = (ax & 0xff0f);
        return;
      }
    }

    if (op >= 0x40 && op <= 0x47) { r[op & 7] = this.inc(r[op & 7]!, true); return; }
    if (op >= 0x48 && op <= 0x4f) { r[op & 7] = this.dec(r[op & 7]!, true); return; }
    if (op >= 0x50 && op <= 0x57) {
      // PUSH SP na 8086 zapisuje wartość już zmniejszoną
      if (op === 0x54) { const v = (r[SP]! - 2) & 0xffff; this.push(v); } else this.push(r[op & 7]!);
      return;
    }
    if (op >= 0x58 && op <= 0x5f) { r[op & 7] = this.pop(); return; }
    if (op >= 0x70 && op <= 0x7f) { const d = this.fetchS8(); if (this.cond(op & 0xf)) this.ip = (this.ip + d) & 0xffff; return; }
    if (op >= 0x91 && op <= 0x97) { const t = r[AX]!; r[AX] = r[op & 7]!; r[op & 7] = t; return; }
    if (op >= 0xb0 && op <= 0xb7) { this.setR8(op & 7, this.fetch8()); return; }
    if (op >= 0xb8 && op <= 0xbf) { r[op & 7] = this.fetch16(); return; }
    if (op >= 0xa4 && op <= 0xa7 || op >= 0xaa && op <= 0xaf) { this.stringOp(op, rep); return; }
    if (op >= 0xd8 && op <= 0xdf) { this.modrm(); return; } // ESC (koprocesor) — pomijany

    switch (op) {
      case 0x60: { // PUSHA
        const sp = r[SP]!;
        this.push(r[AX]!); this.push(r[CX]!); this.push(r[DX]!); this.push(r[BX]!);
        this.push(sp); this.push(r[BP]!); this.push(r[SI]!); this.push(r[DI]!);
        return;
      }
      case 0x61: // POPA
        r[DI] = this.pop(); r[SI] = this.pop(); r[BP] = this.pop(); this.pop();
        r[BX] = this.pop(); r[DX] = this.pop(); r[CX] = this.pop(); r[AX] = this.pop();
        return;
      case 0x68: this.push(this.fetch16()); return;
      case 0x6a: this.push(this.fetchS8() & 0xffff); return;
      case 0x69: case 0x6b: { // IMUL r16, r/m16, imm
        this.modrm();
        const a = (this.getEA16() << 16) >> 16;
        const b = op === 0x69 ? (this.fetch16() << 16) >> 16 : this.fetchS8();
        const p = a * b;
        r[this.modReg] = p & 0xffff;
        const of = p < -0x8000 || p > 0x7fff;
        this.flags = (this.flags & ~(CF | OF)) | (of ? CF | OF : 0);
        return;
      }
      case 0x80: case 0x82: { this.modrm(); const o = this.modReg; const v = this.alu(o, this.getEA8(), this.fetch8(), false); if (o !== 7) this.setEA8(v); return; }
      case 0x81: { this.modrm(); const o = this.modReg; const v = this.alu(o, this.getEA16(), this.fetch16(), true); if (o !== 7) this.setEA16(v); return; }
      case 0x83: { this.modrm(); const o = this.modReg; const v = this.alu(o, this.getEA16(), this.fetchS8() & 0xffff, true); if (o !== 7) this.setEA16(v); return; }
      case 0x84: this.modrm(); this.alu(4, this.getEA8(), this.r8(this.modReg), false); return;
      case 0x85: this.modrm(); this.alu(4, this.getEA16(), r[this.modReg]!, true); return;
      case 0x86: { this.modrm(); const t = this.getEA8(); this.setEA8(this.r8(this.modReg)); this.setR8(this.modReg, t); return; }
      case 0x87: { this.modrm(); const t = this.getEA16(); this.setEA16(r[this.modReg]!); r[this.modReg] = t; return; }
      case 0x88: this.modrm(); this.setEA8(this.r8(this.modReg)); return;
      case 0x89: this.modrm(); this.setEA16(r[this.modReg]!); return;
      case 0x8a: this.modrm(); this.setR8(this.modReg, this.getEA8()); return;
      case 0x8b: this.modrm(); r[this.modReg] = this.getEA16(); return;
      case 0x8c: this.modrm(); this.setEA16(s[this.modReg & 3]!); return;
      case 0x8d: this.modrm(); r[this.modReg] = this.eaOff; return;
      case 0x8e: this.modrm(); s[this.modReg & 3] = this.getEA16(); return;
      case 0x8f: this.modrm(); this.setEA16(this.pop()); return;
      case 0x90: return;
      case 0x98: r[AX] = ((r[AX]! & 0xff) << 24) >> 24; return;
      case 0x99: r[DX] = (r[AX]! & 0x8000) ? 0xffff : 0; return;
      case 0x9a: { const off = this.fetch16(); const seg = this.fetch16(); this.push(s[CS]!); this.push(this.ip); s[CS] = seg; this.ip = off; return; }
      case 0x9b: return; // WAIT
      case 0x9c: this.push(this.flags | 0xf002); return;
      case 0x9d: this.flags = (this.pop() & 0x0fd5) | 0x0002; return;
      case 0x9e: this.flags = (this.flags & 0xff00) | ((r[AX]! >> 8) & 0xd5) | 0x02; return;
      case 0x9f: this.setR8(4, this.flags & 0xff); return;
      case 0xa0: this.setR8(0, this.rb(s[this.defSeg(DS)]!, this.fetch16())); return;
      case 0xa1: r[AX] = this.rw(s[this.defSeg(DS)]!, this.fetch16()); return;
      case 0xa2: this.wb(s[this.defSeg(DS)]!, this.fetch16(), r[AX]! & 0xff); return;
      case 0xa3: this.ww(s[this.defSeg(DS)]!, this.fetch16(), r[AX]!); return;
      case 0xa8: this.alu(4, r[AX]! & 0xff, this.fetch8(), false); return;
      case 0xa9: this.alu(4, r[AX]!, this.fetch16(), true); return;
      case 0xc0: case 0xc1: case 0xd0: case 0xd1: case 0xd2: case 0xd3: {
        this.modrm();
        const w = (op & 1) === 1;
        const v = w ? this.getEA16() : this.getEA8();
        const count = op <= 0xc1 ? this.fetch8() : op <= 0xd1 ? 1 : r[CX]! & 0xff;
        const res = this.shift(this.modReg, v, count, w);
        if (w) this.setEA16(res); else this.setEA8(res);
        return;
      }
      case 0xc2: { const n = this.fetch16(); this.ip = this.pop(); r[SP] = r[SP]! + n; return; }
      case 0xc3: this.ip = this.pop(); return;
      case 0xc4: case 0xc5: {
        this.modrm();
        r[this.modReg] = this.rw(this.eaSeg, this.eaOff);
        s[op === 0xc4 ? ES : DS] = this.rw(this.eaSeg, this.eaOff + 2);
        return;
      }
      case 0xc6: this.modrm(); this.setEA8(this.fetch8()); return;
      case 0xc7: this.modrm(); this.setEA16(this.fetch16()); return;
      case 0xc8: { // ENTER
        const size = this.fetch16(); const level = this.fetch8() & 0x1f;
        this.push(r[BP]!);
        const frame = r[SP]!;
        for (let i = 1; i < level; i++) { r[BP] = r[BP]! - 2; this.push(this.rw(s[SS]!, r[BP]!)); }
        if (level > 0) this.push(frame);
        r[BP] = frame;
        r[SP] = r[SP]! - size;
        return;
      }
      case 0xc9: r[SP] = r[BP]!; r[BP] = this.pop(); return; // LEAVE
      case 0xca: { const n = this.fetch16(); this.ip = this.pop(); s[CS] = this.pop(); r[SP] = r[SP]! + n; return; }
      case 0xcb: this.ip = this.pop(); s[CS] = this.pop(); return;
      case 0xcc: this.doInt(3); return;
      case 0xcd: this.doInt(this.fetch8()); return;
      case 0xce: if (this.flags & OF) this.doInt(4); return;
      case 0xcf: this.ip = this.pop(); s[CS] = this.pop(); this.flags = (this.pop() & 0x0fd5) | 0x0002; return;
      case 0xd4: { // AAM
        const base = this.fetch8();
        if (base === 0) throw new CpuError('AAM 0');
        const al = r[AX]! & 0xff;
        r[AX] = ((Math.floor(al / base)) << 8) | (al % base);
        this.setSZP(r[AX]! & 0xff, false);
        return;
      }
      case 0xd5: { // AAD
        const base = this.fetch8();
        const v = ((r[AX]! >> 8) * base + (r[AX]! & 0xff)) & 0xff;
        r[AX] = v;
        this.setSZP(v, false);
        return;
      }
      case 0xd6: this.setR8(0, (this.flags & CF) ? 0xff : 0); return; // SALC
      case 0xd7: this.setR8(0, this.rb(s[this.defSeg(DS)]!, r[BX]! + (r[AX]! & 0xff))); return; // XLAT
      case 0xe0: case 0xe1: case 0xe2: { // LOOPNZ / LOOPZ / LOOP
        const d = this.fetchS8();
        r[CX] = r[CX]! - 1;
        const zf = (this.flags & ZF) !== 0;
        const go = r[CX] !== 0 && (op === 0xe2 || (op === 0xe1 ? zf : !zf));
        if (go) this.ip = (this.ip + d) & 0xffff;
        return;
      }
      case 0xe3: { const d = this.fetchS8(); if (r[CX] === 0) this.ip = (this.ip + d) & 0xffff; return; }
      case 0xe4: this.setR8(0, this.io.portIn(this.fetch8(), 1) & 0xff); return;
      case 0xe5: r[AX] = this.io.portIn(this.fetch8(), 2) & 0xffff; return;
      case 0xe6: this.io.portOut(this.fetch8(), r[AX]! & 0xff, 1); return;
      case 0xe7: this.io.portOut(this.fetch8(), r[AX]!, 2); return;
      case 0xe8: { const d = this.fetch16(); this.push(this.ip); this.ip = (this.ip + d) & 0xffff; return; }
      case 0xe9: { const d = this.fetch16(); this.ip = (this.ip + d) & 0xffff; return; }
      case 0xea: { const off = this.fetch16(); s[CS] = this.fetch16(); this.ip = off; return; }
      case 0xeb: { const d = this.fetchS8(); this.ip = (this.ip + d) & 0xffff; return; }
      case 0xec: this.setR8(0, this.io.portIn(r[DX]!, 1) & 0xff); return;
      case 0xed: r[AX] = this.io.portIn(r[DX]!, 2) & 0xffff; return;
      case 0xee: this.io.portOut(r[DX]!, r[AX]! & 0xff, 1); return;
      case 0xef: this.io.portOut(r[DX]!, r[AX]!, 2); return;
      case 0xf4: this.halted = true; this.ip = startIp; return;
      case 0xf5: this.flags ^= CF; return;
      case 0xf6: case 0xf7: this.group3(op === 0xf7); return;
      case 0xf8: this.flags &= ~CF; return;
      case 0xf9: this.flags |= CF; return;
      case 0xfa: this.flags &= ~IF; return;
      case 0xfb: this.flags |= IF; return;
      case 0xfc: this.flags &= ~DF; return;
      case 0xfd: this.flags |= DF; return;
      case 0xfe: {
        this.modrm();
        if (this.modReg === 0) this.setEA8(this.inc(this.getEA8(), false));
        else if (this.modReg === 1) this.setEA8(this.dec(this.getEA8(), false));
        else throw new CpuError(`FE /${this.modReg} w ${hex(s[CS]!)}:${hex(startIp)}`);
        return;
      }
      case 0xff: {
        this.modrm();
        switch (this.modReg) {
          case 0: this.setEA16(this.inc(this.getEA16(), true)); return;
          case 1: this.setEA16(this.dec(this.getEA16(), true)); return;
          case 2: { const t = this.getEA16(); this.push(this.ip); this.ip = t; return; }
          case 3: { const off = this.rw(this.eaSeg, this.eaOff); const seg = this.rw(this.eaSeg, this.eaOff + 2); this.push(s[CS]!); this.push(this.ip); s[CS] = seg; this.ip = off; return; }
          case 4: this.ip = this.getEA16(); return;
          case 5: { const off = this.rw(this.eaSeg, this.eaOff); s[CS] = this.rw(this.eaSeg, this.eaOff + 2); this.ip = off; return; }
          case 6: this.push(this.getEA16()); return;
        }
        break;
      }
    }
    throw new CpuError(`Nieznany rozkaz 0x${op.toString(16)} w ${hex(s[CS]!)}:${hex(startIp)}`);
  }

  private group3(w: boolean): void {
    this.modrm();
    const r = this.r;
    const v = w ? this.getEA16() : this.getEA8();
    switch (this.modReg) {
      case 0: case 1: this.alu(4, v, w ? this.fetch16() : this.fetch8(), w); return; // TEST
      case 2: if (w) this.setEA16(~v & 0xffff); else this.setEA8(~v & 0xff); return; // NOT
      case 3: { const res = this.alu(5, 0, v, w); if (w) this.setEA16(res); else this.setEA8(res); return; } // NEG
      case 4: { // MUL
        if (w) {
          const p = r[AX]! * v;
          r[AX] = p & 0xffff; r[DX] = Math.floor(p / 0x10000) & 0xffff;
          this.flags = (this.flags & ~(CF | OF)) | (r[DX] ? CF | OF : 0);
        } else {
          const p = (r[AX]! & 0xff) * v;
          r[AX] = p & 0xffff;
          this.flags = (this.flags & ~(CF | OF)) | (p & 0xff00 ? CF | OF : 0);
        }
        return;
      }
      case 5: { // IMUL
        if (w) {
          const p = ((r[AX]! << 16) >> 16) * ((v << 16) >> 16);
          r[AX] = p & 0xffff; r[DX] = (p >> 16) & 0xffff;
          this.flags = (this.flags & ~(CF | OF)) | (p < -0x8000 || p > 0x7fff ? CF | OF : 0);
        } else {
          const p = (((r[AX]! & 0xff) << 24) >> 24) * ((v << 24) >> 24);
          r[AX] = p & 0xffff;
          this.flags = (this.flags & ~(CF | OF)) | (p < -0x80 || p > 0x7f ? CF | OF : 0);
        }
        return;
      }
      case 6: { // DIV
        if (v === 0) { this.doInt(0); return; }
        if (w) {
          const n = r[DX]! * 0x10000 + r[AX]!;
          const q = Math.floor(n / v);
          if (q > 0xffff) { this.doInt(0); return; }
          r[AX] = q; r[DX] = n % v;
        } else {
          const n = r[AX]!;
          const q = Math.floor(n / v);
          if (q > 0xff) { this.doInt(0); return; }
          r[AX] = ((n % v) << 8) | q;
        }
        return;
      }
      case 7: { // IDIV
        if (v === 0) { this.doInt(0); return; }
        if (w) {
          const n = ((r[DX]! << 16) | r[AX]!) | 0;
          const d = (v << 16) >> 16;
          const q = Math.trunc(n / d);
          if (q > 0x7fff || q < -0x8000) { this.doInt(0); return; }
          r[AX] = q & 0xffff; r[DX] = (n - q * d) & 0xffff;
        } else {
          const n = (r[AX]! << 16) >> 16;
          const d = (v << 24) >> 24;
          const q = Math.trunc(n / d);
          if (q > 0x7f || q < -0x80) { this.doInt(0); return; }
          r[AX] = (((n - q * d) & 0xff) << 8) | (q & 0xff);
        }
        return;
      }
    }
  }
}

function hex(v: number): string {
  return v.toString(16).padStart(4, '0');
}
