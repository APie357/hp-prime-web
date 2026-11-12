/**
 * The calculator's built-in help, read from an HP Prime firmware image (`HPPrime_OS.img`).
 *
 * The help text is HP's, so it is never bundled with the site: the user picks their own firmware file
 * and the decoded topics stay in their browser. See docs/formats/firmware-help.md for the layout.
 *
 * Framework-free; the Monaco providers read it through `helpFor` / `helpCommands`.
 */

const MAGIC = [0x7c, 0x61, 0x8a, 0xb2];
const FLAG_SUBTITLE = 0x02;
const FLAG_BODY = 0x04;
const FLAG_EXAMPLE = 0x08;

export interface HelpTopic {
  id: number;
  title: string;
  /** Short heading shown under the title (e.g. "Draw Text"). */
  subtitle?: string;
  /** Main text, in the calculator's markup (see `helpBodyMarkdown`). */
  body?: string;
  /** Example lines, one per line; `__$…` lines are links to on-calculator demos. */
  example?: string;
}

export interface HelpDb {
  topics: HelpTopic[];
  /** Where it came from, e.g. the firmware file name. */
  source: string;
  /** Firmware date (YYYY-MM-DD) when known. */
  date?: string;
  loadedAt: number;
}

/** Help languages by the code in each help block's header. */
export const HELP_LANGUAGES: Record<number, string> = {
  1: 'English',
  2: 'Chinese',
  3: 'French',
  4: 'German',
  5: 'Spanish',
  6: 'Dutch',
  7: 'Portuguese',
  8: 'Japanese',
  9: 'Russian',
};

interface Layout {
  header: number;
  lang: number;
  count: number;
  index: number;
  tree: number;
  treeSize: number;
  blob: number;
  blobSize: number;
}

const u16 = (d: Uint8Array, p: number) => d[p] | (d[p + 1] << 8);
const u32 = (d: Uint8Array, p: number) => (d[p] | (d[p + 1] << 8) | (d[p + 2] << 16) | (d[p + 3] << 24)) >>> 0;

/** Finds the help blocks (one per language): the `7C618AB2` magic followed by self-consistent offsets. */
export function findHelpBlocks(img: Uint8Array): Layout[] {
  const found: Layout[] = [];
  for (let p = 0; p + 0x38 <= img.length; p++) {
    if (img[p] !== MAGIC[0] || img[p + 1] !== MAGIC[1] || img[p + 2] !== MAGIC[2] || img[p + 3] !== MAGIC[3]) continue;
    const f = (k: number) => u32(img, p + 0x1c + 4 * k);
    const [count, index, indexSize, tree, treeSize, blob, blobSize] = [0, 1, 2, 3, 4, 5, 6].map(f);
    if (
      count > 0 &&
      count < 100000 &&
      tree + treeSize === index &&
      index + indexSize === blob &&
      p + blob + blobSize <= img.length &&
      treeSize > 0
    ) {
      found.push({ header: p, lang: u32(img, p + 0x0c), count, index: p + index, tree: p + tree, treeSize, blob: p + blob, blobSize });
      p += blob + blobSize - 1;
    }
  }
  return found;
}

/** Language codes of the help blocks in a firmware image. */
export function helpLanguages(img: Uint8Array): number[] {
  return findHelpBlocks(img).map((b) => b.lang);
}

/**
 * Huffman tree. Each node is a type byte then data: 0 = two subtrees follow (u16 = size of the first);
 * 1 = u16 symbol for the 1-branch, then the 0-branch subtree; 2 = u16 symbol for the 0-branch, then
 * the 1-branch subtree; 3 = two u16 symbols (0-branch, 1-branch). Children are stored as
 * `zero[n]`/`one[n]`; a negative value `-(sym + 1)` is a leaf.
 */
