<!--
  🤫 The cards out now (partner-clues spec §12.2): those sent with 🤫 Send a card… or from a tile's panel, each by the
  label the app gave it ("Card 2 → Ann · ✓ seen"), never what's on it, with ↻ Send again, ✖ Take back and the 📋 copy
  buttons. In one window this list is on stream: the tools row shows only how many are out, and the list opens only
  when the host asks for it. With the audience window open, a card from the editor's 🤫 Cards also says which it is.
-->
<script lang="ts">
  import { announce } from '../../lib/announce';
  import { cardsLeftOff, teamsOn } from '../../lib/buzz';
  import { phoneCan, retryFiles } from '../../lib/cardfiles.svelte';
  import { savedCardName, type Game, type Id, type SentCard, type Session, type Slide } from '../../lib/model';
  import { copyWordsText } from '../../lib/partner';
  import { cardLinks, cardWords, phoneCard } from '../../lib/phonecard';
  import { buzzerOn, remote, roomHasCards, roomHasFiles } from '../../lib/remote.svelte';
  import { listedCards, sendCardAgain, sentCardId, sentSlide, sentToText } from '../../lib/sentcards';
  import { copyText } from '../standings';
  import { canCopyPicture, copyCardPicture, hasPicture } from './cardcopy';
  import { leftLine, sentLine } from './cardrow';

  let { game, session, dual = false, ontakeback }: { game: Game; session: Session; dual?: boolean; ontakeback: (id: Id) => void } = $props();

  // (A 🎭 deal's cards are listed under 🎭 Deal…, counted, never one by one.)
  const list = $derived(listedCards(game, session));
  const teams = $derived(buzzerOn(game.settings) && teamsOn(game.settings));
  const room = $derived(buzzerOn(game.settings) && !!remote.code && remote.status !== 'off' && remote.status !== 'error');
  const cardsOn = $derived(room && roomHasCards());
  const filesOn = $derived(cardsOn && roomHasFiles());
  /**
   * The cards out that never reach a phone (their ids on the wire): more than the room takes, as a 🎭 deal handed out
   * before it took cards took them past that.
   */
  const leftOff = $derived(new Set(cardsOn ? cardsLeftOff(game, session) : []));
  const LASTS: Record<SentCard['until'], string> = { round: 'until the round ends', tile: 'until the tile closes', host: 'until you take it back' };

  function again(c: SentCard): void {
    const slide = sentSlide(game, c);
    if (slide) retryFiles(game, session, [slide]);
    if (sendCardAgain(game, session, c.id)) announce(`${c.label} sent again to ${sentToText(session, c.to, teams)}`);
  }
  /**
   * What of a card won't reach the phones, counted (never named, as in a tile's panel), and for a file that didn't go
   * up, what to do: the row would otherwise say "sent" and "✓ seen" while the phone waits for it.
   */
  function leftOf(slide: Slide): string {
    const left = phoneCard(game, slide, filesOn ? phoneCan(session) : { files: null }).left;
    const line = leftLine(left);
    if (!line || !left.some((l) => l.why === 'failed')) return line;
    return `${line}: ↻ Send again tries again${hasPicture(game, slide) && canCopyPicture ? ', or 📋 Copy picture' : ''}`;
  }
  function copyWords(c: SentCard): void {
    const slide = sentSlide(game, c);
    if (!slide) return;
    const names = c.to.map((t) => sentToText(session, [t], teams));
    void copyText(copyWordsText(game, slide, c.label, names), `${c.label}’s words copied: paste them to ${names.join(', ')}`);
  }
</script>

<div class="out" data-cards-out>
  {#each list as c (c.id)}
    {@const slide = sentSlide(game, c)}
    {@const off = leftOff.has(sentCardId(c))}
    {@const state = sentLine(game, session, c, filesOn, off, cardsOn)}
    {@const left = cardsOn && slide && !off ? leftOf(slide) : ''}
    <div class="row" data-card-out={c.label} role="group" aria-label="{c.label} to {sentToText(session, c.to, teams)}: {state.text}">
      <b>{c.label}</b>
      <span aria-hidden="true">→</span>
      <span>{sentToText(session, c.to, teams)}</span>
      {#if dual && 'saved' in c.content}
        <!-- (Two windows only: in one, a 🤫 Card's name next to who got it would be on stream.) -->
        {@const id = c.content.saved}
        {@const i = game.cards?.findIndex((x) => x.id === id) ?? -1}
        {#if i >= 0}<span class="muted small" data-card-from>· 🤫 {savedCardName(game.cards![i], i)}</span>{/if}
      {/if}
      <span class="small" class:warn={state.warn} data-card-state>· {state.text}</span>
      <span class="muted small">· {LASTS[c.until]}</span>
    </div>
    {#if left}<div class="small warn" data-card-left={c.label}>{left}</div>{/if}
    <div class="row btns">
      {#if cardsOn && !off}
        <button class="small" onclick={() => again(c)} aria-label="Send {c.label} again" title="Sends it again under a new id: a phone that came late (a player on a new phone) gets it too">↻ Send again</button>
      {/if}
      <button class="ghost small" onclick={() => ontakeback(c.id)} aria-label="Take {c.label} back" title="Takes it off every phone it went to">✖ Take back</button>
      {#if slide && (cardWords(slide) || cardLinks(game, slide).length)}
        <button class="small" onclick={() => copyWords(c)} aria-label="Copy {c.label}’s words" title="Copies “For … only” with the card’s words and links, to paste in a DM (nothing of it shows here)">📋 Copy words</button>
      {/if}
      {#if slide && hasPicture(game, slide) && canCopyPicture}
        <button class="small" onclick={() => copyCardPicture(game, slide, c.label, sentToText(session, c.to, teams))} aria-label="Copy {c.label}’s picture">📋 Copy picture</button>
      {/if}
    </div>
  {:else}
    <div class="muted small">No cards out.</div>
  {/each}
  {#if !dual}
    <span class="exposed">⚠ Viewers can see this window: it says who got each card, never what’s on it.</span>
  {/if}
</div>

<style>
  .out {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .btns {
    padding-bottom: 6px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
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
