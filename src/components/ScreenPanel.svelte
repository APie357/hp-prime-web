<script lang="ts">
  import Keypad from './Keypad.svelte';
  import { keysForKeyboardEvent } from '../lib/hid/keys';
  import type { KeyMode } from '../lib/hid/session';
  import {
    app,
    captureScreen,
    pressKeys,
    probeKeys,
    screen,
    setLive,
    setKeyMode,
    toggleKeypad,
  } from '../lib/state.svelte';
  import { ui } from '../lib/ui.svelte';

  let canvas: HTMLCanvasElement | undefined = $state();

  $effect(() => {
    const img = screen.image;
    if (!canvas || !img) return;
    canvas.width = img.width;
    canvas.height = img.height;
    canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  });

  // Typing on the focused screen sends keys to the calculator.
  function onKey(e: KeyboardEvent) {
    if (!ui.remoteKeys) return;
    const codes = keysForKeyboardEvent(e);
    if (!codes) return;
    e.preventDefault();
    pressKeys(codes);
  }

  function savePng() {
    canvas?.toBlob((b) => {
      if (!b) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      a.download = `prime-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, 'image/png');
  }

  const keysNote = $derived(
    screen.keysWork === null ? 'untested' : screen.keysWork ? 'work' : 'no effect',
  );
</script>

<section class="screen-panel">
  <header>
    <h2>Screen</h2>
    <span class="spacer"></span>
    <label class="live" title="Refresh the screenshot continuously">
      <input type="checkbox" checked={screen.live} disabled={!app.connected} onchange={(e) => setLive(e.currentTarget.checked)} />
      Live
    </label>
  </header>

  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div
    class="screen"
    tabindex={app.connected && ui.remoteKeys ? 0 : -1}
    role="application"
    aria-label={ui.remoteKeys ? 'Calculator screen. While focused, typing sends keys to the calculator.' : 'Calculator screen'}
    title={app.connected && ui.remoteKeys ? 'Click here, then type to send keys (arrows, Enter, Esc, Backspace, letters, digits)' : ''}
    onkeydown={onKey}
  >
    {#if screen.image}
      <canvas bind:this={canvas}></canvas>
    {:else}
      <div class="placeholder muted">
        {app.connected ? 'No screenshot yet' : 'Not connected'}
      </div>
    {/if}
  </div>
  {#if screen.error}<p class="err">{screen.error}</p>{/if}

  <div class="row">
    <button onclick={() => captureScreen()} disabled={!app.connected}>Screenshot</button>
    <button onclick={savePng} disabled={!screen.image} title="Save the current screenshot as PNG">Save</button>
    {#if ui.remoteKeys}
      <button onclick={toggleKeypad} aria-pressed={screen.showKeypad} class:on={screen.showKeypad}>Keypad</button>
    {/if}
  </div>
  {#if ui.remoteKeys}
    <div class="row probe">
      <button
        onclick={probeKeys}
        disabled={!app.connected || !!app.busy}
        title="Goes to Home, types 1, compares screenshots, then deletes it"
      >
        Test keys
      </button>
      <span class="muted">Keys: <span class:ok={screen.keysWork} class:bad={screen.keysWork === false}>{keysNote}</span></span>
      <select
        value={screen.keyMode}
        onchange={(e) => setKeyMode(e.currentTarget.value as KeyMode)}
        title="How key presses are sent (experimental). If keys only appear after you press a real key, try another mode."
        aria-label="Key mode"
      >
        <option value="single">One per message</option>
        <option value="batch">All in one message</option>
        <option value="release">Press + release</option>
        <option value="ready">Then ready check</option>
      </select>
    </div>
  {/if}

  {#if ui.remoteKeys && screen.showKeypad && app.connected}
    <Keypad />
  {/if}
</section>

<style>
  .screen-panel {
    display: flex;
    flex-direction: column;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--border);
  }
  header {
    display: flex;
    align-items: center;
    padding: 6px 10px;
  }
  .spacer {
    flex: 1;
  }
  .live {
    font-size: 12px;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .screen {
    margin: 0 10px;
    aspect-ratio: 4 / 3;
    background: #000;
    border: 1px solid var(--border);
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    outline: none;
  }
  .screen:focus-visible,
  .screen:focus {
    border-color: var(--focus);
  }
  canvas {
    width: 100%;
    height: 100%;
    image-rendering: pixelated;
  }
  .placeholder {
    font-size: 13px;
  }
  .row {
    display: flex;
    gap: 6px;
    padding: 6px 10px 0;
    align-items: center;
  }
  .row button {
    font-size: 12px;
    padding: 2px 8px;
  }
  .row select {
    font: inherit;
    font-size: 12px;
    color: var(--fg);
    background: var(--input-bg);
    border: 1px solid var(--input-border);
    border-radius: 4px;
    margin-left: auto;
  }
  .probe {
    font-size: 12px;
  }
  button.on {
    background: var(--hover);
  }
  .ok {
    color: var(--ok);
  }
  .bad {
    color: var(--err);
  }
  .err {
    margin: 4px 10px 0;
    font-size: 12px;
    color: var(--err);
  }
</style>
