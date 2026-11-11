<script lang="ts">
  import { onMount } from 'svelte';
  import Editor from './components/Editor.svelte';
  import FileList from './components/FileList.svelte';
  import CalcPanel from './components/CalcPanel.svelte';
  import ScreenPanel from './components/ScreenPanel.svelte';
  import Console from './components/Console.svelte';
  import Splitter from './components/Splitter.svelte';
  import DiffView from './components/DiffView.svelte';
  import NewAppDialog from './components/NewAppDialog.svelte';
  import { appDisplayName, appOfPath } from './lib/files/app';
  import { fileType } from './lib/files/kinds';
  import { cycleTheme, resetSize, resolvedTheme, saveLayout, setSize, ui, type Layout } from './lib/ui.svelte';
  import { app, autoConnect, connect, disconnect, initWorkspace, sendAndRun, sendCurrent, toggleConsole } from './lib/state.svelte';
  import { programNameFromFile } from './lib/files/workspace';

  const isProgram = $derived(!!app.current && fileType(app.current) === 'program');
  const currentApp = $derived(app.current ? appOfPath(app.current) : null);
  const sendLabel = $derived(
    !app.current ? '' : currentApp ? `app ${appDisplayName(currentApp)}` : programNameFromFile(app.current),
  );

  // Theme: data-theme on <html> only when chosen explicitly; Auto follows the system via CSS.
  $effect(() => {
    if (ui.theme === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = ui.theme;
  });

  const themeIcon = $derived(ui.theme === 'auto' ? '◐' : ui.theme === 'light' ? '☀' : '☾');

  // Panel resizing: remember the size when a drag starts and apply the pointer delta.
  let startSize = 0;
  function resizer(k: keyof Layout, sign: 1 | -1) {
    return {
      onstart: () => (startSize = ui.layout[k]),
      ondrag: (d: number) => setSize(k, startSize + sign * d),
      onend: saveLayout,
      onreset: () => resetSize(k),
    };
  }

  onMount(() => {
    initWorkspace();
    void autoConnect();
  });

  function onKey(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === '`') {
      e.preventDefault();
      toggleConsole();
    } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Enter') {
      e.preventDefault();
      if (app.connected && !app.busy) sendAndRun();
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="app">
  <header class="toolbar">
    <h1>HP Prime Web IDE</h1>
    {#if app.connected}
      <button onclick={disconnect}>Disconnect</button>
      <span class="dev ok">● {app.deviceLabel}</span>
    {:else}
      <button class="primary" onclick={connect} disabled={!app.hidSupported || !!app.busy}>Connect calculator</button>
      <span class="dev">○ not connected</span>
    {/if}
    <span class="spacer"></span>
    <button
      class="theme"
      onclick={cycleTheme}
      title="Theme: {ui.theme === 'auto' ? `Auto (${resolvedTheme()})` : ui.theme} — click to change"
      aria-label="Theme: {ui.theme}">{themeIcon}</button
    >
    <button
      class="primary"
      onclick={sendCurrent}
      disabled={!app.connected || !app.current || !!app.busy}
      title="Send the open program to the calculator (Ctrl+Enter)"
    >
      Send {sendLabel} to calculator
    </button>
    <button
      onclick={sendAndRun}
      disabled={!app.connected || !isProgram || !!app.busy}
      title="Send the program, then start it from the Home view using remote key presses and show the screen live (experimental; Ctrl+Shift+Enter)"
    >
      ▶ Send &amp; Run
    </button>
  </header>

  {#if !app.hidSupported}
    <div class="banner">
      WebHID is not available. Use desktop Chrome, Edge, or another Chromium browser, served over
      HTTPS or <code>localhost</code>. On Linux, install <code>udev/60-hp-prime.rules</code> first.
    </div>
  {/if}

  <main style:grid-template-columns="{ui.layout.left}px auto minmax(0, 1fr) auto {ui.layout.right}px">
    <aside class="left"><FileList /></aside>
    <Splitter dir="x" label="Resize file list" {...resizer('left', 1)} />
    <div class="center"><Editor /></div>
    <Splitter dir="x" label="Resize calculator panel" {...resizer('right', -1)} />
    <aside class="right"><ScreenPanel /><CalcPanel /></aside>
  </main>

  {#if app.showConsole}
    <div class="bottom" style:height="{ui.layout.console}px">
      <Splitter dir="y" label="Resize console" {...resizer('console', -1)} />
      <Console />
    </div>
  {/if}

  {#if app.newAppOpen}<NewAppDialog />{/if}

  {#if app.diff}
    {#key app.diff}<DiffView req={app.diff} />{/key}
  {/if}

  <footer class="status {app.statusKind}">
    <span class="msg">
      {#if app.busy}<span class="spinner"></span> {app.busy}…{:else}{app.status || 'Ready'}{/if}
    </span>
    <button
      class="console-toggle"
      class:on={app.showConsole}
      onclick={toggleConsole}
      title="Toggle console (Ctrl+`)"
      aria-pressed={app.showConsole}
    >
      {app.showConsole ? '▾' : '▴'} Console
    </button>
  </footer>
</div>

<style>
  .app {
    height: 100vh;
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr) auto auto;
  }
  .toolbar { grid-row: 1; }
  .banner { grid-row: 2; }
  main { grid-row: 3; }
  .bottom { grid-row: 4; }
  .status { grid-row: 5; }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 12px;
    background: var(--panel);
    border-bottom: 1px solid var(--border);
  }
  h1 {
    font-size: 15px;
    margin: 0 12px 0 0;
    font-weight: 600;
  }
  .dev {
    font-size: 13px;
    color: var(--muted);
  }
  .dev.ok {
    color: var(--ok);
  }
  .spacer {
    flex: 1;
  }
  .banner {
    background: #5a3b12;
    color: #ffe2b3;
    padding: 8px 12px;
    font-size: 13px;
  }
  main {
    display: grid;
    min-height: 0;
  }
  .theme {
    width: 30px;
    padding: 3px 0;
  }
  .left,
  .right {
    min-height: 0;
    display: flex;
    background: var(--panel);
  }
  .right {
    flex-direction: column;
    overflow-y: auto;
  }
  .center {
    min-width: 0;
    min-height: 0;
  }
  .bottom {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .bottom > :global(.console) {
    flex: 1;
    min-height: 0;
  }
  .status {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 12px;
    padding: 0 0 0 12px;
    background: #1b4f8a;
    color: #fff;
  }
  .msg {
    flex: 1;
    min-width: 0;
    padding: 3px 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .console-toggle {
    flex: none;
    font-size: 12px;
    color: #fff;
    background: transparent;
    border: none;
    border-left: 1px solid #ffffff33;
    border-radius: 0;
    padding: 3px 12px;
  }
  .console-toggle:hover,
  .console-toggle.on {
    background: #ffffff22;
  }
  .status.error {
    background: #8a2b2b;
  }
  .status.ok {
    background: #2b6b3a;
  }
  .spinner {
    display: inline-block;
    width: 9px;
    height: 9px;
    border: 2px solid #fff8;
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    vertical-align: -1px;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
