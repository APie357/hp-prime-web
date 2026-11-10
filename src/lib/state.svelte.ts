/** Application state and actions shared by the components. */
import { log } from './hid/log';
import { decodeText, isValidName, KEY_MODES, PrimeSession, type KeyMode, type TextKind } from './hid/session';
import { grantedPrimes, requestPrime, WebHidPort, webHidSupported } from './hid/transport';
import type { DeviceInfo } from './hid/parsers';
import { ObjType } from './hid/commands';
import { K, keysToRun } from './hid/keys';
import { decodeScreen, diffFraction, type PixelMode, type RgbaImage } from './screen';
import { runTarget } from './lang/symbols';
import {
  fileFor,
  kindFromFile,
  pickFolder,
  programNameFromFile,
  regrant,
  restoreWorkspace,
  useBrowserWorkspace,
  type Workspace,
} from './files/workspace';

/** A program or note seen on the calculator. */
export interface CalcObject {
  kind: TextKind;
  name: string;
  text: string;
  formatted: boolean;
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
  calcObjects: [] as CalcObject[],
  calcListedAt: 0,
  padReports: false,
  verifyAfterSend: true,
  showConsole: loadPref('showConsole', false),
});

/** Screen mirror. `image` is replaced wholesale, never mutated. */
export const screen = $state({
  image: null as RgbaImage | null,
  at: 0,
  live: false,
  error: '',
  mode: (loadString('pixelMode') ?? 'rgb555le') as PixelMode,
  /** Result of the key-injection probe on this browser: null = not tested yet. */
  keysWork: loadTri('keysWork'),
  keyMode: (KEY_MODES as string[]).includes(loadString('keyMode') ?? '') ? (loadString('keyMode') as KeyMode) : 'single',
  showKeypad: loadPref('showKeypad', false),
});

function loadString(key: string): string | null {
  try {
    return localStorage.getItem(`hp-prime-web:${key}`);
  } catch {
    return null;
  }
}

function saveString(key: string, v: string | null): void {
  try {
    if (v === null) localStorage.removeItem(`hp-prime-web:${key}`);
    else localStorage.setItem(`hp-prime-web:${key}`, v);
  } catch {
    /* storage unavailable */
  }
}

function loadTri(key: string): boolean | null {
  const v = loadString(key);
  return v === null ? null : v === '1';
}

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
  saveString('showConsole', app.showConsole ? '1' : '0');
}

export function toggleKeypad(): void {
  screen.showKeypad = !screen.showKeypad;
  saveString('showKeypad', screen.showKeypad ? '1' : '0');
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
  screen.live = false;
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
      screen.live = false;
      setStatus('Calculator unplugged', 'error');
    }
  });
}

function needSession(): PrimeSession {
  if (!session) throw new Error('not connected');
  return session;
}

/** Send the open file to the calculator as a program or note. Resolves true when it arrived. */
export async function sendCurrent(): Promise<boolean> {
  const file = app.current;
  if (!file) {
    setStatus('Open a file first', 'error');
    return false;
  }
  const text = editorBridge.getText(file);
  if (text === null) return false;
  await saveCurrent();
  const kind = kindFromFile(file);
  const name = programNameFromFile(file);
  if (!isValidName(kind, name)) {
    setStatus(
      kind === 'program'
        ? `"${name}" is not a valid program name (letters, digits, _; must not start with a digit)`
        : `"${name}" is not a valid note name`,
      'error',
    );
    return false;
  }
  const ok = await busy(`Sending ${name}`, async (): Promise<boolean> => {
    const s = needSession();
    setStatus(`Checking whether ${kind} ${name} exists on the calculator…`);
    const existing = await s.readText(kind, name, 1500);
    if (existing) {
      const extra = existing.formatted ? '\n\nIts rich-text formatting will be replaced by plain text.' : '';
      if (!confirm(`${kind === 'note' ? 'Note' : 'Program'} "${name}" already exists on the calculator. Overwrite it?${extra}`)) {
        setStatus('Send cancelled');
        return false;
      }
    }
    setStatus(`Sending ${name}…`);
    const r = await s.sendText(kind, name, text, app.verifyAfterSend);
    if (r.refused) {
      setStatus(`Calculator refused ${name}`, 'error');
      return false;
    }
    upsertCalc({ kind, name, text: r.readback ?? text, formatted: false });
    switch (r.verified) {
      case 'match':
        setStatus(`Sent ${kind} ${name} (${r.bytes} B) — read-back verified ✓`, 'ok');
        return true;
      case 'mismatch':
        log('warn', `read-back differs:\n${r.readback}`);
        setStatus(`Sent ${name}, but the read-back differs (see console)`, 'error');
        return false;
      case 'no-reply':
        setStatus(`Sent ${name} (${r.bytes} B); read-back got no reply`, 'error');
        return true;
      default:
        setStatus(`Sent ${kind} ${name} (${r.bytes} B)`, 'ok');
        return true;
    }
  });
  return ok ?? false;
}

