<script lang="ts">
  import { app, fetchProgram, importProgram, refreshCalcPrograms } from '../lib/state.svelte';

  let fetchName = $state('');
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
      <button onclick={refreshCalcPrograms} disabled={!!app.busy}>List programs</button>
    </div>
    <form
      class="pad row"
      onsubmit={(e) => {
        e.preventDefault();
        fetchProgram(fetchName);
      }}
    >
      <input placeholder="Program name" bind:value={fetchName} spellcheck="false" />
      <button type="submit" disabled={!!app.busy || !fetchName.trim()}>Fetch</button>
    </form>

    <h3 class="pad">Programs {#if app.calcListedAt}<span class="muted">({app.calcPrograms.length})</span>{/if}</h3>
    <ul>
      {#each app.calcPrograms as p (p.name)}
        <li>
          <span class="name">{p.name}</span>
          <span class="muted size">{p.source.length} ch</span>
          <button onclick={() => importProgram(p.name, p.source)} title="Copy into workspace and open">Open</button>
        </li>
      {:else}
        <li class="muted">{app.calcListedAt ? 'No programs on the calculator' : 'Click “List programs” to read them'}</li>
      {/each}
    </ul>
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
    overflow: auto;
    flex: 1;
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
  }
  .size {
    font-size: 11px;
  }
  li button {
    font-size: 12px;
    padding: 1px 8px;
  }
</style>
