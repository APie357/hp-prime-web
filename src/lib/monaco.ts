/** Monaco bootstrap: core editor + contributions, one worker, PPL language. */
import * as monaco from 'monaco-editor/editor';
import './monaco-features';
// Python syntax for .py files inside app folders (loaded on first use).
import 'monaco-editor/languages/definitions/python/register';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import { KEYWORDS } from './lang/lexer';
import { COMMANDS } from './lang/catalog';
import { registerPplProviders } from './lang/providers';
import { registerPythonProviders } from './lang/pythonProviders';
import { registerDiagnostics } from './lang/diagnostics';

self.MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

export const PPL = 'hpppl';

monaco.languages.register({ id: PPL, extensions: ['.hpppl', '.ppl'], aliases: ['HP PPL', 'hpppl'] });

monaco.languages.setLanguageConfiguration(PPL, {
  comments: { lineComment: '//' },
  brackets: [
    ['(', ')'],
    ['[', ']'],
    ['{', '}'],
  ],
  autoClosingPairs: [
    { open: '(', close: ')' },
    { open: '[', close: ']' },
    { open: '{', close: '}' },
    { open: '"', close: '"', notIn: ['string', 'comment'] },
  ],
  surroundingPairs: [
    { open: '(', close: ')' },
    { open: '[', close: ']' },
    { open: '{', close: '}' },
    { open: '"', close: '"' },
  ],
  indentationRules: {
    increaseIndentPattern: /^\s*(BEGIN|REPEAT|CASE)\b|\b(THEN|DO|ELSE)\s*$/i,
    decreaseIndentPattern: /^\s*(END|UNTIL|ELSE|DEFAULT)\b/i,
  },
});

// Keywords are case-insensitive on the calculator; built-in commands are not (lower case calls the
// CAS version), so the tokenizer is case-sensitive and lists the common keyword spellings.
const keywordSpellings = KEYWORDS.flatMap((k) => [k, k.toLowerCase(), k[0] + k.slice(1).toLowerCase()]);
const builtins = COMMANDS.flatMap((c) => [c.name, ...(c.aliases ?? [])]);

monaco.languages.setMonarchTokensProvider(PPL, {
  ignoreCase: false,
  keywords: keywordSpellings,
  builtins,
  tokenizer: {
    root: [
      [/\/\/.*$/, 'comment'],
      // #PYTHON name() … #END: highlight the block as Python.
      [/#[Pp][Yy][Tt][Hh][Oo][Nn]\b.*$/, { token: 'keyword.directive', next: '@python', nextEmbedded: 'python' }],
      [/#([Pp][Rr][Aa][Gg][Mm][Aa]|[Cc][Aa][Ss]|[Ee][Nn][Dd]).*$/, 'keyword.directive'],
      [/"/, 'string', '@string'],
      [/#[0-9A-Fa-f]+[hbodHBOD]?(:\d+)?/, 'number.hex'],
      [/\d*\.?\d+([Eeᴇ][-+]?\d+)?/, 'number'],
      [/[A-Za-z_\u0370-\u03FF][\w\u0370-\u03FF]*/, { cases: { '@keywords': 'keyword', '@builtins': 'predefined', '@default': 'identifier' } }],
      [/:=|▶|→/, 'operator.assign'],
      [/[<>]=?|==|≠|≤|≥|<>|[-+*/^=]/, 'operator'],
      [/[()[\]{}]/, '@brackets'],
      [/[;,]/, 'delimiter'],
    ],
    python: [
      [/^\s*#[Ee][Nn][Dd]\b.*$/, { token: 'keyword.directive', next: '@pop', nextEmbedded: '@pop' }],
    ],
    string: [
      [/[^"\\]+/, 'string'],
      [/\\./, 'string.escape'],
      [/"/, 'string', '@pop'],
    ],
  },
});

registerPplProviders(monaco, PPL);
registerPythonProviders(monaco);
registerDiagnostics(monaco, PPL);

monaco.editor.defineTheme('prime-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'keyword', foreground: 'C586C0', fontStyle: 'bold' },
    { token: 'keyword.directive', foreground: '9CDCFE' },
    { token: 'operator.assign', foreground: 'D7BA7D' },
    { token: 'number.hex', foreground: 'B5CEA8' },
    { token: 'predefined', foreground: 'DCDCAA' },
  ],
  colors: {},
});

monaco.editor.defineTheme('prime-light', {
  base: 'vs',
  inherit: true,
  rules: [
    { token: 'keyword', foreground: 'AF00DB', fontStyle: 'bold' },
    { token: 'keyword.directive', foreground: '0070C1' },
    { token: 'operator.assign', foreground: '9A6700' },
    { token: 'number.hex', foreground: '098658' },
    { token: 'predefined', foreground: '795E26' },
  ],
  colors: {},
});

export const monacoTheme = (t: 'light' | 'dark') => (t === 'light' ? 'prime-light' : 'prime-dark');

export { monaco };
