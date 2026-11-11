<script lang="ts">
  import Icon from './Icon.svelte';
  import type { TextKind } from '../lib/hid/session';
  import { appDisplayName, isSystemApp } from '../lib/files/app';
  import {
    app,
    backupToZip,
    clearChat,
    clearHelp,
    calcAppScripts,
    deleteCalcApp,
    deleteCalcAppScript,
    deleteCalcExam,
    deleteCalcObject,
    fetchApp,
    fetchObject,
    openCalcApp,
    openCalcAppScript,
    PYTHON_APP,
    openCalcExam,
    importObject,
    refreshCalcContents,
    restoreFromZip,
    sendChatMessage,
    syncClock,
  } from '../lib/state.svelte';
  import { ui } from '../lib/ui.svelte';

  let showInfo = $state(false);
  let showBuiltIn = $state(false);
  let fetchName = $state('');
  let fetchKind = $state<TextKind | 'app'>('program');
  let chatText = $state('');
  let chatLog = $state<HTMLOListElement>();

  // Keep the newest message in view.
  $effect(() => {
    void app.chat.length;
    if (chatLog) chatLog.scrollTop = chatLog.scrollHeight;
  });
  let restoreInput = $state<HTMLInputElement>();

  function onRestorePick(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (f) restoreFromZip(f);
  }

  const programs = $derived(app.calcObjects.filter((o) => o.kind === 'program'));
  const notes = $derived(app.calcObjects.filter((o) => o.kind === 'note'));
  const customApps = $derived(app.calcApps.filter((a) => !isSystemApp(a.name)));
  const builtInApps = $derived(app.calcApps.filter((a) => isSystemApp(a.name)));
  const notListed = $derived(app.busy?.startsWith('Reading calculator') ? 'Reading…' : 'Not listed yet (↻ above)');
</script>

