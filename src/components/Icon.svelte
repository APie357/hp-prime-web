<script lang="ts">
  import { ICON_BODY, type IconName } from '../lib/icons';

  let { name, size = 16, label }: { name: IconName; size?: number; label?: string } = $props();
</script>

<svg
  class="mi"
  viewBox="0 -960 960 960"
  width={size}
  height={size}
  fill="currentColor"
  role={label ? 'img' : undefined}
  aria-label={label}
  aria-hidden={label ? undefined : 'true'}
>{@html ICON_BODY[name] ?? ''}</svg>

<style>
  .mi {
    display: inline-block;
    flex: none;
    vertical-align: middle;
  }
</style>
