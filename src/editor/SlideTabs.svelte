<!--
  The slide tabs of a clue that isn't on a board (the tiebreaker, a Final): its question slides in the order they show,
  then the answer, with ＋ Add slide and, with several, ◀ Earlier / Later ▶ / ⧉ Duplicate / 🗑 Delete slide. On a tab:
  ←/→ (Home/End) open the slide beside it; on a question slide's tab Alt+←/→ move it, Ctrl+D duplicates it, Delete
  deletes it. Each change is one named step.
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
</script>

<script lang="ts">
  import { tick } from 'svelte';
  import { step } from '../lib/history.svelte';
  import { questionSlides } from '../lib/model';
  import { addClueSlide, deleteClueSlide, duplicateClueSlide, moveClueSlide, type SlideHolder } from '../lib/ops';

  let {
    holder,
    side = $bindable(),
    qi = $bindable(),
    what,
  }: {
    holder: SlideHolder;
    side: 'q' | 'a';
    /** The question slide open (0: the first), kept while the Answer tab is open. */
    qi: number;
    /** For the steps' names: "tiebreaker" ("Added tiebreaker question slide 2"). */
    what: string;
  } = $props();

  const qslides = $derived(questionSlides(holder));
  const at = $derived(Math.min(qi, Math.max(0, qslides.length - 1)));

  /** A change to the question slides as one named step; the slide it returns opens. */
  function slides(label: string, fn: () => number, notify = false): void {
    const to = step(label, fn, notify ? { notify: true } : undefined);
    side = 'q';
    qi = to;
  }
  function addSlide(): void {
    const after = side === 'a' ? qslides.length - 1 : at;
    slides(`Added ${what} question slide ${after + 2}`, () => addClueSlide(holder, after));
  }
  const duplicateSlide = () => slides(`Duplicated ${what} question slide ${at + 1}`, () => duplicateClueSlide(holder, at));
  const deleteSlide = () => slides(`Deleted ${what} question slide ${at + 1}`, () => deleteClueSlide(holder, at), true);
  const moveSlide = (d: -1 | 1) => slides(`Moved ${what} question slide ${at + 1} ${d < 0 ? 'earlier' : 'later'}`, () => moveClueSlide(holder, at, d));

  /** Many question slides: short tab names (Q1, Q2…), so the tabs stay on one line. */
  const SHORT_TABS = 4;
  let tablist = $state<HTMLElement>();
  const focusTab = () => tick().then(() => tablist?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus());
  function tabKey(e: KeyboardEvent): void {
    const n = qslides.length;
    const now = side === 'a' ? n : at;
    const mod = e.ctrlKey || e.metaKey;
    const open = (i: number) => {
      e.preventDefault();
      if (i >= n) side = 'a';
      else ((side = 'q'), (qi = i));
      focusTab();
    };
    if (!mod && !e.altKey && !e.shiftKey) {
      if (e.key === 'ArrowLeft') return open(Math.max(0, now - 1));
      if (e.key === 'ArrowRight') return open(Math.min(n, now + 1));
      if (e.key === 'Home') return open(0);
      if (e.key === 'End') return open(n);
    }
    if (side === 'a' || n < 2) return;
    if (e.altKey && !mod && !e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      const d = e.key === 'ArrowLeft' ? -1 : 1;
      if (at + d >= 0 && at + d < n) moveSlide(d);
      focusTab();
    } else if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      duplicateSlide();
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
      {@const on = side === 'q' && at === i}
      <button
        role="tab"
        class:on
        aria-selected={on}
        tabindex={on ? 0 : -1}
        data-qslide={i + 1}
        aria-label={qslides.length > SHORT_TABS ? `Question ${i + 1}` : undefined}
        onclick={() => ((side = 'q'), (qi = i))}
        title={qslides.length > 1
          ? `Question slide ${i + 1} of ${qslides.length}: viewers see them in this order, then the answer. On the tab: Alt+←/→ move it, Ctrl+D duplicates it, Delete deletes it`
          : undefined}
        >{qslides.length > SHORT_TABS ? `Q${i + 1}` : qslides.length > 1 ? `Question ${i + 1}` : 'Question slide'}</button
      >
    {/each}
    <button role="tab" class:on={side === 'a'} aria-selected={side === 'a'} tabindex={side === 'a' ? 0 : -1} onclick={() => (side = 'a')}
      >{qslides.length > 1 ? 'Answer' : 'Answer slide (hidden until revealed)'}</button
    >
  </div>
  <button
    class="ghost add"
    onclick={addSlide}
    title={side === 'a' ? 'Add a question slide before the answer' : 'Add a question slide after this one: lead in, then show more before the answer'}>＋ Add slide</button
  >
  {#if qslides.length > 1 && side === 'q'}
    <span class="spacer"></span>
    <div class="slidetools" role="group" aria-label="Question slide {at + 1} of {qslides.length}">
      <span class="muted small">Slide {at + 1} of {qslides.length}</span>
      <button class="ghost small" onclick={() => moveSlide(-1)} disabled={at === 0} aria-label="Move slide earlier" title="Move this slide earlier">◀ Earlier</button>
      <button class="ghost small" onclick={() => moveSlide(1)} disabled={at === qslides.length - 1} aria-label="Move slide later" title="Move this slide later">Later ▶</button>
      <button class="ghost small" onclick={duplicateSlide} title="A copy of this slide, right after it">⧉ Duplicate</button>
      <button class="ghost small danger" onclick={deleteSlide} title="Delete this question slide (Ctrl+Z brings it back)">🗑 Delete slide</button>
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
