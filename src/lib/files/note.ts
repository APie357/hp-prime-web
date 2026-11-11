/**
 * HP Prime notes (object type 0x05).
 *
 * On the wire a note is UTF-16LE: a plain-text part terminated by NUL,
 * optionally followed by a formatted section that starts with the magic
 * `CSWD110` (`CSWT110` for an app's Info note), `FF FF FF FF`, then
 * backslash-escaped control words (per prime_connection_kit).
 *
 * We edit only the plain text. Uploads are plain UTF-16LE text, which hpemu
 * verified the calculator stores and serves back; any rich formatting of an
 * existing note is replaced.
 */
import { utf16le } from '../hid/bytes';

export interface DecodedNote {
  text: string;
  /** The note carries a rich-text section (bold, colors, …). */
  formatted: boolean;
}

const MAGIC = [0x43, 0x53, 0x57]; // "CSW"

export function decodeNote(bytes: Uint8Array): DecodedNote {
  let start = 0;
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) start = 2;
  const units: number[] = [];
  for (let i = start; i + 1 < bytes.length; i += 2) units.push(bytes[i] | (bytes[i + 1] << 8));

  let formatted = false;
  for (let i = 0; i + 3 < units.length; i++) {
    if (units[i] === MAGIC[0] && units[i + 1] === MAGIC[1] && units[i + 2] === MAGIC[2] && (units[i + 3] === 0x44 || units[i + 3] === 0x54)) {
      formatted = true;
      break;
    }
  }
  // A body shorter than one char + terminator carries nothing (CK writes
  // 2-byte placeholders with arbitrary content).
  if (bytes.length - start < 4 && !formatted) return { text: '', formatted };
  const nul = units.indexOf(0);
  const plain = nul >= 0 ? units.slice(0, nul) : units;
  let text = '';
  for (let i = 0; i < plain.length; i += 8192) text += String.fromCharCode(...plain.slice(i, i + 8192));
  return { text, formatted };
}

export function encodeNote(text: string): Uint8Array {
  return utf16le(text.replace(/^﻿/, '').replace(/\r\n?/g, '\n'));
}
