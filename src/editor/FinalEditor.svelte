<!-- A Final Jeopardy round: category, think time and the question/answer slides. -->
<script lang="ts">
  import { untrack } from 'svelte';
  import { app } from '../lib/app.svelte';
  import { take } from '../lib/nav.svelte';
  import { textStyleTargets } from '../lib/ops';
  import { setSlideText, slideText, type FinalRound, type TextEl } from '../lib/model';
  import SlideEditor from './slide/SlideEditor.svelte';

  let { round }: { round: FinalRound } = $props();
  let side = $state<'q' | 'a'>('q');

  // An undo or redo here shows the side it changed.
  const handled = { seq: 0 };
  $effect(() => {
    const place = take(handled);
    if (place?.tab === 'round' && place.round === untrack(() => round.id) && place.part?.kind === 'final' && place.part.side) side = place.part.side;
  });

  // There is no "this round" of clues here, so round scopes cover the whole game.
  const styleTargets = (el: TextEl, scope: string) => textStyleTargets(app.game, null, el, scope.replace('round', 'game'));
</script>

<div class="grid">
  <label class="field">
    Round name
    <input bind:value={round.name} placeholder="Final Jeopardy!" maxlength="40" data-round-name />
  </label>
  <label class="field">Category<input bind:value={round.category} placeholder="e.g. Internet History" data-field="final-category" /></label>
  <label class="field">Think time (seconds)<input type="number" min="5" bind:value={round.timerSeconds} /></label>
  <label class="check">
    <input type="checkbox" checked={round.allowNonPositive ?? true} onchange={(e) => (round.allowNonPositive = e.currentTarget.checked)} />
    Players with a score of 0 or less can play it
  </label>
  <span class="hint">Wagers are entered privately by the host during the game, then revealed player by player.</span>
</div>
<!-- Quick text: the main text of each slide, so a plain final never needs the canvas (like the clue editor's). -->
<div class="quick">
  <label class="field">
    Question
    <textarea rows="2" data-field="q" placeholder="Type the final question…" value={slideText(round.questionSlide)} oninput={(e) => setSlideText(round.questionSlide, e.currentTarget.value)}></textarea>
  </label>
  <label class="field">
    Answer (hidden until revealed)
    <textarea rows="2" data-field="a" placeholder="Type the answer…" value={slideText(round.answerSlide)} oninput={(e) => setSlideText(round.answerSlide, e.currentTarget.value)}></textarea>
  </label>
  <label class="field">
    Host notes (never shown on stream)
    <textarea rows="2" data-field="round-notes" value={round.hostNotes ?? ''} oninput={(e) => (round.hostNotes = e.currentTarget.value)}></textarea>
  </label>
</div>
<div class="tabs" role="tablist">
  <button role="tab" class:on={side === 'q'} aria-selected={side === 'q'} onclick={() => (side = 'q')}>Question slide</button>
  <button role="tab" class:on={side === 'a'} aria-selected={side === 'a'} onclick={() => (side = 'a')}>Answer slide (hidden until revealed)</button>
</div>
{#key `${round.id}-${side}`}
  <SlideEditor
    slide={side === 'q' ? round.questionSlide : round.answerSlide}
    styletargets={styleTargets}
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
  .tabs {
    display: flex;
    gap: 4px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 12px;
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
