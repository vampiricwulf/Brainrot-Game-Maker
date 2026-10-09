<!-- The tiebreaker clue: optional, played from the end screen when players are tied for first. -->
<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { take } from '../lib/nav.svelte';
  import { step } from '../lib/history.svelte';
  import { ownTextTargets, textStyleTargets } from '../lib/ops';
  import { questionSlides, setSlideText, slideText, textSlide, type TextEl } from '../lib/model';
  import { slideHasContent } from '../lib/usage';
  import { followClueText } from '../lib/cluetext';
  import SlideEditor from './slide/SlideEditor.svelte';
  import SlideTabs, { slideKeyOf } from './SlideTabs.svelte';
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
  const slideKey = $derived(slideKeyOf(tbSide === 'q' ? qslide : undefined));
  // "This round" is the tiebreaker's own slides; "the whole game" is every clue's.
  const styleTargets = (el: TextEl, scope: string) => {
    const tb = app.game.tiebreaker;
    return !tb || scope.startsWith('game') ? textStyleTargets(app.game, null, el, scope.replace('round', 'game')) : ownTextTargets(tb, el, scope);
  };
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
      <textarea rows="2" data-field="q" placeholder="Type the tiebreaker question…" value={slideText(qslide)} oninput={(e) => setSlideText(qslide, e.currentTarget.value) && followClueText(app.game, [qslide])}></textarea>
    </label>
    <label class="field">
      Answer (hidden until revealed)
      <textarea rows="2" data-field="a" placeholder="Type the answer…" value={slideText(tb.answerSlide)} oninput={(e) => setSlideText(tb.answerSlide, e.currentTarget.value) && followClueText(app.game, [tb.answerSlide])}></textarea>
    </label>
  </div>
  <SlideTabs holder={tb} bind:side={tbSide} bind:qi what="tiebreaker" />
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
</style>
