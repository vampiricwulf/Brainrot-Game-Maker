<!--
  Import clues… on a board round: paste a block from Google Sheets or Excel, or pick a CSV / TSV file (category,
  value, question, answer), see the board as it will be, and fill the empty tiles or replace the board. One step.
  Closing it (Esc, ✕, Cancel) keeps what was pasted for the next time it's opened on that board; a click outside
  doesn't close it.
-->
<script module lang="ts">
  /** What was pasted (or read from a file) into Import clues on each board, until it's imported. */
  const drafts = new Map<string, { text: string; from: string | null; mode: 'fill' | 'replace' }>();
</script>

<script lang="ts">
  import { untrack } from 'svelte';
  import { modal } from '../lib/modal';
  import { applyPlan, cluesFromTable, parseTable, planImport, previewText } from '../lib/clueimport';
  import { pickFile } from '../lib/fileio';
  import { step } from '../lib/history.svelte';
  import { categoryLabel, formatPoints, roundName, slidesOfClue, type BoardRound } from '../lib/model';
  import { followClueText } from '../lib/cluetext';
  import { app } from '../lib/app.svelte';

  let { round, onclose }: { round: BoardRound; onclose: () => void } = $props();

  // (Read once, when it opens: what was pasted on this board last time.)
  const draft = untrack(() => drafts.get(round.id));
  let text = $state(draft?.text ?? '');
  let from = $state<string | null>(draft?.from ?? null);
  let mode = $state<'fill' | 'replace'>(draft?.mode ?? 'fill');

  /** Close, keeping what's pasted for next time (nothing kept once it's cleared). */
  function close(): void {
    if (text.trim()) drafts.set(round.id, { text, from, mode });
    else drafts.delete(round.id);
    onclose();
  }
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
    // One note (with Undo), at the board: not "… › Row values" because the import set the rows too.
    const left = p.left ? ` (${p.left} didn’t fit)` : '';
    step(`Imported ${p.placed} clue${p.placed === 1 ? '' : 's'} into ${name}${left}`, () => {
        applyPlan(round, p);
        // The imported clues take the theme's clue text, as clues added on the board do (one with a look of its own keeps it).
        followClueText(app.game, round.categories.flatMap((c) => c.clues.flatMap(slidesOfClue)));
      }, { notify: true, place: { tab: 'round', round: round.id } });
    drafts.delete(round.id);
    onclose();
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === 'Escape') {
      e.stopImmediatePropagation();
      close();
    }
  }}
/>

<!-- (A click outside doesn't close it: a sheet pasted in isn't lost to a stray click.) -->
<div class="modal-backdrop" role="presentation">
  <div class="modal import" role="dialog" aria-modal="true" aria-label="Import clues" use:modal data-undo="off">
    <div class="modal-head">
      <h2 class="modal-title">📥 Import clues</h2>
      <button class="ghost modal-x" onclick={close} aria-label="Close" title="Close (Esc): what's pasted is kept for next time">✕</button>
    </div>
    <p class="hint">
      Copy the cells in Google Sheets or Excel and paste them here, or choose a CSV or TSV file. Columns: <b>category, value, question, answer</b>
      (a first row naming them can put them in any order).
    </p>
    <div class="row">
      <button onclick={chooseFile}>Choose file…</button>
      {#if from}<span class="hint">{from}</span>{/if}
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
      <span class="hint" role="status">
        {#if !text.trim()}
          Nothing to import yet
        {:else if !clues.length}
          No clues found (each row needs a question or an answer)
        {:else if plan}
          {clues.length} clue{clues.length === 1 ? '' : 's'} found · {plan.placed} go on the board{plan.left ? ` · ${plan.left} don’t fit` : ''}{plan.leftOut.length
            ? ` (only 10 categories fit on a board: ${plan.leftOut.map((n) => `“${n}”`).join(', ')} ${plan.leftOut.length === 1 ? 'is' : 'are'} left out)`
            : ''}
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
              {plan.filled.has(clue.id) ? previewText(r, ci, row) : formatPoints(clue.value ?? r.values[row], sym)}
            </div>
          {/each}
        {/each}
      </div>
      <p class="hint">
        {mode === 'fill' ? 'Highlighted tiles get the imported clues. Tiles with something on them stay as they are.' : 'The board becomes the imported categories (rows and values too).'}
      </p>
    {/if}

    <div class="modal-foot">
      <button class="ghost" onclick={close}>Cancel</button>
      <button class="primary" onclick={apply} disabled={!plan?.placed}>Import {plan?.placed ? `${plan.placed} clue${plan.placed === 1 ? '' : 's'}` : ''}</button>
    </div>
  </div>
</div>

<style>
  .import {
    width: min(900px, 100%);
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
    font-size: 12px;
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
</style>
