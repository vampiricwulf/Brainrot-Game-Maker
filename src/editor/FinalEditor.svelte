<!-- A Final Jeopardy round: category, think time and the question/answer slides. -->
<script lang="ts">
  import { untrack } from 'svelte';
  import { app } from '../lib/app.svelte';
  import { take } from '../lib/nav.svelte';
  import { ownTextTargets, textStyleTargets } from '../lib/ops';
  import { questionSlides, setSlideText, slideText, type FinalRound, type TextEl } from '../lib/model';
  import { followClueText } from '../lib/cluetext';
  import SlideEditor from './slide/SlideEditor.svelte';
  import SlideTabs, { slideKeyOf } from './SlideTabs.svelte';

  let { round }: { round: FinalRound } = $props();
  let side = $state<'q' | 'a'>('q');
  // Like a board clue, it can have several question slides, shown in order before the answer.
  /** The question slide open (0: the first), kept while the Answer tab is open. */
  let qi = $state(0);
  const qslides = $derived(questionSlides(round));
  const at = $derived(Math.min(qi, Math.max(0, qslides.length - 1)));
  const qslide = $derived(qslides[at]);
  const slideKey = $derived(slideKeyOf(side === 'q' ? qslide : undefined));

  // An undo or redo here shows the side it changed.
  const handled = { seq: 0 };
  $effect(() => {
    const place = take(handled);
    if (place?.tab !== 'round' || place.round !== untrack(() => round.id) || place.part?.kind !== 'final' || !place.part.side) return;
    side = place.part.side;
    const slide = place.part.slide;
    if (side === 'q') qi = slide ? Math.max(0, (untrack(() => round.extraSlides)?.findIndex((s) => s.id === slide) ?? -1) + 1) : 0;
  });

  // "This round" is this Final's own slides (as a Slides round's is); "the whole game" is every clue's. It starts on
  // questions + answers (stylescope): a Final mostly has one question slide, so its other questions are none.
  const styleTargets = (el: TextEl, scope: string) => (scope.startsWith('game') ? textStyleTargets(app.game, null, el, scope) : ownTextTargets(round, el, scope));
</script>

<div class="grid">
  <label class="field">
    Round name
    <input bind:value={round.name} placeholder="Final Jeopardy!" maxlength="40" data-round-name />
  </label>
  <label class="field">Category<input bind:value={round.category} placeholder="e.g. Internet History" data-field="final-category" /></label>
  <label class="field">Think time (seconds)<input
      type="number"
      min="5"
      value={round.timerSeconds ?? 30}
      oninput={(e) => {
        // Emptied to type a new number: it keeps the one it had.
        const v = Math.floor(+e.currentTarget.value);
        if (e.currentTarget.value.trim() !== '' && v > 0) round.timerSeconds = v;
      }}
      onchange={(e) => {
        // At least 5 seconds (what the game plays).
        round.timerSeconds = Math.max(5, round.timerSeconds ?? 30);
        e.currentTarget.value = String(round.timerSeconds);
      }}
    /></label>
  <label class="check">
    <input type="checkbox" checked={round.allowNonPositive ?? false} onchange={(e) => (round.allowNonPositive = e.currentTarget.checked)} />
    Players with a score of 0 or less can play it
  </label>
  <span class="hint">
    While the category is up the host ticks who plays and enters each wager privately (a wager can be more than the
    player's score: untick "Ignore the limits" then to hold wagers to it), then they're revealed player by player.
  </span>
</div>
<!-- Quick text: the main text of each slide, so a plain final never needs the canvas (like the clue editor's). -->
<div class="quick">
  <label class="field">
    {qslides.length > 1 ? `Question (slide ${at + 1} of ${qslides.length})` : 'Question'}
    <textarea rows="2" data-field="q" placeholder="Type the final question…" value={slideText(qslide)} oninput={(e) => setSlideText(qslide, e.currentTarget.value) && followClueText(app.game, [qslide])}></textarea>
  </label>
  <label class="field">
    Answer (hidden until revealed)
    <textarea rows="2" data-field="a" placeholder="Type the answer…" value={slideText(round.answerSlide)} oninput={(e) => setSlideText(round.answerSlide, e.currentTarget.value) && followClueText(app.game, [round.answerSlide])}></textarea>
  </label>
  <label class="field">
    Host notes (never shown on stream)
    <textarea rows="2" data-field="round-notes" value={round.hostNotes ?? ''} oninput={(e) => (round.hostNotes = e.currentTarget.value)}></textarea>
  </label>
</div>
<SlideTabs holder={round} bind:side bind:qi what="Final" />
{#key `${round.id}-${slideKey}`}
  <SlideEditor
    slide={side === 'q' ? qslide : round.answerSlide}
    styletargets={styleTargets}
    stylescope="round-qa"
    quickfield={side}
    placeholder={side === 'q' ? 'Click to type the final question' : 'Click to type the final answer'}
    badge={side === 'a' ? 'ANSWER' : undefined}
  />
{/key}

<style>
  .quick {
    display: grid;
    grid-template-columns: 1.3fr 1fr 1fr;
    gap: 12px;
    margin-bottom: 12px;
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
  .grid {
    display: flex;
    gap: 12px;
    margin: 0 0 16px;
    flex-wrap: wrap;
  }
  .hint {
    align-self: end;
  }
  .grid input:not([type='checkbox']) {
    width: 280px;
  }
  .grid .check {
    align-self: end;
  }
</style>
