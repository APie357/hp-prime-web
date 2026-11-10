import { describe, expect, it } from 'vitest';
import { PrimeSession } from '../src/lib/hid/session';
import { MockPrime } from './mockPrime';

const SRC = 'EXPORT WEBTEST()\r\nBEGIN\r\n  PRINT("hi");\r\nEND;';

function session(size = 1024) {
  const calc = new MockPrime(size);
  const s = new PrimeSession(calc);
  s.timeouts = { first: 100, between: 100 };
  return { calc, s };
}

describe('PrimeSession', () => {
  it('ready + info', async () => {
    const { s } = session();
    expect(await s.ready()).toBe(true);
    const info = await s.info();
    expect(info.firmware).toBe('V2.060.650');
    expect(info.name).toBe('Mock Prime');
  });

  for (const size of [64, 1024]) {
    it(`sends a program and verifies the read-back (report ${size})`, async () => {
      const { s, calc } = session(size);
      const big = SRC + '\n' + '// filler\n'.repeat(300);
      const r = await s.sendProgram('WEBTEST', big);
      expect(r.refused).toBe(false);
      expect(r.verified).toBe('match');
      expect(calc.programs.get('WEBTEST')).toBe(big.replace(/\r\n/g, '\n'));
    });
  }

  it('reports a refusal', async () => {
    const { s, calc } = session();
    calc.refuseWrites = true;
    const r = await s.sendProgram('WEBTEST', SRC);
    expect(r.refused).toBe(true);
  });

  it('returns null for a missing object', async () => {
    const { s } = session();
    expect(await s.readProgram('NOPE')).toBeNull();
  });

  it('runs a backup', async () => {
    const { s, calc } = session();
    calc.programs.set('A', 'EXPORT A()\nBEGIN\nEND;');
    calc.programs.set('B', 'EXPORT B()\nBEGIN\nEND;');
    const files = await s.backup();
    expect(files.map((f) => f.name)).toEqual(['A', 'B']);
  });

  it('serializes concurrent operations', async () => {
    const { s } = session();
    const [a, b, c] = await Promise.all([s.ready(), s.info(), s.ready()]);
    expect(a && c).toBe(true);
    expect(b.serial).toBe('SN12345678');
  });

  it('sends keys', async () => {
    const { s, calc } = session();
    await s.sendKeys([5, 30]);
    expect(calc.sentKeys).toEqual([[5, 30]]);
  });
});
