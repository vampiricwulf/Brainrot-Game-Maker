<!--
  The slide tabs of a clue that isn't on a board (the tiebreaker, a Final) or a slides round's: its question slides in
  the order they show, then the answer, and right after them the open slide's group (SlideGroup: ＋ Add slide, ⧉
  Duplicate slide, 📋 Copy slide, 📋 Paste slide ▾, ◀ ▶, 🗑 Delete slide apart). On a tab: ←/→ (Home/End) open the
  slide beside it; on a question slide's tab Ctrl+D duplicates it (even the only one), and with several Alt+←/→ move
  it, Delete deletes it; Ctrl+C / Ctrl+V copy the slide and paste the copied one as a new slide. A right-click on a tab
  (or Shift+F10 on it) gives its menu. Each change is one named step. A Final's 🤫 cards have tabs here too (after the
  question slides, F2 to rename, Ctrl+D and Alt+←/→ for the card), with ＋ 🤫 Card.
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
  import { app, toast } from '../lib/app.svelte';
  import { clipboard, copySlide, takeCopiedSlide } from '../lib/clipboard.svelte';
  import { step } from '../lib/history.svelte';
  import type { Place, Side } from '../lib/nav.svelte';
  import { clueCardName, MAX_CARDS, questionSlides, slideText, type ClueCard, type ExtraSlide, type Id, type Slide } from '../lib/model';
  import { addClueSlide, deleteClueSlide, duplicateClueSlide, insertClueSlide, moveClueSlide, type SlideHolder } from '../lib/ops';
  import { isMenuKey, keyMenu, showMenu } from '../lib/menustate.svelte';
  import { slideTabMenu, slideTabTitle } from '../lib/slidetabs';
  import { slideHasContent } from '../lib/usage';
  import { copyIsTheBrowsers } from '../lib/undokeys';
  import SlideGroup from './SlideGroup.svelte';

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
    /** Its slides: the question slides, and the answer (none in a slides round). */
    holder: SlideHolder & { answerSlide?: Slide };
    /** Slides with nothing to answer (a slides round): no Answer tab, and they're "Slide 1, 2…". */
    plain?: boolean;
    side: Side;
    /** The question slide open (0: the first), kept while the Answer tab is open. */
    qi: number;
    /** What the slides are of, for the steps' names: "the tiebreaker" ("Added question slide 2 to the tiebreaker"). */
    what: string;
    /** Where a question slide (its id; none: the first) or the answer is, for an undo or redo to show it. */
    place: (side: Side, slide?: string) => Place;
    /** A Final's 🤫 cards: their tabs after the question slides (Question 1…n · 🤫 Card 1…k · Answer), then ＋ 🤫 Card. */
    cards?: {
      list: ClueCard[];
      onadd: () => void;
      /** F2 or a double-click on a card's tab: its Card name box. */
      onname: () => void;
      /** A card tab's tooltip. */
      title: (c: ClueCard, i: number) => string;
      /** Where a card is, for an undo or redo to show it. */
      place: (card: Id) => Place;
      /** The open card's ⧉ Duplicate card, ◀ ▶ and 🗑 Delete card (in the group and its tab's menu). */
      onduplicate: () => void;
      onmove: (d: -1 | 1) => void;
      ondelete: () => void;
      /** Its tab's menu: ⧉ Same as the answer, and 📱 On their phone (`phone`: it's on). */
      onsame: () => void;
      onphone: () => void;
      phone: boolean;
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
  /** The tab open, as the group and the menus see it. */
  const tab = $derived<'q' | 'a' | 'card'>(cardOpen ? 'card' : side === 'a' && !plain ? 'a' : 'q');

  /** The question slide `s` (the first one has no id), or the answer: where a slide change shows. */
  const placeOf = (s: Slide | undefined, sd: Side = 'q'): Place => place(sd, sd === 'q' ? (s as Partial<ExtraSlide> | undefined)?.id : undefined);
  /** Where the tab open is. */
  const openPlace = (): Place => (cardOpen && cards ? cards.place(list[cardAt].id) : side === 'a' ? placeOf(undefined, 'a') : placeOf(qslides[at]));
  /**
   * A change to the question slides as one named step; the slide it returns opens. Undone, the slide open before shows
   * again (an undo brings the slides back with their ids); redone, the one it opened (as the clue editor's do).
   */
  function slides(label: string, fn: () => number, notify = false): void {
    const undoPlace = openPlace();
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
    const after = tab === 'q' ? at : qslides.length - 1;
    slides(`Added question slide ${after + 2} to ${what}`, () => addClueSlide(holder, after));
  }
  const duplicateSlide = () => slides(`Duplicated question slide ${at + 1} of ${what}`, () => duplicateClueSlide(holder, at));
  const deleteSlide = () => slides(`Deleted question slide ${at + 1} of ${what}`, () => deleteClueSlide(holder, at), true);
  const moveSlide = (d: -1 | 1) => slides(`Moved question slide ${at + 1} of ${what} ${d < 0 ? 'earlier' : 'later'}`, () => moveClueSlide(holder, at, d));

  /** The slide the open tab shows. */
  const openSlide = (): Slide | undefined => (cardOpen ? list[cardAt] : tab === 'a' ? holder.answerSlide : qslides[at]);
  /** The open tab's name, as its tab and the History say it. */
  const openName = (): string =>
    cardOpen ? clueCardName(list[cardAt], cardAt) : tab === 'a' ? 'the answer slide' : `${plain ? 'slide' : 'question slide'} ${at + 1}`;
  function copyOpen(): void {
    const s = openSlide();
    if (!s) return;
    copySlide(app.game, s);
    toast('Slide copied: 📋 Paste slide by the tabs puts it in as a new slide (its ▾: over another), here or in another game');
  }
  /** 📋 Paste slide: as a new slide after the question slide open (from the Answer or a card's tab: before the answer), or over the open one. */
  function pasteSlide(over: boolean): void {
    if (!clipboard.slide) return void toast('Copy a slide first (📋 Copy slide, or Ctrl+C on its tab)');
    if (!over) {
      const after = tab === 'q' ? at : qslides.length - 1;
      return slides(`Pasted a slide as question slide ${after + 2} of ${what}`, () => insertClueSlide(holder, after, takeCopiedSlide(app.game)!));
    }
    const target = openSlide();
    if (!target) return;
    const here = openPlace();
    step(
      `Pasted a slide over ${openName()} of ${what}`,
      () => {
        const s = takeCopiedSlide(app.game)!;
        target.background = s.background;
        target.elements = s.elements;
      },
      { place: here, undoPlace: here, notify: true },
    );
  }
  /** A card's ⧉ Duplicate card, ◀ ▶ and 🗑 Delete card; else the question slide's (none on the Answer). */
  function duplicateOpen(): void {
    if (cardOpen && cards) return cards.onduplicate();
    if (tab === 'q') duplicateSlide();
  }
  function moveOpen(d: -1 | 1): void {
    if (cardOpen && cards) return cards.onmove(d);
    if (tab === 'q' && at + d >= 0 && at + d < qslides.length) moveSlide(d);
  }
  function deleteOpen(): void {
    if (cardOpen && cards) return cards.ondelete();
    if (tab === 'q' && qslides.length > 1) deleteSlide();
  }

  /** Open tab `i` (0…n-1 the question slides, n…n+k-1 the cards, n+k the answer). */
  function openTab(i: number): void {
    const n = qslides.length;
    if (i >= n + list.length) {
      if (plain) return;
      onCard = false;
      side = 'a';
    } else if (i >= n) ((onCard = true), (ci = i - n));
    else ((onCard = false), (side = 'q'), (qi = i));
  }
  /** The open tab's menu (a right-click on a tab opens that tab first). */
  function tabMenu() {
    const c = cardOpen ? list[cardAt] : undefined;
    return slideTabMenu(
      {
        tab,
        name: c ? `🤫 ${clueCardName(c, cardAt)}` : tab === 'a' ? 'Answer slide' : tabName(at),
        at: c ? cardAt : at,
        count: c ? list.length : qslides.length,
        plain,
        copied: !!clipboard.slide,
        newest: clipboard.slideNewest,
        card: c && { empty: !slideHasContent(c), answer: !!holder.answerSlide && slideHasContent(holder.answerSlide), phone: !!cards?.phone, full: list.length >= MAX_CARDS },
      },
      {
        duplicate: duplicateOpen,
        copy: copyOpen,
        paste: pasteSlide,
        move: moveOpen,
        remove: deleteOpen,
        add: addSlide,
        rename: () => cards?.onname(),
        sameAsAnswer: () => cards?.onsame(),
        phone: () => cards?.onphone(),
      },
    );
  }
  function rightClick(e: MouseEvent, i: number): void {
    // (The tab it's for opens first: its menu acts there.)
    openTab(i);
    showMenu(e, tabMenu());
  }

  /** Many question slides: short tab names (Q1, Q2…), so the tabs stay on one line. */
  const SHORT_TABS = 4;
  /** Question slide `i`'s tab name, as its menu heads it. */
  const tabName = (i: number) =>
    plain ? (qslides.length > 1 ? `Slide ${i + 1}` : 'Slide') : qslides.length > 1 ? `Question ${i + 1}` : 'Question slide';
  /** As its tab shows it (S3, Q3 with many). */
  const tabLabel = (i: number) => (qslides.length > SHORT_TABS ? `${plain ? 'S' : 'Q'}${i + 1}` : tabName(i));
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
    const now = cardOpen ? n + cardAt : tab === 'a' ? n + k : at;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    const open = (i: number) => {
      e.preventDefault();
      openTab(i);
      focusTab();
    };
    if (isMenuKey(e)) return void keyMenu(e, tabMenu(), e.target as HTMLElement);
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
    if (mod && !e.altKey && !e.shiftKey && key === 'c' && !copyIsTheBrowsers(e.currentTarget as Element, window.getSelection())) {
      // The whole slide (not what's selected on it, nor the browser's copy).
      e.preventDefault();
      return copyOpen();
    }
    if (mod && !e.altKey && !e.shiftKey && key === 'v' && !cardOpen && clipboard.slide && clipboard.slideNewest) {
      // The copied slide as a new one (items or a picture copied since go on the slide as before, as on a card's tab).
      e.preventDefault();
      pasteSlide(false);
      return void focusTab();
    }
    if (mod && !e.altKey && !e.shiftKey && key === 'd') {
      // (Even the only slide; never the browser's Bookmark this page, on the Answer's tab either.)
      e.preventDefault();
      if (tab !== 'a') {
        duplicateOpen();
        focusTab();
      }
      return;
    }
    if (tab === 'a') return;
    if (e.altKey && !mod && !e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      moveOpen(e.key === 'ArrowLeft' ? -1 : 1);
      focusTab();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && !mod && !e.altKey && !cardOpen && n > 1) {
      // (Not on a card's tab, as not on the Answer's: 🗑 Delete card does it.)
      e.preventDefault();
      deleteSlide();
      focusTab();
    }
  }
