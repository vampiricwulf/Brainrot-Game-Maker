<!-- Freehand drawing on the slide editor's canvas: one stroke becomes a 'path' shape (Shift closes it into a filled shape). -->
<script lang="ts">
  import { getContext } from 'svelte';
  import { SLIDE_H, SLIDE_W } from '../../lib/model';

  let { ondone, oncancel }: { ondone: (points: [number, number][], closed: boolean) => void; oncancel: () => void } = $props();
  const stage = getContext<{ scale: number }>('stage');
  let layer = $state<HTMLDivElement>();
  let points = $state<[number, number][]>([]);
  let down = false;

  function at(e: PointerEvent): [number, number] {
    const r = layer!.getBoundingClientRect();
    const s = stage.scale || 1;
    return [Math.round((e.clientX - r.left) / s), Math.round((e.clientY - r.top) / s)];
  }

  function start(e: PointerEvent): void {
    if (e.button !== 0) return;
    e.preventDefault();
    layer?.setPointerCapture(e.pointerId);
    down = true;
    points = [at(e)];
  }

  function move(e: PointerEvent): void {
    if (!down) return;
    const p = at(e);
    const last = points[points.length - 1];
    // Skip points closer than a few pixels: smaller files, smoother lines.
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) >= 4) points = [...points, p];
  }

  function end(e: PointerEvent): void {
    if (!down) return;
    down = false;
    if (points.length > 1) ondone(points, e.shiftKey);
    points = [];
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (e.stopPropagation(), oncancel())} />

<div
  class="draw"
  bind:this={layer}
  role="application"
  aria-label="Drawing: drag to draw a line (hold Shift when letting go to close it into a shape). Esc stops drawing."
  onpointerdown={start}
  onpointermove={move}
  onpointerup={end}
  onpointercancel={() => ((down = false), (points = []))}
>
  <svg width={SLIDE_W} height={SLIDE_H}>
    {#if points.length > 1}
      <polyline points={points.map((p) => p.join(',')).join(' ')} fill="none" stroke="#ffcc00" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" />
    {/if}
  </svg>
</div>

<style>
  .draw {
    position: absolute;
    inset: 0;
    cursor: crosshair;
    z-index: 100000;
    touch-action: none;
  }
  svg {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
</style>
