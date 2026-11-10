import { describe, expect, it } from 'vitest';
import {
  COMMANDS,
  CATEGORY_LABELS,
  acceptsArgCount,
  arityText,
  commandMarkdown,
  lookupCommand,
  lookupCommandAnyCase,
} from '../src/lib/lang/catalog';

describe('command catalog', () => {
  it('has unique names and aliases', () => {
    const seen = new Set<string>();
    for (const c of COMMANDS) {
      for (const n of [c.name, ...(c.aliases ?? [])]) {
        expect(seen.has(n), `duplicate ${n}`).toBe(false);
        seen.add(n);
      }
    }
  });

  it('is well-formed', () => {
    for (const c of COMMANDS) {
      expect(c.category in CATEGORY_LABELS, c.name).toBe(true);
      expect(c.minArgs <= c.maxArgs, c.name).toBe(true);
      expect(c.doc.length, c.name).toBeGreaterThan(10);
      expect(c.signatures.length, c.name).toBeGreaterThan(0);
      for (const s of c.signatures) expect(s.startsWith(c.name), `${c.name}: ${s}`).toBe(true);
    }
  });

  it('looks up names, aliases and case variants', () => {
    expect(lookupCommand('TEXTOUT_P')?.name).toBe('TEXTOUT_P');
    expect(lookupCommand('√')?.name).toBe('SQRT');
    expect(lookupCommand('sqrt')).toBeUndefined();
    expect(lookupCommandAnyCase('sqrt')?.name).toBe('SQRT');
  });

  it('checks arities', () => {
    const max = lookupCommand('MAX')!;
    expect(acceptsArgCount(max, 5)).toBe(true);
    expect(acceptsArgCount(max, 0)).toBe(false);
    expect(arityText(max)).toBe('1 or more');
    expect(arityText(lookupCommand('LOG')!)).toBe('1-2');
    expect(arityText(lookupCommand('ABS')!)).toBe('1');
  });

  it('renders hover markdown', () => {
    expect(commandMarkdown(lookupCommand('LOG')!)).toContain('`LOG(value, base)`');
  });
});
