import { afterEach, describe, expect, it } from 'vitest';
import {
  extractHelp,
  firmwareAccepts,
  helpArity,
  helpBodyMarkdown,
  helpCommands,
  helpFor,
  helpForKeyword,
  helpLanguages,
  helpMarkdown,
  setHelpDb,
  syntaxArity,
  syntaxLines,
  syntaxParams,
  type HelpTopic,
} from '../src/lib/lang/firmwareHelp';

// ---- a tiny firmware image in the same layout (text written for the test, not HP's) ----

type Tree = number | [Tree, Tree];

/** A prefix code over the symbols (balanced tree; any prefix code is valid). */
function buildTree(syms: number[]): Tree {
  if (syms.length === 1) return syms[0];
  const mid = syms.length >> 1;
  return [buildTree(syms.slice(0, mid)), buildTree(syms.slice(mid))];
}

function serializeTree(t: Tree): number[] {
  if (typeof t === 'number') throw new Error('root must be a node');
  const [z, o] = t;
  const le = (v: number) => [v & 0xff, v >> 8];
  if (typeof z === 'number' && typeof o === 'number') return [3, ...le(z), ...le(o)];
  if (typeof o === 'number') return [1, ...le(o), ...serializeTree(z)];
  if (typeof z === 'number') return [2, ...le(z), ...serializeTree(o)];
  const first = serializeTree(z);
  return [0, ...le(first.length), ...first, ...serializeTree(o)];
}

function codes(t: Tree, prefix: number[] = [], out = new Map<number, number[]>()): Map<number, number[]> {
  if (typeof t === 'number') out.set(t, prefix);
  else {
    codes(t[0], [...prefix, 0], out);
    codes(t[1], [...prefix, 1], out);
  }
  return out;
}

interface FakeTopic {
  id: number;
  title: string;
  subtitle?: string;
  body?: string;
  example?: string;
}

function helpBlock(lang: number, topics: FakeTopic[]): number[] {
  const syms = new Set<number>([0]);
  for (const t of topics) for (const s of [t.subtitle, t.body, t.example]) for (const ch of s ?? '') syms.add(ch.charCodeAt(0));
  const tree = buildTree([...syms].sort((a, b) => a - b));
  const code = codes(tree);
  const treeBytes = serializeTree(tree);

  const blob: number[] = [];
  const index: number[] = [];
  const u32 = (v: number) => [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff];
  for (const t of topics) {
    const bits: number[] = [];
    const strs = [t.subtitle, t.body, t.example].filter((s) => s !== undefined) as string[];
    for (const s of strs) {
      for (const ch of s + '\0') bits.push(...code.get(ch.charCodeAt(0))!);
      while (bits.length % 8) bits.push(0);
    }
    const data = [strs.length, 0];
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0;
      for (let k = 0; k < 8; k++) b |= bits[i + k] << k;
      data.push(b);
    }
    const flags = (t.subtitle !== undefined ? 0x02 : 0) | (t.body !== undefined ? 0x04 : 0) | (t.example !== undefined ? 0x08 : 0);
    index.push(...u32(t.id), ...u32(blob.length), data.length & 0xff, data.length >> 8, flags, t.title.length);
    for (const ch of t.title) index.push(ch.charCodeAt(0) & 0xff, ch.charCodeAt(0) >> 8);
    index.push(0, 0);
    blob.push(...data);
  }
  const headerSize = 0x48;
  const treeOff = headerSize;
  const indexOff = treeOff + treeBytes.length;
  const blobOff = indexOff + index.length;
  const header = new Array(headerSize).fill(0);
  header.splice(0, 4, 0x7c, 0x61, 0x8a, 0xb2);
  header.splice(0x0c, 4, ...u32(lang));
  const fields = [topics.length, indexOff, index.length, treeOff, treeBytes.length, blobOff, blob.length];
  fields.forEach((v, k) => header.splice(0x1c + 4 * k, 4, ...u32(v)));
  return [...header, ...treeBytes, ...index, ...blob];
}

const EN: FakeTopic[] = [
  { id: 1, title: 'Start', subtitle: 'Start page', body: 'Welcome text.' },
  {
    id: 2,
    title: 'BEEPX',
    subtitle: 'Make a sound',
    body: '✎^✎*Syntax:*✐\nBEEPX(freq [, ms [, vol]])\nBEEPX()^✐\n\nPlays a tone of ✎#freq#✐ Hz. Press ✍[OK]✍ to stop.\n✎*Parameters:*✐\n✎+freq: pitch\n✎+ms: length+✐',
    example: 'BEEPX(440,200)\n__$Demo_BEEPX\n',
  },
  { id: 3, title: 'LINKRECV', body: '✎^✎*Syntax:*✐\nLINKRECV^✐\n\nReads a packet; (--E1--) returns {}.', example: 'LINKRECV' },
  { id: 4, title: 'IF THEN ELSE END', subtitle: 'Branch', body: '✎^✎*Syntax:*✐\nIF test THEN a [ELSE b] END;^✐' },
  { id: 5, title: 'Python modules', body: 'Modules.' },
  { id: 6, title: 'pyfunc', body: '✎^✎*Syntax:*✐\npyfunc(x)^✐' },
];
// A translation: command titles are left empty and come from the English block.
const DE: FakeTopic[] = EN.map((t) => ({ ...t, title: t.id === 2 ? '' : t.title, body: t.body?.replace('Plays a tone', 'Spielt einen Ton') }));

