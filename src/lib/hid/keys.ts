/**
 * HP Prime key codes (the same numbers GETKEY returns), from PrimeDev `PrimeWeb/HpTypes/HpKey.cs`,
 * plus the alpha letters printed on each key. Used for remote key injection (`EC`), which is
 * experimental: see AGENTS.md.
 */

export interface PrimeKey {
  code: number;
  label: string;
  /** Upper-case letter typed after Alpha, if any. */
  alpha?: string;
  /** Character this key types without modifiers, if any. */
  char?: string;
}

export const KEYS: PrimeKey[] = [
  { code: 0, label: 'Apps' },
  { code: 1, label: 'Symb' },
  { code: 2, label: '▲' },
  { code: 3, label: 'Help' },
  { code: 4, label: 'Esc' },
  { code: 5, label: 'Home' },
  { code: 6, label: 'Plot' },
  { code: 7, label: '◀' },
  { code: 8, label: '▶' },
  { code: 9, label: 'View' },
  { code: 10, label: 'CAS' },
  { code: 11, label: 'Num' },
  { code: 12, label: '▼' },
  { code: 13, label: 'Menu' },
  { code: 14, label: 'Vars', alpha: 'A' },
  { code: 15, label: 'Toolbox', alpha: 'B' },
  { code: 16, label: '▫√', alpha: 'C' },
  { code: 17, label: 'xtθn', alpha: 'D' },
  { code: 18, label: 'a b/c', alpha: 'E' },
  { code: 19, label: 'Del' },
  { code: 20, label: 'xʸ', alpha: 'F' },
  { code: 21, label: 'SIN', alpha: 'G' },
  { code: 22, label: 'COS', alpha: 'H' },
  { code: 23, label: 'TAN', alpha: 'I' },
  { code: 24, label: 'LN', alpha: 'J' },
  { code: 25, label: 'LOG', alpha: 'K' },
  { code: 26, label: 'x²', alpha: 'L' },
  { code: 27, label: '+/−', alpha: 'M', char: '-' },
  { code: 28, label: '( )', alpha: 'N' },
  { code: 29, label: ',', alpha: 'O', char: ',' },
  { code: 30, label: 'Enter' },
  { code: 31, label: 'EEX', alpha: 'P' },
  { code: 32, label: '7', alpha: 'Q', char: '7' },
  { code: 33, label: '8', alpha: 'R', char: '8' },
  { code: 34, label: '9', alpha: 'S', char: '9' },
  { code: 35, label: '÷', alpha: 'T' },
  { code: 36, label: 'Alpha' },
  { code: 37, label: '4', alpha: 'U', char: '4' },
  { code: 38, label: '5', alpha: 'V', char: '5' },
  { code: 39, label: '6', alpha: 'W', char: '6' },
  { code: 40, label: '×', alpha: 'X' },
  { code: 41, label: 'Shift' },
  { code: 42, label: '1', alpha: 'Y', char: '1' },
  { code: 43, label: '2', alpha: 'Z', char: '2' },
  { code: 44, label: '3', char: '3' },
  { code: 45, label: '−' },
  { code: 46, label: 'On' },
  { code: 47, label: '0', char: '0' },
  { code: 48, label: '.', char: '.' },
  { code: 49, label: 'Space', char: ' ' },
  { code: 50, label: '+' },
];

export const K = {
  APPS: 0,
  UP: 2,
  ESC: 4,
  HOME: 5,
  LEFT: 7,
  RIGHT: 8,
  DOWN: 12,
  DEL: 19,
  BRACKETS: 28,
  ENTER: 30,
  ALPHA: 36,
  SHIFT: 41,
  ONE: 42,
} as const;

const BY_ALPHA = new Map(KEYS.filter((k) => k.alpha).map((k) => [k.alpha!, k.code]));
const BY_CHAR = new Map(KEYS.filter((k) => k.char).map((k) => [k.char!, k.code]));

/**
 * Key presses that type `text` on the entry line. Upper-case letters are Alpha + key; lower-case
 * letters are Alpha + Shift + key (unverified on hardware). Throws for characters that have no
 * known key sequence (e.g. `_`).
 */
export function keysForText(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const up = ch.toUpperCase();
    if (BY_ALPHA.has(up) && ch !== up) out.push(K.ALPHA, K.SHIFT, BY_ALPHA.get(up)!);
    else if (BY_ALPHA.has(ch)) out.push(K.ALPHA, BY_ALPHA.get(ch)!);
    else if (BY_CHAR.has(ch)) out.push(BY_CHAR.get(ch)!);
    else throw new Error(`can't type "${ch}" with remote keys`);
  }
  return out;
}

/**
 * Keys that run `name` from the Home view: Home, Esc (clear the entry line), the name, then
 * `( )` and the arguments when there are any, then Enter. Arguments may only use characters
 * `keysForText` can type (letters, digits, `.`, `,` and `-` for negation).
 */
export function keysToRun(name: string, args = ''): number[] {
  const keys = [K.HOME, K.ESC, ...keysForText(name)];
  // `( )` inserts both brackets with the cursor between them, so typing continues inside.
  if (args.trim()) keys.push(K.BRACKETS, ...keysForText(args.replace(/\s+/g, '')));
  keys.push(K.ENTER);
  return keys;
}

/** Key for a physical keyboard event while the screen view has focus, or null. */
export function keysForKeyboardEvent(e: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }): number[] | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const named: Record<string, number> = {
    ArrowUp: K.UP,
    ArrowDown: K.DOWN,
    ArrowLeft: K.LEFT,
    ArrowRight: K.RIGHT,
    Enter: K.ENTER,
    Escape: K.ESC,
    Backspace: K.DEL,
    Delete: K.DEL,
    Home: K.HOME,
    '+': 50,
    '*': 40,
    '/': 35,
    '^': 20,
    '(': K.BRACKETS,
  };
  if (e.key in named) return [named[e.key]];
  if (e.key === '-') return [45];
  if (e.key.length === 1) {
    try {
      return keysForText(e.key);
    } catch {
      return null;
    }
  }
  return null;
}
