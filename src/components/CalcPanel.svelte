<script lang="ts">
  import type { TextKind } from '../lib/hid/session';
  import { app, fetchObject, importObject, refreshCalcContents, syncClock } from '../lib/state.svelte';

  let fetchName = $state('');
  let fetchKind = $state<TextKind>('program');

  const programs = $derived(app.calcObjects.filter((o) => o.kind === 'program'));
  const notes = $derived(app.calcObjects.filter((o) => o.kind === 'note'));
</script>

<section class="panel">
  <header>
    <h2>Calculator</h2>
  </header>

  {#if !app.connected}
    <p class="muted pad">Not connected.</p>
  {:else}
    <dl class="pad">
      <dt>Device</dt>
      <dd>{app.deviceLabel}</dd>
      {#if app.info?.name}<dt>Name</dt><dd>{app.info.name}</dd>{/if}
      {#if app.info?.firmware}<dt>Firmware</dt><dd>{app.info.firmware}</dd>{/if}
    </dl>

    <div class="pad row">
      <button onclick={refreshCalcContents} disabled={!!app.busy} title="Read all programs and notes (full backup, ~20 s)">
        List contents
      </button>
      <button onclick={syncClock} disabled={!!app.busy} title="Set the calculator's date and time to this computer's">
        Sync clock
      </button>
    </div>
    <form
      class="pad row"
      onsubmit={(e) => {
        e.preventDefault();
        fetchObject(fetchKind, fetchName);
      }}
    >
      <select bind:value={fetchKind} aria-label="Object type">
        <option value="program">Program</option>
        <option value="note">Note</option>
      </select>
      <input placeholder="Name" bind:value={fetchName} spellcheck="false" />
      <button type="submit" disabled={!!app.busy || !fetchName.trim()}>Fetch</button>
    </form>

    <div class="lists">
      {#each [{ title: 'Programs', items: programs, kind: 'program' }, { title: 'Notes', items: notes, kind: 'note' }] as group (group.kind)}
        <h3 class="pad">{group.title} {#if app.calcListedAt}<span class="muted">({group.items.length})</span>{/if}</h3>
        <ul>
          {#each group.items as o (o.name)}
            <li>
              <span class="name" title={o.name}>{o.name}</span>
              {#if o.formatted}<span class="muted tag" title="Has rich-text formatting; only the plain text is edited">rich</span>{/if}
              <span class="muted size">{o.text.length} ch</span>
              <button onclick={() => importObject(o.kind, o.name, o.text)} title="Copy into workspace and open">Open</button>
            </li>
          {:else}
            <li class="muted">{app.calcListedAt ? `No ${group.title.toLowerCase()}` : 'Click “List contents” to read them'}</li>
          {/each}
        </ul>
      {/each}
    </div>
  {/if}
</section>

<style>
  .pad {
    padding: 6px 10px;
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
    background: #3c3c3c;
    border: 1px solid #4a4d52;
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
  h3 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
    border-top: 1px solid var(--border);
    padding-top: 10px;
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
    padding: 3px 10px;
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
</style>
