<!-- A fixed 1920×1080 logical canvas, scaled and letterboxed to fit its container. -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { SLIDE_H, SLIDE_W } from './model';

  let { children, background = '#000' }: { children: Snippet; background?: string } = $props();
  let w = $state(0);
  let h = $state(0);
  const scale = $derived(Math.min(w / SLIDE_W, h / SLIDE_H) || 0);
</script>

<div class="frame" bind:clientWidth={w} bind:clientHeight={h}>
  <div
    class="stage"
    style:width="{SLIDE_W}px"
    style:height="{SLIDE_H}px"
    style:background
    style:transform="translate(-50%, -50%) scale({scale})"
  >
    {@render children()}
  </div>
</div>

<style>
  .frame {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #000;
  }
  .stage {
    position: absolute;
    left: 50%;
    top: 50%;
    transform-origin: center;
    overflow: hidden;
  }
</style>
