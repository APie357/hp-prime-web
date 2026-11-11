<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  import type { IconName } from '../lib/icons';
  import type { PixelMode } from '../lib/screen';
  import { screen, setPixelMode } from '../lib/state.svelte';
  import { resolvedTheme, setFlag, setTheme, ui, type Flag, type ThemePref } from '../lib/ui.svelte';

  const THEMES: { value: ThemePref; label: string; icon: IconName }[] = [
    { value: 'auto', label: 'Auto', icon: 'brightness_auto' },
    { value: 'light', label: 'Light', icon: 'light_mode' },
    { value: 'dark', label: 'Dark', icon: 'dark_mode' },
  ];

  const GROUPS: { title: string; icon?: IconName; items: { flag: Flag; label: string; hint: string }[] }[] = [
    {
      title: 'Calculator',
      items: [
        { flag: 'listOnConnect', label: 'List contents on connect', hint: 'Read apps, programs and notes when the calculator connects (~20 s).' },
        { flag: 'chat', label: 'Chat', hint: 'Send messages to the calculator and see its replies and Help requests.' },
      ],
    },
    {
      title: 'Advanced',
      icon: 'tune',
      items: [{ flag: 'fetchByName', label: 'Fetch by name', hint: 'Get one program, note or app from the calculator by typing its name.' }],
    },
    {
      title: 'Experimental',
      icon: 'science',
      items: [
        {
          flag: 'remoteKeys',
          label: 'Remote keys',
          hint: 'Keypad, Test keys and typing on the screen. On the G2, injected keys are often queued until a real key is pressed.',
        },
        {
          flag: 'backupRestore',
          label: 'Backup and restore',
          hint: 'Download everything as a .zip, and send its programs and notes back. Not yet tested on hardware.',
        },
      ],
    },
  ];

  let dialog: HTMLDialogElement;
  onMount(() => dialog.showModal());
  const close = () => (ui.settingsOpen = false);
</script>

<dialog
  bind:this={dialog}
  aria-labelledby="settings-title"
  oncancel={(e) => {
    e.preventDefault();
    close();
  }}
  onclick={(e) => e.target === dialog && close()}
>
  <div class="body">
    <h2 id="settings-title"><Icon name="settings" size={18} /> Settings</h2>

    <section>
      <h3 id="theme-label">Theme</h3>
      <div class="seg" role="radiogroup" aria-labelledby="theme-label">
        {#each THEMES as t (t.value)}
          <label class="opt" class:on={ui.theme === t.value}>
            <input type="radio" name="theme" value={t.value} checked={ui.theme === t.value} onchange={() => setTheme(t.value)} />
            <Icon name={t.icon} size={16} />
            {t.label}
          </label>
        {/each}
      </div>
      {#if ui.theme === 'auto'}<p class="hint muted">Follows your system (now {resolvedTheme()}).</p>{/if}
    </section>

    <section>
      <h3><label for="pixel-mode">Screen pixel format</label></h3>
      <select id="pixel-mode" value={screen.mode} onchange={(e) => setPixelMode(e.currentTarget.value as PixelMode)}>
        <option value="rgb555le">RGB555 (G2 default)</option>
        <option value="rgb565be">RGB565</option>
        <option value="gray">Gray</option>
      </select>
      <p class="hint muted">How screenshots read the calculator's 16-bit pixels. Change it if colors look wrong.</p>
    </section>

    {#each GROUPS as g (g.title)}
      <section>
        <h3>{#if g.icon}<Icon name={g.icon} size={16} />{/if} {g.title}</h3>
        {#each g.items as it (it.flag)}
          <label class="check">
            <input type="checkbox" checked={ui[it.flag]} onchange={(e) => setFlag(it.flag, e.currentTarget.checked)} />
            <span>
              {it.label}
              <span class="hint muted">{it.hint}</span>
            </span>
          </label>
        {/each}
      </section>
    {/each}

    <footer>
      <button class="primary" type="button" onclick={close}>Done</button>
    </footer>
  </div>
</dialog>

<style>
  dialog {
    width: min(400px, 92vw);
    padding: 0;
    background: var(--panel);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 12px 40px #0008;
  }
  dialog::backdrop {
    background: #0006;
  }
  .body {
    padding: 16px;
  }
  h2 {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 15px;
    text-transform: none;
    letter-spacing: 0;
    color: var(--fg);
    margin: 0 0 12px;
  }
  section {
    padding: 10px 0;
    border-top: 1px solid var(--border);
  }
  h3 {
    display: flex;
    align-items: center;
    gap: 5px;
    margin: 0 0 8px;
    font-size: 12px;
    font-weight: 600;
    color: var(--muted);
  }
  .seg {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }
  .opt {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    height: 28px;
    font-size: 13px;
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
    color: var(--muted);
  }
  .opt:hover {
    background: var(--hover);
  }
  .opt.on {
    border-color: var(--accent);
    color: var(--fg);
    background: var(--sel);
  }
  .opt:has(input:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  .opt input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  select {
    width: 100%;
    height: 28px;
    font: inherit;
    font-size: 13px;
    color: var(--fg);
    background: var(--input-bg);
    border: 1px solid var(--input-border);
    border-radius: 4px;
  }
  .check {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-size: 13px;
    cursor: pointer;
  }
  .check input {
    margin-top: 2px;
  }
  .check + .check {
    margin-top: 10px;
  }
  .hint {
    display: block;
    font-size: 12px;
    margin: 6px 0 0;
  }
  .check .hint {
    margin-top: 2px;
  }
  footer {
    display: flex;
    justify-content: flex-end;
    padding-top: 12px;
    border-top: 1px solid var(--border);
  }
</style>
