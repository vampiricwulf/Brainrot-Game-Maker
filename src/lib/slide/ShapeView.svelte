<script lang="ts">
  import type { ShapeEl } from '../model';

  let { el }: { el: ShapeEl } = $props();
  const markerId = $derived(`arrow-${el.id}`);
  /** Points are fractions of the box; the SVG's viewBox is 1000×1000. */
  const pathD = (pts: [number, number][], closed?: boolean) =>
    pts.map(([x, y], i) => `${i ? 'L' : 'M'}${(x * 1000).toFixed(1)} ${(y * 1000).toFixed(1)}`).join(' ') + (closed && pts.length > 2 ? ' Z' : '');
</script>

{#if el.hotspot}
  <!-- A hotspot has no look of its own (the host's view outlines it). -->
{:else if el.shape === 'path'}
  <svg width="100%" height="100%" viewBox="0 0 1000 1000" preserveAspectRatio="none">
    <path
      d={pathD(el.points ?? [], el.closed)}
      fill={el.closed ? el.fill : 'none'}
      stroke={el.stroke}
      stroke-width={el.strokeWidth}
      stroke-linecap="round"
      stroke-linejoin="round"
      vector-effect="non-scaling-stroke"
    />
  </svg>
{:else if el.shape === 'line' || el.shape === 'arrow'}
  <svg width="100%" height="100%" viewBox="0 0 {el.w} {el.h}" preserveAspectRatio="none">
    {#if el.shape === 'arrow'}
      <defs>
        <marker id={markerId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill={el.stroke} />
        </marker>
      </defs>
    {/if}
    <line
      x1={el.strokeWidth}
      y1={el.h / 2}
      x2={el.w - (el.shape === 'arrow' ? el.strokeWidth * 3 : el.strokeWidth)}
      y2={el.h / 2}
      stroke={el.stroke}
      stroke-width={el.strokeWidth}
      stroke-linecap="round"
      marker-end={el.shape === 'arrow' ? `url(#${markerId})` : undefined}
    />
  </svg>
{:else}
  <div
    class="shape"
    style:background={el.fill}
    style:border="{el.strokeWidth}px solid {el.stroke}"
    style:border-radius={el.shape === 'ellipse' ? '50%' : `${el.radius}px`}
  ></div>
{/if}

<style>
  svg {
    display: block;
    overflow: visible;
  }
  .shape {
    width: 100%;
    height: 100%;
    box-sizing: border-box;
  }
</style>
