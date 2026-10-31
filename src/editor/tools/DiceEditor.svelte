<script lang="ts">
  import { untrack } from 'svelte';
  import { keepNum, shown } from './numbox';
  import { newId, type DicePreset, type Die } from '../../lib/model';
  import type { Overlay } from '../../lib/live';
  import { diceCount, rollPreset } from '../../lib/tools';
  import { step } from '../../lib/history.svelte';
  import { copyDie, copyTotal, faceLines } from '../../lib/listedit';
  import { menuItem, menuOf, showMenu, type MenuEntry } from '../../lib/menustate.svelte';
  import { rowKeys } from '../../lib/dragorder.svelte';
  import { isTextField } from '../../lib/undokeys';
  import RowTools from '../RowTools.svelte';
  import { app, toast } from '../../lib/app.svelte';
  import { liveNumber } from '../../lib/numfield';
  import Stage from '../../lib/Stage.svelte';
  import DiceView from '../../play/tools/DiceView.svelte';
  import OutcomeEditor from './OutcomeEditor.svelte';

  let { preset }: { preset: DicePreset } = $props();
  let test = $state<Extract<Overlay, { kind: 'dice' }> | null>(null);
  // An edit after a test roll: the preview shows the dice as they are now, not that roll.
  $effect(() => {
    void JSON.stringify([preset.name, preset.dice, preset.showTotal]);
    untrack(() => (test = null));
  });

  function setCustom(d: Die, on: boolean): void {
    d.customFaces = on ? Array.from({ length: Math.min(d.sides, 100) }, (_, i) => ({ label: String(i + 1) })) : undefined;
  }

  function setSides(d: Die, n: number): void {
    // With custom faces, at most 100 (a face each): past that the faces would roll with no label or effect.
    d.sides = Math.max(2, Math.min(d.customFaces ? 100 : 1000, Math.floor(n) || 2));
    if (d.customFaces) {
      while (d.customFaces.length < d.sides) d.customFaces.push({ label: String(d.customFaces.length + 1) });
      // Faces past the new count go: say so when they had something on them (Undo brings them back).
      const gone = d.customFaces.slice(d.sides);
      const had = gone.some((f, i) => f.label !== String(d.sides + i + 1) || Object.keys(f).length > 1);
      d.customFaces.length = d.sides;
      if (had) toast(`Faces ${d.sides + 1}–${d.sides + gone.length} went with the sides (Ctrl+Z brings them back)`);
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

  // A die's and a range's menus: their ⋯, a right-click on them (not in a box, which keeps the browser's own), Shift+F10.
  function dieItems(d: Die, i: number): MenuEntry[] {
    return menuOf({
      heading: `Die ${i + 1} · ${d.count}d${d.sides}`,
      duplicate: menuItem.duplicate(() => dupDie(d, i), { label: '⧉ Duplicate die' }),
      delete: menuItem.delete('die', () => removeDie(i), { disabled: preset.dice.length <= 1, keys: false, hint: preset.dice.length <= 1 ? 'Dice need a die' : undefined }),
    });
  }
  const dupDie = (d: Die, i: number) => step(`Duplicated a die of “${preset.name}”`, () => preset.dice.splice(i + 1, 0, copyDie(d)));
  // Done at once: the note at the bottom offers Undo.
  function removeDie(i: number): void {
    if (preset.dice.length > 1) step(`Deleted a die of “${preset.name}”`, () => preset.dice.splice(i, 1), { notify: true });
  }
  type Total = NonNullable<DicePreset['totalOutcomes']>[number];
  const rangeName = (t: Total) => (t.min === t.max ? `Total ${t.min}` : `Totals ${t.min}–${t.max}`);
  function totalItems(t: Total, i: number): MenuEntry[] {
    const list = preset.totalOutcomes ?? [];
    return menuOf({
      heading: rangeName(t),
      duplicate: menuItem.duplicate(() => dupTotal(t, i), { label: '⧉ Duplicate range' }),
      delete: menuItem.delete('range', () => removeTotal(t, i), { keys: false }),
    });
  }
  const dupTotal = (t: Total, i: number) => step(`Duplicated ${rangeName(t).toLowerCase()} of “${preset.name}”`, () => preset.totalOutcomes?.splice(i + 1, 0, copyTotal(t)));
  function removeTotal(t: Total, i: number): void {
    step(`Deleted ${rangeName(t).toLowerCase()} of “${preset.name}”`, () => preset.totalOutcomes?.splice(i, 1), { notify: true });
  }
  const menuOn = (e: MouseEvent, items: () => MenuEntry[]) => !isTextField(e.target) && showMenu(e, items());

  function testRoll(): void {
    const p = JSON.parse(JSON.stringify(preset)) as DicePreset;
    test = { kind: 'dice', nonce: newId(), name: p.name, preset: p, roll: rollPreset(p), startedAt: Date.now(), duration: 1300 };
  }
</script>

<div class="de">
  <div class="left">
    <label class="field">Dice name<input bind:value={preset.name} /></label>
    {#each preset.dice as d, i (d.id)}
      <div class="die" role="group" aria-label="Die {i + 1}" oncontextmenu={(e) => menuOn(e, () => dieItems(d, i))} use:rowKeys={{ duplicate: () => dupDie(d, i), menu: () => dieItems(d, i) }}>
        <div class="row">
          <!-- Kept to what a die can be (1–20 of them, d2–d1000), and the box shows what was kept. -->
          <label class="check"
            >How many<input
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
            >Sides<input
              type="number"
              min="2"
              max={d.customFaces ? 100 : 1000}
              value={d.sides}
              onchange={(e) => {
                setSides(d, +e.currentTarget.value);
                e.currentTarget.value = String(d.sides);
              }}
              class="n"
            /></label
          >
          <!-- (What it rolls, as players see it written.) -->
          <span class="muted roll" aria-hidden="true">{d.count}d{d.sides}</span>
          <label class="check" title="Give each side its own label, details or effect (up to 100 sides)">
            <input type="checkbox" checked={!!d.customFaces} disabled={d.sides > 100 && !d.customFaces} onchange={(e) => setCustom(d, e.currentTarget.checked)} /> Custom faces
          </label>
          <span class="spacer"></span>
          <RowTools menu={() => dieItems(d, i)} name="die {i + 1}" remove={() => removeDie(i)} deleteLabel="Delete die {i + 1}" deleteWords="Delete die" off={preset.dice.length <= 1 ? 'Dice need a die' : undefined} />
        </div>
        {#if d.customFaces}
          <div class="faces">
            {#each d.customFaces as face, fi}
              <div class="face"><span class="muted n0">{fi + 1}</span><OutcomeEditor outcome={face} placeholder="Face {fi + 1}" dice /></div>
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
              {#if lines.length >= 2 && lines.length !== d.sides && lines.length <= 100}
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
      <div class="face" role="group" aria-label={rangeName(t)} oncontextmenu={(e) => menuOn(e, () => totalItems(t, i))} use:rowKeys={{ duplicate: () => dupTotal(t, i), menu: () => totalItems(t, i) }}>
        <!-- From above To: they swap round (a range 9–4 is 4–9). -->
        <!-- (Emptied, a box keeps its number: a blank From would catch every total, a blank To none.) -->
        <input
          type="number"
          bind:value={() => t.min, (v) => keepNum(v, (n) => (t.min = n))}
          class="n"
          aria-label="From"
          onchange={(e) => (t.min > t.max && ([t.min, t.max] = [t.max, t.min]), shown(e, t.min))}
        />–<input
          type="number"
          bind:value={() => t.max, (v) => keepNum(v, (n) => (t.max = n))}
          class="n"
          aria-label="To"
          onchange={(e) => (t.min > t.max && ([t.min, t.max] = [t.max, t.min]), shown(e, t.max))}
        />
        <OutcomeEditor outcome={t.outcome} placeholder="What happens" dice />
        <RowTools menu={() => totalItems(t, i)} name={rangeName(t)} remove={() => removeTotal(t, i)} deleteLabel="Delete this total" />
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
  .roll {
    font-size: 12px;
    min-width: 3.5em;
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
