import { describe, expect, it } from 'vitest';
import { lint } from '../src/lib/lang/diagnostics';

const codes = (src: string) => lint(src).map((d) => d.code);

const GOOD = `#pragma mode( separator(.,;) integer(h32) )
EXPORT DEMO(n)
BEGIN
  LOCAL i, total := 0;
  FOR i FROM 1 TO n DO
    IF i MOD 2 == 0 THEN
      total := total + i;
    END;
  END;
  REPEAT
    total := total - 1;
  UNTIL total < 10;
  A := 5;
  PRINT(total);
  RETURN total
END;
`;

describe('linter', () => {
  it('accepts a well-formed program', () => {
    // GOOD has a separator pragma, so argument counting is skipped; everything else must be clean.
    expect(lint(GOOD)).toEqual([]);
  });

  it('reports unbalanced blocks', () => {
    expect(codes('EXPORT F()\nBEGIN\n  IF 1 THEN\n  PRINT(1);\nEND;\n')).toEqual(['unclosed-block']);
    expect(codes('END;')).toEqual(['stray-end']);
    expect(codes('EXPORT F()\nBEGIN\n  REPEAT\n  PRINT(1);\nEND;\n')).toEqual(['unclosed-block', 'repeat-end']);
    expect(codes('EXPORT F()\nBEGIN\n  UNTIL 1;\nEND;\n')).toEqual(['stray-until']);
  });

  it('reports unbalanced brackets and strings', () => {
    expect(codes('EXPORT F()\nBEGIN\n  PRINT((1);\nEND;\n')).toContain('unclosed-bracket');
    expect(codes('EXPORT F()\nBEGIN\n  PRINT(1));\nEND;\n')).toContain('unmatched-bracket');
    expect(codes('EXPORT F()\nBEGIN\n  PRINT("abc);\nEND;\n')).toContain('unterminated-string');
  });

  it('reports a missing semicolon on the previous line', () => {
    const src = 'EXPORT F()\nBEGIN\n  LOCAL x;\n  x := 1\n  PRINT(x);\nEND;\n';
    const d = lint(src).filter((x) => x.code === 'missing-semicolon');
    expect(d).toHaveLength(1);
    expect(d[0].line).toBe(4);
    // The last statement before END may omit its semicolon.
    expect(codes('EXPORT F()\nBEGIN\n  RETURN 1\nEND;\n')).toEqual([]);
    // A continued expression is not a new statement.
    expect(codes('EXPORT F()\nBEGIN\n  LOCAL x;\n  x := 1\n    + 2;\nEND;\n')).toEqual([]);
    // END always needs a semicolon: at the end of the file, before another END, before the next definition.
    expect(codes('EXPORT F()\nBEGIN\nEND')).toEqual(['missing-semicolon']);
    expect(codes('EXPORT F()\nBEGIN\n  IF 1 THEN\n    PRINT(1);\n  END\nEND;\n')).toEqual(['missing-semicolon']);
    // END needs a semicolon before the next definition.
    expect(codes('A()\nBEGIN\nEND\nB()\nBEGIN\nEND;\n')).toEqual(['missing-semicolon']);
  });

  it('flags = used as assignment, but not as comparison', () => {
    expect(codes('EXPORT F()\nBEGIN\n  LOCAL x;\n  x = 1;\nEND;\n')).toEqual(['assign-equals']);
    expect(codes('EXPORT F()\nBEGIN\n  LOCAL x;\n  IF x = 1 THEN x := 2; END;\nEND;\n')).toEqual([]);
  });

  it('flags assignment to undeclared variables once per procedure', () => {
    const src = 'EXPORT F()\nBEGIN\n  total := 1;\n  total := 2;\n  A := 3;\n  7 ▶ count;\nEND;\n';
    const d = lint(src).filter((x) => x.code === 'undeclared-assignment');
    expect(d.map((x) => x.message.split("'")[1])).toEqual(['total', 'count']);
    // Declared names, parameters and file-level variables are fine.
    expect(codes('LOCAL g;\nEXPORT F(p)\nBEGIN\n  LOCAL q;\n  g := 1; p := 2; q := 3;\nEND;\n')).toEqual([]);
  });

  it('checks built-in argument counts', () => {
    const wrap = (stmt: string) => `EXPORT F()\nBEGIN\n  ${stmt}\nEND;\n`;
    expect(codes(wrap('PRINT(ABS(1, 2));'))).toEqual(['arg-count']);
    expect(codes(wrap('PRINT(LOG(1, 2, 3));'))).toEqual(['arg-count']);
    expect(codes(wrap('PRINT(MAX(1, 2, 3, 4));'))).toEqual([]);
    expect(codes(wrap('PRINT(MAX({1, 2}, 3));'))).toEqual([]);
    expect(codes(wrap('PRINT(GETKEY());'))).toEqual([]);
    expect(codes(wrap('PRINT(ABS());'))).toEqual(['arg-count']);
    // A user procedure with a command's name wins.
    expect(codes('ABS(a, b)\nBEGIN\n  RETURN a;\nEND;\nEXPORT F()\nBEGIN\n  PRINT(ABS(1, 2));\nEND;\n')).toEqual([]);
  });

  it('hints about lower-case commands', () => {
    const d = lint('EXPORT F()\nBEGIN\n  PRINT(abs(1));\nEND;\n');
    expect(d.map((x) => [x.code, x.severity])).toEqual([['lowercase-command', 'info']]);
  });

  it('flags duplicate declarations', () => {
    expect(codes('EXPORT F(a)\nBEGIN\n  LOCAL a;\nEND;\n')).toEqual(['duplicate-declaration']);
    expect(codes('F()\nBEGIN\nEND;\nF()\nBEGIN\nEND;\n')).toEqual(['duplicate-procedure']);
  });
});
