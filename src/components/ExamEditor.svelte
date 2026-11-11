<script lang="ts">
  import Icon from './Icon.svelte';
  import {
    diffBits,
    EXAM_FEATURES,
    EXAM_NAME_BYTES,
    EXAM_SAMPLE_SIZE,
    examName,
    getBit,
    setBit,
  } from '../lib/files/exam';
  import { fileType } from '../lib/files/kinds';
  import { programNameFromFile } from '../lib/files/workspace';
  import { app, examVersion, readExamFile, writeExamFile } from '../lib/state.svelte';

  let { file }: { file: string } = $props();

  let data = $state.raw<Uint8Array | null>(null);
  let error = $state<string | null>(null);

  $effect(() => {
    void examVersion.n;
    readExamFile(file).then(
      (d) => {
        data = d;
        error = null;
      },
      (e) => (error = (e as Error).message),
    );
  });

  const fileName = $derived(programNameFromFile(file));
  const storedName = $derived(data ? examName(data) : '');

  async function update(next: Uint8Array) {
    data = next;
    try {
      await writeExamFile(file, next);
    } catch (e) {
      error = `Couldn't save: ${(e as Error).message}`;
    }
  }

  // ---- compare (for mapping settings: change one option on the calculator, compare the two)
  const CALC = 'calc:';
  let compareWith = $state('');
  let other = $state.raw<Uint8Array | null>(null);
  const choices = $derived([
    ...app.calcExams.map((e) => ({ id: CALC + e.name, label: `Calculator: ${e.name}` })),
    ...app.files.filter((f) => fileType(f) === 'exam' && f !== file).map((f) => ({ id: f, label: f })),
  ]);
  $effect(() => {
    const id = compareWith;
    void examVersion.n;
    if (!id) {
      other = null;
      return;
    }
    if (id.startsWith(CALC)) {
      other = app.calcExams.find((e) => e.name === id.slice(CALC.length))?.data ?? null;
      return;
    }
    readExamFile(id).then(
      (d) => compareWith === id && (other = d),
      () => (other = null),
    );
  });
  const diffs = $derived(data && other ? diffBits(data, other) : []);
  const diffOffsets = $derived(new Set(diffs.map((d) => d.offset)));

  // ---- raw bytes
  let onlyNonZero = $state(true);
  let selected = $state<number | null>(null);
  const hex = (n: number, w = 2) => n.toString(16).toUpperCase().padStart(w, '0');
  const rows = $derived.by(() => {
    if (!data) return [];
    const out: number[] = [];
    for (let off = EXAM_NAME_BYTES; off < data.length; off += 16) {
      const end = Math.min(off + 16, data.length);
      const show =
        !onlyNonZero ||
        data.subarray(off, end).some((b) => b !== 0) ||
        (other && other.subarray(off, end).some((b) => b !== 0)) ||
        (selected !== null && selected >= off && selected < end);
      if (show) out.push(off);
    }
    return out;
  });
  const setCount = $derived.by(() => {
    if (!data) return 0;
    let n = 0;
    for (let i = EXAM_NAME_BYTES; i < data.length; i++) for (let b = data[i]; b; b &= b - 1) n++;
    return n;
  });
</script>

