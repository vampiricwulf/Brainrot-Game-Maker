<!--
  The slide tabs of a clue that isn't on a board (the tiebreaker, a Final): its question slides in the order they show,
  then the answer, with ＋ Add slide and, with several, ◀ Earlier / Later ▶ / ⧉ Duplicate / 🗑 Delete slide. On a tab:
  ←/→ (Home/End) open the slide beside it; on a question slide's tab Ctrl+D duplicates it (even the only one), and with
  several Alt+←/→ move it, Delete deletes it. Each change is one named step. A Final's 🤫 cards have tabs here too
  (after the question slides, F2 to rename), with ＋ Card.
-->
<script module lang="ts">
  /** What tells a slide apart, so the slide editor starts afresh on another one (the first one has no id). */
  const slideNo = new WeakMap<object, number>();
  let slideCount = 0;
  export function slideKeyOf(slide: object | undefined): string {
    if (!slide) return 'a';
    if (!slideNo.has(slide)) slideNo.set(slide, ++slideCount);
    return `q${slideNo.get(slide)}`;
  }
  /** From this many 🤫 cards, a named card's tab is cut shorter (the clue editor's too), so the row of tabs still fits. */
  export const NARROW_CARDS = 4;
</script>

<script lang="ts">
  import { tick } from 'svelte';
  import { step } from '../lib/history.svelte';
  import type { Place, Side } from '../lib/nav.svelte';
  import { clueCardName, MAX_CARDS, questionSlides, type ClueCard, type ExtraSlide, type Id, type Slide } from '../lib/model';
  import { addClueSlide, deleteClueSlide, duplicateClueSlide, moveClueSlide, type SlideHolder } from '../lib/ops';

  let {
    holder,
    side = $bindable(),
    qi = $bindable(),
    what,
    place,
    plain = false,
    cards,
    ci = $bindable(0),
    onCard = $bindable(false),
    onadded,
  }: {
    holder: SlideHolder;
    /** Slides with nothing to answer (a slides round): no Answer tab, and they're "Slide 1, 2…". */
    plain?: boolean;
    side: Side;
    /** The question slide open (0: the first), kept while the Answer tab is open. */
    qi: number;
    /** For the steps' names: "tiebreaker" ("Added tiebreaker question slide 2"). */
    what: string;
    /** Where a question slide (its id; none: the first) or the answer is, for an undo or redo to show it. */
    place: (side: Side, slide?: string) => Place;
    /** A Final's 🤫 cards: their tabs after the question slides (Question 1…n · 🤫 Card 1…k · Answer), then ＋ Card. */
    cards?: {
      list: ClueCard[];
      onadd: () => void;
      /** F2 or a double-click on a card's tab: its Card name box. */
      onname: () => void;
      /** A card tab's tooltip. */
      title: (c: ClueCard, i: number) => string;
      /** Where a card is, for an undo or redo to show it. */
      place: (card: Id) => Place;
    };
    /** The card open (0: Card 1), kept while another tab is open. */
    ci?: number;
    /** A card's tab is open (`side` is kept for when another opens). */
    onCard?: boolean;
    /** After ＋ Add slide or ⧉ Duplicate: the keys go to the new slide's text box. */
    onadded?: () => void;
  } = $props();

  const qslides = $derived(questionSlides(holder));
  const at = $derived(Math.min(qi, Math.max(0, qslides.length - 1)));
  const list = $derived(cards?.list ?? []);
  const cardAt = $derived(Math.min(ci, Math.max(0, list.length - 1)));
  /** A card's tab is the one open (one deleted since, an undo that took the last away: the question or answer's is). */
  const cardOpen = $derived(onCard && !!list[cardAt]);
  /** Short card tab names (🤫 1, 🤫 2…) when there are many tabs. */
  const shortCards = $derived(qslides.length + list.length > 6);
  const narrow = $derived(list.length >= NARROW_CARDS);

  /** The question slide `s` (the first one has no id), or the answer: where a slide change shows. */
  const placeOf = (s: Slide | undefined, sd: Side = 'q'): Place => place(sd, sd === 'q' ? (s as Partial<ExtraSlide> | undefined)?.id : undefined);
  /**
   * A change to the question slides as one named step; the slide it returns opens. Undone, the slide open before shows
   * again (an undo brings the slides back with their ids); redone, the one it opened (as the clue editor's do).
   */
  function slides(label: string, fn: () => number, notify = false): void {
    const undoPlace = cardOpen && cards ? cards.place(list[cardAt].id) : side === 'a' ? placeOf(undefined, 'a') : placeOf(qslides[at]);
    const opened = placeOf(qslides[at]);
    const to = step(
      plain ? label.replace(' question slide', ' slide') : label,
      () => {
        const i = fn();
        // (Filled in once it's made: the history reads the place after.)
        Object.assign(opened, placeOf(questionSlides(holder)[i]));
        return i;
      },
      { place: opened, undoPlace, notify },
    );
    onCard = false;
    side = 'q';
    qi = to;
  }
  function addSlide(): void {
    // (On the Answer or a card's tab: after the last question slide.)
    const after = side === 'a' || cardOpen ? qslides.length - 1 : at;
    slides(`Added ${what} question slide ${after + 2}`, () => addClueSlide(holder, after));
  }
  const duplicateSlide = () => slides(`Duplicated ${what} question slide ${at + 1}`, () => duplicateClueSlide(holder, at));
  const deleteSlide = () => slides(`Deleted ${what} question slide ${at + 1}`, () => deleteClueSlide(holder, at), true);
  const moveSlide = (d: -1 | 1) => slides(`Moved ${what} question slide ${at + 1} ${d < 0 ? 'earlier' : 'later'}`, () => moveClueSlide(holder, at, d));

  /** Many question slides: short tab names (Q1, Q2…), so the tabs stay on one line. */
  const SHORT_TABS = 4;
  let tablist = $state<HTMLElement>();
  /** The focus on the open tab (after a key changed the tabs, a card's bar went, or Enter in its Card name box). */
  export function focusTab(): Promise<void> {
    return tick().then(() => tablist?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus());
  }
  function tabKey(e: KeyboardEvent): void {
    const n = qslides.length;
    const k = list.length;
    // The tabs in order: 0…n-1 the question slides, n…n+k-1 the cards, n+k the answer (none with plain slides).
    const last = plain ? n - 1 : n + k;
    const now = cardOpen ? n + cardAt : side === 'a' ? n + k : at;
    const mod = e.ctrlKey || e.metaKey;
    const open = (i: number) => {
      e.preventDefault();
      if (i >= n + k) {
        if (plain) return;
        onCard = false;
        side = 'a';
      } else if (i >= n) ((onCard = true), (ci = i - n));
      else ((onCard = false), (side = 'q'), (qi = i));
      focusTab();
    };
    if (!mod && !e.altKey && !e.shiftKey) {
      if (e.key === 'ArrowLeft') return open(Math.max(0, now - 1));
      if (e.key === 'ArrowRight') return open(Math.min(last, now + 1));
      if (e.key === 'Home') return open(0);
      if (e.key === 'End') return open(last);
      if (e.key === 'F2' && cardOpen && cards) {
        e.preventDefault();
        return cards.onname();
      }
    }
    if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'd') {
      // (Even the only slide; never the browser's Bookmark this page, on the Answer or a card's tab either.)
      e.preventDefault();
      if (side === 'q' && !cardOpen) {
        duplicateSlide();
        focusTab();
      }
      return;
    }
    if (cardOpen || side === 'a' || n < 2) return;
    if (e.altKey && !mod && !e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      const d = e.key === 'ArrowLeft' ? -1 : 1;
      if (at + d >= 0 && at + d < n) moveSlide(d);
      focusTab();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && !mod && !e.altKey) {
      e.preventDefault();
      deleteSlide();
      focusTab();
    }
  }
