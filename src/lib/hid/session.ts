/**
 * PrimeSession — the request/response layer on top of a ReportPort.
 * All operations are serialized: the Prime link is strictly half-duplex.
 */
import { fromUtf16le, utf16le, hex } from './bytes';
import * as C from './commands';
import { LegacyFraming, type LinkFraming } from './framing';
import { log } from './log';
import {
  parseFileMessage,
  parseInfo,
  parseScreenMessage,
  type DeviceInfo,
  type PrimeFile,
  type ScreenPayload,
} from './parsers';
import type { ReportPort } from './port';
import { decodeNote, encodeNote } from '../files/note';

export class TimeoutError extends Error {
  constructor(what: string) {
    super(`timed out waiting for ${what}`);
  }
}

export interface Timeouts {
  /** Wait for the first report of a reply. Screenshots can take ~1 s to start. */
  first: number;
  /** Wait between subsequent reports of one message. */
  between: number;
}

const DEFAULT_TIMEOUTS: Timeouts = { first: 4000, between: 2500 };

/** Text objects the IDE edits. */
export type TextKind = 'program' | 'note';

export const KIND_TYPE: Record<TextKind, number> = {
  program: C.ObjType.PROGRAM,
  note: C.ObjType.NOTE,
};

export interface TextObject {
  kind: TextKind;
  name: string;
  text: string;
  /** Note has rich formatting that a plain-text upload would replace. */
  formatted: boolean;
}

export interface SendTextResult {
  kind: TextKind;
  name: string;
  bytes: number;
  refused: boolean;
  verified: 'match' | 'mismatch' | 'no-reply' | 'skipped';
  readback?: string;
}

export function decodeText(kind: TextKind, data: Uint8Array): { text: string; formatted: boolean } {
  return kind === 'note' ? decodeNote(data) : { text: fromUtf16le(data), formatted: false };
}

export function isValidName(kind: TextKind, name: string): boolean {
  return kind === 'program' ? C.isValidProgramName(name) : C.isValidNoteName(name);
}

/** How `pressKeys` encodes key presses; see there. */
export type KeyMode = 'single' | 'batch' | 'release' | 'ready';
export const KEY_MODES: KeyMode[] = ['single', 'batch', 'release', 'ready'];

export interface BackupProgress {
  count: number;
  last?: PrimeFile;
}

export class PrimeSession {
  readonly framing: LinkFraming;
  private chain: Promise<unknown> = Promise.resolve();
  timeouts: Timeouts = { ...DEFAULT_TIMEOUTS };

  constructor(readonly port: ReportPort, framing?: LinkFraming) {
    this.framing = framing ?? new LegacyFraming(port.reportSize - 1);
  }

  /** Run `fn` exclusively (queued behind any in-flight operation). */
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async sendMessage(msg: Uint8Array): Promise<void> {
    for (const r of this.framing.fragment(msg)) await this.port.send(r);
  }

  private async recvMessage(what: string, firstTimeout = this.timeouts.first): Promise<Uint8Array> {
    const re = this.framing.createReassembler();
    for (;;) {
      const r = await this.port.read(re.pending ? this.timeouts.between : firstTimeout);
      if (!r) throw new TimeoutError(what);
      const msg = re.push(r);
      if (msg) return msg;
    }
  }

  private async exchange(msg: Uint8Array, what: string, firstTimeout?: number): Promise<Uint8Array> {
    const dropped = this.port.drain();
    if (dropped) log('warn', `discarded ${dropped} stale report(s)`);
    await this.sendMessage(msg);
    return this.recvMessage(what, firstTimeout);
  }

  // ------------------------------------------------------------ operations

  ready(): Promise<boolean> {
    return this.exclusive(async () => {
      const r = await this.exchange(C.checkReady(), 'ready reply', 2000);
      return r[0] === C.READY_REPLY || r[0] === C.CMD.READY;
    });
  }

  info(): Promise<DeviceInfo> {
    return this.exclusive(async () => {
      const r = await this.exchange(C.getInfo(), 'device info');
      if (r[0] !== C.CMD.INFO) log('warn', `info reply starts with ${hex(r, 8)}`);
      return parseInfo(r);
    });
  }

