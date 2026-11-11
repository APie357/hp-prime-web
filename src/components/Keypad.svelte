<script lang="ts">
  import { KEYS, type PrimeKey } from '../lib/hid/keys';
  import { pressKeys } from '../lib/state.svelte';
  import Icon from './Icon.svelte';
  import type { IconName } from '../lib/icons';

  /** Cursor keys get Material arrows instead of their text labels. */
  const ARROWS: Record<number, IconName> = {
    2: 'keyboard_arrow_up',
    7: 'keyboard_arrow_left',
    8: 'keyboard_arrow_right',
    12: 'keyboard_arrow_down',
  };

  const key = (code: number): PrimeKey => KEYS[code];
  // Layout of the physical keyboard, top to bottom. 0 is a gap.
  const top = [
    [0, 1, 3, 4],
    [5, 6, 9, 10],
  ].map((r) => r.map(key));
  const nav = { up: key(2), left: key(7), right: key(8), down: key(12), num: key(11), menu: key(13) };
  const main = [
    [14, 15, 16, 17, 18, 19],
    [20, 21, 22, 23, 24, 25],
    [26, 27, 28, 29, 30],
    [31, 32, 33, 34, 35],
    [36, 37, 38, 39, 40],
    [41, 42, 43, 44, 45],
    [46, 47, 48, 49, 50],
  ].map((r) => r.map(key));

  const cls = (k: PrimeKey) =>
    k.code === 30 ? 'enter' : k.code === 36 ? 'alpha' : k.code === 41 ? 'shift' : /^[0-9.]$/.test(k.label) ? 'digit' : '';
</script>

{#snippet btn(k: PrimeKey)}
  <button class="key {cls(k)}" onclick={() => pressKeys([k.code])} title="Key {k.code}{k.alpha ? ` · Alpha: ${k.alpha}` : ''}">
    <span class="lbl">{#if ARROWS[k.code]}<Icon name={ARROWS[k.code]} size={18} label={k.label} />{:else}{k.label}{/if}</span>
    {#if k.alpha}<span class="alpha-lbl">{k.alpha}</span>{/if}
  </button>
{/snippet}

<div class="keypad">
  <div class="upper">
    <div class="topgrid">
      {#each top as row}{#each row as k (k.code)}{@render btn(k)}{/each}{/each}
      {@render btn(nav.num)}{@render btn(nav.menu)}
    </div>
    <div class="dpad">
      <span></span>{@render btn(nav.up)}<span></span>
      {@render btn(nav.left)}<span></span>{@render btn(nav.right)}
      <span></span>{@render btn(nav.down)}<span></span>
    </div>
  </div>
  {#each main as row, i (i)}
    <div class="row" class:six={row.length === 6}>
      {#each row as k (k.code)}{@render btn(k)}{/each}
    </div>
  {/each}
</div>

<style>
  .keypad {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 6px 10px 10px;
  }
  .upper {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 6px;
    margin-bottom: 3px;
  }
  .topgrid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 3px;
  }
  .dpad {
    display: grid;
    grid-template-columns: repeat(3, 26px);
    grid-auto-rows: 22px;
    gap: 2px;
  }
  .row {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 3px;
  }
  .row.six {
    grid-template-columns: repeat(6, 1fr);
  }
  /* Keys look like the calculator's in both themes. */
  .key {
    background: #3a3d41;
    border-color: #4a4d52;
    color: #e6e6e6;
    position: relative;
    font-size: 11px;
    padding: 4px 2px 7px;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    line-height: 1.1;
  }
  .key:hover:not(:disabled) {
    background: #4a4e54;
  }
  .dpad .key {
    padding: 0;
  }
  .alpha-lbl {
    position: absolute;
    right: 3px;
    bottom: 0;
    font-size: 9px;
    color: #e8a23a;
  }
  .digit {
    background: #50545a;
  }
  .enter {
    background: #2d5f99;
  }
  .alpha {
    color: #e8a23a;
  }
  .shift {
    color: #6fb7ff;
  }
</style>
