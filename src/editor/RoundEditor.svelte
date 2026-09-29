<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { clueValue, slideText, type Round } from '../lib/model';
  import { addCategory, duplicateCategory, moveCategory, removeCategory, scaleValues, setRowCount } from '../lib/ops';
  import ClueEditor from './ClueEditor.svelte';

  let { round, canDelete, ondelete }: { round: Round; canDelete: boolean; ondelete: () => void } = $props();
  let editing = $state<{ cat: number; row: number } | null>(null);
  const sym = $derived(app.game.settings.currencySymbol);
</script>

<div class="head">
  <label class="field name">Round name<input bind:value={round.name} /></label>
  <label class="field">
    Categories
    <input
      type="number"
      min="1"
      max="10"
      value={round.categories.length}
      onchange={(e) => {
        const n = Math.max(1, Math.min(10, +e.currentTarget.value || 1));
        while (round.categories.length < n) addCategory(round);
        while (round.categories.length > n) removeCategory(round, round.categories.length - 1);
        e.currentTarget.value = String(round.categories.length);
      }}
    />
  </label>
  <label class="field">
    Questions per category
    <input
      type="number"
      min="1"
      max="10"
      value={round.values.length}
      onchange={(e) => {
        setRowCount(round, +e.currentTarget.value || 1);
        e.currentTarget.value = String(round.values.length);
      }}
    />
  </label>
  <span class="spacer"></span>
  {#if canDelete}<button class="ghost" onclick={ondelete}>Delete round</button>{/if}
</div>

<div class="values">
  <span class="muted">Row values</span>
  {#each round.values as _, i}
    <input type="number" bind:value={round.values[i]} aria-label="Row {i + 1} value" />
  {/each}
  <button class="small" onclick={() => scaleValues(round, 2)} title="Double every row value">×2</button>
  <button class="small" onclick={() => scaleValues(round, 0.5)} title="Halve every row value">÷2</button>
</div>

<div class="grid-wrap">
  <div class="grid" style:grid-template-columns="repeat({round.categories.length}, minmax(140px, 1fr))">
    {#each round.categories as cat, ci (cat.id)}
      <div class="cat">
        <textarea bind:value={cat.title} rows="2" placeholder="Category name" aria-label="Category {ci + 1} name"></textarea>
        <div class="cat-tools">
          <button class="ghost small" onclick={() => moveCategory(round, ci, ci - 1)} disabled={ci === 0} title="Move left">◀</button>
          <button class="ghost small" onclick={() => moveCategory(round, ci, ci + 1)} disabled={ci === round.categories.length - 1} title="Move right">▶</button>
          <button class="ghost small" onclick={() => duplicateCategory(round, ci)} disabled={round.categories.length >= 10} title="Duplicate">⧉</button>
          <button
            class="ghost small"
            onclick={() => confirm(`Delete category "${cat.title}"?`) && removeCategory(round, ci)}
            disabled={round.categories.length <= 1}
            title="Delete">✕</button>
        </div>
      </div>
    {/each}
    {#each round.values as _, row}
      {#each round.categories as cat, ci (cat.id)}
        {@const clue = cat.clues[row]}
        {@const q = slideText(clue.questionSlide).trim()}
        {@const a = slideText(clue.answerSlide).trim()}
        <button class="tile" class:empty={clue.empty} onclick={() => (editing = { cat: ci, row })}>
          <span class="val">
            {clue.empty ? 'EMPTY' : `${sym}${clueValue(round, row, clue)}`}
            {#if clue.value !== null && !clue.empty}<span class="badge" title="Custom value">✎</span>{/if}
          </span>
          {#if !clue.empty}
            <span class="q" class:missing={!q}>{q || 'No question yet'}</span>
            {#if !a}<span class="missing small">No answer</span>{/if}
          {/if}
        </button>
      {/each}
    {/each}
  </div>
</div>

{#if editing}
  <ClueEditor {round} bind:pos={editing} onclose={() => (editing = null)} />
{/if}

<style>
  .head {
    display: flex;
    gap: 12px;
    align-items: end;
    flex-wrap: wrap;
    margin-bottom: 12px;
  }
  .name input {
    width: 260px;
  }
  .head input[type='number'] {
    width: 90px;
  }
  .values {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
    margin-bottom: 16px;
  }
  .values input {
    width: 80px;
  }
  .grid-wrap {
    overflow-x: auto;
    padding-bottom: 8px;
  }
  .grid {
    display: grid;
    gap: 6px;
    min-width: min-content;
  }
  .cat {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .cat textarea {
    resize: none;
    background: var(--tile);
    color: #fff;
    font-weight: 700;
    text-align: center;
    text-transform: uppercase;
    border-color: transparent;
  }
  .cat-tools {
    display: flex;
    justify-content: center;
    gap: 2px;
  }
  .tile {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
    min-height: 92px;
    padding: 8px;
    background: #0a1060;
    border: 1px solid #1d2690;
    text-align: left;
    white-space: normal;
  }
  .tile.empty {
    background: var(--panel);
    border-style: dashed;
  }
  .val {
    color: var(--value);
    font-weight: 800;
    font-size: 16px;
  }
  .badge {
    font-size: 11px;
    color: var(--muted);
  }
  .q {
    font-size: 12px;
    color: #cfd3ff;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .missing {
    color: var(--warn);
  }
  .small {
    font-size: 11px;
  }
</style>
