/**
 * Lightweight PPL symbol scanner: procedures, parameters, LOCAL variables and exported/global
 * variables, plus block folding ranges. Works on the forgiving lexer's tokens, so it keeps
 * going on unfinished code (which is what an editor sees most of the time).
 */
import { lex, type Token } from './lexer';

export type SymKind = 'procedure' | 'variable' | 'parameter' | 'local';

export interface Sym {
  name: string;
  kind: SymKind;
  exported: boolean;
  /** Position of the name (1-based). */
  line: number;
  col: number;
  /** Lines covered by the whole definition (procedures span header to END). */
  startLine: number;
  endLine: number;
  /** Short description, e.g. `EXPORT FOO(a, b)` or `LOCAL`. */
  detail: string;
  /** Parameter names, for procedures. */
  params: string[];
  /** Parameters and locals, for procedures. */
  children: Sym[];
}

export interface FoldRange {
  start: number;
  end: number;
}

export interface Analysis {
  /** Procedures in source order. */
  procedures: Sym[];
  /** File-level (global) variables: `LOCAL x;` or `EXPORT x;` outside any procedure. */
  globals: Sym[];
  folds: FoldRange[];
}

const OPENERS = new Set(['BEGIN', 'IF', 'FOR', 'WHILE', 'REPEAT', 'CASE', 'IFERR']);

interface Block {
  opener: Token;
  /** Line where the fold should start (the procedure header for BEGIN of a procedure). */
  foldStart: number;
  proc?: Sym;
}

function sym(
  tok: Token,
  kind: SymKind,
  exported: boolean,
  detail: string,
  extra: Partial<Sym> = {},
): Sym {
  return {
    name: tok.text,
    kind,
    exported,
    line: tok.line,
    col: tok.col,
    startLine: tok.line,
    endLine: tok.line,
    detail,
    params: [],
    children: [],
    ...extra,
  };
}

/**
 * Parses `a, b := expr, c;` after a LOCAL/EXPORT keyword. Returns the name tokens and the index of
 * the terminating `;` (or where scanning stopped).
 */
function parseDecls(toks: Token[], start: number): { names: Token[]; next: number } {
  const names: Token[] = [];
  let i = start;
  let expectName = true;
  while (i < toks.length) {
    const t = toks[i];
    if (t.text === ';') break;
    if (t.type === 'kw' && (t.upper === 'BEGIN' || t.upper === 'END')) break;
    if (expectName && t.type === 'ident') {
      names.push(t);
      expectName = false;
      i++;
      continue;
    }
    if (t.text === ':=') {
      // Skip the initializer up to the next top-level comma or the end of the statement.
      let depth = 0;
      i++;
      while (i < toks.length) {
        const u = toks[i];
        if (u.text === '(' || u.text === '{' || u.text === '[') depth++;
        else if (u.text === ')' || u.text === '}' || u.text === ']') depth--;
        else if (depth <= 0 && (u.text === ',' || u.text === ';')) break;
        else if (u.type === 'kw' && (u.upper === 'BEGIN' || u.upper === 'END')) break;
        i++;
      }
      continue;
    }
    if (t.text === ',') expectName = true;
    i++;
  }
  return { names, next: i };
}

