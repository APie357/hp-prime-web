import { describe, expect, it } from 'vitest';
import { analyze, findSymbol, procedureAt, visibleAt } from '../src/lib/lang/symbols';

const SRC = `#pragma mode( separator(.,;) integer(h32) )
LOCAL scale := 2, offset;
EXPORT LIMIT := 10;

helper(a, b)
BEGIN
  LOCAL t := MAX(a, b), u;
  RETURN t * scale;
END;

EXPORT MAIN(n)
BEGIN
  LOCAL total, i;
  FOR k FROM 1 TO n DO
    IF k > 2 THEN
      total := total + helper(k, 1);
    ELSE
      total := total - 1;
    END;
  END;
  REPEAT
    i := i + 1;
  UNTIL i > 3;
  RETURN total;
END;
`;

describe('symbol scanner', () => {
  const a = analyze(SRC);

  it('finds procedures with parameters and export flags', () => {
    expect(a.procedures.map((p) => p.name)).toEqual(['helper', 'MAIN']);
    expect(a.procedures[0].params).toEqual(['a', 'b']);
    expect(a.procedures[0].exported).toBe(false);
    expect(a.procedures[1].exported).toBe(true);
    expect(a.procedures[1].detail).toBe('EXPORT MAIN(n)');
  });

  it('finds file-level variables', () => {
    expect(a.globals.map((g) => [g.name, g.exported])).toEqual([
      ['scale', false],
      ['offset', false],
      ['LIMIT', true],
    ]);
  });

  it('finds locals and loop variables, skipping initializers', () => {
    const helper = a.procedures[0];
    expect(helper.children.map((c) => c.name)).toEqual(['a', 'b', 't', 'u']);
    const main = a.procedures[1];
    expect(main.children.map((c) => [c.name, c.kind])).toEqual([
      ['n', 'parameter'],
      ['total', 'local'],
      ['i', 'local'],
      ['k', 'local'],
    ]);
  });

  it('records procedure line ranges', () => {
    expect([a.procedures[0].startLine, a.procedures[0].endLine]).toEqual([5, 9]);
    expect([a.procedures[1].startLine, a.procedures[1].endLine]).toEqual([11, 25]);
  });

  it('resolves names by scope', () => {
    expect(procedureAt(a, 7)?.name).toBe('helper');
    expect(findSymbol(a, 't', 8)?.kind).toBe('local');
    expect(findSymbol(a, 't', 14)).toBeUndefined(); // helper's local, not visible in MAIN
    expect(findSymbol(a, 'helper', 16)?.kind).toBe('procedure');
    expect(findSymbol(a, 'scale', 8)?.kind).toBe('variable');
    expect(visibleAt(a, 7).map((s) => s.name)).toContain('b');
  });

  it('produces folding ranges that leave the closing END visible', () => {
    const f = a.folds.map((x) => [x.start, x.end]);
    expect(f).toContainEqual([5, 8]); // helper
    expect(f).toContainEqual([11, 24]); // MAIN
    expect(f).toContainEqual([14, 19]); // FOR
    expect(f).toContainEqual([15, 18]); // IF..ELSE..END
    expect(f).toContainEqual([21, 22]); // REPEAT..UNTIL
  });

  it('copes with unfinished code', () => {
    const b = analyze('EXPORT FOO(x)\nBEGIN\n  LOCAL y;\n  IF x THEN\n');
    expect(b.procedures[0].name).toBe('FOO');
    expect(b.procedures[0].children.map((c) => c.name)).toEqual(['x', 'y']);
    expect(b.folds).toEqual([]);
    expect(analyze('END; END;').procedures).toEqual([]);
  });
});
