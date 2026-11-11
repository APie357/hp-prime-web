<script lang="ts">
  import { onMount } from 'svelte';
  import { isValidAppName, pythonModuleName, type AppLanguage } from '../lib/files/app';
  import { app, appBases, createApp, iconFitNote, refreshCalcContents, type AppBase } from '../lib/state.svelte';
  import { makeAppIcon, pickImage, type IconResult } from '../lib/files/icon';
  import { onDestroy } from 'svelte';

  let icon = $state<IconResult | null>(null);
  let iconUrl = $state('');
  let iconError = $state('');

  async function chooseIcon() {
    const f = await pickImage();
    if (!f) return;
    try {
      icon = await makeAppIcon(f);
      iconError = '';
      if (iconUrl) URL.revokeObjectURL(iconUrl);
      iconUrl = URL.createObjectURL(new Blob([icon.png as Uint8Array<ArrayBuffer>], { type: 'image/png' }));
    } catch (e) {
      iconError = (e as Error).message;
    }
  }

  function clearIcon() {
    icon = null;
    if (iconUrl) URL.revokeObjectURL(iconUrl);
    iconUrl = '';
  }

  onDestroy(() => iconUrl && URL.revokeObjectURL(iconUrl));

  let dialog: HTMLDialogElement;
  let name = $state('');
  let bases = $state<AppBase[] | null>(null);
  let chosen = $state(0);
  let lang = $state<AppLanguage>('ppl');
  const valid = $derived(isValidAppName(name.trim()));

  async function load() {
    bases = await appBases();
    chosen = 0; // None: an empty app
  }

  onMount(() => {
    dialog.showModal();
    void load();
  });

  const close = () => (app.newAppOpen = false);

  async function submit(e: Event) {
    e.preventDefault();
    if (!bases?.length || !valid) return;
    if (await createApp(name.trim(), bases[chosen], lang, icon?.png)) close();
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
          {#each bases as b, i (b.label)}<option value={i}>{b.label === b.base || b.base === 'None' ? b.label : `${b.label} — ${b.base}`}</option>{/each}
        </select>
        {#if bases.length === 1}
          <span class="muted hint">
            To base it on another app (Function, Python, …),
            {#if app.connected}
              <button type="button" class="link" onclick={list} disabled={!!app.busy}>list the calculator's apps</button>.
            {:else}
              connect the calculator and list its contents.
            {/if}
          </span>
        {/if}
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
    <fieldset>
      <legend>Program</legend>
      <label class="radio">
        <input type="radio" name="lang" value="ppl" bind:group={lang} />
        <span>PPL <span class="muted">— a <code>START()</code> program</span></span>
      </label>
      <label class="radio">
        <input type="radio" name="lang" value="python" bind:group={lang} />
        <span>
          Python
          <span class="muted">
            — <code>{pythonModuleName(name.trim() || 'app')}.py</code> holds the code; the app program runs it with
            <code>#PYTHON START()</code>
          </span>
        </span>
      </label>
    </fieldset>
    <div class="icon-row">
      <span class="lbl">Icon</span>
      {#if iconUrl}
        <img src={iconUrl} alt="App icon preview" width="38" height="38" />
      {:else}
        <span class="icon-empty" aria-hidden="true">▣</span>
      {/if}
      <button type="button" onclick={chooseIcon}>{icon ? 'Change…' : 'Choose image…'}</button>
      {#if icon}<button type="button" onclick={clearIcon}>Remove</button>{/if}
    </div>
    {#if icon && iconFitNote(icon)}<p class="muted small">Image {iconFitNote(icon)}.</p>{/if}
    {#if iconError}<p class="err">{iconError}</p>{/if}
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
  fieldset {
    border: 1px solid var(--border);
    border-radius: 6px;
    margin: 0 0 10px;
    padding: 6px 10px 2px;
  }
  legend {
    font-size: 12px;
    color: var(--muted);
    padding: 0 4px;
  }
  label.radio {
    flex-direction: row;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 6px;
  }
  code {
    font-size: 12px;
  }
  .icon-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    font-size: 13px;
  }
  .icon-row .lbl {
    width: 34px;
  }
  .icon-row img,
  .icon-empty {
    width: 38px;
    height: 38px;
    border: 1px solid var(--border);
    border-radius: 4px;
    image-rendering: pixelated;
  }
  .icon-empty {
    display: grid;
    place-items: center;
    color: var(--muted);
  }
  .small {
    font-size: 12px;
    margin-top: -4px;
  }
  .hint {
    font-size: 12px;
  }
  .link {
    background: none;
    border: none;
    padding: 0;
    color: var(--accent);
    font-size: 12px;
    text-decoration: underline;
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
