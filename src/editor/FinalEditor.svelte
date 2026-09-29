<script lang="ts">
  import { app, toast } from '../lib/app.svelte';
  import { applyTextStyle } from '../lib/ops';
  import { textSlide, type SlideElement, type TextEl } from '../lib/model';
  import SlideEditor from './slide/SlideEditor.svelte';

  let { oneditimage }: { oneditimage?: (el: SlideElement) => void } = $props();
  const final = $derived(app.game.final);
  let side = $state<'q' | 'a'>('q');
  let tbSide = $state<'q' | 'a'>('q');

  function applyStyle(el: TextEl, scope: string): void {
    const n = applyTextStyle(app.game, null, el, scope.replace('round', 'game'));
    toast(`Style applied to ${n} slide${n === 1 ? '' : 's'}`);
  }
</script>

<h2>Final Jeopardy</h2>
<label class="check"><input type="checkbox" bind:checked={final.enabled} /> Include Final Jeopardy</label>

{#if final.enabled}
  <div class="grid">
    <label class="field">Category<input bind:value={final.category} placeholder="e.g. Internet History" /></label>
    <label class="field">Think time (seconds)<input type="number" min="5" bind:value={final.timerSeconds} /></label>
    <span class="muted hint">Wagers are entered privately by the host during the game, then revealed player by player.</span>
  </div>
  <div class="tabs" role="tablist">
    <button role="tab" class:on={side === 'q'} aria-selected={side === 'q'} onclick={() => (side = 'q')}>Question</button>
    <button role="tab" class:on={side === 'a'} aria-selected={side === 'a'} onclick={() => (side = 'a')}>Answer</button>
  </div>
  {#key side}
    <SlideEditor slide={side === 'q' ? final.questionSlide : final.answerSlide} onapplystyle={applyStyle} {oneditimage} />
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
    <SlideEditor slide={tbSide === 'q' ? tb.questionSlide : tb.answerSlide} onapplystyle={applyStyle} {oneditimage} />
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
