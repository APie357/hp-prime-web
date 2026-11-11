import { describe, expect, it } from 'vitest';
import { PrimeSession } from '../src/lib/hid/session';
import { MockPrime } from './mockPrime';
import { utf16le } from '../src/lib/hid/bytes';

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
      expect(calc.program('WEBTEST')).toBe(big.replace(/\r\n/g, '\n'));
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
    calc.setProgram('A', 'EXPORT A()\nBEGIN\nEND;');
    calc.setProgram('B', 'EXPORT B()\nBEGIN\nEND;');
    const files = await s.backup();
    expect(files.map((f) => f.name)).toEqual(['A', 'B']);
  });

  it('serializes concurrent operations', async () => {
    const { s } = session();
    const [a, b, c] = await Promise.all([s.ready(), s.info(), s.ready()]);
    expect(a && c).toBe(true);
    expect(b.serial).toBe('SN12345678');
  });

  it('sends and reads a note separately from a program of the same name', async () => {
    const { s, calc } = session();
    calc.setProgram('Todo', 'EXPORT Todo()\nBEGIN\nEND;');
    const r = await s.sendText('note', 'Todo', 'buy batteries\r\nfor the calc');
    expect(r.verified).toBe('match');
    const note = await s.readText('note', 'Todo');
    expect(note).toMatchObject({ kind: 'note', name: 'Todo', text: 'buy batteries\nfor the calc', formatted: false });
    expect(await s.readProgram('Todo')).toBe('EXPORT Todo()\nBEGIN\nEND;');
  });

  it('accepts note names with spaces but not program names', async () => {
    const { s } = session();
    expect((await s.sendText('note', 'My notes', 'x')).verified).toBe('match');
    await expect(s.sendText('program', 'My notes', 'x')).rejects.toThrow(/not a valid program name/);
  });

  it('sets the clock and confirms the link with a ready check', async () => {
    const { s, calc } = session();
    const ok = await s.setDateTime(new Date(2026, 10, 9, 21, 5, 7));
    expect(ok).toBe(true);
    expect(calc.clockSets).toEqual([[0x00, 0x00, 0x54, 0x1e, 26, 11, 9, 21, 5, 7]]);
  });

  it('sends keys', async () => {
    const { s, calc } = session();
    await s.sendKeys([5, 30]);
    expect(calc.sentKeys).toEqual([[5, 30]]);
  });
  it('deletes an object and confirms it is gone', async () => {
    const { s, calc } = session();
    calc.setProgram('OLD', 'EXPORT OLD()\nBEGIN\nEND;');
    expect(await s.deleteObject(6, 'OLD')).toEqual({ refused: false, gone: true });
    expect(calc.deleted).toEqual(['6:OLD']);
    expect(calc.program('OLD')).toBeUndefined();
  });

  it('reports a refused delete', async () => {
    const { s, calc } = session();
    calc.setProgram('KEEP', 'x');
    calc.refuseWrites = true;
    expect(await s.deleteObject(6, 'KEEP')).toEqual({ refused: true, gone: false });
    expect(calc.program('KEEP')).toBe('x');
  });

  it('sends a chat message as UTF-16LE', async () => {
    const { s, calc } = session();
    await s.sendChat('hi ▶ π');
    expect(calc.chats).toEqual(['hi ▶ π']);
  });
  it('receives chat the calculator sends while idle, and keeps working afterwards', async () => {
    const { s, calc } = session();
    const got: string[] = [];
    s.onChat = (t) => got.push(t);
    s.listen();
    calc.say('123456789');
    await until(() => got.length > 0);
    expect(got).toEqual(['123456789']);
    const t0 = Date.now();
    expect(await s.ready()).toBe(true);
    expect(Date.now() - t0).toBeLessThan(200); // the idle read yields the link immediately
    s.listen(false);
  });

  it('handles chat that arrives ahead of a reply', async () => {
    const { s, calc } = session();
    const got: string[] = [];
    s.onChat = (t) => got.push(t);
    calc.chatBeforeReply = 'x²+1';
    expect(await s.ready()).toBe(true);
    expect(got).toEqual(['x²+1']);
  });
  it('passes on objects the calculator sends with its Send key', async () => {
    const { s, calc } = session();
    const got: string[] = [];
    s.onObject = (f) => got.push(`${f.type}:${f.name}:${f.data.length}`);
    s.listen();
    calc.sendObject(2, 'Dynatris', Uint8Array.of(1, 2, 3));
    calc.sendObject(6, 'PROG', utf16le('x'));
    await until(() => got.length === 2);
    expect(got).toEqual(['2:Dynatris:3', '6:PROG:2']);
    expect(await s.ready()).toBe(true);
    s.listen(false);
  });

  it('treats an object arriving ahead of a reply as sent by the calculator', async () => {
    const { s, calc } = session();
    const got: string[] = [];
    s.onObject = (f) => got.push(f.name);
    calc.objectBeforeReply = [5, 'Todo', utf16le('hi')];
    expect(await s.ready()).toBe(true);
    expect(got).toEqual(['Todo']);
  });

  it('sends an app and verifies the read-back', async () => {
    const { s, calc } = session();
    const payload = Uint8Array.of(0, 0, 0, 4, 0x7c, 0x61, 0x8a, 0xb2, 0, 0, 0, 2, 0, 0, 0, 0, 0, 2, 0, 0);
    const r = await s.sendApp('Game', payload);
    expect(r).toMatchObject({ refused: false, verified: 'match' });
    expect(Array.from(calc.objects.get('2:Game')!)).toEqual(Array.from(payload));
    expect(Array.from((await s.readApp('Game'))!.data)).toEqual(Array.from(payload));
  });
});

async function until(cond: () => boolean, ms = 1000) {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('condition not met');
    await new Promise((r) => setTimeout(r, 5));
  }
}
