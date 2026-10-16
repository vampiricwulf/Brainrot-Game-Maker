<!--
  🤫 The cards out now (partner-clues spec §12.2): those sent with 🤫 Send a card… or from a tile's panel, each by the
  label the app gave it ("Card 2 → Ann · ✓ seen"), never what's on it, with ↻ Send again, ✖ Take back and the 📋 copy
  buttons. In one window this list is on stream: the tools row shows only how many are out, and the list opens only
  when the host asks for it.
-->
<script lang="ts">
  import { announce } from '../../lib/announce';
  import { teamsOn } from '../../lib/buzz';
  import { retryFiles } from '../../lib/cardfiles.svelte';
  import type { Game, Id, SentCard, Session } from '../../lib/model';
  import { copyWordsText } from '../../lib/partner';
  import { cardLinks, cardWords } from '../../lib/phonecard';
  import { buzzerOn, remote, roomHasCards, roomHasFiles } from '../../lib/remote.svelte';
  import { cardsOut, sendCardAgain, sentSlide, sentToText } from '../../lib/sentcards';
  import { copyText } from '../standings';
  import { canCopyPicture, copyCardPicture, hasPicture } from './cardcopy';
  import { sentLine } from './cardrow';

  let { game, session, dual = false, ontakeback }: { game: Game; session: Session; dual?: boolean; ontakeback: (id: Id) => void } = $props();

  const list = $derived(cardsOut(game, session));
  const teams = $derived(buzzerOn(game.settings) && teamsOn(game.settings));
  const room = $derived(buzzerOn(game.settings) && !!remote.code && remote.status !== 'off' && remote.status !== 'error');
  const cardsOn = $derived(room && roomHasCards());
  const filesOn = $derived(cardsOn && roomHasFiles());
  const LASTS: Record<SentCard['until'], string> = { round: 'until the round ends', tile: 'until the tile closes', host: 'until you take it back' };

  function again(c: SentCard): void {
    const slide = sentSlide(game, c);
    if (slide) retryFiles(game, session, [slide]);
    if (sendCardAgain(game, session, c.id)) announce(`${c.label} sent again to ${sentToText(session, c.to, teams)}`);
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
    {@const state = sentLine(game, session, c, filesOn)}
    <div class="row" data-card-out={c.label} role="group" aria-label="{c.label} to {sentToText(session, c.to, teams)}: {state.text}">
      <b>{c.label}</b>
      <span aria-hidden="true">→</span>
      <span>{sentToText(session, c.to, teams)}</span>
      <span class="small" class:warn={state.warn} data-card-state>· {state.text}</span>
      <span class="muted small">· {LASTS[c.until]}</span>
    </div>
    <div class="row btns">
      {#if cardsOn}
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
