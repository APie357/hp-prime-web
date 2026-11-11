<script lang="ts">
  import { clearLog, log, logEntries, logPackets } from '../lib/hid/log';
  import { hex, parseHex } from '../lib/hid/bytes';
  import { app, sendRaw, setPadReports } from '../lib/state.svelte';

  let box: HTMLDivElement;
  let rawHex = $state('FF');
  let expectReply = $state(true);

  $effect(() => {
    $logEntries;
    queueMicrotask(() => box && (box.scrollTop = box.scrollHeight));
  });

  async function doRaw(e: Event) {
    e.preventDefault();
    try {
      const r = await sendRaw(parseHex(rawHex), expectReply);
      if (expectReply && r !== undefined) log('info', r ? `reply (${r.length} B): ${hex(r, 256)}` : 'no reply');
    } catch (err) {
      alert((err as Error).message);
    }
  }

  /** Experiments, e.g. for clearing the calculator's Messages "Help•" flag (see TODO.md). */
  const presets: [string, string][] = [
    ['FF', 'ready check'],
    ['F2 01 00 00 00 02 00 00', 'help-clear? empty chat (echo of Help)'],
    ['F2 02 00 00 00 02 00 00', 'help-clear? empty chat, flag 02'],
    ['F2 03 00 00 00 02 00 00', 'help-clear? empty chat, flag 03 (PrimeDev chat flag)'],
    ['F2 01 00 00 00 00', 'help-clear? zero-length chat'],
    ['F2 03 00 00 00 00', 'help-clear? zero-length chat, flag 03'],
    ['F2 00 00 00 00 02 00 00', 'help-clear? empty chat, flag 00'],
    ['F3 01 00 00 00 00', 'unknown opcode F3 (empty)'],
    ['F4 01 00 00 00 00', 'unknown opcode F4 (empty)'],
    ['F5 01 00 00 00 00', 'unknown opcode F5 (empty)'],
    ['F6 01 00 00 00 00', 'unknown opcode F6 (empty)'],
  ];

  const time = (t: number) => new Date(t).toLocaleTimeString([], { hour12: false });
</script>

<section class="console">
  <header>
    <h2>Console</h2>
    <label><input type="checkbox" bind:checked={$logPackets} /> packets</label>
    <label title="Pad outgoing HID reports to the full report size">
      <input type="checkbox" checked={app.padReports} onchange={(e) => setPadReports(e.currentTarget.checked)} /> pad reports
    </label>
    <label><input type="checkbox" bind:checked={app.verifyAfterSend} /> verify after send</label>
    <form class="raw" onsubmit={doRaw}>
      <input bind:value={rawHex} placeholder="raw message hex" spellcheck="false" list="raw-presets" disabled={!app.connected} />
      <datalist id="raw-presets">
        {#each presets as [bytes, label] (bytes)}<option value={bytes}>{label}</option>{/each}
      </datalist>
      <label><input type="checkbox" bind:checked={expectReply} /> reply</label>
      <button type="submit" disabled={!app.connected || !!app.busy}>Send raw</button>
    </form>
    <button onclick={clearLog}>Clear</button>
  </header>
  <div class="log" bind:this={box}>
    {#each $logEntries as e (e.id)}
      <div class="entry {e.kind}"><span class="t">{time(e.t)}</span><span class="k">{e.kind}</span><span class="x">{e.text}</span></div>
    {/each}
  </div>
</section>

<style>
  .console {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
    background: var(--panel);
  }
  header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 4px 10px;
    border-bottom: 1px solid var(--border);
    font-size: 12px;
    flex-wrap: wrap;
  }
  h2 {
    margin: 0;
  }
  .raw {
    display: flex;
    gap: 6px;
    align-items: center;
    margin-left: auto;
  }
  .raw input:not([type]) {
    width: 220px;
    font-family: var(--mono);
    font-size: 12px;
  }
  .log {
    flex: 1;
    overflow: auto;
    font-family: var(--mono);
    font-size: 12px;
    padding: 4px 10px;
  }
  .entry {
    display: flex;
    gap: 8px;
    white-space: pre-wrap;
    word-break: break-all;
  }
  .t {
    color: var(--muted);
    flex: none;
  }
  .k {
    flex: none;
    width: 36px;
    color: var(--muted);
  }
  .out .k {
    color: #6fb3ff;
  }
  .in .k {
    color: #8bd17c;
  }
  .warn .x {
    color: #e5c07b;
  }
  .error .x {
    color: #f07178;
  }
  .ok .x {
    color: #8bd17c;
  }
  .out .x,
  .in .x {
    color: #a9b1c1;
  }
</style>
