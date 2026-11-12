/** Monaco language providers for PPL: completion, hover, signature help, outline, definitions and folding. */
import type * as Monaco from 'monaco-editor/editor';
import { KEYWORDS, KEYWORD_SET } from './lexer';
import {
  COMMANDS,
  CATEGORY_LABELS,
  commandMarkdown,
  lookupCommand,
  lookupCommandAnyCase,
  type Command,
} from './catalog';
import { helpCommands, helpFor, helpForKeyword, helpMarkdown, syntaxArity, syntaxLines, syntaxParams, type HelpTopic } from './firmwareHelp';
import { analyze, findSymbol, visibleAt, type Analysis, type Sym } from './symbols';
import { formatPpl } from './format';
import { pyCompletionItems, pyHover, pySignatureHelp, pythonRegion } from './pythonProviders';

const analysisCache = new WeakMap<object, { version: number; analysis: Analysis }>();

/** Analysis of a model, recomputed only when its text changed. */
function analysisFor(model: Monaco.editor.ITextModel): Analysis {
  const version = model.getVersionId();
  const hit = analysisCache.get(model);
  if (hit && hit.version === version) return hit.analysis;
  const analysis = analyze(model.getValue());
  analysisCache.set(model, { version, analysis });
  return analysis;
}

function symMarkdown(s: Sym): string {
  const what =
    s.kind === 'procedure' ? 'procedure' : s.kind === 'parameter' ? 'parameter' : s.kind === 'local' ? 'local variable' : 'variable';
  return '```\n' + s.detail + '\n```\n\n' + `User-defined ${what}` + (s.exported ? ' (exported)' : '') + `, line ${s.line}.`;
}

interface Snippet {
  label: string;
  detail: string;
  body: string;
}

const SNIPPETS: Snippet[] = [
  { label: 'EXPORT procedure', detail: 'Exported procedure', body: 'EXPORT ${1:NAME}(${2})\nBEGIN\n  ${0}\nEND;' },
  { label: 'procedure', detail: 'Local procedure', body: '${1:NAME}(${2})\nBEGIN\n  ${0}\nEND;' },
  { label: 'IF…THEN…END', detail: 'Conditional', body: 'IF ${1:condition} THEN\n  ${0}\nEND;' },
  { label: 'IF…THEN…ELSE…END', detail: 'Conditional with else', body: 'IF ${1:condition} THEN\n  ${2}\nELSE\n  ${0}\nEND;' },
  { label: 'FOR…FROM…TO…DO', detail: 'Counting loop', body: 'FOR ${1:I} FROM ${2:1} TO ${3:10} DO\n  ${0}\nEND;' },
  { label: 'WHILE…DO…END', detail: 'Loop while true', body: 'WHILE ${1:condition} DO\n  ${0}\nEND;' },
  { label: 'REPEAT…UNTIL', detail: 'Loop until true', body: 'REPEAT\n  ${0}\nUNTIL ${1:condition};' },
  { label: 'CASE…END', detail: 'Multi-way branch', body: 'CASE\n  IF ${1:condition} THEN ${2} END;\n  DEFAULT ${0}\nEND;' },
  { label: 'LOCAL', detail: 'Local variable declaration', body: 'LOCAL ${1:name};' },
];

// A command name may contain Greek letters and arrows (ΣLIST, →HMS, R→B).
const WORD = /[A-Za-z0-9_Ͱ-ϿÀ-ɏ→∏Σ√]+/g;

function wordAt(line: string, column: number): { text: string; start: number; end: number } | null {
  WORD.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WORD.exec(line))) {
    const start = m.index + 1;
    const end = start + m[0].length;
    if (column >= start && column <= end) return { text: m[0], start, end };
  }
  return null;
}

/** True if `column` (1-based) in `line` falls inside a string literal or `//` comment. */
function inStringOrComment(line: string, column: number): boolean {
  let inStr = false;
  for (let i = 0; i < column - 1 && i < line.length; i++) {
    const ch = line[i];
    if (inStr) {
      if (ch === '\\') i++;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === '/' && line[i + 1] === '/') return true;
  }
  return inStr;
}

