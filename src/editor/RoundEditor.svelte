<script lang="ts">
  import { untrack } from 'svelte';
  import { showMenu } from '../lib/menustate.svelte';
  import { take } from '../lib/nav.svelte';
  import { app } from '../lib/app.svelte';
  import { categoryLabel, clueValue, roundName, slideText, type BoardRound } from '../lib/model';
  import { nameStep, step, stepAsync } from '../lib/history.svelte';
  import { slideHasContent } from '../lib/usage';
  import { addCategory, categoryHasContent, clueHasContent, duplicateCategory, moveCategory, removeCategory, scaleValues, setRowCount } from '../lib/ops';
  import { randomizeDailyDoubles } from '../lib/session';
  import { toast } from '../lib/app.svelte';
  import { addMediaFile, imgFallback, mediaUrls } from '../lib/media.svelte';
  import ClueEditor from './ClueEditor.svelte';
  import BoardDecorEditor from './BoardDecorEditor.svelte';
  import MediaPicker from './slide/MediaPicker.svelte';

  let { round }: { round: BoardRound } = $props();
  /** The clue open in the clue editor, by ids (an undo that puts a category back moves the others along). */
  let open = $state<{ category: string; clue: string } | null>(null);
  /** Where it is now; null once it's gone (undone), which closes the editor. */
  const editing = $derived.by(() => {
    if (!open) return null;
    const cat = round.categories.findIndex((c) => c.id === open!.category);
    const row = cat < 0 ? -1 : round.categories[cat].clues.findIndex((c) => c.id === open!.clue);
    return row < 0 ? null : { cat, row };
  });
  function openAt(cat: number, row: number): void {
    const c = round.categories[cat];
    open = c?.clues[row] ? { category: c.id, clue: c.clues[row].id } : null;
  }
  let decorOpen = $state(false);
  let catPicker = $state<number | null>(null);
  let dropTarget = $state<string | null>(null);
  const sym = $derived(app.game.settings.currencySymbol);
  const name = $derived(roundName(round, app.game.rounds.indexOf(round)));

  const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');

  /** Store dropped image files, skipping anything that isn't an image. */
  async function images(e: DragEvent): Promise<string[]> {
    e.preventDefault();
    dropTarget = null;
    const ids: string[] = [];
    for (const file of Array.from(e.dataTransfer?.files ?? [])) {
      try {
        const ref = await addMediaFile(app.game, file);
        if (ref.kind === 'image') ids.push(ref.id);
        else toast(`"${ref.name}" isn't an image`);
      } catch (err) {
        toast((err as Error).message, 5000);
      }
    }
    return ids;
  }

  // Several images dropped at once fill the next categories to the right…
  // (The files and where they go: one step.)
  function dropOnCategory(e: DragEvent, ci: number): Promise<void> {
    return stepAsync(null, async () => {
      const ids = await images(e);
      ids.forEach((id, i) => {
        const cat = round.categories[ci + i];
        if (cat) cat.image = id;
      });
      const n = Math.min(ids.length, round.categories.length - ci);
      if (n > 1) {
        nameStep(`Set ${n} category images`);
        toast(`Set ${n} category images`);
      }
    });
  }

  // …and the next tiles down the column (then on to the next column), skipping empty tiles.
  function dropOnTile(e: DragEvent, ci: number, row: number): Promise<void> {
    return stepAsync(null, async () => {
      const ids = await images(e);
      const rows = round.values.length;
      let n = 0;
      for (let idx = ci * rows + row; idx < round.categories.length * rows && n < ids.length; idx++) {
        const clue = round.categories[Math.floor(idx / rows)].clues[idx % rows];
        if (clue.empty) continue;
        clue.tileFace = { ...clue.tileFace, image: ids[n++] };
      }
      if (ids.length > 1) {
        nameStep(`Set ${n} tile images`);
        toast(`Set ${n} tile images`);
      }
    });
  }

  // An undo or redo here: open the clue or the board images it changed, or close them to show the board.
  const handled = { seq: 0 };
  $effect(() => {
    const place = take(handled);
    if (place?.tab !== 'round' || place.round !== round.id) return;
    const part = place.part;
    untrack(() => {
      decorOpen = part?.kind === 'decor';
      if (part?.kind !== 'clue') open = null;
      else if (open?.clue !== part.clue) open = { category: part.category, clue: part.clue };
    });
  });

  function over(e: DragEvent, key: string): void {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dropTarget = key;
  }
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
        const n = Math.max(1, Math.min(10, Math.floor(+e.currentTarget.value) || 1));
        // Fewer categories drops the last ones at once: if any had something in it, the note at the bottom offers Undo.
        const lost = round.categories.slice(n).some(categoryHasContent);
        if (n !== round.categories.length)
          step(
            `Changed ${name} to ${n} categor${n === 1 ? 'y' : 'ies'}`,
            () => {
              while (round.categories.length < n) addCategory(round);
              while (round.categories.length > n) removeCategory(round, round.categories.length - 1);
            },
            { notify: lost },
          );
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
        const n = Math.max(1, Math.min(10, Math.floor(+e.currentTarget.value) || 1));
        // Like fewer categories: the bottom rows go at once, with Undo when they had clues in them.
        const lost = round.categories.some((c) => c.clues.slice(n).some(clueHasContent));
        if (n !== round.values.length) step(`Changed ${name} to ${n} row${n === 1 ? '' : 's'}`, () => setRowCount(round, n), { notify: lost });
        e.currentTarget.value = String(round.values.length);
      }}
    />
  </label>
  <span class="spacer"></span>
  <button onclick={() => (decorOpen = true)} title="Logos, stickers and GIFs placed anywhere on this round's board">
    🖼 Board images{round.decor?.length ? ` (${round.decor.length})` : '…'}
  </button>
