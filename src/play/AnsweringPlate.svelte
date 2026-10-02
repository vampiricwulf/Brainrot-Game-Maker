<!--
  "🔔 Ann is answering": who the host picked to answer the clue on screen, in stage coordinates. Teams: "🔔 Red team is
  answering · Ann", with who on the team buzzed.
-->
<script lang="ts">
  import { fly } from '../lib/motion.svelte';
  import { textOn } from '../lib/colors';
  import type { Player } from '../lib/model';

  let { player, by }: { player: Player; by?: string } = $props();
</script>

{#key player.id}
  <div class="plate" style:--c={player.color} in:fly={{ y: -60, duration: 250 }} out:fly={{ y: -60, duration: 200 }}>
    <span class="bell" aria-hidden="true">🔔</span>
    <span class="name" dir="auto" style:background={player.color} style:color={textOn(player.color)}>{player.name}</span>
    <span>is answering</span>
    {#if by}<span class="by" dir="auto">· {by}</span>{/if}
  </div>
{/key}

<style>
  .plate {
    position: absolute;
    top: 24px;
    left: 50%;
    translate: -50% 0;
    max-width: 1300px;
    display: flex;
    align-items: center;
    gap: 18px;
    padding: 10px 30px 10px 22px;
    font-family: var(--board-font);
    font-size: 46px;
    font-weight: 800;
    color: #fff;
    white-space: nowrap;
    background: rgba(0, 0, 0, 0.75);
    border: 5px solid var(--c);
    border-radius: 999px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    z-index: 16;
    pointer-events: none;
  }
  .bell {
    animation: ring 0.6s ease-in-out 2;
  }
  .name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    padding: 0 18px;
    border-radius: 12px;
  }
  /* Teams: who on the team buzzed. */
  .by {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 36px;
    opacity: 0.85;
    /* A slanted font's last letter leans past the box: room for it, or it's cut. */
    padding-right: 0.15em;
  }
  @keyframes ring {
    25% {
      rotate: -20deg;
    }
    75% {
      rotate: 20deg;
    }
  }
</style>
