/**
 * `.hpprgm` program files (HP Connectivity Kit). Format in docs/formats/hpprgm.md; layout from
 * Insoft's Xprime (`hpppl+/src/libhpprgm/src/hpprgm.cpp`, MIT).
 *
 * These are files only. Never send this container to the calculator: the calculator takes the
 * raw UTF-16LE source (see docs/formats/program.md), and the container's NULs truncate it.
 */

const MAGIC = [0x7c, 0x61, 0x8a, 0xb2];
/** Tag in front of the source text in the G2 format. */
const SOURCE_TAG = [0x9b, 0x00, 0xc0, 0x00];

export type HpprgmFormat = 'g1' | 'g2';

export interface DecodedHpprgm {
  source: string;
  format: HpprgmFormat;
  /** Program name stored in a named G1 file (G2 files don't carry one). */
  name?: string;
}

const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

function startsWith(b: Uint8Array, at: number, sig: number[]): boolean {
  return sig.every((x, i) => b[at + i] === x);
}

/** UTF-16LE text up to `end` or the first NUL; line endings normalized to `\n`. */
function utf16Text(b: Uint8Array, start: number, end: number): string {
  let s = '';
  for (let i = start; i + 1 < Math.min(end, b.length); i += 2) {
    const c = b[i] | (b[i + 1] << 8);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
}

function decodeG2(b: Uint8Array): DecodedHpprgm | null {
  if (!startsWith(b, 0, MAGIC)) return null;
  // The source record: [u32 length (tag + text)][9B 00 C0 00][UTF-16LE text, NUL].
  // A compiled block may come before it, so search for the tag (records are 2-byte aligned).
  for (let i = 8; i + 4 <= b.length; i += 2) {
    if (!startsWith(b, i, SOURCE_TAG)) continue;
    const len = u32(b, i - 4);
    const end = len >= 4 && i - 4 + 4 + len <= b.length ? i + len : b.length;
    return { source: utf16Text(b, i + 4, end), format: 'g2' };
  }
  return null;
}

function decodeG1(b: Uint8Array): DecodedHpprgm | null {
  if (b.length < 20) return null;
  // [u32 header size][4 × 00][named flag][7 × 00] then, if named, [31 00][name UTF-16LE, NUL];
  // then [u32 source size][source]. Header size is 0x0C unnamed, 14 + name bytes when named.
  const headerSize = u32(b, 0);
  const named = b[8] === 1;
  if (headerSize < 12 || headerSize + 8 > b.length) return null;
  if (!named && headerSize !== 0x0c) return null;
  const size = u32(b, headerSize + 4);
  const start = headerSize + 8;
  if (start + size > b.length + 2) return null;
  const name = named && b[16] === 0x31 && b[17] === 0 ? utf16Text(b, 18, headerSize + 4) : undefined;
  return { source: utf16Text(b, start, start + size), format: 'g1', ...(name ? { name } : {}) };
}

/** Read an `.hpprgm` file (G2 or G1). Throws when it's neither. */
export function decodeHpprgm(bytes: Uint8Array): DecodedHpprgm {
  const r = decodeG2(bytes) ?? decodeG1(bytes);
  if (!r) throw new Error("not an .hpprgm program file (or a kind this IDE can't read yet)");
  return r;
}

// -------------------------------------------------------------------- encode

class Out {
  bytes: number[] = [];
  u16(v: number) {
    this.bytes.push(v & 0xff, (v >> 8) & 0xff);
  }
  u32(v: number) {
    this.bytes.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
  }
  raw(b: ArrayLike<number>) {
    for (let i = 0; i < b.length; i++) this.bytes.push(b[i]);
  }
  /** UTF-16LE in a fixed-size, NUL-padded field. */
  fixed16(s: string, size = 64) {
    for (let i = 0; i < size / 2; i++) this.u16(i < s.length ? s.charCodeAt(i) : 0);
  }
}

function utf16z(s: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out.push(c & 0xff, c >> 8);
  }
  out.push(0, 0);
  return out;
}

export interface HpprgmProcedure {
  name: string;
  exported: boolean;
}

/**
 * Write a G2 (current Connectivity Kit) `.hpprgm`: header, one record per procedure, then the
 * source record. Lengths count the bytes after themselves.
 */
export function encodeHpprgm(source: string, procedures: HpprgmProcedure[], cas = false): Uint8Array {
  const text = utf16z(source.replace(/\r\n?/g, '\n'));
  const o = new Out();
  o.raw(MAGIC);
  o.raw([0xfe, 0xff, 0xff, 0xff, 0, 0, 0, 0]);

  // Procedures: [u32 88n + 4][3E 02 00 01] then 88 bytes each.
  o.u32(procedures.length * 88 + 4);
  o.u16(0x023e);
  o.u16(0x0100);
  for (const p of procedures) {
    o.u32(84);
    o.u32(68);
    o.u16(0x020b);
    o.u16(64);
    o.fixed16(p.name);
    o.u32(8);
    o.u16(0x0205);
    o.u16(0x0080);
    o.u16(p.exported ? 9 : 8);
    o.u16(0);
  }

  // Source: [u32 P + 100][BE 00 40 01][u32 P + 92][u32 68][8B 00 40 00]["Main", 64 B]
  //         [u32 8][85 00 80 00][u32 CAS ? 2 : 0][u32 P + 4][9B 00 C0 00][text, NUL]
  const p = text.length;
  o.u32(p + 100);
  o.u16(0x00be);
  o.u16(0x0140);
  o.u32(p + 92);
  o.u32(68);
  o.u16(0x008b);
  o.u16(0x0040);
  o.fixed16('Main');
  o.u32(8);
  o.u16(0x0085);
  o.u16(0x0080);
  o.u32(cas ? 2 : 0);
  o.u32(p + 4);
  o.raw(SOURCE_TAG);
  o.raw(text);
  return Uint8Array.from(o.bytes);
}

/** Write a G1 `.hpprgm` (older Connectivity Kit), optionally with the program name inside. */
export function encodeHpprgmG1(source: string, name?: string): Uint8Array {
  const text = utf16z(source.replace(/\r\n?/g, '\n'));
  const o = new Out();
  const nameBytes = name ? utf16z(name) : [];
  o.u32(name ? 14 + nameBytes.length : 0x0c);
  o.u32(0);
  o.raw([name ? 1 : 0, 0, 0, 0, 0, 0, 0, 0]);
  if (name) {
    o.u16(0x0031);
    o.raw(nameBytes);
  }
  o.u32(text.length);
  o.raw(text);
  return Uint8Array.from(o.bytes);
}
