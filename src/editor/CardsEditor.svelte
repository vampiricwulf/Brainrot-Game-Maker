<!--
  Editor tab: 🤫 Cards, private cards made before the show (cards spec §4). During play 🤫 Send a card… sends one to the
  players the host picks, on their phones only, and lists them in this order: drag them in the list, or right-click for
  more. The card open is the one picked, else the first.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import PageHeader from './PageHeader.svelte';
  import SavedCardEditor from './SavedCardEditor.svelte';
  import { app } from '../lib/app.svelte';
  import { announce } from '../lib/announce';
  import { flash, take } from '../lib/nav.svelte';
  import { step } from '../lib/history.svelte';
  import { DragOrder } from '../lib/dragorder.svelte';
  import { copySavedCard, moveTo } from '../lib/listedit';
  import { freeName } from './tools/ToolPopup.svelte';
  import { showMenu } from '../lib/menustate.svelte';
  import { CARD_NAME_MAX, newSavedCard, savedCardName, type SavedCard } from '../lib/model';

  const game = $derived(app.game);
  const list = $derived(game.cards ?? []);
  let sel = $state<string | null>(null);
  const card = $derived(list.find((c) => c.id === sel) ?? list[0]);
  /** 📱 On their phone, kept on while going from card to card (as in the clue editor). */
  let phoneView = $state(false);
  // An undo or redo here opens the card it changed.
  const handled = { seq: 0 };
  $effect(() => {
    const place = take(handled);
    if (place?.tab === 'cards' && place.card) sel = place.card;
  });

  /** How a step names it ("Untitled card 2" for one with no name). */
  const named = (c: SavedCard): string => savedCardName(c, list.indexOf(c));

  /** Put the focus back on a card's button in the list (after it moved, or was renamed). */
  function focusItem(id: string): void {
    void tick().then(() => document.querySelector<HTMLElement>(`[data-saved-card="${id}"]`)?.focus());
  }

  /**
   * A new card, open, its words box ready to type in (said aloud: that box is named the same on every card). Undo goes
   * back to the card that was open.
   */
  function add(): void {
    const c = newSavedCard(freeName('Private card', list));
    step(
      `Added card “${c.name}”`,
      () => {
        if (!game.cards) game.cards = [];
        game.cards.push(c);
      },
      { undoPlace: card ? { tab: 'cards', card: card.id } : { tab: 'cards' } },
    );
    sel = c.id;
    announce(`Card “${c.name}” added`);
    void tick().then(() => document.querySelector<HTMLElement>('main [data-field="card"]')?.focus());
  }

  /**
   * A copy right after it, with its own items, open. From the list (Ctrl+D, the right-click menu) the focus goes to the
   * copy's row too, so the next key acts on the copy. Undo goes back to the card copied.
   */
  function dup(c: SavedCard, fromList = false): void {
    const cards = game.cards;
    if (!cards) return;
    const copy = copySavedCard(c, cards.map((x) => x.name));
    step(`Duplicated card “${named(c)}”`, () => cards.splice(cards.indexOf(c) + 1, 0, copy), { undoPlace: { tab: 'cards', card: c.id } });
    sel = copy.id;
    if (fromList) focusItem(copy.id);
    flash(`card:${copy.id}`);
  }

  /**
   * Deleting is done at once: the note at the bottom offers Undo. The card now in its place (else the one before) opens
   * if this one was open, as round tabs do; from the list (its keys or its menu) that card's row takes the keys.
   */
  function remove(c: SavedCard, fromList = false): void {
    const at = list.indexOf(c);
    const wasOpen = card?.id === c.id;
    step(
      `Deleted card “${named(c)}”`,
      () => {
        if (!game.cards) return;
        game.cards = game.cards.filter((x) => x.id !== c.id);
        if (!game.cards.length) delete game.cards;
      },
      { notify: true },
    );
    const next = list[Math.min(at, list.length - 1)];
    if (wasOpen) sel = next?.id ?? null;
    if (fromList && next) focusItem(next.id);
  }

  function move(from: number, to: number): void {
    const cards = game.cards;
    const c = cards?.[from];
    if (!cards || !c || to < 0 || to >= cards.length || to === from) return;
    const n = named(c);
    // (Its place given: the slots that changed can't say which card moved, the one next to it changed too.)
    step(`Moved card “${n}” ${to < from ? 'up' : 'down'}`, () => moveTo(cards, from, to), { place: { tab: 'cards', card: c.id } });
    announce(`Card “${n}” moved to ${to + 1} of ${cards.length}`);
    focusItem(c.id);
  }

  /**
   * The card being renamed in place. Its row takes the focus back (Enter, Esc, a click on nothing), but not from a field
   * or another card clicked: the next key goes there, not to the row, where Backspace would delete the card.
   */
  let renaming = $state<string | null>(null);
  function rename(c: SavedCard, name: string, refocus = true): void {
    renaming = null;
    const to = name.trim();
    if (to && to !== c.name) step(`Renamed card “${named(c)}” to “${to}”`, () => (c.name = to));
    if (refocus) focusItem(c.id);
  }
  const focusAll = (el: HTMLInputElement) => {
    el.focus();
    el.select();
  };

  function menu(e: MouseEvent, c: SavedCard, i: number): void {
    showMenu(e, [
      { heading: savedCardName(c, i) },
      { label: '✎ Rename', onclick: () => (renaming = c.id), keys: 'F2' },
      { label: '⧉ Duplicate', onclick: () => dup(c, true), keys: 'Ctrl+D' },
      { label: '▲ Move up', onclick: () => move(i, i - 1), disabled: i === 0, keys: 'Alt+↑' },
      { label: '▼ Move down', onclick: () => move(i, i + 1), disabled: i === list.length - 1, keys: 'Alt+↓' },
      { sep: true },
      { label: '🗑 Delete card', danger: true, onclick: () => remove(c, true), keys: 'Delete' },
    ]);
  }

  /**
   * On a card in the list: Enter goes into it (its name, selected), F2 renames, Ctrl+D duplicates, Delete / Backspace
   * deletes, Alt+↑/↓ moves it.
   */
  function itemKey(e: KeyboardEvent, c: SavedCard, i: number): void {
    if (e.repeat && e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Enter' && !mod && !e.altKey && !e.shiftKey) {
      sel = c.id;
      void tick().then(() => {
        const el = document.querySelector<HTMLInputElement>('main [data-field="card-name"]');
        el?.focus();
        el?.select();
      });
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && !mod && !e.altKey) remove(c, true);
    else if (e.key === 'F2') renaming = c.id;
    else if (mod && !e.altKey && e.key.toLowerCase() === 'd') dup(c, true);
    else if (e.altKey && !mod && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) move(i, i + (e.key === 'ArrowUp' ? -1 : 1));
    else return;
    e.preventDefault();
  }

  const rows = new DragOrder();
