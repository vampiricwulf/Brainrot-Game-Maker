<!--
  A player's avatar with what they wear (each item's picture placed on the avatar, else its icon, else a slot emoji)
  and, optionally, their nameplate. Worn items are placed in avatar sizes, so they fit any size of token.
-->
<script lang="ts">
  import { textOn } from '../colors';
  import { mediaUrls } from '../media.svelte';
  import type { ItemDef } from '../model';
  import { wornPlace } from '../toolset';
  import Avatar from './Avatar.svelte';

  let {
    player,
    size = 120,
    worn = [],
    name = true,
  }: { player: { name: string; color: string; avatar?: string }; size?: number; worn?: ItemDef[]; name?: boolean } = $props();

  const GEAR = { head: '🎩', hand: '🗡', body: '🛡', badge: '⭐' } as const;
  const placed = $derived(
    worn.flatMap((d) => {
      if (!d.wearable) return [];
      const p = wornPlace(d.wearable);
      const img = (d.wearable.image && mediaUrls[d.wearable.image]) || (d.icon && mediaUrls[d.icon]) || undefined;
      return [{ d, p, img, emoji: GEAR[d.wearable.slot] }];
    }),
  );
</script>

<div class="token" style:--s="{size}px">
  <div class="body">
    {#each placed.filter((g) => g.p.behind) as g (g.d.id)}{@render gear(g)}{/each}
    <Avatar {player} {size} />
    {#each placed.filter((g) => !g.p.behind) as g (g.d.id)}{@render gear(g)}{/each}
  </div>
  {#if name}<div class="nameplate" style:background={player.color} style:color={textOn(player.color)} title={player.name}>{player.name}</div>{/if}
</div>

{#snippet gear(g: (typeof placed)[number])}
  <span
    class="gear"
    title={g.d.name}
    style:left="{50 + g.p.x * 100}%"
    style:top="{50 + g.p.y * 100}%"
    style:width="{g.p.w * size}px"
    style:transform="translate(-50%, -50%) rotate({g.p.rotate}deg)"
    style:font-size="{g.p.w * size * 0.8}px"
  >
    {#if g.img}<img src={g.img} alt="" draggable="false" />{:else}{g.emoji}{/if}
  </span>
{/snippet}

<style>
  .token {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .body {
    position: relative;
    width: var(--s);
    height: var(--s);
  }
  .gear {
    position: absolute;
    display: grid;
    place-items: center;
    line-height: 1;
    pointer-events: none;
  }
  .gear img {
    width: 100%;
    height: auto;
    display: block;
  }
  .nameplate {
    margin-top: -10px;
    padding: 2px 12px;
    border-radius: 8px;
    border: 3px solid #000;
    /* At least 36px on the 1920 stage (13-14px on a 720p stream), for the usual 120px token. */
    font: max(calc(var(--s) * 0.22), min(36px, calc(var(--s) * 0.3))) 'Anton', 'Oswald', sans-serif;
    text-shadow: 1px 1px 0 #000;
    position: relative;
    /* One line, a little wider than the avatar: a long name ends in "…" instead of running into the next player's
       (players stand about 1.4 avatars apart). */
    box-sizing: border-box;
    max-width: calc(var(--s) * 1.4);
    width: max-content;
    text-align: center;
    line-height: 1.15;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
