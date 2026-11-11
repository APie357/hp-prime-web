<script lang="ts">
  import { onMount } from 'svelte';
  import { resolvedTheme } from '../lib/ui.svelte';
  import { closeDiff, type DiffRequest } from '../lib/state.svelte';

  let { req }: { req: DiffRequest } = $props();

  let host: HTMLDivElement;
  let dialog: HTMLDialogElement;
  let changes = $state<number | null>(null);

  onMount(() => {
    dialog.showModal();
    // Monaco is a lazy chunk (see Editor.svelte); usually already loaded by the editor.
    let cleanup: (() => void) | undefined;
    let closed = false;
    import('../lib/monaco').then(({ monaco, monacoTheme }) => {
      if (closed) return;
      cleanup = mount(monaco, monacoTheme);
    });
    return () => {
      closed = true;
      cleanup?.();
    };
  });

  function mount(monaco: typeof import('../lib/monaco').monaco, monacoTheme: typeof import('../lib/monaco').monacoTheme) {
    const original = monaco.editor.createModel(req.original, req.language);
    const modified = monaco.editor.createModel(req.modified, req.language);
    const diff = monaco.editor.createDiffEditor(host, {
      theme: monacoTheme(resolvedTheme()),
      automaticLayout: true,
      readOnly: true,
      originalEditable: false,
      renderSideBySide: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 13,
      renderWhitespace: 'boundary',
    });
    diff.setModel({ original, modified });
    const sub = diff.onDidUpdateDiff(() => {
      changes = diff.getLineChanges()?.length ?? 0;
    });
    return () => {
      sub.dispose();
      diff.dispose();
      original.dispose();
      modified.dispose();
    };
  }
</script>

<dialog
  bind:this={dialog}
  aria-labelledby="diff-title"
  oncancel={(e) => {
    e.preventDefault();
    closeDiff(null);
  }}
>
  <header>
    <h2 id="diff-title">{req.title}</h2>
    {#if req.message}<p>{req.message}</p>{/if}
  </header>
  <div class="labels">
    <span>{req.originalLabel}</span>
    <span>
      {req.modifiedLabel}
      {#if changes !== null}<span class="count">· {changes === 0 ? 'only whitespace or line endings differ' : `${changes} change${changes === 1 ? '' : 's'}`}</span>{/if}
    </span>
  </div>
  <div class="diff" bind:this={host}></div>
  <footer>
    {#each req.actions as a (a.id)}
      <button class:primary={a.primary} onclick={() => closeDiff(a.id)}>{a.label}</button>
    {/each}
  </footer>
</dialog>

<style>
  dialog {
    width: min(1100px, 94vw);
    height: min(720px, 88vh);
    padding: 0;
    display: flex;
    flex-direction: column;
    background: var(--panel);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 12px 40px #0008;
  }
  dialog::backdrop {
    background: #0006;
  }
  header {
    padding: 12px 16px 8px;
  }
  h2 {
    font-size: 15px;
    text-transform: none;
    letter-spacing: 0;
    color: var(--fg);
  }
  header p {
    margin: 4px 0 0;
    font-size: 13px;
    color: var(--muted);
  }
  .labels {
    display: grid;
    grid-template-columns: 1fr 1fr;
    padding: 4px 16px;
    font-size: 12px;
    color: var(--muted);
    border-top: 1px solid var(--border);
  }
  .count {
    margin-left: 4px;
  }
  .diff {
    flex: 1;
    min-height: 0;
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
  }
  footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 10px 16px;
  }
</style>
