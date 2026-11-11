/**
 * Where program sources live: a real folder (File System Access API) or, as a
 * fallback, IndexedDB in this browser.
 */
import { createStore, del, get, keys, set } from 'idb-keyval';
import { APP_DIR_EXT } from './app';
import { decodeTextFor, encodeTextFor, isUtf16Path, ROOT_FILE_RE } from './kinds';

export interface Workspace {
  readonly kind: 'folder' | 'browser';
  readonly label: string;
  /** Top-level programs/notes, plus every file inside `*.hpappdir` folders as `Dir.hpappdir/name`. */
  list(): Promise<string[]>;
  /** Text, decoded per the path (see kinds.ts). Throws BinaryFileError for binary files. */
  read(path: string): Promise<string>;
  write(path: string, text: string): Promise<void>;
  readBytes(path: string): Promise<Uint8Array>;
  writeBytes(path: string, data: Uint8Array): Promise<void>;
  remove(path: string): Promise<void>;
  /** Delete a top-level folder and everything in it (an app). */
  removeDir(dir: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  rename(from: string, to: string): Promise<void>;
  /** Last-modified time, for spotting edits made outside the app; null when unknown/missing. */
  stat(path: string): Promise<number | null>;
}

export {
  fileFor,
  kindFromFile,
  NOTE_EXT,
  programNameFromFile,
  SOURCE_EXT,
  type FileKind,
} from './kinds';

const metaStore = createStore('hp-prime-web-meta', 'kv');
const fileStore = createStore('hp-prime-web-files', 'files');

function split(path: string): [string | null, string] {
  const i = path.indexOf('/');
  return i < 0 ? [null, path] : [path.slice(0, i), path.slice(i + 1)];
}

// ------------------------------------------------------------ folder

export class FolderWorkspace implements Workspace {
  readonly kind = 'folder';
  constructor(private readonly dir: FileSystemDirectoryHandle) {}

  get label(): string {
    return this.dir.name;
  }

  private async parent(path: string, create = false): Promise<[FileSystemDirectoryHandle, string]> {
    const [d, name] = split(path);
    return [d ? await this.dir.getDirectoryHandle(d, { create }) : this.dir, name];
  }

  private async file(path: string, create = false): Promise<FileSystemFileHandle> {
    const [d, name] = await this.parent(path, create);
    return d.getFileHandle(name, { create });
  }

  async list(): Promise<string[]> {
    const out: string[] = [];
    for await (const [name, h] of this.dir.entries()) {
      if (h.kind === 'file' && ROOT_FILE_RE.test(name)) out.push(name);
      else if (h.kind === 'directory' && name.toLowerCase().endsWith(APP_DIR_EXT)) {
        for await (const [inner, ih] of (h as FileSystemDirectoryHandle).entries()) {
          if (ih.kind === 'file' && !inner.startsWith('.')) out.push(`${name}/${inner}`);
        }
      }
    }
    return out.sort((a, b) => a.localeCompare(b));
  }

  async readBytes(path: string): Promise<Uint8Array> {
    return new Uint8Array(await (await (await this.file(path)).getFile()).arrayBuffer());
  }

  async writeBytes(path: string, data: Uint8Array): Promise<void> {
    const w = await (await this.file(path, true)).createWritable();
    await w.write(data as Uint8Array<ArrayBuffer>);
    await w.close();
  }

  async read(path: string): Promise<string> {
    return decodeTextFor(path, await this.readBytes(path));
  }

  async write(path: string, text: string): Promise<void> {
    await this.writeBytes(path, encodeTextFor(path, text));
  }

  async remove(path: string): Promise<void> {
    const [d, name] = await this.parent(path);
    await d.removeEntry(name);
  }

  async removeDir(dir: string): Promise<void> {
    await this.dir.removeEntry(dir, { recursive: true });
  }

  async exists(path: string): Promise<boolean> {
    try {
      const [d, name] = split(path);
      if (!d) {
        await this.dir.getFileHandle(name).catch(() => this.dir.getDirectoryHandle(name));
        return true;
      }
      await this.file(path);
      return true;
    } catch {
      return false;
    }
  }

