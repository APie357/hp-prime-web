import { describe, expect, it } from 'vitest';
import { diffBits, examName, getBit, isValidExamName, setBit, withExamName } from '../src/lib/files/exam';
import { fileType } from '../src/lib/files/kinds';

const utf16 = (s: string) => Uint8Array.from([...s].flatMap((c) => [c.charCodeAt(0), 0]));

describe('exam configurations', () => {
  it('reads the NUL-terminated UTF-16 name from the first 64 bytes', () => {
    const d = new Uint8Array(1156);
    d.set(utf16('IB Exam Mode'));
    d[100] = 0x50;
    expect(examName(d)).toBe('IB Exam Mode');
  });

  it('replaces the name without touching the rest', () => {
    const d = new Uint8Array(1156);
    d.set(utf16('A much longer old name'));
    d[64] = 0x86;
    d[1155] = 7;
    const out = withExamName(d, 'Quiz');
    expect(examName(out)).toBe('Quiz');
    expect(out.subarray(8, 64).every((b) => b === 0)).toBe(true);
    expect(out[64]).toBe(0x86);
    expect(out[1155]).toBe(7);
    expect(out.length).toBe(1156);
    expect(examName(d)).toBe('A much longer old name'); // input unchanged
  });

  it('truncates names to 31 characters', () => {
    expect(examName(withExamName(new Uint8Array(1156), 'x'.repeat(40)))).toBe('x'.repeat(31));
  });

  it('sets bits and lists differing bits after the name', () => {
    const a = new Uint8Array(100);
    const b = setBit(setBit(a, 70, 3, true), 2, 0, true);
    expect(getBit(b, 70, 3)).toBe(1);
    expect(getBit(a, 70, 3)).toBe(0);
    expect(diffBits(a, b)).toEqual([{ offset: 70, bit: 3, a: 0, b: 1 }]);
    expect(diffBits(setBit(b, 70, 3, false), b)).toEqual([{ offset: 70, bit: 3, a: 0, b: 1 }]);
  });

  it('validates names and recognizes the file type', () => {
    expect(isValidExamName('Default Exam')).toBe(true);
    expect(isValidExamName('')).toBe(false);
    expect(isValidExamName('a/b')).toBe(false);
    expect(fileType('IB Exam Mode.hpexammode')).toBe('exam');
    expect(fileType('Foo.note')).toBe('note');
  });
});

describe('exam timeout', () => {
  it('reads and writes u16 LE minutes at 0x480', async () => {
    const { examTimeout, withExamTimeout } = await import('../src/lib/files/exam');
    const d = new Uint8Array(1156);
    d[0x480] = 0x0f;
    d[0x482] = 0xc1;
    d[0x483] = 0x01;
    expect(examTimeout(d)).toBe(15);
    const e = withExamTimeout(d, 120);
    expect([...e.subarray(0x480)]).toEqual([0x78, 0x00, 0xc1, 0x01]);
    expect(examTimeout(withExamTimeout(d, 9999))).toBe(480);
    expect(examTimeout(new Uint8Array(100))).toBeNull();
  });
});
