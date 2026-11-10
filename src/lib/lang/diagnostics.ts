/**
 * PPL linter: structural problems (unbalanced blocks and brackets, unterminated strings), likely
 * typos (missing `;`, `=` where `:=` was meant), argument counts for built-in commands, and
 * variables assigned without being declared. Heuristic by design: it prefers missing a problem over
 * crying wolf, and everything it is unsure about is a warning, not an error.
 */
import type * as Monaco from 'monaco-editor/editor';
import { lex, type Token } from './lexer';
import { acceptsArgCount, arityText, lookupCommand, lookupCommandAnyCase } from './catalog';
import { analyze, findSymbol, procedureAt } from './symbols';

export type Severity = 'error' | 'warning' | 'info';

export interface Diagnostic {
  severity: Severity;
  message: string;
  /** 1-based start; `endCol` is exclusive. Single-line ranges only. */
  line: number;
  col: number;
  endCol: number;
  code: string;
}

const OPENERS = new Set(['BEGIN', 'IF', 'FOR', 'WHILE', 'REPEAT', 'CASE', 'IFERR']);
const STATEMENT_KEYWORDS = new Set([
  'LOCAL', 'RETURN', 'IF', 'FOR', 'WHILE', 'REPEAT', 'CASE', 'BREAK', 'CONTINUE', 'KILL', 'IFERR', 'EXPORT', 'KEY',
]);
/** Tokens after which a new statement begins. */
const STATEMENT_PRECEDERS = new Set(['BEGIN', 'THEN', 'ELSE', 'DO', 'REPEAT', 'DEFAULT']);
/** Keywords that cannot occur inside a bracketed expression; they reset bracket tracking. */
const BRACKET_RESETTERS = new Set(['BEGIN', 'END', 'UNTIL', 'LOCAL', 'RETURN', 'ELSE', 'THEN', 'DO']);
const CLOSER_FOR: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

/** Names that are built into the calculator and may be assigned without a declaration. */
function isSystemVariable(name: string): boolean {
  return (
    /^[A-Za-z]$/.test(name) ||
    /^[GLMCZ]\d$/.test(name) ||
    /^H[A-Z][A-Za-z]*$/.test(name) ||
    /^(X|Y|T|Theta|N|U)(min|max|tick|step|res)$/i.test(name) ||
    name === 'Ans'
  );
}

function diag(t: Token, severity: Severity, code: string, message: string, len = t.text.length): Diagnostic {
  return { severity, message, line: t.line, col: t.col, endCol: t.col + len, code };
}

function unterminated(str: Token): boolean {
  if (str.text.length < 2 || !str.text.endsWith('"')) return true;
  let slashes = 0;
  for (let i = str.text.length - 2; i > 0 && str.text[i] === '\\'; i--) slashes++;
  return slashes % 2 === 1;
}

