/** Application state and actions shared by the components. */
import { log } from './hid/log';
import { decodeText, isValidName, KEY_MODES, KIND_TYPE, PrimeSession, type KeyMode, type TextKind } from './hid/session';
import type { PrimeFile } from './hid/parsers';
import { backupFileName, buildBackupZip, readBackupZip } from './files/backup';
import { grantedPrimes, requestPrime, WebHidPort, webHidSupported } from './hid/transport';
import type { DeviceInfo } from './hid/parsers';
import { ObjType } from './hid/commands';
import { K, keysToRun } from './hid/keys';
import { decodeScreen, diffFraction, type PixelMode, type RgbaImage } from './screen';
import { runTarget } from './lang/symbols';
import {
  appDirName,
  appDisplayName,
  appOfPath,
  appToFolder,
  baseAppOf,
  buildAppPayload,
  decodeAppProgram,
  encodeAppText,
  folderToApp,
  isSystemApp,
  isValidAppName,
  newAppStarter,
  type AppLanguage,
  noneBag,
  parseAppPayload,
} from './files/app';
import { BinaryFileError, fileType, languageFor } from './files/kinds';
import { ICON_FILE, ICON_SIZE, makeAppIcon, pickImage, type IconResult } from './files/icon';
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

/** An app seen on the calculator (from a listing or its Send key). */
export interface CalcApp {
  /** Calculator name; built-in apps start with `&`. */
  name: string;
  base: string;
  payload: Uint8Array;
}

/** A base an app can be created from. */
export interface AppBase {
  label: string;
  bag: Uint8Array;
  base: string;
}

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
  /** Chat with the calculator, oldest first. */
  chat: [] as ChatLine[],
  /** The calculator pressed Help in Messages and it hasn't been cleared from here. */
  helpPending: false,
  /** Apps on the calculator, from the last listing. */
  calcApps: [] as CalcApp[],
  /** "New app" dialog is open. */
  newAppOpen: false,
  /** Files open in editor tabs, in tab order. */
  openFiles: [] as string[],
  /** Side-by-side comparison waiting for the user (see `showDiff`). */
  diff: null as DiffRequest | null,
});

export interface DiffAction {
  id: string;
  label: string;
  primary?: boolean;
}

export interface DiffRequest {
  title: string;
  message?: string;
  original: string;
  modified: string;
  originalLabel: string;
  modifiedLabel: string;
  /** Monaco language id for highlighting. */
  language: string;
  actions: DiffAction[];
  resolve: (action: string | null) => void;
}

/** Show two texts side by side; resolves with the chosen action id, or null when dismissed. */
export function showDiff(req: Omit<DiffRequest, 'resolve'>): Promise<string | null> {
  app.diff?.resolve(null);
  return new Promise((resolve) => {
    app.diff = { ...req, resolve };
  });
}

export function closeDiff(action: string | null): void {
  const d = app.diff;
  app.diff = null;
  d?.resolve(action);
}

const langFor = languageFor;

export interface ChatLine {
  dir: 'in' | 'out';
  text: string;
  /** The calculator's Help softkey in Messages (sent as an empty message). */
  help?: boolean;
  at: number;
}

function addChat(dir: ChatLine['dir'], text: string, help = false): void {
  app.chat = [...app.chat.slice(-199), { dir, text, at: Date.now(), help }];
}

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
  /** Move an open file's model to a new name (keeps undo history where possible). */
  rename: (_from: string, _to: string): void => {},
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
    if (device) await openDevice(device);
  });
}

/** Open an already-granted calculator without a picker: on page load and when one is plugged in. */
export async function autoConnect(): Promise<void> {
  if (!app.hidSupported || app.connected || app.busy) return;
  const device = (await grantedPrimes().catch(() => []))[0];
  if (!device) return;
  await busy('Reconnecting', () => openDevice(device));
}

async function openDevice(device: HIDDevice): Promise<void> {
  port = await WebHidPort.open(device);
  port.pad = app.padReports;
  session = new PrimeSession(port);
  session.onObject = (f) => queueIncoming(f);
  session.onChat = (text) => {
    if (!text) {
      addChat('in', '', true);
      app.helpPending = true;
      return setStatus('The calculator asked for help (Help key in Messages)', 'ok');
    }
    addChat('in', text);
    setStatus(`Message from calculator: ${text}`, 'ok');
  };
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
  session.listen();
  const fw = app.info?.firmware ? ` · ${app.info.firmware}` : '';
  setStatus(`Connected to ${app.deviceLabel}${fw}${ok ? '' : ' (no ready reply)'}`, ok ? 'ok' : 'info');
}

