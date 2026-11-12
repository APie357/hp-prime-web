/**
 * The calculator's built-in help, loaded from a firmware file the user picks (it is HP's text, so it is
 * never bundled). The decoded topics and the original file are kept in this browser's IndexedDB.
 */
import { unzipSync } from 'fflate';
import { createStore, del, get, set } from 'idb-keyval';
import { extractHelp, HELP_LANGUAGES, helpCommands, helpLanguages, setHelpDb, type HelpDb } from './lang/firmwareHelp';

const store = createStore('hp-prime-web-help', 'kv');
const DB_KEY = 'db';
const FILE_KEY = 'file';
const LANG_KEY = 'lang';

interface Saved extends HelpDb {
  lang: number;
  languages: number[];
}

export const help = $state({
  /** Summary of the loaded help, or null. */
  loaded: null as null | { source: string; date?: string; lang: number; languages: number[]; topics: number; commands: number },
  busy: false,
  error: '',
});

function summarize(s: Saved): void {
  setHelpDb(s);
  help.loaded = {
    source: s.source,
    date: s.date,
    lang: s.lang,
    languages: s.languages,
    topics: s.topics.length,
    commands: helpCommands().length,
  };
}

/** Restores the help saved by an earlier visit. */
export async function initHelp(): Promise<void> {
  try {
    const saved = await get<Saved>(DB_KEY, store);
    if (saved?.topics?.length) summarize(saved);
  } catch {
    /* IndexedDB unavailable: run without firmware help */
  }
}

/** The firmware image inside a file: the file itself, or the `.img` in a firmware `.zip`. */
function firmwareImage(name: string, bytes: Uint8Array): { img: Uint8Array; date?: string } {
  const dateOf = (s: string) => /(20\d\d)(\d\d)(\d\d)/.exec(s)?.slice(1, 4).join('-');
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const entries = unzipSync(bytes, { filter: (f) => /\.img$/i.test(f.name) || /^version_\d{8}$/.test(f.name.split('/').pop()!) });
    const names = Object.keys(entries);
    const imgName = names.filter((n) => /\.img$/i.test(n)).sort((a, b) => entries[b].length - entries[a].length)[0];
    if (!imgName) throw new Error('This .zip has no firmware image (.img) in it.');
    const version = names.find((n) => /version_\d{8}$/.test(n));
    return { img: entries[imgName], date: dateOf(version ?? '') ?? dateOf(name) };
  }
  return { img: bytes, date: dateOf(name) };
}

async function decode(name: string, bytes: Uint8Array, lang: number): Promise<Saved> {
  const { img, date } = firmwareImage(name, bytes);
  const languages = helpLanguages(img);
  if (!languages.length) throw new Error('No built-in help found in this file. Pick an HP Prime firmware image (HPPrime_OS.img) or its .zip.');
  const use = languages.includes(lang) ? lang : languages.includes(1) ? 1 : languages[0];
  return { topics: extractHelp(img, use), source: name, date, loadedAt: Date.now(), lang: use, languages };
}

/** Yields to the browser so the busy state paints before the (synchronous) decode. */
const nextFrame = () => new Promise((r) => setTimeout(r, 30));

/** Reads the help out of a firmware file (`HPPrime_OS.img` or the firmware `.zip`) and keeps it. */
export async function loadHelpFile(file: File): Promise<void> {
  help.busy = true;
  help.error = '';
  try {
    await nextFrame();
    const lang = (await get<number>(LANG_KEY, store).catch(() => undefined)) ?? 1;
    const saved = await decode(file.name, new Uint8Array(await file.arrayBuffer()), lang);
    summarize(saved);
    await set(DB_KEY, saved, store);
    await set(FILE_KEY, { name: file.name, blob: file }, store);
  } catch (e) {
    help.error = e instanceof Error ? e.message : String(e);
  } finally {
    help.busy = false;
  }
}

/** Switches to another language in the same firmware file. */
export async function setHelpLanguage(lang: number): Promise<void> {
  help.busy = true;
  help.error = '';
  try {
    await set(LANG_KEY, lang, store);
    const f = await get<{ name: string; blob: Blob }>(FILE_KEY, store);
    if (!f) throw new Error('Pick the firmware file again to change the language.');
    await nextFrame();
    const saved = await decode(f.name, new Uint8Array(await f.blob.arrayBuffer()), lang);
    summarize(saved);
    await set(DB_KEY, saved, store);
  } catch (e) {
    help.error = e instanceof Error ? e.message : String(e);
  } finally {
    help.busy = false;
  }
}

/** Forgets the firmware help; the editor goes back to the built-in command notes. */
export async function clearHelp(): Promise<void> {
  setHelpDb(null);
  help.loaded = null;
  help.error = '';
  await del(DB_KEY, store).catch(() => {});
  await del(FILE_KEY, store).catch(() => {});
}

export const languageName = (code: number) => HELP_LANGUAGES[code] ?? `Language ${code}`;
