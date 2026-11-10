import { describe, expect, it } from 'vitest';
import { K, KEYS, keysForKeyboardEvent, keysForText, keysToRun } from '../src/lib/hid/keys';
import { diffFraction } from '../src/lib/screen';
import { MockPrime } from './mockPrime';
import { PrimeSession } from '../src/lib/hid/session';

describe('key table', () => {
  it('has codes 0–50 in order with A–Z on alpha keys', () => {
    expect(KEYS.map((k) => k.code)).toEqual([...Array(51).keys()]);
    const letters = KEYS.filter((k) => k.alpha).map((k) => k.alpha).join('');
    expect(letters).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    expect([K.HOME, K.ESC, K.ENTER, K.ALPHA, K.SHIFT]).toEqual([5, 4, 30, 36, 41]);
  });
});

describe('typing', () => {
  it('types upper case, lower case and digits', () => {
    expect(keysForText('A1')).toEqual([36, 14, 42]);
    expect(keysForText('z')).toEqual([36, 41, 43]);
    expect(keysForText('-2.5,0')).toEqual([27, 43, 48, 38, 29, 47]);
    expect(() => keysForText('A_B')).toThrow(/_/);
  });

  it('builds the Home → name → Enter sequence', () => {
    expect(keysToRun('AB')).toEqual([5, 4, 36, 14, 36, 15, 30]);
    expect(keysToRun('F', '1, 2')).toEqual([5, 4, 36, 20, 28, 42, 29, 43, 30]);
  });

  it('maps physical keys', () => {
    expect(keysForKeyboardEvent({ key: 'Enter' })).toEqual([30]);
    expect(keysForKeyboardEvent({ key: 'Backspace' })).toEqual([19]);
    expect(keysForKeyboardEvent({ key: 'q' })).toEqual([36, 41, 32]);
    expect(keysForKeyboardEvent({ key: 'a', ctrlKey: true })).toBeNull();
    expect(keysForKeyboardEvent({ key: 'F5' })).toBeNull();
  });
});

describe('pressKeys', () => {
  it('sends one EC message per key', async () => {
    const m = new MockPrime();
    await new PrimeSession(m).pressKeys([5, 36, 14], 0);
    expect(m.sentKeys).toEqual([[5], [36], [14]]);
  });
});

describe('diffFraction', () => {
  const img = (vals: number[]) => ({ width: vals.length, height: 1, data: new Uint8ClampedArray(vals.flatMap((v) => [v, v, v, 255])) });
  it('counts changed pixels', () => {
    expect(diffFraction(img([0, 0, 0, 0]), img([0, 9, 0, 0]))).toBe(0.25);
    expect(diffFraction(img([1, 2]), img([1, 2]))).toBe(0);
    expect(diffFraction(img([1]), img([1, 2]))).toBe(1);
  });
});

describe('runTarget', () => {
  it('prefers the exported procedure named like the program', async () => {
    const { runTarget } = await import('../src/lib/lang/symbols');
    const src = 'HELPER()\nBEGIN\nEND;\nEXPORT OTHER(a)\nBEGIN\nEND;\nEXPORT GAME(x, y)\nBEGIN\nEND;';
    expect(runTarget('GAME', src)).toEqual({ name: 'GAME', params: ['x', 'y'] });
    expect(runTarget('NOPE', src)).toEqual({ name: 'OTHER', params: ['a'] });
    expect(runTarget('X', 'F()\nBEGIN\nEND;')).toBeNull();
  });
});
