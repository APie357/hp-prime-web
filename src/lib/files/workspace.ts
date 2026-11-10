/**
 * Where program sources live: a real folder (File System Access API) or, as a
 * fallback, IndexedDB in this browser.
 */
import { createStore, del, get, keys, set } from 'idb-keyval';

export interface Workspace {
  readonly kind: 'folder' | 'browser';
  readonly label: string;
  list(): Promise<string[]>;
  read(name: string): Promise<string>;
  write(name: string, text: string): Promise<void>;
  remove(name: string): Promise<void>;
  exists(name: string): Promise<boolean>;
}

export const SOURCE_EXT = '.hpppl';
export const NOTE_EXT = '.note';
const SOURCE_RE = /\.(hpppl|ppl|txt|note)$/i;

export type FileKind = 'program' | 'note';

/** Calculator object name for a workspace file (extension stripped). */
export function programNameFromFile(file: string): string {
  return file.replace(/\.[^.]+$/, '');
}

/** `.note` files are notes; everything else is a PPL program. */
export function kindFromFile(file: string): FileKind {
  return /\.note$/i.test(file) ? 'note' : 'program';
}

export function fileFor(kind: FileKind, name: string): string {
  return name + (kind === 'note' ? NOTE_EXT : SOURCE_EXT);
}

const metaStore = createStore('hp-prime-web-meta', 'kv');
const fileStore = createStore('hp-prime-web-files', 'files');

// ------------------------------------------------------------ folder

export class FolderWorkspace implements Workspace {
  readonly kind = 'folder';
  constructor(private readonly dir: FileSystemDirectoryHandle) {}

  get label(): string {
    return this.dir.name;
  }

  async list(): Promise<string[]> {
    const out: string[] = [];
    for await (const [name, h] of this.dir.entries()) {
      if (h.kind === 'file' && SOURCE_RE.test(name)) out.push(name);
    }
    return out.sort((a, b) => a.localeCompare(b));
  }

  async read(name: string): Promise<string> {
    const f = await (await this.dir.getFileHandle(name)).getFile();
    return f.text();
  }

  async write(name: string, text: string): Promise<void> {
    const h = await this.dir.getFileHandle(name, { create: true });
    const w = await h.createWritable();
    await w.write(text);
    await w.close();
  }

  async remove(name: string): Promise<void> {
    await this.dir.removeEntry(name);
  }

  async exists(name: string): Promise<boolean> {
    try {
      await this.dir.getFileHandle(name);
      return true;
    } catch {
      return false;
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

  async list(): Promise<string[]> {
    return ((await keys(fileStore)) as string[]).sort((a, b) => a.localeCompare(b));
  }
  async read(name: string): Promise<string> {
    return (await get<string>(name, fileStore)) ?? '';
  }
  async write(name: string, text: string): Promise<void> {
    await set(name, text, fileStore);
  }
  async remove(name: string): Promise<void> {
    await del(name, fileStore);
  }
  async exists(name: string): Promise<boolean> {
    return (await get(name, fileStore)) !== undefined;
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