  screenshot(format: number = C.ScreenFormat.PNG_320_16): Promise<ScreenPayload> {
    return this.exclusive(async () => {
      const r = await this.exchange(C.requestScreen(format), 'screenshot', 8000);
      const s = parseScreenMessage(r);
      if (!s.crcOk) log('warn', 'screenshot CRC mismatch');
      return s;
    });
  }

  /** F8 → F7. Resolves null when the calculator stays silent (object probably absent). */
  requestFile(type: number, name: string, timeoutMs = 3000): Promise<PrimeFile | null> {
    return this.exclusive(() => this.requestFileUnlocked(type, name, timeoutMs));
  }

  private async requestFileUnlocked(type: number, name: string, timeoutMs: number): Promise<PrimeFile | null> {
    try {
      const r = await this.exchange(C.requestFile(type, name), `file ${name}`, timeoutMs);
      if (r[0] !== C.CMD.FILE) throw new Error(`unexpected reply to F8: ${hex(r, 12)}`);
      const f = parseFileMessage(r);
      if (!f.crcOk) log('warn', `CRC mismatch on received ${name}`);
      return f;
    } catch (e) {
      if (e instanceof TimeoutError) return null;
      throw e;
    }
  }

  /**
   * F7. Current firmware sends no acknowledgement, so silence is success;
   * an F9 frame means the calculator refused.
   */
  sendFile(type: number, name: string, content: Uint8Array): Promise<{ refused: boolean }> {
    return this.exclusive(() => this.sendFileUnlocked(type, name, content));
  }

  private async sendFileUnlocked(type: number, name: string, content: Uint8Array): Promise<{ refused: boolean }> {
    try {
      const r = await this.exchange(C.sendFile(type, name, content), 'write ack', 1500);
      if (r[0] === C.CMD.BACKUP) return { refused: true };
      log('info', `F7 reply: ${hex(r, 12)}`);
      return { refused: false };
    } catch (e) {
      if (e instanceof TimeoutError) return { refused: false };
      throw e;
    }
  }

  /**
   * Upload a program or note as raw UTF-16LE text (no BOM, no container),
   * then read it back to verify.
   */
  sendText(kind: TextKind, name: string, source: string, verify = true): Promise<SendTextResult> {
    return this.exclusive(async () => {
      if (!isValidName(kind, name)) throw new Error(`"${name}" is not a valid ${kind} name`);
      const text = normalizeSource(source);
      const payload = kind === 'note' ? encodeNote(text) : utf16le(text);
      if (kind === 'program' && payload.length > C.LEGACY_PROGRAM_PAYLOAD_WARN) {
        log('warn', `${name} is ${payload.length} B; uploads above ${C.LEGACY_PROGRAM_PAYLOAD_WARN} B were dropped on G1 firmware`);
      }
      const { refused } = await this.sendFileUnlocked(KIND_TYPE[kind], name, payload);
      const res: SendTextResult = { kind, name, bytes: payload.length, refused, verified: 'skipped' };
      if (refused || !verify) return res;
      // Give the calculator a moment to store/compile.
      await sleep(250);
      const back = await this.requestFileUnlocked(KIND_TYPE[kind], name, 4000);
      if (!back) {
        res.verified = 'no-reply';
        return res;
      }
      res.readback = decodeText(kind, back.data).text;
      res.verified = normalizeSource(res.readback) === text ? 'match' : 'mismatch';
      return res;
    });
  }

  /** F8 for a program or note; null when the calculator stays silent. */
  readText(kind: TextKind, name: string, timeoutMs = 4000): Promise<TextObject | null> {
    return this.exclusive(async () => {
      const f = await this.requestFileUnlocked(KIND_TYPE[kind], name, timeoutMs);
      return f ? { kind, name: f.name, ...decodeText(kind, f.data) } : null;
    });
  }

  sendProgram(name: string, source: string, verify = true): Promise<SendTextResult> {
    return this.sendText('program', name, source, verify);
  }

