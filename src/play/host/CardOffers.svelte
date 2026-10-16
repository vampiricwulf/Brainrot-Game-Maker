<!--
  🤫 The cards actions offered (partner-clues spec §12.1, §12.2): an RPG object's, an item's, a wheel slice's, a die
  face's or a board space's 🤫 Send a card button ran. Each asks who gets its card ("Goblin: 🤫 Card for whoever set it
  off → Ann"), with 📤 Send (or the 📋 copy buttons) and Skip. Nothing goes to a phone but by that 📤 Send: the same
  sending as 🤫 Send a card… (the list of cards out, ↻ Send again, ✖ Take back). In one window this is on stream: it
  names players and counts what's on the card, never says it.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { toast } from '../../lib/app.svelte';
  import type { Game, Session } from '../../lib/model';
  import { sentToText } from '../../lib/sentcards';
  import CardSend from './CardSend.svelte';
  import { cardOffers, dropOffer, dropOffersBut } from './offered.svelte';

  let { game, session, dual = false }: { game: Game; session: Session; dual?: boolean } = $props();

  // A round left: what its buttons offered goes (it was never sent).
  $effect(() => {
    const r = session.currentRound;
    untrack(() => dropOffersBut(r));
  });
  const list = $derived(cardOffers.list.filter((o) => o.round === session.currentRound));

  /** A new offer comes into view, its 📤 Send (or 🪟 Show) with the keys: the button pressed may be far from it. */
  function arrive(el: HTMLElement): void {
    el.scrollIntoView({ block: 'nearest' });
    el.querySelector<HTMLElement>('button.primary:not(:disabled)')?.focus({ preventScroll: true });
  }
</script>

{#each list as o (o.key)}
  <div class="offer" role="group" aria-label="Card offered: {o.from}" data-card-offer {@attach arrive}>
    <div class="row">
      <b class="small">{o.from}</b>
      <span class="muted small">(only if you send it)</span>
      <span class="spacer"></span>
      <button class="ghost small" onclick={() => dropOffer(o.key)} title="Close it without sending the card (once you’ve copied it, say)">Skip</button>
    </div>
    <CardSend
      {game}
      {session}
      {dual}
      preset={o}
      onsent={(c) => {
        dropOffer(o.key);
        toast(`${c.label} sent to ${sentToText(session, c.to)}`, 3000);
      }}
    />
  </div>
{/each}

<style>
  .offer {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    border: 1px solid var(--warn);
    border-radius: 8px;
  }
  .small {
    font-size: 12px;
  }
</style>
