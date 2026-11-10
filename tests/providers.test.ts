import { describe, expect, it } from 'vitest';
import { findCall, parseSignature } from '../src/lib/lang/providers';

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
