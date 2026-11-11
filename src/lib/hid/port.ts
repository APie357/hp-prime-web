/** A bidirectional HID report pipe. Implemented by WebHID and by test mocks. */
export interface ReportPort {
  /** Full input/output report size in bytes (excluding report ID). */
  readonly reportSize: number;
  /** Write one report (without report ID). */
  send(report: Uint8Array): Promise<void>;
  /** Next input report, or null after `timeoutMs`. */
  read(timeoutMs: number): Promise<Uint8Array | null>;
  /** Discard queued input reports; returns how many were dropped. */
  drain(): number;
  /** Wake a pending `read` with null right away (lets an idle listener yield the link). */
  cancelRead?(): void;
}

/** FIFO of input reports with async waiting. */
export class ReportQueue {
  private q: Uint8Array[] = [];
  private waiters: ((r: Uint8Array | null) => void)[] = [];

  push(r: Uint8Array): void {
    const w = this.waiters.shift();
    if (w) w(r);
    else this.q.push(r);
  }

  read(timeoutMs: number): Promise<Uint8Array | null> {
    const r = this.q.shift();
    if (r) return Promise.resolve(r);
    return new Promise((resolve) => {
      const waiter = (v: Uint8Array | null) => {
        clearTimeout(timer);
        resolve(v);
      };
      const timer = setTimeout(() => {
        const i = this.waiters.indexOf(waiter);
        if (i >= 0) this.waiters.splice(i, 1);
        resolve(null);
      }, timeoutMs);
      this.waiters.push(waiter);
    });
  }

  drain(): number {
    const n = this.q.length;
    this.q = [];
    return n;
  }

  /** Wake all waiters with null (e.g. on disconnect). */
  abort(): void {
    for (const w of this.waiters.splice(0)) w(null);
  }
}
