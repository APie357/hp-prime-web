import { writable } from 'svelte/store';
import { hex } from './bytes';

export type LogKind = 'out' | 'in' | 'info' | 'warn' | 'error' | 'ok';

export interface LogEntry {
  id: number;
  t: number;
  kind: LogKind;
  text: string;
}

const MAX = 3000;
let nextId = 1;

export const logEntries = writable<LogEntry[]>([]);

/** Hex-dump packets? Off by default for big transfers, toggled in the console. */
export const logPackets = writable(true);
let packetsOn = true;
logPackets.subscribe((v) => (packetsOn = v));

export function log(kind: LogKind, text: string): void {
  const e: LogEntry = { id: nextId++, t: Date.now(), kind, text };
  logEntries.update((l) => {
    const n = l.length >= MAX ? l.slice(l.length - MAX + 1) : l.slice();
    n.push(e);
    return n;
  });
}

export function logPacket(dir: 'out' | 'in', report: Uint8Array): void {
  if (!packetsOn) return;
  log(dir, hex(report, 96));
}

export function clearLog(): void {
  logEntries.set([]);
}
