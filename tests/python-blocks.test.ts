import { describe, expect, it } from 'vitest';
import { lex } from '../src/lib/lang/lexer';
import { lint } from '../src/lib/lang/diagnostics';
import { formatPpl } from '../src/lib/lang/format';
import { analyze } from '../src/lib/lang/symbols';

const APP = `#PYTHON START()
# Runs when the app starts.
import game
def f(x):
    if x == 1: return "a"
    return x*2
game.run()
#END

#PYTHON RESET()
import game
game.reset()
#END
EXPORT Helper()
BEGIN
  RETURN 1;
END;
`;

describe('#PYTHON blocks in PPL', () => {
  it('lex as one directive token per block', () => {
    const blocks = lex(APP).filter((t) => t.type === 'pragma');
    expect(blocks.map((t) => [t.line, t.text.split('\n').length])).toEqual([
      [1, 8],
      [10, 4],
    ]);
    expect(blocks[0].text.endsWith('#END')).toBe(true);
    expect(lex(APP).find((t) => t.text === 'EXPORT')?.line).toBe(14);
  });

  it('are not linted as PPL', () => {
    expect(lint(APP).filter((d) => d.severity === 'error' || d.severity === 'warning')).toEqual([]);
  });

  it('are kept verbatim by the formatter (Python indentation matters)', () => {
    const out = formatPpl(APP.replace('RETURN 1;', 'return 1;'), { indent: '  ', upperKeywords: true });
    expect(out.split('#END')[0]).toBe(APP.split('#END')[0]);
    expect(out).toContain('    if x == 1: return "a"');
    expect(out).toContain('  RETURN 1;');
  });

  it("don't hide the PPL procedures after them", () => {
    expect(analyze(APP).procedures.map((s) => s.name)).toEqual(['Helper']);
  });

  it('run to the end of the text when #END is missing', () => {
    const t = lex('#PYTHON START()\nprint(1)\n').filter((x) => x.type === 'pragma');
    expect(t).toHaveLength(1);
  });
});
