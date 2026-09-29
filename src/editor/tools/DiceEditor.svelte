<script lang="ts">
  import { newId, type DicePreset, type Die } from '../../lib/model';
  import type { Overlay } from '../../lib/live';
  import { rollPreset } from '../../lib/tools';
  import { app } from '../../lib/app.svelte';
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
          <label class="check">Count<input type="number" min="1" max="20" bind:value={d.count} class="n" /></label>
          <label class="check">Sides d<input type="number" min="2" max="1000" value={d.sides} onchange={(e) => setSides(d, +e.currentTarget.value)} class="n" /></label>
          <label class="check" title="Give each side its own label, details or effect (up to 100 sides)">
            <input type="checkbox" checked={!!d.customFaces} disabled={d.sides > 100} onchange={(e) => setCustom(d, e.currentTarget.checked)} /> Custom faces
          </label>
          <span class="spacer"></span>
          <button class="ghost small" onclick={() => preset.dice.splice(i, 1)} disabled={preset.dice.length <= 1}>✕ Remove die</button>
        </div>
        {#if d.customFaces}
          <div class="faces">
            {#each d.customFaces as face, fi}
              <div class="face"><span class="muted n0">{fi + 1}</span><OutcomeEditor outcome={face} placeholder="Face {fi + 1}" /></div>
            {/each}
          </div>
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
        <input type="number" bind:value={t.min} class="n" aria-label="From" />–<input type="number" bind:value={t.max} class="n" aria-label="To" />
        <OutcomeEditor outcome={t.outcome} placeholder="What happens" />
        <button class="ghost small" onclick={() => preset.totalOutcomes?.splice(i, 1)}>✕</button>
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
        {#if test}{#key test.nonce}<DiceView o={test} game={app.game} role="mirror" />{/key}{/if}
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
  h4 {
    margin: 12px 0 0;
  }
  p {
    margin: 0;
  }
  .small {
    font-size: 12px;
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
