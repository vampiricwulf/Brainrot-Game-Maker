<!--
  A Final Jeopardy round: category, think time, the question/answer slides, and its 🤫 cards (＋ Card: offered in the
  host panel during the Final, from the wagers to the last reveal).
-->
<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { app } from '../lib/app.svelte';
  import { step as record } from '../lib/history.svelte';
  import { take, type ClueSide, type Place, type Side } from '../lib/nav.svelte';
  import { cardFromAnswer, ownTextTargets, textStyleTargets } from '../lib/ops';
  import {
    cardSlides,
    clueCardName,
    clueCardWords,
    finalName,
    questionSlides,
    setSlideText,
    slideText,
    type CardGoesTo,
    type ClueCard,
    type ExtraSlide,
    type FinalRound,
    type Slide,
    type TextEl,
  } from '../lib/model';
  import { addCard, deleteCard, FINAL_GOES_TO, finalGoesToLabel } from '../lib/partner';
  import { clip } from '../lib/buzzproto';
  import { followClueText } from '../lib/cluetext';
  import CardBar from './CardBar.svelte';
  import PhoneCardPreview from './PhoneCardPreview.svelte';
  import SlideEditor from './slide/SlideEditor.svelte';
  import SlideTabs, { slideKeyOf } from './SlideTabs.svelte';

  let { round }: { round: FinalRound } = $props();
  let side = $state<Side>('q');
  // Like a board clue, it can have several question slides, shown in order before the answer.
  /** The question slide open (0: the first), kept while the Answer tab is open. */
  let qi = $state(0);
  const qslides = $derived(questionSlides(round));
  const at = $derived(Math.min(qi, Math.max(0, qslides.length - 1)));
  const qslide = $derived(qslides[at]);

  // ---------- 🤫 Cards ----------
  // Its cards: slides only the players the host sends them to see, offered in the Final's panel from the wagers to the
  // last reveal. Their tabs come after the question slides (Question 1…n · 🤫 Card 1…k, or their names · Answer).
  /** A card's tab is open (`side` is kept for when another opens). */
  let onCard = $state(false);
  /** The card open (0: Card 1), kept while another tab is open. */
  let ci = $state(0);
  /** 📱 On their phone: the open card as a phone gets it, beside the slide (kept on while moving between cards). */
  let phoneView = $state(false);
  /** The open card's bar (its Card name box: F2 or a double-click on its tab). */
  let bar = $state<ReturnType<typeof CardBar>>();
  /** The slide tabs (the keys go back to the open one). */
  let tabs = $state<ReturnType<typeof SlideTabs>>();
  let cardField = $state<HTMLTextAreaElement>();
  const cards = $derived(cardSlides(round));
  const cardAt = $derived(Math.min(ci, Math.max(0, cards.length - 1)));
  /** The card open, else the last one opened (Card 1 at first): the 4th quick box is its words. */
  const card = $derived<ClueCard | undefined>(cards[cardAt]);
  /** The tab shown: a card's when there's one to show (deleted, undone: the question or the answer). */
  const shown = $derived<ClueSide>(onCard && card ? 'card' : side);
  const slideKey = $derived(slideKeyOf(shown === 'card' ? card : shown === 'q' ? qslide : undefined));

  /** The Final at one of its cards, at a question slide (the first one has no id) or at its answer. */
  const cardPlace = (c: ClueCard): Place => ({ tab: 'round', round: round.id, part: { kind: 'final', side: 'card', slide: c.id } });
  const sidePlace = (sd: Side, s?: Slide): Place => ({
    tab: 'round',
    round: round.id,
    part: { kind: 'final', side: sd, slide: sd === 'q' ? (s as Partial<ExtraSlide> | undefined)?.id : undefined },
  });
  /** Where the tab open is (where a change made from it shows when undone). */
  const openPlace = (): Place => (shown === 'card' && card ? cardPlace(card) : shown === 'a' ? sidePlace('a') : sidePlace('q', qslide));
  /**
   * A change to the cards as one named step; the card it returns opens (-1: none left, the question opens). Undone, the
   * tab open before shows again; redone, the card it opened (as the clue editor's do).
   */
  function cardStep(label: string, fn: () => number, notify = false): void {
    const undoPlace = openPlace();
    const place = openPlace();
    const to = record(
      label,
      () => {
        const i = fn();
        const c = cardSlides(round)[i];
        // (Filled in once it's made: the history reads the place after.)
        Object.assign(place, c ? cardPlace(c) : sidePlace('q'));
        return i;
      },
      { place, undoPlace, notify },
    );
    if (to < 0) ((onCard = false), (side = 'q'));
    else ((onCard = true), (ci = to));
  }
  /** ＋ Card: a new card at the end, starting with everyone playing, its words box ready to type in. */
  function newCardTab(): void {
    cardStep(`Added card ${cards.length + 1} to ${finalName(round)}`, () => {
      const c = addCard(round, 'playing');
      if (c) followClueText(app.game, [c]);
      return cardSlides(round).length - 1;
    });
    void tick().then(() => cardField?.focus());
  }
  function deleteCardTab(): void {
    cardStep(`Deleted ${clueCardWords(card!, cardAt)} of ${finalName(round)}`, () => deleteCard(round, cardAt), true);
    // (The last one: its bar goes with the button pressed, so the keys go on from the question's tab, not the top.)
    if (!cardSlides(round).length) void tabs?.focusTab();
  }
  /** Who the open card starts with in the Final's panel. */
  function setGoesTo(to: CardGoesTo): void {
    const c = card;
    if (!c) return;
    record(`${clueCardWords(c, cardAt, true)} of ${finalName(round)} goes to ${finalGoesToLabel(to, false)}`, () => (c.to = to), { place: cardPlace(c) });
  }
  /** ⧉ Same as the answer: a copy of the answer slide on the open (empty) card, once. */
  function copyAnswer(): void {
    const c = card;
    if (!c) return;
    record(`Copied the answer onto ${clueCardWords(c, cardAt)} of ${finalName(round)}`, () => cardFromAnswer(round, c), { place: cardPlace(c) });
  }

  // An undo or redo here shows the side or the card it changed.
  const handled = { seq: 0 };
  $effect(() => {
    const place = take(handled);
    if (place?.tab !== 'round' || place.round !== untrack(() => round.id) || place.part?.kind !== 'final' || !place.part.side) return;
    const slide = place.part.slide;
    if (place.part.side === 'card') {
      onCard = true;
      ci = Math.max(0, untrack(() => round.cards)?.findIndex((c) => c.id === slide) ?? 0);
      return;
    }
    onCard = false;
    side = place.part.side;
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
<div class="quick" class:four={!!card}>
  <label class="field">
    {qslides.length > 1 ? `Question (slide ${at + 1} of ${qslides.length})` : 'Question'}
    <textarea rows="2" data-field="q" placeholder="Type the final question…" value={slideText(qslide)} oninput={(e) => setSlideText(qslide, e.currentTarget.value) && followClueText(app.game, [qslide])}></textarea>
  </label>
  <label class="field">
    Answer (hidden until revealed)
    <textarea rows="2" data-field="a" placeholder="Type the answer…" value={slideText(round.answerSlide)} oninput={(e) => setSlideText(round.answerSlide, e.currentTarget.value) && followClueText(app.game, [round.answerSlide])}></textarea>
  </label>
  {#if card}
    <!-- (The card open, else the last one opened: Card 1 at first. A long name is cut.) -->
    <label class="field">
      🤫 {clip(clueCardName(card, cardAt), 24)} words (only who you send it to sees them)
      <textarea
        bind:this={cardField}
        rows="2"
        dir="auto"
        data-field="card"
        placeholder="Type what they’ll see…"
        value={slideText(card)}
        oninput={(e) => setSlideText(card, e.currentTarget.value) && followClueText(app.game, [card])}
      ></textarea>
    </label>
  {/if}
  <label class="field">
    Host notes (never shown on stream)
    <textarea rows="2" data-field="round-notes" value={round.hostNotes ?? ''} oninput={(e) => (round.hostNotes = e.currentTarget.value)}></textarea>
  </label>
</div>
<SlideTabs
  bind:this={tabs}
  holder={round}
  bind:side
  bind:qi
  bind:ci
  bind:onCard
  what="Final"
  place={(sd, slide) => ({ tab: 'round', round: round.id, part: { kind: 'final', side: sd, slide } })}
  cards={{
    list: cards,
    onadd: newCardTab,
    onname: () => void tick().then(() => bar?.focusName()),
    title: (c, i) => `🤫 ${clueCardName(c, i)}: only the players you send it to see it, never on stream. It starts with ${finalGoesToLabel(c.to, false)}. F2: rename it`,
    place: (id) => ({ tab: 'round', round: round.id, part: { kind: 'final', side: 'card', slide: id } }),
  }}
/>
{#if shown === 'card' && card}
  <CardBar
    bind:this={bar}
    {card}
    index={cardAt}
    goesList={FINAL_GOES_TO}
    goesTo={finalGoesToLabel}
    goesTitle="Who this card starts with in the Final’s panel: everyone ticked to play it on the wager screen (it follows the ticks), or nobody until you choose. You can give it to anyone then"
    question={qslides}
    answer={round.answerSlide}
    bind:phoneView
    ongoes={setGoesTo}
    oncopy={copyAnswer}
    ondelete={deleteCardTab}
    ondone={() => void tabs?.focusTab()}
  />
{/if}
<!-- (📱 On their phone sits beside the slide editor, never over its toolbar or inspector.) -->
<div class="card-edit">
  {#key `${round.id}-${slideKey}`}
    <SlideEditor
      slide={shown === 'card' && card ? card : side === 'q' ? qslide : round.answerSlide}
      styletargets={styleTargets}
      stylescope="round-qa"
      quickfield={shown}
      placeholder={shown === 'card' ? 'Click to type what they’ll see' : side === 'q' ? 'Click to type the final question' : 'Click to type the final answer'}
      badge={shown === 'card' && card ? `🤫 ${clip(clueCardName(card, cardAt), 16).toUpperCase()} · ONLY WHO YOU SEND IT TO SEES IT` : side === 'a' ? 'ANSWER' : undefined}
    />
  {/key}
  <!-- (No clue: a Final's card has no role or hint line, and is each player's own, as sessionCards sends it.) -->
  {#if shown === 'card' && card && phoneView}<PhoneCardPreview game={app.game} {card} />{/if}
</div>

<style>
  .quick {
    display: grid;
    grid-template-columns: 1.3fr 1fr 1fr;
    gap: 12px;
    margin-bottom: 12px;
    /* (The boxes line up at the bottom whatever their labels wrap to: a card's is long.) */
    align-items: end;
  }
  .quick.four {
    grid-template-columns: 1.2fr 1fr 1fr 1fr;
  }
  .quick textarea {
    resize: none;
    field-sizing: content;
    min-height: calc(2lh + 14px);
    max-height: calc(4lh + 14px);
  }
  /* The slide editor takes the width 📱 On their phone leaves. */
  .card-edit {
    display: flex;
    gap: 8px;
    min-height: 420px;
  }
  .card-edit > :global(.se) {
    min-width: 0;
    flex: 1;
  }
  @media (max-width: 900px) {
    .quick,
    .quick.four {
      grid-template-columns: 1fr;
    }
    .card-edit {
      flex-direction: column;
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
