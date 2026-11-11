<script lang="ts">
  /**
   * Drag handle between two panels. Reports the pointer movement since the drag started;
   * double-click resets. Arrow keys move it by 16 px for keyboard users.
   */
  let {
    dir,
    label,
    onstart,
    ondrag,
    onend,
    onreset,
  }: {
    dir: 'x' | 'y';
    label: string;
    onstart: () => void;
    ondrag: (delta: number) => void;
    onend: () => void;
    onreset: () => void;
  } = $props();

  let origin = 0;
  let dragging = $state(false);

  function down(e: PointerEvent) {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    origin = dir === 'x' ? e.clientX : e.clientY;
    dragging = true;
    onstart();
    e.preventDefault();
  }
  function move(e: PointerEvent) {
    if (dragging) ondrag((dir === 'x' ? e.clientX : e.clientY) - origin);
  }
  function up() {
    if (!dragging) return;
    dragging = false;
    onend();
  }
  function key(e: KeyboardEvent) {
    const step = e.shiftKey ? 64 : 16;
    const keys = dir === 'x' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
    const i = keys.indexOf(e.key);
    if (i < 0) return;
    e.preventDefault();
    onstart();
    ondrag(i === 0 ? -step : step);
    onend();
  }
</script>

<!-- A focusable separator is an interactive ARIA widget (it can be moved with the arrow keys). -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  class="splitter {dir}"
  class:dragging
  role="separator"
  aria-orientation={dir === 'x' ? 'vertical' : 'horizontal'}
  aria-label={label}
  title="{label} (drag; double-click to reset)"
  tabindex="0"
  onpointerdown={down}
  onpointermove={move}
  onpointerup={up}
  onpointercancel={up}
  ondblclick={onreset}
  onkeydown={key}
></div>

<style>
  .splitter {
    position: relative;
    z-index: 5;
    background: var(--border);
    touch-action: none;
  }
  .splitter.x {
    width: 1px;
    cursor: col-resize;
  }
  .splitter.y {
    height: 1px;
    cursor: row-resize;
  }
  /* Wider invisible grab area. */
  .splitter::after {
    content: '';
    position: absolute;
  }
  .splitter.x::after {
    inset: 0 -3px;
  }
  .splitter.y::after {
    inset: -3px 0;
  }
  .splitter:hover,
  .splitter:focus-visible,
  .splitter.dragging {
    background: var(--splitter);
    outline: none;
  }
  .splitter.x:hover,
  .splitter.x:focus-visible,
  .splitter.x.dragging {
    box-shadow: 0 0 0 1px var(--splitter);
  }
  .splitter.y:hover,
  .splitter.y:focus-visible,
  .splitter.y.dragging {
    box-shadow: 0 0 0 1px var(--splitter);
  }
</style>
