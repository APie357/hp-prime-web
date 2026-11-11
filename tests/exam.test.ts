import { describe, expect, it } from 'vitest';
import {
  checksumStatus,
  diffBits,
  examName,
  examOptions,
  examTimeout,
  getBit,
  isValidExamName,
  samePassword,
  setBit,
  updateChecksum,
  withExamName,
  withExamOptions,
  withExamTimeout,
  withPasswordFrom,
} from '../src/lib/files/exam';
import { fileType } from '../src/lib/files/kinds';

const utf16 = (s: string) => Uint8Array.from([...s].flatMap((c) => [c.charCodeAt(0), 0]));
const hex = (s: string) => Uint8Array.from(s.match(/../g)!.map((h) => parseInt(h, 16)));
const crcOf = (d: Uint8Array) => [...d.subarray(0x41c, 0x420)].map((b) => b.toString(16).padStart(2, '0')).join('');

/**
 * "Custom Mode 1" read from a G2 (2026-11-11): CAS disabled, 15 min, no angle change, blank
 * password, memory Hide, Blink LED with security code.
 */
function customMode1(): Uint8Array {
  const d = new Uint8Array(1156);
  d.set(utf16('Custom Mode'));
  d[0x40] = 0x80;
  d[0xe1] = 0x38;
  d.set(
    hex(
      'e09f6cdbfb7429c70000000000000000d41d8cd98f00b204e9800998ecf8427e607ae9db' +
        'ce435ca4c31ebfb862a523dbc79f08a8d4097638fa6a02a99270c3c2a13a9ebc' +
        '551d4f88f35a0349b1fb49eb69d9ddc6245be7dfbf968a969d0a3e4cc861f46e0f00c101',
    ),
    0x41c,
  );
  return d;
}

describe('exam configurations', () => {
  it('reads the NUL-terminated UTF-16 name from the first 64 bytes', () => {
    expect(examName(customMode1())).toBe('Custom Mode');
  });

  it('replaces the name without touching the settings', () => {
    const d = customMode1();
    const out = withExamName(d, 'Quiz');
    expect(examName(out)).toBe('Quiz');
    expect(out.subarray(8, 64).every((b) => b === 0)).toBe(true);
    expect([...out.subarray(0x480)]).toEqual([...d.subarray(0x480)]);
    expect(examName(d)).toBe('Custom Mode'); // input unchanged
    expect(examName(withExamName(d, 'x'.repeat(40)))).toBe('x'.repeat(31));
  });

  it('validates names and recognizes the file type', () => {
    expect(isValidExamName('Default Exam')).toBe(true);
    expect(isValidExamName('')).toBe(false);
    expect(isValidExamName('a/b')).toBe(false);
    expect(fileType('IB Exam Mode.hpexammode')).toBe('exam');
    expect(fileType('Foo.note')).toBe('note');
  });

  it('decodes the G2 sample', () => {
    const d = customMode1();
    expect(checksumStatus(d)).toBe('ok');
    expect(examTimeout(d)).toBe(15);
    expect(examOptions(d)).toEqual({ memory: 'hide', angle: 'none', led: 'security' });
    expect(getBit(d, 0x40, 7)).toBe(1); // CAS disabled
  });

  // Each expected checksum is from the calculator's own copy with that one setting changed.
  it('produces the checksums the calculator wrote', () => {
    const d = customMode1();
    expect(crcOf(withExamTimeout(d, 30))).toBe('1aafc933');
    expect(crcOf(withExamOptions(d, { angle: 'degrees' }))).toBe('e815b513');
    expect(crcOf(withExamOptions(d, { angle: 'radians' }))).toBe('e45a00bf');
    expect(crcOf(withExamOptions(d, { angle: 'gradians' }))).toBe('ecd0d977');
    expect(crcOf(withExamOptions(d, { memory: 'erase' }))).toBe('76af6bac');
    expect(crcOf(withExamOptions(d, { memory: 'keep' }))).toBe('379e70b5');
    expect(crcOf(withExamOptions(d, { memory: 'keep-restore' }))).toBe('a1ae77c2');
    expect(crcOf(withExamOptions(d, { led: 'blink' }))).toBe('c596a78c');
    expect(crcOf(withExamOptions(d, { led: 'off' }))).toBe('e5d0152b');
    expect(crcOf(setBit(d, 0x40, 7, false))).toBe('1fab1f26');
  });

  it('maps the option flags', () => {
    const d = customMode1();
    const flags = (x: Uint8Array) => x[0x482] | (x[0x483] << 8);
    expect(flags(withExamOptions(d, { angle: 'degrees' }))).toBe(0x1c9);
    expect(flags(withExamOptions(d, { memory: 'keep' }))).toBe(0x0c0);
    expect(flags(withExamOptions(d, { led: 'blink' }))).toBe(0x1a3);
    expect(flags(withExamOptions(d, { led: 'off' }))).toBe(0x181);
    // The Connectivity Kit IB sample: erase memory, radians, Blink LED.
    const ib = new Uint8Array(1156);
    ib[0x482] = 0x07;
    expect(examOptions(ib)).toEqual({ memory: 'erase', angle: 'radians', led: 'other' });
  });

  it('leaves files without a checksum alone', () => {
    const ib = new Uint8Array(1156);
    ib[0x480] = 0x78;
    expect(checksumStatus(ib)).toBe('none');
    expect(crcOf(withExamTimeout(ib, 30))).toBe('00000000');
  });

  it('copies the password and keeps the checksum consistent', () => {
    const d = customMode1();
    const other = setBit(d, 0x450, 0, true);
    const out = withPasswordFrom(d, other);
    expect(samePassword(out, other)).toBe(true);
    expect(checksumStatus(out)).toBe('ok');
  });

  it('updateChecksum is idempotent and diffBits skips the checksum', () => {
    const d = customMode1();
    const t = withExamTimeout(d, 45);
    expect(updateChecksum(d, t)).toEqual(t);
    expect(diffBits(d, t).map((x) => x.offset)).toEqual([0x480, 0x480]);
  });
});
