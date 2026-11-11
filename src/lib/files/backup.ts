/**
 * Full calculator backup as a .zip:
 *   manifest.json            calculator info + one entry per object (type, name, size, path)
 *   raw/<type>/<name>.bin    every object's body exactly as received (F7 data after the name)
 *   programs/<name>.hpppl    programs as readable text (same format as the workspace)
 *   notes/<name>.note        notes as plain text (rich formatting only in raw/)
 *   apps/<name>.hpappdir/    apps in the workspace's folder layout (see app.ts)
 */
import { strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { OBJ_TYPE_NAMES, ObjType } from '../hid/commands';
import type { PrimeFile } from '../hid/parsers';
import { decodeText } from '../hid/session';
import { appToFolder, parseAppPayload } from './app';
import { NOTE_EXT, SOURCE_EXT } from './kinds';

export interface BackupEntry {
  type: number;
  typeName: string;
  name: string;
  bytes: number;
  raw: string;
  /** Readable copy: a file, or for apps a folder (ending in `/`). */
  text?: string;
}

export interface BackupManifest {
  format: 'hp-prime-web-backup';
  version: 1;
  createdAt: string;
  device?: { label?: string; name?: string; firmware?: string; serial?: string };
  objects: BackupEntry[];
}

/** File-name-safe version of a calculator object name (kept recognizable). */
export function safeFileName(name: string): string {
  const s = name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/^\.+/, '_');
  return s || '_';
}

function typeDir(type: number): string {
  return (OBJ_TYPE_NAMES[type] ?? `type-${type.toString(16).padStart(2, '0')}`).replace(/\s+/g, '-');
}

export function buildBackupZip(files: PrimeFile[], device: BackupManifest['device'], now = new Date()): Uint8Array {
  const tree: Zippable = {};
  const used = new Set<string>();
  const unique = (path: string) => {
    let p = path;
    for (let i = 2; used.has(p.toLowerCase()); i++) p = path.replace(/(\.[^./]+)?$/, `~${i}$1`);
    used.add(p.toLowerCase());
    return p;
  };
  const put = (path: string, data: Uint8Array) => {
    tree[path] = [data, { mtime: now }];
  };

  const objects: BackupEntry[] = [];
  for (const f of files) {
    const base = safeFileName(f.name);
    const raw = unique(`raw/${typeDir(f.type)}/${base}.bin`);
    put(raw, f.data);
    const entry: BackupEntry = { type: f.type, typeName: OBJ_TYPE_NAMES[f.type] ?? 'unknown', name: f.name, bytes: f.data.length, raw };
    if (f.type === ObjType.PROGRAM || f.type === ObjType.NOTE) {
      const kind = f.type === ObjType.PROGRAM ? 'program' : 'note';
      const text = unique(kind === 'program' ? `programs/${base}${SOURCE_EXT}` : `notes/${base}${NOTE_EXT}`);
      put(text, strToU8(decodeText(kind, f.data).text));
      entry.text = text;
    } else if (f.type === ObjType.APP) {
      try {
        for (const e of appToFolder(base, parseAppPayload(f.data))) {
          put(unique(`apps/${e.path}`), e.data);
        }
        entry.text = `apps/${base}.hpappdir/`;
      } catch {
        /* unrecognized app data: raw/ still has it */
      }
    }
    objects.push(entry);
  }
  const manifest: BackupManifest = {
    format: 'hp-prime-web-backup',
    version: 1,
    createdAt: now.toISOString(),
    device,
    objects,
  };
  put('manifest.json', strToU8(JSON.stringify(manifest, null, 2)));
  return zipSync(tree, { level: 6 });
}

/** Read a backup zip back into its manifest and raw objects. */
export function readBackupZip(zip: Uint8Array): { manifest: BackupManifest; files: PrimeFile[] } {
  const entries = unzipSync(zip);
  const m = entries['manifest.json'];
  if (!m) throw new Error('not an HP Prime Web backup (no manifest.json)');
  const manifest = JSON.parse(new TextDecoder().decode(m)) as BackupManifest;
  if (manifest.format !== 'hp-prime-web-backup') throw new Error('unrecognized backup format');
  const files = manifest.objects.map((o): PrimeFile => {
    const data = entries[o.raw];
    if (!data) throw new Error(`backup is missing ${o.raw}`);
    return { type: o.type, name: o.name, data, crcOk: true, compressed: false };
  });
  return { manifest, files };
}

export function backupFileName(label: string | undefined, now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `${safeFileName((label || 'hp-prime').replace(/\s+/g, '-'))}-backup-${stamp}.zip`;
}
