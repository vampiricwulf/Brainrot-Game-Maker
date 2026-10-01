<!--
  Interaction layer drawn over a slide in the editor: select, move (with snapping guides),
  resize (rotation-aware) and rotate elements. Works in 1920×1080 stage coordinates.
  Double-click an element to edit it. Drag on an empty spot to select with a box (a text box's empty area counts,
  away from its letters, until it's selected; Alt+drag always draws a box); Alt+click walks down through stacked
  items; right-click opens a menu of everything under the pointer. Locked items let clicks through to what's under them.
-->
<script lang="ts">
  import { getContext } from 'svelte';
  import { knobPlacement } from '../../lib/editing';
  import { bounds, elementsAt, nextBelow, nearestSnap, touchedBy, type Pt } from '../../lib/layers';
  import { SLIDE_H, SLIDE_W, type Slide, type SlideElement } from '../../lib/model';

  let {
    slide,
    selected = $bindable(),
    hidden = [],
    hovered = $bindable(null),
    onstart,
    onchange,
    ondblclick,
    onmenu,
  }: {
    slide: Slide;
    selected: string[];
    /** Items hidden while editing (not drawn, can't be clicked). */
    hidden?: string[];
    /** Item under the mouse, shared with the layers list so each outlines what the other points at. */
    hovered?: string | null;
    /** Called when a drag/resize/rotate starts (the undo history holds its changes until it ends). */
    onstart?: () => void;
    /** Called when a drag/resize/rotate finishes (for undo history). */
    onchange: () => void;
    ondblclick?: (el: SlideElement) => void;
    /** Right-click: everything under the pointer (top-most first), at viewport position x/y. */
    /** Right-click: where (in the window, and on the slide) and what's under the pointer. */
    onmenu?: (m: { x: number; y: number; at: Pt; stack: SlideElement[] }) => void;
  } = $props();

  const stage = getContext<{ scale: number }>('stage');
  const visible = $derived(hidden.length ? slide.elements.filter((e) => !hidden.includes(e.id)) : slide.elements);
  const sorted = $derived([...visible].sort((a, b) => a.zIndex - b.zIndex));
  const sel = $derived(visible.filter((e) => selected.includes(e.id)));
  const single = $derived(sel.length === 1 ? sel[0] : null);
  // Selection frames and their handles sit above every element's hit box, so a handle drawn over
  // the element (the rotate knob inside a full-bleed image, the inner half of a resize handle) can be grabbed.
  const frameZ = $derived(Math.max(0, ...slide.elements.map((e) => e.zIndex)) + 1);

  /** Snapping reaches this far on screen (px), however big the slide is drawn. */
  const SNAP_PX = 6;
  const snapDist = () => SNAP_PX / (stage.scale || 1);
  let guides = $state<{ x: number[]; y: number[] }>({ x: [], y: [] });

  type Drag =
    | { kind: 'move'; sx: number; sy: number; orig: Map<string, { x: number; y: number }>; moved: boolean; shiftAtDown: boolean }
    | { kind: 'resize'; sx: number; sy: number; hx: number; hy: number; o: { x: number; y: number; w: number; h: number }; keep: boolean }
    | { kind: 'rotate'; cx: number; cy: number; a0: number; r0: number }
    // `click`: what a press that doesn't drag selects (a text box pressed beside its letters); `alt`: where an
    // Alt+press was, which walks down the stack there when it doesn't drag.
    | { kind: 'marquee'; a: Pt; base: string[]; moved: boolean; click?: SlideElement; alt?: Pt; add: boolean };
  let drag: Drag | null = null;
  /** The drag-to-select box while it's being drawn. */
  let marquee = $state<{ a: Pt; b: Pt } | null>(null);

  function toStage(e: MouseEvent, layer: HTMLElement): Pt {
    const r = layer.getBoundingClientRect();
    const s = stage.scale || 1;
    return { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s };
  }

  let layerEl: HTMLDivElement;
  // Pointer capture sends click/dblclick to the layer itself, so remember what the press was on.
  let lastDown: SlideElement | null = null;

  /**
   * Every press on the canvas: no text selection and no native drag-and-drop. Without this a drag
   * could leave a text selection on the page, and the next press started the browser's own drag of it
   * (a 'no' cursor, and the move or resize stopped after a few pixels). Blocking the default also
   * stops the press from taking focus, so move it off any text field by hand as a click would: onto the canvas, when
   * it's a Tab stop (`data-keys-home`), so Tab goes on through the items from there.
   */
  function claim(e: PointerEvent): void {
    e.preventDefault();
    getSelection()?.removeAllRanges();
    const a = document.activeElement;
    if (a instanceof HTMLElement && layerEl.contains(a)) return;
    const home = layerEl.closest<HTMLElement>('[data-keys-home]');
    if (home) {
      if (a !== home) home.focus({ preventScroll: true });
    } else if (a instanceof HTMLElement && a !== document.body) a.blur();
  }

  function begin(d: Drag, e: PointerEvent): void {
    drag = d;
    onstart?.();
    layerEl.setPointerCapture(e.pointerId);
  }

  /**
   * Is the pointer on what a text box draws: its letters (or the hint shown while it's empty), with a little room
   * around them, or its background box? The rest of a big text box is "empty" for pressing and dragging.
   */
  function onDrawnText(el: SlideElement, e: PointerEvent): boolean {
    if (el.kind !== 'text' || el.background) return true;
    const inner = layerEl.parentElement?.querySelector(`[data-el="${CSS.escape(el.id)}"] .inner`);
    if (!inner) return true;
    const range = document.createRange();
    range.selectNodeContents(inner);
    const m = 10;
    return [...range.getClientRects()].some((r) => e.clientX >= r.left - m && e.clientX <= r.right + m && e.clientY >= r.top - m && e.clientY <= r.bottom + m);
  }

  /** Start a drag-to-select box at `p` (it's drawn once the pointer has moved a little). */
  function startMarquee(e: PointerEvent, p: Pt, opts: { click?: SlideElement; alt?: boolean }): void {
    const add = e.shiftKey || e.ctrlKey || e.metaKey;
    const base = add ? [...selected] : [];
    // A plain press on an empty spot clears the selection at once; one that may still be a click waits.
    if (!opts.click && !opts.alt) selected = base;
    drag = { kind: 'marquee', a: p, base, moved: false, click: opts.click, alt: opts.alt ? p : undefined, add };
    layerEl.setPointerCapture(e.pointerId);
  }

  function down(e: PointerEvent, el: SlideElement | null): void {
    if (e.button !== 0) return;
    e.stopPropagation();
    claim(e);
    const p = toStage(e, layerEl);
    // Alt: a drag always draws a selection box; a click picks the next item down the stack (in up()).
    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      lastDown = null;
      startMarquee(e, p, { alt: !e.shiftKey });
      return;
    }
    // A text box pressed away from its letters (and not selected yet) lets the press through to what's under it, or
    // starts a selection box: a full-slide question mustn't be dragged off when you meant to select.
    if (el && el.kind === 'text' && !selected.includes(el.id) && !onDrawnText(el, e)) {
      const empty = (x: SlideElement) => x.kind === 'text' && !selected.includes(x.id) && !onDrawnText(x, e);
      const under = elementsAt(visible.filter((x) => !x.locked), p).find((x) => !empty(x));
      if (!under) {
        lastDown = el;
        startMarquee(e, p, { click: el });
        return;
      }
      el = under;
    }
    lastDown = el;
    if (!el) {
      // An empty spot (or only locked items): drag out a box to select everything it touches.
      startMarquee(e, p, {});
      return;
    }
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      if (selected.includes(el.id)) {
        // Shift/Ctrl+click on a selected item only takes it out of the selection (no drag of the rest).
        selected = selected.filter((x) => x !== el.id);
        return;
      }
      selected = [...selected, el.id];
    } else if (!selected.includes(el.id)) {
      selected = [el.id];
    }
    const movable = visible.filter((x) => selected.includes(x.id) && !x.locked);
    if (!movable.length) return;
    const orig = new Map(movable.map((m) => [m.id, { x: m.x, y: m.y }]));
    begin({ kind: 'move', sx: p.x, sy: p.y, orig, moved: false, shiftAtDown: e.shiftKey }, e);
  }

  function handleDown(e: PointerEvent, hx: number, hy: number): void {
    if (!single || single.locked) return;
    e.stopPropagation();
    claim(e);
    const p = toStage(e, layerEl);
    const keepByDefault = single.kind === 'image' || single.kind === 'video' || (single.kind === 'embed' && single.embedKind !== 'remoteAudio');
    begin({ kind: 'resize', sx: p.x, sy: p.y, hx, hy, o: { x: single.x, y: single.y, w: single.w, h: single.h }, keep: keepByDefault }, e);
  }

  const angle = (p: { x: number; y: number }, cx: number, cy: number) => (Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI;

  function rotateDown(e: PointerEvent): void {
    if (!single || single.locked) return;
    e.stopPropagation();
    claim(e);
    const cx = single.x + single.w / 2;
    const cy = single.y + single.h / 2;
    // Relative to where the handle was grabbed, so it works wherever the handle is drawn.
    begin({ kind: 'rotate', cx, cy, a0: angle(toStage(e, layerEl), cx, cy), r0: single.rotation }, e);
  }

  /** What edges snap to: the slide's edges and middle, and every other item's edges and middle (as drawn, turned). */
  function targets(ignore: Set<string>): { xs: number[]; ys: number[] } {
    const xs = [0, SLIDE_W / 2, SLIDE_W];
    const ys = [0, SLIDE_H / 2, SLIDE_H];
    for (const o of visible) {
      if (ignore.has(o.id)) continue;
      const b = bounds(o);
      xs.push(b.x, b.x + b.w / 2, b.x + b.w);
      ys.push(b.y, b.y + b.h / 2, b.y + b.h);
    }
    return { xs, ys };
  }

  /** Snap a box's edges/center to the slide and other elements; returns the offset to apply. */
  function snap(box: { x: number; y: number; w: number; h: number }, ignore: Set<string>): { dx: number; dy: number } {
    const { xs, ys } = targets(ignore);
    const bx = nearestSnap([box.x, box.x + box.w / 2, box.x + box.w], xs, snapDist());
    const by = nearestSnap([box.y, box.y + box.h / 2, box.y + box.h], ys, snapDist());
    guides = { x: bx.at, y: by.at };
    return { dx: bx.off, dy: by.off };
  }

  function move(e: PointerEvent): void {
    if (!drag) return;
    const p = toStage(e, layerEl);
    if (drag.kind === 'marquee') {
      if (!drag.moved && Math.hypot(p.x - drag.a.x, p.y - drag.a.y) < 4 / (stage.scale || 1)) return;
      if (!drag.moved) {
        // A box after all (not a click): a double-click can't follow it.
        drag.moved = true;
        lastDown = null;
      }
      marquee = { a: drag.a, b: p };
      const hit = touchedBy(
        visible.filter((x) => !x.locked),
        drag.a,
        p,
      ).map((x) => x.id);
      selected = [...new Set([...drag.base, ...hit])];
    } else if (drag.kind === 'move') {
      let dx = p.x - drag.sx;
      let dy = p.y - drag.sy;
      if (!drag.moved && Math.hypot(dx, dy) < 2) return;
      drag.moved = true;
      // Shift pressed during the drag: move along one axis only (whichever the pointer moved more on).
      // A Shift still held from the press (Shift+click adds to the selection) doesn't count until released.
      if (!e.shiftKey) drag.shiftAtDown = false;
      const lock = e.shiftKey && !drag.shiftAtDown ? (Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y') : null;
      if (lock === 'x') dy = 0;
      if (lock === 'y') dx = 0;
      const orig = drag.orig;
      const ids = new Set(orig.keys());
      const moving = slide.elements.filter((x) => ids.has(x.id));
      if (!e.altKey && moving.length) {
        // Snap the moving group's bounding box (hold Alt to move freely).
        // (Each item as drawn: a turned one by the box around it.)
        const at = moving.map((m) => bounds({ ...m, ...orig.get(m.id)! }));
        const minX = Math.min(...at.map((b) => b.x)) + dx;
        const minY = Math.min(...at.map((b) => b.y)) + dy;
        const maxX = Math.max(...at.map((b) => b.x + b.w)) + dx;
        const maxY = Math.max(...at.map((b) => b.y + b.h)) + dy;
        const s = snap({ x: minX, y: minY, w: maxX - minX, h: maxY - minY }, ids);
        if (lock !== 'y') dx += s.dx;
        if (lock !== 'x') dy += s.dy;
        if (lock) guides = lock === 'x' ? { x: guides.x, y: [] } : { x: [], y: guides.y };
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
      // Snap the edges being pulled to the slide and other items (an item that isn't turned; Alt resizes freely).
      // Keeping the shape, only one edge can snap: the other follows the ratio.
      guides = { x: [], y: [] };
      if (single.rotation === 0 && !e.altKey) {
        const { xs, ys } = targets(new Set([single.id]));
        const none = { off: 0, at: [] as number[] };
        const sx = hx ? nearestSnap([hx > 0 ? o.x + w : o.x + o.w - w], xs, snapDist()) : none;
        const sy = hy ? nearestSnap([hy > 0 ? o.y + h : o.y + o.h - h], ys, snapDist()) : none;
        const useX = sx.at.length > 0 && (!keep || !sy.at.length || Math.abs(sx.off) <= Math.abs(sy.off));
        const useY = sy.at.length > 0 && (!keep || !useX);
        if (useX) w = Math.max(20, w + hx * sx.off);
        if (useY) h = Math.max(20, h + hy * sy.off);
        if (keep && useX) h = w / (o.w / o.h);
        if (keep && useY) w = h * (o.w / o.h);
        guides = { x: useX ? sx.at : [], y: useY ? sy.at : [] };
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
      let a = drag.r0 + angle(p, drag.cx, drag.cy) - drag.a0;
      if (e.shiftKey) a = Math.round(a / 15) * 15;
      a = ((Math.round(a) % 360) + 360) % 360;
      single.rotation = a > 180 ? a - 360 : a;
    }
  }

  function up(): void {
    // A selection box that never opened was a click: Alt+click walks down the stack under the pointer (locked items
    // too; again and again to keep going), and a click beside a text box's letters selects the text box.
    if (drag?.kind === 'marquee' && !drag.moved) {
      if (drag.alt) {
        const next = nextBelow(visible, drag.alt, selected.length === 1 ? selected[0] : null);
        if (next) {
          selected = [next.id];
          lastDown = next.locked ? null : next;
        }
      } else if (drag.click) {
        const id = drag.click.id;
        selected = drag.add ? (selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]) : [id];
      }
    }
    // Every drag that began (and told onstart) ends with onchange, a selection box too (it changes nothing).
    const ended = !!drag;
    drag = null;
    marquee = null;
    guides = { x: [], y: [] };
    if (ended) onchange();
  }

  function context(e: MouseEvent): void {
    e.preventDefault();
    if (!onmenu || drag) return;
    const at = toStage(e, layerEl);
    const stack = elementsAt(visible, at);
    // Right-clicking something that isn't selected selects it first (the top unlocked item there).
    if (!stack.some((x) => selected.includes(x.id))) {
      const top = stack.find((x) => !x.locked) ?? stack[0];
      selected = top ? [top.id] : [];
    }
    onmenu({ x: e.clientX, y: e.clientY, at, stack });
  }

  const HANDLES: [number, number][] = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1],
  ];
  const cursor = (hx: number, hy: number) => (hx === 0 ? 'ns-resize' : hy === 0 ? 'ew-resize' : hx === hy ? 'nwse-resize' : 'nesw-resize');
  const inv = $derived(1 / (stage.scale || 1));
  // The rotate handle sits 44 screen px out; flip it below (or inside) when that would be off the slide.
  const knob = $derived(single ? knobPlacement(single, 52 * inv) : 'above');
</script>

<div
  class="layer"
  bind:this={layerEl}
  onpointerdown={(e) => down(e, null)}
  onpointermove={move}
  onpointerup={up}
  onpointercancel={up}
  oncontextmenu={context}
  ondragstart={(e) => e.preventDefault()}
  ondblclick={() => lastDown && ondblclick?.(lastDown)}
  role="presentation"
>
  {#each sorted as el (el.id)}
    <div
      class="hit"
      class:locked={el.locked}
      class:hl={hovered === el.id}
      style:left="{el.x}px"
      style:top="{el.y}px"
      style:width="{el.w}px"
      style:height="{el.h}px"
      style:transform="rotate({el.rotation}deg)"
      style:z-index={el.zIndex}
      onpointerdown={(e) => down(e, el)}
      onpointerenter={() => (hovered = el.id)}
      onpointerleave={() => hovered === el.id && (hovered = null)}
      role="presentation"
    ></div>
  {/each}

  {#each sel as el (el.id)}
    <div
      class="frame knob-{knob}"
      class:multi={!single}
      style:left="{el.x}px"
      style:top="{el.y}px"
      style:width="{el.w}px"
      style:height="{el.h}px"
      style:transform="rotate({el.rotation}deg)"
      style:z-index={frameZ}
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

  {#if marquee}
    <div
      class="marquee"
      style:left="{Math.min(marquee.a.x, marquee.b.x)}px"
      style:top="{Math.min(marquee.a.y, marquee.b.y)}px"
      style:width="{Math.abs(marquee.b.x - marquee.a.x)}px"
      style:height="{Math.abs(marquee.b.y - marquee.a.y)}px"
      style:--inv={inv}
    ></div>
  {/if}

  {#each guides.x as x}<div class="guide v" style:left="{x}px" style:--inv={inv}></div>{/each}
  {#each guides.y as y}<div class="guide h" style:top="{y}px" style:--inv={inv}></div>{/each}
</div>

<style>
  .layer {
    position: absolute;
    inset: 0;
    z-index: 1000;
    touch-action: none;
    user-select: none;
  }
  .hit {
    position: absolute;
    cursor: move;
  }
  .hit:hover,
  .hit.hl {
    outline: calc(2px * var(--inv, 1)) dashed rgba(79, 124, 255, 0.7);
  }
  .hit.locked {
    /* Locked items stay put and let clicks through to what's underneath (pick them from the layers list). */
    pointer-events: none;
  }
  .hit.locked.hl {
    outline-color: rgba(154, 157, 176, 0.8);
  }
  .marquee {
    position: absolute;
    pointer-events: none;
    background: rgba(79, 124, 255, 0.12);
    outline: calc(1.5px * var(--inv, 1)) solid rgba(79, 124, 255, 0.9);
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
  .knob-below .rot-stem {
    top: 100%;
  }
  .knob-below .rot {
    top: calc(100% + 44px * var(--inv));
  }
  .knob-inside .rot-stem {
    top: 0;
  }
  .knob-inside .rot {
    top: calc(44px * var(--inv));
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
