<!--
  Free-placed images on the board screen (Round.decor), in 1920×1080 stage coordinates. SlideView draws
  them (so edited images and entrance animations work as on slides); invisible boxes on top swallow clicks
  for images that aren't click-through.
-->
<script lang="ts">
  import type { BoardDecor } from '../lib/model';
  import SlideView from '../lib/slide/SlideView.svelte';

  let { items }: { items: BoardDecor[] } = $props();
  const slide = $derived({ background: {}, elements: items });
</script>

<div class="decor">
  <SlideView {slide} fallbackBg="transparent" />
  {#each items as d (d.id)}
    {#if !d.clickThrough}
      <div
        class="block"
        style:left="{d.x}px"
        style:top="{d.y}px"
        style:width="{d.w}px"
        style:height="{d.h}px"
        style:transform="rotate({d.rotation}deg)"
      ></div>
    {/if}
  {/each}
</div>

<style>
  .decor {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .decor > :global(.slide) {
    pointer-events: none;
  }
  .block {
    position: absolute;
    pointer-events: auto;
  }
</style>