  async readProgram(name: string): Promise<string | null> {
    return (await this.readText('program', name))?.text ?? null;
  }

  /** F9 — receive every object. Ends on an F9 frame or when the stream goes quiet. */
  backup(onProgress?: (p: BackupProgress) => void): Promise<PrimeFile[]> {
    return this.exclusive(async () => {
      this.port.drain();
      await this.sendMessage(C.requestBackup());
      const files: PrimeFile[] = [];
      for (;;) {
        let msg: Uint8Array;
        try {
          msg = await this.recvMessage('backup data', files.length ? 5000 : 10000);
        } catch (e) {
          if (e instanceof TimeoutError && files.length) {
            log('warn', 'backup stream went quiet; assuming complete');
            break;
          }
          throw e;
        }
        if (msg[0] === C.CMD.BACKUP) break;
        if (msg[0] !== C.CMD.FILE) {
          log('warn', `unexpected message in backup: ${hex(msg, 12)}`);
          continue;
        }
        try {
          const f = parseFileMessage(msg);
          files.push(f);
          onProgress?.({ count: files.length, last: f });
        } catch (e) {
          log('error', `bad file in backup: ${(e as Error).message}`);
        }
      }
      return files;
    });
  }

  /** EC — fire-and-forget; firmware sends no acknowledgement. */
  sendKeys(codes: number[]): Promise<void> {
    return this.exclusive(() => this.sendMessage(C.sendKeys(codes)));
  }

  /**
   * Press keys with `EC` (layout as in hplp: `EC 01 len(u32BE) codes…`). On the G2 a plain key is
   * queued but not processed until a physical key press, so `mode` selects experimental variants:
   * - `single`: one message per key, with `gapMs` between them
   * - `batch`: every key in one message
   * - `release`: one message per key carrying the code and then code | 0x80 (a guessed key-up)
   * - `ready`: like `single`, then a ready check, in case a reply round-trip wakes the UI
   * The whole sequence holds the link, so a screenshot poll can't interleave with it.
   */
  pressKeys(codes: number[], mode: KeyMode = 'single', gapMs = 80): Promise<void> {
    return this.exclusive(async () => {
      if (mode === 'batch') {
        await this.sendMessage(C.sendKeys(codes));
        return;
      }
      for (let i = 0; i < codes.length; i++) {
        if (i) await sleep(gapMs);
        const c = codes[i];
        await this.sendMessage(C.sendKeys(mode === 'release' ? [c, c | 0x80] : [c]));
      }
      if (mode === 'ready') {
        try {
          await this.exchange(C.checkReady(), 'ready reply', 1000);
        } catch (e) {
          if (!(e instanceof TimeoutError)) throw e;
        }
      }
    });
  }

  sendChat(text: string): Promise<void> {
    return this.exclusive(() => this.sendMessage(C.sendChat(text)));
  }

  /**
   * E7 — set the clock. The calculator sends no reply, so follow up with a
   * ready check: a healthy link afterwards is the only signal available.
   */
  setDateTime(d = new Date()): Promise<boolean> {
    return this.exclusive(async () => {
      this.port.drain();
      await this.sendMessage(C.setDateTime(d));
      await sleep(150);
      this.port.drain();
      try {
        const r = await this.exchange(C.checkReady(), 'ready reply', 2000);
        return r[0] === C.READY_REPLY || r[0] === C.CMD.READY;
      } catch (e) {
        if (e instanceof TimeoutError) return false;
        throw e;
      }
    });
  }

  /** Send an arbitrary logical message; optionally wait for one reply. */
  raw(msg: Uint8Array, expectReply: boolean): Promise<Uint8Array | null> {
    return this.exclusive(async () => {
      if (!expectReply) {
        await this.sendMessage(msg);
        return null;
      }
      try {
        return await this.exchange(msg, 'reply');
      } catch (e) {
        if (e instanceof TimeoutError) return null;
        throw e;
      }
    });
  }
}

/** Line endings → "\n", strip BOM. */
export function normalizeSource(s: string): string {
  return s.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
