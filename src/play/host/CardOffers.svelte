<!--
  🤫 The cards actions offered (partner-clues spec §12.1, §12.2): an RPG object's, an item's, a wheel slice's, a die
  face's or a board space's 🤫 Send a card button ran. Each asks who gets its card ("Goblin: 🤫 Card for whoever set it
  off → Ann"), with 📤 Send (or the 📋 copy buttons) and Skip. Nothing goes to a phone but by that 📤 Send: the same
  sending as 🤫 Send a card… (the list of cards out, ↻ Send again, ✖ Take back). In one window this is on stream: it
  names players and counts what's on the card, never says it. With `at`, the offers made there (a landing box, a
  space's or an object's card, the tool's box), shown under it; without, the rest, at the top of the panel.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { toast } from '../../lib/app.svelte';
  import type { Game, Session } from '../../lib/model';
  import { sentToText } from '../../lib/sentcards';
  import CardSend from './CardSend.svelte';
  import { arrived, cardOffers, dropOffer, dropOffersBut, offerShownAt, showPlace } from './offered.svelte';

  let { game, session, dual = false, at }: { game: Game; session: Session; dual?: boolean; at?: string } = $props();

  // A round left: what its buttons offered goes (it was never sent).
  $effect(() => {
    if (at) return;
    const r = session.currentRound;
    untrack(() => dropOffersBut(r));
  });
  // This place shows its own offers while it's on screen.
  $effect(() => {
    const here = at;
    if (here) return untrack(() => showPlace(here));
  });
  const list = $derived(cardOffers.list.filter((o) => o.round === session.currentRound && (at ? o.at === at : offerShownAt(o) === 'top')));

  /**
   * An offer comes into view (the button pressed may be far from it). A new one has its 📤 Send (or 🪟 Show) take the
   * keys; one moving here when its place went doesn't.
   */
  function arrive(el: HTMLElement, key: number): void {
    el.scrollIntoView({ block: 'nearest' });
    if (arrived.has(key)) return;
    arrived.add(key);
    el.querySelector<HTMLElement>('button.primary:not(:disabled)')?.focus({ preventScroll: true });
  }
</script>

{#each list as o (o.key)}
  <!-- (One window: what offered it, a secret space not revealed yet as “? (secret)”, as its step says it.) -->
  {@const from = !dual && o.quiet ? o.quiet : o.from}
  <div class="offer" role="group" aria-label="Card offered: {from}" data-card-offer {@attach (el) => arrive(el, o.key)}>
    <div class="row">
      <b class="small">{from}</b>
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