export function lint(src: string): Diagnostic[] {
  const all = lex(src);
  const toks = all.filter((t) => t.type !== 'comment' && t.type !== 'pragma');
  // Alternative argument separators make comma counting unreliable; skip those checks.
  const customSeparators = all.some((t) => t.type === 'pragma' && /separator/i.test(t.text));
  const out: Diagnostic[] = [];
  const a = analyze(src);

  // ---- strings ----
  for (const t of toks) {
    if (t.type === 'str' && unterminated(t)) out.push(diag(t, 'error', 'unterminated-string', 'Unterminated string: missing closing "', 1));
  }

  // ---- blocks ----
  const blocks: Token[] = [];
  for (const t of toks) {
    if (t.type !== 'kw') continue;
    if (OPENERS.has(t.upper)) blocks.push(t);
    else if (t.upper === 'END') {
      const top = blocks.pop();
      if (!top) out.push(diag(t, 'error', 'stray-end', 'END without a matching BEGIN, IF, FOR, WHILE or CASE'));
      else if (top.upper === 'REPEAT') out.push(diag(t, 'error', 'repeat-end', `REPEAT (line ${top.line}) must be closed with UNTIL, not END`));
    } else if (t.upper === 'UNTIL') {
      if (blocks[blocks.length - 1]?.upper === 'REPEAT') blocks.pop();
      else out.push(diag(t, 'error', 'stray-until', 'UNTIL without a matching REPEAT'));
    }
  }
  for (const b of blocks) {
    const closer = b.upper === 'REPEAT' ? 'UNTIL' : 'END';
    out.push(diag(b, 'error', 'unclosed-block', `${b.upper} is never closed with ${closer}`));
  }

  // ---- brackets, missing `;`, `=` vs `:=`, assignments, calls ----
  const brackets: Token[] = [];
  const reportedUndeclared = new Set<string>();

  const isStatementStart = (idx: number): boolean => {
    const prev = toks[idx - 1];
    return !prev || prev.text === ';' || (prev.type === 'kw' && STATEMENT_PRECEDERS.has(prev.upper));
  };

  for (let idx = 0; idx < toks.length; idx++) {
    const t = toks[idx];
    const prev = toks[idx - 1];
    const next = toks[idx + 1];

    // Reset runaway bracket state at keywords that cannot appear inside an expression.
    if (t.type === 'kw' && BRACKET_RESETTERS.has(t.upper) && brackets.length) {
      for (const o of brackets) out.push(diag(o, 'error', 'unclosed-bracket', `Unclosed '${o.text}'`));
      brackets.length = 0;
    }

    // Missing semicolon between two statements on different lines.
    if (prev && brackets.length === 0 && t.line > prev.line) {
      const startsStatement =
        (t.type === 'kw' && STATEMENT_KEYWORDS.has(t.upper)) ||
        (t.type === 'ident' && !!next && [':=', '(', '[', '▶', '→'].includes(next.text));
      const endsOperand =
        prev.type === 'num' ||
        prev.type === 'str' ||
        prev.type === 'ident' ||
        [')', ']', '}'].includes(prev.text) ||
        (prev.type === 'kw' && ['END', 'BREAK', 'CONTINUE'].includes(prev.upper));
      if (startsStatement && endsOperand) {
        out.push({
          severity: 'warning',
          message: "Missing ';' at the end of the previous statement",
          line: prev.line,
          col: prev.col + prev.text.length,
          endCol: prev.col + prev.text.length + 1,
          code: 'missing-semicolon',
        });
      }
    }

    if (t.type === 'op') {
      if (t.text === '(' || t.text === '[' || t.text === '{') brackets.push(t);
      else if (t.text in CLOSER_FOR) {
        const top = brackets[brackets.length - 1];
        if (!top) out.push(diag(t, 'error', 'unmatched-bracket', `Unmatched '${t.text}'`));
        else if (top.text === CLOSER_FOR[t.text]) brackets.pop();
        else out.push(diag(t, 'error', 'mismatched-bracket', `'${t.text}' does not match the '${top.text}' on line ${top.line}`));
      }
    }

    // `x = 1;` at the start of a statement: an assignment needs :=
    if (t.text === '=' && t.type === 'op' && prev?.type === 'ident' && brackets.length === 0 && isStatementStart(idx - 1)) {
      out.push(diag(t, 'warning', 'assign-equals', "'=' compares values. To assign, use ':=' (or ▶)", 1));
    }

    // Assignment to a name that was never declared.
    if (a.procedures.length) {
      let target: Token | undefined;
      if (t.text === ':=' && prev?.type === 'ident' && isStatementStart(idx - 1)) target = prev;
      else if ((t.text === '▶' || t.text === '→') && next?.type === 'ident' && next.upper !== 'HMS') target = next;
      if (target && !target.text.includes('.')) {
        const proc = procedureAt(a, target.line);
        if (proc && !findSymbol(a, target.text, target.line) && !isSystemVariable(target.text)) {
          const key = `${proc.name}:${target.text}`;
          if (!reportedUndeclared.has(key)) {
            reportedUndeclared.add(key);
            out.push(diag(target, 'warning', 'undeclared-assignment', `'${target.text}' is assigned without being declared, which creates a global variable. Add LOCAL ${target.text};`));
          }
        }
      }
    }

    // Calls to built-in commands.
    if (t.type === 'ident' && next?.text === '(' && !findSymbol(a, t.text, t.line)) {
      const cmd = lookupCommand(t.text);
      if (cmd && !customSeparators) {
        let depth = 0;
        let count = 0;
        let sawArg = false;
        let closed = false;
        for (let k = idx + 1; k < toks.length; k++) {
          const u = toks[k];
          if (u.text === '(' || u.text === '[' || u.text === '{') {
            depth++;
            if (depth > 1) sawArg = true;
          } else if (u.text === ')' || u.text === ']' || u.text === '}') {
            depth--;
            if (depth === 0) {
              closed = true;
              break;
            }
          } else if (u.text === ',' && depth === 1) count++;
          else if (u.type === 'kw' && BRACKET_RESETTERS.has(u.upper)) break;
          else sawArg = true;
        }
        if (closed) {
          const n = sawArg || count > 0 ? count + 1 : 0;
          if (!acceptsArgCount(cmd, n)) {
            const plural = cmd.minArgs === cmd.maxArgs && cmd.minArgs === 1 ? '' : 's';
            out.push(diag(t, 'error', 'arg-count', `${cmd.name} takes ${arityText(cmd)} argument${plural}, but ${n} ${n === 1 ? 'was' : 'were'} given`));
          }
        }
      } else if (!cmd && lookupCommandAnyCase(t.text)) {
        const c = lookupCommandAnyCase(t.text)!;
        out.push(diag(t, 'info', 'lowercase-command', `'${t.text}' in lower case calls the CAS version. Use ${c.name} for the PPL command.`));
      }
    }
  }
  for (const o of brackets) out.push(diag(o, 'error', 'unclosed-bracket', `Unclosed '${o.text}'`));

  // ---- duplicate declarations ----
  const procNames = new Set<string>();
  for (const p of a.procedures) {
    if (procNames.has(p.name)) {
      out.push({ severity: 'warning', message: `Procedure '${p.name}' is already defined`, line: p.line, col: p.col, endCol: p.col + p.name.length, code: 'duplicate-procedure' });
    }
    procNames.add(p.name);
    const seen = new Set<string>();
    for (const c of p.children) {
      if (seen.has(c.name)) {
        out.push({ severity: 'warning', message: `'${c.name}' is already declared in ${p.name}`, line: c.line, col: c.col, endCol: c.col + c.name.length, code: 'duplicate-declaration' });
      }
      seen.add(c.name);
    }
  }

  return out.sort((x, y) => x.line - y.line || x.col - y.col);
}

