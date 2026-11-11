/**
 * HP Prime apps (object type 0x02).
 *
 * On the wire (F7 data after the name, and in F9 backups) an app is a series of sections, each
 * `u32 big-endian length | bytes`, verified against every app on a G2 (firmware V2.060.650):
 *
 *   [0] the app's variable bag (the Connectivity Kit's `.hpapp`): `7C 61 8A B2 …`; byte 20 is the base app
 *   [1] the Info note: UTF-16LE + NUL (formatted notes as in note.ts)
 *   [2] the app program: UTF-16LE + NUL (built-in apps carry a short binary stub instead)
 *   [3…] extra files: file name (UTF-16LE) + `00 00` + the file's bytes (e.g. `app.py`, `icon.png`)
 *
 * Built-in apps' names start with `&` (`&Function`). The bag doesn't contain the app's name, so a
 * new app is a base app's bag sent under a new name.
 *
 * In the workspace an app is a folder `<Name>.hpappdir/` holding `<Name>.hpapp` (bag),
 * `<Name>.hpappnote`, `<Name>.hpappprgm` (both raw UTF-16LE + NUL, as on the wire) and the extra
 * files under their own names.
 */
import { concat, fromUtf16le, readU32be, u32be, utf16le } from '../hid/bytes';
import { decodeNote } from './note';

export interface AppFile {
  name: string;
  data: Uint8Array;
}

export interface AppParts {
  bag: Uint8Array;
  note: Uint8Array;
  program: Uint8Array;
  files: AppFile[];
}

export const APP_DIR_EXT = '.hpappdir';
export const BAG_MAGIC = [0x7c, 0x61, 0x8a, 0xb2];

/** Base app index (bag byte 20) → name, per prime_connection_kit (tested on real files). */
export const BASE_APPS = [
  'Function',
  'Solve',
  'Statistics 1Var',
  'Statistics 2Var',
  'Inference',
  'Parametric',
  'Polar',
  'Sequence',
  'Finance',
  'Linear Solver',
  'Triangle Solver',
  '',
  '',
  '',
  'Data Streamer',
  'Geometry',
  'Spreadsheet',
  'Advanced Graphing',
  'Graph 3D',
  'Explorer',
  'None',
  'Python',
];

function sections(payload: Uint8Array): Uint8Array[] {
  const out: Uint8Array[] = [];
  let o = 0;
  while (o < payload.length) {
    if (o + 4 > payload.length) throw new Error('app data ends inside a section header');
    const len = readU32be(payload, o);
    o += 4;
    if (o + len > payload.length) throw new Error('app section runs past the end');
    out.push(payload.slice(o, o + len));
    o += len;
  }
  return out;
}

/** Index of the UTF-16 NUL that ends a file name, or -1. */
function nameEnd(b: Uint8Array): number {
  for (let i = 0; i + 1 < b.length; i += 2) if (b[i] === 0 && b[i + 1] === 0) return i;
  return -1;
}

export function parseAppPayload(payload: Uint8Array): AppParts {
  const s = sections(payload);
  if (s.length < 3) throw new Error(`app data has ${s.length} sections; expected at least 3`);
  if (!BAG_MAGIC.every((v, i) => s[0][i] === v)) throw new Error('app data does not start with an app bag');
  const files = s.slice(3).map((sec): AppFile => {
    const end = nameEnd(sec);
    if (end <= 0) throw new Error('app file without a name');
    return { name: fromUtf16le(sec.subarray(0, end)), data: sec.slice(end + 2) };
  });
  return { bag: s[0], note: s[1], program: s[2], files };
}

export function buildAppPayload(p: AppParts): Uint8Array {
  const secs = [p.bag, p.note, p.program, ...p.files.map((f) => concat(utf16le(f.name), [0, 0], f.data))];
  return concat(...secs.flatMap((sec) => [u32be(sec.length), sec]));
}

export function baseAppOf(bag: Uint8Array): string {
  const i = bag[20];
  return BASE_APPS[i] || `app #${i}`;
}

export const isSystemApp = (name: string) => name.startsWith('&');
export const appDisplayName = (name: string) => name.replace(/^&/, '');

// ------------------------------------------------------------ text sections

/** UTF-16LE text + NUL, the form notes and app programs take on the wire. */
export function encodeAppText(text: string): Uint8Array {
  return concat(utf16le(text.replace(/^﻿/, '').replace(/\r\n?/g, '\n')), [0, 0]);
}

/** The text of an app program section, or null when it isn't text (built-in apps' binary stub). */
export function decodeAppProgram(b: Uint8Array): string | null {
  if (b.length < 2 || b.length % 2) return b.length === 0 ? '' : null;
  const units = new Uint16Array(b.length / 2);
  for (let i = 0; i < units.length; i++) units[i] = b[i * 2] | (b[i * 2 + 1] << 8);
  let end = units.length;
  while (end > 0 && units[end - 1] === 0) end--;
  for (let i = 0; i < end; i++) {
    const u = units[i];
    // An embedded NUL or other control characters (besides tab/newlines) means binary.
    if (u < 0x20 && u !== 9 && u !== 10 && u !== 13) return null;
  }
  return fromUtf16le(b.subarray(0, end * 2));
}

