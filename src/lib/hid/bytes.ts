/** Small byte helpers shared by the protocol layers. */

export function u32be(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

export function readU32be(b: Uint8Array, off: number): number {
  return ((b[off] << 24) | (b[off + 1] << 16) | (b[off + 2] << 8) | b[off + 3]) >>> 0;
}

export function readU16le(b: Uint8Array, off: number): number {
  return b[off] | (b[off + 1] << 8);
}

export function concat(...parts: (Uint8Array | number[])[]): Uint8Array {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Encode a JS string as UTF-16LE bytes (no BOM, no terminator). */
export function utf16le(s: string): Uint8Array {
  const out = new Uint8Array(s.length * 2);
  for (let i = 0; i < s.length; i++) {
    const u = s.charCodeAt(i);
    out[i * 2] = u & 0xff;
    out[i * 2 + 1] = u >> 8;
  }
  return out;
}

/** Decode UTF-16LE bytes, dropping a leading BOM and trailing NULs. */
export function fromUtf16le(b: Uint8Array): string {
  let start = 0;
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) start = 2;
  let end = b.length - ((b.length - start) % 2);
  while (end - 2 >= start && b[end - 2] === 0 && b[end - 1] === 0) end -= 2;
  const units: number[] = [];
  for (let i = start; i < end; i += 2) units.push(b[i] | (b[i + 1] << 8));
  // Chunk to avoid call-stack limits on large programs.
  let s = '';
  for (let i = 0; i < units.length; i += 8192) {
    s += String.fromCharCode(...units.slice(i, i + 8192));
  }
  return s;
}

export function hex(b: Uint8Array | number[], max = Infinity): string {
  const n = Math.min(b.length, max);
  let s = '';
  for (let i = 0; i < n; i++) s += (i ? ' ' : '') + b[i].toString(16).padStart(2, '0').toUpperCase();
  if (b.length > n) s += ` … (+${b.length - n} B)`;
  return s;
}

export function parseHex(s: string): Uint8Array {
  const clean = s.replace(/0x/gi, '').replace(/[^0-9a-f]/gi, '');
  if (clean.length % 2) throw new Error('odd number of hex digits');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
