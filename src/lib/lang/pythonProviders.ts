/**
 * Monaco providers for Python: `.py` files and `#PYTHON … #END` blocks inside PPL programs.
 * The logic lives in python.ts; this file adapts it to Monaco.
 */
import type * as Monaco from 'monaco-editor/editor';
import {
  findPyCall,
  pySigParams,
  pythonBlockAt,
  pythonCompletions,
  resolvePython,
  type LocalModules,
  type PyItemKind,
} from './python';

/** Finds the other Python modules importable from a file (its app's `.py` files). Set by the app. */
let localModulesFor: (path: string) => Promise<LocalModules> = async () => new Map();
export function setLocalModuleSource(fn: (path: string) => Promise<LocalModules>): void {
  localModulesFor = fn;
}

export interface PyRegion {
  /** The Python source: the whole file, or one block's body. */
  src: string;
  /** Cursor offset within `src`. */
  offset: number;
  /** Model offset where `src` starts. */
  base: number;
}

/** The Python code around `position`, or null when the position isn't in Python. */
export function pythonRegion(model: Monaco.editor.ITextModel, position: Monaco.IPosition): PyRegion | null {
  const text = model.getValue();
  const offset = model.getOffsetAt(position);
  if (model.getLanguageId() === 'python') return { src: text, offset, base: 0 };
  const block = pythonBlockAt(text, offset);
  return block ? { src: text.slice(block.start, block.end), offset: offset - block.start, base: block.start } : null;
}

const modelPath = (model: Monaco.editor.ITextModel) => decodeURIComponent(model.uri.path).replace(/^\//, '');

function kindOf(monaco: typeof Monaco, k: PyItemKind): Monaco.languages.CompletionItemKind {
  const K = monaco.languages.CompletionItemKind;
  return { module: K.Module, function: K.Function, class: K.Class, constant: K.Constant, variable: K.Variable, keyword: K.Keyword, method: K.Method }[k];
}

export async function pyCompletionItems(
  monaco: typeof Monaco,
  model: Monaco.editor.ITextModel,
  position: Monaco.Position,
  region: PyRegion,
): Promise<Monaco.languages.CompletionList> {
  const local = await localModulesFor(modelPath(model));
  const { items, prefix } = pythonCompletions(region.src, region.offset, local);
  const range = new monaco.Range(position.lineNumber, position.column - prefix.length, position.lineNumber, position.column);
  return {
    suggestions: items.map((it, i) => ({
      label: it.label,
      kind: kindOf(monaco, it.kind),
      detail: it.detail,
      documentation: it.doc ? { value: it.doc } : undefined,
      insertText: it.label,
      range,
      // Keep the table's order: definitions and imports before builtins and keywords.
      sortText: String(i).padStart(5, '0'),
    })),
  };
}

/** `a.b` (or `b`) under the cursor, with its range. */
function dottedWordAt(model: Monaco.editor.ITextModel, position: Monaco.Position) {
  const line = model.getLineContent(position.lineNumber);
  const re = /[A-Za-z_][\w]*(?:\.[A-Za-z_]\w*)*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    const start = m.index + 1;
    const end = start + m[0].length;
    if (position.column >= start && position.column <= end) {
      // Only up to the hovered part: in `h.line.x`, hovering `line` gives `h.line`.
      const upto = m[0].slice(0, position.column - start);
      const rest = /^\w*/.exec(m[0].slice(position.column - start))![0];
      const expr = upto + rest;
      return { expr, start, end: start + expr.length };
    }
  }
  return null;
}

export async function pyHover(
  model: Monaco.editor.ITextModel,
  position: Monaco.Position,
  region: PyRegion,
): Promise<Monaco.languages.Hover | null> {
  const w = dottedWordAt(model, position);
  if (!w) return null;
  const local = await localModulesFor(modelPath(model));
  const it = resolvePython(region.src, w.expr, local);
  if (!it?.doc) return null;
  return {
    range: { startLineNumber: position.lineNumber, startColumn: w.start, endLineNumber: position.lineNumber, endColumn: w.end },
    contents: [{ value: it.doc }],
  };
}

export async function pySignatureHelp(
  model: Monaco.editor.ITextModel,
  region: PyRegion,
): Promise<Monaco.languages.SignatureHelpResult | null> {
  const call = findPyCall(region.src.slice(0, region.offset));
  if (!call) return null;
  const local = await localModulesFor(modelPath(model));
  const it = resolvePython(region.src, call.callee, local);
  const sig = it?.detail && /\(.*\)$/.exec(it.detail)?.[0];
  if (!it || !sig) return null;
  const params = pySigParams(sig);
  const label = it.detail!;
  const open = label.indexOf('(') + 1;
  // Parameter label ranges inside `label`.
  let pos = open;
  const parameters = params.map((p) => {
    const at = label.indexOf(p, pos);
    pos = at + p.length;
    return { label: [at, at + p.length] as [number, number] };
  });
  const variadic = params.some((p) => p.startsWith('*') || p.includes('…'));
  return {
    value: {
      signatures: [{ label, parameters, documentation: it.doc ? { value: it.doc } : undefined }],
      activeSignature: 0,
      activeParameter: Math.min(call.arg, Math.max(0, params.length - 1)) + (variadic ? 0 : 0),
    },
    dispose() {},
  };
}

/** Completion, hover and signature help for `.py` files. */
export function registerPythonProviders(monaco: typeof Monaco): void {
  monaco.languages.registerCompletionItemProvider('python', {
    triggerCharacters: ['.', ' '],
    provideCompletionItems: (model, position) => pyCompletionItems(monaco, model, position, pythonRegion(model, position)!),
  });
  monaco.languages.registerHoverProvider('python', {
    provideHover: (model, position) => pyHover(model, position, pythonRegion(model, position)!),
  });
  monaco.languages.registerSignatureHelpProvider('python', {
    signatureHelpTriggerCharacters: ['(', ','],
    signatureHelpRetriggerCharacters: [','],
    provideSignatureHelp: (model, position) => pySignatureHelp(model, pythonRegion(model, position)!),
  });
}
