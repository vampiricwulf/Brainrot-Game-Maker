<!-- "🔔 Ann is answering": who the host picked to answer the clue on screen, in stage coordinates. -->
<script lang="ts">
  import { fly } from 'svelte/transition';
  import { textOn } from '../lib/colors';
  import type { Player } from '../lib/model';

  let { player }: { player: Player } = $props();
</script>

{#key player.id}
  <div class="plate" style:--c={player.color} in:fly={{ y: -60, duration: 250 }} out:fly={{ y: -60, duration: 200 }}>
    <span class="bell" aria-hidden="true">🔔</span>
    <span class="name" style:background={player.color} style:color={textOn(player.color)}>{player.name}</span>
    <span>is answering</span>
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
  @keyframes ring {
    25% {
      rotate: -20deg;
    }
    75% {
      rotate: 20deg;
    }
  }
</style>