export function analyze(src: string): Analysis {
  const toks = lex(src).filter((t) => t.type !== 'comment' && t.type !== 'pragma');
  const procedures: Sym[] = [];
  const globals: Sym[] = [];
  const folds: FoldRange[] = [];
  const stack: Block[] = [];
  const n = toks.length;
  const lastLine = n ? toks[n - 1].line : 1;

  const closeBlock = (closer: Token) => {
    const b = stack.pop();
    if (!b) return;
    if (closer.line - 1 > b.foldStart) folds.push({ start: b.foldStart, end: closer.line - 1 });
    if (b.proc) b.proc.endLine = closer.line;
  };

  let i = 0;
  while (i < n) {
    const t = toks[i];

    if (stack.length === 0) {
      // ---- file level ----
      let j = i;
      let exported = false;
      if (t.upper === 'EXPORT') {
        exported = true;
        j++;
      } else if (t.upper === 'KEY' || t.upper === 'LOCAL') {
        j++;
      }
      const nameTok = toks[j];
      if (nameTok && nameTok.type === 'ident' && toks[j + 1]?.text === '(') {
        // procedure header: NAME(params) BEGIN
        const params: Token[] = [];
        let k = j + 2;
        while (k < n && toks[k].text !== ')' && toks[k].text !== ';' && toks[k].upper !== 'BEGIN') {
          if (toks[k].type === 'ident') params.push(toks[k]);
          k++;
        }
        if (toks[k]?.text === ')' && toks[k + 1]?.upper === 'BEGIN') {
          const names = params.map((p) => p.text);
          const prefix = exported ? 'EXPORT ' : t.upper === 'KEY' ? 'KEY ' : '';
          const proc = sym(nameTok, 'procedure', exported, `${prefix}${nameTok.text}(${names.join(', ')})`, {
            startLine: t.line,
            endLine: toks[k + 1].line,
            params: names,
          });
          proc.children = params.map((p) => sym(p, 'parameter', false, 'parameter'));
          procedures.push(proc);
          stack.push({ opener: toks[k + 1], foldStart: t.line, proc });
          i = k + 2;
          continue;
        }
      } else if ((t.upper === 'LOCAL' || exported) && nameTok?.type === 'ident') {
        // file-level variables
        const { names, next } = parseDecls(toks, j);
        for (const nm of names) {
          globals.push(sym(nm, 'variable', exported, exported ? 'EXPORT variable' : 'LOCAL variable'));
        }
        i = next + 1;
        continue;
      }
      // Anything else at file level (VIEW lines, stray tokens): a stray END is ignored.
      if (OPENERS.has(t.upper) && t.type === 'kw') {
        stack.push({ opener: t, foldStart: t.line });
      }
      i++;
      continue;
    }

    // ---- inside a block ----
    if (t.type === 'kw') {
      if (OPENERS.has(t.upper)) {
        stack.push({ opener: t, foldStart: t.line });
        if (t.upper === 'FOR' && toks[i + 1]?.type === 'ident') {
          const proc = [...stack].reverse().find((b) => b.proc)?.proc;
          const v = toks[i + 1];
          if (proc && !proc.children.some((c) => c.name === v.text)) {
            proc.children.push(sym(v, 'local', false, 'loop variable'));
          }
        }
      } else if (t.upper === 'END') {
        closeBlock(t);
      } else if (t.upper === 'UNTIL') {
        if (stack[stack.length - 1]?.opener.upper === 'REPEAT') closeBlock(t);
      } else if (t.upper === 'LOCAL') {
        const proc = [...stack].reverse().find((b) => b.proc)?.proc;
        const { names, next } = parseDecls(toks, i + 1);
        if (proc) {
          for (const nm of names) proc.children.push(sym(nm, 'local', false, 'LOCAL'));
        }
        i = next + 1;
        continue;
      }
    }
    i++;
  }

  // Unclosed procedures extend to the end of the file.
  for (const b of stack) if (b.proc) b.proc.endLine = Math.max(b.proc.endLine, lastLine);

  return { procedures, globals, folds: dedupeFolds(folds) };
}

function dedupeFolds(folds: FoldRange[]): FoldRange[] {
  const seen = new Set<string>();
  const out: FoldRange[] = [];
  for (const f of folds) {
    const key = `${f.start}:${f.end}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(f);
    }
  }
  return out.sort((a, b) => a.start - b.start || b.end - a.end);
}

/** The procedure whose definition contains `line`, if any. */
export function procedureAt(a: Analysis, line: number): Sym | undefined {
  return a.procedures.find((p) => line >= p.startLine && line <= p.endLine);
}

/** Symbols that can be referenced at `line`: the enclosing procedure's locals first, then file level. */
export function visibleAt(a: Analysis, line: number): Sym[] {
  const proc = procedureAt(a, line);
  return [...(proc ? proc.children : []), ...a.procedures, ...a.globals];
}

/** Resolves a name used at `line` to its definition (user symbols are case-sensitive). */
export function findSymbol(a: Analysis, name: string, line: number): Sym | undefined {
  return visibleAt(a, line).find((s) => s.name === name);
}