function readTree(img: Uint8Array, start: number, size: number): { zero: number[]; one: number[] } {
  const zero: number[] = [];
  const one: number[] = [];
  let p = start;
  const end = start + size;
  const node = (): number => {
    if (p >= end) throw new Error('help tree runs past its end');
    const n = zero.length;
    zero.push(0);
    one.push(0);
    const t = img[p];
    if (t === 0) {
      p += 3;
      zero[n] = node();
      one[n] = node();
    } else if (t === 3) {
      zero[n] = -(u16(img, p + 1) + 1);
      one[n] = -(u16(img, p + 3) + 1);
      p += 5;
    } else if (t === 1 || t === 2) {
      const leaf = -(u16(img, p + 1) + 1);
      p += 3;
      const sub = node();
      if (t === 1) {
        one[n] = leaf;
        zero[n] = sub;
      } else {
        zero[n] = leaf;
        one[n] = sub;
      }
    } else {
      throw new Error(`unknown help tree node type ${t}`);
    }
    return n;
  };
  node();
  if (p !== end) throw new Error('help tree size mismatch');
  return { zero, one };
}

/**
 * Decodes every topic of one language (default English). Translations leave command titles empty;
 * those take the English title of the same topic id. Throws if there is no help or it does not decode.
 */
export function extractHelp(img: Uint8Array, lang = 1): HelpTopic[] {
  const blocks = findHelpBlocks(img);
  if (!blocks.length) throw new Error('No built-in help found in this file. Pick an HP Prime firmware image (HPPrime_OS.img) or its .zip.');
  const L = blocks.find((b) => b.lang === lang) ?? blocks.find((b) => b.lang === 1) ?? blocks[0];
  const topics = decodeBlock(img, L);
  const en = L.lang === 1 ? null : blocks.find((b) => b.lang === 1);
  if (en && topics.some((t) => !t.title)) {
    const titles = new Map(decodeIndex(img, en).map((r) => [r.id, r.title]));
    for (const t of topics) if (!t.title) t.title = titles.get(t.id) ?? '';
  }
  return topics;
}

function decodeIndex(img: Uint8Array, L: Layout): { id: number; off: number; len: number; flags: number; title: string }[] {
  const out = [];
  let p = L.index;
  for (let k = 0; k < L.count; k++) {
    const id = u32(img, p);
    const off = u32(img, p + 4);
    const len = u16(img, p + 8);
    const flags = u16(img, p + 10);
    p += 12;
    let title = '';
    for (; u16(img, p) !== 0; p += 2) title += String.fromCharCode(u16(img, p));
    p += 2;
    out.push({ id, off, len, flags, title });
  }
  return out;
}

function decodeBlock(img: Uint8Array, L: Layout): HelpTopic[] {
  const { zero, one } = readTree(img, L.tree, L.treeSize);
  const topics: HelpTopic[] = [];
  for (const { id, off, len, flags, title } of decodeIndex(img, L)) {
    if (off + len > L.blobSize) throw new Error(`help topic ${id} lies outside the text block`);

    // Topic data: u16, then one NUL-terminated string per flag bit, each padded to a whole byte.
    const base = L.blob + off;
    const strings: string[] = [];
    let bit = 16;
    const want = [FLAG_SUBTITLE, FLAG_BODY, FLAG_EXAMPLE].filter((f) => flags & f).length;
    while (strings.length < want) {
      let s = '';
      let n = 0;
      for (;;) {
        if (bit >= len * 8) throw new Error(`help topic ${id} is truncated`);
        const b = (img[base + (bit >> 3)] >> (bit & 7)) & 1;
        bit++;
        const next = b ? one[n] : zero[n];
        if (next < 0) {
          const sym = -next - 1;
          if (sym === 0) break;
          s += String.fromCharCode(sym);
          n = 0;
        } else n = next;
      }
      strings.push(s);
      bit = (bit + 7) & ~7;
    }
    const t: HelpTopic = { id, title };
    let i = 0;
    if (flags & FLAG_SUBTITLE) t.subtitle = strings[i++];
    if (flags & FLAG_BODY) t.body = strings[i++];
    if (flags & FLAG_EXAMPLE) t.example = strings[i++];
    topics.push(t);
  }
  return topics;
}

