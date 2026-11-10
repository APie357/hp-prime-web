<script lang="ts">
  import { onMount } from 'svelte';
  import Editor from './components/Editor.svelte';
  import FileList from './components/FileList.svelte';
  import CalcPanel from './components/CalcPanel.svelte';
  import Console from './components/Console.svelte';
  import { app, connect, disconnect, initWorkspace, sendCurrent, toggleConsole } from './lib/state.svelte';
  import { programNameFromFile } from './lib/files/workspace';

  onMount(() => {
    initWorkspace();
  });

  function onKey(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === '`') {
      e.preventDefault();
      toggleConsole();
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
      class="primary"
      onclick={sendCurrent}
      disabled={!app.connected || !app.current || !!app.busy}
      title="Send the open program to the calculator (Ctrl+Enter)"
    >
      Send {app.current ? programNameFromFile(app.current) : ''} to calculator
    </button>
  </header>

  {#if !app.hidSupported}
    <div class="banner">
      WebHID is not available. Use desktop Chrome, Edge, or another Chromium browser, served over
      HTTPS or <code>localhost</code>. On Linux, install <code>udev/60-hp-prime.rules</code> first.
    </div>
  {/if}

  <main>
    <aside class="left"><FileList /></aside>
    <div class="center"><Editor /></div>
    <aside class="right"><CalcPanel /></aside>
  </main>

  {#if app.showConsole}
    <div class="bottom"><Console /></div>
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
    color: #8bd17c;
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
    grid-template-columns: 220px 1fr 280px;
    min-height: 0;
  }
  .left,
  .right {
    min-height: 0;
    display: flex;
    background: var(--panel);
  }
  .left {
    border-right: 1px solid var(--border);
  }
  .right {
    border-left: 1px solid var(--border);
  }
  .center {
    min-width: 0;
    min-height: 0;
  }
  .bottom {
    border-top: 1px solid var(--border);
    height: 200px;
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
