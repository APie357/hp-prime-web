<script lang="ts">
  import { folderAccessSupported } from '../lib/files/workspace';
  import { fileType, isEditable } from '../lib/files/kinds';
  import { appDirName, appDisplayName, isSystemApp } from '../lib/files/app';
  import {
    addAppFile,
    app,
    deleteAppFolder,
    deleteFile,
    newFile,
    openFile,
    renameApp,
    renameFile,
    openBrowserStorage,
    openFolder,
    refreshFiles,
    reopenFolder,
    sendAppFolder,
    workspaceApps,
  } from '../lib/state.svelte';

  const ICONS: Record<string, string> = {
    program: '▸',
    note: '✎',
    'app-program': '▸',
    'app-note': '✎',
    python: '🐍',
    text: '≡',
    binary: '◆',
  };

  const rootFiles = $derived(app.files.filter((f) => !f.includes('/')));
  const apps = $derived(workspaceApps(app.files));
  /** Expanded app folders (the one holding the current file is always open). */
  let expanded = $state<string[]>([]);
  const isOpen = (name: string) => expanded.includes(name) || !!app.current?.startsWith(appDirName(name) + '/');
  const toggle = (name: string) =>
    (expanded = expanded.includes(name) ? expanded.filter((n) => n !== name) : [...expanded, name]);

  function innerFiles(name: string): string[] {
    const dir = appDirName(name) + '/';
    const own = [`${name}.hpappprgm`, `${name}.hpappnote`, `${name}.hpapp`].map((x) => (dir + x).toLowerCase());
    const files = app.files.filter((f) => f.startsWith(dir));
    // App program, note and data first, then the extra files.
    return [
      ...own.map((o) => files.find((f) => f.toLowerCase() === o)).filter((f): f is string => !!f),
      ...files.filter((f) => !own.includes(f.toLowerCase())),
    ];
  }

  function label(path: string, appName: string): string {
    const inner = path.slice(appDirName(appName).length + 1);
    switch (inner.toLowerCase()) {
      case `${appName}.hpappprgm`.toLowerCase():
        return 'Program';
      case `${appName}.hpappnote`.toLowerCase():
        return 'Info note';
      case `${appName}.hpapp`.toLowerCase():
        return 'App data';
      default:
        return inner;
    }
  }

  function onKey(e: KeyboardEvent, f: string) {
    if (e.key === 'F2') {
      e.preventDefault();
      renameFile(f);
    }
  }
</script>

