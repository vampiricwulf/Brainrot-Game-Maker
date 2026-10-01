<!--
  Non-destructive image editor (spec §5.4): crop / rotate / flip / resize, filters, meme text,
  stickers and brush. The original file is kept; the result is saved as a new file on the element.
-->
<script lang="ts">
  import { modal } from '../../lib/modal';
  import { onMount, tick, untrack } from 'svelte';
  import { toast, editedGame } from '../../lib/app.svelte';
  import { addMediaFile, mediaUrls } from '../../lib/media.svelte';
  import { step, stepAsync } from '../../lib/history.svelte';
  import { newId, SLIDE_H, SLIDE_W, type ImageEdits, type ImageEl } from '../../lib/model';
  import { aspectCrop, fitAspect, resizeAround } from '../../lib/editing';
  import { fontChoices } from '../../lib/fonts';
  import { linkHost } from '../../lib/links';
  import SaveCopyButton from '../SaveCopyButton.svelte';
  import InlineAsk from '../../play/host/InlineAsk.svelte';
  import {
    angleToOutput, angleToSource, canvasToBlob, defaultEdits, fitCrop, itemAt, loadImage, migrateEdits, orientedSize, outputSize,
    placedOverlays, renderEdited, renderForSave, sizeToOutput, STICKERS, toOutput, toSource, turnCrop,
  } from '../../lib/imageedit';

  let { el, onclose }: { el: ImageEl; onclose: () => void } = $props();

  const game = editedGame();
  const source = $derived(game.media.find((m) => m.id === el.media));
  let edits = $state<ImageEdits>(untrack(() => ({ ...defaultEdits(), ...JSON.parse(JSON.stringify(el.edits ?? {})) })));
  // What the edits were when the editor opened: closing with anything else asks first. (Opening the
  // Crop tool adds a full-image crop, which isn't an edit.)
  const snapshot = (e: ImageEdits) => JSON.stringify({ ...e, crop: e.crop && (e.crop.x || e.crop.y || e.crop.w < 1 || e.crop.h < 1) ? e.crop : undefined });
  let opened = snapshot(untrack(() => edits));
  let img = $state<HTMLImageElement | null>(null);
  let tool = $state<'move' | 'crop' | 'draw' | 'text' | 'sticker'>('move');
  let selectedId = $state<string | null>(null);
  let brush = $state({ color: '#ff0000', size: 1.5, erase: false });
  let sticker = $state(STICKERS[0]);
  let cropAspect = $state<'free' | number>('free');
  let saving = $state(false);
  let discarding = $state(false);
  let host = $state<HTMLDivElement>();
  let box = $state<HTMLDivElement>();
  let rendered = $state<HTMLCanvasElement | null>(null);
  let stageW = $state(0);
  let stageH = $state(0);
  // Fit the preview canvas into the available space (scaling small images up, up to 4×).
  $effect(() => {
    const c = rendered;
    if (!c || !stageW || !stageH) return;
    const k = Math.min((stageW - 24) / c.width, (stageH - 24) / c.height, 4);
    c.style.width = `${Math.round(c.width * k)}px`;
    c.style.height = `${Math.round(c.height * k)}px`;
  });

  const SLIDERS: [keyof ImageEdits, string, number, number, number][] = [
    ['brightness', 'Brightness', 0, 200, 100],
    ['contrast', 'Contrast', 0, 200, 100],
    ['saturation', 'Saturation', 0, 300, 100],
    ['hue', 'Hue', -180, 180, 0],
    ['blur', 'Blur', 0, 30, 0],
    ['grayscale', 'Grayscale', 0, 100, 0],
    ['sepia', 'Sepia', 0, 100, 0],
    ['invert', 'Invert', 0, 100, 0],
  ];
  // Adjust starts folded (its eight sliders pushed the Draw and Sticker options out of sight), unless it's in use.
  let adjustOpen = $state(untrack(() => SLIDERS.some(([k, , , , def]) => edits[k] !== def)));

  const fonts = $derived(fontChoices(game));
  const selText = $derived(edits.texts.find((t) => t.id === selectedId));
  const selSticker = $derived(edits.stickers.find((s) => s.id === selectedId));
  const out = $derived(img ? outputSize(img.naturalWidth, img.naturalHeight, edits) : { w: 0, h: 0 });
  const oriented = $derived(img ? orientedSize(img.naturalWidth, img.naturalHeight, edits.rotate) : { w: 1, h: 1 });
  // Captions, stickers and strokes are kept on the source picture (so a crop or a turn takes them along); the pointer
  // and the sliders work on the image as it shows, so these convert between the two.
  const nat = $derived(img ? { w: img.naturalWidth, h: img.naturalHeight } : { w: 1, h: 1 });
  const placed = $derived(placedOverlays(edits, nat.w, nat.h));
  /** Sizes on the finished image per size on the source (both as fractions of their widths). */
  const sizeK = $derived(sizeToOutput(nat.w, nat.h, edits));
  const onSource = (p: { x: number; y: number }) => toSource(p, nat.w, nat.h, edits);
  const shown = (p: { x: number; y: number }) => toOutput(p, nat.w, nat.h, edits);
  const r4 = (v: number) => Math.round(v * 10000) / 10000;

  // A picture that plays from its link can't be edited (the browser won't let a page read another site's
  // pixels), so the editor asks to save a copy in the game first.
  const linked = $derived(!!source?.url);
  function load(): void {
    loadImage(mediaUrls[el.media])
      .then((i) => {
        img = i;
        // Edits saved before overlays were kept on the source picture: moved there now (they look the same).
        const up = (e: ImageEdits) => migrateEdits(e, i.naturalWidth, i.naturalHeight);
        const same = snapshot(edits) === opened;
        edits = up(edits);
        if (same) opened = snapshot(edits);
        history = history.map((s) => JSON.stringify(up(JSON.parse(s))));
        future = future.map((s) => JSON.stringify(up(JSON.parse(s))));
      })
      .catch(() => toast("Couldn't load the original image"));
  }
  onMount(() => {
    if (!untrack(() => source?.url)) load();
  });

  // Re-render the preview (capped at ~1200px) whenever the edits change. While cropping it shows the whole picture
  // (with its captions and stickers), the crop box over it.
  let raf = 0;
  $effect(() => {
    const snap = JSON.stringify(edits);
    const t = tool;
    if (!img) return;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const e = JSON.parse(snap) as ImageEdits;
      const k = Math.min(1, 1200 / Math.max(img!.naturalWidth, img!.naturalHeight));
      try {
        rendered = renderEdited(img!, t === 'crop' ? { ...e, crop: undefined } : e, k);
      } catch {
        return;
      }
      if (host) {
        host.replaceChildren(rendered);
      }
    });
  });

  // ---------- Undo / redo ----------
  let history = $state<string[]>([]);
  let future = $state<string[]>([]);
  function commit(): void {
    burst = null;
    history.push(JSON.stringify(edits));
    if (history.length > 60) history.shift();
    future = [];
  }
  function undo(): void {
    burst = null;
    const prev = history.pop();
    if (!prev) return;
    future.push(JSON.stringify(edits));
    edits = JSON.parse(prev);
  }
  function redo(): void {
    burst = null;
    const next = future.pop();
    if (!next) return;
    history.push(JSON.stringify(edits));
    edits = JSON.parse(next);
  }

  // The side panel's sliders, fields, colours and the font list: one undo step per burst of changes to one of them (a
  // slider dragged, arrow keys held, a caption typed), starting with the first change, by pointer or keyboard.
  let burst: { target: EventTarget | null; before: string; done: boolean } | null = null;
  let burstTimer: ReturnType<typeof setTimeout> | undefined;
  /** Before a press or key in the panel: what the edits were, in case it changes something. */
  function beforeInput(e: Event): void {
    if (e.type === 'keydown' && burst && burst.target === e.target) return;
    burst = { target: e.target, before: JSON.stringify(edits), done: false };
  }
  /** After a change in the panel: its burst's first change records the step (later ones join it). */
  function afterInput(e: Event): void {
    if (!burst || burst.target !== e.target) beforeInput(e);
    const b = burst!;
    if (!b.done && b.before !== JSON.stringify(edits)) {
      history.push(b.before);
      if (history.length > 60) history.shift();
      future = [];
      b.done = true;
    }
    clearTimeout(burstTimer);
    burstTimer = setTimeout(() => burst === b && (burst = null), 1000);
  }

  /** Cancel (Esc, the Cancel button): ask before throwing edits away. */
  function cancel(): void {
    if (snapshot(edits) !== opened) discarding = true;
    else onclose();
  }

  // ---------- Pointer interactions (in fractions of the displayed image) ----------
  function frac(e: PointerEvent): { x: number; y: number } {
    const r = box!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  }

  // `moved`: a caption or sticker only becomes an undo step once it really moves (a click just selects it).
  let drag: { kind: 'stroke' } | { kind: 'item'; id: string; dx: number; dy: number; moved: boolean } | { kind: 'crop'; mode: string; sx: number; sy: number; o: { x: number; y: number; w: number; h: number } } | null = null;

  let measurer: CanvasRenderingContext2D | null = null;
  /** A caption's line width as the canvas draws it. */
  function measure(line: string, size: number, font: string): number {
    measurer ??= document.createElement('canvas').getContext('2d');
    if (!measurer) return line.length * size * 0.6;
    measurer.font = `900 ${size}px ${font}`;
    return measurer.measureText(line).width;
  }

  /** The caption or sticker under the point: the box it draws (not a circle). */
  function hit(p: { x: number; y: number }): string | null {
    return itemAt(p, out.w || 1, out.h || 1, placed, measure);
  }

  /** A new caption at `p` (fractions of the image as it shows), level on the image as it shows. */
  function addCaption(p: { x: number; y: number }): void {
    commit();
    const at = onSource(p);
    const t = { id: newId(), text: 'YOUR TEXT', x: at.x, y: at.y, size: 0.09 / sizeK, color: '#ffffff', stroke: '#000000', strokeWidth: 0.12, font: 'Impact, Anton, sans-serif', rotation: angleToSource(0, edits) };
    edits.texts.push(t);
    selectedId = t.id;
    setTimeout(() => (document.getElementById('ie-text') as HTMLTextAreaElement | null)?.select(), 0);
  }

  function addSticker(p: { x: number; y: number }): void {
    commit();
    const at = onSource(p);
    const s = { id: newId(), emoji: sticker, x: at.x, y: at.y, size: 0.15 / sizeK, rotation: angleToSource(0, edits) };
    edits.stickers.push(s);
    selectedId = s.id;
  }

  function down(e: PointerEvent): void {
    // (While cropping, only the crop box takes the pointer.)
    if (!box || e.button !== 0 || tool === 'crop') return;
    const p = frac(e);
    box.setPointerCapture(e.pointerId);
    if (tool === 'draw') {
      commit();
      const at = onSource(p);
      edits.strokes.push({ color: brush.color, size: brush.size / 100 / sizeK, erase: brush.erase, points: [r4(at.x), r4(at.y)] });
      drag = { kind: 'stroke' };
      return;
    }
    const id = hit(p);
    if (id) {
      selectedId = id;
      const it = edits.texts.find((t) => t.id === id) ?? edits.stickers.find((s) => s.id === id)!;
      const o = shown(it);
      drag = { kind: 'item', id, dx: o.x - p.x, dy: o.y - p.y, moved: false };
      return;
    }
    if (tool === 'text') addCaption(p);
    else if (tool === 'sticker') addSticker(p);
    else selectedId = null;
  }

  function move(e: PointerEvent): void {
    if (!drag) return;
    const p = frac(e);
    if (drag.kind === 'stroke') {
      const s = edits.strokes[edits.strokes.length - 1];
      const at = onSource(p);
      s.points.push(r4(at.x), r4(at.y));
    } else if (drag.kind === 'item') {
      const d = drag;
      const it = edits.texts.find((t) => t.id === d.id) ?? edits.stickers.find((s) => s.id === d.id);
      if (!it) return;
      const nx = Math.min(1, Math.max(0, p.x + d.dx));
      const ny = Math.min(1, Math.max(0, p.y + d.dy));
      const o = shown(it);
      if (!d.moved && (Math.abs(nx - o.x) > 1e-6 || Math.abs(ny - o.y) > 1e-6)) {
        commit();
        d.moved = true;
      }
      if (d.moved) Object.assign(it, onSource({ x: nx, y: ny }));
    } else if (drag.kind === 'crop') {
      const c = edits.crop!;
      const { o, mode } = drag;
      const dx = p.x - drag.sx;
      const dy = p.y - drag.sy;
      if (mode === 'move') {
        c.x = Math.min(1 - o.w, Math.max(0, o.x + dx));
        c.y = Math.min(1 - o.h, Math.max(0, o.y + dy));
      } else {
        if (cropAspect !== 'free') {
          // Keep the pixel aspect: in image fractions, height = width × (W / H) / aspect.
          Object.assign(c, aspectCrop(mode, o, dx, dy, oriented.w / oriented.h / cropAspect));
          return;
        }
        let x1 = o.x, y1 = o.y, x2 = o.x + o.w, y2 = o.y + o.h;
        if (mode.includes('w')) x1 = Math.min(x2 - 0.02, Math.max(0, o.x + dx));
        if (mode.includes('e')) x2 = Math.max(x1 + 0.02, Math.min(1, o.x + o.w + dx));
        if (mode.includes('n')) y1 = Math.min(y2 - 0.02, Math.max(0, o.y + dy));
        if (mode.includes('s')) y2 = Math.max(y1 + 0.02, Math.min(1, o.y + o.h + dy));
        Object.assign(c, { x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
      }
    }
  }

  function up(): void {
    drag = null;
  }

  function cropDown(e: PointerEvent, mode: string): void {
    e.stopPropagation();
    if (!box || !edits.crop) return;
    commit();
    box.setPointerCapture(e.pointerId);
    const p = frac(e);
    drag = { kind: 'crop', mode, sx: p.x, sy: p.y, o: { ...edits.crop } };
  }

  function startCrop(): void {
    tool = 'crop';
    edits.crop ??= { x: 0, y: 0, w: 1, h: 1 };
  }

  function setAspect(a: 'free' | number): void {
    cropAspect = a;
    if (a !== 'free') {
      commit();
      edits.crop = fitCrop(a, oriented.w, oriented.h);
    }
  }

  /** ⟲ / ⟳ 90°: the crop turns with the picture (the same part stays cropped, its shape turned too). */
  function rotateBy(d: 90 | -90): void {
    commit();
    edits.rotate = (((edits.rotate + d) % 360) + 540) % 360 - 180;
    if (edits.crop) edits.crop = turnCrop(edits.crop, d > 0 ? 1 : -1);
    if (cropAspect !== 'free') cropAspect = 1 / cropAspect;
  }

  function removeSelected(): void {
    commit();
    edits.texts = edits.texts.filter((t) => t.id !== selectedId);
    edits.stickers = edits.stickers.filter((s) => s.id !== selectedId);
    selectedId = null;
  }

  function resetAll(): void {
    commit();
    edits = { ...defaultEdits(), v: 2 };
    selectedId = null;
  }

  // The tool's options come first in the side panel; picking a tool brings them into view.
  let aside = $state<HTMLElement>();
  function pickTool(k: typeof tool): void {
    if (k === 'crop') startCrop();
    else tool = k;
    void tick().then(() => aside?.scrollTo({ top: 0 }));
  }

  async function apply(): Promise<void> {
    if (!img || !source) return;
    saving = true;
    try {
      const canvas = renderForSave(img, JSON.parse(JSON.stringify(edits)));
      const alpha = /png|gif|webp|svg/.test(source.mime) || edits.rotate % 90 !== 0;
      const type = alpha ? 'image/png' : 'image/jpeg';
      const blob = await canvasToBlob(canvas, type, 0.92);
      const base = source.name.replace(/\.\w+$/, '');
      // The edited file and the image showing it: one undo step.
      await stepAsync('Edited image', async () => {
        const ref = await addMediaFile(game, blob, `${base}-edited.${alpha ? 'png' : 'jpg'}`);
        // The size it had before its first edit, for Use original.
        if (!el.editedMedia && !el.uneditedSize) el.uneditedSize = { w: el.w, h: el.h };
        el.editedMedia = ref.id;
        el.edits = JSON.parse(JSON.stringify(edits));
        // Match the box to the new shape so nothing looks squashed: about as big as it was, where it was, on the slide.
        Object.assign(el, fitAspect(el, canvas.width / canvas.height, SLIDE_W, SLIDE_H));
      });
      toast('Image edited (original kept)');
      onclose();
    } catch (e) {
      toast('Could not save the edit: ' + (e as Error).message);
    } finally {
      saving = false;
    }
  }

  function revert(): void {
    step('Back to the original image', () => {
      // Its size before it was edited (or, edited before that was kept, the original's shape at about this size).
      const was = el.uneditedSize;
      if (was) Object.assign(el, resizeAround(el, was.w, was.h, SLIDE_W, SLIDE_H));
      else if (img) Object.assign(el, fitAspect(el, img.naturalWidth / img.naturalHeight, SLIDE_W, SLIDE_H));
      el.editedMedia = undefined;
      el.edits = undefined;
      el.uneditedSize = undefined;
    });
    toast('Back to the original image');
    onclose();
  }

  function onkey(e: KeyboardEvent): void {
    const typing = (e.target as HTMLElement)?.closest?.('input, textarea, select');
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && k === 'enter') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!saving && img) apply();
    } else if (mod && ((k === 'z' && e.shiftKey) || k === 'y') && !typing) {
      e.preventDefault();
      e.stopImmediatePropagation();
      redo();
    } else if (mod && k === 'z' && !typing) {
      e.preventDefault();
      e.stopImmediatePropagation();
      undo();
    } else if (e.key === 'Escape') {
      e.stopImmediatePropagation();
      // Esc in a field (e.g. the meme caption) just leaves the field; while it asks, Esc keeps editing.
      if (typing) (e.target as HTMLElement).blur();
      else if (discarding) discarding = false;
      else cancel();
    } else if (e.altKey && e.key.startsWith('Arrow')) {
      // Not the clue editor's Prev/Next: that would drop this dialog and its edits.
      e.stopImmediatePropagation();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && !typing) {
      e.stopImmediatePropagation();
      removeSelected();
    }
  }
