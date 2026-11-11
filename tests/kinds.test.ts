import { describe, expect, it } from 'vitest';
import { decodeTextFile, decodeTextFor, encodeTextFor, fileType, isValidPythonName, languageFor, parseNewName, programNameFromFile } from '../src/lib/files/kinds';

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

describe('parseNewName', () => {
  it('infers the kind from a known extension', () => {
    expect(parseNewName('GAME.hpppl')).toEqual({ name: 'GAME', kind: 'program' });
    expect(parseNewName('game.py')).toEqual({ name: 'game', kind: 'python' });
    expect(parseNewName(' Foo.HPPRGM ')).toEqual({ name: 'Foo', kind: 'program' });
    expect(parseNewName('My list.note')).toEqual({ name: 'My list', kind: 'note' });
    expect(parseNewName('Quiz.hpappdir')).toEqual({ name: 'Quiz', kind: 'app' });
    expect(parseNewName('Quiz.hpapp')).toEqual({ name: 'Quiz', kind: 'app' });
  });
  it('leaves other names alone', () => {
    expect(parseNewName('NEWPROG')).toEqual({ name: 'NEWPROG', kind: null });
    expect(parseNewName('v1.2')).toEqual({ name: 'v1.2', kind: null });
  });
});

describe('decodeTextFile', () => {
  const utf16 = (s: string) => Uint8Array.from([...s].flatMap((c) => [c.charCodeAt(0) & 0xff, c.charCodeAt(0) >> 8]));
  it('reads UTF-8 and UTF-16LE (with or without a BOM), normalizing line endings', () => {
    expect(decodeTextFile(new TextEncoder().encode('A:=1;\r\nB▶x;'))).toBe('A:=1;\nB▶x;');
    expect(decodeTextFile(utf16('﻿EXPORT X()\r\nBEGIN\0'))).toBe('EXPORT X()\nBEGIN');
    expect(decodeTextFile(utf16('EXPORT X()\n'))).toBe('EXPORT X()\n');
  });
});

describe('isValidPythonName', () => {
  it('accepts module-style names only', () => {
    expect(isValidPythonName('main')).toBe(true);
    expect(isValidPythonName('_util2')).toBe(true);
    expect(isValidPythonName('2fast')).toBe(false);
    expect(isValidPythonName('my script')).toBe(false);
    expect(isValidPythonName('x'.repeat(32))).toBe(false);
  });
});