function upsertCalc(obj: CalcObject) {
  const i = app.calcObjects.findIndex((p) => p.kind === obj.kind && p.name === obj.name);
  if (i >= 0) app.calcObjects[i] = obj;
  else app.calcObjects = [...app.calcObjects, obj].sort((a, b) => a.name.localeCompare(b.name));
}

/** List programs and notes on the calculator (full backup stream, takes a while). */
export async function refreshCalcContents(): Promise<void> {
  await busy('Reading calculator', async () => {
    const s = needSession();
    setStatus('Reading calculator contents (this can take ~20 s)…');
    const files = await s.backup((p) => {
      app.busy = `Reading calculator (${p.count} objects)`;
    });
    const objs = new Map<string, CalcObject>();
    for (const f of files) {
      const kind: TextKind | null = f.type === ObjType.PROGRAM ? 'program' : f.type === ObjType.NOTE ? 'note' : null;
      if (!kind) continue;
      objs.set(`${kind}:${f.name}`, { kind, name: f.name, ...decodeText(kind, f.data) });
    }
    app.calcObjects = [...objs.values()].sort((a, b) => a.name.localeCompare(b.name));
    app.calcListedAt = Date.now();
    const n = (k: TextKind) => app.calcObjects.filter((o) => o.kind === k).length;
    setStatus(`Found ${n('program')} program(s) and ${n('note')} note(s) in ${files.length} objects`, 'ok');
  });
}

/** Fetch one program or note by name (fast; no backup needed). */
export async function fetchObject(kind: TextKind, name: string): Promise<void> {
  name = name.trim();
  if (!name) return;
  await busy(`Fetching ${name}`, async () => {
    const obj = await needSession().readText(kind, name);
    if (!obj) return setStatus(`No ${kind} named "${name}" answered (names are case-sensitive)`, 'error');
    upsertCalc(obj);
    setStatus(`Fetched ${kind} ${name}${obj.formatted ? ' (rich formatting not shown; editing keeps plain text only)' : ''}`, 'ok');
    await importObject(obj.kind, obj.name, obj.text);
  });
}

/** Put a calculator program or note into the workspace and open it. */
export async function importObject(kind: TextKind, name: string, text: string): Promise<void> {
  const ws = await ensureWorkspace();
  const file = fileFor(kind, name);
  if (await ws.exists(file)) {
    const local = app.current === file ? editorBridge.getText(file) : await ws.read(file);
    if (local !== null && local.replace(/\r\n?/g, '\n') !== text.replace(/\r\n?/g, '\n')) {
      if (!confirm(`${file} already exists locally and differs. Replace it with the calculator's version?`)) return;
    }
  }
  await ws.write(file, text);
  editorBridge.setText(file, text);
  await refreshFiles();
  app.current = file;
}

/** Set the calculator's clock to this computer's local time. */
export async function syncClock(): Promise<void> {
  await busy('Setting clock', async () => {
    const now = new Date();
    const ok = await needSession().setDateTime(now);
    const when = now.toLocaleString([], { dateStyle: 'medium', timeStyle: 'medium' });
    if (ok) setStatus(`Clock set to ${when} — check it on the calculator`, 'ok');
    else setStatus(`Clock sent (${when}), but the calculator didn't answer the follow-up ready check`, 'error');
  });
}

// ------------------------------------------------------ screen + keys

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Take one screenshot into `screen.image`. Returns the image, or null on failure. */
export async function captureScreen(): Promise<RgbaImage | null> {
  if (!session) return null;
  try {
    const shot = await session.screenshot();
    const img = await decodeScreen(shot, screen.mode);
    screen.image = img;
    screen.at = Date.now();
    screen.error = '';
    return img;
  } catch (e) {
    screen.error = (e as Error).message;
    log('warn', `screenshot: ${screen.error}`);
    return null;
  }
}

export function setPixelMode(mode: PixelMode): void {
  screen.mode = mode;
  saveString('pixelMode', mode);
  void captureScreen();
}

let liveLoop: Promise<void> | null = null;

/** Mirror the screen continuously until turned off or disconnected. */
export function setLive(on: boolean): void {
  screen.live = on && !!session;
  if (!screen.live || liveLoop) return;
  liveLoop = (async () => {
    let failures = 0;
    while (screen.live && session) {
      // Long operations (backup, send) hold the link; don't queue screenshots behind them.
      if (app.busy) {
        await sleep(300);
        continue;
      }
      const ok = await captureScreen();
      failures = ok ? 0 : failures + 1;
      if (failures >= 3) {
        screen.live = false;
        setStatus(`Live screen stopped: ${screen.error}`, 'error');
        break;
      }
      await sleep(250);
    }
  })().finally(() => {
    liveLoop = null;
  });
}

