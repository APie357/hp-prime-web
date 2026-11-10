import { describe, expect, it } from 'vitest';
import { zlibSync } from 'fflate';
import { concat, fromUtf16le, hex, parseHex, u32be, utf16le } from '../src/lib/hid/bytes';
import { crc16 } from '../src/lib/hid/crc16';
import * as C from '../src/lib/hid/commands';
import { LegacyFraming, SequenceError, nextSeq } from '../src/lib/hid/framing';
import { decodePrimePng16, parseFileMessage, parseInfo, parseScreenMessage } from '../src/lib/hid/parsers';

// Fixtures computed independently with Python's binascii.crc_hqx.
const EB_ZZT_TEST =
  'EB 01 00 00 00 14 06 10 66 C9 5A 00 5A 00 54 00 5F 00 54 00 45 00 53 00 54 00';
const F7_HI =
  'F7 01 00 00 00 34 06 04 BC 43 48 00 49 00 45 00 58 00 50 00 4F 00 52 00 54 00 20 00 48 00 49 00 28 00 29 00 0A 00 42 00 45 00 47 00 49 00 4E 00 0A 00 45 00 4E 00 44 00 3B 00';
const F8_HI = 'F8 01 00 00 00 0A 06 06 4A 49 48 00 49 00 00 00';

describe('crc16', () => {
  it('matches CRC-16/XMODEM check value', () => {
    expect(crc16(new TextEncoder().encode('123456789'))).toBe(0x31c3);
  });
});

describe('commands', () => {
  it('builds the documented EB delete fixture', () => {
    expect(hex(C.deleteObject(C.ObjType.PROGRAM, 'ZZT_TEST'))).toBe(EB_ZZT_TEST);
  });
  it('builds F7 program upload', () => {
    const msg = C.sendFile(C.ObjType.PROGRAM, 'HI', utf16le('EXPORT HI()\nBEGIN\nEND;'));
    expect(hex(msg)).toBe(F7_HI);
  });
  it('builds F8 request with NUL-terminated name', () => {
    expect(hex(C.requestFile(C.ObjType.PROGRAM, 'HI'))).toBe(F8_HI);
  });
  it('builds simple commands', () => {
    expect(hex(C.checkReady())).toBe('FF');
    expect(hex(C.requestScreen(8))).toBe('FC 08');
    expect(hex(C.sendKeys([4]))).toBe('EC 01 00 00 00 01 04');
  });
  it('validates program names', () => {
    expect(C.isValidProgramName('WEBTEST')).toBe(true);
    expect(C.isValidProgramName('my_prog2')).toBe(true);
    expect(C.isValidProgramName('2bad')).toBe(false);
    expect(C.isValidProgramName('has space')).toBe(false);
  });
});

describe('legacy framing', () => {
  for (const size of [64, 1024]) {
    it(`fragments and reassembles at report size ${size}`, () => {
      const f = new LegacyFraming(size - 1);
      const body = new Uint8Array(5000).map((_, i) => (i * 7) & 0xff);
      const msg = C.withLengthHeader(0xf7, body);
      const reports = f.fragment(msg);
      expect(reports.length).toBe(Math.ceil(msg.length / (size - 1)));
      expect(reports.every((r) => r.length <= size)).toBe(true);
      expect(reports.map((r) => r[0]).slice(0, 3)).toEqual([0, 1, 2]);
      // Device-side reports arrive zero-padded to the full report size.
      const re = f.createReassembler();
      let out: Uint8Array | null = null;
      for (const r of reports) {
        const padded = new Uint8Array(size);
        padded.set(r);
        out = re.push(padded);
      }
      expect(out).not.toBeNull();
      expect(hex(out!)).toBe(hex(msg));
    });
  }

  it('wraps sequence 0xFE → 0x00, skipping 0xFF', () => {
    expect(nextSeq(0xfd)).toBe(0xfe);
    expect(nextSeq(0xfe)).toBe(0x00);
    const f = new LegacyFraming(63);
    const msg = C.withLengthHeader(0xf7, new Uint8Array(63 * 300));
    const seqs = f.fragment(msg).map((r) => r[0]);
    expect(seqs).not.toContain(0xff);
    expect(seqs[254]).toBe(0xfe);
    expect(seqs[255]).toBe(0x00);
    const re = f.createReassembler();
    let out: Uint8Array | null = null;
    for (const r of f.fragment(msg)) out = re.push(r);
    expect(out?.length).toBe(msg.length);
  });

  it('skips out-of-band 0xFF reports and handles the ready reply', () => {
    const re = new LegacyFraming(63).createReassembler();
    expect(re.push(Uint8Array.of(0xff, 0x12, 0x34))).toBeNull();
    const pad = new Uint8Array(64);
    pad[0] = 0;
    pad[1] = 0x59;
    expect(hex(re.push(pad)!)).toBe('59');
  });

  it('rejects out-of-sequence continuation', () => {
    const re = new LegacyFraming(63).createReassembler();
    const first = new Uint8Array(64);
    first.set([0, 0xf7, 0x01, ...u32be(200)]);
    expect(re.push(first)).toBeNull();
    const bad = new Uint8Array(64);
    bad[0] = 5;
    expect(() => re.push(bad)).toThrow(SequenceError);
  });
});

