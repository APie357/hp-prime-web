/**
 * Python completion, hover and signature help for HP Prime Python, independent of Monaco (pure, so
 * it can be tested). Used for `.py` files and for `#PYTHON … #END` blocks inside PPL programs.
 */
import {
  PY_BUILTINS,
  PY_COMMON_METHODS,
  PY_KEYWORDS,
  PY_MODULE_MAP,
  PY_MODULES,
  type PyMember,
} from './pythonModules';

export type PyItemKind = 'module' | 'function' | 'class' | 'constant' | 'variable' | 'keyword' | 'method';

export interface PyItem {
  label: string;
  kind: PyItemKind;
  /** Short text shown beside the item, e.g. `hpprime.line(G, x1, y1, x2, y2, color)`. */
  detail?: string;
  /** Markdown documentation. */
  doc?: string;
}

/** Other Python files the code can import (e.g. the app's own modules): name → source. */
export type LocalModules = Map<string, string>;

export interface Imports {
  /** Name in scope → module name (`import hpprime as h` gives h → hpprime). */
  modules: Map<string, string>;
  /** Modules imported with `from X import *`. */
  star: string[];
  /** Name in scope → [module, member] (`from math import sqrt as s` gives s → [math, sqrt]). */
  names: Map<string, [string, string]>;
}

