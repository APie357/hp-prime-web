import { describe, expect, it } from 'vitest';
import { ICON_BODY, fileIcon } from '../src/lib/icons';

describe('Material icons', () => {
  it('bundles every icon named in the glob as path markup', () => {
    expect(Object.keys(ICON_BODY)).toHaveLength(39);
    for (const [name, body] of Object.entries(ICON_BODY)) {
      expect(body, name).toMatch(/^<path d="[Mm]/);
      expect(body, name).not.toContain('<svg');
    }
  });

  it('maps every file type to a bundled icon', () => {
    for (const t of ['program', 'app-program', 'note', 'app-note', 'text', 'binary']) {
      expect(ICON_BODY[fileIcon(t)], t).toBeTruthy();
    }
  });
});
