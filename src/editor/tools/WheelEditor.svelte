<!--
  A saved wheel: its slices (drag ⋮⋮ or Alt+↑/↓ to reorder, Enter in a label for the next one), and a preview that
  test-spins. A click on a slice of the preview goes to its row.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import type { WheelPreset, WheelSegment } from '../../lib/model';
  import type { Overlay } from '../../lib/live';
  import { MIN_WEIGHT, newSegment, parseQuickWheel, segmentAngles, sliceWeight, spinTarget, weightedIndex } from '../../lib/tools';
  import { app } from '../../lib/app.svelte';
  import { DragOrder, rowKeys } from '../../lib/dragorder.svelte';
  import { step } from '../../lib/history.svelte';
  import { copySegment, moveTo } from '../../lib/listedit';
  import { showMenu } from '../../lib/menustate.svelte';
  import { flash } from '../../lib/nav.svelte';
  import { isTextField } from '../../lib/undokeys';
  import Stage from '../../lib/Stage.svelte';
  import WheelView from '../../play/tools/WheelView.svelte';
  import OutcomeEditor from './OutcomeEditor.svelte';

  let { wheel }: { wheel: WheelPreset } = $props();
  const pct = $derived(segmentAngles(wheel.segments).map((a) => ((a.end - a.start) / 360) * 100));
  let paste = $state('');
  let test = $state<Extract<Overlay, { kind: 'wheel' }> | null>(null);

  function testSpin(): void {
    const segments = JSON.parse(JSON.stringify(wheel.segments));
    const from = test?.rotation ?? 0;
    const index = weightedIndex(segments.map((s: { weight: number }) => s.weight));
    const to = spinTarget(segments, index, from);
    test = { kind: 'wheel', nonce: 'test', name: wheel.name, segments, rotation: to, spin: { from, to, startedAt: Date.now(), duration: wheel.spinDurationMs }, result: index };
  }

  const name = (s: WheelSegment) => s.label.trim() || 'untitled';

  /** Move the slice at `i` to `j` (▲▼, Alt+↑/↓ or a drag: one step). */
  function move(i: number, j: number): void {
    const s = wheel.segments[i];
    if (!s || j < 0 || j >= wheel.segments.length || i === j) return;
    step(`Moved slice “${name(s)}” ${j < i ? 'up' : 'down'}`, () => moveTo(wheel.segments, i, j));
  }

  let segsEl = $state<HTMLElement>();
  /** Put the typing in a slice's label (after the rows are drawn). */
  function focusLabel(id: string): void {
    void tick().then(() => segsEl?.querySelector<HTMLInputElement>(`[data-seg="${id}"] input.label`)?.focus());
  }

  function duplicate(i: number): void {
    const copy = copySegment(wheel.segments[i]);
    step(`Duplicated slice “${name(wheel.segments[i])}”`, () => wheel.segments.splice(i + 1, 0, copy));
    focusLabel(copy.id);
  }

  // Deleting is done at once: the note at the bottom offers Undo.
  function remove(i: number): void {
    if (wheel.segments.length <= 2) return;
    step(`Deleted slice “${name(wheel.segments[i])}”`, () => wheel.segments.splice(i, 1), { notify: true });
  }

  /** Keyboard-first: Enter starts the next slice, Backspace in an empty label deletes it (back to the one before). */
  function labelKey(e: KeyboardEvent, i: number): void {
    if (e.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      const s = newSegment('', wheel.segments.length);
      step('Added slice', () => wheel.segments.splice(i + 1, 0, s));
      focusLabel(s.id);
    } else if (e.key === 'Backspace' && !wheel.segments[i].label && wheel.segments.length > 2) {
      e.preventDefault();
      const back = wheel.segments[i - 1] ?? wheel.segments[i + 1];
      step('Deleted an empty slice', () => wheel.segments.splice(i, 1));
      focusLabel(back.id);
    }
  }

  const rows = new DragOrder();

  /** A slice's right-click menu (not in its text fields, which keep the browser's own). */
  function rowMenu(e: MouseEvent, i: number): void {
    if (isTextField(e.target)) return;
    const n = wheel.segments.length;
    showMenu(e, [
      { heading: name(wheel.segments[i]) },
      { label: '⧉ Duplicate', onclick: () => duplicate(i), keys: 'Ctrl+D' },
      { label: '▲ Move up', onclick: () => move(i, i - 1), disabled: i === 0, keys: 'Alt+↑' },
      { label: '▼ Move down', onclick: () => move(i, i + 1), disabled: i === n - 1, keys: 'Alt+↓' },
      { sep: true },
      { label: '🗑 Delete slice', danger: true, onclick: () => remove(i), disabled: n <= 2 },
    ]);
  }

  /** A click on a slice of the preview goes to its row. */
  function previewClick(e: MouseEvent): void {
    const at = (e.target as Element).closest('[data-slice]')?.getAttribute('data-slice');
    const s = at === null || at === undefined ? undefined : wheel.segments[+at];
    if (!s) return;
    focusLabel(s.id);
    flash(`slice:${s.id}`);
  }
</script>

