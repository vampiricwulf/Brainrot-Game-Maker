<!--
  A 🎭 deal part's card in a window, laid out as the editor's 🤫 Cards are: its words, the slide editor and 📱 On their
  phone beside it, with its notes on what reaches a phone. A part that draws from the deal's wheel shows a sample slice
  there, under its words, as its players' phones get one.
-->
<script lang="ts">
  import { app } from '../../lib/app.svelte';
  import { partName, partOnPhone } from '../../lib/deals';
  import { modal } from '../../lib/modal';
  import { setSlideText, slideText, type DealPart, type DealPreset } from '../../lib/model';
  import SlideEditor from '../slide/SlideEditor.svelte';
  import PhoneCardPreview from '../PhoneCardPreview.svelte';

  let { deal, part, onclose }: { deal: DealPreset; part: DealPart; onclose: () => void } = $props();
  const name = $derived(partName(part, deal.parts.indexOf(part)));
  const title = $derived(`🎭 ${name}’s card (only its players see it)`);
  /** On at first: what its players see is why it's opened here. */
  let phoneView = $state(true);
  const onPhone = $derived(partOnPhone(app.game, deal, part));
  let box = $state<HTMLDivElement>();

  /** Esc closes it (the slide editor takes an Esc that deselects first), unless it's for a picker open inside. */
  function key(e: KeyboardEvent): void {
    if (e.key !== 'Escape' || (e.target as HTMLElement).closest?.('input, textarea, select')) return;
    const dialogs = document.querySelectorAll('[role="dialog"]');
    if (dialogs[dialogs.length - 1] !== box) return;
    e.stopImmediatePropagation();
    onclose();
  }
</script>

<svelte:window onkeydown={key} />

<div class="modal-backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
  <div class="modal deal-card" role="dialog" aria-modal="true" aria-label={title} use:modal bind:this={box}>
    <div class="modal-head">
      <h2 class="modal-title">✎ {title}</h2>
      <button class="primary" onclick={onclose}>Done</button>
      <button class="ghost modal-x" onclick={onclose} aria-label="Close" title="Close (Esc)">✕</button>
    </div>
    <div class="body">
      <label class="field">
        Words (only its players see them)
        <textarea data-field="card" rows="2" dir="auto" placeholder="Type what they’ll see…" value={slideText(part.card)} oninput={(e) => setSlideText(part.card, e.currentTarget.value)}></textarea>
      </label>
      <div class="cardbar row">
        <span class="muted small">Its players get it on their phones when you send the deal (🎭 Deal… in the tools row, during the game).</span>
        <span class="spacer"></span>
        <button
          class="small"
          class:on={phoneView}
          aria-pressed={phoneView}
          onclick={() => (phoneView = !phoneView)}
          title="The card exactly as a player’s phone gets it: its words, then its pictures and videos one under another, and what won’t reach a phone">📱 On their phone</button
        >
      </div>
      <div class="card-edit">
        <SlideEditor slide={part.card} quickfield="card" placeholder="Click to type what they’ll see" badge="🎭 {name.toUpperCase()} · ONLY ITS PLAYERS SEE IT" fill />
        {#if phoneView}<PhoneCardPreview game={app.game} card={onPhone.slide} role={deal.parts.length > 1 ? name : undefined} sample={onPhone.sample} />{/if}
      </div>
    </div>
  </div>
</div>

<style>
  .deal-card {
    width: min(1400px, 100%);
    height: min(860px, 100%);
    overflow: hidden;
  }
  .body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  textarea {
    resize: none;
    field-sizing: content;
    min-height: calc(2lh + 14px);
    max-height: calc(4lh + 14px);
  }
  .cardbar button.on {
    background: var(--accent-fill);
    border-color: var(--accent-fill);
    color: #fff;
  }
  .small {
    font-size: 12px;
  }
  /* (As in the clue editor's card tab: 📱 On their phone beside the slide editor, never over its toolbar or inspector.) */
  .card-edit {
    flex: 1 1 0;
    min-height: 300px;
    min-width: 0;
    display: flex;
    gap: 8px;
  }
  .card-edit > :global(.se) {
    min-width: 0;
  }
  @media (max-width: 900px) {
    .card-edit {
      flex-direction: column;
      flex: none;
    }
  }
</style>