</script>

<!-- (Wider than other pages, on or off: 📱 On their phone takes a column of its own beside the slide editor when there's
     room, and turning it on never moves what's on the page.) -->
<div class="page wide">
<PageHeader
  title="Cards"
  sub="Private cards made before the show, in the order 🤫 Send a card… lists them during play. Only the players you send one to see it, on their phones (or 📋 copied, or in the 🪟 card window), never the stream. A tile can have cards of its own too (＋ Card in its clue editor)."
/>

<div class="layout">
  <!-- Not a second nav and main: the editor's own are around it. -->
  <section class="list" aria-label="Your cards">
    <!-- (A list only once it has cards in it.) -->
    {#if list.length}
      <div class="group" role="list" aria-label="Cards">
        {#each list as c, i (c.id)}
          {@const line = rows.lineAt(c.id)}
          <div
            class="drag-row"
            class:drop-before={line === 'before'}
            class:drop-after={line === 'after'}
            class:dragging={rows.dragging === c.id}
            role="listitem"
            ondragover={(e) => rows.over(e, c.id)}
            ondrop={(e) => {
              const m = rows.drop(e, list.map((x) => x.id));
              if (m) move(m.from, m.to);
            }}
          >
            {#if renaming === c.id}
              <input
                class="rename"
                value={c.name}
                aria-label="Card name"
                maxlength={CARD_NAME_MAX}
                use:focusAll
                onkeydown={(e) => {
                  if (e.key === 'Enter') rename(c, e.currentTarget.value);
                  else if (e.key === 'Escape') {
                    e.stopPropagation();
                    rename(c, c.name);
                  }
                }}
                onblur={(e) => renaming === c.id && rename(c, e.currentTarget.value, !e.relatedTarget)}
              />
            {:else}
              <button
                class:active={c.id === card?.id}
                aria-current={c.id === card?.id ? 'true' : undefined}
                data-place="card:{c.id}"
                data-saved-card={c.id}
                draggable="true"
                title="Enter to open · drag to reorder · double-click or F2 to rename · right-click for more"
                onclick={(e) => {
                  sel = c.id;
                  // (Safari and Firefox on a Mac don't focus a clicked button: it takes the keys, not a card renamed.)
                  e.currentTarget.focus();
                }}
                ondblclick={() => (renaming = c.id)}
                oncontextmenu={(e) => menu(e, c, i)}
                onkeydown={(e) => itemKey(e, c, i)}
                ondragstart={(e) => {
                  // (In a narrow window the names are a row: the drop line stands beside one, not under it.)
                  const group = e.currentTarget.closest('.group');
                  rows.across = !!group && getComputedStyle(group).flexDirection === 'row';
                  rows.start(e, c.id);
                }}
                ondragend={() => rows.end()}
              >
                {savedCardName(c, i)}
              </button>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
    <button class="ghost" onclick={add} title="A new card, its words box ready to type in">＋ Add card</button>
  </section>

  <section class="pane" aria-label="Card">
    {#if card}
      <div class="row top">
        <span class="spacer"></span>
        <button class="ghost" onclick={() => dup(card)} title="A copy of this card, right after it (Ctrl+D)">⧉ Duplicate</button>
        <button class="ghost danger" onclick={() => remove(card)} title="Delete this card (Undo brings it back)">🗑 Delete card</button>
      </div>
      {#key card.id}<SavedCardEditor {card} index={list.indexOf(card)} bind:phoneView />{/key}
    {:else}
      <!-- (No second ＋ Add card here: the one on the left is the only one.) -->
      <div class="empty">
        <span class="ic" aria-hidden="true">🤫</span>
        <p><b>No cards yet.</b></p>
        <p>
          Make private cards before the show: words, pictures, GIFs, videos, sounds or a YouTube link on each. During play,
          <b>🤫 Send a card…</b> in the host panel’s tools row sends one to the players you choose, and only they see it. Add
          one with <b>＋ Add card</b> on the left.
        </p>
        <p class="muted">A tile can have cards of its own too (＋ Card in its clue editor), offered when the tile is played.</p>
      </div>
    {/if}
  </section>
</div>
</div>

<style>
  .page.wide {
    max-width: 1520px;
  }
  .layout {
    display: grid;
    grid-template-columns: 200px minmax(0, 1fr);
    gap: 16px;
  }
  .list,
  .group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .group > div {
    display: flex;
    flex-direction: column;
  }
  .list button {
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .list button.active {
    background: var(--accent-fill);
    border-color: var(--accent-fill);
    color: #fff;
  }
  .rename {
    min-width: 0;
  }
  /* (SavedCardEditor lays itself out by this side's width, not the window's.) */
  .pane {
    container-type: inline-size;
    min-width: 0;
  }
  .top {
    margin-bottom: 8px;
  }
  .empty {
    max-width: 640px;
    padding: 24px;
    border: 2px dashed var(--border);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    text-align: center;
  }
  .empty p {
    margin: 0;
  }
  .empty .ic {
    font-size: 32px;
  }
  /* A narrow window (half a screen, a small laptop): the names go in a row over the card, so the slide editor has the
     width (beside a column of names its canvas would be a few fingers wide). */
  @media (max-width: 1200px) {
    .layout {
      grid-template-columns: 1fr;
    }
    .group {
      flex-direction: row;
      flex-wrap: wrap;
    }
    .group > div {
      max-width: 240px;
    }
    .group > .drag-row.drop-before::before,
    .group > .drag-row.drop-after::after {
      top: 0;
      bottom: 0;
      width: 2px;
      height: auto;
    }
    .group > .drag-row.drop-before::before {
      left: -3px;
      right: auto;
    }
    .group > .drag-row.drop-after::after {
      left: auto;
      right: -3px;
    }
    .list > button {
      align-self: flex-start;
    }
  }
</style>
