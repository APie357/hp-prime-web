<script lang="ts">
  import Keypad from './Keypad.svelte';
  import Icon from './Icon.svelte';
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
    <button
      class="live"
      class:on={screen.live}
      aria-pressed={screen.live}
      disabled={!app.connected}
      title={screen.live ? 'Stop the live mirror' : 'Mirror the screen live (refresh continuously)'}
      onclick={() => setLive(!screen.live)}><Icon name="circle-fill" size={8} />Live</button
    >
    <button class="icon" title="Take a screenshot" aria-label="Take a screenshot" disabled={!app.connected} onclick={() => captureScreen()}
      ><Icon name="photo_camera" size={16} /></button
    >
    <button class="icon" title="Save the screenshot as PNG" aria-label="Save the screenshot as PNG" disabled={!screen.image} onclick={savePng}
      ><Icon name="download" size={16} /></button
    >
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

  {#if ui.remoteKeys}
    <div class="row probe">
      <button onclick={toggleKeypad} aria-pressed={screen.showKeypad} class:on={screen.showKeypad}>Keypad</button>
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
  /* Same metrics as the Files/Calculator panel headers: 8px padding, 24px buttons. */
  header {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px;
  }
  h2 {
    padding-left: 8px;
  }
  header button {
    box-sizing: border-box;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
  }
  header .icon {
    width: 24px;
    padding: 0;
  }
  .spacer {
    flex: 1;
  }
  /* Toggle: the dot turns red while the live mirror runs. */
  header .live {
    gap: 5px;
    padding: 0 8px;
    color: var(--muted);
  }
  .live :global(svg) {
    color: var(--muted);
  }
  header .live.on {
    color: var(--fg);
    border-color: #e5484d;
    background: var(--sel);
  }
  .live.on :global(svg) {
    color: #e5484d;
  }
  .screen {
    margin: 0 8px;
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
    padding: 6px 8px 0;
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
    margin: 4px 8px 0;
    font-size: 12px;
    color: var(--err);
  }
</style>
