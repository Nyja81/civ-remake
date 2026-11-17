import { describe, expect, it } from 'vitest';
import { AX, BX, CX, Cpu8086, CpuError, DI, DX, ES, SI, type CpuIo } from '../src/cpu8086';

/** Uruchamia kod maszynowy zakończony RETF jako wywołanie dalekie spod 1000:0000. */
function run(code: number[], setup?: (cpu: Cpu8086) => void, io?: Partial<CpuIo>): Cpu8086 {
  const cpu = new Cpu8086({ portIn: () => 0xff, portOut: () => {}, interrupt: () => false, ...io });
  cpu.mem.set(code, 0x10000);
  cpu.s[2] = 0x9000; // SS
  cpu.r[4] = 0xfff0; // SP
  setup?.(cpu);
  cpu.callFar(0x1000, 0);
  return cpu;
}
const CF = 1, ZF = 0x40, SF = 0x80, OF = 0x800;

describe('interpreter 8086', () => {
  it('ADD/ADC/SUB/SBB i znaczniki', () => {
    // mov ax,0xffff; add ax,1 → 0, CF, ZF; adc bx,0 (bx = 1)
    let c = run([0xb8, 0xff, 0xff, 0x05, 0x01, 0x00, 0xbb, 0x00, 0x00, 0x83, 0xd3, 0x00, 0xcb]);
    expect(c.r[AX]).toBe(0);
    expect(c.r[BX]).toBe(1);
    // mov al,0x7f; add al,1 → 0x80, OF, SF
    c = run([0xb0, 0x7f, 0x04, 0x01, 0xcb]);
    expect(c.r[AX]! & 0xff).toBe(0x80);
    expect(c.flags & (OF | SF)).toBe(OF | SF);
    // mov ax,1; sub ax,2 → 0xffff, CF
    c = run([0xb8, 0x01, 0x00, 0x2d, 0x02, 0x00, 0xcb]);
    expect(c.r[AX]).toBe(0xffff);
    expect(c.flags & CF).toBe(CF);
    // stc; mov ax,5; sbb ax,2 → 2
    c = run([0xf9, 0xb8, 0x05, 0x00, 0x1d, 0x02, 0x00, 0xcb]);
    expect(c.r[AX]).toBe(2);
    // cmp ax,ax → ZF
    c = run([0x39, 0xc0, 0xcb]);
    expect(c.flags & ZF).toBe(ZF);
  });

  it('MUL, IMUL, DIV, IDIV, CBW, CWD', () => {
    // mov ax,300; mov bx,300; mul bx → dx:ax = 90000
    let c = run([0xb8, 0x2c, 0x01, 0xbb, 0x2c, 0x01, 0xf7, 0xe3, 0xcb]);
    expect(c.r[DX]! * 65536 + c.r[AX]!).toBe(90000);
    // mov ax,-7; cwd; mov bx,2; idiv bx → ax = -3, dx = -1
    c = run([0xb8, 0xf9, 0xff, 0x99, 0xbb, 0x02, 0x00, 0xf7, 0xfb, 0xcb]);
    expect(c.r[AX]).toBe(0xfffd);
    expect(c.r[DX]).toBe(0xffff);
    // mov al,0x80; cbw → 0xff80; mov bl,3; imul bl → 0x80*... (-128 * 3 = -384)
    c = run([0xb0, 0x80, 0x98, 0xb3, 0x03, 0xf6, 0xeb, 0xcb]);
    expect(c.r[AX]).toBe((-384) & 0xffff);
    // mov dx,1; mov ax,0; mov cx,16; div cx → 4096
    c = run([0xba, 0x01, 0x00, 0xb8, 0x00, 0x00, 0xb9, 0x10, 0x00, 0xf7, 0xf1, 0xcb]);
    expect(c.r[AX]).toBe(4096);
  });

  it('przesunięcia i obroty', () => {
    // mov ax,0x8001; ror ax,1 → 0xc000, CF
    let c = run([0xb8, 0x01, 0x80, 0xd1, 0xc8, 0xcb]);
    expect(c.r[AX]).toBe(0xc000);
    expect(c.flags & CF).toBe(CF);
    // mov al,0x81; mov cl,4; shl al,cl → 0x10, CF (bit 4 oryginału wypada ostatni = 0)
    c = run([0xb0, 0x81, 0xb1, 0x04, 0xd2, 0xe0, 0xcb]);
    expect(c.r[AX]! & 0xff).toBe(0x10);
    // mov ax,0xfff0; sar ax,4 → 0xffff
    c = run([0xb8, 0xf0, 0xff, 0xc1, 0xf8, 0x04, 0xcb]);
    expect(c.r[AX]).toBe(0xffff);
    // clc; mov al,0x80; rcl al,1 → 0, CF
    c = run([0xf8, 0xb0, 0x80, 0xd0, 0xd0, 0xcb]);
    expect(c.r[AX]! & 0xff).toBe(0);
    expect(c.flags & CF).toBe(CF);
  });

  it('rozkazy łańcuchowe, pętle, wywołania', () => {
    // REP MOVSB 5 bajtów z 1000:0100 do 1000:0200 (ES = DS = CS)
    const code = [
      0x0e, 0x1f, 0x0e, 0x07, // push cs; pop ds; push cs; pop es
      0xbe, 0x00, 0x01, 0xbf, 0x00, 0x02, 0xb9, 0x05, 0x00, 0xfc, 0xf3, 0xa4, // mov si; mov di; mov cx,5; cld; rep movsb
      0xbb, 0x00, 0x00, 0xb9, 0x0a, 0x00, // mov bx,0; mov cx,10
      0x43, 0xe2, 0xfd, // l: inc bx; loop l
      0xe8, 0x01, 0x00, 0xcb, // call +1; retf
      0x43, 0xc3, // inc bx; ret
    ];
    const c = run(code, (cpu) => cpu.mem.set([1, 2, 3, 4, 5], 0x10100));
    expect([...c.mem.subarray(0x10200, 0x10205)]).toEqual([1, 2, 3, 4, 5]);
    expect(c.r[BX]).toBe(11);
    expect(c.r[SI]).toBe(0x105);
    expect(c.r[DI]).toBe(0x205);
    expect(c.s[ES]).toBe(0x1000);
    expect(c.r[CX]).toBe(0);
  });

  it('porty i przerwania przez gospodarza', () => {
    const out: Array<[number, number]> = [];
    let ints = 0;
    // mov dx,0x388; mov al,0x20; out dx,al; in al,dx; int 0x21; retf
    const c = run([0xba, 0x88, 0x03, 0xb0, 0x20, 0xee, 0xec, 0xcd, 0x21, 0xcb], undefined, {
      portOut: (p, v) => { out.push([p, v]); },
      portIn: () => 0x06,
      interrupt: (n) => { if (n === 0x21) ints++; return true; },
    });
    expect(out).toEqual([[0x388, 0x20]]);
    expect(c.r[AX]! & 0xff).toBe(0x06);
    expect(ints).toBe(1);
  });

  it('nieznany rozkaz przerywa wykonanie', () => {
    expect(() => run([0x0f, 0x0b])).toThrow(CpuError);
  });
});
