<!-- A slides round: slides shown one after another (an introduction, the rules, a break), nothing to answer. -->
<script lang="ts">
  import { untrack } from 'svelte';
  import { app } from '../lib/app.svelte';
  import { take } from '../lib/nav.svelte';
  import { textStyleTargets } from '../lib/ops';
  import { questionSlides, setSlideText, slideText, type SlidesRound, type TextEl } from '../lib/model';
  import { followClueText } from '../lib/cluetext';
  import SlideEditor from './slide/SlideEditor.svelte';
  import SlideTabs, { slideKeyOf } from './SlideTabs.svelte';

  let { round }: { round: SlidesRound } = $props();
  // (SlideTabs' Answer side never opens here.)
  let side = $state<'q' | 'a'>('q');
  let qi = $state(0);
  const slides = $derived(questionSlides(round));
  const at = $derived(Math.min(qi, Math.max(0, slides.length - 1)));
  const slide = $derived(slides[at]);

  // An undo or redo here shows the slide it changed.
  const handled = { seq: 0 };
  $effect(() => {
    const place = take(handled);
    if (place?.tab !== 'round' || place.round !== untrack(() => round.id) || place.part?.kind !== 'slides') return;
    const id = place.part.slide;
    qi = id ? Math.max(0, (untrack(() => round.extraSlides)?.findIndex((s) => s.id === id) ?? -1) + 1) : 0;
  });

  // "This round" is this round's own slides; "the game" the game's questions and every slides round's slides.
  const styleTargets = (el: TextEl, scope: string) => textStyleTargets(app.game, null, el, scope, null, scope.startsWith('game') ? undefined : round);
</script>

<div class="grid">
  <label class="field">
    Round name
    <input bind:value={round.name} placeholder="Introduction" maxlength="40" data-round-name />
  </label>
  <label class="field grow">
    Host notes (never shown on stream)
    <textarea rows="1" data-field="round-notes" value={round.hostNotes ?? ''} oninput={(e) => (round.hostNotes = e.currentTarget.value)}></textarea>
  </label>
</div>
<p class="muted small">
  Viewers see these slides one after another: N (or a click on the stage) shows the next, Shift+N the one before, and after
  the last one N goes on to the next round. Nothing to answer, no scores.
</p>
<!-- Quick text: the slide's main text, so a plain slide never needs the canvas. -->
<label class="field quick">
  {slides.length > 1 ? `Text (slide ${at + 1} of ${slides.length})` : 'Text'}
  <textarea rows="2" data-field="q" placeholder="Type what the slide says…" value={slideText(slide)} oninput={(e) => setSlideText(slide, e.currentTarget.value) && followClueText(app.game, [slide])}></textarea>
</label>
<SlideTabs holder={round} bind:side bind:qi what="the round’s" plain place={(_, slide) => ({ tab: 'round', round: round.id, part: { kind: 'slides', slide } })} />
{#key `${round.id}-${slideKeyOf(slide)}`}
  <SlideEditor {slide} styletargets={styleTargets} quickfield="q" placeholder="Click to type on the slide" />
{/key}

<style>
  .grid {
    display: flex;
    gap: 12px;
    margin: 0 0 8px;
    flex-wrap: wrap;
    align-items: end;
  }
  .grid input {
    width: 280px;
  }
  .grow {
    flex: 1;
    min-width: 240px;
  }
  .quick textarea {
    resize: none;
    field-sizing: content;
    min-height: calc(2lh + 14px);
    max-height: calc(6lh + 14px);
  }
  .grow textarea {
    resize: none;
    field-sizing: content;
    max-height: calc(4lh + 14px);
  }
</style>
