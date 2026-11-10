/// <reference types="w3c-web-hid" />
/** WebHID transport for HP Prime calculators. */
import { logPacket, log } from './log';
import { ReportQueue, type ReportPort } from './port';

export const HP_VID = 0x03f0;
export const PRIME_PIDS: Record<number, string> = {
  0x0441: 'HP Prime G1 (early firmware)',
  0x1541: 'HP Prime G1',
  0x2441: 'HP Prime G2',
};

export const PRIME_FILTERS: HIDDeviceFilter[] = Object.keys(PRIME_PIDS).map((pid) => ({
  vendorId: HP_VID,
  productId: Number(pid),
}));

export function webHidSupported(): boolean {
  return typeof navigator !== 'undefined' && 'hid' in navigator && window.isSecureContext;
}

/** Size in bytes of report ID 0 for the given direction, from the HID descriptor. */
export function reportSizeFromDescriptor(device: HIDDevice, dir: 'input' | 'output'): number | null {
  for (const c of device.collections ?? []) {
    const reports = dir === 'input' ? c.inputReports : c.outputReports;
    for (const r of reports ?? []) {
      if ((r.reportId ?? 0) !== 0) continue;
      let bits = 0;
      for (const it of r.items ?? []) bits += (it.reportSize ?? 0) * (it.reportCount ?? 0);
      if (bits > 0) return Math.ceil(bits / 8);
    }
  }
  return null;
}

export class WebHidPort implements ReportPort {
  readonly reportSize: number;
  readonly outputSize: number;
  /** Pad outgoing reports to the full output report size (some OS stacks require it). */
  pad = false;
  private queue = new ReportQueue();
  private onReport = (e: HIDInputReportEvent) => {
    const r = new Uint8Array(e.data.buffer, e.data.byteOffset, e.data.byteLength).slice();
    logPacket('in', r);
    this.queue.push(r);
  };

  private constructor(readonly device: HIDDevice) {
    const inSize = reportSizeFromDescriptor(device, 'input');
    const outSize = reportSizeFromDescriptor(device, 'output');
    const fallback = device.productId === 0x2441 ? 1024 : 64;
    this.reportSize = inSize ?? outSize ?? fallback;
    this.outputSize = outSize ?? this.reportSize;
    device.addEventListener('inputreport', this.onReport);
  }

  static async open(device: HIDDevice): Promise<WebHidPort> {
    if (!device.opened) await device.open();
    const p = new WebHidPort(device);
    log(
      'info',
      `Opened ${device.productName || PRIME_PIDS[device.productId] || 'device'} ` +
        `(${hex4(device.vendorId)}:${hex4(device.productId)}), report size ${p.reportSize}/${p.outputSize} B`,
    );
    return p;
  }

  get label(): string {
    return PRIME_PIDS[this.device.productId] ?? this.device.productName ?? 'HP Prime';
  }

  async send(report: Uint8Array): Promise<void> {
    let data = report;
    if (this.pad && data.length < this.outputSize) {
      data = new Uint8Array(this.outputSize);
      data.set(report);
    }
    logPacket('out', report);
    await this.device.sendReport(0, data as Uint8Array<ArrayBuffer>);
  }

  read(timeoutMs: number): Promise<Uint8Array | null> {
    return this.queue.read(timeoutMs);
  }

  drain(): number {
    return this.queue.drain();
  }

  async close(): Promise<void> {
    this.device.removeEventListener('inputreport', this.onReport);
    this.queue.abort();
    if (this.device.opened) await this.device.close();
  }
}

export async function requestPrime(): Promise<HIDDevice | null> {
  const devices = await navigator.hid.requestDevice({ filters: PRIME_FILTERS });
  return devices[0] ?? null;
}

/** Previously granted devices (reconnect without a picker). */
export async function grantedPrimes(): Promise<HIDDevice[]> {
  const all = await navigator.hid.getDevices();
  return all.filter((d) => d.vendorId === HP_VID && d.productId in PRIME_PIDS);
}

function hex4(n: number): string {
  return n.toString(16).padStart(4, '0');
}
