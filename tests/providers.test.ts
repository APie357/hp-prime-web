import { describe, expect, it } from 'vitest';
import { findCall, minimalEdit, parseSignature } from '../src/lib/lang/providers';

describe('signature help helpers', () => {
  it('finds the active call and argument', () => {
    expect(findCall('TEXTOUT_P("a,b", ')).toEqual({ name: 'TEXTOUT_P', argIndex: 1 });
    expect(findCall('LOG(SQRT(4), ')).toEqual({ name: 'LOG', argIndex: 1 });
    expect(findCall('MAX({1,2}, 3, ')).toEqual({ name: 'MAX', argIndex: 2 });
    expect(findCall('LOG(1);\nx:=')).toBeNull();
    expect(findCall('SIN(1) + ABS(')).toEqual({ name: 'ABS', argIndex: 0 });
  });

  it('splits signatures at top-level commas', () => {
    expect(parseSignature('LOG(value, base)').params).toEqual(['value', 'base']);
    expect(parseSignature('RECT_P([G,] x1, y1)').params).toEqual(['[G]', 'x1', 'y1']);
    expect(parseSignature('GETKEY').params).toEqual([]);
  });
});

describe('minimalEdit', () => {
  const apply = (a: string, e: { start: number; end: number; text: string } | null) =>
    e ? a.slice(0, e.start) + e.text + a.slice(e.end) : a;
  it('round-trips and keeps the common prefix and suffix', () => {
    const cases: [string, string][] = [
      ['a\nb\nc\n', 'a\n  b\nc\n'],
      ['x\n\n\n', 'x\n'],
      ['x', 'x\n'],
      ['\n\nBEGIN\n', 'BEGIN\n'],
      ['same', 'same'],
    ];
    for (const [a, b] of cases) expect(apply(a, minimalEdit(a, b))).toBe(b);
    expect(minimalEdit('a\nb\nc\n', 'a\n  b\nc\n')).toEqual({ start: 2, end: 2, text: '  ' });
    expect(minimalEdit('same', 'same')).toBeNull();
  });
});
