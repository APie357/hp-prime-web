/** Application state and actions shared by the components. */
import { log } from './hid/log';
import { PrimeSession } from './hid/session';
import { grantedPrimes, requestPrime, WebHidPort, webHidSupported } from './hid/transport';
import type { DeviceInfo } from './hid/parsers';
import { ObjType } from './hid/commands';
import { fromUtf16le } from './hid/bytes';
import {
  pickFolder,
  programNameFromFile,
  regrant,
  restoreWorkspace,
  SOURCE_EXT,
  useBrowserWorkspace,
  type Workspace,
} from './files/workspace';

export interface CalcProgram {
  name: string;
  source: string;
}

export const app = $state({
  hidSupported: webHidSupported(),
  connected: false,
  deviceLabel: '',
  info: null as DeviceInfo | null,
  busy: '' as string,
  status: '' as string,
  statusKind: 'info' as 'info' | 'ok' | 'error',
  workspaceLabel: '',
  workspaceKind: '' as '' | 'folder' | 'browser',
  needsPermission: false,
  files: [] as string[],
  current: null as string | null,
  dirty: [] as string[],
  calcPrograms: [] as CalcProgram[],
  calcListedAt: 0,
  padReports: false,
  verifyAfterSend: true,
  showConsole: loadPref('showConsole', false),
});

function loadPref(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(`hp-prime-web:${key}`);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

export function toggleConsole(): void {
  app.showConsole = !app.showConsole;
  try {
    localStorage.setItem('hp-prime-web:showConsole', app.showConsole ? '1' : '0');
  } catch {
    /* storage unavailable */
  }
}

let port: WebHidPort | null = null;
let session: PrimeSession | null = null;
let workspace: Workspace | null = null;
let pendingDir: FileSystemDirectoryHandle | null = null;

/** Editor bridge: set by Editor.svelte. */
export const editorBridge = {
  getText: (_file: string): string | null => null,
  setText: (_file: string, _text: string): void => {},
  forget: (_file: string): void => {},
};

function setStatus(text: string, kind: 'info' | 'ok' | 'error' = 'info') {
  app.status = text;
  app.statusKind = kind;
  log(kind === 'error' ? 'error' : kind === 'ok' ? 'ok' : 'info', text);
}

async function busy<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
  if (app.busy) {
    setStatus(`Busy: ${app.busy}`, 'error');
    return undefined;
  }
  app.busy = label;
  try {
    return await fn();
  } catch (e) {
    setStatus(`${label} failed: ${(e as Error).message}`, 'error');
    console.error(e);
    return undefined;
  } finally {
    app.busy = '';
  }
}

// ------------------------------------------------------------- device

export async function connect(): Promise<void> {
  await busy('Connecting', async () => {
    const granted = (await grantedPrimes())[0];
    const device = granted ?? (await requestPrime());
    if (!device) return;
    port = await WebHidPort.open(device);
    port.pad = app.padReports;
    session = new PrimeSession(port);
    app.connected = true;
    app.deviceLabel = port.label;
    let ok = false;
    try {
      ok = await session.ready();
    } catch (e) {
      log('warn', `ready check: ${(e as Error).message}`);
    }
    try {
      app.info = await session.info();
    } catch (e) {
      log('warn', `info: ${(e as Error).message}`);
    }
    const fw = app.info?.firmware ? ` · ${app.info.firmware}` : '';
    setStatus(`Connected to ${app.deviceLabel}${fw}${ok ? '' : ' (no ready reply)'}`, ok ? 'ok' : 'info');
  });
}

export async function disconnect(): Promise<void> {
  await port?.close().catch(() => {});
  port = null;
  session = null;
  app.connected = false;
  app.info = null;
  app.deviceLabel = '';
  setStatus('Disconnected');
}

export function setPadReports(v: boolean) {
  app.padReports = v;
  if (port) port.pad = v;
}

if (app.hidSupported) {
  navigator.hid.addEventListener('disconnect', (e) => {
    if (port && e.device === port.device) {
      port = null;
      session = null;
      app.connected = false;
      app.info = null;
      setStatus('Calculator unplugged', 'error');
    }
  });
}

function needSession(): PrimeSession {
  if (!session) throw new Error('not connected');
  return session;
}

/** Send the open file to the calculator as a program. */
export async function sendCurrent(): Promise<void> {
  const file = app.current;
  if (!file) return setStatus('Open a file first', 'error');
  const text = editorBridge.getText(file);
  if (text === null) return;
  await saveCurrent();
  const name = programNameFromFile(file);
  await busy(`Sending ${name}`, async () => {
    const s = needSession();
    setStatus(`Checking whether ${name} exists on the calculator…`);
    const existing = await s.requestFile(ObjType.PROGRAM, name, 1500);
    if (existing && !confirm(`"${name}" already exists on the calculator. Overwrite it?`)) {
      setStatus('Send cancelled');
      return;
    }
    setStatus(`Sending ${name}…`);
    const r = await s.sendProgram(name, text, app.verifyAfterSend);
    if (r.refused) return setStatus(`Calculator refused ${name}`, 'error');
    upsertCalc(name, r.readback ?? text);
    switch (r.verified) {
      case 'match':
        return setStatus(`Sent ${name} (${r.bytes} B) — read-back verified ✓`, 'ok');
      case 'mismatch':
        log('warn', `read-back differs:\n${r.readback}`);
        return setStatus(`Sent ${name}, but the read-back differs (see console)`, 'error');
      case 'no-reply':
        return setStatus(`Sent ${name} (${r.bytes} B); read-back got no reply`, 'error');
      default:
        return setStatus(`Sent ${name} (${r.bytes} B)`, 'ok');
    }
  });
}