</div>

<div class="values" data-place="values:{round.id}">
  <span class="muted">Row values</span>
  {#each round.values as _, i}
    <input type="number" bind:value={round.values[i]} aria-label="Row {i + 1} value" />
  {/each}
  <button class="small" onclick={() => step('Doubled the row values', () => scaleValues(round, 2))} title="Double every row value">×2</button>
  <button class="small" onclick={() => step('Halved the row values', () => scaleValues(round, 0.5))} title="Halve every row value">÷2</button>
  <span class="spacer"></span>
  <span class="muted">⭐ Daily Doubles</span>
  <input
    type="number"
    min="0"
    max="10"
    value={round.dailyDoubleCount ?? 1}
    oninput={(e) => (round.dailyDoubleCount = Math.max(0, +e.currentTarget.value || 0))}
    aria-label="How many Daily Doubles"
    class="ddn"
  />
  <button
    class="small"
    onclick={() => {
      const n = step('Placed Daily Doubles at random', () => randomizeDailyDoubles(round, round.dailyDoubleCount ?? 1));
      toast(`Placed ${n} Daily Double${n === 1 ? '' : 's'} (weighted toward the bottom rows)`);
    }}
    title="Scatter Daily Doubles at random. Click a tile to set one by hand.">🎲 Randomize</button>
  <span class="muted small">{round.categories.reduce((n, c) => n + c.clues.filter((cl) => cl.type === 'dailyDouble' && !cl.empty).length, 0)} placed</span>
</div>

<div class="grid-wrap">
  <div class="grid" style:grid-template-columns="repeat({round.categories.length}, minmax(140px, 1fr))">
    {#each round.categories as cat, ci (cat.id)}
      <div
        class="cat"
        class:drop={dropTarget === `c${ci}`}
        data-place="category:{cat.id}"
        ondragover={(e) => over(e, `c${ci}`)}
        ondragleave={() => dropTarget === `c${ci}` && (dropTarget = null)}
        ondrop={(e) => dropOnCategory(e, ci)}
        role="group"
        aria-label="Category {ci + 1}"
      >
        {#if cat.image}
          <div class="cat-img">
            {#if mediaUrls[cat.image]}
              <img src={mediaUrls[cat.image]} alt="" style:object-fit={cat.imageFit ?? 'contain'} onerror={imgFallback} />
            {:else}
              <span class="missing small">Missing image</span>
            {/if}
            {#if cat.showTitleOverImage && cat.title}<span class="cap">{cat.title}</span>{/if}
          </div>
        {/if}
        <textarea
          bind:value={cat.title}
          class:sub={!!cat.image}
          rows={cat.image ? 1 : 2}
          placeholder={cat.image ? 'Name (for you; optional on screen)' : 'Category name'}
          aria-label="Category {ci + 1} name"></textarea>
        {#if cat.image}
          <div class="cat-img-opts">
            <select
              value={cat.imageFit ?? 'contain'}
              onchange={(e) => (cat.imageFit = e.currentTarget.value === 'cover' ? 'cover' : undefined)}
              aria-label="How the image fits the header"
              title="Fit: whole image shows. Fill: covers the header, edges may be cropped."
            >
              <option value="contain">Fit</option>
              <option value="cover">Fill</option>
            </select>
            <label class="check" title="Show the category name on top of the image">
              <input type="checkbox" bind:checked={cat.showTitleOverImage} /> Name
            </label>
            <button class="ghost small" onclick={() => (cat.image = undefined)} title="Remove the image (use the name)">✕</button>
          </div>
        {/if}
        <div class="cat-tools">
          <button class="ghost small" onclick={() => step(`Moved category “${categoryLabel(cat)}” left`, () => moveCategory(round, ci, ci - 1))} disabled={ci === 0} title="Move left">◀</button>
          <button
            class="ghost small"
            onclick={() => step(`Moved category “${categoryLabel(cat)}” right`, () => moveCategory(round, ci, ci + 1))}
            disabled={ci === round.categories.length - 1}
            title="Move right">▶</button>
          <button
            class="ghost small"
            onclick={() => step(`Duplicated category “${categoryLabel(cat)}”`, () => duplicateCategory(round, ci))}
            disabled={round.categories.length >= 10}
            title="Duplicate">⧉</button>
          <!-- Done at once: the note at the bottom offers Undo. -->
          <button
            class="ghost small"
            onclick={() => step(`Deleted category “${categoryLabel(cat)}”`, () => removeCategory(round, ci), { notify: true })}
            disabled={round.categories.length <= 1}
            title="Delete">✕</button>
          <span class="pop">
            <button class="ghost small" onclick={() => (catPicker = ci)} title="Use an image for this category (or drop one here)">🖼</button>
            {#if catPicker === ci}
              <MediaPicker kind="image" onpick={(id) => ((cat.image = id), (catPicker = null))} onclose={() => (catPicker = null)} />
            {/if}
          </span>
        </div>
      </div>
    {/each}
    {#each round.values as _, row}
      {#each round.categories as cat, ci (cat.id)}
        {@const clue = cat.clues[row]}
        {@const q = slideText(clue.questionSlide).trim()}
        {@const a = slideHasContent(clue.answerSlide)}
        {@const kinds = [...new Set(clue.questionSlide.elements.map((e) => e.kind).filter((k) => k !== 'text'))]}
        {@const face = clue.tileFace?.image && !clue.empty ? mediaUrls[clue.tileFace.image] : undefined}
        <button
          class="tile"
          class:empty={clue.empty}
          class:drop={dropTarget === `t${ci}-${row}`}
          data-place="clue:{clue.id}"
          onclick={() => openAt(ci, row)}
          oncontextmenu={(e) =>
            showMenu(e, [
              { heading: `${categoryLabel(cat) || `Category ${ci + 1}`} · ${sym}${clueValue(round, row, clue)}` },
              { label: '✎ Edit clue', onclick: () => openAt(ci, row) },
              {
                label: clue.type === 'dailyDouble' ? '⭐ Not a Daily Double' : '⭐ Make it a Daily Double',
                disabled: clue.empty,
                onclick: () => (clue.type = clue.type === 'dailyDouble' ? 'standard' : 'dailyDouble'),
              },
              { label: clue.empty ? '↩ Use this tile again' : '⬚ Leave this tile empty', onclick: () => (clue.empty = !clue.empty) },
            ])}
          ondragover={(e) => !clue.empty && over(e, `t${ci}-${row}`)}
          ondragleave={() => dropTarget === `t${ci}-${row}` && (dropTarget = null)}
          ondrop={(e) => !clue.empty && dropOnTile(e, ci, row)}
        >
          {#if face}<img class="face" src={face} alt="" title="Tile image (shown instead of the value)" onerror={imgFallback} />{/if}
          <span class="val">
            {clue.empty ? 'EMPTY' : `${sym}${clueValue(round, row, clue)}`}
            {#if clue.value !== null && !clue.empty}<span class="badge" title="Custom value">✎</span>{/if}
            {#if clue.type === 'dailyDouble' && !clue.empty}<span class="dd" title="Daily Double">⭐ DD</span>{/if}
            {#if clue.type === 'wheel' && !clue.empty}<span class="dd" title="Wheel tile">🎡</span>{/if}
            {#if clue.type === 'dice' && !clue.empty}<span class="dd" title="Dice tile">🎲</span>{/if}
          </span>
          {#if !clue.empty}
            <span class="q" class:missing={!q && !kinds.length}>{q || (kinds.length ? '' : 'No question yet')}</span>
            {#if kinds.length}
              <span class="kinds">{kinds.map((k) => ({ image: '🖼', video: '🎬', audio: '🔊', shape: '◼', embed: '🌐', text: '' })[k]).join(' ')}</span>
            {/if}
            {#if !a}<span class="missing small">No answer</span>{/if}
          {/if}
        </button>
      {/each}
    {/each}
  </div>
</div>

{#if editing}
  <ClueEditor {round} bind:pos={() => editing!, (p) => openAt(p.cat, p.row)} onclose={() => (open = null)} />
{/if}
{#if decorOpen}
  <BoardDecorEditor {round} onclose={() => (decorOpen = false)} />
{/if}
<p class="muted small tip">Tip: drop image files onto a category or a tile to use them there. Drop several to fill the next ones.</p>

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
    /* Line the tool rows up across categories with and without images. */
    margin-top: auto;
  }
  .cat textarea.sub {
    background: var(--panel-2);
    color: var(--text);
    font-size: 12px;
    font-weight: 600;
    border-color: var(--border);
  }
  .cat,
  .tile {
    border-radius: 6px;
  }
  .cat.drop,
  .tile.drop {
    outline: 2px dashed var(--accent);
    outline-offset: 2px;
  }
  .cat-img {
    position: relative;
    height: 74px;
    background: var(--tile);
    border-radius: 4px;
    overflow: hidden;
    display: grid;
    place-items: center;
  }
  .cat-img img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .cap {
    position: absolute;
    left: 4px;
    right: 4px;
    bottom: 2px;
    text-align: center;
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    color: #fff;
    text-shadow: 1px 1px 0 #000, -1px -1px 0 #000;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .cat-img-opts {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
  }
  .cat-img-opts select {
    padding: 2px;
    font-size: 11px;
  }
  .cat-img-opts .check {
    gap: 3px;
  }
  .pop {
    position: relative;
  }
  .tile {
    position: relative;
  }
  .tile .face {
    position: absolute;
    right: 6px;
    top: 6px;
    width: 44px;
    height: 30px;
    object-fit: contain;
    border-radius: 3px;
    background: rgba(0, 0, 0, 0.3);
  }
  .tip {
    margin: 6px 0 0;
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
  .ddn {
    width: 60px !important;
  }
  .dd {
    font-size: 11px;
    background: #7a00ff;
    color: #fff;
    border-radius: 4px;
    padding: 0 4px;
    margin-left: 4px;
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
  .kinds {
    font-size: 13px;
  }
  .missing {
    color: var(--warn);
  }
  .small {
    font-size: 11px;
  }
</style>
