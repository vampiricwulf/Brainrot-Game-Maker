<!--
  🤫 An open tile's own cards, on any tile but a partner clue (which hands its cards out in its Distribute list):
  partner-clues spec §11, §12.2, 🤫 Just you and 💡 Insider tip. Each card made in the editor's 🤫 Card tabs, with who
  it goes to (its Goes to: whoever picked it, a Daily Double's player, everyone else; the chips change it), 📤 Send to
  their phones, then ↻ Send again and ✖ Take back, or 📋 copying it to them, or 🪟 showing it in the card window open for
  one of them. Nothing goes until the host presses, and the tile plays as it always does. A card sent here lasts until
  the tile closes. In one window this panel is on stream: it counts what's on a card and never says it, nor names its
  pictures.
-->
<script lang="ts">
  import { app, toast } from '../../lib/app.svelte';
  import { announce } from '../../lib/announce';
  import { cardsFullText, cardsLeftOff, roomCardsFull, teamsOn } from '../../lib/buzz';
  import { cardWindow } from '../../lib/cardwindow.svelte';
  import { phoneCan, retryFiles } from '../../lib/cardfiles.svelte';
  import { textOn } from '../../lib/colors';
  import { cardSlides, type CardTo, type Clue, type ClueCard, type Game, type Id, type SentCard, type Session } from '../../lib/model';
  import { cardCopyText, cardSummary, tileGoesToLabel } from '../../lib/partner';
  import { cardLinks, cardWords, phoneCard } from '../../lib/phonecard';
  import { buzzerOn, remote, roomHasCards, roomHasFiles } from '../../lib/remote.svelte';
  import { cardsOut, sendCard, sendCardAgain, sentCardId, sentToText, tileRecipients } from '../../lib/sentcards';
  import { clueName } from '../../lib/session';
  import { copyText } from '../standings';
  import { canCopyPicture, copyCardPicture, hasPicture } from './cardcopy';
  import { leftLine, sentLine } from './cardrow';

  let {
    game,
    session,
    clue,
    dual = false,
    ontakeback,
  }: {
    game: Game;
    session: Session;
    /** The tile that's open (not a partner clue). */
    clue: Clue;
    /** An audience window is open: viewers don't see this window. */
    dual?: boolean;
    /** ✖ Take back: the card goes from every phone it was sent to. */
    ontakeback: (id: Id) => void;
  } = $props();

  const cards = $derived(cardSlides(clue));
  const teams = $derived(buzzerOn(game.settings) && teamsOn(game.settings));
  /** A buzzer room is open for this game. */
  const room = $derived(buzzerOn(game.settings) && !!remote.code && remote.status !== 'off' && remote.status !== 'error');
  /** Its phones get the cards the host sends (else the host copies them: 📋). */
  const cardsOn = $derived(room && roomHasCards());
  const filesOn = $derived(cardsOn && roomHasFiles());
  /** An older buzzer server: no cards on phones, the host copies them. */
  const older = $derived(room && remote.status === 'online' && !roomHasCards());
  const phones = $derived(new Set(app.live.phones ?? []));
  const where = $derived(session.currentClue ? clueName(game, session.currentClue) : '');
  const can = $derived(phoneCan(session));

  /** Who the host chose for a card (players' ids), by card id; a card not chosen for goes by its Goes to. */
  let chosen = $state<Record<Id, Id[]>>({});
  const recipients = (card: ClueCard): CardTo[] => {
    const ids = chosen[card.id];
    return ids ? session.players.filter((p) => ids.includes(p.id)).map((p) => ({ seat: p.id })) : tileRecipients(session, card);
  };
  function toggle(card: ClueCard, id: Id): void {
    const now = recipients(card).map((t) => t.seat);
    chosen[card.id] = now.includes(id) ? now.filter((x) => x !== id) : [...now, id];
  }
  /** The card's latest send that's out now (from here, or 🤫 Send a card…). */
  const sentOf = (card: ClueCard): SentCard | undefined =>
    [...cardsOut(game, session)].reverse().find((c) => 'clue' in c.content && c.content.clue === clue.id && c.content.card === card.id);

  /** The buzzer room has all the cards it takes: ✖ Take one back first. */
  const full = $derived(roomCardsFull(game, session));
  /** The cards out that never reach a phone (their ids on the wire): more than the room takes (see CardsOut). */
  const leftOff = $derived(new Set(cardsOn ? cardsLeftOff(game, session) : []));
  /**
   * 📤 Send: this card to its players' phones now, until the tile closes. `to`: 🪟 Show, to the card window's player
   * alone (no phones get cards).
   */
  function send(card: ClueCard, n: number, to = recipients(card)): void {
    if (roomCardsFull(game, session)) return toast(cardsFullText(game, session), 4000);
    const c = sendCard(game, session, { to, content: { clue: clue.id, card: card.id }, until: 'tile' }, Date.now(), roomCardsFull(game, session));
    if (!c) return toast(`Choose who gets card ${n} first`);
    announce(`Card ${n} ${cardsOn ? 'sent to' : 'shown in the 🪟 card window to'} ${sentToText(session, c.to, teams)}`);
  }
  /** The card window is open for one of a card's players (a whole seat): 🪟 Show puts it there. */
  const windowSeat = (to: CardTo[]): Id | null => (cardWindow.open && cardWindow.seat && to.some((t) => t.seat === cardWindow.seat) ? cardWindow.seat : null);
  const nameOf = (id: Id) => session.players.find((p) => p.id === id)?.name ?? '?';
  /** ↻ Send again: under a new id, so a phone that came late (a new phone for the seat) gets it too. */
  function again(c: SentCard, card: ClueCard, n: number): void {
    retryFiles(game, session, [card]);
    if (sendCardAgain(game, session, c.id)) announce(`Card ${n} sent again to ${sentToText(session, c.to, teams)}`);
  }
  /** 📋 Copy words: the card's words and links, named for who they're for. Nothing of it shows on screen. */
  function copyWords(card: ClueCard, n: number, to: CardTo[]): void {
    const names = to.map((t) => sentToText(session, [t], teams));
    void copyText(cardCopyText(game, card, n, where, names), `Card ${n}’s words copied: paste them to ${names.join(', ') || 'them'}`);
  }
</script>

{#snippet chip(card: ClueCard, n: number, id: Id, on: boolean)}
  {@const p = session.players.find((x) => x.id === id)}
  {@const nophone = cardsOn && !phones.has(id)}
  <button
    class="chip"
    style:border-color={p?.color}
    style:background={on ? p?.color : undefined}
    style:color={on ? textOn(p?.color ?? '#888') : undefined}
    aria-pressed={on}
    aria-label="Card {n} to {p?.name}{nophone ? ' (no phone here)' : ''}"
    title={nophone ? `${p?.name} has no phone here: copy the card to ${teams ? 'the team' : 'them'} (📋), or show it in the 🪟 card window` : teams ? `Every phone on ${p?.name} gets it` : undefined}
    onclick={() => toggle(card, id)}
  >
    {p?.name}{#if on}&nbsp;✓{/if}{#if nophone}<span class="part" aria-hidden="true">📵</span>{/if}
  </button>
{/snippet}

<div class="tilecards" data-tile-cards>
  <div class="row">
    <b>🤫 This tile’s cards</b>
    <span class="muted small">only who you send one to sees it; the tile plays as usual</span>
  </div>
  {#each cards as card, i (card.id)}
    {@const n = i + 1}
    {@const out = sentOf(card)}
    {@const to = out ? out.to : recipients(card)}
    {@const off = !!out && leftOff.has(sentCardId(out))}
    {@const copying = !cardsOn || off || to.some((t) => !phones.has(t.seat))}
    {@const copyable = !!cardWords(card) || cardLinks(game, card).length > 0}
    {@const left = cardsOn ? leftLine(phoneCard(game, card, filesOn ? can : { files: null }).left) : ''}
    {@const state = out ? sentLine(game, session, out, filesOn, off, cardsOn) : null}
    <div class="row card" data-tile-card={n} role="group" aria-label="Card {n}: {state ? `${out?.label}, ${state.text}` : cardsOn ? 'not sent' : sentToText(session, to, teams)}">
      <b>Card {n}</b>
      <span class="muted small">· {cardSummary(game, card)}</span>
      <span aria-hidden="true">→</span>
      {#if out && state}
        <span>{sentToText(session, out.to, teams)}</span>
        <!-- (Without phones, an orange row is a card changed in the editor since: it's out of the window, and says what to do.) -->
        <span class="small" class:warn={state.warn} data-card-state>· {cardsOn || state.warn ? state.text : 'in the 🪟 card window'} · listed as {out.label}</span>
      {:else}
        {#each session.players as p (p.id)}
          {@render chip(card, n, p.id, to.some((t) => t.seat === p.id))}
        {/each}
        {#if !to.length}<span class="muted small" title="It starts with {tileGoesToLabel(clue.type, card.to)}">nobody yet</span>{/if}
      {/if}
      <span class="spacer"></span>
      {#if cardsOn}
        {#if out}
          {#if !off}<button class="small" onclick={() => again(out, card, n)} aria-label="Send card {n} again" title="Sends it again under a new id: a phone that came late (a player on a new phone) gets it too, with what’s on the card now">↻ Send again</button>{/if}
          <button class="ghost small" onclick={() => ontakeback(out.id)} aria-label="Take card {n} back" title="Takes it off every phone it went to">✖ Take back</button>
        {:else}
          <button class="small" onclick={() => send(card, n)} disabled={!to.length || full} aria-label="Send card {n}" title={full ? cardsFullText(game, session) : to.length ? `Sends it to ${sentToText(session, to, teams)} now, until the tile closes` : 'Choose who gets it first'}>📤 Send</button>
        {/if}
      {:else if out}
        <button class="ghost small" onclick={() => ontakeback(out.id)} aria-label="Take card {n} back" title="Takes it out of the 🪟 card window">✖ Take back</button>
      {:else if windowSeat(to)}
        {@const seat = windowSeat(to)!}
        <button class="small" onclick={() => send(card, n, [{ seat }])} disabled={full} aria-label="Show card {n} to {nameOf(seat)}" title={full ? cardsFullText(game, session) : `Shows it in the 🪟 card window, to ${nameOf(seat)} alone, until the tile closes`}>🪟 Show {nameOf(seat)}</button>
      {/if}
      {#if copying}
        <button
          class="small"
          onclick={() => copyWords(card, n, to)}
          disabled={!to.length || !copyable}
          title={!to.length ? 'Choose who gets it first' : copyable ? 'Copies “For … only” with the card’s words and links, to paste in a DM' : 'This card has no words or links: 📋 Copy picture'}>📋 Copy words</button
        >
      {/if}
      {#if hasPicture(game, card) && canCopyPicture && (copying || !!left)}
        <button class="small" onclick={() => copyCardPicture(game, card, `Card ${n}`, sentToText(session, to, teams))} disabled={!to.length} title="Copies the card’s picture, to paste in a DM">📋 Copy picture</button>
      {/if}
    </div>
    {#if left}<div class="small warn left" data-card-left={n}>{left}</div>{/if}
  {/each}
  {#if older}<span class="muted small">This buzzer server is older: copy the cards to them (📋).</span>{/if}
  {#if !dual}
    <span class="exposed">⚠ Viewers can see this window: what’s on a card is never shown here (check the cards in the editor’s 🤫 Card tabs).</span>
  {/if}
</div>

<style>
  .tilecards {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    border: 1px solid #8a6bd1;
    border-radius: 8px;
    background: rgba(138, 107, 209, 0.1);
  }
  .card {
    padding-top: 4px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }
  .chip {
    border-width: 2px;
    padding: 2px 8px;
    font-size: 12px;
  }
  .part {
    margin-left: 4px;
    font-size: 12px;
    opacity: 0.8;
  }
  .small {
    font-size: 12px;
  }
  .warn {
    color: var(--warn);
  }
  .exposed {
    color: var(--warn);
    font-size: 12px;
  }
</style>
