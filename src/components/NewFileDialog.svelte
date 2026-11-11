<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import type { IconName } from '../lib/icons';
  import { isValidName } from '../lib/hid/session';
  import { isValidAppName } from '../lib/files/app';
  import { isValidPythonName, parseNewName, type NewKind } from '../lib/files/kinds';
  import { app, newFile, newPythonScript } from '../lib/state.svelte';
  import PythonLogo from './PythonLogo.svelte';

  const KINDS: { kind: NewKind; label: string; icon: IconName; hint: string }[] = [
    { kind: 'program', label: 'Program', icon: 'code', hint: 'A PPL program (.hpppl)' },
    { kind: 'note', label: 'Note', icon: 'description', hint: 'A plain-text note (.note)' },
    { kind: 'app', label: 'App', icon: 'widgets', hint: 'Based on a calculator app (experimental)' },
    { kind: 'python', label: 'Python', icon: 'code', hint: "A script for the calculator's Python app (.py)" },
  ];
  const PLACEHOLDER: Record<NewKind, string> = { program: 'NEWPROG', note: 'New note', app: 'My App', python: 'script' };
  const RULES: Record<NewKind, string> = {
    program: 'Start with a letter; use letters, digits and _ only.',
    note: 'The calculator does not accept that note name.',
    app: 'Use up to 40 characters, no \\ / : * ? " < > | and no leading &.',
    python: 'Start with a letter or _; use letters, digits and _ only (up to 31).',
  };

  let dialog: HTMLDialogElement;
  let input = $state('');
  let kind = $state<NewKind>('program');

  const parsed = $derived(parseNewName(input));
  const name = $derived(parsed.name);
  const valid = $derived(
    !!name && (kind === 'app' ? isValidAppName(name) : kind === 'python' ? isValidPythonName(name) : isValidName(kind, name)),
  );

  // A typed extension picks the type; without one, the buttons decide.
  $effect(() => {
    if (parsed.kind) kind = parsed.kind;
  });

  onMount(() => dialog.showModal());

  const close = () => (app.newFileOpen = false);

  async function submit(e: Event) {
    e.preventDefault();
    if (!valid) return;
    if (kind === 'app') {
      app.newAppName = name;
      close();
      app.newAppOpen = true;
      return;
    }
    if (kind === 'python' ? await newPythonScript(name) : await newFile(kind, name)) close();
  }
</script>

<dialog
  bind:this={dialog}
  aria-labelledby="new-file-title"
  oncancel={(e) => {
    e.preventDefault();
    close();
  }}
>
  <form onsubmit={submit}>
    <h2 id="new-file-title">New</h2>
    <div class="kinds" role="radiogroup" aria-label="Type">
      {#each KINDS as k (k.kind)}
        <label class="kind" class:on={kind === k.kind} title={k.hint}>
          <input type="radio" name="kind" value={k.kind} bind:group={kind} />
          {#if k.kind === 'python'}<PythonLogo size={16} />{:else}<Icon name={k.icon} size={18} />{/if}
          {k.label}
        </label>
      {/each}
    </div>
    <label class="field">
      Name
      <!-- svelte-ignore a11y_autofocus -->
      <input bind:value={input} autofocus spellcheck="false" placeholder={PLACEHOLDER[kind]} />
    </label>
    <p class="muted small">
      {#if input.trim() && !valid}<span class="err">{RULES[kind]}</span>
      {:else}An extension picks the type, e.g. <code>Ideas.note</code>, <code>Quiz.hpapp</code> or <code>game.py</code>.{#if kind === 'python'} It goes into the calculator's Python app (<code>&amp;Python.hpappdir</code>).{/if}{/if}
    </p>
    <footer>
      <button type="button" onclick={close}>Cancel</button>
      <button class="primary" type="submit" disabled={!valid}>{kind === 'app' ? 'Next…' : 'Create'}</button>
    </footer>
  </form>
</dialog>

<style>
  dialog {
    width: min(380px, 92vw);
    padding: 16px;
    background: var(--panel);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 12px 40px #0008;
  }
  dialog::backdrop {
    background: #0006;
  }
  h2 {
    font-size: 15px;
    text-transform: none;
    letter-spacing: 0;
    color: var(--fg);
    margin: 0 0 10px;
  }
  .kinds {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
    margin-bottom: 12px;
  }
  .kind {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: 8px 4px;
    font-size: 13px;
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
    color: var(--muted);
  }
  .kind:hover {
    background: var(--hover);
  }
  .kind.on {
    border-color: var(--accent);
    color: var(--fg);
    background: var(--sel);
  }
  .kind:has(input:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  .kind input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 13px;
    margin-bottom: 6px;
  }
  .small {
    font-size: 12px;
    margin: 0 0 10px;
    min-height: 1.4em;
  }
  code {
    font-size: 11px;
  }
  .err {
    color: var(--err);
  }
  footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
</style>