describe('parsers', () => {
  it('round-trips F7 file messages', () => {
    const f = parseFileMessage(parseHex(F7_HI));
    expect(f.type).toBe(C.ObjType.PROGRAM);
    expect(f.name).toBe('HI');
    expect(f.crcOk).toBe(true);
    expect(fromUtf16le(f.data)).toBe('EXPORT HI()\nBEGIN\nEND;');
  });

  it('flags bad CRC', () => {
    const m = parseHex(F7_HI);
    m[20] ^= 1;
    expect(parseFileMessage(m).crcOk).toBe(false);
  });

  it('extracts info strings', () => {
    const body = concat([0, 0, 0, 0], utf16le('Sample Calculator'), [0, 0, 9, 9], utf16le('V2.060.650'), [0, 0], utf16le('SN00000001'));
    const info = parseInfo(C.withLengthHeader(0xfa, body));
    expect(info.firmware).toBe('V2.060.650');
    expect(info.serial).toBe('SN00000001');
    expect(info.name).toBe('Sample Calculator');
  });

  it('parses screenshot envelope and decodes RGB555LE samples', () => {
    const png = make16BitGrayPng(2, 1, [
      [0x00, 0x7c], // LE 0x7C00 → pure red in RGB555
      [0x1f, 0x00], // LE 0x001F → pure blue
    ]);
    const body = concat([0, 0, 0x08, 0xff, 0xff, 0xff, 0xff], png);
    const msg = C.withLengthHeader(0xfc, body);
    const crc = crc16(msg, 6, msg.length);
    msg[6] = crc >> 8;
    msg[7] = crc & 0xff;
    const s = parseScreenMessage(msg);
    expect(s.crcOk).toBe(true);
    expect(s.format).toBe(8);
    const img = decodePrimePng16(s.png)!;
    expect(img.width).toBe(2);
    expect(Array.from(img.data.slice(0, 4))).toEqual([255, 0, 0, 255]);
    expect(Array.from(img.data.slice(4, 8))).toEqual([0, 0, 255, 255]);
  });
});

function make16BitGrayPng(w: number, h: number, samples: [number, number][]): Uint8Array {
  const raw: number[] = [];
  for (let y = 0; y < h; y++) {
    raw.push(0);
    for (let x = 0; x < w; x++) raw.push(...samples[y * w + x]);
  }
  const chunk = (type: string, data: Uint8Array) =>
    concat(u32be(data.length), new TextEncoder().encode(type), data, [0, 0, 0, 0]);
  const ihdr = concat(u32be(w), u32be(h), [16, 0, 0, 0, 0]);
  return concat(
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    chunk('IHDR', ihdr),
    chunk('IDAT', zlibSync(Uint8Array.from(raw))),
    chunk('IEND', new Uint8Array(0)),
  );
}
