/**
 * Exam-mode configurations (calculator object type `0B`, Connectivity Kit `.hpexammode` files).
 * The layout and how it was found are in docs/formats/exam-mode.md.
 *
 * 1156 bytes:
 * - 0x000 name, UTF-16LE, NUL-padded (64 bytes)
 * - 0x040 disabled-feature bits (only CAS is mapped: 0x040 bit 7)
 * - 0x41C checksum: CRC-32 (reflected 0x04C11DB7) over the whole file with this field zeroed,
 *   with an init/xorout we don't know. It's linear, so it can be updated exactly from the bytes
 *   that changed (see `updateChecksum`).
 * - 0x440 password hash (64 bytes). Depends only on the password; can't be computed, only copied.
 * - 0x480 timeout in minutes, u16 LE
 * - 0x482 option flags, u16 LE: memory (bits 0, 8), angle (bits 2–3), LED (bits 1, 5, 6)
 *
 * Everything not decoded is kept byte for byte.
 */

export const EXAM_EXT = '.hpexammode';
export const EXAM_NAME_BYTES = 64;
/** Size of every configuration seen so far (G2 and Connectivity Kit). */
export const EXAM_SAMPLE_SIZE = 1156;

/** The name stored in the first 64 bytes (UTF-16LE up to the first NUL). */
export function examName(data: Uint8Array): string {
  let s = '';
  for (let i = 0; i + 1 < Math.min(EXAM_NAME_BYTES, data.length); i += 2) {
    const c = data[i] | (data[i + 1] << 8);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

/** Longest name that fits with a NUL terminator. */
export const EXAM_NAME_MAX = EXAM_NAME_BYTES / 2 - 1;

/** A copy of `data` with the stored name replaced (truncated to fit, rest of the field zeroed). */
export function withExamName(data: Uint8Array, name: string): Uint8Array {
  const out = new Uint8Array(Math.max(data.length, EXAM_NAME_BYTES));
  out.set(data);
  out.fill(0, 0, EXAM_NAME_BYTES);
  const s = name.slice(0, EXAM_NAME_MAX);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out[i * 2] = c & 0xff;
    out[i * 2 + 1] = c >> 8;
  }
  return updateChecksum(data, out);
}

/** Exam configuration names: anything printable that fits the name field. */
export function isValidExamName(name: string): boolean {
  return name.length > 0 && name.length <= EXAM_NAME_MAX && !/[\x00-\x1f/\\:*?"<>|]/.test(name);
}

export function examFileFor(name: string): string {
  return name + EXAM_EXT;
}

// ------------------------------------------------------------------ checksum

export const EXAM_CRC_OFFSET = 0x41c;

/**
 * CRC-32 register update (reflected polynomial 0x04C11DB7) with init 0 and no final XOR. Linear:
 * raw(a ^ b) = raw(a) ^ raw(b) for equal-length inputs, and leading zero bytes don't change it.
 */
export function rawCrc32(data: Uint8Array): number {
  let c = 0;
  for (const b of data) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return c >>> 0;
}

const readU32 = (d: Uint8Array, o: number) => (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0;

function writeU32(d: Uint8Array, o: number, v: number): void {
  d[o] = v & 0xff;
  d[o + 1] = (v >>> 8) & 0xff;
  d[o + 2] = (v >>> 16) & 0xff;
  d[o + 3] = (v >>> 24) & 0xff;
}

function hasChecksumField(d: Uint8Array): boolean {
  return d.length >= EXAM_CRC_OFFSET + 4;
}

/**
 * The checksum is raw CRC-32 of the file (field zeroed) XOR a constant. All 12 G2 samples fit
 * both of these: from byte 0 (the name is covered) or from 0x40 (it isn't). Every sample has the
 * same name, so which one is right is still open.
 */
const CRC_CONSTANTS = [
  { from: 0, k: 0x364fb76b },
  { from: 0x40, k: 0x9a78cba3 },
];

function zeroedField(d: Uint8Array, from = 0): Uint8Array {
  const z = d.slice(from);
  if (hasChecksumField(d)) z.fill(0, EXAM_CRC_OFFSET - from, EXAM_CRC_OFFSET - from + 4);
  return z;
}

/** `none`: the field is zero (older Connectivity Kit files); `ok`: matches; `unknown`: doesn't fit. */
export function checksumStatus(d: Uint8Array): 'none' | 'ok' | 'unknown' {
  if (!hasChecksumField(d)) return 'none';
  const stored = readU32(d, EXAM_CRC_OFFSET);
  if (stored === 0) return 'none';
  return CRC_CONSTANTS.some(({ from, k }) => ((rawCrc32(zeroedField(d, from)) ^ k) >>> 0) === stored) ? 'ok' : 'unknown';
}

/**
 * `next` with its checksum updated for what changed since `prev`: the old value XOR the raw CRC
 * of the difference. Exact for any change after the name; for a name change it assumes the name
 * is covered. Files without a checksum (field zero) are left alone.
 */
export function updateChecksum(prev: Uint8Array, next: Uint8Array): Uint8Array {
  if (!hasChecksumField(prev) || !hasChecksumField(next) || prev.length !== next.length) return next;
  const old = readU32(prev, EXAM_CRC_OFFSET);
  if (old === 0) return next;
  const a = zeroedField(prev);
  const b = zeroedField(next);
  for (let i = 0; i < a.length; i++) a[i] ^= b[i];
  const out = next.slice();
  writeU32(out, EXAM_CRC_OFFSET, (old ^ rawCrc32(a)) >>> 0);
  return out;
}

// ------------------------------------------------------------------ timeout

/** Timeout: u16 little-endian minutes. */
export const EXAM_TIMEOUT_OFFSET = 0x480;
/** The calculator's longest timeout (HP Prime User Guide: "8 hours is the maximum period"). */
export const EXAM_TIMEOUT_MAX = 8 * 60;

const readU16 = (d: Uint8Array, o: number) => d[o] | (d[o + 1] << 8);

/** Timeout in minutes, or null when the data is too short to hold it. */
export function examTimeout(data: Uint8Array): number | null {
  if (data.length < EXAM_TIMEOUT_OFFSET + 2) return null;
  return readU16(data, EXAM_TIMEOUT_OFFSET);
}

export function withExamTimeout(data: Uint8Array, minutes: number): Uint8Array {
  if (data.length < EXAM_TIMEOUT_OFFSET + 2) return data;
  const out = data.slice();
  const m = Math.max(1, Math.min(EXAM_TIMEOUT_MAX, Math.round(minutes)));
  out[EXAM_TIMEOUT_OFFSET] = m & 0xff;
  out[EXAM_TIMEOUT_OFFSET + 1] = m >> 8;
  return updateChecksum(data, out);
}

// ------------------------------------------------------------------ options (flags)

export const EXAM_FLAGS_OFFSET = 0x482;

export type ExamMemory = 'keep' | 'erase' | 'keep-restore' | 'hide';
export type ExamAngle = 'none' | 'radians' | 'degrees' | 'gradians';
export type ExamLed = 'off' | 'blink' | 'security' | 'other';

export const MEMORY_LABELS: Record<ExamMemory, string> = {
  keep: 'Keep',
  erase: 'Erase',
  'keep-restore': 'Keep and restore',
  hide: 'Hide',
};
export const ANGLE_LABELS: Record<ExamAngle, string> = {
  none: 'No change',
  radians: 'Radians',
  degrees: 'Degrees',
  gradians: 'Gradians',
};
export const LED_LABELS: Record<ExamLed, string> = {
  off: 'Off',
  blink: 'Blink LED',
  security: 'Blink LED with security code',
  other: 'Other (not seen yet)',
};

/** Memory: bit 0 = cleared during the exam, bit 8 = restored afterwards. */
const MEMORY_BITS: Record<ExamMemory, number> = { keep: 0, erase: 0x001, 'keep-restore': 0x100, hide: 0x101 };
const ANGLES: ExamAngle[] = ['none', 'radians', 'degrees', 'gradians'];
/** LED: one of three bit patterns seen on the G2 (bit 7, always set on the G2, is kept as-is). */
const LED_MASK = 0x62;
const LED_BITS: Record<Exclude<ExamLed, 'other'>, number> = { off: 0, blink: 0x22, security: 0x40 };

export interface ExamOptions {
  memory: ExamMemory;
  angle: ExamAngle;
  led: ExamLed;
}

export function examOptions(data: Uint8Array): ExamOptions | null {
  if (data.length < EXAM_FLAGS_OFFSET + 2) return null;
  const f = readU16(data, EXAM_FLAGS_OFFSET);
  const mem = (Object.keys(MEMORY_BITS) as ExamMemory[]).find((k) => MEMORY_BITS[k] === (f & 0x101))!;
  const led = (Object.keys(LED_BITS) as Exclude<ExamLed, 'other'>[]).find((k) => LED_BITS[k] === (f & LED_MASK)) ?? 'other';
  return { memory: mem, angle: ANGLES[(f >> 2) & 3], led };
}

export function withExamOptions(data: Uint8Array, change: Partial<ExamOptions>): Uint8Array {
  if (data.length < EXAM_FLAGS_OFFSET + 2) return data;
  let f = readU16(data, EXAM_FLAGS_OFFSET);
  if (change.memory) f = (f & ~0x101) | MEMORY_BITS[change.memory];
  if (change.angle) f = (f & ~0x0c) | (ANGLES.indexOf(change.angle) << 2);
  if (change.led && change.led !== 'other') f = (f & ~LED_MASK) | LED_BITS[change.led];
  const out = data.slice();
  out[EXAM_FLAGS_OFFSET] = f & 0xff;
  out[EXAM_FLAGS_OFFSET + 1] = f >> 8;
  return updateChecksum(data, out);
}

// ------------------------------------------------------------------ password

/** Password hash: 64 bytes that depend only on the password (same in every blank-password sample). */
export const EXAM_PASSWORD_RANGE = [0x440, 0x480] as const;

export function samePassword(a: Uint8Array, b: Uint8Array): boolean {
  const [s, e] = EXAM_PASSWORD_RANGE;
  if (a.length < e || b.length < e) return false;
  for (let i = s; i < e; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** `data` with the password copied from `source`. */
export function withPasswordFrom(data: Uint8Array, source: Uint8Array): Uint8Array {
  const [s, e] = EXAM_PASSWORD_RANGE;
  if (data.length < e || source.length < e) return data;
  const out = data.slice();
  out.set(source.subarray(s, e), s);
  return updateChecksum(data, out);
}

// ------------------------------------------------------------------ bits

/** Byte `offset`, bit `bit` (0 = least significant). */
export const getBit = (data: Uint8Array, offset: number, bit: number) => ((data[offset] ?? 0) >> bit) & 1;

export function setBit(data: Uint8Array, offset: number, bit: number, on: boolean): Uint8Array {
  if (offset >= data.length) return data;
  const out = data.slice();
  out[offset] = on ? out[offset] | (1 << bit) : out[offset] & ~(1 << bit);
  return updateChecksum(data, out);
}

/** One differing bit between two configurations. */
export interface BitDiff {
  offset: number;
  bit: number;
  a: number;
  b: number;
}

/** Every bit that differs past the name (checksum excluded), for mapping settings one at a time. */
export function diffBits(a: Uint8Array, b: Uint8Array, from = EXAM_NAME_BYTES): BitDiff[] {
  const out: BitDiff[] = [];
  const n = Math.max(a.length, b.length);
  for (let off = from; off < n; off++) {
    if (off >= EXAM_CRC_OFFSET && off < EXAM_CRC_OFFSET + 4) continue;
    const x = a[off] ?? 0;
    const y = b[off] ?? 0;
    if (x === y) continue;
    for (let bit = 0; bit < 8; bit++) {
      const p = (x >> bit) & 1;
      const q = (y >> bit) & 1;
      if (p !== q) out.push({ offset: off, bit, a: p, b: q });
    }
  }
  return out;
}

/** A disabled-feature bit whose place in the file is known. */
export interface ExamFeature {
  label: string;
  offset: number;
  bit: number;
  /** Nesting under a parent feature (0 = top level). */
  depth?: number;
}

/** Mapped so far on the G2. The rest of 0x040–0x41B is shown as raw bits. */
export const EXAM_FEATURES: ExamFeature[] = [{ label: 'CAS', offset: 0x40, bit: 7 }];