</script>

<div class="tabs">
  <!-- (One Tab stop, the open slide's: ←/→ go along.) -->
  <div class="tablist" role="tablist" aria-label="Slides" tabindex="-1" bind:this={tablist} onkeydown={tabKey}>
    {#each qslides as s, i (i)}
      {@const on = !cardOpen && tab === 'q' && at === i}
      <button
        role="tab"
        class:on
        aria-selected={on}
        tabindex={on ? 0 : -1}
        data-qslide={i + 1}
        aria-label={qslides.length > SHORT_TABS ? `${plain ? 'Slide' : 'Question'} ${i + 1}` : undefined}
        onclick={() => ((onCard = false), (side = 'q'), (qi = i))}
        oncontextmenu={(e) => rightClick(e, i)}
        title={slideTabTitle(
          tabLabel(i),
          slideText(s),
          qslides.length > 1
            ? `${plain ? 'Slide' : 'Question slide'} ${i + 1} of ${qslides.length}: viewers see them in this order${plain ? '' : ', then the answer'}. On the tab: Alt+←/→ move it, Ctrl+D duplicates it, Delete deletes it; right-click: its menu`
            : 'Right-click: its menu',
        )}
        >{tabLabel(i)}</button
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
          oncontextmenu={(e) => rightClick(e, qslides.length + i)}
          title={cards.title(c, i)}>{shortCards ? `🤫 ${i + 1}` : `🤫 ${clueCardName(c, i)}`}</button
        >
      {/each}
    {/if}
    {#if !plain}
      {@const on = !cardOpen && side === 'a'}
      <button
        role="tab"
        class:on
        aria-selected={on}
        tabindex={on ? 0 : -1}
        onclick={() => ((onCard = false), (side = 'a'))}
        oncontextmenu={(e) => rightClick(e, qslides.length + list.length)}
        title={slideTabTitle('Answer', holder.answerSlide ? slideText(holder.answerSlide) : '', 'Hidden until revealed. Right-click: its menu')}
        >{qslides.length > 1 || list.length ? 'Answer' : 'Answer slide (hidden until revealed)'}</button
      >
    {/if}
  </div>
  <SlideGroup
    {tab}
    at={cardOpen ? cardAt : at}
    count={cardOpen ? list.length : qslides.length}
    {plain}
    copied={!!clipboard.slide}
    full={list.length >= MAX_CARDS}
    addTitle={plain ? 'Add a slide after this one' : tab !== 'q' ? 'Add a question slide before the answer' : 'Add a question slide after this one: lead in, then show more before the answer'}
    onadd={() => (addSlide(), onadded?.())}
    onduplicate={() => (duplicateOpen(), !cardOpen && onadded?.())}
    oncopy={copyOpen}
    onpaste={pasteSlide}
    onmove={moveOpen}
    ondelete={deleteOpen}
  >
    {#snippet cardButton()}
      {#if cards}
        <button
          class="ghost add"
          onclick={cards.onadd}
          disabled={list.length >= MAX_CARDS}
          title={list.length >= MAX_CARDS
            ? `A ${what} holds ${MAX_CARDS} cards`
            : `Add a 🤫 card: a slide only the players you send it to see (never on stream), offered in the host panel during this ${what}, from the wagers to the last reveal (a hint for the leader, a side bet for those sitting out…)`}>＋ 🤫 Card</button
        >
      {/if}
    {/snippet}
  </SlideGroup>
</div>

<style>
  /* One line from a laptop up: the tabs scroll (as many slides' do) before the group wraps under them. */
  .tabs {
    display: flex;
    gap: 4px;
    align-items: flex-end;
    border-bottom: 1px solid var(--border);
    margin: 12px 0;
  }
  .tablist {
    flex: 0 1 auto;
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
  .tablist button {
    border-radius: 6px 6px 0 0;
  }
  .tabs .add {
    font-size: 12px;
    opacity: 0.8;
  }
  @media (max-width: 900px) {
    .tabs {
      flex-wrap: wrap;
    }
  }
</style>
