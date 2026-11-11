<script lang="ts">
  import { closeDialog, dialogs, type DialogRequest } from '../lib/dialogs.svelte';

  let { req }: { req: DialogRequest } = $props();

  let dialog: HTMLDialogElement;
  let input = $state<HTMLInputElement>();
  let okButton = $state<HTMLButtonElement>();
  // svelte-ignore state_referenced_locally
  let value = $state(req.kind === 'prompt' ? req.value : '');
  const error = $derived(req.kind === 'prompt' && req.validate && value.trim() ? req.validate(value.trim()) : null);
  const canSubmit = $derived(req.kind !== 'prompt' || (!!value.trim() && !error));

  $effect(() => {
    dialog.showModal();
    if (input) {
      input.focus();
      input.select();
    } else okButton?.focus();
  });

  function finish(ok: boolean) {
    if (dialogs.current !== req) return;
    if (req.kind === 'confirm') req.resolve(ok);
    else if (req.kind === 'alert') req.resolve();
    else req.resolve(ok ? value.trim() : null);
    dialog.close();
    closeDialog();
  }

  function submit(e: Event) {
    e.preventDefault();
    if (canSubmit) finish(true);
  }
</script>

<dialog
  bind:this={dialog}
  class:danger={req.danger}
  aria-labelledby={req.title ? 'dlg-title' : undefined}
  aria-describedby="dlg-msg"
  oncancel={(e) => {
    e.preventDefault();
    finish(false);
  }}
>
  <form onsubmit={submit}>
    {#if req.title}<h2 id="dlg-title">{req.title}</h2>{/if}
    <p id="dlg-msg" class="msg">{req.message}</p>
    {#if req.kind === 'prompt'}
      <input bind:this={input} bind:value spellcheck="false" placeholder={req.placeholder} aria-invalid={!!error} />
      <p class="err" aria-live="polite">{error ?? ''}</p>
    {/if}
    <footer>
      {#if req.kind !== 'alert'}
        <button type="button" onclick={() => finish(false)}>{req.cancelLabel ?? 'Cancel'}</button>
      {/if}
      <button bind:this={okButton} class="primary" class:danger={req.danger} type="submit" disabled={!canSubmit}
        >{req.okLabel ?? 'OK'}</button
      >
    </footer>
  </form>
</dialog>

<style>
  dialog {
    width: min(420px, 92vw);
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
    margin: 0 0 8px;
  }
  .msg {
    font-size: 13px;
    margin: 0 0 12px;
    white-space: pre-line;
    overflow-wrap: anywhere;
    max-height: 50vh;
    overflow: auto;
  }
  input {
    width: 100%;
    box-sizing: border-box;
    font-family: var(--mono);
  }
  .err {
    color: var(--err);
    font-size: 12px;
    min-height: 1.4em;
    margin: 4px 0 6px;
  }
  footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  button.primary.danger {
    background: #c62828;
    border-color: #d84343;
  }
  button.primary.danger:hover:not(:disabled) {
    filter: brightness(1.1);
  }
</style>
