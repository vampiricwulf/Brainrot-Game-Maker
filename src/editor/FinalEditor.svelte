<!-- A Final Jeopardy round: category, think time and the question/answer slides. -->
<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { textStyleTargets } from '../lib/ops';
  import { finalName, type FinalRound, type TextEl } from '../lib/model';
  import SlideEditor from './slide/SlideEditor.svelte';

  let { round }: { round: FinalRound } = $props();
  let side = $state<'q' | 'a'>('q');

  // There is no "this round" of clues here, so round scopes cover the whole game.
  const styleTargets = (el: TextEl, scope: string) => textStyleTargets(app.game, null, el, scope.replace('round', 'game'));
</script>

<h2>{finalName(round)}</h2>
<div class="grid">
  <label class="field">
    Name (shown on screen)
    <input bind:value={round.name} placeholder="Final Jeopardy!" maxlength="40" />
  </label>
  <label class="field">Category<input bind:value={round.category} placeholder="e.g. Internet History" /></label>
  <label class="field">Think time (seconds)<input type="number" min="5" bind:value={round.timerSeconds} /></label>
  <span class="muted hint">Wagers are entered privately by the host during the game, then revealed player by player.</span>
</div>
<label class="field notes">
  Host notes (never shown on stream)
  <textarea rows="2" value={round.hostNotes ?? ''} oninput={(e) => (round.hostNotes = e.currentTarget.value)}></textarea>
</label>
<div class="tabs" role="tablist">
  <button role="tab" class:on={side === 'q'} aria-selected={side === 'q'} onclick={() => (side = 'q')}>Question</button>
  <button role="tab" class:on={side === 'a'} aria-selected={side === 'a'} onclick={() => (side = 'a')}>Answer</button>
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
  h2 {
    margin: 0 0 8px;
  }
  .notes {
    margin-bottom: 12px;
  }
  .notes textarea {
    width: min(640px, 100%);
  }
  .grid {
    display: flex;
    gap: 12px;
    margin: 16px 0;
    flex-wrap: wrap;
  }
  .hint {
    align-self: end;
    font-size: 12px;
  }
  .grid input {
    width: 280px;
  }
  .tabs {
    display: flex;
    gap: 4px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 10px;
  }
  .tabs button {
    border-radius: 6px 6px 0 0;
  }
  .tabs button.on {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
</style>