export async function disconnect(): Promise<void> {
  session?.listen(false);
  await port?.close().catch(() => {});
  port = null;
  session = null;
  app.connected = false;
  app.helpPending = false;
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
      session?.listen(false);
      port = null;
      session = null;
      app.connected = false;
      app.info = null;
      screen.live = false;
      setStatus('Calculator unplugged', 'error');
    }
  });
  navigator.hid.addEventListener('connect', () => {
    // A granted calculator was plugged (back) in; give it a moment to finish enumerating.
    setTimeout(() => void autoConnect(), 800);
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
  const appName = appOfPath(file);
  if (appName) return sendAppFolder(appName);
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
        setStatus('Send canceled');
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
        setStatus(`Sent ${name}, but the read-back differs`, 'error');
        void showDiff({
          title: `Read-back of ${name} differs`,
          message: 'Left: what was sent. Right: what the calculator returned.',
          original: text,
          modified: r.readback ?? '',
          originalLabel: 'Sent',
          modifiedLabel: 'Calculator',
          language: langFor(file),
          actions: [{ id: 'close', label: 'Close', primary: true }],
        });
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
    app.calcApps = files
      .filter((f) => f.type === ObjType.APP)
      .map((f) => calcAppFrom(f))
      .filter((a): a is CalcApp => !!a)
      .sort((a, b) => Number(isSystemApp(a.name)) - Number(isSystemApp(b.name)) || a.name.localeCompare(b.name));
    app.calcListedAt = Date.now();
    const n = (k: TextKind) => app.calcObjects.filter((o) => o.kind === k).length;
    setStatus(
      `Found ${app.calcApps.length} app(s), ${n('program')} program(s) and ${n('note')} note(s) in ${files.length} objects`,
      'ok',
    );
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
      const choice = await showDiff({
        title: `${file} differs from the calculator's copy`,
        message: 'Left: your local file. Right: the calculator.',
        original: local,
        modified: text,
        originalLabel: 'Local',
        modifiedLabel: 'Calculator',
        language: langFor(file),
        actions: [
          { id: 'keep', label: 'Keep local' },
          { id: 'replace', label: "Use calculator's version", primary: true },
        ],
      });
      if (choice !== 'replace') {
        if (choice === 'keep') openFile(file);
        return;
      }
    }
  }
  await writeTracked(file, text);
  editorBridge.setText(file, text);
  await refreshFiles();
  openFile(file);
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

/** Delete a program or note on the calculator, after confirmation, and check that it's gone. */
export async function deleteCalcObject(kind: TextKind, name: string): Promise<void> {
  const what = `${kind} "${name}"`;
  if (!confirm(`Delete ${what} from the calculator? This can't be undone (your workspace copy, if any, is kept).`)) return;
  await busy(`Deleting ${name}`, async () => {
    const r = await needSession().deleteObject(KIND_TYPE[kind], name);
    if (r.refused) return setStatus(`The calculator refused to delete ${what}`, 'error');
    if (!r.gone) return setStatus(`Sent delete for ${what}, but it still answers a fetch (see console)`, 'error');
    app.calcObjects = app.calcObjects.filter((o) => !(o.kind === kind && o.name === name));
    setStatus(`Deleted ${what} from the calculator ✓`, 'ok');
  });
}

/** Read everything on the calculator (F9) and download it as a .zip. */
export async function backupToZip(): Promise<void> {
  await busy('Backing up', async () => {
    setStatus('Reading the whole calculator for a backup (this can take ~20 s)…');
    const files = await needSession().backup((p) => {
      app.busy = `Backing up (${p.count} objects)`;
    });
    const now = new Date();
    const device = { label: app.deviceLabel, name: app.info?.name, firmware: app.info?.firmware, serial: app.info?.serial };
    const zip = buildBackupZip(files, device, now);
    downloadBytes(zip, backupFileName(app.info?.name || app.deviceLabel, now), 'application/zip');
    setStatus(`Backup saved: ${files.length} objects, ${(zip.length / 1024).toFixed(1)} KB`, 'ok');
  });
}

/** Send the programs and notes in a backup .zip back to the calculator (other object types are skipped). */
export async function restoreFromZip(zipFile: File): Promise<void> {
  let parsed: ReturnType<typeof readBackupZip>;
  try {
    parsed = readBackupZip(new Uint8Array(await zipFile.arrayBuffer()));
  } catch (e) {
    return setStatus(`Can't read ${zipFile.name}: ${(e as Error).message}`, 'error');
  }
  const items = parsed.files
    .map((f) => ({ f, kind: (f.type === ObjType.PROGRAM ? 'program' : f.type === ObjType.NOTE ? 'note' : null) as TextKind | null }))
    .filter((x): x is { f: PrimeFile; kind: TextKind } => !!x.kind && isValidName(x.kind, x.f.name));
  const skipped = parsed.files.length - items.length;
  if (!items.length) return setStatus('The backup has no programs or notes to restore', 'error');
  const list = items.map((x) => `${x.kind} ${x.f.name}`).join(', ');
  if (
    !confirm(
      `Restore ${items.length} object(s) from ${zipFile.name} (made ${new Date(parsed.manifest.createdAt).toLocaleString()})?\n\n` +
        `${list}\n\nObjects with the same name on the calculator are overwritten. ` +
        `Notes are restored as plain text.${skipped ? ` ${skipped} other object(s) (apps, variables, settings) are skipped.` : ''}`,
    )
  )
    return;
  await busy('Restoring', async () => {
    const s = needSession();
    const failed: string[] = [];
    for (const [i, { f, kind }] of items.entries()) {
      app.busy = `Restoring ${f.name} (${i + 1}/${items.length})`;
      const text = decodeText(kind, f.data).text;
      const r = await s.sendText(kind, f.name, text, app.verifyAfterSend);
      if (r.refused || r.verified === 'mismatch') failed.push(f.name);
      else upsertCalc({ kind, name: f.name, text, formatted: false });
    }
    if (failed.length) setStatus(`Restored ${items.length - failed.length}/${items.length}; failed: ${failed.join(', ')}`, 'error');
    else setStatus(`Restored ${items.length} object(s) from ${zipFile.name} ✓`, 'ok');
  });
}

