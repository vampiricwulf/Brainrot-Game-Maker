<!--
  ✎ Edit's crop box (card-files spec §4.11.3), laid over the video's picture: what's cut off shaded, the part kept in a
  box with 8 handles (drag the box to move it, a handle to resize it, keeping `aspect` when one is picked). Arrow keys
  move it once it has the focus (Shift: further). Fractions of the picture as shown. `still`: the shade only, no
  handles (the crop as it stands while the trim is worked on). As ImageEditor's crop, which isn't touched.
-->
<script lang="ts">
  import { aspectCrop, type Box } from '../lib/editing';

  let {
    crop,
    aspect,
    ratio,
    still = false,
    onbegin,
    onchange,
  }: {
    crop: Box;
    /** Width ÷ height the box keeps ('free': any). */
    aspect: 'free' | number;
    /** The picture's own width ÷ height (as shown). */
    ratio: number;
    still?: boolean;
    /** A drag or a key starts changing it (an undo step). */
    onbegin?: () => void;
    onchange: (c: Box) => void;
  } = $props();

  let host = $state<HTMLDivElement>();
  let drag: { mode: string; sx: number; sy: number; o: Box } | null = null;
  const MIN = 0.02;

  function frac(e: PointerEvent): { x: number; y: number } {
    const r = host!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / Math.max(1, r.width), y: (e.clientY - r.top) / Math.max(1, r.height) };
  }
  function down(e: PointerEvent, mode: string): void {
    if (still || e.button !== 0 || !host) return;
    e.stopPropagation();
    e.preventDefault();
    host.setPointerCapture(e.pointerId);
    const p = frac(e);
    onbegin?.();
    drag = { mode, sx: p.x, sy: p.y, o: { ...crop } };
  }
  function move(e: PointerEvent): void {
    if (!drag) return;
    const p = frac(e);
    const { o, mode } = drag;
    const dx = p.x - drag.sx;
    const dy = p.y - drag.sy;
    if (mode === 'move') return onchange({ ...o, x: Math.min(1 - o.w, Math.max(0, o.x + dx)), y: Math.min(1 - o.h, Math.max(0, o.y + dy)) });
    // (A shape kept: in fractions of the picture, height = width × its own ratio ÷ the shape's.)
    if (aspect !== 'free') return onchange(aspectCrop(mode, o, dx, dy, ratio / aspect));
    let x1 = o.x;
    let y1 = o.y;
    let x2 = o.x + o.w;
    let y2 = o.y + o.h;
    if (mode.includes('w')) x1 = Math.min(x2 - MIN, Math.max(0, o.x + dx));
    if (mode.includes('e')) x2 = Math.max(x1 + MIN, Math.min(1, o.x + o.w + dx));
    if (mode.includes('n')) y1 = Math.min(y2 - MIN, Math.max(0, o.y + dy));
    if (mode.includes('s')) y2 = Math.max(y1 + MIN, Math.min(1, o.y + o.h + dy));
    onchange({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
  }
  function key(e: KeyboardEvent): void {
    const step = e.shiftKey ? 0.1 : 0.01;
    const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (still || !(e.key in d) || e.altKey) return;
    e.preventDefault();
    e.stopPropagation();
    onbegin?.();
    const [dx, dy] = d[e.key];
    onchange({ ...crop, x: Math.min(1 - crop.w, Math.max(0, crop.x + dx)), y: Math.min(1 - crop.h, Math.max(0, crop.y + dy)) });
  }
  const c = $derived(crop);
</script>

<div class="cropbox" class:still bind:this={host} onpointermove={move} onpointerup={() => (drag = null)} onpointercancel={() => (drag = null)} role="presentation">
  <div
    class="shade"
    style:clip-path="polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 {c.y * 100}%, {c.x * 100}% {c.y * 100}%, {c.x * 100}% {(c.y + c.h) * 100}%, {(c.x + c.w) * 100}% {(c.y + c.h) * 100}%, {(c.x + c.w) * 100}% {c.y * 100}%, 0 {c.y * 100}%)"
  ></div>
  {#if !still}
    <!-- (A button, so the keyboard can move it too.) -->
    <button
      type="button"
      class="crop"
      style:left="{c.x * 100}%"
      style:top="{c.y * 100}%"
      style:width="{c.w * 100}%"
      style:height="{c.h * 100}%"
      onpointerdown={(e) => down(e, 'move')}
      onkeydown={key}
      aria-label="The part of the picture kept: drag it, or its handles (arrow keys move it)"
      data-crop-box
    >
      {#each ['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'] as m (m)}
        <span class="ch {m}" onpointerdown={(e) => down(e, m)} role="presentation" data-crop-handle={m}></span>
      {/each}
    </button>
  {/if}
</div>

<style>
  .cropbox {
    position: absolute;
    inset: 0;
    touch-action: none;
  }
  .cropbox.still {
    pointer-events: none;
  }
  .shade {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    pointer-events: none;
  }
  .crop {
    position: absolute;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    outline: 2px solid #fff;
    box-shadow: 0 0 0 1px #000;
    cursor: move;
  }
  .crop:focus-visible {
    outline: 3px solid var(--accent);
  }
  .ch {
    position: absolute;
    display: block;
    width: 14px;
    height: 14px;
    background: #fff;
    border: 2px solid var(--accent);
    translate: -50% -50%;
    box-sizing: border-box;
  }
  .ch.nw { left: 0; top: 0; cursor: nwse-resize; }
  .ch.ne { left: 100%; top: 0; cursor: nesw-resize; }
  .ch.sw { left: 0; top: 100%; cursor: nesw-resize; }
  .ch.se { left: 100%; top: 100%; cursor: nwse-resize; }
  .ch.n { left: 50%; top: 0; cursor: ns-resize; }
  .ch.s { left: 50%; top: 100%; cursor: ns-resize; }
  .ch.e { left: 100%; top: 50%; cursor: ew-resize; }
  .ch.w { left: 0; top: 50%; cursor: ew-resize; }
</style>