<div class="exam">
  {#if error}
    <p class="err">{error}</p>
  {/if}
  {#if data}
    <header>
      <Icon name="shield_lock" size={22} />
      <div>
        <h2 class="title">{fileName}</h2>
        <p class="muted">Exam-mode configuration · {data.length} bytes · {setCount} bits set</p>
      </div>
    </header>

    <div class="note">
      <Icon name="science" size={16} />
      <div>
        HP doesn't document this format. Only the name is decoded so far, so the options are shown as raw bits.
        Everything else is kept byte for byte. Sending exam configurations hasn't been tried on hardware yet.
      </div>
    </div>
    {#if data.length !== EXAM_SAMPLE_SIZE}
      <p class="warn">This file is {data.length} bytes; the only known sample is {EXAM_SAMPLE_SIZE} bytes.</p>
    {/if}
    {#if storedName !== fileName}
      <p class="warn">
        The name stored inside is “{storedName || '(empty)'}”. Sending sets it to “{fileName}”, the file name.
      </p>
    {/if}

    <section>
      <h3>Options</h3>
      {#if EXAM_FEATURES.length}
        <ul class="features">
          {#each EXAM_FEATURES as f (f.offset * 8 + f.bit)}
            <li style:padding-left="{(f.depth ?? 0) * 18}px">
              <label>
                <input
                  type="checkbox"
                  checked={!!getBit(data, f.offset, f.bit)}
                  onchange={(e) => update(setBit(data!, f.offset, f.bit, e.currentTarget.checked))}
                />
                {f.label}
              </label>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="muted">
          None of the options (timeout, password, erase memory, Blink LED, disabled features) have been located in
          the file yet. To find one, change just that option on the calculator, send the configuration here, and
          compare it with the previous copy below.
        </p>
      {/if}
    </section>

    <section>
      <h3>Compare</h3>
      <div class="row">
        <select bind:value={compareWith} aria-label="Configuration to compare with">
          <option value="">Compare with…</option>
          {#each choices as c (c.id)}
            <option value={c.id}>{c.label}</option>
          {/each}
        </select>
      </div>
      {#if compareWith && other}
        {#if diffs.length}
          <table class="diffs">
            <thead><tr><th>Byte</th><th>Bit</th><th>This</th><th>Other</th></tr></thead>
            <tbody>
              {#each diffs as d (d.offset * 8 + d.bit)}
                <tr>
                  <td><button class="link" onclick={() => (selected = d.offset)}>0x{hex(d.offset, 3)}</button></td>
                  <td>{d.bit}</td>
                  <td>{d.a}</td>
                  <td>{d.b}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        {:else}
          <p class="muted">Identical apart from the name.</p>
        {/if}
      {:else if compareWith}
        <p class="muted">Loading…</p>
      {/if}
    </section>

    <section>
      <h3>Raw bytes</h3>
      <label class="check"><input type="checkbox" bind:checked={onlyNonZero} /> Hide all-zero rows</label>
      <div class="hexdump" role="grid" aria-label="Configuration bytes">
        {#each rows as off (off)}
          <div class="hexrow" role="row">
            <span class="addr">{hex(off, 3)}</span>
            {#each Array.from({ length: Math.min(16, data.length - off) }, (_, i) => off + i) as i (i)}
              <button
                class="byte"
                class:zero={data[i] === 0}
                class:diff={diffOffsets.has(i)}
                class:sel={selected === i}
                role="gridcell"
                title="0x{hex(i, 3)}"
                onclick={() => (selected = selected === i ? null : i)}>{hex(data[i])}</button
              >
            {/each}
          </div>
        {/each}
      </div>
      {#if selected !== null && selected < data.length}
        {@const at = selected}
        <div class="bits">
          <span>Byte 0x{hex(at, 3)}:</span>
          {#each [7, 6, 5, 4, 3, 2, 1, 0] as b (b)}
            <label title="Bit {b}">
              <input type="checkbox" checked={!!getBit(data, at, b)} onchange={(e) => update(setBit(data!, at, b, e.currentTarget.checked))} />
              {b}
            </label>
          {/each}
        </div>
      {/if}
    </section>
  {:else if !error}
    <p class="muted">Loading…</p>
  {/if}
</div>

<style>
  .exam {
    position: absolute;
    inset: 0;
    z-index: 2;
    overflow: auto;
    padding: 16px 24px 32px;
    background: var(--bg);
    font-size: 13px;
  }
  header {
    display: flex;
    align-items: center;
    gap: 12px;
    color: var(--accent);
  }
  header .title {
    font-size: 16px;
    text-transform: none;
    letter-spacing: 0;
    color: var(--fg);
    font-family: var(--mono);
  }
  header p {
    margin: 2px 0 0;
  }
  .note {
    display: flex;
    gap: 8px;
    max-width: 720px;
    margin: 16px 0 8px;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--panel);
    color: var(--muted);
  }
  .warn {
    color: var(--warn);
  }
  .err {
    color: var(--err);
  }
  section {
    margin-top: 20px;
    max-width: 720px;
  }
  h3 {
    margin: 0 0 8px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
  }
  .features {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .features li {
    padding: 2px 0;
  }
  select {
    font: inherit;
    color: var(--fg);
    background: var(--input-bg);
    border: 1px solid var(--input-border);
    border-radius: 4px;
    padding: 2px 4px;
  }
  .diffs {
    margin-top: 8px;
    border-collapse: collapse;
    font-family: var(--mono);
  }
  .diffs th,
  .diffs td {
    padding: 2px 12px 2px 0;
    text-align: left;
  }
  .diffs th {
    font-family: inherit;
    font-weight: 600;
    color: var(--muted);
  }
  .link {
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    color: var(--accent);
    cursor: pointer;
  }
  .check {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
  }
  .hexdump {
    font-family: var(--mono);
    font-size: 12px;
  }
  .hexrow {
    display: flex;
    gap: 2px;
  }
  .addr {
    width: 40px;
    color: var(--muted);
    line-height: 20px;
  }
  .byte {
    width: 26px;
    height: 20px;
    padding: 0;
    font: inherit;
    background: none;
    border: 1px solid transparent;
    border-radius: 3px;
    color: var(--fg);
    cursor: pointer;
  }
  .byte.zero {
    color: var(--muted);
    opacity: 0.6;
  }
  .byte:hover {
    background: var(--hover);
  }
  .byte.diff {
    background: color-mix(in srgb, var(--warn) 25%, transparent);
    opacity: 1;
  }
  .byte.sel {
    border-color: var(--accent);
  }
  .bits {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    margin-top: 8px;
    font-family: var(--mono);
  }
  .bits label {
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }
</style>
