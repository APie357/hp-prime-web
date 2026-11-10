/** A small, forgiving PPL lexer used by the analyzer (not by highlighting). */

export type TokType = 'ident' | 'kw' | 'num' | 'str' | 'op' | 'comment' | 'pragma';

export interface Token {
  type: TokType;
  /** Source text. */
  text: string;
  /** Upper-cased text for identifiers/keywords. */
  upper: string;
  /** Offset into the source. */
  start: number;
  end: number;
  line: number; // 1-based
  col: number; // 1-based
}

/** PPL reserved words. The firmware accepts any letter case for these. */
export const KEYWORDS = [
  'BEGIN', 'END', 'IF', 'THEN', 'ELSE', 'CASE', 'DEFAULT', 'FOR', 'FROM', 'TO', 'DOWNTO', 'STEP',
  'DO', 'WHILE', 'REPEAT', 'UNTIL', 'BREAK', 'CONTINUE', 'RETURN', 'LOCAL', 'EXPORT', 'KILL',
  'IFERR', 'AND', 'OR', 'NOT', 'XOR', 'MOD', 'VIEW', 'KEY',
];
export const KEYWORD_SET = new Set(KEYWORDS);

// Identifier characters: ASCII letters/digits/_ plus Greek and a few Prime symbols.
const ID_START = /[A-Za-z_Ͱ-ϿÀ-ɏ]/;
const ID_PART = /[A-Za-z0-9_Ͱ-ϿÀ-ɏ]/;
// Multi-char operators first.
const OPS = [':=', '==', '<=', '>=', '<>', '≠', '≤', '≥', '▶', '→', '(', ')', '[', ']', '{', '}', ',', ';', '+', '-', '*', '/', '^', '<', '>', '=', ':', '.', '|', '√', '∫', 'Σ', '∏', 'Δ', '%', '!', '\'', '&', '@'];

export function lex(src: string): Token[] {
  const toks: Token[] = [];
  let i = 0;
  let line = 1;
  let lineStart = 0;
  const push = (type: TokType, start: number, end: number) => {
    const text = src.slice(start, end);
    toks.push({ type, text, upper: text.toUpperCase(), start, end, line, col: start - lineStart + 1 });
  };
  while (i < src.length) {
    const c = src[i];
    if (c === '\n') {
      i++;
      line++;
      lineStart = i;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\r' || c === ' ') {
      i++;
      continue;
    }
    // Line comment
    if (c === '/' && src[i + 1] === '/') {
      const s = i;
      while (i < src.length && src[i] !== '\n') i++;
      push('comment', s, i);
      continue;
    }
    // #pragma / #cas directives
    if (c === '#' && /^#(pragma|cas|end)/i.test(src.slice(i, i + 7))) {
      const s = i;
      while (i < src.length && src[i] !== '\n') i++;
      push('pragma', s, i);
      continue;
    }
    // String (no escapes beyond \" in PPL; be forgiving). May span lines.
    if (c === '"') {
      const s = i;
      i++;
      const startLine = line;
      const startCol = s - lineStart + 1;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\\' && i + 1 < src.length) i++;
        if (src[i] === '\n') {
          line++;
          lineStart = i + 1;
        }
        i++;
      }
      i = Math.min(i + 1, src.length);
      const text = src.slice(s, i);
      toks.push({ type: 'str', text, upper: text, start: s, end: i, line: startLine, col: startCol });
      continue;
    }
    // Based integers: #1Fh, #1010b, #17o, #99d
    if (c === '#' && /[0-9A-Fa-f]/.test(src[i + 1] ?? '')) {
      const s = i;
      i++;
      while (i < src.length && /[0-9A-Fa-f]/.test(src[i])) i++;
      if (/[hbodHBOD]/.test(src[i] ?? '')) i++;
      if (src[i] === ':') {
        // optional bit-width suffix  #FFh:16
        i++;
        while (/[0-9]/.test(src[i] ?? '')) i++;
      }
      push('num', s, i);
      continue;
    }
    // Decimal numbers, with E/ᴇ exponent
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      const s = i;
      while (/[0-9]/.test(src[i] ?? '')) i++;
      if (src[i] === '.') {
        i++;
        while (/[0-9]/.test(src[i] ?? '')) i++;
      }
      if (/[Eeᴇ]/.test(src[i] ?? '') && /[-+0-9]/.test(src[i + 1] ?? '')) {
        i++;
        if (src[i] === '-' || src[i] === '+') i++;
        while (/[0-9]/.test(src[i] ?? '')) i++;
      }
      push('num', s, i);
      continue;
    }
    if (ID_START.test(c)) {
      const s = i;
      i++;
      while (i < src.length && ID_PART.test(src[i])) i++;
      // Dotted names like CAS.diff or App.Function
      while (src[i] === '.' && ID_START.test(src[i + 1] ?? '')) {
        i++;
        while (i < src.length && ID_PART.test(src[i])) i++;
      }
      const text = src.slice(s, i);
      push(KEYWORD_SET.has(text.toUpperCase()) ? 'kw' : 'ident', s, i);
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    const len = op ? op.length : 1;
    push('op', i, i + len);
    i += len;
  }
  return toks;
}
