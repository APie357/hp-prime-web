<script lang="ts">
  import { onMount } from 'svelte';
  import type * as Monaco from 'monaco-editor/editor';
  import { resolvedTheme } from '../lib/ui.svelte';
  import PythonLogo from './PythonLogo.svelte';
  import ExamEditor from './ExamEditor.svelte';
  import Icon from './Icon.svelte';
  import { fileIcon } from '../lib/icons';
  import { fileType, isProse, languageFor } from '../lib/files/kinds';
  import {
    app,
    closeFile,
    editorBridge,
    markDirty,
    moveTab,
    openFile,
    readFile,
    renameFile,
    reportOpenError,
    saveFile,
    sendAndRun,
    sendCurrent,
  } from '../lib/state.svelte';

  let host: HTMLDivElement;
  // Monaco (~3.5 MB) is loaded on mount, after the rest of the UI has rendered.
  type MonacoModule = typeof import('../lib/monaco');
  let lib: MonacoModule | undefined;
  let editor = $state.raw<Monaco.editor.IStandaloneCodeEditor | undefined>();
  let loadError = $state<string | null>(null);
  const models = new Map<string, Monaco.editor.ITextModel>();
  const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let loading = false;

  function modelFor(file: string, text: string): Monaco.editor.ITextModel {
    let m = models.get(file);
    if (m) return m;
    const { monaco, PPL } = lib!;
    const language = languageFor(file) === 'hpppl' ? PPL : languageFor(file);
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
    clearTimeout(saveTimers.get(file));
    saveTimers.delete(file);
    viewStates.delete(file);
    models.get(file)?.dispose();
    models.delete(file);
  };
  editorBridge.rename = (from, to) => {
    const m = models.get(from);
    if (!m) return;
    const text = m.getValue();
    const view = editor?.getModel() === m ? editor.saveViewState() : viewStates.get(from);
    editorBridge.forget(from);
    modelFor(to, text);
    if (view) viewStates.set(to, view);
  };

  /** Cursor and scroll position per file, restored when switching tabs. */
  const viewStates = new Map<string, Monaco.editor.ICodeEditorViewState | null>();
  let shown: string | null = null;

  function show(file: string, m: Monaco.editor.ITextModel) {
    if (shown && shown !== file && models.has(shown)) viewStates.set(shown, editor!.saveViewState());
    editor!.setModel(m);
    const v = viewStates.get(file);
    if (v) editor!.restoreViewState(v);
    shown = file;
    editor!.focus();
  }

  $effect(() => {
    const t = resolvedTheme();
    if (editor && lib) lib.monaco.editor.setTheme(lib.monacoTheme(t));
  });

  // Tab drag-and-drop reordering.
  let dragged: string | null = null;

  let disposed = false;
  async function init() {
    try {
      lib = await import('../lib/monaco');
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
      return;
    }
    if (disposed) return;
    const { monaco, monacoTheme, PPL } = lib;
    const ed = monaco.editor.create(host, {
      theme: monacoTheme(resolvedTheme()),
      automaticLayout: true,
      fontSize: 14,
      tabSize: 2,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      renderWhitespace: 'selection',
      model: null,
    });
    ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      if (app.current) saveFile(app.current);
    });
    ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => sendCurrent());
    ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => {
      if (app.connected && !app.busy) sendAndRun();
    });
    // Assignment operators: `:=`, and the calculator's Sto▶ arrow (`value▶var`).
    const typeAction = (id: string, label: string, key: number, text: string) =>
      ed.addAction({
        id,
        label,
        keybindings: [key],
        precondition: `editorLangId == ${PPL}`,
        // 'type' goes through Monaco's typing path: multi-cursor, selections and undo work as usual.
        run: (ed) => ed.trigger('keyboard', 'type', { text }),
      });
    typeAction('ppl.insertAssign', 'PPL: Insert := (assign)', monaco.KeyMod.Alt | monaco.KeyCode.Equal, ':=');
    typeAction('ppl.insertStore', 'PPL: Insert ▶ (store)', monaco.KeyMod.Alt | monaco.KeyCode.Period, '▶');
    editor = ed; // triggers the theme and model effects
  }

  onMount(() => {
    init();
    return () => {
      disposed = true;
      editor?.dispose();
      for (const m of models.values()) m.dispose();
    };
  });

  // Swap the model when the current file changes.
  $effect(() => {
    const file = app.current;
    if (!editor) return;
    // Exam configurations have their own form (ExamEditor) instead of a text model.
    if (!file || fileType(file) === 'exam') {
      if (shown && models.has(shown)) viewStates.set(shown, editor.saveViewState());
      shown = null;
      editor.setModel(null);
      return;
    }
    // Notes are prose: wrap long lines.
    editor.updateOptions({ wordWrap: isProse(file) ? 'on' : 'off' });
    const existing = models.get(file);
    if (existing) {
      show(file, existing);
      return;
    }
    readFile(file).then(
      (text) => {
        if (app.current !== file) return;
        show(file, modelFor(file, text));
      },
      (e) => reportOpenError(file, e),
    );
  });
