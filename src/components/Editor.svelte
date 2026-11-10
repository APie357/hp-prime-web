<script lang="ts">
  import { onMount } from 'svelte';
  import { monaco, PPL } from '../lib/monaco';
  import { kindFromFile } from '../lib/files/workspace';
  import { app, editorBridge, markDirty, readFile, saveFile, sendCurrent } from '../lib/state.svelte';

  let host: HTMLDivElement;
  let editor: monaco.editor.IStandaloneCodeEditor | undefined;
  const models = new Map<string, monaco.editor.ITextModel>();
  const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let loading = false;

  function modelFor(file: string, text: string): monaco.editor.ITextModel {
    let m = models.get(file);
    if (m) return m;
    const language = kindFromFile(file) === 'note' ? 'plaintext' : PPL;
    m = monaco.editor.createModel(text, language, monaco.Uri.file('/' + file));
    m.onDidChangeContent(() => {
      if (loading) return;
      markDirty(file);
      clearTimeout(saveTimers.get(file));
      saveTimers.set(file, setTimeout(() => saveFile(file), 800));
    });
    models.set(file, m);
    return m;
  }

  editorBridge.getText = (file) => models.get(file)?.getValue() ?? null;
  editorBridge.setText = (file, text) => {
    const m = models.get(file);
    if (m && m.getValue() !== text) {
      loading = true;
      m.setValue(text);
      loading = false;
    }
  };
  editorBridge.forget = (file) => {
    models.get(file)?.dispose();
    models.delete(file);
  };

  onMount(() => {
    editor = monaco.editor.create(host, {
      theme: 'prime-dark',
      automaticLayout: true,
      fontSize: 14,
      tabSize: 2,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      renderWhitespace: 'selection',
      model: null,
    });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      if (app.current) saveFile(app.current);
    });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => sendCurrent());
    // Assignment operators: `:=`, and the calculator's Sto▶ arrow (`value▶var`).
    const typeAction = (id: string, label: string, key: number, text: string) =>
      editor!.addAction({
        id,
        label,
        keybindings: [key],
        precondition: `editorLangId == ${PPL}`,
        // 'type' goes through Monaco's typing path: multi-cursor, selections and undo work as usual.
        run: (ed) => ed.trigger('keyboard', 'type', { text }),
      });
    typeAction('ppl.insertAssign', 'PPL: Insert := (assign)', monaco.KeyMod.Alt | monaco.KeyCode.Equal, ':=');
    typeAction('ppl.insertStore', 'PPL: Insert ▶ (store)', monaco.KeyMod.Alt | monaco.KeyCode.Period, '▶');
    return () => {
      editor?.dispose();
      for (const m of models.values()) m.dispose();
    };
  });

  // Swap the model when the current file changes.
  $effect(() => {
    const file = app.current;
    if (!editor) return;
    if (!file) {
      editor.setModel(null);
      return;
    }
    // Notes are prose: wrap long lines.
    editor.updateOptions({ wordWrap: kindFromFile(file) === 'note' ? 'on' : 'off' });
    const existing = models.get(file);
    if (existing) {
      editor.setModel(existing);
      editor.focus();
      return;
    }
    readFile(file).then((text) => {
      if (app.current !== file) return;
      editor!.setModel(modelFor(file, text));
      editor!.focus();
    });
  });
</script>

<div class="editor-wrap">
  {#if !app.current}
    <div class="empty">
      <p>No file open.</p>
      <p class="hint">Create a program or note on the left, or pull one from the calculator.</p>
      <p class="hint"><kbd>Ctrl</kbd>+<kbd>S</kbd> save · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> send to calculator</p>
      <p class="hint"><kbd>Alt</kbd>+<kbd>=</kbd> types <code>:=</code> · <kbd>Alt</kbd>+<kbd>.</kbd> types <code>▶</code> · <kbd>Shift</kbd>+<kbd>Alt</kbd>+<kbd>F</kbd> format</p>
    </div>
  {/if}
  <div class="editor" bind:this={host}></div>
</div>

<style>
  .editor-wrap {
    position: relative;
    height: 100%;
    min-height: 0;
  }
  .editor {
    position: absolute;
    inset: 0;
  }
  .empty {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: var(--bg);
    color: var(--muted);
  }
  .empty p {
    margin: 4px;
  }
  .hint {
    font-size: 13px;
  }
  kbd {
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 0 4px;
    font-size: 12px;
  }
</style>