<section class="panel">
  <header>
    <h2>Calculator</h2>
    {#if app.connected}
      <div class="actions">
        <button
          class="icon"
          class:on={showInfo}
          aria-pressed={showInfo}
          aria-controls="calc-info"
          onclick={() => (showInfo = !showInfo)}
          title={showInfo ? 'Hide calculator info' : 'Show calculator info (model, name, firmware)'}
          aria-label="Calculator info"><Icon name="info" size={16} /></button
        >
        <button
          class="icon"
          onclick={refreshCalcContents}
          disabled={!!app.busy}
          title="List contents: read all apps, programs and notes (full backup, ~20 s)"
          aria-label="List contents"><Icon name="refresh" size={16} /></button
        >
        <button
          class="icon"
          onclick={syncClock}
          disabled={!!app.busy}
          title="Sync clock: set the calculator's date and time to this computer's"
          aria-label="Sync clock"><Icon name="schedule" size={16} /></button
        >
      </div>
    {/if}
  </header>

  {#if !app.connected}
    <p class="muted pad">Not connected.</p>
  {:else}
    {#if showInfo}
      <dl class="pad" id="calc-info">
        <dt>Device</dt>
        <dd>{app.deviceLabel}</dd>
        {#if app.info?.name}<dt>Name</dt><dd>{app.info.name}</dd>{/if}
        {#if app.info?.firmware}<dt>Firmware</dt><dd>{app.info.firmware}</dd>{/if}
      </dl>
    {/if}

    {#if ui.backupRestore}
      <div class="pad row">
        <button onclick={backupToZip} disabled={!!app.busy} title="Download everything on the calculator as a .zip (full backup, ~20 s)">
          Backup to .zip
        </button>
        <button
          onclick={() => restoreInput?.click()}
          disabled={!!app.busy}
          title="Send the programs and notes from a backup .zip back to the calculator"
        >
          Restore…
        </button>
        <input bind:this={restoreInput} type="file" accept=".zip,application/zip" hidden onchange={onRestorePick} />
      </div>
    {/if}
    {#if ui.fetchByName}
      <form
        class="pad row"
        onsubmit={(e) => {
          e.preventDefault();
          if (fetchKind === 'app') fetchApp(fetchName);
          else fetchObject(fetchKind, fetchName);
        }}
      >
        <select bind:value={fetchKind} aria-label="Object type">
          <option value="program">Program</option>
          <option value="note">Note</option>
          <option value="app">App</option>
        </select>
        <input placeholder="Name" bind:value={fetchName} spellcheck="false" />
        <button type="submit" disabled={!!app.busy || !fetchName.trim()}>Fetch</button>
      </form>
    {/if}

    {#if ui.chat}
      <div class="chat">
        <h3 class="pad">
          Chat
          {#if app.helpPending}
            <button class="help-btn" onclick={clearHelp} disabled={!!app.busy} title="Turn off the Help• flag on the calculator">
              <Icon name="back_hand" size={14} /> Clear help
            </button>
        {/if}
        {#if app.chat.length}<button class="link" onclick={clearChat} title="Clear the chat log">clear</button>{/if}
      </h3>
      {#if app.chat.length}
        <ol class="chat-log" bind:this={chatLog}>
          {#each app.chat as line, i (i)}
            <li class={line.dir} title={new Date(line.at).toLocaleTimeString()}>
              <span class="who">{line.dir === 'in' ? 'Calc' : 'You'}</span>
              {#if line.help}
                <span class="text help"><Icon name="back_hand" size={14} /> asked for help</span>
              {:else}
                <span class="text">{line.text}</span>
              {/if}
            </li>
          {/each}
        </ol>
      {/if}
      <form
        class="pad row"
        onsubmit={async (e) => {
          e.preventDefault();
          if (await sendChatMessage(chatText)) chatText = '';
        }}
      >
        <input placeholder="Message to calculator" bind:value={chatText} />
        <button type="submit" disabled={!!app.busy || !chatText}>Send</button>
      </form>
    </div>
    {/if}

    <div class="lists">
      {#snippet appRow(a: (typeof app.calcApps)[number])}
        <li>
          <span class="name" title={a.name}>{appDisplayName(a.name)}</span>
          <span class="muted size" title="Based on">{isSystemApp(a.name) ? 'built-in' : a.base}</span>
          <button
            class="icon-btn"
            onclick={() => openCalcApp(a.name)}
            title="Copy into the workspace and open"
            aria-label="Open app {a.name}"><Icon name="file_open" /></button
          >
          <button
            class="danger"
            onclick={() => deleteCalcApp(a.name)}
            disabled={!!app.busy || isSystemApp(a.name)}
            title={isSystemApp(a.name) ? 'Built-in apps can’t be deleted' : 'Delete from the calculator'}
            aria-label="Delete app {a.name} from the calculator"><Icon name="delete" /></button
          >
        </li>
      {/snippet}
      <h3 class="pad">Apps {#if app.calcListedAt}<span class="muted">({app.calcApps.length})</span>{/if}</h3>
      <ul>
        {#each customApps as a (a.name)}
          {@render appRow(a)}
        {:else}
          <li class="muted">{app.calcListedAt ? (builtInApps.length ? 'No apps of your own' : 'No apps') : notListed}</li>
        {/each}
        {#if builtInApps.length}
          <li class="group">
            <button class="group-toggle" aria-expanded={showBuiltIn} onclick={() => (showBuiltIn = !showBuiltIn)}>
              <Icon name={showBuiltIn ? 'keyboard_arrow_down' : 'keyboard_arrow_right'} size={16} />
              Built-in apps <span class="muted">({builtInApps.length})</span>
            </button>
          </li>
          {#if showBuiltIn}
            {#each builtInApps as a (a.name)}
              {@render appRow(a)}
            {/each}
          {/if}
        {/if}
      </ul>
      {#if app.calcApps.some((a) => a.name === PYTHON_APP)}
        {@const scripts = calcAppScripts()}
        <h3 class="pad">Python scripts <span class="muted">({scripts.length})</span></h3>
        <ul>
          {#each scripts as sc (sc.name)}
            <li>
              <span class="name" title="{sc.name} in the Python app">{sc.name}</span>
              <span class="muted size">{sc.size} B</span>
              <button
                class="icon-btn"
                onclick={() => openCalcAppScript(sc.name)}
                title="Copy into the workspace (&Python.hpappdir) and open; Send puts it back"
                aria-label="Open Python script {sc.name}"><Icon name="file_open" /></button
              >
              <button
                class="danger"
                onclick={() => deleteCalcAppScript(sc.name)}
                disabled={!!app.busy || !app.connected}
                title="Delete from the calculator's Python app"
                aria-label="Delete Python script {sc.name} from the calculator"><Icon name="delete" /></button
              >
            </li>
          {:else}
            <li class="muted">No scripts in the Python app</li>
          {/each}
        </ul>
      {/if}
      {#each [{ title: 'Programs', items: programs, kind: 'program' }, { title: 'Notes', items: notes, kind: 'note' }] as group (group.kind)}
        <h3 class="pad">{group.title} {#if app.calcListedAt}<span class="muted">({group.items.length})</span>{/if}</h3>
        <ul>
          {#each group.items as o (o.name)}
            <li>
              <span class="name" title={o.name}>{o.name}</span>
              {#if o.formatted}<span class="muted tag" title="Has rich-text formatting; only the plain text is edited">rich</span>{/if}
              <span class="muted size">{o.text.length} ch</span>
              <button
                class="icon-btn"
                onclick={() => importObject(o.kind, o.name, o.text)}
                title="Copy into the workspace and open"
                aria-label="Open {o.name}"><Icon name="file_open" /></button
              >
              <button
                class="danger"
                onclick={() => deleteCalcObject(o.kind, o.name)}
                disabled={!!app.busy}
                title="Delete from the calculator"
                aria-label="Delete {o.name} from the calculator"><Icon name="delete" /></button>
            </li>
          {:else}
            <li class="muted">{app.calcListedAt ? `No ${group.title.toLowerCase()}` : notListed}</li>
          {/each}
        </ul>
      {/each}
      {#if ui.examMode}
        <h3 class="pad">Exam configurations {#if app.calcListedAt}<span class="muted">({app.calcExams.length})</span>{/if}</h3>
        <ul>
          {#each app.calcExams as e (e.name)}
            <li>
              <span class="name" title={e.name}>{e.name}</span>
              <span class="muted size">{e.data.length} B</span>
              <button
                class="icon-btn"
                onclick={() => openCalcExam(e.name)}
                title="Copy into the workspace and open"
                aria-label="Open exam configuration {e.name}"><Icon name="file_open" /></button
              >
              <button
                class="danger"
                onclick={() => deleteCalcExam(e.name)}
                disabled={!!app.busy || e.name === 'Default Exam'}
                title={e.name === 'Default Exam' ? 'The default configuration can’t be deleted' : 'Delete from the calculator'}
                aria-label="Delete exam configuration {e.name} from the calculator"><Icon name="delete" /></button
              >
            </li>
          {:else}
            <li class="muted">{app.calcListedAt ? 'No exam configurations' : notListed}</li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</section>

<style>
  .actions .icon {
    box-sizing: border-box;
    width: 24px;
    height: 24px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .actions .icon.on {
    background: var(--sel);
    border-color: var(--accent);
  }
  /* 16px left lines up with the header title; 8px right with the header's buttons. */
  .pad {
    padding: 6px 8px 6px 16px;
    margin: 0;
  }
  .row {
    display: flex;
    gap: 6px;
  }
  .row input {
    flex: 1;
    min-width: 0;
  }
  select {
    font: inherit;
    font-size: 13px;
    color: var(--fg);
    background: var(--input-bg);
    border: 1px solid var(--input-border);
    border-radius: 4px;
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 10px;
    font-size: 13px;
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .lists {
    flex: 1;
    overflow: auto;
    min-height: 0;
  }
  /* Section headings use the panel title's type (app.css h2) and spacing, so they read as one set. */
  h3.pad {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    line-height: 24px;
    color: var(--muted);
    border-top: 1px solid var(--border);
    padding: 8px 8px 4px 16px;
  }
  /* Right under the header (info and the optional rows hidden), the header's own border is enough. */
  header + .chat > h3:first-child,
  header + .lists > h3:first-child {
    border-top: none;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0 0 6px;
  }
  li {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 8px 3px 16px;
    font-size: 13px;
  }
  .name {
    flex: 1;
    font-family: var(--mono);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .size,
  .tag {
    font-size: 11px;
  }
  li button {
    font-size: 12px;
    padding: 1px 8px;
  }
  li button.icon-btn,
  li button.danger {
    display: inline-flex;
    align-items: center;
    padding: 1px 4px;
  }
  .chat-log {
    max-height: 140px;
    overflow: auto;
    padding: 0 0 4px;
  }
  .chat-log li {
    align-items: baseline;
    padding: 1px 8px 1px 16px;
  }
  .chat-log .who {
    flex: none;
    width: 34px;
    font-size: 11px;
    color: var(--muted);
  }
  .chat-log li.in .who {
    color: var(--teal);
  }
  .chat-log .text {
    flex: 1;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
    font-family: var(--mono);
  }
  .chat-log .help {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-family: inherit;
    font-style: italic;
    color: var(--hl);
  }
  h3 .help-btn {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    margin-left: 8px;
    font-size: 11px;
    padding: 0 6px;
    text-transform: none;
    letter-spacing: 0;
    color: var(--hl);
    border-color: var(--hl);
  }
  h3 .link {
    float: right;
    background: none;
    border: none;
    padding: 0;
    font-size: 11px;
    color: var(--muted);
    text-transform: none;
    cursor: pointer;
  }
  h3 .link:hover {
    color: var(--fg);
  }
  li.group {
    padding: 0 8px 0 10px;
  }
  li.group .group-toggle {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 6px 3px 2px;
    font-size: 13px;
    text-align: left;
    background: none;
    border: none;
    color: var(--fg);
  }
  li.group .group-toggle:hover {
    background: var(--hover);
  }
  .group-toggle :global(svg) {
    color: var(--muted);
  }
  li button.danger:hover:not(:disabled) {
    color: var(--err);
    border-color: var(--err);
  }
</style>