export function parseImports(src: string): Imports {
  const out: Imports = { modules: new Map(), star: [], names: new Map() };
  for (const raw of src.split('\n')) {
    const line = raw.replace(/#.*$/, '');
    let m = /^\s*import\s+(.+)$/.exec(line);
    if (m) {
      for (const part of m[1].split(',')) {
        const p = /^\s*([\w.]+)(?:\s+as\s+(\w+))?\s*$/.exec(part);
        if (p) out.modules.set(p[2] ?? p[1], p[1]);
      }
      continue;
    }
    m = /^\s*from\s+([\w.]+)\s+import\s+(.+)$/.exec(line);
    if (m) {
      const mod = m[1];
      const list = m[2].replace(/[()]/g, '');
      if (list.trim() === '*') out.star.push(mod);
      else
        for (const part of list.split(',')) {
          const p = /^\s*(\w+)(?:\s+as\s+(\w+))?\s*$/.exec(part);
          if (p) out.names.set(p[2] ?? p[1], [mod, p[1]]);
        }
    }
  }
  return out;
}

export interface PyDef {
  name: string;
  kind: 'function' | 'class' | 'variable';
  /** `(a, b=1)` for functions. */
  sig?: string;
  line: number;
  /** Defined at the top level of the file (not indented, not a parameter). */
  topLevel: boolean;
}

/** Top-level-ish definitions: functions, classes and assigned names (any indentation). */
export function parseDefs(src: string): PyDef[] {
  const out: PyDef[] = [];
  const seen = new Set<string>();
  src.split('\n').forEach((raw, i) => {
    const line = raw.replace(/#.*$/, '');
    const topLevel = !/^\s/.test(line);
    let m = /^\s*def\s+(\w+)\s*(\([^)]*\))?/.exec(line);
    if (m) {
      out.push({ name: m[1], kind: 'function', sig: m[2] ?? '()', line: i + 1, topLevel });
      seen.add(m[1]);
      // Parameters are names too.
      for (const p of (m[2] ?? '').replace(/[()]/g, '').split(',')) {
        const n = /^\s*\*{0,2}(\w+)/.exec(p)?.[1];
        if (n && !seen.has(n)) {
          seen.add(n);
          out.push({ name: n, kind: 'variable', line: i + 1, topLevel: false });
        }
      }
      return;
    }
    m = /^\s*class\s+(\w+)/.exec(line);
    if (m) {
      out.push({ name: m[1], kind: 'class', line: i + 1, topLevel });
      seen.add(m[1]);
      return;
    }
    // a = …, a, b = …, for a in …, with … as a
    const targets: string[] = [];
    m = /^\s*([\w\s,]+?)\s*(?:[-+*/%&|^]|\/\/|\*\*)?=(?!=)/.exec(line);
    if (m) targets.push(...m[1].split(','));
    m = /^\s*for\s+([\w\s,]+?)\s+in\b/.exec(line);
    if (m) targets.push(...m[1].split(','));
    m = /\bas\s+(\w+)\s*:?\s*$/.exec(line);
    if (m && !/^\s*(import|from)\b/.test(line)) targets.push(m[1]);
    for (const t of targets) {
      const n = t.trim();
      if (/^[A-Za-z_]\w*$/.test(n) && !seen.has(n) && !PY_KEYWORDS.includes(n)) {
        seen.add(n);
        out.push({ name: n, kind: 'variable', line: i + 1, topLevel });
      }
    }
  });
  return out;
}

const KIND: Record<PyMember['kind'], PyItemKind> = { function: 'function', constant: 'constant', class: 'class' };

function memberDoc(module: string | null, m: PyMember): string {
  const head = '```python\n' + (module ? `${module}.` : '') + m.name + (m.sig ?? '') + '\n```';
  const parts = [head];
  if (m.doc) parts.push(m.doc);
  if (m.unverified) parts.push('_HP doesn’t document this signature; it’s from examples or the matching PPL command._');
  return parts.join('\n\n');
}

function memberItem(module: string | null, m: PyMember): PyItem {
  return {
    label: m.name,
    kind: KIND[m.kind],
    detail: (module ? `${module}.` : '') + m.name + (m.sig ?? ''),
    doc: memberDoc(module, m),
  };
}

function moduleItem(name: string, local: LocalModules): PyItem {
  const mod = PY_MODULE_MAP.get(name);
  return {
    label: name,
    kind: 'module',
    detail: mod ? 'HP Prime module' : local.has(name) ? 'module in this app' : 'module',
    doc: mod ? `**${name}**: ${mod.doc}` : local.has(name) ? `Module \`${name}.py\` in this app.` : undefined,
  };
}

function defItem(d: PyDef, module?: string): PyItem {
  const kind: PyItemKind = d.kind;
  const sig = d.sig ?? '';
  return {
    label: d.name,
    kind,
    detail: (module ? `${module}.` : '') + d.name + sig,
    doc: d.kind === 'function' ? '```python\ndef ' + d.name + sig + '\n```\n\n' + (module ? `From ${module}.py` : `Line ${d.line}`) : undefined,
  };
}

/** Members of a module: built-in ones from the table, or the definitions in a local .py file. */
export function moduleMembers(name: string, local: LocalModules): PyItem[] {
  const mod = PY_MODULE_MAP.get(name);
  if (mod) return mod.members.map((m) => memberItem(name, m));
  const src = local.get(name);
  if (src !== undefined) return parseDefs(src).filter((d) => d.topLevel).map((d) => defItem(d, name));
  return [];
}

function allModuleNames(local: LocalModules): string[] {
  return [...new Set([...PY_MODULES.map((m) => m.name), ...local.keys()])].sort();
}

export interface PyCompletion {
  items: PyItem[];
  /** The partial word being completed (to replace). */
  prefix: string;
}

/**
 * Completions at `offset` in `src` (the Python code only: a `.py` file, or one `#PYTHON` block's
 * body).
 */
export function pythonCompletions(src: string, offset: number, local: LocalModules = new Map()): PyCompletion {
  const before = src.slice(0, offset);
  const lineBefore = before.slice(before.lastIndexOf('\n') + 1);
  const prefix = /(\w*)$/.exec(lineBefore)![1];

  // Inside a comment or a string on this line: nothing.
  if (inCommentOrString(lineBefore)) return { items: [], prefix };

  let m = /^\s*from\s+[\w.]*$/.exec(lineBefore);
  if (m || /^\s*import\s+(?:[\w.]+\s*(?:as\s+\w+\s*)?,\s*)*[\w.]*$/.test(lineBefore)) {
    return { items: allModuleNames(local).map((n) => moduleItem(n, local)), prefix };
  }
  m = /^\s*from\s+([\w.]+)\s+import\s+(?:\(?\s*(?:\w+(?:\s+as\s+\w+)?\s*,\s*)*)\w*$/.exec(lineBefore);
  if (m) return { items: moduleMembers(m[1], local), prefix };

  const imports = parseImports(src);
  m = /([A-Za-z_]\w*)\.(\w*)$/.exec(lineBefore);
  if (m) {
    const mod = imports.modules.get(m[1]);
    if (mod) return { items: moduleMembers(mod, local), prefix };
    // A value of unknown type: offer common methods.
    return {
      items: [...new Set(PY_COMMON_METHODS)].sort().map((n) => ({ label: n, kind: 'method' as const })),
      prefix,
    };
  }

  const items: PyItem[] = [];
  const seen = new Set<string>();
  const add = (it: PyItem) => {
    if (!seen.has(it.label)) {
      seen.add(it.label);
      items.push(it);
    }
  };
  for (const d of parseDefs(src)) add(defItem(d));
  for (const [alias, mod] of imports.modules) add({ ...moduleItem(mod, local), label: alias });
  for (const [name, [mod, member]] of imports.names) {
    const mm = PY_MODULE_MAP.get(mod)?.members.find((x) => x.name === member);
    if (mm) add({ ...memberItem(mod, mm), label: name });
    else {
      const d = local.has(mod) ? parseDefs(local.get(mod)!).find((x) => x.name === member && x.topLevel) : undefined;
      add(d ? { ...defItem(d, mod), label: name } : { label: name, kind: 'variable', detail: `from ${mod}` });
    }
  }
  for (const mod of imports.star) for (const it of moduleMembers(mod, local)) add(it);
  for (const b of PY_BUILTINS) add(memberItem(null, b));
  for (const kw of PY_KEYWORDS) add({ label: kw, kind: 'keyword' });
  return { items, prefix };
}

/** True when the end of `line` is inside a `#` comment or an unclosed string. */
function inCommentOrString(line: string): boolean {
  let q: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '\\') i++;
      else if (ch === q) q = null;
    } else if (ch === '#') return true;
    else if (ch === '"' || ch === "'") q = ch;
  }
  return q !== null;
}