<div class="we">
  <div class="left">
    <div class="row">
      <label class="field grow">Wheel name<input bind:value={wheel.name} /></label>
      <label class="field">Spin (s)<input type="number" min="1" max="30" value={wheel.spinDurationMs / 1000} oninput={(e) => (wheel.spinDurationMs = Math.max(1, +e.currentTarget.value || 5) * 1000)} class="n" /></label>
    </div>
    <label class="check"><input type="checkbox" bind:checked={wheel.removeAfterLanding} /> Each slice can only land once (removed after it lands)</label>
    <p class="muted small">Slice size = landing chance. Outcomes can be anything: punishments, dares, prompts, numbers. Score effects are optional.</p>

    <div class="segs" role="list" aria-label="Slices" bind:this={segsEl}>
      {#each wheel.segments as seg, i (seg.id)}
        {@const line = rows.lineAt(seg.id)}
        <div
          class="seg drag-row"
          class:drop-before={line === 'before'}
          class:drop-after={line === 'after'}
          class:dragging={rows.dragging === seg.id}
          role="listitem"
          data-seg={seg.id}
          data-place="slice:{seg.id}"
          ondragover={(e) => rows.over(e, seg.id)}
          ondrop={(e) => {
            const m = rows.drop(e, wheel.segments.map((x) => x.id));
            if (m) move(m.from, m.to);
          }}
          oncontextmenu={(e) => rowMenu(e, i)}
          use:rowKeys={{ move: (d) => move(i, i + d), duplicate: () => duplicate(i) }}
        >
          <span
            class="drag-grip"
            draggable="true"
            ondragstart={(e) => rows.start(e, seg.id, (e.currentTarget as HTMLElement).parentElement)}
            ondragend={() => rows.end()}
            aria-hidden="true"
            title="Drag to reorder (or Alt+↑/↓)">⋮⋮</span
          >
          <input type="color" bind:value={seg.color} aria-label="Slice color" />
          <OutcomeEditor outcome={seg} placeholder="Slice label" labelkey={(e) => labelKey(e, i)} />
          <label class="w" title="Weight: how big the slice is, and how likely (at least {MIN_WEIGHT}; delete a slice to take it off)">
            ×<input
              type="number"
              min={MIN_WEIGHT}
              step="0.5"
              value={seg.weight}
              oninput={(e) => {
                // (A blank or 0 while typing a new number isn't kept: only a weight the wheel can use.)
                const n = Number(e.currentTarget.value);
                if (e.currentTarget.value.trim() !== '' && n >= MIN_WEIGHT) seg.weight = n;
              }}
              onchange={(e) => {
                seg.weight = sliceWeight(e.currentTarget.value);
                e.currentTarget.value = String(seg.weight);
              }}
              aria-label="{seg.label.trim() || `Option ${i + 1}`} weight"
            />
          </label>
          <span class="pct muted">{pct[i]?.toFixed(0)}%</span>
          <button class="ghost small" onclick={() => move(i, i - 1)} disabled={i === 0} aria-label="Move up">▲</button>
          <button class="ghost small" onclick={() => move(i, i + 1)} disabled={i === wheel.segments.length - 1} aria-label="Move down">▼</button>
          <button class="ghost small" onclick={() => duplicate(i)} aria-label="Duplicate slice" title="Duplicate slice (Ctrl+D)">⧉</button>
          <button class="ghost small" onclick={() => remove(i)} disabled={wheel.segments.length <= 2} aria-label="Delete slice" title={wheel.segments.length <= 2 ? 'A wheel needs two slices' : 'Delete slice'}>🗑</button>
        </div>
      {/each}
    </div>
    <p class="muted small">Enter in a label adds the next slice · drag ⋮⋮ or Alt+↑/↓ to reorder · click a slice on the wheel to find it</p>
    <div class="row">
      <button onclick={() => wheel.segments.push(newSegment(`Option ${wheel.segments.length + 1}`, wheel.segments.length))}>＋ Add slice</button>
    </div>
    <details>
      <summary class="muted small">Add many at once (one per line)</summary>
      <textarea rows="4" bind:value={paste} placeholder={'Sing a song x3\nDo 10 push-ups\nSpeak in rhymes\n(x3 = three times as likely)'}></textarea>
      <button
        class="small"
        onclick={() => {
          // Like the quick wheel in play: "Sing a song x3" is a slice three times the size.
          for (const o of parseQuickWheel(paste)) wheel.segments.push({ ...newSegment(o.label, wheel.segments.length), weight: o.weight });
          paste = '';
        }}>Add lines</button>
    </details>
  </div>

  <div class="right">
    <!-- (The slices' rows are the keyboard's way to them.) -->
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="preview" onclick={previewClick} title="Click a slice to find it in the list">
      <Stage>
        <div class="bg"></div>
        <WheelView o={test ?? { kind: 'wheel', nonce: 'p', name: wheel.name, segments: wheel.segments, rotation: 0, spin: null, result: null }} game={app.game} role="mirror" />
      </Stage>
    </div>
    <button onclick={testSpin}>🎡 Test spin</button>
  </div>
</div>

<style>
  .we {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 380px;
    gap: 16px;
  }
  .left {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .grow {
    flex: 1;
  }
  .n {
    width: 70px;
  }
  .segs {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  /* A slice's "More" opens on a row of its own under it (full width, not squeezed between the other fields). */
  .seg {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 6px;
  }
  .seg .drag-grip {
    padding-top: 7px;
  }
  .preview :global([data-slice]) {
    cursor: pointer;
  }
  .w {
    display: flex;
    align-items: center;
    gap: 2px;
    color: var(--muted);
  }
  .w input {
    width: 60px;
  }
  .pct {
    width: 36px;
    text-align: right;
    font-size: 12px;
    padding-top: 6px;
  }
  .small {
    font-size: 12px;
  }
  p {
    margin: 0;
  }
  details textarea {
    width: 100%;
    margin: 4px 0;
  }
  .right {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .preview {
    aspect-ratio: 16 / 9;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid var(--border);
  }
  .bg {
    position: absolute;
    inset: 0;
    background: radial-gradient(circle, #1422a0, #000014);
  }
  @media (max-width: 900px) {
    .we {
      grid-template-columns: 1fr;
    }
  }
</style>
