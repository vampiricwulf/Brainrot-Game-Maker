<!--
  Import clues… on a board round: paste a block from Google Sheets or Excel, or pick a CSV / TSV file (category,
  value, question, answer), see the board as it will be, and fill the empty tiles or replace the board. One step.
  Closing it (Esc, ✕, Cancel) keeps what was pasted for the next time it's opened on that board; a click outside
  doesn't close it. A sheet file dropped on it is read in, as Choose file… does; a sheet of several categories pasted
  on a category's name opens it with that sheet.
-->
<script module lang="ts">
  /** What was pasted (or read from a file) into Import clues on each board, until it's imported. */
  const drafts = new Map<string, { text: string; from: string | null; mode: 'fill' | 'replace' }>();
</script>

<script lang="ts">
  import { untrack } from 'svelte';
  import { modal } from '../lib/modal';
  import { applyPlan, cluesFromTable, parseTable, planImport, previewText } from '../lib/clueimport';
  import { isGameFile, pickFile, readTextFile } from '../lib/fileio';
  import { isThemeFile } from '../lib/themefile';
  import { step } from '../lib/history.svelte';
  import { categoryLabel, formatPoints, roundName, type BoardRound } from '../lib/model';
  import { followClueText, textSlidesOf } from '../lib/cluetext';
  import { app } from '../lib/app.svelte';

  let {
    round,
    onclose,
    pasted,
  }: {
    round: BoardRound;
    onclose: () => void;
    /** A sheet pasted on a category's name, to fill the board with (instead of what was kept from last time). */
    pasted?: string;
  } = $props();

  // (Read once, when it opens: what was pasted on this board last time.)
  const draft = untrack(() => (pasted ? { text: pasted, from: null, mode: 'fill' as const } : drafts.get(round.id)));
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

  /** Why the file dropped last wasn't read in (one that isn’t a sheet of text), in the status line. */
  let dropNote = $state('');
  async function chooseFile(): Promise<void> {
    const file = await pickFile('.csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain');
    if (!file) return;
    dropNote = '';
    text = await readTextFile(file);
    from = file.name;
  }
  /**
   * A sheet file dropped on the window: read in, as Choose file… does. A game or theme file opens as one (the editor
   * takes it); any other says here why it can't be read, not in a toast about pictures.
   */
  async function dropped(e: DragEvent): Promise<void> {
    const files = Array.from(e.dataTransfer?.files ?? []);
    const file = files.find((f) => /\.(csv|tsv|txt)$/i.test(f.name));
    if (!files.length || (!file && files.some((f) => isGameFile(f.name) || isThemeFile(f.name)))) return;
    e.preventDefault();
    if (!file) {
      const name = files[0].name;
      dropNote = /\.(xlsx?|xlsm|ods|numbers)$/i.test(name)
        ? `“${name}” can’t be read here: copy its cells and paste them, or save the sheet as CSV.`
        : `“${name}” isn’t a sheet of clues: paste the cells, or drop a CSV or TSV file.`;
      return;
    }
    dropNote = '';
    text = await readTextFile(file);
    from = file.name;
  }

  function apply(): void {
    if (!plan || !plan.placed) return;
    const p = plan;
    const name = roundName(round, app.game.rounds.indexOf(round));
    // One note (with Undo), at the board: not "… › Row values" because the import set the rows too.
    const left = p.left ? ` (${p.left} didn’t fit)` : '';
    step(`Imported ${p.placed} clue${p.placed === 1 ? '' : 's'} into round “${name}”${left}`, () => {
        applyPlan(round, p);
        // The imported clues take the theme's clue text, as clues added on the board do (one with a look of its own keeps it).
        followClueText(app.game, round.categories.flatMap((c) => c.clues.flatMap(textSlidesOf)));
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
  <div
    class="modal import"
    role="dialog"
    aria-modal="true"
    aria-label="Import clues"
    tabindex="-1"
    use:modal
    data-undo="off"
    ondragover={(e) => e.dataTransfer?.types.includes('Files') && e.preventDefault()}
    ondrop={dropped}
  >
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
      {#if text}<button class="ghost small" onclick={() => ((text = ''), (from = null), (dropNote = ''))}>Clear</button>{/if}
    </div>
    <textarea
      bind:value={text}
      oninput={() => ((from = null), (dropNote = ''))}
      rows="6"
      placeholder={'Memes\t200\tThis dog started it all\tWhat is Doge?\nMemes\t400\tNever gonna give you up\tWho is Rick Astley?'}
      aria-label="Clues to import"
      data-autofocus
    ></textarea>

    <div class="row">
      <label class="check"><input type="radio" bind:group={mode} value="fill" /> Fill empty tiles</label>
      <label class="check"><input type="radio" bind:group={mode} value="replace" /> Replace the board</label>
      <span class="spacer"></span>
      <span class="hint" role="status">
        {#if dropNote}
          {dropNote}
        {:else if !text.trim()}
          Nothing to import yet
        {:else if !clues.length}
          No clues found (each row needs a question or an answer)
        {:else if plan}
          {clues.length} clue{clues.length === 1 ? '' : 's'} found · {plan.placed} go on the board{plan.left ? ` · ${plan.left} don’t fit` : ''}{plan.leftOut.length
            ? ` (only 10 categories fit on a board: ${plan.leftOut.map((n) => `“${n}”`).join(', ')} ${plan.leftOut.length === 1 ? 'is' : 'are'} left out)`
            : ''}{clues.some((c) => c.answer) ? '' : ' · none has an answer: is there an “Answer” column?'}
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
            {@const words = previewText(r, ci, row, sym)}
            <div class="tile" class:new={plan.filled.has(clue.id)} class:empty={clue.empty} title={words}>
              {plan.filled.has(clue.id) ? words : formatPoints(clue.value ?? r.values[row], sym)}
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
