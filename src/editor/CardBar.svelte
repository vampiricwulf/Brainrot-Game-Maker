<!--
  A 🤫 card's bar (a tile's, in the clue editor; a Final's, in its editor): its Card name (the host's own: phones never
  get it), who it starts with, ⧉ Same as the answer on an empty one, 📱 On their phone and 🗑 Delete card. Typing the
  name is one undo step (the watcher names it "Renamed card “…”").
-->
<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { CARD_NAME_MAX, clueCardWords, type CardGoesTo, type ClueCard, type Slide } from '../lib/model';
  import { sameAsAnswer, setCardName } from '../lib/partner';
  import { slideHasContent } from '../lib/usage';
  import { nameGivesAway } from '../lib/validate';

  let {
    card,
    index,
    goesList,
    goesTo,
    goesTitle,
    answer,
    phoneView = $bindable(false),
    ongoes,
    oncopy,
    ondelete,
  }: {
    card: ClueCard;
    /** Its place (0: Card 1): the name's placeholder and fallback. */
    index: number;
    goesList: CardGoesTo[];
    goesTo: (to: CardGoesTo, long?: boolean) => string;
    /** Goes to's tooltip (a tile's or a Final's words). */
    goesTitle: string;
    /** Its tile's or Final's answer slide (⧉, and what the name mustn't repeat). */
    answer: Slide;
    phoneView: boolean;
    ongoes: (to: CardGoesTo) => void;
    oncopy: () => void;
    ondelete: () => void;
  } = $props();
  const uid = $props.id();

  let nameBox = $state<HTMLInputElement>();
  /** F2 or a double-click on its tab: the name box, its text selected. */
  export function focusName(): void {
    nameBox?.focus();
    nameBox?.select();
  }
  /** Its name repeats what's on it or the answer: in one window viewers read a card's name in the host panel. */
  const repeats = $derived(nameGivesAway(app.game, card, [answer]));
  const note = $derived(
    `For you to tell the cards apart: its tab, the host panel, 🤫 Send a card… and the checklist show it instead of “Card ${index + 1}”. Phones never get it, nor 📋 Copy words. In one window viewers can read it in the host panel: call it what it’s for (“Clue tip”, “Leader’s hint”), never what’s on it. F2 on its tab comes here.`,
  );
</script>

<!-- Its name, who it starts with (it can go to anyone when it's handed out), and ⧉ Same as the answer. -->
<div class="cardbar row" role="group" aria-label={clueCardWords(card, index, true)}>
  <label class="check name" title={note}>
    Card name
    <input
      bind:this={nameBox}
      data-field="card-name"
      maxlength={CARD_NAME_MAX}
      placeholder="Card {index + 1}"
      aria-describedby="card-name-note-{uid}"
      value={card.name ?? ''}
      oninput={(e) => setCardName(card, e.currentTarget.value)}
    />
  </label>
  <span class="sr-only" id="card-name-note-{uid}">{note}</span>
  <label class="check" title={goesTitle}>
    Goes to
    <select value={goesList.includes(card.to) ? card.to : 'nobody'} onchange={(e) => ongoes(e.currentTarget.value as CardGoesTo)}>
      {#each goesList as to (to)}<option value={to}>{goesTo(to)}</option>{/each}
    </select>
  </label>
  {#if !slideHasContent(card)}
    <button
      class="small"
      onclick={oncopy}
      disabled={!slideHasContent(answer)}
      title={slideHasContent(answer) ? 'Put a copy of the answer slide on this card, once: changing the answer afterwards doesn’t change the card' : 'The answer slide is empty'}
      >⧉ Same as the answer</button
    >
  {:else if sameAsAnswer({ answerSlide: answer }, card)}
    <span class="hint">This card shows the answer: whoever you send it to sees it</span>
  {/if}
  <!-- (Always there, so a screen reader hears the line when it shows.) -->
  <span role="status"
    >{#if repeats}<span class="small info" data-name-repeats
        >ℹ Its name repeats what’s on the card or the answer: in one window viewers can read a card’s name in the host panel</span
      >{/if}</span
  >
  <span class="spacer"></span>
  <button
    class="small"
    class:on={phoneView}
    aria-pressed={phoneView}
    onclick={() => (phoneView = !phoneView)}
    title="The card exactly as a player’s phone gets it: its words, then its pictures and videos one under another, and what won’t reach a phone">📱 On their phone</button
  >
  <button class="ghost small danger" onclick={ondelete} title="Delete this card (Ctrl+Z brings it back)">🗑 Delete card</button>
</div>

<style>
  .cardbar {
    padding: 4px 0;
  }
  .name input {
    width: 16ch;
  }
  .info {
    color: var(--muted);
  }
  .cardbar button.on {
    background: var(--accent-fill);
    border-color: var(--accent-fill);
    color: #fff;
  }
</style>
