<!-- Full-screen overlay for wheel / dice / roll-off / scoreboard on the audience view (spec §14 placement). -->
<script lang="ts">
  import { fade } from 'svelte/transition';
  import type { Overlay } from '../../lib/live';
  import { formatPoints, type Game, type Session } from '../../lib/model';
  import type { MediaRole } from '../../lib/mediactl.svelte';
  import { standings } from '../../lib/session';
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
      <div class="sb">
        <h1>Scores</h1>
        {#each standings(session) as { player, score }, i (player.id)}
          <div class="line" style:--c={player.color}>
            <span class="rank">{i + 1}</span>
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
    background: radial-gradient(circle at 50% 50%, rgba(20, 30, 160, 0.92), rgba(0, 0, 20, 0.96));
  }
  .clickable {
    cursor: pointer;
  }
  .popup {
    position: absolute;
    inset: 0;
  }
  .sb {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 18px;
    padding-top: 60px;
  }
  h1 {
    margin: 0 0 20px;
    font-family: var(--value-font);
    font-size: 100px;
    color: #ffcc00;
    text-shadow: 6px 6px 0 #000;
  }
  .line {
    display: flex;
    align-items: center;
    gap: 24px;
    width: 1200px;
    font-family: var(--board-font);
    font-size: 60px;
    font-weight: 800;
    color: #fff;
    background: rgba(0, 0, 0, 0.4);
    border-left: 16px solid var(--c);
    border-radius: 12px;
    padding: 8px 24px;
  }
  .rank {
    width: 60px;
    color: #ffcc00;
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