/** Resolve a dotted name like `h.line` or `sqrt` to its documentation item. */
export function resolvePython(src: string, expr: string, local: LocalModules = new Map()): PyItem | null {
  const imports = parseImports(src);
  const parts = expr.split('.');
  if (parts.length === 2) {
    const mod = imports.modules.get(parts[0]);
    if (!mod) return null;
    return moduleMembers(mod, local).find((i) => i.label === parts[1]) ?? null;
  }
  if (parts.length !== 1) return null;
  const name = parts[0];
  const def = parseDefs(src).find((d) => d.name === name);
  if (def) return defItem(def);
  const mod = imports.modules.get(name);
  if (mod) return { ...moduleItem(mod, local), label: name };
  const named = imports.names.get(name);
  if (named) return moduleMembers(named[0], local).find((i) => i.label === named[1]) ?? null;
  for (const s of imports.star) {
    const hit = moduleMembers(s, local).find((i) => i.label === name);
    if (hit) return hit;
  }
  const b = PY_BUILTINS.find((x) => x.name === name);
  return b ? memberItem(null, b) : null;
}

export interface PyCall {
  /** Callee expression, e.g. `hpprime.line`. */
  callee: string;
  /** 0-based index of the argument the cursor is in. */
  arg: number;
}

/** The innermost unfinished call around the end of `before`, if any. */
export function findPyCall(before: string): PyCall | null {
  let depth = 0;
  let arg = 0;
  let q: string | null = null;
  // Scan backwards; skip strings by a forward pre-pass of the current statement is overkill, so
  // treat quotes simply (good enough for typical calls).
  for (let i = before.length - 1; i >= 0; i--) {
    const ch = before[i];
    if (q) {
      if (ch === q && before[i - 1] !== '\\') q = null;
      continue;
    }
    if (ch === '"' || ch === "'") q = ch;
    else if (ch === ')' || ch === ']' || ch === '}') depth++;
    else if (ch === '(' || ch === '[' || ch === '{') {
      if (depth === 0) {
        if (ch !== '(') return null;
        const m = /([A-Za-z_][\w.]*)\s*$/.exec(before.slice(0, i));
        return m ? { callee: m[1], arg } : null;
      }
      depth--;
    } else if (ch === ',' && depth === 0) arg++;
    else if (ch === '\n' && depth === 0 && !/[\\,(]\s*$/.test(before.slice(0, i))) return null;
  }
  return null;
}

/** Split a signature `(a, b=1, *c)` into parameters. */
export function pySigParams(sig: string): string[] {
  const inner = sig.trim().replace(/^\(/, '').replace(/\)$/, '');
  if (!inner.trim()) return [];
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of inner) {
    if ('([{'.includes(ch)) depth++;
    if (')]}'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** Where a `#PYTHON … #END` block body lies in a PPL source: [start, end) offsets of the body. */
export function pythonBlocks(src: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  const re = /^[ \t]*#python\b[^\n]*\n?/gim;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const start = m.index + m[0].length;
    const endRe = /^[ \t]*#end\b/gim;
    endRe.lastIndex = start;
    const e = endRe.exec(src);
    const end = e ? e.index : src.length;
    out.push({ start, end });
    re.lastIndex = e ? e.index : src.length;
  }
  return out;
}

/** The Python block containing `offset`, if any. */
export function pythonBlockAt(src: string, offset: number): { start: number; end: number } | null {
  return pythonBlocks(src).find((b) => offset >= b.start && offset <= b.end) ?? null;
}
