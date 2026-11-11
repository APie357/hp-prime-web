import { describe, expect, it } from 'vitest';
import { FolderWorkspace } from '../src/lib/files/workspace';

/**
 * A fake folder (top level only) whose file handles have a move() that refuses, like the browser
 * that reported "The implementation did not support the requested type of object or operation."
 */
function fakeFolder(caseInsensitive: boolean) {
  const files = new Map<string, { name: string; data: Uint8Array }>();
  const key = (n: string) => (caseInsensitive ? n.toLowerCase() : n);
  const handle = (name: string) => ({
    kind: 'file',
    name,
    move: async () => {
      throw new DOMException('not supported', 'NotSupportedError');
    },
    getFile: async () => ({ arrayBuffer: async () => files.get(key(name))!.data.slice().buffer }),
    createWritable: async () => {
      let buf = new Uint8Array();
      return {
        write: async (d: Uint8Array) => void (buf = d.slice()),
        close: async () => {
          const old = files.get(key(name));
          files.set(key(name), { name: old?.name ?? name, data: buf });
        },
      };
    },
  });
  const dir = {
    name: 'test',
    getFileHandle: async (name: string, opts?: { create?: boolean }) => {
      if (!files.has(key(name)) && !opts?.create) throw new DOMException('missing', 'NotFoundError');
      return handle(name);
    },
    removeEntry: async (name: string) => void files.delete(key(name)),
  };
  return { files, ws: new FolderWorkspace(dir as unknown as FileSystemDirectoryHandle) };
}

describe('FolderWorkspace.rename', () => {
  it('copies when move() is refused', async () => {
    const { files, ws } = fakeFolder(false);
    await ws.writeBytes('Custom Mode 1.hpexammode', Uint8Array.of(1, 2, 3));
    await ws.rename('Custom Mode 1.hpexammode', 'Quiz.hpexammode');
    expect([...files.keys()]).toEqual(['Quiz.hpexammode']);
    expect([...(await ws.readBytes('Quiz.hpexammode'))]).toEqual([1, 2, 3]);
  });

  it('keeps the file on a case-only rename on a case-insensitive file system', async () => {
    const { files, ws } = fakeFolder(true);
    await ws.writeBytes('quiz.hpexammode', Uint8Array.of(7));
    await ws.rename('quiz.hpexammode', 'Quiz.hpexammode');
    expect(files.size).toBe(1);
    expect([...(await ws.readBytes('Quiz.hpexammode'))]).toEqual([7]);
  });
});