</script>

<div class="tabs">
  <!-- (One Tab stop, the open slide's: ←/→ go along.) -->
  <div class="tablist" role="tablist" aria-label="Slides" tabindex="-1" bind:this={tablist} onkeydown={tabKey}>
    {#each qslides as _, i (i)}
      {@const on = !cardOpen && side === 'q' && at === i}
      <button
        role="tab"
        class:on
        aria-selected={on}
        tabindex={on ? 0 : -1}
        data-qslide={i + 1}
        aria-label={qslides.length > SHORT_TABS ? `${plain ? 'Slide' : 'Question'} ${i + 1}` : undefined}
        onclick={() => ((onCard = false), (side = 'q'), (qi = i))}
        title={qslides.length > 1
          ? `${plain ? 'Slide' : 'Question slide'} ${i + 1} of ${qslides.length}: viewers see them in this order${plain ? '' : ', then the answer'}. On the tab: Alt+←/→ move it, Ctrl+D duplicates it, Delete deletes it`
          : undefined}
        >{plain
          ? qslides.length > SHORT_TABS
            ? `S${i + 1}`
            : qslides.length > 1
              ? `Slide ${i + 1}`
              : 'Slide'
          : qslides.length > SHORT_TABS
            ? `Q${i + 1}`
            : qslides.length > 1
              ? `Question ${i + 1}`
              : 'Question slide'}</button
      >
    {/each}
    {#if cards}
      {#each list as c, i (c.id)}
        {@const on = cardOpen && cardAt === i}
        <button
          role="tab"
          class="card-tab"
          class:on
          class:narrow
          aria-selected={on}
          tabindex={on ? 0 : -1}
          data-card={i + 1}
          aria-label={shortCards ? (c.name?.trim() ? `Card ${i + 1}: ${c.name.trim()}` : `Card ${i + 1}`) : undefined}
          onclick={() => ((onCard = true), (ci = i))}
          ondblclick={() => ((onCard = true), (ci = i), cards.onname())}
          title={cards.title(c, i)}>{shortCards ? `🤫 ${i + 1}` : `🤫 ${clueCardName(c, i)}`}</button
        >
      {/each}
    {/if}
    {#if !plain}
      {@const on = !cardOpen && side === 'a'}
      <button role="tab" class:on aria-selected={on} tabindex={on ? 0 : -1} onclick={() => ((onCard = false), (side = 'a'))}
        >{qslides.length > 1 || list.length ? 'Answer' : 'Answer slide (hidden until revealed)'}</button
      >
    {/if}
  </div>
  <button
    class="ghost add"
    onclick={() => (addSlide(), onadded?.())}
    title={plain
      ? 'Add a slide after this one'
      : side === 'a' || cardOpen
        ? 'Add a question slide before the answer'
        : 'Add a question slide after this one: lead in, then show more before the answer'}>＋ Add slide</button
  >
  {#if cards}
    <button
      class="ghost add"
      onclick={cards.onadd}
      disabled={list.length >= MAX_CARDS}
      title={list.length >= MAX_CARDS
        ? `A ${what} holds ${MAX_CARDS} cards`
        : `Add a 🤫 card: a slide only the players you send it to see (never on stream), offered in the host panel during this ${what}, from the wagers to the last reveal (a hint for the leader, a side bet for those sitting out…)`}>＋ Card</button
    >
  {/if}
  {#if qslides.length > 1 && side === 'q' && !cardOpen}
    <span class="spacer"></span>
    <div class="slidetools" role="group" aria-label="{plain ? 'Slide' : 'Question slide'} {at + 1} of {qslides.length}">
      <span class="muted small">Slide {at + 1} of {qslides.length}</span>
      <button class="ghost small" onclick={() => moveSlide(-1)} disabled={at === 0} aria-label="Move slide earlier" title="Move this slide earlier">◀ Earlier</button>
      <button class="ghost small" onclick={() => moveSlide(1)} disabled={at === qslides.length - 1} aria-label="Move slide later" title="Move this slide later">Later ▶</button>
      <button class="ghost small" onclick={() => (duplicateSlide(), onadded?.())} title="A copy of this slide, right after it">⧉ Duplicate</button>
      <button class="ghost small danger" onclick={deleteSlide} title="Delete this {plain ? '' : 'question '}slide (Ctrl+Z brings it back)">🗑 Delete slide</button>
    </div>
  {/if}
</div>

<style>
  .tabs {
    display: flex;
    gap: 4px;
    align-items: flex-end;
    flex-wrap: wrap;
    border-bottom: 1px solid var(--border);
    margin: 12px 0;
  }
  .tablist {
    display: flex;
    gap: 4px;
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: thin;
  }
  .tablist button {
    flex: none;
  }
  /* A long card name is cut on its tab (the tab's tooltip and the card's bar have it whole). */
  .card-tab {
    max-width: 18ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .card-tab.narrow {
    max-width: 12ch;
  }
  .tabs button {
    border-radius: 6px 6px 0 0;
  }
  /* ＋ Add slide sits quietly after the tabs. */
  .tabs .add {
    font-size: 12px;
    opacity: 0.8;
  }
  .slidetools {
    display: flex;
    gap: 4px;
    align-items: center;
    padding-bottom: 3px;
  }
  .slidetools button {
    border-radius: 6px;
  }
  .tabs button.on {
    background: var(--accent-fill);
    border-color: var(--accent-fill);
    color: #fff;
  }
</style>