// ---- Monaco integration ----

const OWNER = 'ppl-lint';

export function registerDiagnostics(monaco: typeof Monaco, languageId: string): void {
  const SEV: Record<Severity, Monaco.MarkerSeverity> = {
    error: monaco.MarkerSeverity.Error,
    warning: monaco.MarkerSeverity.Warning,
    info: monaco.MarkerSeverity.Info,
  };

  const run = (model: Monaco.editor.ITextModel) => {
    if (model.isDisposed()) return;
    const markers: Monaco.editor.IMarkerData[] = lint(model.getValue()).map((d) => ({
      severity: SEV[d.severity],
      message: d.message,
      code: d.code,
      startLineNumber: d.line,
      startColumn: d.col,
      endLineNumber: d.line,
      endColumn: d.endCol,
    }));
    monaco.editor.setModelMarkers(model, OWNER, markers);
  };

  const attach = (model: Monaco.editor.ITextModel) => {
    if (model.getLanguageId() !== languageId) {
      monaco.editor.setModelMarkers(model, OWNER, []);
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    run(model);
    const sub = model.onDidChangeContent(() => {
      clearTimeout(timer);
      timer = setTimeout(() => run(model), 300);
    });
    const langSub = model.onDidChangeLanguage(() => {
      sub.dispose();
      langSub.dispose();
      clearTimeout(timer);
      attach(model);
    });
    model.onWillDispose(() => {
      clearTimeout(timer);
      sub.dispose();
      langSub.dispose();
    });
  };

  monaco.editor.onDidCreateModel(attach);
  monaco.editor.getModels().forEach(attach);
}
