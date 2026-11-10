/** Monaco bootstrap: core editor + contributions, one worker, minimal PPL language. */
import * as monaco from 'monaco-editor/editor';
import 'monaco-editor/features/register.all';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import { KEYWORDS } from './lang/lexer';

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

// Minimal highlighting; richer language support (completion, hover, lint) comes later.
monaco.languages.setMonarchTokensProvider(PPL, {
  ignoreCase: true,
  keywords: KEYWORDS,
  tokenizer: {
    root: [
      [/\/\/.*$/, 'comment'],
      [/#(pragma|cas|end).*$/i, 'keyword.directive'],
      [/"/, 'string', '@string'],
      [/#[0-9A-Fa-f]+[hbodHBOD]?(:\d+)?/, 'number.hex'],
      [/\d*\.?\d+([Eeᴇ][-+]?\d+)?/, 'number'],
      [/[A-Za-z_\u0370-\u03FF][\w\u0370-\u03FF]*/, { cases: { '@keywords': 'keyword', '@default': 'identifier' } }],
      [/:=|▶|→/, 'operator.assign'],
      [/[<>]=?|==|≠|≤|≥|<>|[-+*/^=]/, 'operator'],
      [/[()[\]{}]/, '@brackets'],
      [/[;,]/, 'delimiter'],
    ],
    string: [
      [/[^"\\]+/, 'string'],
      [/\\./, 'string.escape'],
      [/"/, 'string', '@pop'],
    ],
  },
});

monaco.editor.defineTheme('prime-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'keyword', foreground: 'C586C0', fontStyle: 'bold' },
    { token: 'keyword.directive', foreground: '9CDCFE' },
    { token: 'operator.assign', foreground: 'D7BA7D' },
    { token: 'number.hex', foreground: 'B5CEA8' },
  ],
  colors: {},
});

export { monaco };
