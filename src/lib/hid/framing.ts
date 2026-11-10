/**
 * Legacy HP Prime link framing (hplp-style), used by every Prime generation
 * before/without V2 negotiation.
 *
 *   report = [seq][payload ≤ capacity]      capacity = reportSize − 1
 *
 * seq counts 0x00…0xFE and wraps to 0x00 (0xFF is reserved for out-of-band
 * reports). A logical message is the concatenation of the payloads; its
 * length comes from the message header (see `expectedLength`).
 */

export const RESERVED_SEQ = 0xff;

export function nextSeq(seq: number): number {
  const n = (seq + 1) & 0xff;
  return n === RESERVED_SEQ ? 0 : n;
}

/** Interface so a V2 (negotiated) framing can be dropped in later. */
export interface LinkFraming {
  readonly name: string;
  fragment(message: Uint8Array): Uint8Array[];
  createReassembler(): Reassembler;
}

export interface Reassembler {
  /**
   * Feed one input report (without report ID). Returns the complete message
   * when the report finished it, otherwise null.
   */
  push(report: Uint8Array): Uint8Array | null;
  reset(): void;
  readonly pending: boolean;
}

/**
 * Total length of a message given its first bytes, or null if more bytes are
 * needed to know. Messages with a `cmd 01 len(u32 BE)` header are 6 + len
 * long; anything else (ready reply 'Y', short status frames) is treated as
 * self-contained in its first report.
 */
export function expectedLength(first: Uint8Array, reportPayload: number): number | null {
  if (first.length < 2) return null;
  if (first[1] === 0x01 && first[0] !== 0x59) {
    if (first.length < 6) return null;
    const len = ((first[2] << 24) | (first[3] << 16) | (first[4] << 8) | first[5]) >>> 0;
    return len + 6;
  }
  // Single-byte ready reply ('Y' on current firmware, 0xFF echo on old).
  if (first[0] === 0x59 || first[0] === 0xff) return 1;
  // Unknown shape: take the whole first report.
  return reportPayload;
}

export class LegacyFraming implements LinkFraming {
  readonly name = 'legacy';
  constructor(readonly capacity: number) {
    if (capacity < 1) throw new Error('bad capacity');
  }

  fragment(message: Uint8Array): Uint8Array[] {
    const reports: Uint8Array[] = [];
    let seq = 0;
    let off = 0;
    do {
      const chunk = message.subarray(off, off + this.capacity);
      const r = new Uint8Array(1 + chunk.length);
      r[0] = seq;
      r.set(chunk, 1);
      reports.push(r);
      off += chunk.length;
      seq = nextSeq(seq);
    } while (off < message.length);
    return reports;
  }

  createReassembler(): Reassembler {
    return new LegacyReassembler(this.capacity);
  }
}

export class SequenceError extends Error {
  constructor(readonly expected: number, readonly actual: number) {
    super(`packet out of sequence: expected ${expected}, got ${actual}`);
  }
}

class LegacyReassembler implements Reassembler {
  private buf: number[] = [];
  private seq = 0;
  private total: number | null = null;
  private count = 0;

  constructor(private readonly capacity: number) {}

  get pending(): boolean {
    return this.count > 0;
  }

  reset(): void {
    this.buf = [];
    this.seq = 0;
    this.total = null;
    this.count = 0;
  }

  push(report: Uint8Array): Uint8Array | null {
    if (report.length === 0) return null;
    const seq = report[0];
    if (seq === RESERVED_SEQ) return null; // out-of-band
    if (seq !== this.seq) {
      if (seq === 0) {
        // A fresh message started; drop the partial one.
        this.reset();
      } else {
        const expected = this.seq;
        this.reset();
        throw new SequenceError(expected, seq);
      }
    }
    const payload = report.subarray(1, 1 + this.capacity);
    for (const b of payload) this.buf.push(b);
    this.count++;
    this.seq = nextSeq(this.seq);

    // A report shorter than full size terminates the message (unpadded
    // senders such as hidapi/hidraw writes). Padded reports never trigger this.
    const short = payload.length < this.capacity;
    if (this.total === null) {
      this.total = expectedLength(Uint8Array.from(this.buf.slice(0, 6)), this.capacity);
      if (this.total === null && !short) return null;
    }
    if (short && (this.total === null || this.buf.length < this.total)) {
      const msg = Uint8Array.from(this.buf);
      this.reset();
      return msg;
    }
    if (this.total === null) return null;
    // WebHID input reports are always full-size (zero-padded), so the
    // declared length — not report length — decides the end of a message.
    if (this.buf.length >= this.total) {
      const msg = Uint8Array.from(this.buf.slice(0, this.total));
      this.reset();
      return msg;
    }
    return null;
  }
}
