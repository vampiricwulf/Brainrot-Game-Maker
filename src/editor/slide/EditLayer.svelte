<!--
  Interaction layer drawn over a slide in the editor: select, move (with snapping guides),
  resize (rotation-aware) and rotate elements. Works in 1920×1080 stage coordinates.
-->
<script lang="ts">
  import { getContext } from 'svelte';
  import { SLIDE_H, SLIDE_W, type Slide, type SlideElement } from '../../lib/model';

  let {
    slide,
    selected = $bindable(),
    onchange,
    ondblclick,
  }: {
    slide: Slide;
    selected: string[];
    /** Called when a drag/resize/rotate finishes (for undo history). */
    onchange: () => void;
    ondblclick?: (el: SlideElement) => void;
  } = $props();

  const stage = getContext<{ scale: number }>('stage');
  const sorted = $derived([...slide.elements].sort((a, b) => a.zIndex - b.zIndex));
  const sel = $derived(slide.elements.filter((e) => selected.includes(e.id)));
  const single = $derived(sel.length === 1 ? sel[0] : null);

  const SNAP = 10;
  let guides = $state<{ x: number[]; y: number[] }>({ x: [], y: [] });

  type Drag =
    | { kind: 'move'; sx: number; sy: number; orig: Map<string, { x: number; y: number }>; moved: boolean }
    | { kind: 'resize'; sx: number; sy: number; hx: number; hy: number; o: { x: number; y: number; w: number; h: number }; keep: boolean }
    | { kind: 'rotate'; cx: number; cy: number };
  let drag: Drag | null = null;

  function toStage(e: PointerEvent, layer: HTMLElement): { x: number; y: number } {
    const r = layer.getBoundingClientRect();
    const s = stage.scale || 1;
    return { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s };
  }

  let layerEl: HTMLDivElement;

  function down(e: PointerEvent, el: SlideElement | null): void {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (!el) {
      selected = [];
      return;
    }
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      selected = selected.includes(el.id) ? selected.filter((x) => x !== el.id) : [...selected, el.id];
    } else if (!selected.includes(el.id)) {
      selected = [el.id];
    }
    const movable = slide.elements.filter((x) => selected.includes(x.id) && !x.locked);
    if (!movable.length) return;
    const p = toStage(e, layerEl);
    drag = { kind: 'move', sx: p.x, sy: p.y, orig: new Map(movable.map((m) => [m.id, { x: m.x, y: m.y }])), moved: false };
    layerEl.setPointerCapture(e.pointerId);
  }

  function handleDown(e: PointerEvent, hx: number, hy: number): void {
    if (!single || single.locked) return;
    e.stopPropagation();
    const p = toStage(e, layerEl);
    const keepByDefault = single.kind === 'image' || single.kind === 'video' || (single.kind === 'embed' && single.embedKind !== 'remoteAudio');
    drag = { kind: 'resize', sx: p.x, sy: p.y, hx, hy, o: { x: single.x, y: single.y, w: single.w, h: single.h }, keep: keepByDefault };
    layerEl.setPointerCapture(e.pointerId);
  }

  function rotateDown(e: PointerEvent): void {
    if (!single || single.locked) return;
    e.stopPropagation();
    drag = { kind: 'rotate', cx: single.x + single.w / 2, cy: single.y + single.h / 2 };
    layerEl.setPointerCapture(e.pointerId);
  }

  /** Snap a box's edges/center to the slide and other elements; returns the offset to apply. */
  function snap(box: { x: number; y: number; w: number; h: number }, ignore: Set<string>): { dx: number; dy: number } {
    const xs = [0, SLIDE_W / 2, SLIDE_W];
    const ys = [0, SLIDE_H / 2, SLIDE_H];
    for (const o of slide.elements) {
      if (ignore.has(o.id)) continue;
      xs.push(o.x, o.x + o.w / 2, o.x + o.w);
      ys.push(o.y, o.y + o.h / 2, o.y + o.h);
    }
    const best = (vals: number[], targets: number[]) => {
      let bd = SNAP + 1;
      let off = 0;
      let at: number[] = [];
      for (const v of vals)
        for (const t of targets) {
          const d = Math.abs(t - v);
          if (d < bd - 0.01) {
            bd = d;
            off = t - v;
            at = [t];
          } else if (Math.abs(d - bd) < 0.01 && !at.includes(t)) at.push(t);
        }
      return bd <= SNAP ? { off, at } : { off: 0, at: [] };
    };
    const bx = best([box.x, box.x + box.w / 2, box.x + box.w], xs);
    const by = best([box.y, box.y + box.h / 2, box.y + box.h], ys);
    guides = { x: bx.at, y: by.at };
    return { dx: bx.off, dy: by.off };
  }

  function move(e: PointerEvent): void {
    if (!drag) return;
    const p = toStage(e, layerEl);
    if (drag.kind === 'move') {
      let dx = p.x - drag.sx;
      let dy = p.y - drag.sy;
      if (!drag.moved && Math.hypot(dx, dy) < 2) return;
      drag.moved = true;
      const orig = drag.orig;
      const ids = new Set(orig.keys());
      const moving = slide.elements.filter((x) => ids.has(x.id));
      if (!e.altKey && moving.length) {
        // Snap the moving group's bounding box (hold Alt to move freely).
        const minX = Math.min(...moving.map((m) => orig.get(m.id)!.x)) + dx;
        const minY = Math.min(...moving.map((m) => orig.get(m.id)!.y)) + dy;
        const maxX = Math.max(...moving.map((m) => orig.get(m.id)!.x + m.w)) + dx;
        const maxY = Math.max(...moving.map((m) => orig.get(m.id)!.y + m.h)) + dy;
        const s = snap({ x: minX, y: minY, w: maxX - minX, h: maxY - minY }, ids);
        dx += s.dx;
        dy += s.dy;
      } else guides = { x: [], y: [] };
      for (const m of moving) {
        const o = orig.get(m.id)!;
        m.x = Math.round(o.x + dx);
        m.y = Math.round(o.y + dy);
      }
    } else if (drag.kind === 'resize' && single) {
      const { o, hx, hy } = drag;
      const th = (single.rotation * Math.PI) / 180;
      const gx = p.x - drag.sx;
      const gy = p.y - drag.sy;
      // Delta in the element's own (unrotated) axes.
      const lx = gx * Math.cos(th) + gy * Math.sin(th);
      const ly = -gx * Math.sin(th) + gy * Math.cos(th);
      let w = Math.max(20, o.w + hx * lx);
      let h = Math.max(20, o.h + hy * ly);
      const keep = hx !== 0 && hy !== 0 && drag.keep !== e.shiftKey;
      if (keep) {
        const ratio = o.w / o.h;
        if (w / h > ratio) h = w / ratio;
        else w = h * ratio;
      }
      // Keep the opposite edge fixed: the center moves by half the growth, rotated back to slide axes.
      const gw = (hx * (w - o.w)) / 2;
      const gh = (hy * (h - o.h)) / 2;
      const cx0 = o.x + o.w / 2 + gw * Math.cos(th) - gh * Math.sin(th);
      const cy0 = o.y + o.h / 2 + gw * Math.sin(th) + gh * Math.cos(th);
      single.w = Math.round(w);
      single.h = Math.round(h);
      single.x = Math.round(cx0 - w / 2);
      single.y = Math.round(cy0 - h / 2);
    } else if (drag.kind === 'rotate' && single) {
      let a = (Math.atan2(p.y - drag.cy, p.x - drag.cx) * 180) / Math.PI + 90;
      if (e.shiftKey) a = Math.round(a / 15) * 15;
      a = ((Math.round(a) % 360) + 360) % 360;
      single.rotation = a > 180 ? a - 360 : a;
    }
  }

  function up(): void {
    if (drag && (drag.kind !== 'move' || drag.moved)) onchange();
    drag = null;
    guides = { x: [], y: [] };
  }

  const HANDLES: [number, number][] = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1],
  ];
  const cursor = (hx: number, hy: number) => (hx === 0 ? 'ns-resize' : hy === 0 ? 'ew-resize' : hx === hy ? 'nwse-resize' : 'nesw-resize');
  const inv = $derived(1 / (stage.scale || 1));
