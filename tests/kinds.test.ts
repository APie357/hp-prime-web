import { describe, expect, it } from 'vitest';
import { decodeTextFor, encodeTextFor, fileType, languageFor, programNameFromFile } from '../src/lib/files/kinds';

describe('workspace file kinds', () => {
  it('classifies top-level and app files', () => {
    expect(fileType('PROG.hpppl')).toBe('program');
    expect(fileType('Todo.note')).toBe('note');
    expect(fileType('Game.hpappdir/Game.hpappprgm')).toBe('app-program');
    expect(fileType('Game.hpappdir/Game.hpappnote')).toBe('app-note');
    expect(fileType('Game.hpappdir/Game.hpapp')).toBe('binary');
    expect(fileType('Game.hpappdir/game.py')).toBe('python');
    expect(fileType('Game.hpappdir/icon.png')).toBe('binary');
    expect(languageFor('Game.hpappdir/game.py')).toBe('python');
    expect(programNameFromFile('Game.hpappdir/Game.hpappprgm')).toBe('Game');
  });

  it('stores app programs as UTF-16LE + NUL and Python as UTF-8', () => {
    const prg = encodeTextFor('A.hpappdir/A.hpappprgm', 'START()\r\nBEGIN\nEND;');
    expect(Array.from(prg.slice(-4))).toEqual([0x3b, 0, 0, 0]);
    expect(decodeTextFor('A.hpappdir/A.hpappprgm', prg)).toBe('START()\nBEGIN\nEND;');
    const py = encodeTextFor('A.hpappdir/a.py', 'print("π")');
    expect(new TextDecoder().decode(py)).toBe('print("π")');
    expect(decodeTextFor('A.hpappdir/a.py', py)).toBe('print("π")');
    expect(() => decodeTextFor('A.hpappdir/A.hpappprgm', Uint8Array.of(0, 0, 0x66, 0xf3, 0, 0, 1, 0))).toThrow(/compiled/);
  });
});