function upsertCalc(name: string, source: string) {
  const i = app.calcPrograms.findIndex((p) => p.name === name);
  if (i >= 0) app.calcPrograms[i] = { name, source };
  else app.calcPrograms = [...app.calcPrograms, { name, source }].sort((a, b) => a.name.localeCompare(b.name));
}

/** List programs on the calculator (full backup stream, takes a while). */
export async function refreshCalcPrograms(): Promise<void> {
  await busy('Reading calculator', async () => {
    const s = needSession();
    setStatus('Reading calculator contents (this can take ~20 s)…');
    const files = await s.backup((p) => {
      app.busy = `Reading calculator (${p.count} objects)`;
    });
    const progs = new Map<string, string>();
    for (const f of files) if (f.type === ObjType.PROGRAM) progs.set(f.name, fromUtf16le(f.data));
    app.calcPrograms = [...progs].map(([name, source]) => ({ name, source })).sort((a, b) => a.name.localeCompare(b.name));
    app.calcListedAt = Date.now();
    setStatus(`Found ${app.calcPrograms.length} program(s) in ${files.length} objects`, 'ok');
  });
}

/** Fetch one program by name (fast; no backup needed). */
export async function fetchProgram(name: string): Promise<void> {
  name = name.trim();
  if (!name) return;
  await busy(`Fetching ${name}`, async () => {
    const src = await needSession().readProgram(name);
    if (src === null) return setStatus(`No reply for "${name}" (names are case-sensitive)`, 'error');
    upsertCalc(name, src);
    setStatus(`Fetched ${name}`, 'ok');
    await importProgram(name, src);
  });
}

/** Put a calculator program into the workspace and open it. */
export async function importProgram(name: string, source: string): Promise<void> {
  const ws = await ensureWorkspace();
  const file = name + SOURCE_EXT;
  if (await ws.exists(file)) {
    const local = app.current === file ? editorBridge.getText(file) : await ws.read(file);
    if (local !== null && local.replace(/\r\n?/g, '\n') !== source.replace(/\r\n?/g, '\n')) {
      if (!confirm(`${file} already exists locally and differs. Replace it with the calculator's version?`)) return;
    }
  }
  await ws.write(file, source);
  editorBridge.setText(file, source);
  await refreshFiles();
  app.current = file;
}

// ---------------------------------------------------------- workspace

async function ensureWorkspace(): Promise<Workspace> {
  if (!workspace) await setWorkspace(await useBrowserWorkspace());
  return workspace!;
}

async function setWorkspace(ws: Workspace) {
  workspace = ws;
  app.workspaceLabel = ws.label;
  app.workspaceKind = ws.kind;
  app.needsPermission = false;
  app.current = null;
  app.dirty = [];
  await refreshFiles();
}

export async function initWorkspace(): Promise<void> {
  try {
    const r = await restoreWorkspace();
    if (!r) return;
    if ('ws' in r) await setWorkspace(r.ws);
    else {
      pendingDir = r.needsPermission;
      app.needsPermission = true;
      app.workspaceLabel = pendingDir.name;
    }
  } catch (e) {
    log('warn', `restore workspace: ${(e as Error).message}`);
  }
}

export async function reopenFolder(): Promise<void> {
  if (!pendingDir) return;
  const ws = await regrant(pendingDir);
  if (ws) await setWorkspace(ws);
}

export async function openFolder(): Promise<void> {
  try {
    await setWorkspace(await pickFolder());
  } catch (e) {
    if ((e as Error).name !== 'AbortError') setStatus(`Open folder failed: ${(e as Error).message}`, 'error');
  }
}

export async function openBrowserStorage(): Promise<void> {
  await setWorkspace(await useBrowserWorkspace());
}

export async function refreshFiles(): Promise<void> {
  app.files = workspace ? await workspace.list() : [];
}

export async function readFile(file: string): Promise<string> {
  return (await ensureWorkspace()).read(file);
}

export async function newFile(): Promise<void> {
  const name = prompt('Program name (letters, digits, _):', 'NEWPROG');
  if (!name) return;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return setStatus(`"${name}" is not a valid program name`, 'error');
  const ws = await ensureWorkspace();
  const file = name + SOURCE_EXT;
  if (await ws.exists(file)) return setStatus(`${file} already exists`, 'error');
  const template = `EXPORT ${name}()\nBEGIN\n  PRINT();\n  PRINT("Hello from ${name}");\nEND;\n`;
  await ws.write(file, template);
  await refreshFiles();
  app.current = file;
}

export async function deleteFile(file: string): Promise<void> {
  if (!confirm(`Delete ${file} from ${app.workspaceLabel}? (The calculator copy is not affected.)`)) return;
  await (await ensureWorkspace()).remove(file);
  editorBridge.forget(file);
  if (app.current === file) app.current = null;
  app.dirty = app.dirty.filter((f) => f !== file);
  await refreshFiles();
}

export function markDirty(file: string) {
  if (!app.dirty.includes(file)) app.dirty = [...app.dirty, file];
}

export async function saveFile(file: string): Promise<void> {
  const text = editorBridge.getText(file);
  if (text === null || !workspace) return;
  await workspace.write(file, text);
  app.dirty = app.dirty.filter((f) => f !== file);
}

export async function saveCurrent(): Promise<void> {
  if (app.current) await saveFile(app.current);
}

// ------------------------------------------------------------- debug

export async function sendRaw(bytes: Uint8Array, expectReply: boolean): Promise<Uint8Array | null | undefined> {
  return busy('Raw send', () => needSession().raw(bytes, expectReply));
}
