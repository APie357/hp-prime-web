import { describe, expect, it } from 'vitest';
import {
  findPyCall,
  parseDefs,
  parseImports,
  pySigParams,
  pythonBlockAt,
  pythonCompletions,
  resolvePython,
} from '../src/lib/lang/python';

const labels = (src: string, local = new Map<string, string>()) =>
  pythonCompletions(src, src.length, local).items.map((i) => i.label);

describe('python completion', () => {
  it('offers module names after import / from', () => {
    expect(labels('import hp')).toContain('hpprime');
    expect(labels('import math, gra')).toContain('graphic');
    expect(labels('from ')).toContain('linalg');
    expect(labels('import ', new Map([['game', '']]))).toContain('game');
  });

  it('offers members after from X import', () => {
    const l = labels('from hpprime import ');
    expect(l).toEqual(expect.arrayContaining(['eval', 'fillrect', 'fillrect_c', 'textout', 'keyboard', 'mouse']));
    expect(labels('from math import sqrt, ')).toContain('cos');
  });

  it('offers module members after an imported name and its alias', () => {
    expect(labels('import hpprime\nhpprime.')).toContain('pixon');
    expect(labels('import hpprime as h\nh.fil')).toContain('fillrect');
    expect(labels('import graphic\ngraphic.')).toContain('draw_line');
    // Not imported: common methods only.
    expect(labels('s = "x"\ns.')).toContain('upper');
  });

  it('offers star imports, own definitions, builtins and keywords', () => {
    const l = labels('from math import *\ndef area(r):\n    return pi*r*r\ntotal = 0\n');
    expect(l).toEqual(expect.arrayContaining(['sqrt', 'pi', 'area', 'total', 'print', 'range', 'while', 'True']));
    expect(l.indexOf('area')).toBeLessThan(l.indexOf('print'));
  });

  it("offers the app's own modules' top-level definitions", () => {
    const local = new Map([['game', 'def run():\n    x = 1\nSPEED = 3\n']]);
    expect(labels('import game\ngame.', local)).toEqual(['run', 'SPEED']);
  });

  it('stays quiet in comments and strings', () => {
    expect(labels('# import hp')).toEqual([]);
    expect(labels('print("hpprime.')).toEqual([]);
  });
});

describe('python hover and signatures', () => {
  it('resolves names through imports', () => {
    expect(resolvePython('import hpprime as h', 'h.line')?.detail).toBe('hpprime.line(G, x1, y1, x2, y2, color)');
    expect(resolvePython('from urandom import randint', 'randint')?.detail).toBe('urandom.randint(a, b)');
    expect(resolvePython('', 'print')?.detail).toContain('print(');
    expect(resolvePython('import hpprime as h', 'h.line')?.doc).toMatch(/doesn’t document/);
  });

  it('finds the call and argument under the cursor', () => {
    expect(findPyCall('h.fillrect(0, 10, 20')).toEqual({ callee: 'h.fillrect', arg: 2 });
    expect(findPyCall('print(f(1, 2), "a,b", ')).toEqual({ callee: 'print', arg: 2 });
    expect(findPyCall('x = 1')).toBeNull();
    expect(pySigParams('(G, x, y, color)')).toEqual(['G', 'x', 'y', 'color']);
  });
});

describe('python parsing', () => {
  it('reads imports', () => {
    const i = parseImports('import hpprime as h, math\nfrom urandom import randint as ri\nfrom graphic import *');
    expect([...i.modules]).toEqual([['h', 'hpprime'], ['math', 'math']]);
    expect([...i.names]).toEqual([['ri', ['urandom', 'randint']]]);
    expect(i.star).toEqual(['graphic']);
  });

  it('reads definitions', () => {
    const d = parseDefs('def f(a, b=2):\n    c = 1\nclass K:\n    pass\nfor i, j in x:\n    pass\n');
    expect(d.map((x) => [x.name, x.kind, x.topLevel])).toEqual([
      ['f', 'function', true],
      ['a', 'variable', false],
      ['b', 'variable', false],
      ['c', 'variable', false],
      ['K', 'class', true],
      ['i', 'variable', true],
      ['j', 'variable', true],
    ]);
  });

  it('finds #PYTHON blocks in PPL', () => {
    const src = 'EXPORT A()\nBEGIN\nEND;\n#PYTHON START()\nimport hpprime\n#END\n';
    const at = src.indexOf('import') + 3;
    const b = pythonBlockAt(src, at)!;
    expect(src.slice(b.start, b.end)).toBe('import hpprime\n');
    expect(pythonBlockAt(src, 5)).toBeNull();
  });
});