interface CallContext {
  name: string;
  argIndex: number;
}

/** Finds the call the cursor is inside, by scanning back from the cursor through the text. */
export function findCall(text: string): CallContext | null {
  // Walk forward keeping a stack of open brackets; each "(" remembers the identifier before it and the commas seen.
  const stack: { ch: string; name: string; commas: number }[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') {
      i++;
      while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
      i++;
      continue;
    }
    if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    }
    if (ch === '(' || ch === '{' || ch === '[') {
      let name = '';
      if (ch === '(') {
        let j = i;
        while (j > 0 && /\s/.test(text[j - 1])) j--;
        const end = j;
        while (j > 0 && /[A-Za-z0-9_Ͱ-ϿÀ-ɏ→∏Σ]/.test(text[j - 1])) j--;
        name = text.slice(j, end);
      }
      stack.push({ ch, name, commas: 0 });
    } else if (ch === ')' || ch === '}' || ch === ']') {
      stack.pop();
    } else if (ch === ',' && stack.length) {
      stack[stack.length - 1].commas++;
    } else if (ch === ';' && stack.length) {
      // A statement end cannot occur inside an argument list; recover from unbalanced input.
      stack.length = 0;
    }
    i++;
  }
  for (let k = stack.length - 1; k >= 0; k--) {
    const f = stack[k];
    if (f.ch === '(' && f.name) return { name: f.name, argIndex: f.commas };
  }
  return null;
}

/** Splits a signature like `LOG(value, base)` into its name and parameter labels. */
export function parseSignature(sig: string): { params: string[] } {
  const open = sig.indexOf('(');
  const close = sig.lastIndexOf(')');
  if (open < 0 || close < open) return { params: [] };
  // `[G,] x` means an optional leading argument: treat it as its own parameter `[G]`.
  const inner = sig.slice(open + 1, close).replace(/\[(\w+),\]/g, '[$1],');
  // Split on top-level commas only (ignore those inside [] or {}).
  const params: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of inner) {
    if (ch === '[' || ch === '{' || ch === '(') depth++;
    if (ch === ']' || ch === '}' || ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      params.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) params.push(cur.trim());
  return { params };
}

/** Picks the signature best matching the number of arguments typed so far. */
function firmwareSignatureHelp(t: HelpTopic, sigs: string[], argIndex: number): Monaco.languages.SignatureHelpResult {
  const doc = t.subtitle ? `**${t.title}** — ${t.subtitle}` : `**${t.title}**`;
  const fits = sigs.findIndex((s) => (syntaxArity(s)?.max ?? 0) > argIndex);
  return {
    value: {
      signatures: sigs.map((label) => ({
        label,
        documentation: { value: doc + '\n\n*From the calculator\'s help.*' },
        parameters: syntaxParams(label).map((r) => ({ label: r })),
      })),
      activeSignature: fits >= 0 ? fits : sigs.length - 1,
      activeParameter: argIndex,
    },
    dispose() {},
  };
}

function bestSignature(cmd: Command, argIndex: number): number {
  const counts = cmd.signatures.map((s) => parseSignature(s).params.length);
  const exact = counts.findIndex((n) => n > argIndex);
  return exact >= 0 ? exact : counts.length - 1;
}

/**
 * The smallest single edit turning `before` into `after`, as offsets into `before`: the common
 * prefix and suffix are kept so the cursor, folding and undo stay put.
 */
