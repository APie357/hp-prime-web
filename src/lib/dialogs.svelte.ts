/**
 * In-app replacements for `confirm()`, `prompt()` and `alert()`: each returns a promise and shows
 * one modal at a time (later requests wait in a queue). `Dialogs.svelte` renders `dialogs.current`.
 */

export interface DialogOptions {
  title?: string;
  /** Label of the main button (default "OK"). */
  okLabel?: string;
  cancelLabel?: string;
  /** Style the main button as destructive (deletes, overwrites). */
  danger?: boolean;
}

export interface TextOptions extends DialogOptions {
  placeholder?: string;
  /** Returns an error to show under the field (and disables OK), or null when the value is fine. */
  validate?: (value: string) => string | null;
}

export type DialogRequest =
  | ({ kind: 'confirm'; message: string; resolve: (ok: boolean) => void } & DialogOptions)
  | ({ kind: 'alert'; message: string; resolve: () => void } & DialogOptions)
  | ({ kind: 'prompt'; message: string; value: string; resolve: (value: string | null) => void } & TextOptions)
  | ({ kind: 'choice'; message: string; choices: Choice[]; value: string; resolve: (value: string | null) => void } & DialogOptions);

export interface Choice {
  value: string;
  label: string;
}

export const dialogs = $state({ current: null as DialogRequest | null });
const queue: DialogRequest[] = [];

function open(req: DialogRequest): void {
  if (dialogs.current) queue.push(req);
  else dialogs.current = req;
}

/** Called by the host when the shown dialog is answered. */
export function closeDialog(): void {
  dialogs.current = queue.shift() ?? null;
}

/** Ask a yes/no question. Resolves true for OK, false for Cancel or Esc. */
export function askConfirm(message: string, opts: DialogOptions = {}): Promise<boolean> {
  return new Promise((resolve) => open({ kind: 'confirm', message, resolve, ...opts }));
}

/** Ask for a line of text. Resolves the trimmed text, or null when canceled. */
export function askText(message: string, value = '', opts: TextOptions = {}): Promise<string | null> {
  return new Promise((resolve) => open({ kind: 'prompt', message, value, resolve, ...opts }));
}

/** Pick one of several options. Resolves the chosen value, or null when canceled. */
export function askChoice(message: string, choices: Choice[], value = choices[0]?.value ?? '', opts: DialogOptions = {}): Promise<string | null> {
  return new Promise((resolve) => open({ kind: 'choice', message, choices, value, resolve, ...opts }));
}

/** Show a message with a single OK button. */
export function showAlert(message: string, opts: DialogOptions = {}): Promise<void> {
  return new Promise((resolve) => open({ kind: 'alert', message, resolve, ...opts }));
}
