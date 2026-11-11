/**
 * Application-layer message builders. Byte layouts follow hplp's
 * `prime_cmd.c` plus modern findings (see AGENTS.md → Protocol findings).
 */
import { concat, u32be, utf16le } from './bytes';
import { crc16 } from './crc16';

export const CMD = {
  READY: 0xff,
  INFO: 0xfa,
  SCREEN: 0xfc,
  BACKUP: 0xf9,
  REQ_FILE: 0xf8,
  FILE: 0xf7,
  CHAT: 0xf2,
  KEY: 0xec,
  DELETE: 0xeb,
  SET_TIME: 0xe7,
} as const;

export const READY_REPLY = 0x59; // 'Y'

/** Object type byte used in F7/F8/EB messages. */
export const ObjType = {
  SETTINGS: 0x00,
  APP: 0x02,
  LIST: 0x03,
  MATRIX: 0x04,
  NOTE: 0x05,
  PROGRAM: 0x06,
  APPNOTE: 0x07,
  APPPRGM: 0x08,
  COMPLEX: 0x09,
  REAL: 0x0a,
  TESTMODE: 0x0b,
} as const;

export const OBJ_TYPE_NAMES: Record<number, string> = {
  0x00: 'settings',
  0x02: 'app',
  0x03: 'list',
  0x04: 'matrix',
  0x05: 'note',
  0x06: 'program',
  0x07: 'app note',
  0x08: 'app program',
  0x09: 'complex',
  0x0a: 'real',
  0x0b: 'exam mode',
};

export const ScreenFormat = {
  /** 320×240, 16-bit PNG samples carrying packed RGB (G1 notes say BE RGB565; newer notes say LE RGB555). */
  PNG_320_16: 0x08,
  PNG_320_PAL: 0x09,
  PNG_160_16: 0x0a,
  PNG_160_PAL: 0x0b,
} as const;

/** `cmd 01 len(u32 BE) body` */
export function withLengthHeader(cmd: number, body: Uint8Array | number[]): Uint8Array {
  return concat([cmd, 0x01, ...u32be(body.length)], body);
}

export const checkReady = () => Uint8Array.of(CMD.READY);
export const getInfo = () => Uint8Array.of(CMD.INFO);
export const requestBackup = () => Uint8Array.of(CMD.BACKUP);
export const requestScreen = (fmt: number = ScreenFormat.PNG_320_16) => Uint8Array.of(CMD.SCREEN, fmt);

/**
 * F7/F8/EB named-object message:
 *   cmd 01 len(u32BE) type namelen crcLo crcHi name(UTF-16LE) [content]
 * CRC-16/XMODEM over the first `len` bytes (= total − 6) with bytes 8–9 zero.
 */
export function namedObjectMessage(
  cmd: number,
  type: number,
  name: string,
  content: Uint8Array = new Uint8Array(0),
  nulTerminateName = false,
): Uint8Array {
  let nameBytes = utf16le(name);
  if (nulTerminateName) nameBytes = concat(nameBytes, [0, 0]);
  if (nameBytes.length > 255) throw new Error('object name too long');
  const msg = withLengthHeader(cmd, concat([type, nameBytes.length, 0, 0], nameBytes, content));
  const covered = msg.length - 6;
  const crc = crc16(msg, 0, covered);
  msg[8] = crc & 0xff;
  msg[9] = crc >> 8;
  return msg;
}

/** F8 — request one object. The firmware needs the NUL-terminated name. */
export const requestFile = (type: number, name: string) =>
  namedObjectMessage(CMD.REQ_FILE, type, name, undefined, true);

/** F7 — send one object. Programs/notes carry raw UTF-16LE text (no BOM). */
export const sendFile = (type: number, name: string, content: Uint8Array) =>
  namedObjectMessage(CMD.FILE, type, name, content);

/** EB — delete one named object (Connectivity Kit format; no NUL). */
export const deleteObject = (type: number, name: string) => namedObjectMessage(CMD.DELETE, type, name);

/** EC — inject key presses (key codes 0–50). Effect unverified on modern firmware. */
export const sendKeys = (codes: number[]) => withLengthHeader(CMD.KEY, codes);

/** F2 — chat message, UTF-16LE. */
export const sendChat = (text: string) => withLengthHeader(CMD.CHAT, utf16le(text));

/**
 * F2 with an empty, NUL-terminated body: the same frame the Messages app's Help key sends.
 * Sent to the calculator, it clears the Help• flag (verified on the G2).
 */
export const clearHelp = () => withLengthHeader(CMD.CHAT, [0, 0]);

/** E7 — set the calculator clock. */
export function setDateTime(d: Date): Uint8Array {
  return withLengthHeader(CMD.SET_TIME, [
    0x00,
    0x00,
    0x54,
    0x1e,
    d.getFullYear() - 2000,
    d.getMonth() + 1,
    d.getDate(),
    d.getHours(),
    d.getMinutes(),
    d.getSeconds(),
  ]);
}

/**
 * Prime object-name rule used before sending a program: starts with a letter
 * or underscore, then letters, digits, underscores. Kept conservative.
 */
export function isValidProgramName(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(name);
}

/**
 * Note names are freer than program names (spaces allowed), but stay away
 * from characters that are unsafe in file names on the computer side.
 */
export function isValidNoteName(name: string): boolean {
  return name.trim() === name && /^[^\\/:*?"<>|\x00-\x1f]{1,64}$/.test(name);
}

/** Legacy G1 upload ceiling observed in hpemu; G2 limit unknown → warn only. */
export const LEGACY_PROGRAM_PAYLOAD_WARN = 15_928;