</script>

<div
  class="layer"
  bind:this={layerEl}
  onpointerdown={(e) => down(e, null)}
  onpointermove={move}
  onpointerup={up}
  onpointercancel={up}
  role="presentation"
>
  {#each sorted as el (el.id)}
    <div
      class="hit"
      class:locked={el.locked}
      style:left="{el.x}px"
      style:top="{el.y}px"
      style:width="{el.w}px"
      style:height="{el.h}px"
      style:transform="rotate({el.rotation}deg)"
      style:z-index={el.zIndex}
      onpointerdown={(e) => down(e, el)}
      ondblclick={() => ondblclick?.(el)}
      role="presentation"
    ></div>
  {/each}

  {#each sel as el (el.id)}
    <div
      class="frame"
      class:multi={!single}
      style:left="{el.x}px"
      style:top="{el.y}px"
      style:width="{el.w}px"
      style:height="{el.h}px"
      style:transform="rotate({el.rotation}deg)"
      style:--inv={inv}
    >
      {#if single && !el.locked}
        {#each HANDLES as [hx, hy]}
          <div
            class="handle"
            style:left="{((hx + 1) / 2) * 100}%"
            style:top="{((hy + 1) / 2) * 100}%"
            style:cursor={cursor(hx, hy)}
            onpointerdown={(e) => handleDown(e, hx, hy)}
            role="presentation"
          ></div>
        {/each}
        <div class="rot-stem"></div>
        <div class="rot" onpointerdown={rotateDown} role="presentation" title="Rotate (Shift snaps to 15°)"></div>
      {/if}
      {#if el.locked}<div class="lock">🔒</div>{/if}
    </div>
  {/each}

  {#each guides.x as x}<div class="guide v" style:left="{x}px" style:--inv={inv}></div>{/each}
  {#each guides.y as y}<div class="guide h" style:top="{y}px" style:--inv={inv}></div>{/each}
</div>

<style>
  .layer {
    position: absolute;
    inset: 0;
    z-index: 1000;
    touch-action: none;
  }
  .hit {
    position: absolute;
    cursor: move;
  }
  .hit:hover {
    outline: calc(2px * var(--inv, 1)) dashed rgba(79, 124, 255, 0.7);
  }
  .hit.locked {
    cursor: default;
  }
  .frame {
    position: absolute;
    pointer-events: none;
    outline: calc(3px * var(--inv)) solid #4f7cff;
  }
  .frame.multi {
    outline-style: dashed;
  }
  .handle {
    position: absolute;
    width: calc(14px * var(--inv));
    height: calc(14px * var(--inv));
    translate: -50% -50%;
    background: #fff;
    border: calc(2px * var(--inv)) solid #4f7cff;
    border-radius: 2px;
    pointer-events: auto;
  }
  .rot-stem {
    position: absolute;
    left: 50%;
    top: calc(-36px * var(--inv));
    height: calc(36px * var(--inv));
    width: calc(2px * var(--inv));
    background: #4f7cff;
  }
  .rot {
    position: absolute;
    left: 50%;
    top: calc(-44px * var(--inv));
    width: calc(16px * var(--inv));
    height: calc(16px * var(--inv));
    translate: -50% -50%;
    border-radius: 50%;
    background: #4f7cff;
    border: calc(2px * var(--inv)) solid #fff;
    cursor: grab;
    pointer-events: auto;
  }
  .lock {
    position: absolute;
    right: 0;
    top: 0;
    font-size: calc(22px * var(--inv));
  }
  .guide {
    position: absolute;
    pointer-events: none;
    background: #ff3dcb;
  }
  .guide.v {
    top: 0;
    bottom: 0;
    width: calc(2px * var(--inv));
  }
  .guide.h {
    left: 0;
    right: 0;
    height: calc(2px * var(--inv));
  }
</style>