  async rename(from: string, to: string): Promise<void> {
    const [fd] = split(from);
    const [td] = split(to);
    const h = (await this.file(from)) as FileSystemFileHandle & { move?: (name: string) => Promise<void> };
    if (h.move && fd === td) {
      await h.move(split(to)[1]);
      return;
    }
    await this.writeBytes(to, await this.readBytes(from));
    await this.remove(from);
  }

  async stat(path: string): Promise<number | null> {
    try {
      return (await (await this.file(path)).getFile()).lastModified;
    } catch {
      return null;
    }
  }
}

export function folderAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

export async function pickFolder(): Promise<FolderWorkspace> {
  const dir = await window.showDirectoryPicker({ mode: 'readwrite', id: 'hp-prime-web' });
  await set('folder', dir, metaStore);
  await set('mode', 'folder', metaStore);
  return new FolderWorkspace(dir);
}

// ----------------------------------------------------------- browser

export class BrowserWorkspace implements Workspace {
  readonly kind = 'browser';
  readonly label = 'Browser storage';

  /** Values are strings (UTF-8 text files, as stored by older versions) or raw bytes. */
  private async value(path: string): Promise<string | Uint8Array | undefined> {
    return get<string | Uint8Array>(path, fileStore);
  }

  async list(): Promise<string[]> {
    return ((await keys(fileStore)) as string[]).sort((a, b) => a.localeCompare(b));
  }
  async readBytes(path: string): Promise<Uint8Array> {
    const v = await this.value(path);
    if (v === undefined) throw new Error(`${path} not found`);
    return typeof v === 'string' ? new TextEncoder().encode(v) : v;
  }
  async writeBytes(path: string, data: Uint8Array): Promise<void> {
    await set(path, data.slice(), fileStore);
  }
  async read(path: string): Promise<string> {
    const v = await this.value(path);
    if (v === undefined) return '';
    return typeof v === 'string' ? v : decodeTextFor(path, v);
  }
  async write(path: string, text: string): Promise<void> {
    if (isUtf16Path(path)) await this.writeBytes(path, encodeTextFor(path, text));
    else await set(path, text, fileStore);
  }
  async remove(path: string): Promise<void> {
    await del(path, fileStore);
  }
  async removeDir(dir: string): Promise<void> {
    for (const k of await this.list()) if (k.startsWith(dir + '/')) await del(k, fileStore);
  }
  async exists(path: string): Promise<boolean> {
    if ((await this.value(path)) !== undefined) return true;
    return (await this.list()).some((k) => k.startsWith(path + '/'));
  }
  async rename(from: string, to: string): Promise<void> {
    const v = await this.value(from);
    if (v === undefined) throw new Error(`${from} not found`);
    await set(to, v, fileStore);
    await del(from, fileStore);
  }
  /** Only this app writes browser storage, so there are no outside changes to detect. */
  async stat(): Promise<number | null> {
    return null;
  }
}

export async function useBrowserWorkspace(): Promise<BrowserWorkspace> {
  await set('mode', 'browser', metaStore);
  return new BrowserWorkspace();
}

/**
 * Restore the last workspace. A remembered folder may need the user to
 * re-grant permission (requires a click), reported as `needsPermission`.
 */
export async function restoreWorkspace(): Promise<
  { ws: Workspace } | { needsPermission: FileSystemDirectoryHandle } | null
> {
  const mode = await get<string>('mode', metaStore);
  if (mode === 'browser') return { ws: new BrowserWorkspace() };
  if (mode === 'folder') {
    const dir = await get<FileSystemDirectoryHandle>('folder', metaStore);
    if (!dir) return null;
    const perm = await dir.queryPermission({ mode: 'readwrite' });
    if (perm === 'granted') return { ws: new FolderWorkspace(dir) };
    return { needsPermission: dir };
  }
  return null;
}

export async function regrant(dir: FileSystemDirectoryHandle): Promise<FolderWorkspace | null> {
  const perm = await dir.requestPermission({ mode: 'readwrite' });
  return perm === 'granted' ? new FolderWorkspace(dir) : null;
}
