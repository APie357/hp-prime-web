/**
 * Conservative PPL formatter: re-indents by block structure, upper-cases keywords and trims trailing
 * whitespace. It never changes the contents of strings or comments, never changes the case of
 * commands (lower case selects the CAS version), and leaves `#cas … #end` blocks and the continuation
 * lines of multi-line strings untouched.
 */
import { lex, type Token } from './lexer';

export interface FormatOptions {
  /** Indent unit, e.g. two spaces or a tab. */
  indent: string;
  /** Upper-case PPL keywords (default true). */
  upperKeywords?: boolean;
}

// Same block model as the analyzer (symbols.ts / diagnostics.ts).
const OPENERS = new Set(['BEGIN', 'IF', 'FOR', 'WHILE', 'REPEAT', 'CASE', 'IFERR']);
const CLOSERS = new Set(['END', 'UNTIL']);
/** Words that sit at their block's outer level when they start a line. */
const MID = new Set(['ELSE', 'THEN', 'DO']);

export function formatPpl(input: string, opts: FormatOptions): string {
  const upper = opts.upperKeywords ?? true;
  const src = input.replace(/\r\n?/g, '\n');
  const lines = src.split('\n');
  const toks = lex(src);

  // Lines copied verbatim: inside #cas … #end, or continuing a multi-line string.
  const verbatim = new Set<number>();
  let casStart = 0;
  for (const t of toks) {
    if (t.type === 'pragma') {
      // A #PYTHON block (one token, see lexer.ts) is copied as is: indentation is Python syntax.
      if (/^#python\b/i.test(t.text)) {
        const n = t.text.split('\n').length - 1;
        for (let l = t.line; l <= t.line + n; l++) verbatim.add(l);
      } else if (/^#cas\b/i.test(t.text)) casStart = t.line;
      else if (/^#end\b/i.test(t.text) && casStart) {
        for (let l = casStart + 1; l < t.line; l++) verbatim.add(l);
        casStart = 0;
      }
    } else if (t.type === 'str') {
      const extra = t.text.split('\n').length - 1;
      for (let l = t.line + 1; l <= t.line + extra; l++) verbatim.add(l);
    }
  }
  if (casStart) for (let l = casStart + 1; l <= lines.length; l++) verbatim.add(l);

  const lineOffsets: number[] = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') lineOffsets.push(i + 1);

  const byLine = new Map<number, Token[]>();
  for (const t of toks) {
    let arr = byLine.get(t.line);
    if (!arr) byLine.set(t.line, (arr = []));
    arr.push(t);
  }

  let depth = 0; // open blocks
  let parens = 0; // open (, [ and { carried over from earlier lines
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const lineToks = byLine.get(lineNo) ?? [];
    if (verbatim.has(lineNo)) {
      out.push(lines[i]);
    } else if (!lines[i].trim()) {
      out.push('');
    } else {
      let text = lines[i];
      if (upper) {
        // Right to left so earlier offsets stay valid.
        for (let k = lineToks.length - 1; k >= 0; k--) {
          const t = lineToks[k];
          if (t.type !== 'kw' || t.text === t.upper) continue;
          const a = t.start - lineOffsets[i];
          text = text.slice(0, a) + t.upper + text.slice(a + t.text.length);
        }
      }
      const first = lineToks[0];
      let level = depth + (parens > 0 ? 1 : 0);
      if (first?.type === 'kw' && (CLOSERS.has(first.upper) || MID.has(first.upper))) level = Math.max(0, depth - 1);
      else if (first?.type === 'op' && /^[)\]}]$/.test(first.text)) level = depth;
      out.push(opts.indent.repeat(level) + text.trim());
    }

    // Tokens on verbatim lines still count toward the block structure.
    for (const t of lineToks) {
      if (t.type === 'kw') {
        if (OPENERS.has(t.upper)) depth++;
        else if (CLOSERS.has(t.upper)) depth = Math.max(0, depth - 1);
      } else if (t.type === 'op') {
        if (t.text === '(' || t.text === '[' || t.text === '{') parens++;
        else if (t.text === ')' || t.text === ']' || t.text === '}') parens = Math.max(0, parens - 1);
        else if (t.text === ';') parens = 0; // recover from unbalanced brackets at statement ends
      }
    }
  }

  // Collapse runs of blank lines to one, drop leading blank lines, end with exactly one newline.
  return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\n*$/, '\n');
}
