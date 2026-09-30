<script lang="ts">
  import type { WheelPreset } from '../../lib/model';
  import type { Overlay } from '../../lib/live';
  import { newSegment, parseQuickWheel, segmentAngles, spinTarget, weightedIndex } from '../../lib/tools';
  import { app } from '../../lib/app.svelte';
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

  function move(i: number, d: number): void {
    const j = i + d;
    if (j < 0 || j >= wheel.segments.length) return;
    [wheel.segments[i], wheel.segments[j]] = [wheel.segments[j], wheel.segments[i]];
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

    <div class="segs">
      {#each wheel.segments as seg, i (seg.id)}
        <div class="seg">
          <input type="color" bind:value={seg.color} aria-label="Slice color" />
          <OutcomeEditor outcome={seg} placeholder="Slice label" />
          <label class="w" title="Weight (relative size / chance)">
            ×<input type="number" min="0.1" step="0.5" bind:value={seg.weight} />
          </label>
          <span class="pct muted">{pct[i]?.toFixed(0)}%</span>
          <button class="ghost small" onclick={() => move(i, -1)} disabled={i === 0}>▲</button>
          <button class="ghost small" onclick={() => move(i, 1)} disabled={i === wheel.segments.length - 1}>▼</button>
          <button class="ghost small" onclick={() => wheel.segments.splice(i, 1)} disabled={wheel.segments.length <= 2}>✕</button>
        </div>
      {/each}
    </div>
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
    <div class="preview">
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
