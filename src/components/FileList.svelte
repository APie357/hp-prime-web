<script lang="ts">
  import { folderAccessSupported } from '../lib/files/workspace';
  import { fileType, isEditable } from '../lib/files/kinds';
  import { appDirName, appDisplayName, isSystemApp } from '../lib/files/app';
  import {
    addAppFile,
    app,
    deleteAppFolder,
    deleteFile,
    openFile,
    renameApp,
    renameFile,
    openBrowserStorage,
    openFolder,
    refreshFiles,
    reopenFolder,
    iconVersion,
    readAppIcon,
    sendAppFolder,
    setAppIcon,
    workspaceApps,
  } from '../lib/state.svelte';
  import { ICON_FILE } from '../lib/files/icon';
  import PythonLogo from './PythonLogo.svelte';
  import Icon from './Icon.svelte';
  import { fileIcon } from '../lib/icons';

  /** Object URLs for app icons shown in the list, by app name. */
  let iconUrls = $state<Record<string, string>>({});
  $effect(() => {
    void iconVersion.n;
    const withIcon = apps.filter((a) => app.files.includes(`${appDirName(a)}/${ICON_FILE}`));
    let canceled = false;
    const made: string[] = [];
    void Promise.all(
      withIcon.map(async (a) => {
        const png = await readAppIcon(a);
        if (!png) return null;
        const url = URL.createObjectURL(new Blob([png as Uint8Array<ArrayBuffer>], { type: 'image/png' }));
        made.push(url);
        return [a, url] as const;
      }),
    ).then((pairs) => {
      if (canceled) return;
      iconUrls = Object.fromEntries(pairs.filter((p) => p !== null));
    });
    return () => {
      canceled = true;
      // Revoke on the next refresh (the old images stay visible until the new ones load).
      setTimeout(() => made.forEach((u) => URL.revokeObjectURL(u)), 5000);
    };
  });

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
      <button class="tool" title="New program, note or app" onclick={() => (app.newFileOpen = true)}><Icon name="add" size={15} />New</button>
      <button class="only-icon" title="Refresh" aria-label="Refresh" onclick={refreshFiles}><Icon name="refresh" size={16} /></button>
    </div>
  </header>

  <div class="ws">
    {#if folderAccessSupported()}
      <button class="tool" title="Open a local folder as the workspace" onclick={openFolder}><Icon name="folder" size={15} />Open</button>
    {/if}
    {#if app.needsPermission}
      <button class="wide" onclick={reopenFolder}>Reopen “{app.workspaceLabel}”</button>
    {:else if app.workspaceLabel}
      <span class="ws-label" title={app.workspaceKind === 'folder' ? 'Local folder' : 'Stored in this browser'}>
        <Icon name={app.workspaceKind === 'folder' ? 'folder' : 'database'} size={16} />
        <span class="ws-name">{app.workspaceLabel}</span>
      </span>
    {/if}
    {#if app.workspaceKind !== 'browser'}
      <button class="only-icon" title="Use browser storage" aria-label="Use browser storage" onclick={openBrowserStorage}
        ><Icon name="database" size={16} /></button
      >
    {/if}
  </div>

  <ul>
    {#each apps as name (name)}
      <li class="app-row" class:open={isOpen(name)}>
        <button class="file" onclick={() => toggle(name)} aria-expanded={isOpen(name)} title={appDirName(name)}>
          <span class="icon chev"><Icon name={isOpen(name) ? 'keyboard_arrow_down' : 'keyboard_arrow_right'} size={16} /></span>{#if iconUrls[name]}<img
              class="app-img"
              src={iconUrls[name]}
              alt=""
              width="16"
              height="16"
            />{:else}<span class="app-icon"><Icon name="widgets" size={16} /></span>{/if}{appDisplayName(name)}
          {#if isSystemApp(name)}<span class="tag">built-in</span>{/if}
        </button>
        <button
          class="act"
          title="Send app to the calculator"
          aria-label="Send app {appDisplayName(name)}"
          disabled={!app.connected || !!app.busy}
          onclick={() => sendAppFolder(name)}><Icon name="upload" /></button
        >
        <button
          class="act"
          title="Set icon (any image; cropped to a square and scaled to 38×38)"
          aria-label="Set icon of {appDisplayName(name)}"
          onclick={() => setAppIcon(name)}
          ><Icon name="image" /></button
        >
        <button class="act" title="Add a file (e.g. a Python module)" aria-label="Add a file to {appDisplayName(name)}" onclick={() => addAppFile(name)}><Icon name="add" /></button>
        {#if !isSystemApp(name)}
          <button class="act" title="Rename app" aria-label="Rename app {appDisplayName(name)}" onclick={() => renameApp(name)}><Icon name="edit" /></button>
        {/if}
        <button class="act" title="Delete app folder" aria-label="Delete app {appDisplayName(name)}" onclick={() => deleteAppFolder(name)}><Icon name="delete" /></button>
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
              <span class="icon"
                >{#if fileType(f) === 'python'}<PythonLogo size={13} />{:else}<Icon name={fileIcon(fileType(f))} size={15} />{/if}</span
              >{label(f, name)}{#if app.dirty.includes(f)}<span class="dot" aria-label="unsaved"><Icon name="circle-fill" size={8} /></span>{/if}
            </button>
            {#if label(f, name) === f.slice(appDirName(name).length + 1)}
              <button class="act" title="Rename (F2)" aria-label="Rename {f}" onclick={() => renameFile(f)}><Icon name="edit" /></button>
              <button class="act" title="Delete" aria-label="Delete {f}" onclick={() => deleteFile(f)}><Icon name="delete" /></button>
            {/if}
          </li>
        {/each}
      {/if}
    {/each}
    {#each rootFiles as f (f)}
      <li class:active={app.current === f}>
        <button class="file" onclick={() => openFile(f)} onkeydown={(e) => onKey(e, f)} title="{f} (F2 to rename)">
          <span class="icon" title={fileType(f)}><Icon name={fileIcon(fileType(f))} size={15} /></span>{f}{#if app.dirty.includes(f)}<span class="dot" aria-label="unsaved"><Icon name="circle-fill" size={8} /></span>{/if}
        </button>
        <button class="act" title="Rename (F2)" aria-label="Rename {f}" onclick={() => renameFile(f)}><Icon name="edit" /></button>
        <button class="act" title="Delete" aria-label="Delete {f}" onclick={() => deleteFile(f)}><Icon name="delete" /></button>
      </li>
    {/each}
    {#if !app.files.length}
      <li class="none">No files yet</li>
    {/if}
  </ul>
</section>

<style>
  .ws {
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 8px;
  }
  /* Header and workspace-row buttons share one size so their edges line up. */
  .tool,
  .only-icon {
    flex: none;
    box-sizing: border-box;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
  }
  .panel header .actions .tool {
    gap: 3px;
    padding: 0 8px 0 5px;
  }
  .panel header .actions .only-icon,
  .ws .only-icon {
    width: 24px;
    padding: 0;
  }
  .ws .only-icon {
    margin-left: auto;
  }
  .ws-label {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 13px;
    color: var(--muted);
  }
  .ws-name {
    color: var(--fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
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
    margin: 0 4px;
    border-radius: 4px;
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
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    line-height: 1;
    font-size: 13px;
    background: none;
    border: none;
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
    display: inline-flex;
    width: 20px;
    vertical-align: -3px;
    color: var(--muted);
  }
  .file:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .child .file {
    padding-left: 30px;
  }
  .app-img {
    width: 16px;
    height: 16px;
    margin-right: 5px;
    vertical-align: -3px;
    image-rendering: pixelated;
    border-radius: 2px;
  }
  .app-icon {
    display: inline-flex;
    margin-right: 5px;
    vertical-align: -3px;
    color: var(--teal);
  }
  .tag {
    margin-left: 6px;
    font-size: 10px;
    color: var(--muted);
    font-family: system-ui, sans-serif;
  }
  .chev {
    width: 18px;
  }
  .dot {
    display: inline-flex;
    color: var(--accent);
    margin-left: 5px;
    vertical-align: 1px;
  }
  .none {
    color: var(--muted);
    padding: 8px 10px;
    font-size: 13px;
  }
</style>
