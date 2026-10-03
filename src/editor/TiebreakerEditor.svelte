<!-- The tiebreaker clue: optional, played from the end screen when players are tied for first. -->
<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { take } from '../lib/nav.svelte';
  import { step } from '../lib/history.svelte';
  import { tick } from 'svelte';
  import { addClueSlide, deleteClueSlide, duplicateClueSlide, moveClueSlide, textStyleTargets } from '../lib/ops';
  import { questionSlides, setSlideText, slideText, textSlide, type TextEl } from '../lib/model';
  import { slideHasContent } from '../lib/usage';
  import { followClueText } from '../lib/cluetext';
  import SlideEditor from './slide/SlideEditor.svelte';
  import PageHeader from './PageHeader.svelte';

  let tbSide = $state<'q' | 'a'>('q');
  // Like a board clue, it can have several question slides, shown in order before the answer.
  /** The question slide open (0: the first), kept while the Answer tab is open. */
  let qi = $state(0);
  const qslides = $derived(app.game.tiebreaker ? questionSlides(app.game.tiebreaker) : []);
  const at = $derived(Math.min(qi, Math.max(0, qslides.length - 1)));
  const qslide = $derived(qslides[at]);
  // An undo or redo here shows the side (and the slide) it changed.
  const handled = { seq: 0 };
  $effect(() => {
    const place = take(handled);
    if (place?.tab !== 'tiebreaker' || !place.side) return;
    tbSide = place.side;
    if (place.side === 'q') qi = place.slide ? Math.max(0, (app.game.tiebreaker?.extraSlides?.findIndex((s) => s.id === place.slide) ?? -1) + 1) : 0;
  });

  /** What tells the open slide apart, so the slide editor starts afresh on another one (the first one has no id). */
  const slideNo = new WeakMap<object, number>();
  let slideCount = 0;
  const slideKey = $derived.by(() => {
    if (tbSide === 'a' || !qslide) return 'a';
    if (!slideNo.has(qslide)) slideNo.set(qslide, ++slideCount);
    return `q${slideNo.get(qslide)}`;
  });

  /** A change to the question slides as one named step; the slide it returns opens. */
  function slides(label: string, fn: (tb: NonNullable<typeof app.game.tiebreaker>) => number, notify = false): void {
    const tb = app.game.tiebreaker;
    if (!tb) return;
    const to = step(label, () => fn(tb), notify ? { notify: true } : undefined);
    tbSide = 'q';
    qi = to;
  }
  function addSlide(): void {
    const after = tbSide === 'a' ? qslides.length - 1 : at;
    slides(`Added tiebreaker question slide ${after + 2}`, (tb) => addClueSlide(tb, after));
  }
  const duplicateSlide = () => slides(`Duplicated tiebreaker question slide ${at + 1}`, (tb) => duplicateClueSlide(tb, at));
  const deleteSlide = () => slides(`Deleted tiebreaker question slide ${at + 1}`, (tb) => deleteClueSlide(tb, at), true);
  const moveSlide = (d: -1 | 1) => slides(`Moved tiebreaker question slide ${at + 1} ${d < 0 ? 'earlier' : 'later'}`, (tb) => moveClueSlide(tb, at, d));

  /** Many question slides: short tab names (Q1, Q2…), so the tabs stay on one line. */
  const SHORT_TABS = 4;
  let tablist = $state<HTMLElement>();
  const focusTab = () => tick().then(() => tablist?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus());
  /** On a tab: ←/→ (Home/End) open the slide beside it; on a question slide's tab, Alt+←/→ move it, Ctrl+D duplicates it, Delete deletes it. */
  function tabKey(e: KeyboardEvent): void {
    const n = qslides.length;
    const now = tbSide === 'a' ? n : at;
    const mod = e.ctrlKey || e.metaKey;
    const open = (i: number) => {
      e.preventDefault();
      if (i >= n) tbSide = 'a';
      else ((tbSide = 'q'), (qi = i));
      focusTab();
    };
    if (!mod && !e.altKey && !e.shiftKey) {
      if (e.key === 'ArrowLeft') return open(Math.max(0, now - 1));
      if (e.key === 'ArrowRight') return open(Math.min(n, now + 1));
      if (e.key === 'Home') return open(0);
      if (e.key === 'End') return open(n);
    }
    if (tbSide === 'a' || n < 2) return;
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
  const styleTargets = (el: TextEl, scope: string) => textStyleTargets(app.game, null, el, scope.replace('round', 'game'));
</script>

<div class="page">
<PageHeader title="Tiebreaker clue" sub="Optional. If players are tied for first at the end, the host can play this clue to settle it." />
{#snippet toggle()}
<label class="check">
  <input
    type="checkbox"
    checked={!!app.game.tiebreaker}
    onchange={(e) => {
      const tb = app.game.tiebreaker;
      const on = e.currentTarget.checked;
      // Unticking throws the tiebreaker away at once: when it had something in it, the note at the bottom offers Undo.
      const lost = !on && !!tb && [...questionSlides(tb), tb.answerSlide].some(slideHasContent);
      step(
        on ? 'Tiebreaker on' : 'Tiebreaker off',
        () => {
          const slides = { questionSlide: textSlide(), answerSlide: textSlide() };
          // (Its text takes the theme's clue text.)
          if (on) followClueText(app.game, [slides.questionSlide, slides.answerSlide]);
          app.game.tiebreaker = on ? slides : undefined;
        },
        { notify: lost },
      );
    }}
  /> Include a tiebreaker clue
</label>
{/snippet}
{#if !app.game.tiebreaker}
  <!-- Off: what it is, with the switch that turns it on. -->
  <div class="empty">
    <span class="ic" aria-hidden="true">🤝</span>
    <p><b>No tiebreaker in this game.</b></p>
    <p class="muted">
      When two or more players tie for first after the last round, the host can play one more clue (or roll off) to pick the
      winner. Without one here, the host can still roll off on the end screen.
    </p>
    {@render toggle()}
  </div>
{:else}
  {@render toggle()}
  {@const tb = app.game.tiebreaker}
  <!-- Quick text: the main text of each slide, so a plain tiebreaker never needs the canvas. -->
  <div class="quick">
    <label class="field">
      {qslides.length > 1 ? `Question (slide ${at + 1} of ${qslides.length})` : 'Question'}
      <textarea rows="2" placeholder="Type the tiebreaker question…" value={slideText(qslide)} oninput={(e) => setSlideText(qslide, e.currentTarget.value)}></textarea>
    </label>
    <label class="field">
      Answer (hidden until revealed)
      <textarea rows="2" placeholder="Type the answer…" value={slideText(tb.answerSlide)} oninput={(e) => setSlideText(tb.answerSlide, e.currentTarget.value)}></textarea>
    </label>
  </div>
  <div class="tabs">
    <!-- The question slides in the order they show, then the answer. (One Tab stop: ←/→ go along, see tabKey.) -->
    <div class="tablist" role="tablist" aria-label="Slides" tabindex="-1" bind:this={tablist} onkeydown={tabKey}>
      {#each qslides as _, i (i)}
        {@const on = tbSide === 'q' && at === i}
        <button
          role="tab"
          class:on
          aria-selected={on}
          tabindex={on ? 0 : -1}
          data-qslide={i + 1}
          aria-label={qslides.length > SHORT_TABS ? `Question ${i + 1}` : undefined}
          onclick={() => ((tbSide = 'q'), (qi = i))}
          title={qslides.length > 1
            ? `Question slide ${i + 1} of ${qslides.length}: viewers see them in this order, then the answer. On the tab: Alt+←/→ move it, Ctrl+D duplicates it, Delete deletes it`
            : undefined}
          >{qslides.length > SHORT_TABS ? `Q${i + 1}` : qslides.length > 1 ? `Question ${i + 1}` : 'Question slide'}</button
        >
      {/each}
      <button role="tab" class:on={tbSide === 'a'} aria-selected={tbSide === 'a'} tabindex={tbSide === 'a' ? 0 : -1} onclick={() => (tbSide = 'a')}
        >{qslides.length > 1 ? 'Answer' : 'Answer slide (hidden until revealed)'}</button
      >
    </div>
    <button
      class="ghost add"
      onclick={addSlide}
      title={tbSide === 'a' ? 'Add a question slide before the answer' : 'Add a question slide after this one: lead in, then show more before the answer'}>＋ Add slide</button
    >
    {#if qslides.length > 1 && tbSide === 'q'}
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
  {#key slideKey}
    <SlideEditor
      slide={tbSide === 'q' ? qslide : tb.answerSlide}
      styletargets={styleTargets}
      placeholder={tbSide === 'q' ? 'Click to type the tiebreaker question' : 'Click to type the tiebreaker answer'}
      badge={tbSide === 'a' ? 'ANSWER' : undefined}
    />
  {/key}
{/if}
</div>

<style>
  .empty {
    max-width: 640px;
    margin-top: 8px;
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
  .quick {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-top: 12px;
  }
  .quick textarea {
    resize: none;
    field-sizing: content;
    min-height: calc(2lh + 14px);
    max-height: calc(4lh + 14px);
  }
  @media (max-width: 900px) {
    .quick {
      grid-template-columns: 1fr;
    }
  }
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
  .tabs button {
    border-radius: 6px 6px 0 0;
  }
  .tabs button.on {
    background: var(--accent-fill);
    border-color: var(--accent-fill);
    color: #fff;
  }
</style>
