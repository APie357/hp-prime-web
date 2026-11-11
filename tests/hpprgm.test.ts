import { describe, expect, it } from 'vitest';
import { decodeHpprgm, encodeHpprgm, encodeHpprgmG1 } from '../src/lib/files/hpprgm';

const SRC = 'EXPORT RSUM(n)\nBEGIN\n  LOCAL s:=0;\n  RETURN s▶x;\nEND;\n\nHELPER()\nBEGIN\nEND;\n';
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

describe('.hpprgm', () => {
  it('writes the G2 layout (Xprime hpprgm.cpp)', () => {
    const procs = [
      { name: 'RSUM', exported: true },
      { name: 'HELPER', exported: false },
    ];
    const b = encodeHpprgm(SRC, procs);
    expect([...b.subarray(0, 12)]).toEqual([0x7c, 0x61, 0x8a, 0xb2, 0xfe, 0xff, 0xff, 0xff, 0, 0, 0, 0]);
    // Procedure block: length 88n + 4, tag 3E 02 00 01, then 88 bytes per procedure.
    expect(u32(b, 12)).toBe(2 * 88 + 4);
    expect([...b.subarray(16, 20)]).toEqual([0x3e, 0x02, 0x00, 0x01]);
    expect(u32(b, 20)).toBe(84);
    expect(b[20 + 12]).toBe('R'.charCodeAt(0));
    expect(b[20 + 84]).toBe(9); // exported
    expect(b[20 + 88 + 84]).toBe(8); // not exported
    // Source record fills the rest of the file exactly.
    const src = 12 + 4 + 2 * 88 + 4;
    expect(src + 4 + u32(b, src)).toBe(b.length);
    expect([...b.subarray(src + 4, src + 8)]).toEqual([0xbe, 0x00, 0x40, 0x01]);
    expect([...b.subarray(b.length - 2)]).toEqual([0, 0]); // NUL-terminated text
  });

  it('reads back what it writes, including non-ASCII characters', () => {
    const d = decodeHpprgm(encodeHpprgm(SRC, [{ name: 'RSUM', exported: true }]));
    expect(d).toEqual({ source: SRC, format: 'g2' });
  });

  it('normalizes CRLF line endings', () => {
    expect(decodeHpprgm(encodeHpprgm('A\r\nB\r\n', [])).source).toBe('A\nB\n');
  });

  it('finds the source after a compiled block', () => {
    const plain = encodeHpprgm(SRC, []);
    const junk = new Uint8Array(40).fill(0x55);
    const withBlock = new Uint8Array([...plain.subarray(0, 12), ...junk, ...plain.subarray(12)]);
    expect(decodeHpprgm(withBlock).source).toBe(SRC);
  });

  it('reads G1 files, unnamed and named', () => {
    const unnamed = encodeHpprgmG1(SRC);
    expect([...unnamed.subarray(0, 4)]).toEqual([0x0c, 0, 0, 0]);
    expect(u32(unnamed, 16)).toBe((SRC.length + 1) * 2);
    expect(decodeHpprgm(unnamed)).toEqual({ source: SRC, format: 'g1' });

    const named = encodeHpprgmG1(SRC, 'RSUM');
    expect(u32(named, 0)).toBe(14 + 10);
    expect(named[8]).toBe(1);
    expect(decodeHpprgm(named)).toEqual({ source: SRC, format: 'g1', name: 'RSUM' });
  });

  it('rejects other files', () => {
    expect(() => decodeHpprgm(new TextEncoder().encode('just some text, not a program file'))).toThrow(/not an .hpprgm/);
  });
});
