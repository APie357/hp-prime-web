/**
 * A simulated calculator speaking legacy framing, for session tests.
 * Mirrors observed G2 behaviour: 'Y' ready reply, silent F7, F8 silent for
 * missing objects, NUL-terminated stored program text.
 */
import { concat, fromUtf16le, utf16le } from '../src/lib/hid/bytes';
import * as C from '../src/lib/hid/commands';
import { LegacyFraming } from '../src/lib/hid/framing';
import { parseFileMessage } from '../src/lib/hid/parsers';
import { ReportQueue, type ReportPort } from '../src/lib/hid/port';

export class MockPrime implements ReportPort {
  setProgram(name: string, src: string) {
    this.objects.set(`${C.ObjType.PROGRAM}:${name}`, utf16le(src));
  }
  program(name: string): string | undefined {
    const d = this.objects.get(`${C.ObjType.PROGRAM}:${name}`);
    return d && fromUtf16le(d);
  }

  readonly framing: LegacyFraming;
  private q = new ReportQueue();
  private inbound;
  /** Raw stored object bodies keyed by `${type}:${name}`. */
  objects = new Map<string, Uint8Array>();
  sentKeys: number[][] = [];
  clockSets: number[][] = [];
  refuseWrites = false;

  constructor(readonly reportSize = 1024) {
    this.framing = new LegacyFraming(reportSize - 1);
    this.inbound = this.framing.createReassembler();
  }

  async send(report: Uint8Array): Promise<void> {
    const msg = this.inbound.push(report);
    if (msg) this.handle(msg);
  }

  read(ms: number) {
    return this.q.read(ms);
  }

  drain() {
    return this.q.drain();
  }

  private reply(msg: Uint8Array) {
    for (const r of this.framing.fragment(msg)) {
      const padded = new Uint8Array(this.reportSize);
      padded.set(r);
      this.q.push(padded);
    }
  }

  private handle(msg: Uint8Array) {
    switch (msg[0]) {
      case C.CMD.READY:
        return this.reply(Uint8Array.of(C.READY_REPLY));
      case C.CMD.INFO:
        return this.reply(C.withLengthHeader(0xfa, concat([0, 0], utf16le('Mock Prime'), [0, 0], utf16le('V2.060.650'), [0, 0], utf16le('SN12345678'))));
      case C.CMD.FILE: {
        if (this.refuseWrites) return this.reply(Uint8Array.of(0xf9, 0x01, 0, 0, 0, 0));
        const f = parseFileMessage(msg);
        this.objects.set(`${f.type}:${f.name}`, f.data);
        return; // silent, like current firmware
      }
      case C.CMD.REQ_FILE: {
        const type = msg[6];
        const nameLen = msg[7];
        const name = fromUtf16le(msg.subarray(10, 10 + nameLen));
        const data = this.objects.get(`${type}:${name}`);
        if (data === undefined) return; // silent
        return this.reply(C.sendFile(type, name, concat(data, [0, 0])));
      }
      case C.CMD.BACKUP: {
        for (const [key, data] of this.objects) {
          const i = key.indexOf(':');
          this.reply(C.sendFile(Number(key.slice(0, i)), key.slice(i + 1), data));
        }
        return this.reply(Uint8Array.of(0xf9, 0x01, 0, 0, 0, 0));
      }
      case C.CMD.SET_TIME:
        this.clockSets.push(Array.from(msg.subarray(6)));
        return; // silent
      case C.CMD.KEY:
        this.sentKeys.push(Array.from(msg.subarray(6)));
        return;
    }
  }
}
