import { describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import { utf16le, concat } from '../src/lib/hid/bytes';
import { backupFileName, buildBackupZip, readBackupZip, safeFileName } from '../src/lib/files/backup';
import type { PrimeFile } from '../src/lib/hid/parsers';

const file = (type: number, name: string, data: Uint8Array): PrimeFile => ({ type, name, data, crcOk: true, compressed: false });

describe('backup zip', () => {
  const files = [
    file(0x06, 'HELLO', utf16le('EXPORT HELLO()\nBEGIN\nEND;')),
    file(0x05, 'My: note', concat(utf16le('buy ▶ batteries'), [0, 0])),
    file(0x02, 'Function', Uint8Array.of(1, 2, 3)),
    file(0x06, 'hello', utf16le('x')),
  ];
  const zip = buildBackupZip(files, { label: 'HP Prime G2', firmware: 'V2.060.650' }, new Date(2026, 10, 10, 9, 5));

  it('stores raw bodies, readable text and a manifest', () => {
    const e = unzipSync(zip);
    expect(Object.keys(e).sort()).toEqual([
      'manifest.json',
      'notes/My_ note.note',
      'programs/HELLO.hpppl',
      'programs/hello~2.hpppl',
      'raw/app/Function.bin',
      'raw/note/My_ note.bin',
      'raw/program/HELLO.bin',
      'raw/program/hello~2.bin',
    ]);
    expect(new TextDecoder().decode(e['programs/HELLO.hpppl'])).toBe('EXPORT HELLO()\nBEGIN\nEND;');
    expect(new TextDecoder().decode(e['notes/My_ note.note'])).toBe('buy ▶ batteries');
  });

  it('round-trips through readBackupZip', () => {
    const { manifest, files: back } = readBackupZip(zip);
    expect(manifest.device?.firmware).toBe('V2.060.650');
    expect(back.map((f) => [f.type, f.name])).toEqual(files.map((f) => [f.type, f.name]));
    back.forEach((f, i) => expect(Array.from(f.data)).toEqual(Array.from(files[i].data)));
  });

  it('names files safely', () => {
    expect(safeFileName('a/b:c')).toBe('a_b_c');
    expect(safeFileName('..x')).toBe('_x');
    expect(backupFileName('HP Prime G2', new Date(2026, 10, 10, 9, 5))).toBe('HP-Prime-G2-backup-2026-11-10_0905.zip');
  });
});