let refreshTimer: ReturnType<typeof setTimeout> | undefined;

/** Press keys on the calculator, then refresh the screen view shortly after (unless live). */
export async function pressKeys(codes: number[]): Promise<void> {
  if (!session || !codes.length) return;
  try {
    await session.pressKeys(codes, screen.keyMode);
  } catch (e) {
    setStatus(`Key press failed: ${(e as Error).message}`, 'error');
    return;
  }
  if (screen.live) return;
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => void captureScreen(), 350);
}

/** Switch how keys are encoded; forgets the probe result, which belonged to the old mode. */
export function setKeyMode(mode: KeyMode): void {
  screen.keyMode = mode;
  saveString('keyMode', mode);
  screen.keysWork = null;
  saveString('keysWork', null);
}

function rememberKeysWork(v: boolean): void {
  screen.keysWork = v;
  saveString('keysWork', v ? '1' : '0');
}

/**
 * Find out whether key injection works: go Home, screenshot, type "1", screenshot, delete it, and
 * compare the two screenshots.
 */
export async function probeKeys(): Promise<void> {
  await busy('Testing key injection', async () => {
    const s = needSession();
    await s.pressKeys([K.HOME, K.ESC], screen.keyMode);
    await sleep(400);
    const before = await s.screenshot().then((x) => decodeScreen(x, screen.mode));
    await s.pressKeys([K.ONE], screen.keyMode);
    await sleep(400);
    const afterShot = await s.screenshot();
    const after = await decodeScreen(afterShot, screen.mode);
    await s.pressKeys([K.DEL], screen.keyMode);
    screen.image = after;
    screen.at = Date.now();
    const changed = diffFraction(before, after);
    log('info', `key probe: ${(changed * 100).toFixed(2)}% of pixels changed after pressing 1`);
    if (changed > 0.0005) {
      rememberKeysWork(true);
      setStatus('Key injection works on this calculator ✓ — Send & Run can start programs', 'ok');
    } else {
      rememberKeysWork(false);
      setStatus("Key injection had no visible effect — Send & Run can't start programs; run them from the Program Catalog", 'error');
    }
    setTimeout(() => void captureScreen(), 300);
  });
}

/** Send the open program, then start it from the Home view with injected keys and mirror the screen. */
export async function sendAndRun(): Promise<void> {
  const file = app.current;
  if (!file || kindFromFile(file) !== 'program') return setStatus('Open a program to run it', 'error');
  const text = editorBridge.getText(file);
  if (text === null) return;
  const target = runTarget(programNameFromFile(file), text);
  if (!target) return setStatus('Nothing to run: the program has no EXPORT procedure', 'error');
  let args = '';
  if (target.params.length) {
    const answer = prompt(
      `${target.name}(${target.params.join(', ')}) takes arguments. Enter them separated by commas (numbers only):`,
      '',
    );
    if (answer === null) return;
    if (!/^[\d.,\s-]*$/.test(answer)) return setStatus('Arguments can only use digits, ".", "," and "-"', 'error');
    args = answer;
  }
  if (!(await sendCurrent())) return;
  if (screen.keysWork === false) {
    setLive(true);
    return setStatus(
      `Sent ${target.name}. Key injection didn't work on this calculator, so start it from the Program Catalog (Shift+1)`,
      'info',
    );
  }
  await busy(`Running ${target.name}`, async () => {
    const before = await captureScreen();
    await needSession().pressKeys(keysToRun(target.name, args), screen.keyMode);
    await sleep(600);
    const after = await captureScreen();
    const call = args ? `${target.name}(${args})` : target.name;
    if (before && after && diffFraction(before, after) === 0) {
      setStatus(`Typed ${call} on the Home view, but the screen didn't change. Key injection may not work here; try "Test keys"`, 'error');
    } else {
      setStatus(`Started ${call} on the calculator (press On or Esc on the keypad to stop it)`, 'ok');
    }
  });
  setLive(true);
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

export async function newFile(kind: TextKind = 'program'): Promise<void> {
  const name = prompt(
    kind === 'program' ? 'Program name (letters, digits, _):' : 'Note name:',
    kind === 'program' ? 'NEWPROG' : 'New note',
  );
  if (!name) return;
  if (!isValidName(kind, name)) return setStatus(`"${name}" is not a valid ${kind} name`, 'error');
  const ws = await ensureWorkspace();
  const file = fileFor(kind, name);
  if (await ws.exists(file)) return setStatus(`${file} already exists`, 'error');
  const template =
    kind === 'program' ? `EXPORT ${name}()\nBEGIN\n  PRINT();\n  PRINT("Hello from ${name}");\nEND;\n` : '';
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
