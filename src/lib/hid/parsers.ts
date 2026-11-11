/** Reply parsers: device info, file messages, screenshots. */
import { unzlibSync } from 'fflate';
import { fromUtf16le, readU16le, readU32be } from './bytes';
import { crc16 } from './crc16';
import { CMD } from './commands';

// ---------------------------------------------------------------- info (FA)

export interface DeviceInfo {
  raw: Uint8Array;
  strings: string[];
  firmware?: string;
  name?: string;
  serial?: string;
}

/** Printable UTF-16LE runs (Latin text has a zero high byte). */
function utf16Runs(b: Uint8Array, min = 3): string[] {
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i + 1 < b.length; i += 2) {
    const u = b[i] | (b[i + 1] << 8);
    if (b[i + 1] === 0 && u >= 0x20 && u < 0x7f) cur += String.fromCharCode(u);
    else {
      if (cur.trim().length >= min) out.push(cur.trim());
      cur = '';
    }
  }
  if (cur.trim().length >= min) out.push(cur.trim());
  return out;
}

function asciiRuns(b: Uint8Array, min = 4): string[] {
  const out: string[] = [];
  let cur = '';
  for (const c of b) {
    if (c >= 0x20 && c < 0x7f) cur += String.fromCharCode(c);
    else {
      if (cur.length >= min) out.push(cur);
      cur = '';
    }
  }
  if (cur.length >= min) out.push(cur);
  return out;
}

/**
 * The FA reply layout is not documented; like pck we extract printable
 * strings and pick fields heuristically (observed order: name, version, serial).
 */
export function parseInfo(msg: Uint8Array): DeviceInfo {
  const body = msg.length > 6 && msg[1] === 0x01 ? msg.subarray(6) : msg;
  const strings = utf16Runs(body);
  for (const a of asciiRuns(body)) {
    if (!strings.some((s) => s.includes(a) || a.includes(s))) strings.push(a);
  }
  const firmware = strings.find((s) => s.includes('.') && /\d/.test(s) && s.length >= 3);
  const serial = [...strings]
    .reverse()
    .find((s) => s.length >= 8 && /\d/.test(s) && /^[A-Za-z0-9]+$/.test(s));
  const name = strings.find((s) => s !== firmware && s !== serial && /[A-Za-z ]/.test(s));
  return { raw: msg, strings, firmware, name, serial };
}

// ------------------------------------------------------------ files (F7)

export interface PrimeFile {
  type: number;
  name: string;
  data: Uint8Array;
  crcOk: boolean;
  compressed: boolean;
}

/**
 * Decode an F7 file message:
 *   F7 01 len(u32BE) type namelen crcLo crcHi name(UTF-16LE) data…
 * Some firmware zlib-compresses the body (0x78 right after the CRC field,
 * per PrimeDev); that case is inflated before decoding the name/data.
 */
export function parseFileMessage(msg: Uint8Array): PrimeFile {
  if (msg.length < 10 || msg[0] !== CMD.FILE) throw new Error('not an F7 file message');
  const declared = readU32be(msg, 2);
  if (msg[1] !== 0x01 || declared + 6 !== msg.length) {
    throw new Error(`file header/length mismatch (declared ${declared + 6}, got ${msg.length})`);
  }
  const embedded = readU16le(msg, 8);
  const copy = msg.slice();
  copy[8] = 0;
  copy[9] = 0;
  const crcOk = crc16(copy, 0, msg.length - 6) === embedded;

  let m = msg;
  let compressed = false;
  if (msg[8] === 0 && msg[9] === 0 && msg[10] === 0x78) {
    try {
      const inflated = unzlibSync(msg.subarray(10));
      m = inflated;
      compressed = true;
    } catch {
      /* not actually compressed */
    }
  }
  const type = m[6];
  const nameLen = m[7];
  const name = fromUtf16le(m.subarray(10, 10 + nameLen));
  return { type, name, data: m.slice(10 + nameLen), crcOk, compressed };
}

// --------------------------------------------------------------- chat (F2)

