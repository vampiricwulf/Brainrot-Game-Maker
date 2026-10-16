<!--
  One of the editor's 🤫 Cards (cards spec §4.3): its name (the host's own, to pick it by), its words, the slide editor
  and 📱 On their phone, as a tile's 🤫 card tab has them. Typing in the name or the words is one undo step each (the
  watcher names them).
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { app } from '../lib/app.svelte';
  import { step } from '../lib/history.svelte';
  import { CARD_NAME_MAX, savedCardName, setSlideText, slideText, type SavedCard } from '../lib/model';
  import { nameGivesAway } from '../lib/validate';
  import SlideEditor from './slide/SlideEditor.svelte';
  import PhoneCardPreview from './PhoneCardPreview.svelte';

  let { card, index, phoneView = $bindable(false) }: { card: SavedCard; index: number; phoneView: boolean } = $props();
  const uid = $props.id();

  /** Its name repeats what's on it: in one window viewers read a card's name in 🤫 Send a card…. */
  const repeats = $derived(nameGivesAway(app.game, card));

  let root = $state<HTMLElement>();
  /**
   * 📱 On their phone: turned on under the slide editor (a narrow page) with its top below the fold (or a line short of
   * it), the page scrolls to put this card's bar at the top, the button still on screen. Beside the slide editor
   * nothing moves.
   */
  function togglePhone(): void {
    phoneView = !phoneView;
    if (!phoneView) return;
    void tick().then(() => {
      const top = root?.querySelector('.phone-preview')?.getBoundingClientRect().top;
      const main = root?.closest('main')?.getBoundingClientRect();
      if (top !== undefined && main && top > main.bottom - 40) root?.querySelector('.cardbar')?.scrollIntoView({ block: 'start' });
    });
  }

  function setUntil(on: boolean): void {
    const n = savedCardName(card, index);
    step(on ? `Card “${n}” stays until taken back` : `Card “${n}” lasts until the round ends`, () => {
      if (on) card.until = 'host';
      else delete card.until;
    });
  }
</script>

<div class="sce" data-card-editor bind:this={root}>
  <div class="quick">
    <label class="field">
      Card name
      <input
        data-field="card-name"
        maxlength={CARD_NAME_MAX}
        placeholder="What you’ll pick it by"
        aria-describedby="card-name-note-{uid}"
        bind:value={card.name}
      />
    </label>
    <label class="field">
      Words (only who you send it to sees them)
      <textarea
        data-field="card"
        rows="2"
        dir="auto"
        placeholder="Type what they’ll see…"
        value={slideText(card)}
        oninput={(e) => setSlideText(card, e.currentTarget.value)}
      ></textarea>
    </label>
  </div>
  <div class="notes">
    <p class="muted small" id="card-name-note-{uid}">
      For you to pick it by in 🤫 Send a card…: phones never get it. In one window viewers can read it there, next to who
      you send it to: call it what it’s for (“Mission 1”), never what’s on it.
    </p>
    <!-- (Always there, so a screen reader hears the line when it shows.) -->
    <div role="status">
      {#if repeats}<p class="small info" data-name-repeats>ℹ Its name repeats what’s on the card, and in one window viewers can read a card’s name when you send it.</p>{/if}
    </div>
  </div>
  <div class="cardbar row" role="group" aria-label="Card “{savedCardName(card, index)}”">
    <label
      class="check"
      title="How long it stays on their phones once sent: until you take it back (✖ Take back in the cards out), or else until the round ends. You can still change it when you send it"
    >
      <input type="checkbox" checked={card.until === 'host'} onchange={(e) => setUntil(e.currentTarget.checked)} /> Stays until you take it back
    </label>
    <span class="spacer"></span>
    <button
      class="small"
      class:on={phoneView}
      aria-pressed={phoneView}
      onclick={togglePhone}
      title="The card exactly as a player’s phone gets it: its words, then its pictures and videos one under another, and what won’t reach a phone">📱 On their phone</button
    >
  </div>
  <!-- (📱 On their phone sits beside the slide editor, never over its toolbar or inspector; under it in a narrow page.
       Its text doesn't follow 🎨 Theme › Clue text, as a deal's cards don't: phones show the words in their own type.) -->
  <div class="card-edit">
    <SlideEditor slide={card} quickfield="card" placeholder="Click to type what they’ll see" badge="🤫 CARD · ONLY WHO YOU SEND IT TO SEES IT" />
    {#if phoneView}<PhoneCardPreview game={app.game} {card} />{/if}
  </div>
</div>

<style>
  .sce {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .quick {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .quick textarea {
    resize: none;
    field-sizing: content;
    min-height: calc(2lh + 14px);
    max-height: calc(4lh + 14px);
  }
  .notes {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  p {
    margin: 0;
    max-width: 720px;
  }
  .info {
    color: var(--muted);
  }
  .cardbar {
    padding: 4px 0;
  }
  .cardbar button.on {
    background: var(--accent-fill);
    border-color: var(--accent-fill);
    color: #fff;
  }
  .card-edit {
    display: flex;
    gap: 8px;
    min-height: 420px;
  }
  .card-edit > :global(.se) {
    min-width: 0;
    flex: 1;
  }
  /* (The container is the cards page's right side.) The slide editor and its inspector want the width first: under
     1000px, 📱 On their phone goes under it, a phone's width. */
  @container (max-width: 1000px) {
    .card-edit {
      flex-direction: column;
    }
    .card-edit > :global(.phone-preview) {
      flex: none;
      align-self: flex-start;
      width: 300px;
      max-width: 100%;
    }
  }
  @container (max-width: 640px) {
    .quick {
      grid-template-columns: 1fr;
    }
  }
</style>
