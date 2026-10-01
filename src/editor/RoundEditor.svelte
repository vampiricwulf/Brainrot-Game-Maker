<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { showMenu, type MenuEntry } from '../lib/menustate.svelte';
  import { take, type Place } from '../lib/nav.svelte';
  import { app } from '../lib/app.svelte';
  import { adoptUsedBy, clipboard, holdUsedBy } from '../lib/clipboard.svelte';
  import { categoryLabel, clueValue, roundName, slideText, type BoardRound } from '../lib/model';
  import { nameStep, step, stepAsync } from '../lib/history.svelte';
  import { slideHasContent } from '../lib/usage';
  import {
    addCategory,
    categoryHasContent,
    clearClue,
    clone,
    clueHasContent,
    copyClue,
    deleteRow,
    duplicateCategory,
    insertRow,
    moveCategory,
    moveRow,
    removeCategory,
    scaleValues,
    setRowCount,
    swapClues,
    type TilePos,
  } from '../lib/ops';
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
    if (open) cursor = { cat, row };
  }
  /** Done in the clue editor: back to the tile it ended on. */
  function closeClue(): void {
    open = null;
    void tick().then(() => focusTile(cur.cat, cur.row, true));
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
      if (part?.kind !== 'clue' || part.onBoard) open = null;
      else if (open?.clue !== part.clue) open = { category: part.category, clue: part.clue };
    });
  });

  function over(e: DragEvent, key: string): void {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dropTarget = key;
  }

  /** A right-click in a field with text selected keeps the browser's own menu (Copy, Paste…). */
  function textSelected(e: MouseEvent): boolean {
    const t = e.target;
    return t instanceof HTMLTextAreaElement && t.selectionStart !== t.selectionEnd;
  }

  // ---------- Tiles ----------

  /** "Memes $400" */
  function tileName(p: TilePos): string {
    const cat = round.categories[p.cat];
    return `${categoryLabel(cat)} ${sym}${clueValue(round, p.row, cat.clues[p.row])}`;
  }

  /** The tile with this clue, on the board (an undo flashes it there without opening it). */
  const tilePlace = (cat: number, clue: string): Place => ({ tab: 'round', round: round.id, part: { kind: 'clue', category: round.categories[cat].id, clue, onBoard: true } });
  const rowsPlace = (): Place => ({ tab: 'round', round: round.id, part: { kind: 'values' } });

  /** The tile with the keyboard focus: the board is one tab stop, and the arrows move it. */
  let cursor = $state<TilePos>({ cat: 0, row: 0 });
  const cur = $derived<TilePos>({ cat: Math.min(cursor.cat, round.categories.length - 1), row: Math.min(cursor.row, round.values.length - 1) });
  let gridEl = $state<HTMLDivElement>();

  /** Focus a tile (`always`: even when the focus isn't on the board now). */
  function focusTile(cat: number, row: number, always = false): void {
    if (!always && !gridEl?.contains(document.activeElement)) return;
    cursor = { cat, row };
    gridEl?.querySelector<HTMLElement>(`[data-tile="${cat},${row}"]`)?.focus();
  }

  /** A clue dragged from another tile: the two swap (with `copy`, a copy of it replaces this one, with Undo when that had something on it). */
  function dropClue(from: TilePos, to: TilePos, copy: boolean): void {
    if (from.cat === to.cat && from.row === to.row) return;
    const clue = round.categories[from.cat].clues[from.row];
    const [a, b] = [tileName(from), tileName(to)];
    if (copy) {
      const c = copyClue(clue);
      const notify = clueHasContent(round.categories[to.cat].clues[to.row]);
      step(`Copied ${a} to ${b}`, () => (round.categories[to.cat].clues[to.row] = c), { notify, place: tilePlace(to.cat, c.id) });
    } else step(`Swapped ${a} and ${b}`, () => swapClues(round, from, to), { place: tilePlace(to.cat, clue.id) });
    cursor = to;
  }

  /** Take out what's written on a tile. Done at once: the note at the bottom offers Undo. */
  function clearTile(p: TilePos): void {
    const clue = round.categories[p.cat].clues[p.row];
    if (!clueHasContent(clue)) return;
    step(`Cleared ${tileName(p)}`, () => clearClue(clue), { notify: true, place: tilePlace(p.cat, clue.id) });
  }

  /** Copy a whole clue (both slides and its settings) with its files, so it pastes into another round or game. */
  function copyTile(p: TilePos): void {
    clipboard.clue = clone(round.categories[p.cat].clues[p.row]);
    holdUsedBy(app.game, clipboard.clue);
    toast(`Copied ${tileName(p)}: paste it on any tile (Ctrl+V)`);
  }

  /**
   * Paste the copied clue over a tile, with fresh ids (and the files it shows, when it came from another game). What
   * was on the tile goes at once: the note at the bottom offers Undo.
   */
  function pasteTile(p: TilePos): void {
    if (!clipboard.clue) return void toast('Copy a clue first (right-click a tile, or Ctrl+C)');
    const c = copyClue(clipboard.clue);
    const game = app.game;
    const notify = clueHasContent(round.categories[p.cat].clues[p.row]);
    step(
      `Pasted a clue on ${tileName(p)}`,
      () => {
        adoptUsedBy(game, c);
        round.categories[p.cat].clues[p.row] = c;
      },
      { notify, place: tilePlace(p.cat, c.id) },
    );
  }

  const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  const catNameField = (ci: number) => gridEl?.querySelector<HTMLTextAreaElement>(`[data-cat-name="${ci}"]`);

  /**
   * On a tile: arrows move between tiles (↑ from the top row goes to the category's name), Enter or F2 opens the
   * clue, Delete / Backspace clears it, Ctrl+C / Ctrl+V copy and paste a whole clue.
   */
  function tileKey(e: KeyboardEvent, p: TilePos): void {
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    const v = ARROWS[e.key];
    if (v && !mod && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      if (p.row + v[1] < 0) return catNameField(p.cat)?.focus();
      focusTile(Math.max(0, Math.min(round.categories.length - 1, p.cat + v[0])), Math.max(0, Math.min(round.values.length - 1, p.row + v[1])));
    } else if (k === 'f2') {
      e.preventDefault();
      openAt(p.cat, p.row);
    } else if ((k === 'delete' || k === 'backspace') && !mod && !e.altKey) {
      e.preventDefault();
      clearTile(p);
    } else if (mod && !e.altKey && k === 'c' && !window.getSelection()?.toString()) {
      e.preventDefault();
      copyTile(p);
    } else if (mod && !e.altKey && k === 'v') {
      e.preventDefault();
      pasteTile(p);
    }
  }

  /** ↓ at the end of a category's name goes down to its top tile. */
  function catNameKey(e: KeyboardEvent, ci: number): void {
    const t = e.currentTarget as HTMLTextAreaElement;
    if (e.key !== 'ArrowDown' || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || t.selectionEnd < t.value.length) return;
    e.preventDefault();
    focusTile(ci, 0, true);
  }

  // Tiles drag onto each other to swap (Ctrl or Alt: copy). Their own drag type, so image files dropped on them still work.
  const CLUE_TYPE = 'text/x-brainrot-clue';
  let tileDrag = $state<TilePos | null>(null);
  let dropCopy = $state(false);

  function tileOver(e: DragEvent, p: TilePos, empty: boolean | undefined): void {
    if (!tileDrag) return void (!empty && over(e, `t${p.cat}-${p.row}`));
    e.preventDefault();
    dropCopy = e.ctrlKey || e.altKey;
    if (e.dataTransfer) e.dataTransfer.dropEffect = dropCopy ? 'copy' : 'move';
    dropTarget = tileDrag.cat === p.cat && tileDrag.row === p.row ? null : `t${p.cat}-${p.row}`;
  }

  function tileDropped(e: DragEvent, p: TilePos, empty: boolean | undefined): void {
    if (tileDrag) {
      e.preventDefault();
      dropClue(tileDrag, p, e.ctrlKey || e.altKey);
      tileDragEnd();
    } else if (!empty && hasFiles(e)) dropOnTile(e, p.cat, p.row);
  }

  function tileDragEnd(): void {
    tileDrag = null;
    dropTarget = null;
  }

  function tileMenu(e: MouseEvent, p: TilePos): void {
    const clue = round.categories[p.cat].clues[p.row];
    cursor = p;
    showMenu(e, [
      { heading: tileName(p) },
      { label: '✎ Edit clue', onclick: () => openAt(p.cat, p.row), keys: 'Enter' },
      {
        label: clue.type === 'dailyDouble' ? '⭐ Not a Daily Double' : '⭐ Make it a Daily Double',
        disabled: clue.empty,
        onclick: () => (clue.type = clue.type === 'dailyDouble' ? 'standard' : 'dailyDouble'),
      },
      { label: clue.empty ? '↩ Use this tile again' : '⬚ Leave this tile empty', onclick: () => (clue.empty = !clue.empty) },
      { sep: true },
      { label: '📋 Copy clue', onclick: () => copyTile(p), keys: 'Ctrl+C' },
      { label: '📋 Paste clue here', onclick: () => pasteTile(p), disabled: !clipboard.clue, keys: 'Ctrl+V' },
      { label: '⌫ Clear clue', onclick: () => clearTile(p), disabled: !clueHasContent(clue), keys: 'Delete' },
      ...rowItems(p.row),
    ]);
  }

  // ---------- Categories ----------

  function moveCat(from: number, to: number): void {
    if (to < 0 || to >= round.categories.length || to === from) return;
    step(`Moved category “${categoryLabel(round.categories[from])}” ${to < from ? 'left' : 'right'}`, () => moveCategory(round, from, to));
  }

  /** A new category at `at`, its name ready to type. */
  function insertCat(at: number): void {
    step(null, () => addCategory(round, at));
    void tick().then(() => {
      const f = catNameField(at);
      f?.focus();
      f?.select();
    });
  }

  // Done at once: the note at the bottom offers Undo.
  function deleteCat(ci: number): void {
    step(`Deleted category “${categoryLabel(round.categories[ci])}”`, () => removeCategory(round, ci), { notify: true });
    // The focus goes on to the category now in its place (or the last one), not to the page.
    void tick().then(() => {
      const dels = document.querySelectorAll<HTMLButtonElement>('.cat-tools button[aria-label^="Delete category"]');
      dels[Math.min(ci, dels.length - 1)]?.focus();
    });
  }

  function clearCat(ci: number): void {
    const cat = round.categories[ci];
    const place: Place = { tab: 'round', round: round.id, part: { kind: 'category', category: cat.id } };
    step(`Cleared the clues of “${categoryLabel(cat)}”`, () => cat.clues.forEach(clearClue), { notify: true, place });
  }

  function catMenu(e: MouseEvent, ci: number): void {
    if (textSelected(e)) return;
    const cat = round.categories[ci];
    const n = round.categories.length;
    showMenu(e, [
      { heading: categoryLabel(cat) },
      { label: '◀ Move left', onclick: () => moveCat(ci, ci - 1), disabled: ci === 0 },
      { label: 'Move right ▶', onclick: () => moveCat(ci, ci + 1), disabled: ci === n - 1 },
      { sep: true },
      { label: '＋ Insert category left', onclick: () => insertCat(ci), disabled: n >= 10 },
      { label: '＋ Insert category right', onclick: () => insertCat(ci + 1), disabled: n >= 10 },
      { label: '⧉ Duplicate', onclick: () => step(`Duplicated category “${categoryLabel(cat)}”`, () => duplicateCategory(round, ci)), disabled: n >= 10 },
      { label: '🖼 Image…', onclick: () => (catPicker = ci) },
      { label: '⬚ Clear its clues', onclick: () => clearCat(ci), disabled: !cat.clues.some(clueHasContent) },
      { sep: true },
      { label: '🗑 Delete category', danger: true, onclick: () => deleteCat(ci), disabled: n <= 1 },
    ]);
  }

  // Category headers drag to reorder (a line shows where it goes), from anywhere but their fields and buttons, so
  // the name can still be selected with the mouse.
  let grab = $state<string | null>(null);
  let catDrag = $state<string | null>(null);
  let catDrop = $state<{ id: string; after: boolean } | null>(null);

  function catDown(e: PointerEvent, id: string): void {
    grab = (e.target as HTMLElement).closest('textarea, input, select, button, .pop') ? null : id;
  }

  function catOver(e: DragEvent, ci: number): void {
    if (!catDrag) return over(e, `c${ci}`);
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    catDrop = { id: round.categories[ci].id, after: e.clientX > r.left + r.width / 2 };
  }

  function catDropped(e: DragEvent, ci: number): void {
    if (!catDrag) return void (hasFiles(e) && dropOnCategory(e, ci));
    e.preventDefault();
    const from = round.categories.findIndex((c) => c.id === catDrag);
    const at = round.categories.findIndex((c) => c.id === catDrop?.id);
    if (from >= 0 && at >= 0 && catDrop) {
      const to = at + (catDrop.after ? 1 : 0);
      moveCat(from, to > from ? to - 1 : to);
    }
    catDragEnd();
  }

  function catDragEnd(): void {
    catDrag = null;
    catDrop = null;
    grab = null;
  }

  // ---------- Rows ----------

  // Rows of clues go in, out and around anywhere; the row values stay by position (the top row is still the cheapest).
  function addRow(at: number): void {
    step(`Inserted a row in ${name}`, () => insertRow(round, at), { place: rowsPlace() });
  }

  // Done at once: the note at the bottom offers Undo.
  function removeRow(row: number): void {
    step(`Deleted row ${row + 1} of ${name}`, () => deleteRow(round, row), { notify: true, place: rowsPlace() });
  }

  function shiftRow(from: number, to: number): void {
    if (step(`Moved row ${from + 1} ${to < from ? 'up' : 'down'} in ${name}`, () => moveRow(round, from, to), { place: rowsPlace() }) && cursor.row === from)
      cursor = { cat: cursor.cat, row: to };
  }

  function rowItems(row: number): MenuEntry[] {
    const n = round.values.length;
    return [
      { sep: true },
      { label: '＋ Insert row above', onclick: () => addRow(row), disabled: n >= 10 },
      { label: '＋ Insert row below', onclick: () => addRow(row + 1), disabled: n >= 10 },
      { label: '▲ Move row up', onclick: () => shiftRow(row, row - 1), disabled: row === 0 },
      { label: '▼ Move row down', onclick: () => shiftRow(row, row + 1), disabled: row === n - 1 },
      { label: `🗑 Delete row ${row + 1}`, danger: true, onclick: () => removeRow(row), disabled: n <= 1 },
    ];
  }

  function rowMenu(e: MouseEvent, row: number): void {
    showMenu(e, [{ heading: `Row ${row + 1} · ${sym}${round.values[row]}` }, ...rowItems(row)]);
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
    <input type="number" bind:value={round.values[i]} aria-label="Row {i + 1} value" oncontextmenu={(e) => rowMenu(e, i)} title="Right-click to insert, move or delete this row" />
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
  <div class="grid" bind:this={gridEl} style:grid-template-columns="repeat({round.categories.length}, minmax(140px, 1fr))">
    {#each round.categories as cat, ci (cat.id)}
      <div
        class="cat"
        class:drop={dropTarget === `c${ci}`}
        class:drop-before={catDrop?.id === cat.id && !catDrop.after}
        class:drop-after={catDrop?.id === cat.id && catDrop.after}
        class:lifted={catDrag === cat.id}
        data-place="category:{cat.id}"
        draggable={grab === cat.id}
        onpointerdown={(e) => catDown(e, cat.id)}
        oncontextmenu={(e) => catMenu(e, ci)}
        ondragstart={(e) => {
          catDrag = cat.id;
          e.dataTransfer?.setData('text/x-category', cat.id);
          if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
        }}
        ondragover={(e) => catOver(e, ci)}
        ondragleave={() => dropTarget === `c${ci}` && (dropTarget = null)}
        ondrop={(e) => catDropped(e, ci)}
        ondragend={catDragEnd}
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
          aria-label="Category {ci + 1} name"
          data-cat-name={ci}
          onkeydown={(e) => catNameKey(e, ci)}></textarea>
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
            <button class="ghost small" onclick={() => (cat.image = undefined)} title="Remove the image (use the name)" aria-label="Remove {categoryLabel(cat)}'s image">−</button>
          </div>
        {/if}
        <div class="cat-tools">
          <span class="grip" aria-hidden="true" title="Drag to move the category · right-click it for more">⋮⋮</span>
          <button class="ghost small" onclick={() => moveCat(ci, ci - 1)} disabled={ci === 0} title="Move left" aria-label="Move {categoryLabel(cat)} left">◀</button>
          <button class="ghost small" onclick={() => moveCat(ci, ci + 1)} disabled={ci === round.categories.length - 1} title="Move right" aria-label="Move {categoryLabel(cat)} right">▶</button>
          <button
            class="ghost small"
            onclick={() => step(`Duplicated category “${categoryLabel(cat)}”`, () => duplicateCategory(round, ci))}
            disabled={round.categories.length >= 10}
            title="Duplicate"
            aria-label="Duplicate {categoryLabel(cat)}">⧉</button>
          <!-- Done at once: the note at the bottom offers Undo. -->
          <button class="ghost small" onclick={() => deleteCat(ci)} disabled={round.categories.length <= 1} title="Delete category" aria-label="Delete category {categoryLabel(cat)}">🗑</button>
          <span class="pop">
            <button class="ghost small" onclick={() => (catPicker = ci)} title="Use an image for this category (or drop one here)" aria-label="Image for {categoryLabel(cat)}">🖼</button>
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
        {@const p = { cat: ci, row }}
        {@const target = dropTarget === `t${ci}-${row}`}
        {@const value = clue.empty ? `row ${row + 1}` : `${sym}${clueValue(round, row, clue)}`}
        {@const what = clue.empty ? 'empty space' : `${q || kinds.join(', ') || 'no question yet'}${a ? '' : ', no answer'}`}
        <button
          class="tile"
          aria-label="{categoryLabel(cat) || `Category ${ci + 1}`}, {value}: {what}"
          class:empty={clue.empty}
          class:drop={target}
          class:lifted={tileDrag?.cat === ci && tileDrag.row === row}
          data-place="clue:{clue.id}"
          data-tile="{ci},{row}"
          tabindex={cur.cat === ci && cur.row === row ? 0 : -1}
          draggable="true"
          onclick={() => openAt(ci, row)}
          onfocus={() => (cursor = p)}
          onkeydown={(e) => tileKey(e, p)}
          oncontextmenu={(e) => tileMenu(e, p)}
          ondragstart={(e) => {
            tileDrag = p;
            e.dataTransfer?.setData(CLUE_TYPE, clue.id);
            if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copyMove';
          }}
          ondragover={(e) => tileOver(e, p, clue.empty)}
          ondragleave={() => target && (dropTarget = null)}
          ondrop={(e) => tileDropped(e, p, clue.empty)}
          ondragend={tileDragEnd}
        >
          {#if target && tileDrag}<span class="swap">{dropCopy ? '⧉ Copy here' : '⇄ Swap'}</span>{/if}
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
  <ClueEditor {round} bind:pos={() => editing!, (p) => openAt(p.cat, p.row)} onclose={closeClue} />
{/if}
{#if decorOpen}
  <BoardDecorEditor {round} onclose={() => (decorOpen = false)} />
{/if}
<p class="muted small tip">
  Tips: drag a tile onto another to swap them (hold Ctrl to copy), and a category to move it. Right-click a tile, a category or a row value for
  more. Drop image files onto a category or a tile to use them there.
</p>

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
  .cat {
    position: relative;
  }
  .cat.drop-before::before,
  .cat.drop-after::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: var(--accent);
  }
  .cat.drop-before::before {
    left: -4px;
  }
  .cat.drop-after::after {
    right: -4px;
  }
  .cat.lifted,
  .tile.lifted {
    opacity: 0.5;
  }
  .grip {
    cursor: grab;
    color: var(--muted);
    font-size: 12px;
    padding: 0 2px;
    align-self: center;
  }
  .swap {
    position: absolute;
    inset: auto 6px 6px auto;
    padding: 1px 6px;
    border-radius: 4px;
    background: var(--accent-fill);
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    pointer-events: none;
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
    font-size: 12px;
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
    font-size: 12px;
  }
  .cat-img-opts select {
    padding: 2px;
    font-size: 12px;
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
    font-size: 12px;
    background: #7a00ff;
    color: #fff;
    border-radius: 4px;
    padding: 0 4px;
    margin-left: 4px;
  }
  .badge {
    font-size: 12px;
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
    font-size: 12px;
  }
</style>
