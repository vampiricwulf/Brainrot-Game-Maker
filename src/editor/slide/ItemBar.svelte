<!--
  The selected item's bar, pinned at the top of the slide editor's side panel (and the board images'): its icon and
  name, then ⋯ (its menu, the same as a right-click), and on the line under them its edit (✎ Edit text, ✎ Edit image…,
  ✎ Edit video… / sound…, Test link ↗…), ⧉ Duplicate, 🔒 Lock and, apart at the right, 🗑 Delete. With several selected
  it reads "3 items selected" with the same buttons; with none, the buttons are there, greyed (the ⋯ is the slide's
  menu), so the panel never moves under the pointer as things are selected.
-->
<script lang="ts">
  import type { Game, SlideElement } from '../../lib/model';
  import { editWords, layerIcon, layerLabel } from '../../lib/layerlabel';
  import { embedOpenUrl } from '../../lib/links';
  import { openMediaPopup } from '../../lib/mediactl.svelte';
  import { editOffer } from '../../lib/shrink/apply';

  let {
    items,
    all,
    game,
    every = true,
    onedit,
    onduplicate,
    onlock,
    ondelete,
    onmenu,
  }: {
    /** The selected items. */
    items: SlideElement[];
    /** Every item there (the bar is as tall as the longest edit among them needs, whichever is selected). */
    all: SlideElement[];
    game: Game;
    /** The edit for every kind (the slide editor's); else only a picture's ✎ Edit image… (the board images'). */
    every?: boolean;
    /** Open the item's editor, as a double-click or Enter does. */
    onedit: (el: SlideElement) => void;
    onduplicate: () => void;
    /** Lock them all (true) or unlock them all. */
    onlock: (on: boolean) => void;
    ondelete: () => void;
    /** ⋯: the item's menu (none selected: the slide's), dropping from the button. */
    onmenu: (from: HTMLElement) => void;
  } = $props();

  const one = $derived(items.length === 1 ? items[0] : undefined);
  const locked = $derived(items.filter((e) => e.locked).length);
  /** Whether a video's or sound's file ✎ edits here ('busy': not now). */
  const offerFor = (el: SlideElement) => (el.kind === 'video' || el.kind === 'audio' ? editOffer(game.media.find((m) => m.id === el.media)) : null);
  const offer = $derived(one ? offerFor(one) : null);
  /** An item's edit here, as its menu has it (a link's is Test link ↗ here: its Link box is right below), or none. */
  const editFor = (el: SlideElement, media: 'on' | 'busy' | null): string | null =>
    !every && el.kind !== 'image' ? null : el.kind === 'embed' ? 'Test link ↗' : editWords(el, media);
  /** The one item's edit. */
  const edit = $derived.by(() => {
    const words = one && editFor(one, offer);
    if (!one || !words) return null;
    if (one.kind === 'embed') return { words, run: () => openMediaPopup(embedOpenUrl(one.embedKind, one.url, one.startAt)) };
    return { words, run: () => onedit(one) };
  });
  /** The longest edit among them all, for the bar's height. */
  const longest = $derived(
    all.reduce((w, el) => {
      const words = editFor(el, offerFor(el)) ?? '';
      return words.length > w.length ? words : w;
    }, ''),
  );
  const editTitle = $derived(
    offer === 'busy'
      ? 'Wait for it to finish (the header shows how far it got)'
      : one?.kind === 'video' && offer
        ? 'Trim, crop or resize this video: every place that uses it gets the edited one, on stream too (Ctrl+Z puts the old one back)'
        : one?.kind === 'audio' && offer
          ? 'Trim this sound: every place that uses it gets the trimmed one (Ctrl+Z puts the old one back)'
          : 'Double-click or Enter does it too',
  );
</script>

<div class="itembar" role="group" aria-label={one ? `Selected: ${layerLabel(one, game)}` : items.length ? `${items.length} items selected` : 'Nothing selected'}>
  <div class="what">
    {#if one}
      <span class="ic" aria-hidden="true">{layerIcon(one)}</span><span class="name" title={layerLabel(one, game)}>{layerLabel(one, game)}</span>
    {:else if items.length}
      <span class="ic" aria-hidden="true">▦</span><span class="name">{items.length} items selected</span>
    {:else}
      <span class="name muted">Nothing selected</span>
    {/if}
    <span class="spacer"></span>
    <button
      class="ghost small more"
      onclick={(e) => onmenu(e.currentTarget)}
      aria-haspopup="menu"
      aria-label={one ? `More for ${layerLabel(one, game)}` : items.length ? 'More for the selected items' : 'More for this slide'}
      title={items.length ? 'Its menu: the same as a right-click on it (Shift+F10)' : 'The slide’s menu: the same as a right-click on an empty spot'}>⋯</button
    >
  </div>
  <div class="rows">
    <div class="row">
      {#if edit}
        <button class="small" onclick={edit.run} disabled={offer === 'busy'} title={editTitle} data-edit-media={offer ? true : undefined}>{edit.words}</button>
      {/if}
      <button class="small" onclick={onduplicate} disabled={!items.length} title="A copy, just below and to the right (Ctrl+D)">⧉ Duplicate</button>
      <button
        class="small"
        class:on={!!items.length && locked === items.length}
        onclick={() => onlock(locked < items.length)}
        disabled={!items.length}
        aria-pressed={!items.length ? undefined : locked === items.length ? true : locked ? 'mixed' : false}
        title="A locked item can't be moved, resized, nudged or deleted, and clicks on the slide go through it">🔒 Lock</button
      >
      <span class="end">
        <button
          class="ghost small danger"
          onclick={ondelete}
          disabled={!items.length || locked === items.length}
          title={items.length && locked === items.length ? 'Locked: unlock it to delete it' : 'Delete (Del): Undo brings it back'}>🗑 Delete</button
        >
      </span>
    </div>
    <!-- (The same row with the longest edit there, out of sight under it: the bar is always as tall as that one, so it
      keeps its height with nothing, one item or several selected, and a double-click in Layers lands both clicks on one
      row.) -->
    <div class="row sizer" aria-hidden="true" inert>
      {#if longest}<button class="small" tabindex="-1">{longest}</button>{/if}
      <button class="small" tabindex="-1">⧉ Duplicate</button>
      <button class="small" tabindex="-1">🔒 Lock</button>
      <span class="end"><button class="ghost small danger" tabindex="-1">🗑 Delete</button></span>
    </div>
  </div>
</div>

<style>
  /* Pinned at the top of the side panel as it scrolls. */
  .itembar {
    position: sticky;
    top: 0;
    z-index: 3;
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 12px;
    padding: 6px 8px;
    background: var(--panel-2);
    border: 1px solid var(--border);
    border-radius: 8px;
  }
  .what,
  .row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .row {
    flex-wrap: wrap;
  }
  /* The row and its out-of-sight longest self in one place: the taller one sets the height. */
  .rows {
    display: grid;
  }
  .rows > .row {
    grid-area: 1 / 1;
    align-self: start;
  }
  .sizer {
    visibility: hidden;
    pointer-events: none;
  }
  .ic {
    flex: none;
  }
  .name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
    font-weight: 600;
  }
  .name.muted {
    font-weight: 400;
  }
  .more {
    flex: none;
    padding: 0 8px;
    font-size: 16px;
    line-height: 1.2;
  }
  /* 🗑 apart from the rest at the right end, as in the editor's lists (and at the right when it wraps to a line of its own). */
  .end {
    display: inline-flex;
    margin-left: auto;
    padding-left: 8px;
  }
</style>
