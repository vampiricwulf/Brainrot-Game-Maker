<!--
  The open slide's buttons, one group right after the slide tabs (the clue editor's and SlideTabs'): ＋ Add slide (and
  ＋ 🤫 Card), ⧉ Duplicate slide, 📋 Copy slide, 📋 Paste slide (as a new slide; its ▾: over this one, one undo step), ◀ ▶,
  then 🗑 Delete slide apart at the right. Always there, greyed where the open tab can't do it (the Answer); on a 🤫
  card's tab they're the card's (⧉ Duplicate card, ◀ ▶ among the cards, 🗑 Delete card).
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { dropMenu } from '../lib/menustate.svelte';

  let {
    tab,
    at,
    count,
    plain = false,
    copied,
    full = false,
    addTitle,
    cardButton,
    onadd,
    onduplicate,
    oncopy,
    onpaste,
    onmove,
    ondelete,
  }: {
    /** The tab open: a question slide, the Answer or a 🤫 card. */
    tab: 'q' | 'a' | 'card';
    /** The open slide's place among the question slides (a card's among the cards), and how many there are. */
    at: number;
    count: number;
    /** Slides with nothing to answer (a slides round). */
    plain?: boolean;
    /** A slide is copied (📋 Paste slide works). */
    copied: boolean;
    /** The cards are full (no ⧉ Duplicate card). */
    full?: boolean;
    addTitle: string;
    /** ＋ 🤫 Card, beside ＋ Add slide. */
    cardButton?: Snippet;
    onadd: () => void;
    onduplicate: () => void;
    oncopy: () => void;
    /** The copied slide as a new slide (after a question slide, before the answer), or `over` the open one. */
    onpaste: (over: boolean) => void;
    onmove: (d: -1 | 1) => void;
    ondelete: () => void;
  } = $props();

  const card = $derived(tab === 'card');
  const what = $derived(card ? 'card' : 'slide');
  const kind = $derived(card ? 'card' : plain ? 'slide' : 'question slide');
  const noCopy = 'Copy a slide first (📋 Copy slide, or Ctrl+C on its tab)';
</script>

<div class="group" role="group" aria-label={card ? 'This card' : 'This slide'}>
  <button class="ghost add" onclick={onadd} title={addTitle}>＋ Add slide</button>
  {@render cardButton?.()}
  <span class="gap" aria-hidden="true"></span>
  <button
    class="ghost small"
    onclick={onduplicate}
    disabled={tab === 'a' || (card && full)}
    title={tab === 'a' ? 'The answer is one slide: ＋ Add slide adds a question slide' : card && full ? 'It holds as many cards as it can' : `A copy of this ${kind}, right after it (Ctrl+D on its tab)`}
    >⧉ Duplicate {what}</button
  >
  <button class="ghost small" onclick={oncopy} title="The whole slide, to paste as a new slide or over another one, here or in another game (Ctrl+C on its tab)">📋 Copy slide</button>
  <span class="split">
    <button
      class="ghost small"
      onclick={() => onpaste(false)}
      disabled={!copied || card}
      title={!copied
        ? noCopy
        : card
          ? 'On a card’s tab, ▾ pastes over the card; a new slide is pasted from a question slide’s tab'
          : tab === 'a'
            ? 'The copied slide as a new question slide, before the answer (Ctrl+V on its tab)'
            : 'The copied slide as a new slide, right after this one (Ctrl+V on its tab)'}>📋 Paste slide</button
    >
    <button
      class="ghost small drop"
      onclick={(e) =>
        dropMenu(e, [
          {
            label: card ? '📋 Paste over this card' : tab === 'a' ? '📋 Paste over the answer slide' : '📋 Paste over this slide',
            hint: 'Everything on it is replaced by the copied slide (Undo brings it back)',
            onclick: () => onpaste(true),
          },
        ])}
      disabled={!copied}
      aria-haspopup="menu"
      aria-label="More ways to paste"
      title={copied ? 'Paste over this one instead' : noCopy}>▾</button
    >
  </span>
  <button
    class="ghost small"
    onclick={() => onmove(-1)}
    disabled={tab === 'a' || at === 0}
    aria-label="Move {what} earlier"
    title="Move this {kind} one place earlier (Alt+← on its tab)">◀</button
  >
  <button
    class="ghost small"
    onclick={() => onmove(1)}
    disabled={tab === 'a' || at >= count - 1}
    aria-label="Move {what} later"
    title="Move this {kind} one place later (Alt+→ on its tab)">▶</button
  >
  <span class="spacer"></span>
  <button
    class="ghost small danger"
    onclick={ondelete}
    disabled={tab === 'a' || (tab === 'q' && count < 2)}
    title={tab === 'a' ? 'The answer slide stays (empty it instead)' : tab === 'q' && count < 2 ? `The only ${kind} stays (empty it instead)` : `Delete this ${kind} (Ctrl+Z brings it back)`}
    >🗑 Delete {what}</button
  >
</div>

<style>
  .group {
    flex: 1 1 auto;
    display: flex;
    gap: 4px;
    align-items: center;
    min-width: 0;
    padding-bottom: 3px;
  }
  .group button {
    flex: none;
    border-radius: 6px;
  }
  /* ＋ Add slide (and ＋ 🤫 Card) sit quietly after the tabs, as they did. */
  .add {
    font-size: 12px;
    opacity: 0.8;
  }
  .gap {
    width: 8px;
    flex: none;
  }
  .split {
    display: inline-flex;
  }
  .split button:first-child {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }
  .split .drop {
    padding-inline: 5px;
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
  }
  /* 🗑 apart from the rest, at the right. */
  .danger {
    margin-left: 12px;
  }
</style>
