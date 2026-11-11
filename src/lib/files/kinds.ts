/**
 * What a workspace path holds and how its text is encoded. Pure (no storage), so it can be tested.
 *
 * Top-level files: `.hpppl`/`.ppl`/`.txt` programs and `.note` notes (UTF-8 text).
 * App folders (`<App>.hpappdir/`): `<App>.hpappprgm` and `<App>.hpappnote` in their wire form
 * (UTF-16LE + NUL), `<App>.hpapp` and other binary files raw, `.py` and other text files UTF-8.
 */
import { decodeAppProgram, encodeAppText } from './app';
import { decodeNote } from './note';

export const SOURCE_EXT = '.hpppl';
export const NOTE_EXT = '.note';
export const ROOT_FILE_RE = /\.(hpppl|ppl|txt|note)$/i;

export type FileType = 'program' | 'note' | 'app-program' | 'app-note' | 'python' | 'text' | 'binary';

/** Program or note: the kinds sent as standalone calculator objects. */
export type FileKind = 'program' | 'note';

const TEXT_IN_APP = /\.(txt|md|csv|json|xml|html?|js|css|ini|cfg|log)$/i;

export function fileType(path: string): FileType {
  const slash = path.indexOf('/');
  if (slash < 0) return /\.note$/i.test(path) ? 'note' : 'program';
  const name = path.slice(slash + 1);
  if (/\.hpappprgm$/i.test(name)) return 'app-program';
  if (/\.hpappnote$/i.test(name)) return 'app-note';
  if (/\.py$/i.test(name)) return 'python';
  if (TEXT_IN_APP.test(name)) return 'text';
  return 'binary';
}

/** Files that open in the editor. (An app program can still turn out to be a binary stub.) */
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
      throw new BinaryFileError(path);
    default:
      return new TextDecoder().decode(bytes).replace(/^﻿/, '');
  }
}
