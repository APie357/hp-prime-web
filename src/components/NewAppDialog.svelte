<script lang="ts">
  import { onMount } from 'svelte';
  import { isValidAppName } from '../lib/files/app';
  import { app, appBases, createApp, refreshCalcContents, type AppBase } from '../lib/state.svelte';

  let dialog: HTMLDialogElement;
  let name = $state('');
  let bases = $state<AppBase[] | null>(null);
  let chosen = $state(0);
  const valid = $derived(isValidAppName(name.trim()));

  async function load() {
    bases = await appBases();
    const fn = bases.findIndex((b) => b.base === 'Function');
    chosen = fn >= 0 ? fn : 0;
  }

  onMount(() => {
    dialog.showModal();
    void load();
  });

  const close = () => (app.newAppOpen = false);

  async function submit(e: Event) {
    e.preventDefault();
    if (!bases?.length || !valid) return;
    if (await createApp(name.trim(), bases[chosen])) close();
  }

  async function list() {
    await refreshCalcContents();
    await load();
  }
</script>

<dialog
  bind:this={dialog}
  aria-labelledby="new-app-title"
  oncancel={(e) => {
    e.preventDefault();
    close();
  }}
>
  <form onsubmit={submit}>
    <h2 id="new-app-title">New app</h2>
    <p class="muted">
      A new app is a copy of an existing app's settings under a new name, with its own program. Send it to put it on the
      calculator. <strong>Experimental:</strong> check that it shows up in the Apps screen.
    </p>
    <label>
      Name
      <!-- svelte-ignore a11y_autofocus -->
      <input bind:value={name} autofocus spellcheck="false" placeholder="My App" />
    </label>
    {#if name.trim() && !valid}<p class="err">Use up to 40 characters, no \ / : * ? " &lt; &gt; | and no leading &amp;.</p>{/if}
    <label>
      Based on
      {#if bases === null}
        <span class="muted">Loading…</span>
      {:else if bases.length}
        <select bind:value={chosen}>
          {#each bases as b, i (b.label)}<option value={i}>{b.label} — {b.base}</option>{/each}
        </select>
      {:else}
        <span class="muted">
          No apps known yet.
          {#if app.connected}
            <button type="button" onclick={list} disabled={!!app.busy}>List calculator contents</button>
          {:else}
            Connect the calculator and list its contents, or receive an app from it.
          {/if}
        </span>
      {/if}
    </label>
    <footer>
      <button type="button" onclick={close}>Cancel</button>
      <button class="primary" type="submit" disabled={!valid || !bases?.length}>Create</button>
    </footer>
  </form>
</dialog>

<style>
  dialog {
    width: min(440px, 92vw);
    padding: 16px;
    background: var(--panel);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 12px 40px #0008;
  }
  dialog::backdrop {
    background: #0006;
  }
  h2 {
    font-size: 15px;
    text-transform: none;
    letter-spacing: 0;
    color: var(--fg);
    margin: 0 0 6px;
  }
  p {
    font-size: 13px;
    margin: 0 0 12px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 13px;
    margin-bottom: 10px;
  }
  select {
    font: inherit;
    color: var(--fg);
    background: var(--input-bg);
    border: 1px solid var(--input-border);
    border-radius: 4px;
    padding: 3px 4px;
  }
  .err {
    color: var(--err);
    margin-top: -6px;
  }
  footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 6px;
  }
</style>
