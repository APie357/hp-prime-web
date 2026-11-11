<script lang="ts">
  import { folderAccessSupported, kindFromFile } from '../lib/files/workspace';
  import {
    app,
    deleteFile,
    newFile,
    openFile,
    renameFile,
    openBrowserStorage,
    openFolder,
    refreshFiles,
    reopenFolder,
  } from '../lib/state.svelte';
</script>

<section class="panel">
  <header>
    <h2>Files</h2>
    <div class="actions">
      <button title="New program" onclick={() => newFile('program')}>＋ Prgm</button>
      <button title="New note" onclick={() => newFile('note')}>＋ Note</button>
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
    {#each app.files as f (f)}
      <li class:active={app.current === f}>
        <button
          class="file"
          onclick={() => openFile(f)}
          onkeydown={(e) => {
            if (e.key === 'F2') {
              e.preventDefault();
              renameFile(f);
            }
          }}
          title="{f} (F2 to rename)"
        >
          <span class="icon" title={kindFromFile(f)}>{kindFromFile(f) === 'note' ? '✎' : '▸'}</span>{f}{#if app.dirty.includes(f)}<span class="dot">●</span>{/if}
        </button>
        <button class="act" title="Rename (F2)" aria-label="Rename {f}" onclick={() => renameFile(f)}>✏</button>
        <button class="act" title="Delete" aria-label="Delete {f}" onclick={() => deleteFile(f)}>✕</button>
      </li>
    {:else}
      <li class="none">No files yet</li>
    {/each}
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
