<!--
  The slide editor's badge (🤫 CARD 1 · ONLY WHO YOU SEND IT TO SEES IT, ANSWER…) at the slide's top-left, drawn inside
  the stage between the slide and the edit layer: the selection's frames and handles go over it, never under it. It keeps
  its screen size whatever the stage's scale, and goes see-through while something is selected.
-->
<script lang="ts">
  import { getContext } from 'svelte';

  let { text, dim = false }: { text: string; dim?: boolean } = $props();
  const stage = getContext<{ scale: number } | undefined>('stage');
  const inv = $derived(1 / (stage?.scale || 1));
</script>

<div class="ribbon" class:dim style:top="{8 * inv}px" style:left="{8 * inv}px" style:scale={inv}>{text}</div>

<style>
  .ribbon {
    position: absolute;
    /* Over the slide's items, under the edit layer (z-index 1000). */
    z-index: 999;
    transform-origin: 0 0;
    padding: 2px 10px;
    border-radius: 4px;
    background: var(--warn);
    color: #000;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.1em;
    white-space: nowrap;
    pointer-events: none;
  }
  .dim {
    opacity: 0.85;
  }
</style>