const image = new Uint8Array([...new Array(37).fill(0xff), ...helpBlock(4, DE), 0, 0, ...helpBlock(1, EN), 0xaa]);

afterEach(() => setHelpDb(null));

describe('firmware help extraction', () => {
  it('finds every language block', () => {
    expect(helpLanguages(image)).toEqual([4, 1]);
  });

  it('decodes topics with subtitle, body and example', () => {
    const topics = extractHelp(image);
    expect(topics.map((t) => t.title)).toEqual(EN.map((t) => t.title));
    const beep = topics[1];
    expect(beep.subtitle).toBe('Make a sound');
    expect(beep.body).toBe(EN[1].body);
    expect(beep.example).toBe(EN[1].example);
    expect(topics[2].subtitle).toBeUndefined();
  });

  it('fills empty translated titles from the English block', () => {
    const de = extractHelp(image, 4);
    expect(de[1].title).toBe('BEEPX');
    expect(de[1].body).toContain('Spielt einen Ton');
  });

  it('rejects files without help', () => {
    expect(() => extractHelp(new Uint8Array(1000))).toThrow(/No built-in help/);
  });
});

describe('help markup', () => {
  const t = (body: string, example?: string): HelpTopic => ({ id: 0, title: 'T', body, example });

  it('turns the syntax block into a labelled code block', () => {
    const { md } = helpBodyMarkdown(t('✎^✎*Syntax:*✐\nF(a, b)^✐\n\nText.'));
    expect(md).toBe('**Syntax**\n```hpppl\nF(a, b)\n```\n\nText.');
  });

  it('renders bold, parameter names, menu keys and lists', () => {
    const { md } = helpBodyMarkdown(t('✎*Note:*✐ use ✎#x_1#✐ and ✍[OK]✍.\n✎+one\n✎+two+✐\nend'));
    expect(md).toBe('**Note:** use `x_1` and **\\[OK\\]**.  \n- one  \n- two  \nend');
  });

  it('drops the viewer scroll control and maps calculator glyphs', () => {
    expect(helpBodyMarkdown(t('Tap ✍-▲ Page ▼-✍ to scroll. 2+3*')).md).toBe('Tap  to scroll. 2+3\\*i');
  });

  it('inlines example references and skips demo links', () => {
    const topic = t('✎%✎*Examples:*✐\n(--E1--) gives 1.\n(--E2--) gives 2.%✐', 'A()\n__$Demo_A\nB()');
    const r = helpBodyMarkdown(topic);
    expect(r.usedExamples).toBe(true);
    expect(r.md).toContain('`A()` gives 1.');
    expect(r.md).toContain('`B()` gives 2.');
    expect(helpMarkdown(topic)).not.toContain('**Example**');
  });

  it('adds the example lines when the body does not refer to them', () => {
    const md = helpMarkdown({ id: 0, title: 'BEEPX', subtitle: 'Sound', body: 'Beeps.', example: 'BEEPX(1)\n__$Demo_X\n' });
    expect(md).toBe('**BEEPX** — Sound\n\nBeeps.\n\n**Example**\n```hpppl\nBEEPX(1)\n```');
  });
});

describe('syntax lines', () => {
  it('reads the forms and their argument counts', () => {
    const topic: HelpTopic = { id: 0, title: 'BEEPX', body: EN[1].body };
    expect(syntaxLines(topic)).toEqual(['BEEPX(freq [, ms [, vol]])', 'BEEPX()']);
    expect(helpArity(topic)).toEqual({ min: 0, max: 3 });
  });

  it('counts optional, list and variadic arguments', () => {
    expect(syntaxArity('TEXTOUT_P(Text [, G], x, y [, Font [, Color]])')).toEqual({ min: 3, max: 6 });
    expect(syntaxArity('SEND({data})')).toEqual({ min: 1, max: 1 });
    expect(syntaxArity('V([n])')).toEqual({ min: 0, max: 1 });
    expect(syntaxArity('MAX(a, b, …)')).toEqual({ min: 2, max: Infinity });
    expect(syntaxArity('RECV')).toEqual({ min: 0, max: 0 });
    expect(syntaxArity('PIXON_P([G,] x, y [, Color])')).toEqual({ min: 2, max: 4 });
    expect(syntaxArity('BLIT_P([trgtG,] [dx1, dy1 [, dx2, dy2]], srcG [, sx1, sy1])')).toEqual({ min: 1, max: 8 });
  });

  it('locates each argument for signature help', () => {
    const sig = 'F(a [, b [, c]], {d, e})';
    expect(syntaxParams(sig).map(([s, e]) => sig.slice(s, e))).toEqual(['a', 'b', 'c', '{d, e}']);
  });
});

describe('loaded help', () => {
  it('indexes commands before the Python reference, and structures by keyword', () => {
    setHelpDb({ topics: extractHelp(image), source: 'test.img', loadedAt: 0 });
    expect(helpCommands().map((c) => c.title)).toEqual(['BEEPX', 'LINKRECV']);
    expect(helpFor('beepx')).toBeUndefined();
    expect(helpForKeyword('if')?.title).toBe('IF THEN ELSE END');
    expect(firmwareAccepts('BEEPX', 3)).toBe(true);
    expect(firmwareAccepts('BEEPX', 4)).toBe(false);
    expect(firmwareAccepts('NOPE', 1)).toBe(false);
  });
});