/** `F2 01 len(u32BE) text(UTF-16LE) 00 00`, sent by the calculator unprompted. */
export function parseChat(msg: Uint8Array): string {
  if (msg.length < 6 || msg[0] !== CMD.CHAT || msg[1] !== 0x01) throw new Error('not a chat message');
  const len = readU32be(msg, 2);
  return fromUtf16le(msg.subarray(6, 6 + len));
}

// ------------------------------------------------------- screenshot (FC)

export interface ScreenPayload {
  format: number;
  png: Uint8Array;
  crcOk: boolean;
}

/** `FC 01 len CRC16(BE) fmt FF FF FF FF PNG…` — CRC covers bytes 6…end with its own bytes zeroed. */
export function parseScreenMessage(msg: Uint8Array): ScreenPayload {
  if (msg.length <= 13 || msg[0] !== CMD.SCREEN) throw new Error('not a screenshot reply');
  const embedded = (msg[6] << 8) | msg[7];
  const copy = msg.slice();
  copy[6] = 0;
  copy[7] = 0;
  const crcOk = crc16(copy, 6, copy.length) === embedded;
  const format = msg[8];
  if (!(msg[9] === 0xff && msg[10] === 0xff && msg[11] === 0xff && msg[12] === 0xff)) {
    throw new Error('screenshot reply has no complete-image marker (partial/incremental frame)');
  }
  return { format, png: msg.slice(13), crcOk };
}

export type PixelMode = 'rgb555le' | 'rgb565be' | 'gray';

export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/**
 * Minimal PNG decoder for the Prime's 16-bit grayscale screenshots, whose
 * samples are really packed RGB. Returns null for any other PNG kind (the
 * caller should let the browser decode those).
 */
export function decodePrimePng16(png: Uint8Array, mode: PixelMode = 'rgb555le'): RgbaImage | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.length < 33 || sig.some((v, i) => png[i] !== v)) throw new Error('not a PNG');
  let off = 8;
  let width = 0;
  let height = 0;
  const idat: Uint8Array[] = [];
  while (off + 8 <= png.length) {
    const len = readU32be(png, off);
    const type = String.fromCharCode(png[off + 4], png[off + 5], png[off + 6], png[off + 7]);
    const data = png.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = readU32be(data, 0);
      height = readU32be(data, 4);
      const depth = data[8];
      const color = data[9];
      const interlace = data[12];
      if (depth !== 16 || color !== 0 || interlace !== 0) return null;
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (!width || !height) throw new Error('PNG without IHDR');
  const total = idat.reduce((n, d) => n + d.length, 0);
  const z = new Uint8Array(total);
  let o = 0;
  for (const d of idat) {
    z.set(d, o);
    o += d.length;
  }
  const raw = unzlibSync(z);
  const bpp = 2;
  const stride = width * bpp;
  const pixels = new Uint8Array(stride * height);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const ft = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = pixels.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      switch (ft) {
        case 0:
          break;
        case 1:
          v += a;
          break;
        case 2:
          v += b;
          break;
        case 3:
          v += (a + b) >> 1;
          break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          break;
        }
        default:
          throw new Error(`bad PNG filter ${ft}`);
      }
      cur[x] = v & 0xff;
    }
    prev = cur;
  }
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const b0 = pixels[i * 2];
    const b1 = pixels[i * 2 + 1];
    let r: number, g: number, b: number;
    if (mode === 'rgb555le') {
      const v = b0 | (b1 << 8);
      const r5 = (v >> 10) & 31,
        g5 = (v >> 5) & 31,
        b5 = v & 31;
      r = (r5 << 3) | (r5 >> 2);
      g = (g5 << 3) | (g5 >> 2);
      b = (b5 << 3) | (b5 >> 2);
    } else if (mode === 'rgb565be') {
      const v = (b0 << 8) | b1;
      const r5 = (v >> 11) & 31,
        g6 = (v >> 5) & 63,
        b5 = v & 31;
      r = (r5 << 3) | (r5 >> 2);
      g = (g6 << 2) | (g6 >> 4);
      b = (b5 << 3) | (b5 >> 2);
    } else {
      r = g = b = b0;
    }
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = 255;
  }
  return { width, height, data: out };
}
