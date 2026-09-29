<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { textStyleTargets } from '../lib/ops';
  import { finalName, textSlide, type TextEl } from '../lib/model';
  import SlideEditor from './slide/SlideEditor.svelte';

  const final = $derived(app.game.final);
  let side = $state<'q' | 'a'>('q');
  let tbSide = $state<'q' | 'a'>('q');

  // There is no "this round" here, so round scopes cover the whole game.
  const styleTargets = (el: TextEl, scope: string) => textStyleTargets(app.game, null, el, scope.replace('round', 'game'));
</script>

<h2>{finalName(app.game)}</h2>
<label class="check"><input type="checkbox" bind:checked={final.enabled} /> Include a final round</label>

{#if final.enabled}
  <div class="grid">
    <label class="field">
      Name (shown on screen)
      <input bind:value={final.name} placeholder="Final Jeopardy!" maxlength="40" />
    </label>
    <label class="field">Category<input bind:value={final.category} placeholder="e.g. Internet History" /></label>
    <label class="field">Think time (seconds)<input type="number" min="5" bind:value={final.timerSeconds} /></label>
    <span class="muted hint">Wagers are entered privately by the host during the game, then revealed player by player.</span>
  </div>
  <div class="tabs" role="tablist">
    <button role="tab" class:on={side === 'q'} aria-selected={side === 'q'} onclick={() => (side = 'q')}>Question</button>
    <button role="tab" class:on={side === 'a'} aria-selected={side === 'a'} onclick={() => (side = 'a')}>Answer</button>
  </div>
  {#key side}
    <SlideEditor
      slide={side === 'q' ? final.questionSlide : final.answerSlide}
      styletargets={styleTargets}
      placeholder={side === 'q' ? 'Click to type the final question' : 'Click to type the final answer'}
      badge={side === 'a' ? 'ANSWER' : undefined}
    />
  {/key}
{/if}

<h2 class="tb">Tiebreaker clue</h2>
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
  h2.tb {
    margin-top: 32px;
  }
  p {
    margin: 0 0 8px;
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
