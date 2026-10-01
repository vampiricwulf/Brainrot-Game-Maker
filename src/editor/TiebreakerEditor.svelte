<!-- The tiebreaker clue: optional, played from the end screen when players are tied for first. -->
<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { take } from '../lib/nav.svelte';
  import { step } from '../lib/history.svelte';
  import { textStyleTargets } from '../lib/ops';
  import { setSlideText, slideText, textSlide, type TextEl } from '../lib/model';
  import { slideHasContent } from '../lib/usage';
  import { followClueText } from '../lib/cluetext';
  import SlideEditor from './slide/SlideEditor.svelte';
  import PageHeader from './PageHeader.svelte';

  let tbSide = $state<'q' | 'a'>('q');
  // An undo or redo here shows the side it changed.
  const handled = { seq: 0 };
  $effect(() => {
    const place = take(handled);
    if (place?.tab === 'tiebreaker' && place.side) tbSide = place.side;
  });
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
      const lost = !on && !!tb && (slideHasContent(tb.questionSlide) || slideHasContent(tb.answerSlide));
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
      Question
      <textarea rows="2" placeholder="Type the tiebreaker question…" value={slideText(tb.questionSlide)} oninput={(e) => setSlideText(tb.questionSlide, e.currentTarget.value)}></textarea>
    </label>
    <label class="field">
      Answer (hidden until revealed)
      <textarea rows="2" placeholder="Type the answer…" value={slideText(tb.answerSlide)} oninput={(e) => setSlideText(tb.answerSlide, e.currentTarget.value)}></textarea>
    </label>
  </div>
  <div class="tabs" role="tablist">
    <button role="tab" class:on={tbSide === 'q'} aria-selected={tbSide === 'q'} onclick={() => (tbSide = 'q')}>Question slide</button>
    <button role="tab" class:on={tbSide === 'a'} aria-selected={tbSide === 'a'} onclick={() => (tbSide = 'a')}>Answer slide (hidden until revealed)</button>
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
    border-bottom: 1px solid var(--border);
    margin: 12px 0;
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
