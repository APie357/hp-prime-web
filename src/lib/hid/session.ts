/**
 * PrimeSession — the request/response layer on top of a ReportPort.
 * All operations are serialized: the Prime link is strictly half-duplex.
 */
import { bytesEqual, fromUtf16le, utf16le, hex } from './bytes';
import * as C from './commands';
import { LegacyFraming, type LinkFraming, type Reassembler } from './framing';
import { log } from './log';
import {
  parseChat,
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

export interface SendAppResult {
  name: string;
  bytes: number;
  refused: boolean;
  verified: 'match' | 'mismatch' | 'no-reply' | 'skipped';
}

export interface DeleteResult {
  /** The calculator answered with an F9 (refusal) frame. */
  refused: boolean;
  /** An F8 probe afterwards got no reply, so the object is gone. */
  gone: boolean;
}

export interface BackupProgress {
  count: number;
  last?: PrimeFile;
}

export class PrimeSession {
  readonly framing: LinkFraming;
  private chain: Promise<unknown> = Promise.resolve();
  timeouts: Timeouts = { ...DEFAULT_TIMEOUTS };
  /** Called for objects (F7) the calculator sends on its own: its Send key in Apps, Program Catalog, Notes. */
  onObject?: (file: PrimeFile) => void;
  /** True while an operation is waiting for an F7 (F8 fetch, backup); other F7s are unsolicited. */
  private expectFile = false;
  /** Called for chat (F2) messages the calculator sends on its own. "" = the Messages app's Help key. */
  onChat?: (text: string) => void;
  /** Operations queued or running (excluding the idle listener). */
  private waiting = 0;
  private listening = false;
  private idleRead = false;
  private idleLoop: Promise<void> | null = null;
  private idleRe: Reassembler;

  constructor(readonly port: ReportPort, framing?: LinkFraming) {
    this.framing = framing ?? new LegacyFraming(port.reportSize - 1);
    this.idleRe = this.framing.createReassembler();
  }

  /** Run `fn` exclusively (queued behind any in-flight operation). */
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    this.waiting++;
    // Make the idle listener give up the link, unless it is mid-way through a message.
    if (this.idleRead && !this.idleRe.pending) this.port.cancelRead?.();
    const run = this.chain.then(fn, fn).finally(() => this.waiting--);
    this.chain = run.catch(() => undefined);
    return run;
  }

  /**
   * Listen for messages the calculator sends unprompted (chat) while no operation is running.
   * Without this, they sit in the queue until the next operation drains them as stale.
   */
  listen(on = true): void {
    this.listening = on;
    if (!on) {
      if (this.idleRead) this.port.cancelRead?.();
      return;
    }
    this.idleLoop ??= this.runIdle().finally(() => {
      this.idleLoop = null;
    });
  }

  private async runIdle(): Promise<void> {
    while (this.listening) {
      if (this.waiting) {
        await this.chain;
        continue;
      }
      const turn = this.chain.then(() => this.idleStep());
      this.chain = turn.catch(() => undefined);
      await this.chain;
    }
  }

  private async idleStep(): Promise<void> {
    if (this.waiting || !this.listening) return;
    this.idleRead = true;
    let r: Uint8Array | null;
    try {
      r = await this.port.read(this.idleRe.pending ? this.timeouts.between : 1000);
    } finally {
      this.idleRead = false;
    }
    if (!r) {
      if (this.idleRe.pending && !this.waiting) {
        log('warn', 'unsolicited message was cut off');
        this.idleRe.reset();
      }
      return;
    }
    try {
      const msg = this.idleRe.push(r);
      if (msg) this.unsolicited(msg);
    } catch (e) {
      log('warn', `unsolicited data: ${(e as Error).message}`);
    }
  }

  /** Handle a message nobody asked for. Returns true when it was one (so callers keep waiting). */
  private unsolicited(msg: Uint8Array): boolean {
    if (msg[0] === C.CMD.CHAT) {
      try {
        const text = parseChat(msg);
        log('info', text ? `chat from calculator: ${text}` : 'calculator pressed Help in Messages (empty chat message)');
        this.onChat?.(text);
      } catch (e) {
        log('warn', `bad chat message: ${(e as Error).message}`);
      }
      return true;
    }
    if (msg[0] === C.CMD.FILE) {
      try {
        const f = parseFileMessage(msg);
        if (!f.crcOk) log('warn', `CRC mismatch on ${f.name} sent by the calculator`);
        log('info', `calculator sent ${C.OBJ_TYPE_NAMES[f.type] ?? `type ${f.type}`} "${f.name}" (${f.data.length} B)`);
        this.onObject?.(f);
      } catch (e) {
        log('warn', `bad object from calculator: ${(e as Error).message}`);
      }
      return true;
    }
    log('warn', `unsolicited message: ${hex(msg, 16)}`);
    return false;
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
      // Chat, or an object from the calculator's Send key, can arrive ahead of the reply we wait for.
      if (msg && msg[0] === C.CMD.CHAT && this.unsolicited(msg)) continue;
      if (msg && msg[0] === C.CMD.FILE && !this.expectFile && this.unsolicited(msg)) continue;
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
    this.expectFile = true;
    try {
      const r = await this.exchange(C.requestFile(type, name), `file ${name}`, timeoutMs);
      if (r[0] !== C.CMD.FILE) throw new Error(`unexpected reply to F8: ${hex(r, 12)}`);
      const f = parseFileMessage(r);
      if (!f.crcOk) log('warn', `CRC mismatch on received ${name}`);
      return f;
    } catch (e) {
      if (e instanceof TimeoutError) return null;
      throw e;
    } finally {
      this.expectFile = false;
    }
  }

  /**
   * F7. Current firmware sends no acknowledgment, so silence is success;
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
      this.expectFile = true;
      try {
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
      } finally {
        this.expectFile = false;
      }
      return files;
    });
  }

  /**
   * Send an app (type 02 payload, see files/app.ts) and read it back with F8 to verify.
   * `name` is the calculator name (`&` prefix for built-in apps).
   */
  sendApp(name: string, payload: Uint8Array, verify = true): Promise<SendAppResult> {
    return this.exclusive(async () => {
      const { refused } = await this.sendFileUnlocked(C.ObjType.APP, name, payload);
      const res: SendAppResult = { name, bytes: payload.length, refused, verified: 'skipped' };
      if (refused || !verify) return res;
      await sleep(400);
      const back = await this.requestFileUnlocked(C.ObjType.APP, name, 5000);
      if (!back) res.verified = 'no-reply';
      else res.verified = sameIgnoringTrailingZeros(back.data, payload) ? 'match' : 'mismatch';
      return res;
    });
  }

  /** F8 for an app; null when the calculator stays silent. */
  readApp(name: string, timeoutMs = 5000): Promise<PrimeFile | null> {
    return this.requestFile(C.ObjType.APP, name, timeoutMs);
  }

  /**
   * EB — delete one named object, then probe with F8 to confirm it is gone.
   * The reply to EB is undocumented: an F9 frame is treated as a refusal, anything else
   * (or silence) is logged, and the F8 probe decides.
   */
  deleteObject(type: number, name: string): Promise<DeleteResult> {
    return this.exclusive(async () => {
      let refused = false;
      try {
        const r = await this.exchange(C.deleteObject(type, name), 'delete reply', 1500);
        if (r[0] === C.CMD.BACKUP) refused = true;
        else log('info', `EB reply: ${hex(r, 12)}`);
      } catch (e) {
        if (!(e instanceof TimeoutError)) throw e;
      }
      if (refused) return { refused, gone: false };
      await sleep(250);
      const still = await this.requestFileUnlocked(type, name, 1500);
      return { refused, gone: !still };
    });
  }

  /** EC — fire-and-forget; firmware sends no acknowledgment. */
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

  /** Clear the Help• flag the Messages app's Help key sets. */
  clearHelp(): Promise<void> {
    return this.exclusive(() => this.sendMessage(C.clearHelp()));
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

/** Equal, allowing extra zero bytes at the end of `got` (the calculator pads some replies). */
function sameIgnoringTrailingZeros(got: Uint8Array, want: Uint8Array): boolean {
  if (got.length < want.length || !bytesEqual(got.subarray(0, want.length), want)) return false;
  return got.subarray(want.length).every((b) => b === 0);
}

/** Line endings → "\n", strip BOM. */
export function normalizeSource(s: string): string {
  return s.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
