import { describe, expect, it } from 'vitest';
import { formatPpl } from '../src/lib/lang/format';

const fmt = (s: string) => formatPpl(s, { indent: '  ' });

describe('formatPpl', () => {
  it('indents nested blocks', () => {
    const src = [
      'export test(n)',
      'begin',
      'local i;',
      'for i from 1 to n do',
      'if i mod 2 == 0 then',
      'PRINT(i);',
      'else',
      'PRINT(-i);',
      'end;',
      'end;',
      'repeat',
      'n:=n-1;',
      'until n<=0;',
      'end;',
    ].join('\n');
    expect(fmt(src)).toBe(
      [
        'EXPORT test(n)',
        'BEGIN',
        '  LOCAL i;',
        '  FOR i FROM 1 TO n DO',
        '    IF i MOD 2 == 0 THEN',
        '      PRINT(i);',
        '    ELSE',
        '      PRINT(-i);',
        '    END;',
        '  END;',
        '  REPEAT',
        '    n:=n-1;',
        '  UNTIL n<=0;',
        'END;',
        '',
      ].join('\n'),
    );
  });

  it('handles CASE and one-line blocks', () => {
    const src = 'BEGIN\nCASE\nIF x==1 THEN A:=1; END;\nDEFAULT A:=0;\nEND;\nEND;';
    expect(fmt(src)).toBe('BEGIN\n  CASE\n    IF x==1 THEN A:=1; END;\n    DEFAULT A:=0;\n  END;\nEND;\n');
  });

  it('leaves strings, comments and command case alone', () => {
    const src = 'BEGIN\n// begin end if\nPRINT("if then end   ");\nsin(x);\nEND;';
    expect(fmt(src)).toBe('BEGIN\n  // begin end if\n  PRINT("if then end   ");\n  sin(x);\nEND;\n');
  });

  it('keeps multi-line strings and #cas blocks verbatim', () => {
    const src = 'BEGIN\nMSGBOX("a\n   b  \nc");\nEND;\n#cas\n  f(x):= begin\n return x; end;\n#end';
    expect(fmt(src)).toBe('BEGIN\n  MSGBOX("a\n   b  \nc");\nEND;\n#cas\n  f(x):= begin\n return x; end;\n#end\n');
  });

  it('indents continuation lines inside brackets', () => {
    const src = 'BEGIN\nL:={1,\n2,\n3};\nEND;';
    expect(fmt(src)).toBe('BEGIN\n  L:={1,\n    2,\n    3};\nEND;\n');
  });

  it('trims trailing whitespace and collapses blank lines', () => {
    expect(fmt('\n\nBEGIN   \n\n\n\nX:=1;\t\nEND;\n\n\n')).toBe('BEGIN\n\n  X:=1;\nEND;\n');
  });

  it('is idempotent', () => {
    const src = 'EXPORT A()\nBEGIN\nWHILE 1 DO\nIFERR X:=1; THEN Y:=2; END;\nEND;\nEND;';
    const once = fmt(src);
    expect(fmt(once)).toBe(once);
  });

  it('can use tabs and keep keyword case', () => {
    expect(formatPpl('begin\nx:=1;\nend;', { indent: '\t', upperKeywords: false })).toBe('begin\n\tx:=1;\nend;\n');
  });
});