</script>

<svelte:window onkeydowncapture={onkey} />

<div class="modal-backdrop image-backdrop" role="presentation">
  <!-- (data-undo: Ctrl+Z in its boxes and sliders never reaches the game's undo underneath.) -->
  <div class="modal image-modal" role="dialog" aria-modal="true" aria-label="Edit image" use:modal data-undo="off">
    {#if linked}
      <div class="gate">
        <p>🌐 This picture plays from {linkHost(source?.url)}. The image editor works on a copy saved in your game.</p>
        <div class="row">
          <button class="ghost" onclick={onclose}>Cancel</button>
          <SaveCopyButton id={el.media} label="💾 Store in game first" onsaved={load} />
        </div>
      </div>
    {/if}
    <header class="row">
      <h2 class="modal-title">✎ Edit image</h2>
      {#if discarding}
        <InlineAsk text="Discard your image edits?" ok="Discard" cancel="Cancel" danger onok={onclose} oncancel={() => (discarding = false)} />
      {:else}
        <span class="hint">{source?.name} · output {out.w}×{out.h}px</span>
      {/if}
      {#if tool === 'crop' && edits.crop && img}
        <span class="small crop-size">crop {Math.round(edits.crop.w * oriented.w)}×{Math.round(edits.crop.h * oriented.h)}px</span>
      {/if}
      {#if source?.mime === 'image/gif'}<span class="warn small">Editing a GIF makes it a still image.</span>{/if}
      <span class="spacer"></span>
      <button class="ghost" onclick={undo} disabled={!history.length} title="Ctrl+Z">↶ Undo</button>
      <button class="ghost" onclick={redo} disabled={!future.length} title="Ctrl+Y or Ctrl+Shift+Z">↷ Redo</button>
      <button class="ghost" onclick={resetAll}>Reset all</button>
      {#if el.editedMedia}<button class="ghost" onclick={revert}>Use original</button>{/if}
      <button class="ghost" onclick={cancel} title="Esc">Cancel</button>
      <button class="primary" onclick={apply} disabled={saving || !img} title="Ctrl+Enter">{saving ? 'Saving…' : 'Apply'}</button>
      <button class="ghost modal-x" onclick={cancel} aria-label="Close" title="Close (Esc)">✕</button>
    </header>

    <div class="tools row">
      {#each [['move', '✋ Move'], ['crop', '✂ Crop'], ['draw', '🖌 Draw'], ['text', '🅣 Text'], ['sticker', '😂 Sticker']] as [k, l]}
        <button class:on={tool === k} aria-pressed={tool === k} onclick={() => pickTool(k as typeof tool)}>{l}</button>
      {/each}
    </div>

    <div class="body">
      <div class="stage" bind:clientWidth={stageW} bind:clientHeight={stageH}>
        <div
          class="imgbox"
          bind:this={box}
          class:draw={tool === 'draw'}
          onpointerdown={down}
          onpointermove={move}
          onpointerup={up}
          onpointercancel={up}
          role="presentation"
        >
          <div class="canvas-host" bind:this={host}></div>
          {#if tool === 'crop' && edits.crop}
            {@const c = edits.crop}
            <div class="shade" style:clip-path="polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 {c.y * 100}%, {c.x * 100}% {c.y * 100}%, {c.x * 100}% {(c.y + c.h) * 100}%, {(c.x + c.w) * 100}% {(c.y + c.h) * 100}%, {(c.x + c.w) * 100}% {c.y * 100}%, 0 {c.y * 100}%)"></div>
            <div
              class="crop"
              style:left="{c.x * 100}%"
              style:top="{c.y * 100}%"
              style:width="{c.w * 100}%"
              style:height="{c.h * 100}%"
              onpointerdown={(e) => cropDown(e, 'move')}
              role="presentation"
            >
              {#each ['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'] as m}
                <div class="ch {m}" onpointerdown={(e) => cropDown(e, m)} role="presentation"></div>
              {/each}
            </div>
          {/if}
          {#if tool !== 'crop'}
            {#each [...placed.texts, ...placed.stickers] as it (it.id)}
              {#if it.id === selectedId}
                <div class="sel" style:left="{it.x * 100}%" style:top="{it.y * 100}%"></div>
              {/if}
            {/each}
          {/if}
        </div>
      </div>

      <!-- (A press or key on a slider or field starts an undo step; its first change records it.) -->
      <aside bind:this={aside} onpointerdowncapture={beforeInput} onkeydowncapture={beforeInput} oninput={afterInput} onchange={afterInput}>
        <!-- The chosen tool's options first, then turning and the adjustments. -->
        {#if tool === 'crop'}
          <h4>Crop</h4>
          <div class="row">
            {#each [['free', 'Free'], [16 / 9, '16:9'], [4 / 3, '4:3'], [1, '1:1'], [9 / 16, '9:16']] as [a, l]}
              <button class="small" class:on={cropAspect === a} aria-pressed={cropAspect === a} onclick={() => setAspect(a as 'free' | number)}>{l}</button>
            {/each}
          </div>
          <button class="small" onclick={() => (commit(), (edits.crop = undefined), (tool = 'move'))}>Remove crop</button>
          <button class="small primary" onclick={() => (tool = 'move')}>Done cropping</button>
        {/if}

        {#if tool === 'draw'}
          <h4>Brush</h4>
          <div class="row">
            <input type="color" bind:value={brush.color} aria-label="Brush color" />
            <label class="check small"><input type="checkbox" bind:checked={brush.erase} /> Eraser</label>
            <button class="small" onclick={() => (commit(), edits.strokes.pop())} disabled={!edits.strokes.length}>Undo stroke</button>
            <button class="small" onclick={() => (commit(), (edits.strokes = []))} disabled={!edits.strokes.length}>Clear</button>
          </div>
          <label class="field">Size {brush.size}%<input type="range" min="0.3" max="12" step="0.1" bind:value={brush.size} /></label>
        {/if}

        {#if tool === 'sticker'}
          <h4>Stickers <span class="muted small">(click the image to place)</span></h4>
          <div class="stickers">
            {#each STICKERS as s}<button class:on={sticker === s} aria-pressed={sticker === s} onclick={() => (sticker = s)}>{s}</button>{/each}
          </div>
          <button class="small" onclick={() => addSticker({ x: 0.5, y: 0.5 })} disabled={!img}>＋ Put {sticker} in the middle</button>
        {/if}

        {#if tool === 'text' && !selText}
          <p class="muted small">Click the image to add meme text, or drag existing text to move it.</p>
          <button class="small" onclick={() => addCaption({ x: 0.5, y: 0.5 })} disabled={!img}>＋ Add text in the middle</button>
        {/if}

        {#if selText}
          <h4>Text</h4>
          <textarea id="ie-text" rows="2" bind:value={selText.text} aria-label="Caption text" dir="auto"></textarea>
          <select bind:value={selText.font} aria-label="Caption font">
            <option value="Impact, Anton, sans-serif">Impact (meme)</option>
            {#each fonts as f}<option value={f.css}>{f.label}</option>{/each}
          </select>
          <label class="field">Size<input type="range" min="0.02" max="0.3" step="0.005" value={selText.size * sizeK} oninput={(e) => (selText!.size = +e.currentTarget.value / sizeK)} /></label>
          <div class="row">
            <label class="check small">Fill <input type="color" bind:value={selText.color} /></label>
            <label class="check small">Outline <input type="color" bind:value={selText.stroke} /></label>
          </div>
          <label class="field">Outline width<input type="range" min="0" max="0.3" step="0.01" bind:value={selText.strokeWidth} /></label>
          {@const turn = Math.round(angleToOutput(selText.rotation, edits))}
          <label class="field">Rotation {turn}°<input type="range" min="-180" max="180" value={turn} oninput={(e) => (selText!.rotation = angleToSource(+e.currentTarget.value, edits))} /></label>
          <button class="small danger" onclick={removeSelected}>🗑 Delete text</button>
        {:else if selSticker}
          <h4>Sticker {selSticker.emoji}</h4>
          <label class="field">Size<input type="range" min="0.03" max="0.6" step="0.01" value={selSticker.size * sizeK} oninput={(e) => (selSticker!.size = +e.currentTarget.value / sizeK)} /></label>
          {@const turn = Math.round(angleToOutput(selSticker.rotation, edits))}
          <label class="field">Rotation {turn}°<input type="range" min="-180" max="180" value={turn} oninput={(e) => (selSticker!.rotation = angleToSource(+e.currentTarget.value, edits))} /></label>
          <button class="small danger" onclick={removeSelected}>🗑 Delete sticker</button>
        {/if}

        <h4>Rotate & flip</h4>
        <div class="row">
          <button class="small" onclick={() => rotateBy(-90)}>⟲ 90°</button>
          <button class="small" onclick={() => rotateBy(90)}>⟳ 90°</button>
          <button class="small" class:on={edits.flipH} aria-pressed={!!edits.flipH} onclick={() => (commit(), (edits.flipH = !edits.flipH))}>⇋ Flip H</button>
          <button class="small" class:on={edits.flipV} aria-pressed={!!edits.flipV} onclick={() => (commit(), (edits.flipV = !edits.flipV))}>⇵ Flip V</button>
        </div>
        <label class="field">Angle {edits.rotate}°<input type="range" min="-180" max="180" step="1" bind:value={edits.rotate} /></label>
        <label class="field">
          Size {Math.round(edits.scale * 100)}% ({out.w}×{out.h})
          <input type="range" min="0.1" max="2" step="0.05" bind:value={edits.scale} />
        </label>

        <details class="adjust" bind:open={adjustOpen}>
          <summary><h4>Adjust</h4></summary>
          {#each SLIDERS as [k, label, min, max, def]}
            <label class="field slider">
              <span>{label} <span class="muted">{edits[k]}</span>{#if edits[k] !== def}<button class="tiny ghost" onclick={() => (commit(), ((edits as unknown as Record<string, number>)[k] = def))} aria-label="Reset {label}" title="Reset">↺</button>{/if}</span>
              <input type="range" {min} {max} value={edits[k] as number}
                oninput={(e) => ((edits as unknown as Record<string, number>)[k] = +e.currentTarget.value)} />
            </label>
          {/each}
        </details>
      </aside>
    </div>
  </div>
</div>

<style>
  /* Over the clue editor, Board images or a slide's window it was opened from. */
  .image-backdrop {
    z-index: calc(var(--z-modal) + 20);
    padding-inline: 12px;
    padding-bottom: 12px;
  }
  .gate {
    position: absolute;
    inset: 0;
    z-index: 10;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 24px;
    text-align: center;
    background: var(--panel);
    border-radius: 10px;
  }
  .image-modal {
    position: relative;
    width: min(1300px, 100%);
    height: min(900px, 100%);
    overflow: visible;
  }
  .crop-size {
    color: var(--accent);
  }
  .tools button.on,
  button.on {
    background: var(--accent-fill);
    border-color: var(--accent-fill);
    color: #fff;
  }
  .body {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 280px;
    gap: 12px;
  }
  .stage {
    min-height: 0;
    display: grid;
    place-items: center;
    background: repeating-conic-gradient(#2a2a2a 0% 25%, #222 0% 50%) 50% / 24px 24px;
    border-radius: 6px;
    overflow: hidden;
  }
  .imgbox {
    position: relative;
    max-width: 100%;
    max-height: 100%;
    touch-action: none;
    cursor: crosshair;
    line-height: 0;
  }
  .imgbox.draw {
    cursor: cell;
  }
  .canvas-host :global(canvas) {
    display: block;
    image-rendering: auto;
  }
  .shade {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    pointer-events: none;
  }
  .crop {
    position: absolute;
    outline: 2px solid #fff;
    box-shadow: 0 0 0 1px #000;
    cursor: move;
  }
  .ch {
    position: absolute;
    width: 14px;
    height: 14px;
    background: #fff;
    border: 2px solid var(--accent);
    translate: -50% -50%;
  }
  .ch.nw { left: 0; top: 0; cursor: nwse-resize; }
  .ch.ne { left: 100%; top: 0; cursor: nesw-resize; }
  .ch.sw { left: 0; top: 100%; cursor: nesw-resize; }
  .ch.se { left: 100%; top: 100%; cursor: nwse-resize; }
  .ch.n { left: 50%; top: 0; cursor: ns-resize; }
  .ch.s { left: 50%; top: 100%; cursor: ns-resize; }
  .ch.e { left: 100%; top: 50%; cursor: ew-resize; }
  .ch.w { left: 0; top: 50%; cursor: ew-resize; }
  .sel {
    position: absolute;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 3px solid var(--accent);
    background: rgba(255, 255, 255, 0.6);
    translate: -50% -50%;
    pointer-events: none;
  }
  aside {
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-right: 4px;
  }
  h4 {
    margin: 8px 0 2px;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
  }
  .adjust summary {
    cursor: pointer;
    color: var(--muted);
  }
  .adjust summary h4 {
    display: inline;
  }
  .adjust .field {
    margin-top: 6px;
  }
  .slider span {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .stickers {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 4px;
  }
  .stickers button {
    font-size: 20px;
    padding: 2px;
  }
  textarea {
    resize: vertical;
  }
  p {
    margin: 0;
  }
  @media (max-width: 800px) {
    .body {
      grid-template-columns: 1fr;
    }
  }
</style>
