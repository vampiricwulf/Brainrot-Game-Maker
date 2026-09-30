<!--
  Non-destructive image editor (spec §5.4): crop / rotate / flip / resize, filters, meme text,
  stickers and brush. The original file is kept; the result is saved as a new file on the element.
-->
<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { toast, editedGame } from '../../lib/app.svelte';
  import { addMediaFile, mediaUrls } from '../../lib/media.svelte';
  import { newId, type ImageEdits, type ImageEl } from '../../lib/model';
  import { aspectCrop } from '../../lib/editing';
  import { fontChoices } from '../../lib/fonts';
  import { linkHost } from '../../lib/links';
  import SaveCopyButton from '../SaveCopyButton.svelte';
  import {
    canvasToBlob, defaultEdits, fitCrop, loadImage, orientedSize, outputSize, renderEdited, renderOriented, STICKERS,
  } from '../../lib/imageedit';

  let { el, onclose }: { el: ImageEl; onclose: () => void } = $props();

  const game = editedGame();
  const source = $derived(game.media.find((m) => m.id === el.media));
  let edits = $state<ImageEdits>(untrack(() => ({ ...defaultEdits(), ...JSON.parse(JSON.stringify(el.edits ?? {})) })));
  // What the edits were when the editor opened: closing with anything else asks first. (Opening the
  // Crop tool adds a full-image crop, which isn't an edit.)
  const snapshot = (e: ImageEdits) => JSON.stringify({ ...e, crop: e.crop && (e.crop.x || e.crop.y || e.crop.w < 1 || e.crop.h < 1) ? e.crop : undefined });
  const opened = snapshot(untrack(() => edits));
  let img = $state<HTMLImageElement | null>(null);
  let tool = $state<'move' | 'crop' | 'draw' | 'text' | 'sticker'>('move');
  let selectedId = $state<string | null>(null);
  let brush = $state({ color: '#ff0000', size: 1.5, erase: false });
  let sticker = $state(STICKERS[0]);
  let cropAspect = $state<'free' | number>('free');
  let saving = $state(false);
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

  const fonts = $derived(fontChoices(game));
  const selText = $derived(edits.texts.find((t) => t.id === selectedId));
  const selSticker = $derived(edits.stickers.find((s) => s.id === selectedId));
  const out = $derived(img ? outputSize(img.naturalWidth, img.naturalHeight, edits) : { w: 0, h: 0 });
  const oriented = $derived(img ? orientedSize(img.naturalWidth, img.naturalHeight, edits.rotate) : { w: 1, h: 1 });

  // A picture that plays from its link can't be edited (the browser won't let a page read another site's
  // pixels), so the editor asks to save a copy in the game first.
  const linked = $derived(!!source?.url);
  function load(): void {
    loadImage(mediaUrls[el.media]).then((i) => (img = i)).catch(() => toast("Couldn't load the original image"));
  }
  onMount(() => {
    if (!untrack(() => source?.url)) load();
  });

  // Re-render the preview (capped at ~1200px) whenever the edits change.
  let raf = 0;
  $effect(() => {
    const snap = JSON.stringify(edits);
    const t = tool;
    if (!img) return;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const e = JSON.parse(snap) as ImageEdits;
      const k = Math.min(1, 1200 / Math.max(img!.naturalWidth, img!.naturalHeight));
      rendered = t === 'crop' ? renderOriented(img!, { ...e }, k) : renderEdited(img!, e, k);
      if (host) {
        host.replaceChildren(rendered);
      }
    });
  });

  // ---------- Undo / redo ----------
  let history = $state<string[]>([]);
  let future = $state<string[]>([]);
  function commit(): void {
    history.push(JSON.stringify(edits));
    if (history.length > 60) history.shift();
    future = [];
  }
  function undo(): void {
    const prev = history.pop();
    if (!prev) return;
    future.push(JSON.stringify(edits));
    edits = JSON.parse(prev);
  }
  function redo(): void {
    const next = future.pop();
    if (!next) return;
    history.push(JSON.stringify(edits));
    edits = JSON.parse(next);
  }

  /** Cancel (Esc, the Cancel button): ask before throwing edits away. */
  function cancel(): void {
    if (snapshot(edits) !== opened && !confirm('Discard your image edits?')) return;
    onclose();
  }

  // ---------- Pointer interactions (in fractions of the displayed image) ----------
  function frac(e: PointerEvent): { x: number; y: number } {
    const r = box!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  }

  let drag: { kind: 'stroke' } | { kind: 'item'; id: string; dx: number; dy: number } | { kind: 'crop'; mode: string; sx: number; sy: number; o: { x: number; y: number; w: number; h: number } } | null = null;

  function hit(p: { x: number; y: number }): string | null {
    const W = out.w || 1;
    const H = out.h || 1;
    const items = [...edits.stickers.map((s) => ({ id: s.id, x: s.x, y: s.y, r: s.size * 0.6 })), ...edits.texts.map((t) => ({ id: t.id, x: t.x, y: t.y, r: t.size * Math.max(1.2, t.text.length * 0.3) }))];
    let best: string | null = null;
    let bd = Infinity;
    for (const it of items) {
      const d = Math.hypot((p.x - it.x) * W, (p.y - it.y) * H) / W;
      if (d < it.r && d < bd) {
        bd = d;
        best = it.id;
      }
    }
    return best;
  }

  function down(e: PointerEvent): void {
    if (!box || e.button !== 0) return;
    const p = frac(e);
    box.setPointerCapture(e.pointerId);
    if (tool === 'draw') {
      commit();
      edits.strokes.push({ color: brush.color, size: brush.size / 100, erase: brush.erase, points: [p.x, p.y] });
      drag = { kind: 'stroke' };
      return;
    }
    const id = hit(p);
    if (id) {
      commit();
      selectedId = id;
      const it = edits.texts.find((t) => t.id === id) ?? edits.stickers.find((s) => s.id === id)!;
      drag = { kind: 'item', id, dx: it.x - p.x, dy: it.y - p.y };
      return;
    }
    if (tool === 'text') {
      commit();
      const t = { id: newId(), text: 'YOUR TEXT', x: p.x, y: p.y, size: 0.09, color: '#ffffff', stroke: '#000000', strokeWidth: 0.12, font: 'Impact, Anton, sans-serif', rotation: 0 };
      edits.texts.push(t);
      selectedId = t.id;
      setTimeout(() => (document.getElementById('ie-text') as HTMLTextAreaElement | null)?.select(), 0);
    } else if (tool === 'sticker') {
      commit();
      const s = { id: newId(), emoji: sticker, x: p.x, y: p.y, size: 0.15, rotation: 0 };
      edits.stickers.push(s);
      selectedId = s.id;
    } else selectedId = null;
  }

  function move(e: PointerEvent): void {
    if (!drag) return;
    const p = frac(e);
    if (drag.kind === 'stroke') {
      const s = edits.strokes[edits.strokes.length - 1];
      s.points.push(Math.round(p.x * 10000) / 10000, Math.round(p.y * 10000) / 10000);
    } else if (drag.kind === 'item') {
      const d = drag;
      const it = edits.texts.find((t) => t.id === d.id) ?? edits.stickers.find((s) => s.id === d.id);
      if (it) {
        it.x = Math.min(1, Math.max(0, p.x + d.dx));
        it.y = Math.min(1, Math.max(0, p.y + d.dy));
      }
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

  function rotateBy(d: number): void {
    commit();
    edits.rotate = (((edits.rotate + d) % 360) + 540) % 360 - 180;
    edits.crop = undefined;
  }

  function removeSelected(): void {
    commit();
    edits.texts = edits.texts.filter((t) => t.id !== selectedId);
    edits.stickers = edits.stickers.filter((s) => s.id !== selectedId);
    selectedId = null;
  }

  function resetAll(): void {
    commit();
    edits = defaultEdits();
    selectedId = null;
  }

  async function apply(): Promise<void> {
    if (!img || !source) return;
    saving = true;
    try {
      const canvas = renderEdited(img, JSON.parse(JSON.stringify(edits)), 1);
      const alpha = /png|gif|webp|svg/.test(source.mime) || edits.rotate % 90 !== 0;
      const type = alpha ? 'image/png' : 'image/jpeg';
      const blob = await canvasToBlob(canvas, type, 0.92);
      const base = source.name.replace(/\.\w+$/, '');
      const ref = await addMediaFile(game, blob, `${base}-edited.${alpha ? 'png' : 'jpg'}`);
      el.editedMedia = ref.id;
      el.edits = JSON.parse(JSON.stringify(edits));
      // Match the box to the new shape so nothing looks squashed.
      el.h = Math.round(el.w * (canvas.height / canvas.width));
      toast('Image edited (original kept)');
      onclose();
    } catch (e) {
      alert('Could not save the edit: ' + (e as Error).message);
    } finally {
      saving = false;
    }
  }

  function revert(): void {
    el.editedMedia = undefined;
    el.edits = undefined;
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
      // Esc in a field (e.g. the meme caption) just leaves the field.
      if (typing) (e.target as HTMLElement).blur();
      else cancel();
    } else if (e.altKey && e.key.startsWith('Arrow')) {
      // Not the clue editor's Prev/Next: that would drop this dialog and its edits.
      e.stopImmediatePropagation();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && !typing) {
      e.stopImmediatePropagation();
      removeSelected();
    }
  }

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
</script>

<svelte:window onkeydowncapture={onkey} />

<div class="backdrop" role="presentation">
  <div class="modal" role="dialog" aria-modal="true" aria-label="Edit image">
    {#if linked}
      <div class="gate">
        <p>🌐 This picture plays from {linkHost(source?.url)}. The image editor works on a copy saved in your game.</p>
        <div class="row">
          <SaveCopyButton id={el.media} label="💾 Save a copy first" onsaved={load} />
          <button onclick={onclose}>Cancel</button>
        </div>
      </div>
    {/if}
    <header class="row">
      <b>🎨 Edit image</b>
      <span class="muted small">{source?.name} · output {out.w}×{out.h}px</span>
      {#if tool === 'crop' && edits.crop && img}
        <span class="small crop-size">crop {Math.round(edits.crop.w * oriented.w)}×{Math.round(edits.crop.h * oriented.h)}px</span>
      {/if}
      {#if source?.mime === 'image/gif'}<span class="warn small">Editing a GIF makes it a still image.</span>{/if}
      <span class="spacer"></span>
      <button class="ghost" onclick={undo} disabled={!history.length} title="Ctrl+Z">↶ Undo</button>
      <button class="ghost" onclick={redo} disabled={!future.length} title="Ctrl+Y or Ctrl+Shift+Z">↷ Redo</button>
      <button class="ghost" onclick={resetAll}>Reset all</button>
      {#if el.editedMedia}<button class="ghost" onclick={revert}>Use original</button>{/if}
      <button onclick={cancel} title="Esc">Cancel</button>
      <button class="primary" onclick={apply} disabled={saving || !img} title="Ctrl+Enter">{saving ? 'Saving…' : 'Apply'}</button>
    </header>

    <div class="tools row">
      {#each [['move', '✋ Move'], ['crop', '✂ Crop'], ['draw', '🖌 Draw'], ['text', '🅣 Text'], ['sticker', '😂 Sticker']] as [k, l]}
        <button class:on={tool === k} onclick={() => (k === 'crop' ? startCrop() : (tool = k as typeof tool))}>{l}</button>
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
            {#each [...edits.texts, ...edits.stickers] as it (it.id)}
              {#if it.id === selectedId}
                <div class="sel" style:left="{it.x * 100}%" style:top="{it.y * 100}%"></div>
              {/if}
            {/each}
          {/if}
        </div>
      </div>

      <aside>
        {#if tool === 'crop'}
          <h4>Crop</h4>
          <div class="row">
            {#each [['free', 'Free'], [16 / 9, '16:9'], [4 / 3, '4:3'], [1, '1:1'], [9 / 16, '9:16']] as [a, l]}
              <button class="small" class:on={cropAspect === a} onclick={() => setAspect(a as 'free' | number)}>{l}</button>
            {/each}
          </div>
          <button class="small" onclick={() => ((edits.crop = undefined), (tool = 'move'))}>Remove crop</button>
          <button class="small primary" onclick={() => (tool = 'move')}>Done cropping</button>
        {/if}

        <h4>Rotate & flip</h4>
        <div class="row">
          <button class="small" onclick={() => rotateBy(-90)}>⟲ 90°</button>
          <button class="small" onclick={() => rotateBy(90)}>⟳ 90°</button>
          <button class="small" class:on={edits.flipH} onclick={() => (commit(), (edits.flipH = !edits.flipH))}>⇋ Flip H</button>
          <button class="small" class:on={edits.flipV} onclick={() => (commit(), (edits.flipV = !edits.flipV))}>⇵ Flip V</button>
        </div>
        <label class="field">Angle {edits.rotate}°<input type="range" min="-180" max="180" step="1" bind:value={edits.rotate} onpointerdown={commit} /></label>
        <label class="field">
          Size {Math.round(edits.scale * 100)}% ({out.w}×{out.h})
          <input type="range" min="0.1" max="2" step="0.05" bind:value={edits.scale} onpointerdown={commit} />
        </label>

        <h4>Adjust</h4>
        {#each SLIDERS as [k, label, min, max, def]}
          <label class="field slider">
            <span>{label} <span class="muted">{edits[k]}</span>{#if edits[k] !== def}<button class="tiny ghost" onclick={() => (commit(), ((edits as unknown as Record<string, number>)[k] = def))}>↺</button>{/if}</span>
            <input type="range" {min} {max} value={edits[k] as number} onpointerdown={commit}
              oninput={(e) => ((edits as unknown as Record<string, number>)[k] = +e.currentTarget.value)} />
          </label>
        {/each}

        {#if tool === 'draw'}
          <h4>Brush</h4>
          <div class="row">
            <input type="color" bind:value={brush.color} />
            <label class="check small"><input type="checkbox" bind:checked={brush.erase} /> Eraser</label>
            <button class="small" onclick={() => (commit(), edits.strokes.pop())} disabled={!edits.strokes.length}>Undo stroke</button>
            <button class="small" onclick={() => (commit(), (edits.strokes = []))} disabled={!edits.strokes.length}>Clear</button>
          </div>
          <label class="field">Size {brush.size}%<input type="range" min="0.3" max="12" step="0.1" bind:value={brush.size} /></label>
        {/if}

        {#if tool === 'sticker'}
          <h4>Stickers <span class="muted small">(click the image to place)</span></h4>
          <div class="stickers">
            {#each STICKERS as s}<button class:on={sticker === s} onclick={() => (sticker = s)}>{s}</button>{/each}
          </div>
        {/if}

        {#if tool === 'text' && !selText}
          <p class="muted small">Click the image to add meme text, or drag existing text to move it.</p>
        {/if}

        {#if selText}
          <h4>Text</h4>
          <textarea id="ie-text" rows="2" bind:value={selText.text}></textarea>
          <select bind:value={selText.font}>
            <option value="Impact, Anton, sans-serif">Impact (meme)</option>
            {#each fonts as f}<option value={f.css}>{f.label}</option>{/each}
          </select>
          <label class="field">Size<input type="range" min="0.02" max="0.3" step="0.005" bind:value={selText.size} /></label>
          <div class="row">
            <label class="check small">Fill <input type="color" bind:value={selText.color} /></label>
            <label class="check small">Outline <input type="color" bind:value={selText.stroke} /></label>
          </div>
          <label class="field">Outline width<input type="range" min="0" max="0.3" step="0.01" bind:value={selText.strokeWidth} /></label>
          <label class="field">Rotation {selText.rotation}°<input type="range" min="-180" max="180" bind:value={selText.rotation} /></label>
          <button class="small bad" onclick={removeSelected}>Delete text</button>
        {:else if selSticker}
          <h4>Sticker {selSticker.emoji}</h4>
          <label class="field">Size<input type="range" min="0.03" max="0.6" step="0.01" bind:value={selSticker.size} /></label>
          <label class="field">Rotation {selSticker.rotation}°<input type="range" min="-180" max="180" bind:value={selSticker.rotation} /></label>
          <button class="small bad" onclick={removeSelected}>Delete sticker</button>
        {/if}
      </aside>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    z-index: 300;
    display: grid;
    /* A viewport-sized track so the modal's max-height/height: 100% resolves against the window. */
    grid-template-rows: minmax(0, 1fr);
    grid-template-columns: minmax(0, 1fr);
    place-items: center;
    padding: 12px;
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
  .modal {
    position: relative;
    width: min(1300px, 100%);
    height: min(900px, 100%);
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
  }
  .small {
    font-size: 12px;
  }
  .warn {
    color: var(--warn);
  }
  .crop-size {
    color: var(--accent);
  }
  .tools button.on,
  button.on {
    background: var(--accent);
    border-color: var(--accent);
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
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
  }
  .slider span {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .tiny {
    padding: 0 4px;
    font-size: 11px;
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
