<!-- A player's avatar: their picture, or a token in their color with their initials. -->
<script lang="ts">
  import { textOn } from '../colors';
  import { mediaUrls } from '../media.svelte';
  import { initials } from '../model';

  let { player, size = 64, ring = true }: { player: { name: string; color: string; avatar?: string }; size?: number; ring?: boolean } = $props();
  const src = $derived(player.avatar ? mediaUrls[player.avatar] : undefined);
  const letters = $derived(initials(player.name));
  /** Small tokens (a host's list, a chip): the plain UI font, so two initials stay two letters, not a condensed blob. */
  const small = $derived(size < 48);
</script>

<span
  class="av"
  class:ring
  class:small
  style:width="{size}px"
  style:height="{size}px"
  style:--c={player.color}
  style:background={src ? 'transparent' : player.color}
  style:color={textOn(player.color)}
  style:font-size="{Math.round(size * (small ? 0.4 : 0.42))}px"
  aria-hidden="true"
>
  {#if src}<img {src} alt="" draggable="false" />{:else}{letters}{/if}
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
  .av.small {
    font-family: system-ui, 'Segoe UI', Roboto, sans-serif;
    font-weight: 700;
    letter-spacing: 0.02em;
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