</script>

<div class="editor-col">
{#if app.openFiles.length}
  <div class="tabs" role="tablist" aria-label="Open files">
    {#each app.openFiles as f, i (f)}
      <div
        class="tab"
        class:active={app.current === f}
        role="tab"
        tabindex="0"
        aria-selected={app.current === f}
        title="{f} (double-click to rename, middle-click to close)"
        draggable="true"
        onclick={() => openFile(f)}
        onkeydown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openFile(f);
          }
        }}
        ondblclick={() => renameFile(f)}
        onauxclick={(e) => {
          if (e.button === 1) {
            e.preventDefault();
            closeFile(f);
          }
        }}
        ondragstart={(e) => {
          dragged = f;
          e.dataTransfer?.setData('text/plain', f);
        }}
        ondragover={(e) => dragged && e.preventDefault()}
        ondrop={(e) => {
          e.preventDefault();
          if (dragged && dragged !== f) moveTab(dragged, i);
          dragged = null;
        }}
        ondragend={() => (dragged = null)}
      >
        <span class="icon">{#if fileType(f) === 'python'}<PythonLogo size={13} />{:else}<Icon name={fileIcon(fileType(f))} size={15} />{/if}</span>
        <span class="name">{f.replace(/^.*\//, '')}</span>
        <button
          class="close"
          class:dirty={app.dirty.includes(f)}
          title={app.dirty.includes(f) ? 'Unsaved changes (saved on close)' : 'Close'}
          aria-label="Close {f}"
          onclick={(e) => {
            e.stopPropagation();
            closeFile(f);
          }}
        ><span class="x"><Icon name="close" size={14} /></span><span class="d"><Icon name="circle-fill" size={8} /></span></button>
      </div>
    {/each}
  </div>
{/if}
<div class="editor-wrap">
  {#if !app.current}
    <div class="empty">
      <p>No file open.</p>
      <p class="hint">Create a program or note on the left, or pull one from the calculator.</p>
      <p class="hint"><kbd>Ctrl</kbd>+<kbd>S</kbd> save · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> send to calculator · <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Enter</kbd> send &amp; run</p>
      <p class="hint"><kbd>Alt</kbd>+<kbd>=</kbd> types <code>:=</code> · <kbd>Alt</kbd>+<kbd>.</kbd> types <code>▶</code> · <kbd>Shift</kbd>+<kbd>Alt</kbd>+<kbd>F</kbd> format</p>
    </div>
  {:else if fileType(app.current) === 'exam'}
    {#key app.current}<ExamEditor file={app.current} />{/key}
  {:else if !editor}
    <div class="empty">
      <p class="hint">{loadError ? `Editor failed to load: ${loadError}` : 'Loading editor…'}</p>
    </div>
  {/if}
  <div class="editor" bind:this={host}></div>
</div>
</div>

<style>
  .editor-col {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }
  .editor-wrap {
    position: relative;
    flex: 1;
    min-height: 0;
  }
  .tabs {
    display: flex;
    overflow-x: auto;
    background: var(--panel);
    border-bottom: 1px solid var(--border);
    scrollbar-width: thin;
  }
  .tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 4px 0 10px;
    height: 32px;
    font-size: 13px;
    font-family: var(--mono);
    color: var(--muted);
    border-right: 1px solid var(--border);
    cursor: pointer;
    white-space: nowrap;
    user-select: none;
  }
  .tab:hover {
    background: var(--hover);
  }
  .tab.active {
    background: var(--bg);
    color: var(--fg);
    box-shadow: inset 0 2px 0 var(--accent);
  }
  .tab:focus-visible {
    outline: 1px solid var(--focus);
    outline-offset: -1px;
  }
  .tab .icon {
    display: inline-flex;
    color: var(--muted);
  }
  .close {
    width: 20px;
    height: 20px;
    padding: 0;
    display: grid;
    place-items: center;
    background: none;
    border: none;
    color: var(--muted);
    font-size: 11px;
  }
  .close:hover:not(:disabled) {
    background: var(--hover);
    color: var(--fg);
  }
  .close .x,
  .close .d {
    display: inline-flex;
  }
  .close .d {
    display: none;
    color: var(--accent);
  }
  .close.dirty:not(:hover) .x {
    display: none;
  }
  .close.dirty:not(:hover) .d {
    display: inline-flex;
  }
  .tab:not(.active):not(:hover) .close:not(.dirty) .x {
    visibility: hidden;
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