/** F2 chat message; it shows up in the calculator's chat, which can reply (see `onChat`). */
export async function sendChatMessage(text: string): Promise<boolean> {
  if (!text) return false;
  const ok = await busy('Sending message', async () => {
    await needSession().sendChat(text);
    addChat('out', text);
    return true;
  });
  return ok ?? false;
}

/** Answer a help request: turns off the calculator's Help• flag. */
export async function clearHelp(): Promise<void> {
  await busy('Clearing help', async () => {
    await needSession().clearHelp();
    app.helpPending = false;
    setStatus('Cleared the help request on the calculator', 'ok');
  });
}

export function clearChat(): void {
  app.chat = [];
}

function downloadBytes(data: Uint8Array, name: string, type: string): void {
  const url = URL.createObjectURL(new Blob([data as Uint8Array<ArrayBuffer>], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
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
  if (!file || fileType(file) !== 'program') return setStatus('Open a program to run it', 'error');
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

// ------------------------------------------------------------------ apps

function calcAppFrom(f: PrimeFile): CalcApp | null {
  try {
    return { name: f.name, base: baseAppOf(parseAppPayload(f.data).bag), payload: f.data };
  } catch (e) {
    log('warn', `app ${f.name}: ${(e as Error).message}`);
    return null;
  }
}

const appFilesOf = (name: string) => app.files.filter((f) => f.startsWith(appDirName(name) + '/'));

function isAppOwnFile(name: string, path: string): boolean {
  const inner = path.slice(appDirName(name).length + 1).toLowerCase();
  return ['.hpapp', '.hpappnote', '.hpappprgm'].some((x) => inner === (name + x).toLowerCase());
}

/** Local app names (folders) in the workspace. */
export function workspaceApps(files: string[]): string[] {
  return [...new Set(files.map(appOfPath).filter((a): a is string => !!a))].sort((a, b) =>
    appDisplayName(a).localeCompare(appDisplayName(b)),
  );
}

/** Write an app received from the calculator into `<Name>.hpappdir/` (asks before replacing a different copy). */
export async function saveAppToWorkspace(name: string, payload: Uint8Array): Promise<boolean> {
  const parts = parseAppPayload(payload);
  const ws = await ensureWorkspace();
  const existing = appFilesOf(name);
  if (existing.length) {
    try {
      const local = buildAppPayload(await readAppFolder(name));
      if (local.length === payload.length && local.every((b, i) => b === payload[i])) {
        openAppMain(name);
        return true;
      }
    } catch {
      /* unreadable local copy: offer to replace it */
    }
    if (!confirm(`App "${appDisplayName(name)}" already exists in the workspace and differs. Replace it with the calculator's version?`)) {
      return false;
    }
    for (const f of existing) {
      if (app.dirty.includes(f)) app.dirty = app.dirty.filter((d) => d !== f);
    }
    await ws.removeDir(appDirName(name));
  }
  for (const e of appToFolder(name, parts)) {
    await ws.writeBytes(e.path, e.data);
    const t = await ws.stat(e.path);
    if (t !== null) known.set(e.path, t);
    // Refresh open tabs of this app with the new contents.
    if (app.openFiles.includes(e.path)) {
      try {
        editorBridge.setText(e.path, await ws.read(e.path));
      } catch {
        /* binary */
      }
    }
  }
  await refreshFiles();
  openAppMain(name);
  return true;
}

/** Open an app's program (or, for built-ins with a compiled stub, its note). */
function openAppMain(name: string): void {
  const dir = appDirName(name);
  const prgm = `${dir}/${name}.hpappprgm`;
  const note = `${dir}/${name}.hpappnote`;
  const pick = app.files.includes(prgm) ? prgm : note;
  void ensureWorkspace()
    .then((ws) => ws.readBytes(prgm))
    .then((b) => openFile(decodeAppProgram(b) === null ? note : pick))
    .catch(() => app.files.includes(note) && openFile(note));
}

async function readAppFolder(name: string) {
  const ws = await ensureWorkspace();
  const dir = appDirName(name);
  const entries = [];
  for (const path of appFilesOf(name)) {
    // Unsaved edits in open tabs count.
    const text = app.dirty.includes(path) ? editorBridge.getText(path) : null;
    const data = text !== null ? encodeTextForApp(path, text) : await ws.readBytes(path);
    entries.push({ name: path.slice(dir.length + 1), data });
  }
  return folderToApp(name, entries);
}

function encodeTextForApp(path: string, text: string): Uint8Array {
  const t = fileType(path);
  return t === 'app-program' || t === 'app-note' ? encodeAppText(text) : new TextEncoder().encode(text);
}

/** Send a workspace app to the calculator (overwrite check, then read-back verification). */
export async function sendAppFolder(name: string): Promise<boolean> {
  const ok = await busy(`Sending app ${appDisplayName(name)}`, async (): Promise<boolean> => {
    for (const f of appFilesOf(name)) if (app.dirty.includes(f)) await saveFile(f);
    const payload = buildAppPayload(await readAppFolder(name));
    const s = needSession();
    setStatus(`Checking whether app ${appDisplayName(name)} exists on the calculator…`);
    const existing = await s.readApp(name, 2000);
    if (existing) {
      const what = isSystemApp(name)
        ? `This replaces the built-in ${appDisplayName(name)} app's settings and program on the calculator.`
        : `App "${name}" already exists on the calculator.`;
      if (!confirm(`${what} Overwrite it?`)) {
        setStatus('Send canceled');
        return false;
      }
    }
    setStatus(`Sending app ${appDisplayName(name)} (${payload.length} B)…`);
    const r = await s.sendApp(name, payload, app.verifyAfterSend);
    if (r.refused) {
      setStatus(`Calculator refused app ${appDisplayName(name)}`, 'error');
      return false;
    }
    const sent = calcAppFrom({ type: ObjType.APP, name, data: payload, crcOk: true, compressed: false });
    if (sent) app.calcApps = [...app.calcApps.filter((a) => a.name !== name), sent];
    switch (r.verified) {
      case 'match':
        setStatus(`Sent app ${appDisplayName(name)} (${r.bytes} B) — read-back verified ✓`, 'ok');
        return true;
      case 'mismatch':
        setStatus(`Sent app ${appDisplayName(name)}, but the read-back differs (the calculator may have normalized it)`, 'error');
        return false;
      case 'no-reply':
        setStatus(`Sent app ${appDisplayName(name)} (${r.bytes} B); the read-back got no reply`, 'error');
        return true;
      default:
        setStatus(`Sent app ${appDisplayName(name)} (${r.bytes} B)`, 'ok');
        return true;
    }
  });
  return ok ?? false;
}

/** Fetch one app from the calculator by name and save it into the workspace. */
export async function fetchApp(name: string): Promise<void> {
  name = name.trim();
  if (!name) return;
  await busy(`Fetching app ${name}`, async () => {
    const s = needSession();
    let f = await s.readApp(name);
    if (!f && !isSystemApp(name)) f = await s.readApp('&' + name, 3000);
    if (!f) return setStatus(`No app named "${name}" answered (names are case-sensitive)`, 'error');
    const a = calcAppFrom(f);
    if (!a) return setStatus(`App ${f.name} couldn't be read (see console)`, 'error');
    app.calcApps = [...app.calcApps.filter((x) => x.name !== a.name), a];
    if (await saveAppToWorkspace(a.name, a.payload)) setStatus(`Fetched app ${appDisplayName(a.name)} (${a.base})`, 'ok');
  });
}

/** Save an app from the last calculator listing into the workspace. */
export async function openCalcApp(name: string): Promise<void> {
  const a = app.calcApps.find((x) => x.name === name);
  if (!a) return;
  try {
    if (await saveAppToWorkspace(a.name, a.payload)) setStatus(`Saved app ${appDisplayName(name)} to the workspace`, 'ok');
  } catch (e) {
    setStatus(`App ${name}: ${(e as Error).message}`, 'error');
  }
}

/** Delete a custom app from the calculator (built-in apps can only be reset on the calculator). */
export async function deleteCalcApp(name: string): Promise<void> {
  if (isSystemApp(name)) return setStatus('Built-in apps can’t be deleted (reset them on the calculator instead)', 'error');
  if (!confirm(`Delete app "${name}" from the calculator? This can't be undone (your workspace copy, if any, is kept).`)) return;
  await busy(`Deleting app ${name}`, async () => {
    const r = await needSession().deleteObject(ObjType.APP, name);
    if (r.refused) return setStatus(`The calculator refused to delete app "${name}"`, 'error');
    if (!r.gone) return setStatus(`Sent delete for app "${name}", but it still answers a fetch`, 'error');
    app.calcApps = app.calcApps.filter((a) => a.name !== name);
    setStatus(`Deleted app "${name}" from the calculator ✓`, 'ok');
  });
}

/** Delete an app folder from the workspace. */
export async function deleteAppFolder(name: string): Promise<void> {
  if (!confirm(`Delete app ${appDisplayName(name)} (${appDirName(name)}) from ${app.workspaceLabel}? (The calculator copy is not affected.)`)) return;
  const files = appFilesOf(name);
  await (await ensureWorkspace()).removeDir(appDirName(name));
  for (const f of files) {
    dropTab(f);
    editorBridge.forget(f);
    known.delete(f);
  }
  app.dirty = app.dirty.filter((f) => !files.includes(f));
  await refreshFiles();
}

/** Rename an app: the folder and its own three files. */
export async function renameApp(name: string): Promise<void> {
  if (isSystemApp(name)) return setStatus('Built-in apps keep their names', 'error');
  const to = prompt(`Rename app ${name} to:`, name)?.trim();
  if (!to || to === name) return;
  if (!isValidAppName(to)) return setStatus(`"${to}" is not a valid app name`, 'error');
  const ws = await ensureWorkspace();
  if (await ws.exists(appDirName(to))) return setStatus(`${appDirName(to)} already exists`, 'error');
  for (const f of appFilesOf(name)) if (app.dirty.includes(f)) await saveFile(f);
  const parts = await readAppFolder(name);
  for (const e of appToFolder(to, parts)) await ws.writeBytes(e.path, e.data);
  const old = appFilesOf(name);
  await ws.removeDir(appDirName(name));
  const map = (f: string) => {
    const inner = f.slice(appDirName(name).length + 1);
    const renamed = inner.toLowerCase().startsWith(name.toLowerCase() + '.hpapp') ? to + inner.slice(name.length) : inner;
    return `${appDirName(to)}/${renamed}`;
  };
  for (const f of old) {
    editorBridge.rename(f, map(f));
    known.delete(f);
  }
  app.openFiles = app.openFiles.map((f) => (old.includes(f) ? map(f) : f));
  if (app.current && old.includes(app.current)) app.current = map(app.current);
  saveTabs();
  await refreshFiles();
  setStatus(`Renamed app ${name} → ${to} (the calculator copy keeps its old name until you send it)`, 'ok');
}

/** A file name that's safe inside an app folder on any OS. */
const SAFE_FILE_NAME = /^[^\\/:*?"<>|\x00-\x1f]{1,64}$/;

async function renameAppExtraFile(appName: string, file: string): Promise<void> {
  const dir = appDirName(appName);
  const oldInner = file.slice(dir.length + 1);
  const inner = prompt(`Rename ${oldInner} to:`, oldInner)?.trim();
  if (!inner || inner === oldInner) return;
  if (!SAFE_FILE_NAME.test(inner) || isAppOwnFile(appName, `${dir}/${inner}`)) {
    return setStatus(`"${inner}" can't be used as a file name here`, 'error');
  }
  const to = `${dir}/${inner}`;
  const ws = await ensureWorkspace();
  if (await ws.exists(to)) return setStatus(`${to} already exists`, 'error');
  if (app.dirty.includes(file)) await saveFile(file);
  await ws.rename(file, to);
  editorBridge.rename(file, to);
  known.delete(file);
  app.openFiles = app.openFiles.map((f) => (f === file ? to : f));
  if (app.current === file) app.current = to;
  saveTabs();
  await refreshFiles();
}

/** Add a new text file (e.g. a Python module) to an app folder. */
export async function addAppFile(appName: string): Promise<void> {
  const inner = prompt('New file name (e.g. module.py):', 'module.py')?.trim();
  if (!inner) return;
  const dir = appDirName(appName);
  if (!SAFE_FILE_NAME.test(inner) || isAppOwnFile(appName, `${dir}/${inner}`)) {
    return setStatus(`"${inner}" can't be used as a file name here`, 'error');
  }
  const path = `${dir}/${inner}`;
  const ws = await ensureWorkspace();
  if (await ws.exists(path)) return setStatus(`${path} already exists`, 'error');
  await writeTracked(path, '');
  await refreshFiles();
  openFile(path);
}

/** Bases a new app can copy: apps listed on the calculator and app folders in the workspace. */
export async function appBases(): Promise<AppBase[]> {
  const out = new Map<string, AppBase>();
  for (const a of app.calcApps) {
    try {
      const bag = parseAppPayload(a.payload).bag;
      out.set(a.name, { label: `${appDisplayName(a.name)} (calculator)`, bag, base: a.base });
    } catch {
      /* skip */
    }
  }
  const ws = workspace;
  if (ws) {
    for (const name of workspaceApps(app.files)) {
      if (out.has(name)) continue;
      try {
        const bag = await ws.readBytes(`${appDirName(name)}/${name}.hpapp`);
        out.set(name, { label: `${appDisplayName(name)} (workspace)`, bag, base: baseAppOf(bag) });
      } catch {
        /* no bag */
      }
    }
  }
  const list = [...out.values()].sort((a, b) => a.label.localeCompare(b.label));
  // Always offer an empty app; the calculator has no built-in "None" app to copy.
  return [{ label: 'None — empty app', bag: noneBag(), base: 'None' }, ...list];
}

/** Create a new app folder from a base app's data, with a starter program. */
/** Describe how a picked image was fitted, e.g. "cropped and scaled from 120×80". */
export function iconFitNote(r: IconResult): string {
  if (!r.cropped && !r.scaled) return '';
  const how = r.cropped && r.scaled ? 'cropped and scaled' : r.cropped ? 'cropped' : 'scaled';
  return `${how} from ${r.width}×${r.height} to ${ICON_SIZE}×${ICON_SIZE}`;
}

/** Choose an image and make it the app's icon (center-cropped to a square, scaled to 38×38). */
export async function setAppIcon(name: string, file?: File | null): Promise<void> {
  file ??= await pickImage();
  if (!file) return;
  let r: IconResult;
  try {
    r = await makeAppIcon(file);
  } catch (e) {
    return setStatus(`Icon: ${(e as Error).message}`, 'error');
  }
  const ws = await ensureWorkspace();
  const path = `${appDirName(name)}/${ICON_FILE}`;
  await ws.writeBytes(path, r.png);
  const t = await ws.stat(path);
  if (t !== null) known.set(path, t);
  await refreshFiles();
  iconVersion.n++;
  const note = iconFitNote(r);
  setStatus(`Set the icon of ${appDisplayName(name)}${note ? ` (${note})` : ''}. Send the app to update it on the calculator`, 'ok');
}

/** Bumped when an icon changes, so thumbnails reload. */
export const iconVersion = $state({ n: 0 });

/** The app's icon.png bytes from the workspace, or null. */
export async function readAppIcon(name: string): Promise<Uint8Array | null> {
  const path = `${appDirName(name)}/${ICON_FILE}`;
  if (!app.files.includes(path) || !workspace) return null;
  try {
    return await workspace.readBytes(path);
  } catch {
    return null;
  }
}

export async function createApp(
  name: string,
  base: AppBase,
  lang: AppLanguage = 'ppl',
  icon?: Uint8Array,
): Promise<boolean> {
  if (!isValidAppName(name)) {
    setStatus(`"${name}" is not a valid app name`, 'error');
    return false;
  }
  const ws = await ensureWorkspace();
  if (await ws.exists(appDirName(name))) {
    setStatus(`${appDirName(name)} already exists`, 'error');
    return false;
  }
  const starter = newAppStarter(name, base.base, lang);
  const files = icon ? [...starter.files, { name: ICON_FILE, data: icon }] : starter.files;
  const parts = { bag: base.bag, note: encodeAppText(''), program: encodeAppText(starter.program), files };
  for (const e of appToFolder(name, parts)) {
    await ws.writeBytes(e.path, e.data);
    const t = await ws.stat(e.path);
    if (t !== null) known.set(e.path, t);
  }
  await refreshFiles();
  // Python: open the module (where the code goes) with the app program in a tab beside it.
  openFile(`${appDirName(name)}/${name}.hpappprgm`);
  for (const f of starter.files) openFile(`${appDirName(name)}/${f.name}`);
  const what = lang === 'python' ? 'Python app' : 'app';
  setStatus(`Created ${what} ${name} based on ${base.base}. Send it to put it on the calculator (experimental)`, 'ok');
  return true;
}

// ------------------------------------------- objects sent by the calculator

let incoming: PrimeFile[] = [];
let incomingTimer: ReturnType<typeof setTimeout> | undefined;

/** Collect objects from the calculator's Send key; ask once they stop arriving. */
function queueIncoming(f: PrimeFile): void {
  incoming.push(f);
  clearTimeout(incomingTimer);
  incomingTimer = setTimeout(() => void promptIncoming(), 1500);
}

async function promptIncoming(): Promise<void> {
  const batch = incoming;
  incoming = [];
  const useful = batch.filter((f) => [ObjType.APP, ObjType.PROGRAM, ObjType.NOTE].includes(f.type as 2 | 5 | 6));
  const describe = (f: PrimeFile) =>
    f.type === ObjType.APP ? `app ${appDisplayName(f.name)}` : f.type === ObjType.PROGRAM ? `program ${f.name}` : `note ${f.name}`;
  const skipped = batch.length - useful.length;
  if (!useful.length) {
    setStatus(`The calculator sent ${batch.length} object(s) this app can't store (lists, variables, …)`, 'error');
    return;
  }
  const list = useful.map((f) => `• ${describe(f)}`).join('\n');
  if (!confirm(`The calculator sent:\n${list}${skipped ? `\n(+ ${skipped} other object(s), skipped)` : ''}\n\nSave to the workspace?`)) {
    setStatus('Ignored what the calculator sent');
    return;
  }
  let saved = 0;
  for (const f of useful) {
    try {
      if (f.type === ObjType.APP) {
        const a = calcAppFrom(f);
        if (!a) continue;
        app.calcApps = [...app.calcApps.filter((x) => x.name !== a.name), a];
        if (await saveAppToWorkspace(a.name, a.payload)) saved++;
      } else {
        const kind: TextKind = f.type === ObjType.PROGRAM ? 'program' : 'note';
        const { text, formatted } = decodeText(kind, f.data);
        upsertCalc({ kind, name: f.name, text, formatted });
        await importObject(kind, f.name, text);
        saved++;
      }
    } catch (e) {
      setStatus(`Couldn't save ${describe(f)}: ${(e as Error).message}`, 'error');
      return;
    }
  }
  setStatus(`Saved ${saved} of ${useful.length} object(s) from the calculator`, saved ? 'ok' : 'error');
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
  app.openFiles = [];
  app.dirty = [];
  known.clear();
  await refreshFiles();
  restoreTabs();
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

/** The editor couldn't open a file (e.g. a built-in app's compiled program): say so and close its tab. */
export function reportOpenError(file: string, e: unknown): void {
  setStatus(e instanceof BinaryFileError ? e.message : `Can't open ${file}: ${(e as Error).message}`, 'error');
  dropTab(file);
}

export async function readFile(file: string): Promise<string> {
  const ws = await ensureWorkspace();
  const [text, t] = await Promise.all([ws.read(file), ws.stat(file)]);
  if (t !== null) known.set(file, t);
  return text;
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
  await writeTracked(file, template);
  await refreshFiles();
  openFile(file);
}

export async function deleteFile(file: string): Promise<void> {
  const appName = appOfPath(file);
  if (appName && isAppOwnFile(appName, file)) {
    return setStatus(`${file} is part of the app; delete the whole app instead`, 'error');
  }
  if (!confirm(`Delete ${file} from ${app.workspaceLabel}? (The calculator copy is not affected.)`)) return;
  await (await ensureWorkspace()).remove(file);
  dropTab(file);
  editorBridge.forget(file);
  known.delete(file);
  app.dirty = app.dirty.filter((f) => f !== file);
  await refreshFiles();
}

/** Rename a workspace file (the extension, and so the kind, stays the same). */
export async function renameFile(file: string): Promise<void> {
  const appName = appOfPath(file);
  if (appName) {
    if (isAppOwnFile(appName, file)) return renameApp(appName);
    return renameAppExtraFile(appName, file);
  }
  const kind = kindFromFile(file);
  const ext = file.slice(programNameFromFile(file).length);
  const oldName = programNameFromFile(file);
  const name = prompt(`Rename ${file} to:`, oldName)?.trim();
  if (!name || name === oldName) return;
  if (!isValidName(kind, name)) return setStatus(`"${name}" is not a valid ${kind} name`, 'error');
  const to = name + ext;
  const ws = await ensureWorkspace();
  // Allow a case-only rename of the same file; otherwise refuse to overwrite.
  if (to.toLowerCase() !== file.toLowerCase() && (await ws.exists(to))) return setStatus(`${to} already exists`, 'error');
  try {
    if (app.dirty.includes(file)) await saveFile(file);
    await ws.rename(file, to);
  } catch (e) {
    return setStatus(`Rename failed: ${(e as Error).message}`, 'error');
  }
  editorBridge.rename(file, to);
  known.delete(file);
  void ws.stat(to).then((t) => t !== null && known.set(to, t));
  app.openFiles = app.openFiles.map((f) => (f === file ? to : f));
  app.dirty = app.dirty.map((f) => (f === file ? to : f));
  if (app.current === file) app.current = to;
  saveTabs();
  await refreshFiles();
  setStatus(`Renamed ${file} → ${to}${kind === 'program' ? ' (the calculator copy keeps its old name until you send it)' : ''}`, 'ok');
}

// --------------------------------------------------------------- tabs

/** Open a file in a tab (or switch to its tab). */
export function openFile(file: string): void {
  if (!app.openFiles.includes(file)) app.openFiles = [...app.openFiles, file];
  app.current = file;
  saveTabs();
}

/** Close a tab, saving first. The neighboring tab becomes current. */
export async function closeFile(file: string): Promise<void> {
  if (app.dirty.includes(file)) await saveFile(file);
  dropTab(file);
  editorBridge.forget(file);
}

function dropTab(file: string): void {
  const i = app.openFiles.indexOf(file);
  if (i < 0) {
    if (app.current === file) app.current = null;
    return;
  }
  app.openFiles = app.openFiles.filter((f) => f !== file);
  if (app.current === file) app.current = app.openFiles[Math.min(i, app.openFiles.length - 1)] ?? null;
  saveTabs();
}

export function moveTab(file: string, to: number): void {
  const rest = app.openFiles.filter((f) => f !== file);
  rest.splice(Math.max(0, Math.min(to, rest.length)), 0, file);
  app.openFiles = rest;
  saveTabs();
}

const tabsKey = () => `tabs:${app.workspaceKind}:${app.workspaceLabel}`;

function saveTabs(): void {
  if (!app.workspaceKind) return;
  saveString(tabsKey(), JSON.stringify({ open: app.openFiles, current: app.current }));
}

function restoreTabs(): void {
  try {
    const t = JSON.parse(loadString(tabsKey()) ?? 'null') as { open: string[]; current: string | null } | null;
    if (!t) return;
    app.openFiles = t.open.filter((f) => app.files.includes(f));
    app.current = t.current && app.openFiles.includes(t.current) ? t.current : (app.openFiles[0] ?? null);
  } catch {
    /* ignore a bad entry */
  }
}

// ------------------------------------------------- outside changes

/** Last-modified time of each file as this app last read or wrote it. */
const known = new Map<string, number>();

/** Files this app is writing right now; the outside-change check leaves them alone. */
const writing = new Set<string>();

async function writeTracked(file: string, text: string): Promise<void> {
  const ws = await ensureWorkspace();
  writing.add(file);
  try {
    await ws.write(file, text);
    const t = await ws.stat(file);
    if (t !== null) known.set(file, t);
  } finally {
    writing.delete(file);
  }
}

/**
 * Look for edits made outside the app (folder workspaces only): new or removed files, and changes
 * to open files. A clean file is reloaded; one with unsaved edits asks which version to keep.
 */
let checking = false;
export async function checkExternalChanges(): Promise<void> {
  if (checking || !workspace || workspace.kind !== 'folder' || app.diff) return;
  checking = true;
  try {
    const list = await workspace.list();
    if (list.join('\n') !== app.files.join('\n')) {
      app.files = list;
      for (const f of [...app.openFiles]) if (!list.includes(f)) {
        log('warn', `${f} was removed outside the app; its tab stays open until closed`);
      }
    }
    for (const file of app.openFiles) {
      if (!list.includes(file) || writing.has(file)) continue;
      const t = await workspace.stat(file);
      const k = known.get(file);
      if (t === null || k === undefined || t === k) continue;
      const disk = await workspace.read(file);
      if (writing.has(file)) continue;
      known.set(file, t);
      const mine = editorBridge.getText(file);
      if (mine === null || mine === disk) continue;
      if (!app.dirty.includes(file)) {
        editorBridge.setText(file, disk);
        setStatus(`Reloaded ${file}: it changed on disk`);
        continue;
      }
      await resolveConflict(file, mine, disk);
    }
  } catch (e) {
    log('warn', `checking for outside changes: ${(e as Error).message}`);
  } finally {
    checking = false;
  }
}

async function resolveConflict(file: string, mine: string, disk: string): Promise<void> {
  const choice = await showDiff({
    title: `${file} changed on disk`,
    message: 'It was edited outside the app while you had unsaved changes here. Left: on disk. Right: yours.',
    original: disk,
    modified: mine,
    originalLabel: 'On disk',
    modifiedLabel: 'Yours',
    language: langFor(file),
    actions: [
      { id: 'disk', label: 'Use disk version' },
      { id: 'mine', label: 'Keep mine', primary: true },
    ],
  });
  if (choice === 'disk') {
    editorBridge.setText(file, disk);
    app.dirty = app.dirty.filter((f) => f !== file);
  } else if (choice === 'mine') {
    await writeTracked(file, editorBridge.getText(file) ?? mine);
    app.dirty = app.dirty.filter((f) => f !== file);
  }
  // Dismissed: leave both alone; the next save asks again.
}

if (typeof window !== 'undefined') {
  window.addEventListener('focus', () => void checkExternalChanges());
  setInterval(() => {
    if (document.visibilityState === 'visible') void checkExternalChanges();
  }, 3000);
}

export function markDirty(file: string) {
  if (!app.dirty.includes(file)) app.dirty = [...app.dirty, file];
}

export async function saveFile(file: string): Promise<void> {
  const text = editorBridge.getText(file);
  if (text === null || !workspace) return;
  const k = known.get(file);
  if (k !== undefined) {
    const t = await workspace.stat(file);
    if (t !== null && t !== k) {
      const disk = await workspace.read(file);
      if (disk !== text) {
        if (!app.diff) await resolveConflict(file, text, disk);
        return;
      }
    }
  }
  await writeTracked(file, text);
  app.dirty = app.dirty.filter((f) => f !== file);
}

export async function saveCurrent(): Promise<void> {
  if (app.current) await saveFile(app.current);
}

// ------------------------------------------------------------- debug

export async function sendRaw(bytes: Uint8Array, expectReply: boolean): Promise<Uint8Array | null | undefined> {
  return busy('Raw send', () => needSession().raw(bytes, expectReply));
}