// ---- markup → Markdown ----

/** Calculator-font glyphs in the Unicode private use area. */
const PUA: Record<string, string> = { '': 'x̄', '': 'p̂', '': 'i', '': '⁻¹' };
const CODE_STYLES = new Set(['^', 'P', 'Y', ';']);

// Backticks are left alone: the help text already uses them for inline code.
const escapeMd = (s: string) => s.replace(/[\\*_[\]<>#|~]/g, '\\$&');

const glyphs = (s: string) => s.replace(/[\ue000-\uf8ff]/g, (c) => PUA[c] ?? c);

function exampleLines(t: HelpTopic): string[] {
  return glyphs(t.example ?? '')
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l && !l.startsWith('__$'));
}

/**
 * Converts the help markup to Markdown. `✎c … c✐` is a styled span (`*` bold, `_` heading,
 * `x` and `/` italic, `#` parameter name, `^` syntax block, `P`/`Y`/`;` code, `%` examples section),
 * `✎+` / `✎o` start (sub-)bullets and `+✐` ends a list, `✍[Key]✍` is a menu key and `(--En--)` is
 * example line n.
 */
export function helpBodyMarkdown(t: HelpTopic, codeLang = 'hpppl'): { md: string; usedExamples: boolean } {
  const src = (t.body ?? '').replace(/[-]/g, (c) => PUA[c] ?? c);
  const examples = exampleLines(t);
  let usedExamples = false;
  let out = '';
  const stack: { style: string; start: number }[] = [];
  const inCode = () => stack.some((s) => CODE_STYLES.has(s.style));
  const inSpan = () => stack.some((s) => s.style === '#');
  const text = (s: string) => {
    if (inCode()) out += s;
    // Inside a `code` span Markdown escapes would show literally.
    else if (inSpan()) out += s.replace(/`/g, "'").replace(/\n/g, ' ');
    else out += escapeMd(s).replace(/\n/g, '  \n');
  };
  const inline = (s: string) => {
    if (!inCode()) out += s;
  };
  const open = (style: string) => {
    stack.push({ style, start: out.length });
    if (style === '*' || style === '_') inline('**');
    else if (style === 'x' || style === '/') inline('*');
    else if (style === '#') inline('`');
  };
  const close = () => {
    const top = stack.pop();
    if (!top) return;
    const { style, start } = top;
    if (CODE_STYLES.has(style) && !inCode()) {
      // The block's raw text is out[start…]; fence it, lifting a leading "Syntax:" label out.
      let raw = out.slice(start).replace(/^\n+|\n+$/g, '');
      out = out.slice(0, start);
      let label = '';
      const m = /^(Syntax|Examples?):\s*\n/.exec(raw);
      if (m) {
        label = `**${m[1]}**\n`;
        raw = raw.slice(m[0].length);
      }
      if (out && !out.endsWith('\n')) out += '\n';
      out += `${label}\`\`\`${style === 'Y' ? 'python' : codeLang}\n${raw}\n\`\`\`\n`;
    } else if (style === '*' || style === '_') inline('**');
    else if (style === 'x' || style === '/') inline('*');
    else if (style === '#') inline('`');
  };

  let i = 0;
  let plain = '';
  const flush = () => {
    if (plain) text(plain);
    plain = '';
  };
  while (i < src.length) {
    const ch = src[i];
    if (ch === '✎' && i + 1 < src.length) {
      const st = src[i + 1];
      flush();
      if (st === '+' || st === 'o') {
        if (!inCode()) {
          if (out && !out.endsWith('\n')) out += '\n';
          out += st === 'o' ? '  - ' : '- ';
        }
      } else open(st);
      i += 2;
      continue;
    }
    // "c✐" closes the span opened with "✎c"; "+✐" / "o✐" ends a list.
    if (i + 1 < src.length && src[i + 1] === '✐') {
      const top = stack[stack.length - 1];
      if (top && top.style === ch) {
        flush();
        close();
        i += 2;
        continue;
      }
      if (ch === '+' || ch === 'o') {
        flush();
        i += 2;
        continue;
      }
    }
    if (ch === '✐') {
      flush();
      close();
      i++;
      continue;
    }
    if (ch === '✍') {
      const j = src.indexOf('✍', i + 1);
      if (j > i) {
        flush();
        const key = src.slice(i + 1, j);
        // "-▲ Page ▼-" is the help viewer's own scroll control.
        if (!(key.startsWith('-') && key.endsWith('-'))) out += inCode() ? key : `**${escapeMd(key)}**`;
        i = j + 1;
        continue;
      }
    }
    const ref = /^\(--E(\d+)--\)/.exec(src.slice(i, i + 12));
    if (ref) {
      flush();
      const line = examples[Number(ref[1]) - 1];
      usedExamples = true;
      if (line !== undefined) {
        if (inCode()) out += line;
        else out += '`' + line.replace(/`/g, "'") + '`';
      }
      i += ref[0].length;
      continue;
    }
    plain += ch;
    i++;
  }
  flush();
  while (stack.length) close();
  // Hard breaks next to blank lines and code fences are noise.
  const md = out
    .replace(/^ +$/gm, '')
    .replace(/ +\n(?=\n|```)/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { md, usedExamples };
}

/** Full hover Markdown for a topic: title line, body and examples. */
export function helpMarkdown(t: HelpTopic, codeLang = 'hpppl'): string {
  const parts: string[] = [];
  parts.push(t.subtitle ? `**${escapeMd(t.title)}** — ${escapeMd(t.subtitle)}` : `**${escapeMd(t.title)}**`);
  const { md, usedExamples } = helpBodyMarkdown(t, codeLang);
  if (md) parts.push(md);
  const ex = exampleLines(t);
  if (ex.length && !usedExamples) parts.push('**Example**\n```' + codeLang + '\n' + ex.join('\n') + '\n```');
  return parts.join('\n\n');
}

/** The lines of a topic's syntax block (`✎^✎*Syntax:*✐ … ^✐`). */
export function syntaxLines(t: HelpTopic): string[] {
  const m = /✎\^(?:✎\*Syntax:\*✐)?\n?([\s\S]*?)\^✐/.exec(t.body ?? '');
  if (!m) return [];
  const lines = m[1]
    .replace(/ /g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const own = lines.filter((l) => l === t.title || l.startsWith(t.title + '(') || l.startsWith(t.title + ' '));
  return own.length ? own : lines;
}

/**
 * Fewest and most arguments a syntax line accepts: top-level commas inside the parentheses, with
 * `[…]` optional and `…` variadic. No parentheses means no arguments.
 */
export function syntaxArity(sig: string): { min: number; max: number } | null {
  const open = sig.indexOf('(');
  if (open < 0) return { min: 0, max: 0 };
  let depth = 0;
  let opt = 0;
  let args = 0;
  let required = 0;
  let sawAny = false;
  let curRequired = true;
  let variadic = false;
  for (let i = open + 1; i < sig.length; i++) {
    const ch = sig[i];
    if (ch === '(' || ch === '{') depth++;
    else if (ch === ')' || ch === '}') {
      if (depth === 0) {
        if (sawAny) {
          args++;
          if (curRequired) required++;
        }
        return { min: required, max: variadic ? Infinity : args };
      }
      depth--;
    } else if (ch === '[' && depth === 0) {
      opt++;
    } else if (ch === ']' && depth === 0) {
      opt = Math.max(0, opt - 1);
    } else if (ch === ',' && depth === 0) {
      if (sawAny) {
        args++;
        if (curRequired) required++;
      }
      sawAny = false;
    } else if (ch === '…' || sig.startsWith('...', i)) {
      variadic = true;
    } else if (!/\s/.test(ch)) {
      // An argument is optional when it starts inside […].
      if (!sawAny) curRequired = opt === 0;
      sawAny = true;
    }
  }
  return null;
}

/**
 * Offsets `[start, end)` of each argument in a syntax line, splitting at every top-level comma
 * (optional `[, x [, y]]` arguments count as their own), with brackets and spaces trimmed off.
 */
export function syntaxParams(sig: string): [number, number][] {
  const open = sig.indexOf('(');
  if (open < 0) return [];
  const out: [number, number][] = [];
  let depth = 0;
  let segStart = open + 1;
  const push = (a: number, b: number) => {
    while (a < b && /[\s[\]]/.test(sig[a])) a++;
    while (b > a && /[\s[\]]/.test(sig[b - 1])) b--;
    if (b > a) out.push([a, b]);
  };
  for (let i = open + 1; i < sig.length; i++) {
    const ch = sig[i];
    if (ch === '(' || ch === '{') depth++;
    else if (ch === '}') depth--;
    else if (ch === ')') {
      if (depth === 0) {
        push(segStart, i);
        return out;
      }
      depth--;
    } else if (ch === ',' && depth === 0) {
      push(segStart, i);
      segStart = i + 1;
    }
  }
  return out;
}

// ---- the loaded database ----

const IDENT = /^[A-Za-z_Ͱ-Ͽ][\wͰ-Ͽ]*$/;

let db: HelpDb | null = null;
let commands = new Map<string, HelpTopic>();
let keywords = new Map<string, HelpTopic>();
const listeners = new Set<() => void>();

/** Topics before the Python module reference that name a command (identifier title, has a syntax block). */
function indexCommands(topics: HelpTopic[]): Map<string, HelpTopic> {
  keywords = new Map();
  let end = topics.findIndex((t) => t.title === 'Python modules');
  if (end < 0) end = topics.findIndex((t) => / \(builtins\)$/.test(t.title));
  if (end < 0) end = topics.length;
  const map = new Map<string, HelpTopic>();
  for (const t of topics.slice(0, end)) {
    if (!t.body?.includes('Syntax:')) continue;
    if (IDENT.test(t.title)) {
      if (!map.has(t.title)) map.set(t.title, t);
    } else if (/^[A-Z]+( [A-Z]+)+$/.test(t.title)) {
      // Program structures such as "IF THEN ELSE END" are found by their first keyword.
      const first = t.title.split(' ')[0];
      if (!keywords.has(first)) keywords.set(first, t);
    }
  }
  return map;
}

export function setHelpDb(next: HelpDb | null): void {
  db = next;
  commands = next ? indexCommands(next.topics) : new Map();
  if (!next) keywords = new Map();
  for (const f of listeners) f();
}

export function helpDb(): HelpDb | null {
  return db;
}

/** Calls `f` whenever the help database changes. Returns an unsubscribe function. */
export function onHelpChange(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** The firmware help for a command, matched case-sensitively (lower case names are CAS commands). */
export function helpFor(name: string): HelpTopic | undefined {
  return commands.get(name);
}

/** The firmware help for a program structure keyword (`IF`, `FOR`, `CASE`, …) or a keyword-like command. */
export function helpForKeyword(word: string): HelpTopic | undefined {
  const w = word.toUpperCase();
  return keywords.get(w) ?? commands.get(w);
}

/** All commands documented in the loaded firmware help. */
export function helpCommands(): HelpTopic[] {
  return [...commands.values()];
}

/** Argument counts accepted by any of the topic's syntax lines, or null if none can be read. */
export function helpArity(t: HelpTopic): { min: number; max: number } | null {
  let min = Infinity;
  let max = -1;
  for (const line of syntaxLines(t)) {
    const a = syntaxArity(line);
    if (!a) return null;
    min = Math.min(min, a.min);
    max = Math.max(max, a.max);
  }
  return max < 0 ? null : { min, max };
}

/**
 * True if the loaded firmware help documents a form of `name` taking `n` arguments. The linter uses
 * it only to accept calls the built-in catalog would reject, never to add errors.
 */
export function firmwareAccepts(name: string, n: number): boolean {
  const t = helpFor(name);
  const a = t && helpArity(t);
  return !!a && n >= a.min && n <= a.max;
}
