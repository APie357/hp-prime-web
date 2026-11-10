import { describe, expect, it } from 'vitest';
import { concat, utf16le } from '../src/lib/hid/bytes';
import { decodeNote, encodeNote } from '../src/lib/files/note';
import { isValidNoteName } from '../src/lib/hid/commands';

describe('notes', () => {
  it('decodes plain UTF-16 text', () => {
    expect(decodeNote(concat(utf16le('hello\nworld'), [0, 0]))).toEqual({ text: 'hello\nworld', formatted: false });
  });

  it('detects a rich-text section and keeps only the plain part', () => {
    const bytes = concat(utf16le('Shopping'), [0, 0], utf16le('CSWD110'), [0xff, 0xff, 0xff, 0xff], utf16le('\\l'), [0x3e, 0x01]);
    expect(decodeNote(bytes)).toEqual({ text: 'Shopping', formatted: true });
  });

  it('treats a tiny placeholder body as empty', () => {
    expect(decodeNote(Uint8Array.of(0xc4, 0x3a)).text).toBe('');
  });

  it('encodes without BOM, with \\n line endings', () => {
    expect(Array.from(encodeNote('﻿a\r\nb'))).toEqual([0x61, 0, 0x0a, 0, 0x62, 0]);
  });

  it('validates note names', () => {
    expect(isValidNoteName('My notes 2')).toBe(true);
    expect(isValidNoteName(' padded')).toBe(false);
    expect(isValidNoteName('a/b')).toBe(false);
    expect(isValidNoteName('')).toBe(false);
  });
});
