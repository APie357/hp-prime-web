/** UI preferences kept in localStorage: color theme, experimental features and panel sizes. */

export type ThemePref = 'auto' | 'light' | 'dark';

const KEY = (k: string) => `hp-prime-web:${k}`;

function load<T>(k: string, fallback: T): T {
  try {
    const v = localStorage.getItem(KEY(k));
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

function save(k: string, v: unknown): void {
  try {
    localStorage.setItem(KEY(k), JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
}

export interface Layout {
  left: number;
  right: number;
  console: number;
}

export const LAYOUT_DEFAULTS: Layout = { left: 256, right: 340, console: 200 };
export const LAYOUT_LIMITS: Record<keyof Layout, [number, number]> = {
  left: [256, 480],
  right: [260, 720],
  console: [80, 600],
};

/** Saved panel sizes, clamped to the current limits (they may have changed since they were saved). */
function loadLayout(): Layout {
  const saved = { ...LAYOUT_DEFAULTS, ...load<Partial<Layout>>('layout', {}) };
  for (const k of Object.keys(LAYOUT_LIMITS) as (keyof Layout)[]) {
    const [lo, hi] = LAYOUT_LIMITS[k];
    const v = Number(saved[k]);
    saved[k] = Number.isFinite(v) ? Math.round(Math.min(hi, Math.max(lo, v))) : LAYOUT_DEFAULTS[k];
  }
  return saved;
}

const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: light)') : null;

export const ui = $state({
  theme: load<ThemePref>('theme', 'auto'),
  systemLight: media?.matches ?? false,
  layout: loadLayout(),
  /** Experimental: remote keypad, key test and typing on the screen (key injection is unreliable on the G2). */
  remoteKeys: load<boolean>('remoteKeys', false),
  /** Read the calculator's apps, programs and notes right after connecting. */
  listOnConnect: load<boolean>('listOnConnect', true),
  /** Show the Chat section. */
  chat: load<boolean>('chat', false),
  /** Advanced: fetch an object by name. */
  fetchByName: load<boolean>('fetchByName', false),
  /** Experimental (untested on hardware): backup to .zip and restore. */
  backupRestore: load<boolean>('backupRestore', false),
  /** Settings dialog is open (not saved). */
  settingsOpen: false,
});

media?.addEventListener('change', (e) => {
  ui.systemLight = e.matches;
});

/** The theme actually shown. */
export function resolvedTheme(): 'light' | 'dark' {
  return ui.theme === 'auto' ? (ui.systemLight ? 'light' : 'dark') : ui.theme;
}

export function setTheme(t: ThemePref): void {
  ui.theme = t;
  save('theme', t);
}

/** On/off settings shown in the Settings dialog. */
export type Flag = 'remoteKeys' | 'listOnConnect' | 'chat' | 'fetchByName' | 'backupRestore';

export function setFlag(k: Flag, on: boolean): void {
  ui[k] = on;
  save(k, on);
}

export function clampSize(k: keyof Layout, v: number): number {
  const [lo, hi] = LAYOUT_LIMITS[k];
  return Math.round(Math.min(hi, Math.max(lo, v)));
}

export function setSize(k: keyof Layout, v: number): void {
  ui.layout[k] = clampSize(k, v);
}

export function saveLayout(): void {
  save('layout', ui.layout);
}

export function resetSize(k: keyof Layout): void {
  ui.layout[k] = LAYOUT_DEFAULTS[k];
  saveLayout();
}
