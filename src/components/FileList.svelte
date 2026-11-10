<script lang="ts">
  import { folderAccessSupported } from '../lib/files/workspace';
  import {
    app,
    deleteFile,
    newFile,
    openBrowserStorage,
    openFolder,
    refreshFiles,
    reopenFolder,
  } from '../lib/state.svelte';
</script>

<section class="panel">
  <header>
    <h2>Workspace</h2>
    <div class="actions">
      <button title="New program" onclick={newFile}>＋</button>
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
        <button class="file" onclick={() => (app.current = f)} title={f}>
          {f}{#if app.dirty.includes(f)}<span class="dot">●</span>{/if}
        </button>
        <button class="del" title="Delete" onclick={() => deleteFile(f)}>✕</button>
      </li>
    {:else}
      <li class="none">No programs yet</li>
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
  .del {
    visibility: hidden;
    background: none;
    border: none;
    color: var(--muted);
  }
  li:hover .del {
    visibility: visible;
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
