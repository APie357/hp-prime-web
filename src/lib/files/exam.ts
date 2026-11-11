/**
 * Exam-mode configurations (calculator object type `0B`, Connectivity Kit `.hpexammode` files).
 *
 * HP doesn't document the layout. What's here comes from a single sample, the IB Diploma
 * Programme configuration on hpcalc.org (1156 bytes), plus the option list in HP's guides:
 * name, read-only, timeout, default angle, password, memory (keep/erase/hide), Blink LED, and a
 * tree of features to disable (System Apps → each app → its functions, Help, CAS, Units,
 * Matrices, Notes and Programs, the Math menu down to single commands, …).
 *
 * - Bytes 0–63: the name, UTF-16LE, NUL-padded (clear in the sample: "IB Exam Mode").
 * - Bytes 64–1151: settings and the disabled-feature bits. Not mapped yet.
 * - Bytes 1152–1155: `78 00 07 00` in the sample; maybe a timeout of 120 minutes and flags.
 *
 * So the editor shows the name and the raw bits (with a compare view for mapping them), and
 * keeps every byte it doesn't understand as it was. Whether the calculator's type-0B object body
 * is byte-for-byte the same as the `.hpexammode` file is also unconfirmed.
 */

export const EXAM_EXT = '.hpexammode';
export const EXAM_NAME_BYTES = 64;
/** Size of the sample; the editor warns about other sizes but keeps them as they are. */
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
  return out;
}

/** Exam configuration names: anything printable that fits the name field. */
export function isValidExamName(name: string): boolean {
  return name.length > 0 && name.length <= EXAM_NAME_MAX && !/[\x00-\x1f/\\:*?"<>|]/.test(name);
}

export function examFileFor(name: string): string {
  return name + EXAM_EXT;
}

/** Byte `offset`, bit `bit` (0 = least significant). */
export const getBit = (data: Uint8Array, offset: number, bit: number) => ((data[offset] ?? 0) >> bit) & 1;

export function setBit(data: Uint8Array, offset: number, bit: number, on: boolean): Uint8Array {
  const out = data.slice();
  if (offset >= out.length) return out;
  out[offset] = on ? out[offset] | (1 << bit) : out[offset] & ~(1 << bit);
  return out;
}

/** One differing bit between two configurations. */
export interface BitDiff {
  offset: number;
  bit: number;
  a: number;
  b: number;
}

/** Every bit that differs past the name, for mapping settings by changing one at a time. */
export function diffBits(a: Uint8Array, b: Uint8Array, from = EXAM_NAME_BYTES): BitDiff[] {
  const out: BitDiff[] = [];
  const n = Math.max(a.length, b.length);
  for (let off = from; off < n; off++) {
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

/**
 * A setting whose place in the file is known. Empty until mapped on hardware: change one option
 * on the calculator, send the configuration, and compare it with the previous one.
 */
export interface ExamFeature {
  label: string;
  offset: number;
  bit: number;
  /** Nesting under a parent feature (0 = top level). */
  depth?: number;
}

export const EXAM_FEATURES: ExamFeature[] = [];
