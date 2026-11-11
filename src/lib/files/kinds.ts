/**
 * What a workspace path holds and how its text is encoded. Pure (no storage), so it can be tested.
 *
 * Top-level files: `.hpppl`/`.ppl`/`.txt` programs and `.note` notes (UTF-8 text), and
 * `.hpexammode` exam-mode configurations (raw bytes, see exam.ts).
 * App folders (`<App>.hpappdir/`): `<App>.hpappprgm` and `<App>.hpappnote` in their wire form
 * (UTF-16LE + NUL), `<App>.hpapp` and other binary files raw, `.py` and other text files UTF-8.
 */
import { decodeAppProgram, encodeAppText } from './app';
import { decodeNote } from './note';

export const SOURCE_EXT = '.hpppl';
export const NOTE_EXT = '.note';
export const ROOT_FILE_RE = /\.(hpppl|ppl|txt|note|hpexammode)$/i;

export type FileType = 'program' | 'note' | 'exam' | 'app-program' | 'app-note' | 'python' | 'text' | 'binary';

/** Program or note: the kinds sent as standalone calculator objects. */
export type FileKind = 'program' | 'note';

const TEXT_IN_APP = /\.(txt|md|csv|json|xml|html?|js|css|ini|cfg|log)$/i;

export function fileType(path: string): FileType {
  const slash = path.indexOf('/');
  if (slash < 0) return /\.note$/i.test(path) ? 'note' : /\.hpexammode$/i.test(path) ? 'exam' : 'program';
  const name = path.slice(slash + 1);
  if (/\.hpappprgm$/i.test(name)) return 'app-program';
  if (/\.hpappnote$/i.test(name)) return 'app-note';
  if (/\.py$/i.test(name)) return 'python';
  if (TEXT_IN_APP.test(name)) return 'text';
  return 'binary';
}

/** Files that open in a tab (exam configurations get a form instead of the text editor). */
export const isEditable = (path: string) => fileType(path) !== 'binary';

/** Monaco language for a path. */
export function languageFor(path: string): string {
  switch (fileType(path)) {
    case 'program':
    case 'app-program':
      return 'hpppl';
    case 'python':
      return 'python';
    default:
      return 'plaintext';
  }
}

/** Prose: wrap long lines. */
export const isProse = (path: string) => ['note', 'app-note', 'text'].includes(fileType(path));

/** `.note` files are notes; every other top-level file is a PPL program. */
export function kindFromFile(file: string): FileKind {
  return /\.note$/i.test(file) ? 'note' : 'program';
}

/** Calculator object name for a top-level file (extension stripped). */
export function programNameFromFile(file: string): string {
  return file.replace(/^.*\//, '').replace(/\.[^.]+$/, '');
}

export function fileFor(kind: FileKind, name: string): string {
  return name + (kind === 'note' ? NOTE_EXT : SOURCE_EXT);
}

/** Whether text for `path` is stored as UTF-16LE + NUL (app program/note) rather than UTF-8. */
export const isUtf16Path = (path: string) => ['app-program', 'app-note'].includes(fileType(path));

export function encodeTextFor(path: string, text: string): Uint8Array {
  return isUtf16Path(path) ? encodeAppText(text) : new TextEncoder().encode(text);
}

export class BinaryFileError extends Error {
  constructor(path: string) {
    super(`${path} isn't text (a built-in app's program is stored compiled), so it can't be edited`);
  }
}

export function decodeTextFor(path: string, bytes: Uint8Array): string {
  switch (fileType(path)) {
    case 'app-program': {
      const t = decodeAppProgram(bytes);
      if (t === null) throw new BinaryFileError(path);
      return t;
    }
    case 'app-note':
      return decodeNote(bytes).text;
    case 'binary':
    case 'exam':
      throw new BinaryFileError(path);
    default:
      return new TextDecoder().decode(bytes).replace(/^﻿/, '');
  }
}

/**
 * Text of an imported file: UTF-8, or UTF-16LE when it has a UTF-16 BOM or looks like UTF-16
 * (the Connectivity Kit writes UTF-16). BOM and trailing NULs dropped, line endings → `\n`.
 */
export function decodeTextFile(b: Uint8Array): string {
  const utf16 = (b[0] === 0xff && b[1] === 0xfe) || (b.length >= 4 && b[1] === 0 && b[3] === 0 && b[0] !== 0);
  const t = utf16 ? new TextDecoder('utf-16le').decode(b) : new TextDecoder().decode(b);
  return t.replace(/^\uFEFF/, '').replace(/\0+$/, '').replace(/\r\n?/g, '\n');
}

/** A Python script name that can also be imported as a module: letters, digits, _; no leading digit. */
export const isValidPythonName = (name: string) => /^[A-Za-z_][A-Za-z0-9_]{0,30}$/.test(name);

/** What the "New…" dialog creates. */
export type NewKind = FileKind | 'app' | 'python';

const NEW_EXT: [RegExp, NewKind][] = [
  [/\.(hpppl|ppl|hpprgm|prgm|txt)$/i, 'program'],
  [/\.(note|hpnote)$/i, 'note'],
  [/\.(hpappdir|hpapp|app)$/i, 'app'],
  [/\.py$/i, 'python'],
];

/**
 * Split what was typed in the "New…" dialog into a name and, when it ends in a known extension
 * (`Foo.note`, `GAME.hpppl`, `Quiz.hpapp`…), the kind that extension means. Other text is the name as-is.
 */
export function parseNewName(input: string): { name: string; kind: NewKind | null } {
  const s = input.trim();
  for (const [re, kind] of NEW_EXT) {
    if (re.test(s)) return { name: s.replace(re, '').trim(), kind };
  }
  return { name: s, kind: null };
}
