/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  appOfPath,
  appToFolder,
  baseAppOf,
  buildAppPayload,
  decodeAppProgram,
  encodeAppText,
  folderToApp,
  newAppStarter,
  noneBag,
  parseAppPayload,
  pythonModuleName,
} from '../src/lib/files/app';
import { concat, utf16le } from '../src/lib/hid/bytes';

/** &Function from a G2 backup (firmware V2.060.650). */
const FUNCTION = new Uint8Array(readFileSync(new URL('./fixtures/function.app.bin', import.meta.url)));

describe('app payload', () => {
  it('parses the built-in Function app and rebuilds it byte for byte', () => {
    const p = parseAppPayload(FUNCTION);
    expect(p.bag.length).toBe(1407);
    expect(baseAppOf(p.bag)).toBe('Function');
    expect(Array.from(p.note)).toEqual([0, 0]);
    expect(p.program.length).toBe(36);
    expect(decodeAppProgram(p.program)).toBeNull(); // binary stub, not text
    expect(p.files).toEqual([]);
    expect(buildAppPayload(p)).toEqual(FUNCTION);
  });

  it('handles a custom app with a text program and extra files', () => {
    const bag = parseAppPayload(FUNCTION).bag;
    const parts = {
      bag,
      note: encodeAppText('About this app'),
      program: encodeAppText('#PYTHON START()\nimport game\ngame.run()\n#END\n'),
      files: [
        { name: 'game.py', data: new TextEncoder().encode('def run():\r\n\tprint("hi")\r\n') },
        { name: 'icon.png', data: Uint8Array.of(0x89, 0x50, 0x4e, 0x47) },
      ],
    };
    const payload = buildAppPayload(parts);
    const back = parseAppPayload(payload);
    expect(back).toEqual(parts);
    expect(decodeAppProgram(back.program)).toBe('#PYTHON START()\nimport game\ngame.run()\n#END\n');
  });

  it('converts to and from the workspace folder layout', () => {
    const parts = parseAppPayload(FUNCTION);
    const withFile = { ...parts, files: [{ name: 'notes.txt', data: utf16le('x') }] };
    const entries = appToFolder('My App', withFile);
    expect(entries.map((e) => e.path)).toEqual([
      'My App.hpappdir/My App.hpapp',
      'My App.hpappdir/My App.hpappnote',
      'My App.hpappdir/My App.hpappprgm',
      'My App.hpappdir/notes.txt',
    ]);
    const inner = entries.map((e) => ({ name: e.path.split('/')[1], data: e.data }));
    expect(buildAppPayload(folderToApp('My App', inner))).toEqual(buildAppPayload(withFile));
    expect(appOfPath('My App.hpappdir/notes.txt')).toBe('My App');
    expect(appOfPath('PROG.hpppl')).toBeNull();
  });

  it('has a built-in bag for None-based apps', () => {
    const bag = noneBag();
    expect(bag.length).toBe(124);
    expect(baseAppOf(bag)).toBe('None');
    const p = { bag, note: encodeAppText(''), program: encodeAppText('#PYTHON START()\n#END\n'), files: [] };
    expect(parseAppPayload(buildAppPayload(p))).toEqual(p);
  });

  it('makes a Python starter: a module plus #PYTHON blocks that run it', () => {
    expect(pythonModuleName('My Game!')).toBe('my_game');
    expect(pythonModuleName('3D')).toBe('app_3d');
    const s = newAppStarter('My Game', 'None', 'python');
    expect(s.files.map((f) => f.name)).toEqual(['my_game.py']);
    expect(s.program).toContain('#PYTHON START()\n');
    expect(s.program).toContain('import my_game\nmy_game.run()\n#END');
    expect(new TextDecoder().decode(s.files[0].data)).toContain('def run():');
    expect(newAppStarter('X', 'Function', 'ppl').files).toEqual([]);
  });

  it('rejects data that is not an app', () => {
    expect(() => parseAppPayload(concat([0, 0, 0, 2], [1, 2]))).toThrow();
    expect(() => parseAppPayload(Uint8Array.of(0, 0, 0, 9, 1))).toThrow(/past the end/);
  });
});

describe('app icon fitting', () => {
  it('takes the centre square of the picked image', async () => {
    const { centreSquare } = await import('../src/lib/files/icon');
    expect(centreSquare(38, 38)).toEqual([0, 0, 38]);
    expect(centreSquare(120, 80)).toEqual([20, 0, 80]);
    expect(centreSquare(50, 101)).toEqual([0, 25, 50]);
  });
});