export function decodeAppNote(b: Uint8Array): { text: string; formatted: boolean } {
  return decodeNote(b);
}

// ----------------------------------------------------------- workspace form

export function appDirName(name: string): string {
  return name + APP_DIR_EXT;
}

/** `Foo.hpappdir/x` → `Foo`; null for files outside an app folder. */
export function appOfPath(path: string): string | null {
  const m = /^([^/]+)\.hpappdir\//i.exec(path);
  return m ? m[1] : null;
}

/** Workspace files for an app. Text sections stay in their wire form (UTF-16LE + NUL). */
export function appToFolder(name: string, p: AppParts): { path: string; data: Uint8Array }[] {
  const dir = appDirName(name);
  return [
    { path: `${dir}/${name}.hpapp`, data: p.bag },
    { path: `${dir}/${name}.hpappnote`, data: p.note },
    { path: `${dir}/${name}.hpappprgm`, data: p.program },
    ...p.files.map((f) => ({ path: `${dir}/${f.name}`, data: f.data })),
  ];
}

/** Inverse of appToFolder; `entries` are the files inside the folder (names without the folder). */
export function folderToApp(name: string, entries: { name: string; data: Uint8Array }[]): AppParts {
  const get = (ext: string) => entries.find((e) => e.name.toLowerCase() === (name + ext).toLowerCase());
  const bag = get('.hpapp');
  if (!bag) throw new Error(`${name}.hpappdir has no ${name}.hpapp (the app's data)`);
  const own = new Set(['.hpapp', '.hpappnote', '.hpappprgm'].map((x) => (name + x).toLowerCase()));
  return {
    bag: bag.data,
    note: get('.hpappnote')?.data ?? Uint8Array.of(0, 0),
    program: get('.hpappprgm')?.data ?? Uint8Array.of(0, 0),
    files: entries
      .filter((e) => !own.has(e.name.toLowerCase()) && !e.name.startsWith('.'))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((e) => ({ name: e.name, data: e.data })),
  };
}

/**
 * App data for a "None"-based app (base 20): an empty app with no built-in views, the usual base
 * for Python apps. The calculator has no built-in `&None` app to copy, so this is the 124-byte bag
 * of a None-based app from a G2 (only generic settings records; no name or code).
 */
const NONE_BAG_B64 =
  'fGGKsv////8BAAEACAAAAIX/fwAUAAAACAAAAIX/vwABAAAACAAAAIX//wABAAAACAAAAIX/PwEBAAAACAAAAIX/fwEEAAAACAAAAIX/vwEBAAAADAAAAIX//wESAAAAEgAAABQAAAAeBgkFDAAAAAgAAAAFBkkAwHxjJg==';

export function noneBag(): Uint8Array {
  return Uint8Array.from(atob(NONE_BAG_B64), (c) => c.charCodeAt(0));
}

export type AppLanguage = 'ppl' | 'python';

/** A Python module name derived from an app name: `My Game!` → `my_game`. */
export function pythonModuleName(appName: string): string {
  let m = appName.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  if (!m || /^\d/.test(m)) m = 'app_' + m;
  return m;
}

/**
 * Starter files for a new app. PPL: a `START()` program. Python: the app program starts and
 * resets a module shipped with the app (the layout Python apps on the calculator use), with the
 * code in `<module>.py`.
 */
export function newAppStarter(name: string, base: string, lang: AppLanguage): { program: string; files: AppFile[] } {
  if (lang === 'python') {
    const mod = pythonModuleName(name);
    const program =
      `#PYTHON START()\n# Runs when ${name} is started from the Apps screen.\nimport ${mod}\n${mod}.run()\n#END\n\n` +
      `#PYTHON RESET()\n# Runs when the app is reset.\nimport ${mod}\n${mod}.reset()\n#END\n`;
    const py =
      `# ${name}: Python code for the app.\n\n` +
      `def run():\n    print("Hello from ${name}")\n\n` +
      `def reset():\n    pass\n`;
    return { program, files: [{ name: `${mod}.py`, data: new TextEncoder().encode(py) }] };
  }
  return {
    program: `// ${name}: an app based on ${base}\nSTART()\nBEGIN\n  PRINT();\n  PRINT("Hello from ${name}");\nEND;\n`,
    files: [],
  };
}

/** Names the calculator would accept for a new app (same rule as notes, no leading &). */
export function isValidAppName(name: string): boolean {
  return name.trim() === name && !name.startsWith('&') && /^[^\\/:*?"<>|\x00-\x1f]{1,40}$/.test(name);
}
