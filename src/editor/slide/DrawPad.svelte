<!--
  A drawpad: draw a whole object from as many strokes as it takes (pen, filled shapes, eraser, any color and size,
  undo/redo, clear), over the screen it goes on, then insert it as one picture where it was drawn.
-->
<script lang="ts">
  import { modal } from '../../lib/modal';
  import { onMount, type Snippet } from 'svelte';
  import { SLIDE_H, SLIDE_W } from '../../lib/model';
  import InlineAsk from '../../play/host/InlineAsk.svelte';

  type Tool = 'pen' | 'fill' | 'erase';
  interface Stroke {
    tool: Tool;
    color: string;
    size: number;
    points: [number, number][];
  }

  let {
    title = 'Drawpad',
    backdrop,
    oninsert,
    oncancel,
  }: {
    title?: string;
    /** What's under the drawing (the screen it goes on), shown faded for reference. */
    backdrop?: Snippet;
    /** The drawing, cropped to what was drawn, and where that is on the 1920×1080 slide. */
    oninsert: (png: Blob, box: { x: number; y: number; w: number; h: number }) => void;
    oncancel: () => void;
  } = $props();

  const COLORS = ['#000000', '#ffffff', '#e6194b', '#f58231', '#ffe119', '#3cb44b', '#42d4f4', '#4363d8', '#911eb4', '#f032e6', '#8b5a2b', '#808080'];
  let tool = $state<Tool>('pen');
  let color = $state('#e6194b');
  let size = $state(14);
  let strokes = $state<Stroke[]>([]);
  let redoList = $state<Stroke[]>([]);
  let current: Stroke | null = null;
  let canvas = $state<HTMLCanvasElement>();
  let busy = $state(false);
  /** Cancel was pressed with something drawn: the pad asks first, right in it (in play, a browser dialog shows on stream). */
  let discarding = $state(false);

  function at(e: PointerEvent): [number, number] {
    const r = canvas!.getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) / r.width) * SLIDE_W), Math.round(((e.clientY - r.top) / r.height) * SLIDE_H)];
  }

  function paint(ctx: CanvasRenderingContext2D, list: Stroke[]): void {
    ctx.clearRect(0, 0, SLIDE_W, SLIDE_H);
    for (const s of list) {
      if (!s.points.length) continue;
      ctx.globalCompositeOperation = s.tool === 'erase' ? 'destination-out' : 'source-over';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = s.size;
      ctx.strokeStyle = s.color;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      const [x0, y0] = s.points[0];
      ctx.moveTo(x0, y0);
      if (s.points.length === 1) ctx.lineTo(x0 + 0.1, y0);
      for (const [x, y] of s.points.slice(1)) ctx.lineTo(x, y);
      if (s.tool === 'fill') {
        ctx.closePath();
        ctx.fill();
      }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function redraw(): void {
    const ctx = canvas?.getContext('2d');
    if (ctx) paint(ctx, current ? [...strokes, current] : strokes);
  }
  onMount(redraw);
  $effect(() => {
    void strokes.length;
    redraw();
  });

  function down(e: PointerEvent): void {
    if (e.button !== 0) return;
    e.preventDefault();
    try {
      canvas?.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic pointers can't be captured; drawing still works over the pad.
    }
    current = { tool, color, size, points: [at(e)] };
    redraw();
  }
  function move(e: PointerEvent): void {
    if (!current) return;
    const p = at(e);
    const last = current.points[current.points.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 2) return;
    current.points.push(p);
    redraw();
  }
  function up(): void {
    if (!current) return;
    strokes = [...strokes, current];
    redoList = [];
    current = null;
  }

  function undo(): void {
    const s = strokes.at(-1);
    if (!s) return;
    strokes = strokes.slice(0, -1);
    redoList = [...redoList, s];
  }
  function redo(): void {
    const s = redoList.at(-1);
    if (!s) return;
    redoList = redoList.slice(0, -1);
    strokes = [...strokes, s];
  }

  /** The drawn part (erased pixels don't count), cropped with a little room. */
  function contentBox(ctx: CanvasRenderingContext2D): { x: number; y: number; w: number; h: number } | null {
    const data = ctx.getImageData(0, 0, SLIDE_W, SLIDE_H).data;
    let x0 = SLIDE_W, y0 = SLIDE_H, x1 = -1, y1 = -1;
    // Every other pixel is plenty to find the edges.
    for (let y = 0; y < SLIDE_H; y += 2)
      for (let x = 0; x < SLIDE_W; x += 2)
        if (data[(y * SLIDE_W + x) * 4 + 3] > 8) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
    if (x1 < 0) return null;
    const pad = 4;
    const x = Math.max(0, x0 - pad);
    const y = Math.max(0, y0 - pad);
    return { x, y, w: Math.min(SLIDE_W, x1 + pad + 2) - x, h: Math.min(SLIDE_H, y1 + pad + 2) - y };
  }

  async function insert(): Promise<void> {
    const ctx = canvas?.getContext('2d', { willReadFrequently: true });
    if (!ctx || !canvas) return;
    paint(ctx, strokes);
    const box = contentBox(ctx);
    if (!box) return;
    busy = true;
    const out = document.createElement('canvas');
    out.width = box.w;
    out.height = box.h;
    out.getContext('2d')!.drawImage(canvas, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
    const png = await new Promise<Blob | null>((res) => out.toBlob(res, 'image/png'));
    busy = false;
    if (png) oninsert(png, box);
  }

  /** Cancel (Esc, the Cancel button): ask before throwing a drawing away. */
  function cancel(): void {
    if (strokes.length) discarding = true;
    else oncancel();
  }

  function key(e: KeyboardEvent): void {
    // Ctrl+S: not the browser's "Save page as" (the editor says to finish the drawing first).
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') return e.preventDefault();
    const typing = (e.target as HTMLElement).closest?.('input, textarea, select');
    // The pad has its own keys: nothing reaches the game underneath.
    e.stopImmediatePropagation();
    // Esc while it asks is "keep drawing".
    if (e.key === 'Escape') return discarding ? void (discarding = false) : cancel();
    if (typing) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    } else if ((e.ctrlKey || e.metaKey) && k === 'y') {
      e.preventDefault();
      redo();
    } else if (k === 'b' || k === 'p') tool = 'pen';
    else if (k === 'f') tool = 'fill';
    else if (k === 'e') tool = 'erase';
  }
</script>

<svelte:window onkeydowncapture={key} />

<div class="backdrop-modal" role="presentation">
  <div class="modal" role="dialog" aria-modal="true" aria-label={title} use:modal>
    <div class="row head">
      <b class="modal-title">🖌 {title}</b>
      {#if discarding}
        <InlineAsk text="Throw away this drawing?" ok="Throw away" cancel="Keep drawing" danger onok={oncancel} oncancel={() => (discarding = false)} />
      {:else}
        <span class="muted small">Draw the whole thing, as many strokes as it takes, then Insert.</span>
      {/if}
      <span class="spacer"></span>
      <button class="ghost" onclick={cancel} title="Esc">Cancel</button>
      <button class="primary" onclick={insert} disabled={!strokes.length || busy}>Insert drawing</button>
      <button class="ghost modal-x" onclick={cancel} aria-label="Close" title="Close (Esc)">✕</button>
    </div>
    <div class="row tools" role="toolbar" aria-label="Drawing tools">
      <button class:on={tool === 'pen'} aria-pressed={tool === 'pen'} onclick={() => (tool = 'pen')} title="Pen (B)">✏ Pen</button>
      <button class:on={tool === 'fill'} aria-pressed={tool === 'fill'} onclick={() => (tool = 'fill')} title="Filled shape: draw its outline (F)">⬟ Filled shape</button>
      <button class:on={tool === 'erase'} aria-pressed={tool === 'erase'} onclick={() => (tool = 'erase')} title="Eraser (E)">🧽 Eraser</button>
      <span class="sep"></span>
      {#each COLORS as c (c)}
        <button class="swatch" class:on={color === c} aria-pressed={color === c} style:background={c} onclick={() => (color = c)} aria-label="Color {c}"></button>
      {/each}
      <input type="color" bind:value={color} aria-label="Pen color" />
      <span class="sep"></span>
      <label class="small">Size <input type="range" min="2" max="80" bind:value={size} aria-label="Brush size" /> {size}</label>
      <span class="sep"></span>
      <button onclick={undo} disabled={!strokes.length} title="Ctrl+Z">↶ Undo</button>
      <button onclick={redo} disabled={!redoList.length} title="Ctrl+Shift+Z">↷ Redo</button>
      <button class="ghost" onclick={() => ((redoList = []), (strokes = []))} disabled={!strokes.length}>Clear</button>
    </div>
    <div class="pad-wrap">
      <div class="pad">
        {#if backdrop}<div class="ref" aria-hidden="true">{@render backdrop()}</div>{/if}
        <canvas
          bind:this={canvas}
          width={SLIDE_W}
          height={SLIDE_H}
          class:erasing={tool === 'erase'}
          onpointerdown={down}
          onpointermove={move}
          onpointerup={up}
          onpointercancel={up}
          aria-label="Drawing area"
        ></canvas>
      </div>
    </div>
  </div>
</div>

<style>
  .backdrop-modal {
    position: fixed;
    inset: 0;
    z-index: 160;
    background: rgba(0, 0, 0, 0.6);
    display: grid;
    /* A viewport-sized track so the modal's max-height: 100% resolves against the window. */
    grid-template-rows: minmax(0, 1fr);
    grid-template-columns: minmax(0, 1fr);
    place-items: center;
    padding: 16px;
  }
  .modal {
    width: min(1400px, 100%);
    max-height: 100%;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
  }
  .row {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
  }
  .tools .on {
    border-color: var(--accent);
    background: rgba(79, 124, 255, 0.25);
  }
  .swatch {
    width: 22px;
    height: 22px;
    padding: 0;
    border-radius: 50%;
    border: 2px solid var(--border);
  }
  .swatch.on {
    outline: 3px solid var(--accent);
    outline-offset: 1px;
  }
  .sep {
    width: 1px;
    align-self: stretch;
    background: var(--border);
  }
  .pad-wrap {
    min-height: 0;
    overflow: auto;
  }
  .pad {
    position: relative;
    /* As big as fits both ways: the window's height less the rows above it. */
    width: min(100%, calc((100dvh - 150px) * 16 / 9));
    margin-inline: auto;
    aspect-ratio: 16 / 9;
    border-radius: 6px;
    overflow: hidden;
    /* A checkerboard shows what's see-through. */
    background: repeating-conic-gradient(#3a3a3a 0% 25%, #2c2c2c 0% 50%) 0 0 / 24px 24px;
  }
  .ref {
    position: absolute;
    inset: 0;
    opacity: 0.45;
    pointer-events: none;
  }
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    cursor: crosshair;
    touch-action: none;
  }
  canvas.erasing {
    cursor: cell;
  }
  .small {
    font-size: 12px;
  }
</style>
