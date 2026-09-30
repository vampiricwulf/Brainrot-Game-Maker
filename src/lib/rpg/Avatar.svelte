<!-- A player's avatar: their picture, or a token in their color with their initials. -->
<script lang="ts">
  import { textOn } from '../colors';
  import { mediaUrls } from '../media.svelte';

  let { player, size = 64, ring = true }: { player: { name: string; color: string; avatar?: string }; size?: number; ring?: boolean } = $props();
  const src = $derived(player.avatar ? mediaUrls[player.avatar] : undefined);
  const initials = $derived(
    player.name
      .trim()
      .split(/\s+/)
      .map((w) => w[0] ?? '')
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?',
  );
</script>

<span
  class="av"
  class:ring
  style:width="{size}px"
  style:height="{size}px"
  style:--c={player.color}
  style:background={src ? 'transparent' : player.color}
  style:color={textOn(player.color)}
  style:font-size="{Math.round(size * 0.42)}px"
  aria-hidden="true"
>
  {#if src}<img {src} alt="" draggable="false" />{:else}{initials}{/if}
</span>

<style>
  .av {
    display: inline-grid;
    place-items: center;
    border-radius: 50%;
    overflow: hidden;
    font-weight: 800;
    font-family: 'Anton', 'Oswald', sans-serif;
    flex: none;
    box-sizing: border-box;
  }
  .av.ring {
    border: max(2px, 0.06em) solid var(--c);
  }
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
</style>
