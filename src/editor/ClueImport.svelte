<!--
  Import clues… on a board round: paste a block from Google Sheets or Excel, or pick a CSV / TSV file (category,
  value, question, answer), see the board as it will be, and fill the empty tiles or replace the board. One step.
-->
<script lang="ts">
  import { toast } from '../lib/app.svelte';
  import { applyPlan, cluesFromTable, parseTable, planImport, previewText } from '../lib/clueimport';
  import { pickFile } from '../lib/fileio';
  import { step } from '../lib/history.svelte';
  import { categoryLabel, roundName, type BoardRound } from '../lib/model';
  import { app } from '../lib/app.svelte';

  let { round, onclose }: { round: BoardRound; onclose: () => void } = $props();

  let text = $state('');
  let from = $state<string | null>(null);
  let mode = $state<'fill' | 'replace'>('fill');
  const clues = $derived(cluesFromTable(parseTable(text)));
  const plan = $derived(clues.length ? planImport($state.snapshot(round) as BoardRound, clues, mode) : null);
  const sym = $derived(app.game.settings.currencySymbol);

  async function chooseFile(): Promise<void> {
    const file = await pickFile('.csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain');
    if (!file) return;
    text = await file.text();
    from = file.name;
  }

  function apply(): void {
    if (!plan || !plan.placed) return;
    const p = plan;
    const name = roundName(round, app.game.rounds.indexOf(round));
    step(`Imported ${p.placed} clue${p.placed === 1 ? '' : 's'} into ${name}`, () => applyPlan(round, p), { notify: mode === 'replace' });
    toast(`Imported ${p.placed} clue${p.placed === 1 ? '' : 's'}${p.left ? ` (${p.left} didn’t fit)` : ''}`, 4000);
    onclose();
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === 'Escape') {
      e.stopImmediatePropagation();
      onclose();
    }
  }}
/>

<div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
  <div class="modal" role="dialog" aria-modal="true" aria-label="Import clues" data-undo="off">
    <div class="row">
      <h2>Import clues</h2>
      <span class="spacer"></span>
      <button class="ghost" onclick={onclose} aria-label="Close">✕</button>
    </div>
    <p class="muted small">
      Copy the cells in Google Sheets or Excel and paste them here, or choose a CSV or TSV file. Columns: <b>category, value, question, answer</b>
      (a first row naming them can put them in any order).
    </p>
    <div class="row">
      <button onclick={chooseFile}>Choose file…</button>
      {#if from}<span class="muted small">{from}</span>{/if}
      <span class="spacer"></span>
      {#if text}<button class="ghost small" onclick={() => ((text = ''), (from = null))}>Clear</button>{/if}
    </div>
    <textarea
      bind:value={text}
      oninput={() => (from = null)}
      rows="6"
      placeholder={'Memes\t200\tThis dog started it all\tWhat is Doge?\nMemes\t400\tNever gonna give you up\tWho is Rick Astley?'}
      aria-label="Clues to import"
    ></textarea>

    <div class="row">
      <label class="check"><input type="radio" bind:group={mode} value="fill" /> Fill empty tiles</label>
      <label class="check"><input type="radio" bind:group={mode} value="replace" /> Replace the board</label>
      <span class="spacer"></span>
      <span class="muted small" role="status">
        {#if !text.trim()}
          Nothing to import yet
        {:else if !clues.length}
          No clues found (each row needs a question or an answer)
        {:else if plan}
          {clues.length} clue{clues.length === 1 ? '' : 's'} found · {plan.placed} go on the board{plan.left ? ` · ${plan.left} don’t fit` : ''}
        {/if}
      </span>
    </div>

    {#if plan}
      {@const r = plan.round}
      <div class="preview" style:grid-template-columns="repeat({r.categories.length}, minmax(70px, 1fr))" aria-label="Preview">
        {#each r.categories as cat (cat.id)}
          <div class="cat">{categoryLabel(cat)}</div>
        {/each}
        {#each r.values as _, row (row)}
          {#each r.categories as cat, ci (cat.id)}
            {@const clue = cat.clues[row]}
            <div class="tile" class:new={plan.filled.has(clue.id)} class:empty={clue.empty} title={previewText(r, ci, row)}>
              {plan.filled.has(clue.id) ? previewText(r, ci, row) : `${sym}${clue.value ?? r.values[row]}`}
            </div>
          {/each}
        {/each}
      </div>
      <p class="muted small">
        {mode === 'fill' ? 'Highlighted tiles get the imported clues. Tiles with something on them stay as they are.' : 'The board becomes the imported categories (rows and values too).'}
      </p>
    {/if}

    <div class="row">
      <span class="spacer"></span>
      <button class="ghost" onclick={onclose}>Cancel</button>
      <button class="primary" onclick={apply} disabled={!plan?.placed}>Import {plan?.placed ? `${plan.placed} clue${plan.placed === 1 ? '' : 's'}` : ''}</button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 150;
    background: rgba(0, 0, 0, 0.6);
    display: grid;
    place-items: center;
    padding: 16px;
  }
  .modal {
    width: min(900px, 100%);
    max-height: 100%;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
  }
  h2,
  p {
    margin: 0;
  }
  .row {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  textarea {
    width: 100%;
    font-family: ui-monospace, monospace;
    font-size: 12px;
    resize: vertical;
  }
  .preview {
    display: grid;
    gap: 3px;
    font-size: 11px;
  }
  .cat,
  .tile {
    padding: 4px;
    border-radius: 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: center;
  }
  .cat {
    font-weight: 700;
    background: var(--panel-2);
  }
  .tile {
    background: var(--panel-2);
    color: var(--muted);
  }
  .tile.new {
    background: rgba(79, 124, 255, 0.25);
    color: inherit;
  }
  .tile.empty {
    opacity: 0.4;
  }
  .small {
    font-size: 12px;
  }
</style>
