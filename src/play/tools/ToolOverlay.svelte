<!-- Full-screen overlay for wheel / dice / roll-off / scoreboard on the audience view (spec §14 placement). -->
<script lang="ts">
  import { fade } from 'svelte/transition';
  import type { Overlay } from '../../lib/live';
  import { formatPoints, type Game, type Session } from '../../lib/model';
  import type { MediaRole } from '../../lib/mediactl.svelte';
  import { places } from '../../lib/session';
  import { textOn } from '../../lib/colors';
  import WheelView from './WheelView.svelte';
  import DiceView from './DiceView.svelte';
  import RollOffView from './RollOffView.svelte';
  import SlideView from '../../lib/slide/SlideView.svelte';
  import PlayerSheet from '../rpg/PlayerSheet.svelte';
  import ShopView from '../rpg/ShopView.svelte';

  let {
    o,
    game,
    session,
    role,
    onclick,
    onshopbuy,
  }: {
    o: Overlay;
    game: Game;
    session: Session;
    role: MediaRole;
    onclick?: () => void;
    /** Host: a ware in the shop on screen was clicked. */
    onshopbuy?: (itemId: string) => void;
  } = $props();
</script>

<div class="ov" class:clickable={!!onclick} transition:fade={{ duration: 200 }} onclick={() => onclick?.()} role="presentation">
  {#key o.nonce}
    {#if o.kind === 'wheel'}
      <WheelView {o} {game} {role} />
    {:else if o.kind === 'dice'}
      <DiceView {o} {game} {role} />
    {:else if o.kind === 'rolloff'}
      <RollOffView {o} {session} />
    {:else if o.kind === 'popup'}
      <div class="popup"><SlideView slide={o.revealed && o.answer ? o.answer : o.slide} mode="play" {role} /></div>
    {:else if o.kind === 'sheet'}
      <PlayerSheet {game} {session} playerId={o.playerId} />
    {:else if o.kind === 'shop'}
      <ShopView {game} {session} shopId={o.shopId} buyer={o.buyer} onbuy={onshopbuy} />
    {:else if o.kind === 'scoreboard'}
      {@const ranked = places(session)}
      <div class="sb" style:--n={ranked.length}>
        <h1>Scores</h1>
        {#each ranked as { player, score, place } (player.id)}
          <div class="line" style:--c={player.color}>
            <span class="rank">{place}</span>
            <span class="nm" style:background={player.color} style:color={textOn(player.color)}>{player.name}</span>
            <span class="sc">{formatPoints(score, game.settings.currencySymbol)}</span>
          </div>
        {/each}
      </div>
    {/if}
  {/key}
</div>

<style>
  .ov {
    position: absolute;
    inset: 0;
    z-index: 40;
    /* The theme's tile color, darkened, fading to black. What's behind is blurred and dim enough not to be read through. */
    background: radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--tile) 45%, rgb(0 0 0 / 0.9)), rgba(0, 0, 20, 0.97));
    backdrop-filter: blur(8px);
  }
  /* The tools' titles (a wheel's or dice's name, "Who goes first?") on a solid pill of their own. */
  .ov :global(.title) {
    padding: 4px 28px;
    border-radius: 18px;
    background: rgba(0, 0, 0, 0.82);
  }
  .clickable {
    cursor: pointer;
  }
  .popup {
    position: absolute;
    inset: 0;
  }
  .sb {
    /* Up to 6 players fit at full size; with more, everything shrinks so the last one stays on screen. */
    --k: min(1, calc(6 / var(--n, 1)));
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: calc(18px * var(--k));
    padding-top: calc(60px * var(--k));
  }
  h1 {
    margin: 0 0 calc(20px * var(--k));
    font-family: var(--value-font);
    font-size: calc(100px * var(--k));
    color: var(--value);
    text-shadow: 6px 6px 0 #000;
  }
  .line {
    display: flex;
    align-items: center;
    gap: 24px;
    width: 1200px;
    font-family: var(--board-font);
    font-size: calc(60px * var(--k));
    font-weight: 800;
    color: #fff;
    background: rgba(0, 0, 0, 0.4);
    border-left: 16px solid var(--c);
    border-radius: 12px;
    padding: calc(8px * var(--k)) 24px;
  }
  .rank {
    width: 60px;
    color: var(--value);
  }
  .nm {
    padding: 0 20px;
    border-radius: 10px;
  }
  .sc {
    margin-left: auto;
    font-family: var(--value-font);
  }
</style>