<section class="panel">
  <header>
    <h2>Files</h2>
    <div class="actions">
      <button title="New program" onclick={() => newFile('program')}>＋ Prgm</button>
      <button title="New note" onclick={() => newFile('note')}>＋ Note</button>
      <button title="New app (based on a calculator app; experimental)" onclick={() => (app.newAppOpen = true)}>＋ App</button>
      <button title="Refresh" onclick={refreshFiles}>⟳</button>
    </div>
  </header>

  <div class="ws">
    {#if app.needsPermission}
      <button class="wide" onclick={reopenFolder}>Reopen “{app.workspaceLabel}”</button>
    {:else if app.workspaceLabel}
      <span class="ws-label" title={app.workspaceKind === 'folder' ? 'Local folder' : 'Stored in this browser'}>
        {app.workspaceKind === 'folder' ? '📁' : '💾'} {app.workspaceLabel}
      </span>
    {/if}
    <div class="ws-buttons">
      {#if folderAccessSupported()}
        <button onclick={openFolder}>Open folder…</button>
      {/if}
      {#if app.workspaceKind !== 'browser'}
        <button onclick={openBrowserStorage}>Use browser storage</button>
      {/if}
    </div>
  </div>

  <ul>
    {#each apps as name (name)}
      <li class="app-row" class:open={isOpen(name)}>
        <button class="file" onclick={() => toggle(name)} aria-expanded={isOpen(name)} title={appDirName(name)}>
          <span class="icon chev">{isOpen(name) ? '▾' : '▸'}</span><span class="app-icon">▣</span>{appDisplayName(name)}
          {#if isSystemApp(name)}<span class="tag">built-in</span>{/if}
        </button>
        <button
          class="act"
          title="Send app to the calculator"
          aria-label="Send app {appDisplayName(name)}"
          disabled={!app.connected || !!app.busy}
          onclick={() => sendAppFolder(name)}>⇪</button
        >
        <button class="act" title="Add a file (e.g. a Python module)" aria-label="Add a file to {appDisplayName(name)}" onclick={() => addAppFile(name)}>＋</button>
        {#if !isSystemApp(name)}
          <button class="act" title="Rename app" aria-label="Rename app {appDisplayName(name)}" onclick={() => renameApp(name)}>✏</button>
        {/if}
        <button class="act" title="Delete app folder" aria-label="Delete app {appDisplayName(name)}" onclick={() => deleteAppFolder(name)}>✕</button>
      </li>
      {#if isOpen(name)}
        {#each innerFiles(name) as f (f)}
          {@const editable = isEditable(f)}
          <li class="child" class:active={app.current === f}>
            <button
              class="file"
              disabled={!editable}
              onclick={() => openFile(f)}
              onkeydown={(e) => onKey(e, f)}
              title={editable ? `${f} (F2 to rename)` : `${f} (binary; sent as-is)`}
            >
              <span class="icon">{ICONS[fileType(f)]}</span>{label(f, name)}{#if app.dirty.includes(f)}<span class="dot">●</span>{/if}
            </button>
            {#if label(f, name) === f.slice(appDirName(name).length + 1)}
              <button class="act" title="Rename (F2)" aria-label="Rename {f}" onclick={() => renameFile(f)}>✏</button>
              <button class="act" title="Delete" aria-label="Delete {f}" onclick={() => deleteFile(f)}>✕</button>
            {/if}
          </li>
        {/each}
      {/if}
    {/each}
    {#each rootFiles as f (f)}
      <li class:active={app.current === f}>
        <button class="file" onclick={() => openFile(f)} onkeydown={(e) => onKey(e, f)} title="{f} (F2 to rename)">
          <span class="icon" title={fileType(f)}>{ICONS[fileType(f)]}</span>{f}{#if app.dirty.includes(f)}<span class="dot">●</span>{/if}
        </button>
        <button class="act" title="Rename (F2)" aria-label="Rename {f}" onclick={() => renameFile(f)}>✏</button>
        <button class="act" title="Delete" aria-label="Delete {f}" onclick={() => deleteFile(f)}>✕</button>
      </li>
    {/each}
    {#if !app.files.length}
      <li class="none">No files yet</li>
    {/if}
  </ul>
</section>

<style>
  .ws {
    padding: 6px 8px;
    border-bottom: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .ws-label {
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ws-buttons {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }
  .ws-buttons button,
  .wide {
    font-size: 12px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 4px 0;
    overflow: auto;
    flex: 1;
  }
  li {
    display: flex;
    align-items: center;
  }
  li.active {
    background: var(--sel);
  }
  .file {
    flex: 1;
    text-align: left;
    background: none;
    border: none;
    padding: 4px 10px;
    color: var(--fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--mono);
    font-size: 13px;
  }
  .act {
    visibility: hidden;
    background: none;
    border: none;
    padding: 3px 5px;
    color: var(--muted);
  }
  .act:hover:not(:disabled) {
    background: var(--hover);
    color: var(--fg);
  }
  li:hover .act,
  li:focus-within .act {
    visibility: visible;
  }
  .icon {
    display: inline-block;
    width: 14px;
    color: var(--muted);
  }
  .file:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .child .file {
    padding-left: 30px;
  }
  .app-icon {
    margin-right: 5px;
    color: var(--teal);
  }
  .tag {
    margin-left: 6px;
    font-size: 10px;
    color: var(--muted);
    font-family: system-ui, sans-serif;
  }
  .chev {
    width: 12px;
  }
  .dot {
    color: var(--accent);
    margin-left: 4px;
  }
  .none {
    color: var(--muted);
    padding: 8px 10px;
    font-size: 13px;
  }
</style>
