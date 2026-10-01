<script lang="ts">
  import { newId, type DicePreset, type Die } from '../../lib/model';
  import type { Overlay } from '../../lib/live';
  import { diceCount, rollPreset } from '../../lib/tools';
  import { step } from '../../lib/history.svelte';
  import { faceLines } from '../../lib/listedit';
  import { app } from '../../lib/app.svelte';
  import { liveNumber } from '../../lib/numfield';
  import Stage from '../../lib/Stage.svelte';
  import DiceView from '../../play/tools/DiceView.svelte';
  import OutcomeEditor from './OutcomeEditor.svelte';

  let { preset }: { preset: DicePreset } = $props();
  let test = $state<Extract<Overlay, { kind: 'dice' }> | null>(null);

  function setCustom(d: Die, on: boolean): void {
    d.customFaces = on ? Array.from({ length: Math.min(d.sides, 100) }, (_, i) => ({ label: String(i + 1) })) : undefined;
  }

  function setSides(d: Die, n: number): void {
    d.sides = Math.max(2, Math.min(1000, Math.floor(n) || 2));
    if (d.customFaces) {
      while (d.customFaces.length < Math.min(d.sides, 100)) d.customFaces.push({ label: String(d.customFaces.length + 1) });
      d.customFaces.length = Math.min(d.sides, 100);
    }
  }

  /** The face lists being pasted, per die. */
  let pasted = $state<Record<string, string>>({});

  /** Faces 1… get the pasted lines (`resize`: first the die gets as many sides as there are lines). */
  function fill(d: Die, resize = false): void {
    const lines = faceLines(pasted[d.id] ?? '');
    step(`Filled the faces of “${preset.name}”`, () => {
      if (resize) setSides(d, lines.length);
      lines.forEach((label, i) => d.customFaces?.[i] && (d.customFaces[i].label = label));
    });
    pasted[d.id] = '';
  }

  function testRoll(): void {
    const p = JSON.parse(JSON.stringify(preset)) as DicePreset;
    test = { kind: 'dice', nonce: newId(), name: p.name, preset: p, roll: rollPreset(p), startedAt: Date.now(), duration: 1300 };
  }
</script>

<div class="de">
  <div class="left">
    <label class="field">Dice name<input bind:value={preset.name} /></label>
    {#each preset.dice as d, i (d.id)}
      <div class="die">
        <div class="row">
          <!-- Kept to what a die can be (1–20 of them, d2–d1000), and the box shows what was kept. -->
          <label class="check"
            >Count<input
              type="number"
              min="1"
              max="20"
              value={d.count}
              oninput={(e) => {
                const n = liveNumber(e.currentTarget.value, 1, 20);
                if (n !== null && Number.isInteger(n)) d.count = n;
              }}
              onchange={(e) => {
                d.count = diceCount(e.currentTarget.value, d.count);
                e.currentTarget.value = String(d.count);
              }}
              class="n"
            /></label
          >
          <label class="check"
            >Sides d<input
              type="number"
              min="2"
              max="1000"
              value={d.sides}
              onchange={(e) => {
                setSides(d, +e.currentTarget.value);
                e.currentTarget.value = String(d.sides);
              }}
              class="n"
            /></label
          >
          <label class="check" title="Give each side its own label, details or effect (up to 100 sides)">
            <input type="checkbox" checked={!!d.customFaces} disabled={d.sides > 100} onchange={(e) => setCustom(d, e.currentTarget.checked)} /> Custom faces
          </label>
          <span class="spacer"></span>
          <button class="ghost small danger" onclick={() => preset.dice.splice(i, 1)} disabled={preset.dice.length <= 1}>🗑 Delete die</button>
        </div>
        {#if d.customFaces}
          <div class="faces">
            {#each d.customFaces as face, fi}
              <div class="face"><span class="muted n0">{fi + 1}</span><OutcomeEditor outcome={face} placeholder="Face {fi + 1}" /></div>
            {/each}
          </div>
          {@const lines = faceLines(pasted[d.id] ?? '')}
          {@const faces = d.customFaces.length}
          <details class="fill">
            <summary class="muted small">Fill faces from a list (one per line)</summary>
            <textarea rows="4" bind:value={pasted[d.id]} aria-label="Face labels, one per line" placeholder={'Take a sip\nPick a victim\nSing a song\n…'}></textarea>
            <div class="row">
              <button class="small" onclick={() => fill(d)} disabled={!lines.length}>
                Fill {lines.length > 1 ? `faces 1–${Math.min(lines.length, faces)}` : 'face 1'}
              </button>
              {#if lines.length >= 2 && lines.length !== d.sides}
                <button class="small" onclick={() => fill(d, true)}>Fill and make it a d{lines.length}</button>
              {/if}
              {#if lines.length > faces}<span class="muted small">{lines.length - faces} line{lines.length - faces === 1 ? '' : 's'} more than it has sides</span>{/if}
            </div>
          </details>
        {/if}
      </div>
    {/each}
    <div class="row">
      <button onclick={() => preset.dice.push({ id: newId(), sides: 6, count: 1 })}>＋ Add another die</button>
      <label class="check"><input type="checkbox" bind:checked={preset.showTotal} /> Show the total</label>
    </div>

    <h4>Outcomes by total (optional)</h4>
    <p class="muted small">e.g. 2–4 → "Take a sip", 12 → "Pick a victim". Anything, not just points.</p>
    {#each preset.totalOutcomes ?? [] as t, i (t.id)}
      <div class="face">
        <!-- From above To: they swap round (a range 9–4 is 4–9). -->
        <input type="number" bind:value={t.min} class="n" aria-label="From" onchange={() => t.min > t.max && ([t.min, t.max] = [t.max, t.min])} />–<input
          type="number"
          bind:value={t.max}
          class="n"
          aria-label="To"
          onchange={() => t.min > t.max && ([t.min, t.max] = [t.max, t.min])}
        />
        <OutcomeEditor outcome={t.outcome} placeholder="What happens" />
        <button class="ghost small" onclick={() => preset.totalOutcomes?.splice(i, 1)} aria-label="Delete this total" title="Delete">🗑</button>
      </div>
    {/each}
    <div>
      <button
        class="small"
        onclick={() => {
          preset.totalOutcomes ??= [];
          preset.totalOutcomes.push({ id: newId(), min: 1, max: 1, outcome: { label: '' } });
        }}>＋ Add range</button>
    </div>
  </div>
  <div class="right">
    <div class="preview">
      <Stage>
        <div class="bg"></div>
        <!-- Before a test roll: the dice waiting to be rolled, as viewers see them. -->
        {#key test?.nonce}<DiceView o={test ?? { kind: 'dice', nonce: 'p', name: preset.name, preset, roll: null, startedAt: 0, duration: 0 }} game={app.game} role="mirror" />{/key}
      </Stage>
    </div>
    <button onclick={testRoll}>🎲 Test roll</button>
  </div>
</div>

<style>
  .de {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 380px;
    gap: 16px;
  }
  .left {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .die {
    padding: 8px;
    border: 1px solid var(--border);
    border-radius: 8px;
  }
  .faces {
    margin-top: 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 360px;
    overflow: auto;
  }
  .face {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: flex-start;
  }
  .n {
    width: 70px;
  }
  .n0 {
    width: 24px;
    text-align: right;
    padding-top: 6px;
  }
  .fill {
    margin-top: 6px;
  }
  .fill textarea {
    width: 100%;
    margin: 4px 0;
  }
  h4 {
    margin: 12px 0 0;
  }
  p {
    margin: 0;
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
    .de {
      grid-template-columns: 1fr;
    }
  }
</style>