export function minimalEdit(before: string, after: string): { start: number; end: number; text: string } | null {
  if (before === after) return null;
  let head = 0;
  const max = Math.min(before.length, after.length);
  while (head < max && before[head] === after[head]) head++;
  let tail = 0;
  while (tail < max - head && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail++;
  return { start: head, end: before.length - tail, text: after.slice(head, after.length - tail) };
}

export function registerPplProviders(monaco: typeof Monaco, languageId: string): void {
  monaco.languages.registerCompletionItemProvider(languageId, {
    triggerCharacters: ['_', '.'],
    provideCompletionItems(model, position, context) {
      // Inside #PYTHON … #END: Python completion instead.
      const py = pythonRegion(model, position);
      if (py) return pyCompletionItems(monaco, model, position, py);
      if (context.triggerCharacter === '.') return { suggestions: [] };
      const line = model.getLineContent(position.lineNumber);
      if (inStringOrComment(line, position.column)) return { suggestions: [] };
      const w = wordAt(line, position.column);
      const range: Monaco.IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: w ? w.start : position.column,
        endColumn: position.column,
      };
      const K = monaco.languages.CompletionItemKind;
      const suggestions: Monaco.languages.CompletionItem[] = [];

      for (const u of visibleAt(analysisFor(model), position.lineNumber)) {
        suggestions.push({
          label: u.name,
          kind: u.kind === 'procedure' ? K.Function : K.Variable,
          detail: u.detail,
          documentation: { value: symMarkdown(u) },
          insertText: u.kind === 'procedure' ? u.name + '(' : u.name,
          // Locals and parameters first, then the file's procedures and globals.
          sortText: (u.kind === 'procedure' || u.exported ? '01' : '00') + u.name,
          range,
        });
      }
      for (const cmd of COMMANDS) {
        const fw = helpFor(cmd.name);
        suggestions.push({
          label: cmd.name,
          kind: K.Function,
          detail: (fw && syntaxLines(fw)[0]) || cmd.signatures[0],
          documentation: { value: fw ? helpMarkdown(fw, languageId) : commandMarkdown(cmd) },
          insertText: cmd.maxArgs === 0 ? cmd.name : cmd.name + '(',
          sortText: '1' + cmd.name,
          range,
        });
      }
      // Commands documented only in the calculator's own help (when a firmware file is loaded).
      for (const t of helpCommands()) {
        if (lookupCommand(t.title) || KEYWORD_SET.has(t.title)) continue;
        const sig = syntaxLines(t)[0] ?? t.title;
        suggestions.push({
          label: t.title,
          kind: K.Function,
          detail: sig,
          documentation: { value: helpMarkdown(t, languageId) },
          insertText: sig.includes('(') ? t.title + '(' : t.title,
          // Lower-case names are CAS commands: after the PPL ones.
          sortText: (/^[a-z]/.test(t.title) ? '15' : '1') + t.title,
          range,
        });
      }
      for (const kw of KEYWORDS) {
        suggestions.push({
          label: kw,
          kind: K.Keyword,
          insertText: kw,
          sortText: '2' + kw,
          range,
        });
      }
      for (const s of SNIPPETS) {
        suggestions.push({
          label: s.label,
          kind: K.Snippet,
          detail: s.detail,
          insertText: s.body,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          sortText: '0' + s.label,
          range,
        });
      }
      return { suggestions };
    },
  });

  monaco.languages.registerHoverProvider(languageId, {
    provideHover(model, position) {
      const py = pythonRegion(model, position);
      if (py) return pyHover(model, position, py);
      const line = model.getLineContent(position.lineNumber);
      if (inStringOrComment(line, position.column)) return null;
      const w = wordAt(line, position.column);
      if (!w) return null;
      const range = new monaco.Range(position.lineNumber, w.start, position.lineNumber, w.end);
      const user = findSymbol(analysisFor(model), w.text, position.lineNumber);
      if (user) return { range, contents: [{ value: symMarkdown(user) }] };
      // The calculator's own help when loaded: exact name (lower case = the CAS command), or a keyword.
      const fw = helpFor(w.text) ?? (KEYWORD_SET.has(w.text.toUpperCase()) ? helpForKeyword(w.text) : undefined);
      if (fw) return { range, contents: [{ value: helpMarkdown(fw, languageId) }] };
      const cmd = lookupCommandAnyCase(w.text);
      if (!cmd) return null;
      const contents = [{ value: commandMarkdown(cmd) }];
      if (!lookupCommand(w.text)) {
        contents.push({
          value: `Written in lower case, this calls the **CAS** version on the calculator. Use \`${cmd.name}\` for the PPL command.`,
        });
      }
      return { range, contents };
    },
  });

  monaco.languages.registerSignatureHelpProvider(languageId, {
    signatureHelpTriggerCharacters: ['(', ','],
    signatureHelpRetriggerCharacters: [','],
    provideSignatureHelp(model, position) {
      const py = pythonRegion(model, position);
      if (py) return pySignatureHelp(model, py);
      // Limit the scan to a window before the cursor; calls do not span thousands of lines.
      const startLine = Math.max(1, position.lineNumber - 200);
      const text = model.getValueInRange({
        startLineNumber: startLine,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });
      const call = findCall(text);
      if (!call) return null;
      const user = findSymbol(analysisFor(model), call.name, position.lineNumber);
      if (user && user.kind === 'procedure') {
        return {
          value: {
            signatures: [
              {
                label: user.detail,
                documentation: { value: symMarkdown(user) },
                parameters: user.params.map((p) => ({ label: p })),
              },
            ],
            activeSignature: 0,
            activeParameter: call.argIndex,
          },
          dispose() {},
        };
      }
      const fw = helpFor(call.name);
      if (fw) {
        const sigs = syntaxLines(fw).filter((l) => l.startsWith(fw.title + '('));
        if (sigs.length) return firmwareSignatureHelp(fw, sigs, call.argIndex);
      }
      const cmd = lookupCommandAnyCase(call.name);
      if (!cmd) return null;
      const signatures = cmd.signatures.map((label) => ({
        label,
        documentation: { value: cmd.doc + `\n\n*${CATEGORY_LABELS[cmd.category]}*` },
        parameters: parseSignature(label).params.map((p) => ({ label: p })),
      }));
      const active = bestSignature(cmd, call.argIndex);
      return {
        value: {
          signatures,
          activeSignature: active,
          activeParameter: call.argIndex,
        },
        dispose() {},
      };
    },
  });

  const SK = monaco.languages.SymbolKind;
  const toDocSymbol = (sy: Sym): Monaco.languages.DocumentSymbol => ({
    name: sy.name,
    detail: sy.exported ? 'exported' : '',
    kind: sy.kind === 'procedure' ? SK.Function : sy.kind === 'parameter' ? SK.Field : SK.Variable,
    tags: [],
    range: new monaco.Range(sy.startLine, 1, sy.endLine, 1 << 20),
    selectionRange: new monaco.Range(sy.line, sy.col, sy.line, sy.col + sy.name.length),
    // Parameters are shown on the procedure's own line; the outline lists locals only.
    children: sy.children.filter((c) => c.kind === 'local').map(toDocSymbol),
  });

  monaco.languages.registerDocumentSymbolProvider(languageId, {
    displayName: 'PPL',
    provideDocumentSymbols(model) {
      const a = analysisFor(model);
      return [...a.globals, ...a.procedures].sort((x, y) => x.line - y.line).map(toDocSymbol);
    },
  });

  monaco.languages.registerDefinitionProvider(languageId, {
    provideDefinition(model, position) {
      const line = model.getLineContent(position.lineNumber);
      if (inStringOrComment(line, position.column)) return null;
      const w = wordAt(line, position.column);
      if (!w) return null;
      const target = findSymbol(analysisFor(model), w.text, position.lineNumber);
      if (!target) return null;
      return {
        uri: model.uri,
        range: new monaco.Range(target.line, target.col, target.line, target.col + target.name.length),
      };
    },
  });

  monaco.languages.registerFoldingRangeProvider(languageId, {
    provideFoldingRanges(model) {
      return analysisFor(model).folds.map((f) => ({ start: f.start, end: f.end }));
    },
  });

  monaco.languages.registerDocumentFormattingEditProvider(languageId, {
    displayName: 'PPL',
    provideDocumentFormattingEdits(model, options) {
      const indent = options.insertSpaces ? ' '.repeat(options.tabSize) : '\t';
      const before = model.getValue();
      const eol = model.getEOL();
      let after = formatPpl(before, { indent });
      if (eol !== '\n') after = after.replace(/\n/g, eol);
      const e = minimalEdit(before, after);
      if (!e) return [];
      const from = model.getPositionAt(e.start);
      const to = model.getPositionAt(e.end);
      return [{ range: new monaco.Range(from.lineNumber, from.column, to.lineNumber, to.column), text: e.text }];
    },
  });
}
