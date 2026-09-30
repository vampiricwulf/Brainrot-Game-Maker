<!-- The tiebreaker clue: optional, played from the end screen when players are tied for first. -->
<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { textStyleTargets } from '../lib/ops';
  import { textSlide, type TextEl } from '../lib/model';
  import SlideEditor from './slide/SlideEditor.svelte';

  let tbSide = $state<'q' | 'a'>('q');
  const styleTargets = (el: TextEl, scope: string) => textStyleTargets(app.game, null, el, scope.replace('round', 'game'));
</script>

<h2>Tiebreaker clue</h2>
<p class="muted">Optional. If players are tied for first at the end, the host can play this clue to settle it.</p>
<label class="check">
  <input
    type="checkbox"
    checked={!!app.game.tiebreaker}
    onchange={(e) =>
      (app.game.tiebreaker = e.currentTarget.checked ? { questionSlide: textSlide(), answerSlide: textSlide() } : undefined)}
  /> Include a tiebreaker clue
</label>
{#if app.game.tiebreaker}
  {@const tb = app.game.tiebreaker}
  <div class="tabs" role="tablist">
    <button role="tab" class:on={tbSide === 'q'} aria-selected={tbSide === 'q'} onclick={() => (tbSide = 'q')}>Tiebreaker question</button>
    <button role="tab" class:on={tbSide === 'a'} aria-selected={tbSide === 'a'} onclick={() => (tbSide = 'a')}>Tiebreaker answer</button>
  </div>
  {#key tbSide}
    <SlideEditor
      slide={tbSide === 'q' ? tb.questionSlide : tb.answerSlide}
      styletargets={styleTargets}
      placeholder={tbSide === 'q' ? 'Click to type the tiebreaker question' : 'Click to type the tiebreaker answer'}
      badge={tbSide === 'a' ? 'ANSWER' : undefined}
    />
  {/key}
{/if}

<style>
  h2 {
    margin: 0 0 8px;
  }
  p {
    margin: 0 0 8px;
  }
  .tabs {
    display: flex;
    gap: 4px;
    border-bottom: 1px solid var(--border);
    margin: 10px 0;
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
