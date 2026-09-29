<!-- Freeform 16:9 slide editor (spec §5.3): toolbar, canvas with handles, and an inspector. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { app, toast } from '../../lib/app.svelte';
  import { clipboard } from '../../lib/clipboard.svelte';
  import { ACCEPT, addMediaFile, canPlay, mediaUrls } from '../../lib/media.svelte';
  import { classifyUrl, youtubeStart } from '../../lib/mediactl.svelte';
  import { registerGameFonts, uploadedFamily } from '../../lib/fonts';
  import { pickFile } from '../../lib/fileio';
  import { clone } from '../../lib/ops';
  import { restack, type Restack } from '../../lib/layers';
  import {
    newAudioEl, newEmbedEl, newId, newImageEl, newShapeEl, newTextEl, newVideoEl, SLIDE_H, SLIDE_W,
    type ImageEl, type MediaKind, type ShapeType, type Slide, type SlideElement, type TextEl,
  } from '../../lib/model';
  import Stage from '../../lib/Stage.svelte';
  import SlideView from '../../lib/slide/SlideView.svelte';
  import EditLayer from './EditLayer.svelte';
  import Inspector from './Inspector.svelte';
  import MediaPicker from './MediaPicker.svelte';
  import ImageEditor from './ImageEditor.svelte';
  import LayersPanel from './LayersPanel.svelte';
  import LayerMenu from './LayerMenu.svelte';
  import type { LayerAction } from './layerlabel';
  import { themeStyle } from '../../lib/theme';

  let {
    slide,
    onapplystyle,
  }: {
    slide: Slide;
    onapplystyle?: (el: TextEl, scope: string) => void;
  } = $props();
  let editingImage = $state<string | null>(null);
  const imageEl = $derived(slide.elements.find((e) => e.id === editingImage && e.kind === 'image') as ImageEl | undefined);

  const game = $derived(app.game);
  let selected = $state<string[]>([]);
  let picker = $state<MediaKind | null>(null);
  let replacing = $state<string | null>(null);
  let shapeMenu = $state(false);
  let previewKey = $state(0);
  let previewing = $state(false);
  let textArea = $state<HTMLTextAreaElement>();
  let canvasEl = $state<HTMLDivElement>();
  // Layers: items hidden while editing, the item under the mouse, and the right-click menu.
  let hidden = $state<string[]>([]);
  let hovered = $state<string | null>(null);
  let menu = $state<{ x: number; y: number; stack: SlideElement[] } | null>(null);
  const editView = $derived(hidden.length ? { ...slide, elements: slide.elements.filter((e) => !hidden.includes(e.id)) } : slide);

  const single = $derived(selected.length === 1 ? slide.elements.find((e) => e.id === selected[0]) : undefined);
  const topZ = () => Math.max(0, ...slide.elements.map((e) => e.zIndex)) + 1;

  // ---------- Undo history (Ctrl+Z / Ctrl+Y inside the slide editor) ----------
  let history: string[] = [];
  let future: string[] = [];
  let last: string | null = null;
  let histTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const snap = JSON.stringify(slide);
    if (last === null) {
      last = snap;
      return;
    }
    clearTimeout(histTimer);
    histTimer = setTimeout(() => {
      if (snap === last || last === null) return;
      history.push(last);
      if (history.length > 100) history.shift();
      future = [];
      last = snap;
    }, 300);
  });
  function restore(s: string): void {
    const d = JSON.parse(s) as Slide;
    slide.background = d.background;
    slide.elements = d.elements;
    last = s;
    selected = selected.filter((id) => d.elements.some((e) => e.id === id));
  }
  function undo(): void {
    const prev = history.pop();
    if (!prev) return;
    future.push(JSON.stringify(slide));
    restore(prev);
  }
  function redo(): void {
    const next = future.pop();
    if (!next) return;
    history.push(JSON.stringify(slide));
    restore(next);
  }

  onMount(() => {
    registerGameFonts(game);
  });

  // ---------- Adding elements ----------
  function add(el: SlideElement, at?: { x: number; y: number }): void {
    el.zIndex = topZ();
    if (at) {
      el.x = Math.round(at.x - el.w / 2);
      el.y = Math.round(at.y - el.h / 2);
    }
    slide.elements.push(el);
    selected = [el.id];
  }

  function addText(): void {
    const t = newTextEl('New text', { x: 460, y: 390, w: 1000, h: 300 });
    t.size = 90;
    add(t);
    setTimeout(() => textArea?.select(), 0);
  }

  function imageSize(id: string): Promise<{ w: number; h: number }> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1100 / img.naturalWidth, 700 / img.naturalHeight, 1.5);
        resolve({ w: Math.round(img.naturalWidth * s) || 960, h: Math.round(img.naturalHeight * s) || 540 });
      };
      img.onerror = () => resolve({ w: 960, h: 540 });
      img.src = mediaUrls[id];
    });
  }

  async function addMedia(kind: MediaKind, id: string, at?: { x: number; y: number }): Promise<void> {
    if (kind === 'image') {
      const { w, h } = await imageSize(id);
      add(newImageEl(id, w, h), at);
    } else if (kind === 'video') add(newVideoEl(id), at);
    else if (kind === 'audio') add(newAudioEl(id), at);
    else if (kind === 'font') {
      await registerGameFonts(game);
      if (single?.kind === 'text') single.font = `'${uploadedFamily(id)}', sans-serif`;
      toast('Font added: pick it from the Font list');
    }
  }

  async function picked(id: string): Promise<void> {
    const kind = picker!;
    picker = null;
    if (replacing) {
      const el = slide.elements.find((e) => e.id === replacing);
      replacing = null;
      if (el && (el.kind === 'image' || el.kind === 'video' || el.kind === 'audio')) {
        el.media = id;
        if (el.kind === 'image') {
          el.editedMedia = undefined;
          el.edits = undefined;
        }
      }
      return;
    }
    await addMedia(kind, id);
  }

  function addShape(shape: ShapeType): void {
    shapeMenu = false;
    add(newShapeEl(shape));
  }

  function addLink(): void {
    const url = prompt('Paste a YouTube link or a direct link to an image, video or audio file.\n\nThis will need internet during the game.');
    if (!url?.trim()) return;
    const kind = classifyUrl(url);
    if (!kind) {
      toast("That doesn't look like a link");
      return;
    }
    const el = newEmbedEl(url.trim(), kind);
    if (kind === 'youtube') el.startAt = youtubeStart(url);
    add(el);
  }

  async function dropFiles(files: FileList, at: { x: number; y: number }): Promise<void> {
    for (const file of Array.from(files)) {
      try {
        const ref = await addMediaFile(game, file);
        if ((ref.kind === 'video' || ref.kind === 'audio') && !canPlay(ref.mime))
          toast(`⚠ This browser may not play "${ref.name}". MP4 (H.264) / MP3 are safest.`, 7000);
        await addMedia(ref.kind, ref.id, at);
      } catch (e) {
        toast((e as Error).message, 5000);
      }
    }
  }

  function ondrop(e: DragEvent): void {
    e.preventDefault();
    if (!e.dataTransfer?.files.length || !canvasEl) return;
    const stageEl = canvasEl.querySelector('.stage') as HTMLElement;
    const r = stageEl.getBoundingClientRect();
    const at = { x: ((e.clientX - r.left) / r.width) * SLIDE_W, y: ((e.clientY - r.top) / r.height) * SLIDE_H };
    dropFiles(e.dataTransfer.files, at);
  }

  // ---------- Selection actions ----------
  function remove(): void {
    const locked = slide.elements.filter((e) => selected.includes(e.id) && e.locked).length;
    slide.elements = slide.elements.filter((e) => !selected.includes(e.id) || e.locked);
    selected = selected.filter((id) => slide.elements.some((e) => e.id === id));
    if (locked) toast(`${locked === 1 ? 'A locked item was' : `${locked} locked items were`} kept. Unlock to delete.`);
  }

  function duplicate(): void {
    const copies = slide.elements.filter((e) => selected.includes(e.id)).map((e) => ({ ...clone(e), id: newId(), x: e.x + 30, y: e.y + 30 }));
    for (const c of copies) c.zIndex = topZ();
    slide.elements.push(...copies);
    selected = copies.map((c) => c.id);
  }

  function order(dir: 'front' | 'back' | 'up' | 'down'): void {
    restack(slide.elements, selected, dir === 'up' ? 'forward' : dir === 'down' ? 'backward' : dir);
  }

  function menuAction(a: LayerAction): void {
    if (a === 'front' || a === 'forward' || a === 'backward' || a === 'back') restack(slide.elements, selected, a);
    else if (a === 'duplicate') duplicate();
    else if (a === 'lock' || a === 'unlock') {
      for (const e of slide.elements) if (selected.includes(e.id)) e.locked = a === 'lock' || undefined;
    } else if (a === 'hide') {
      hidden = [...hidden, ...selected];
      selected = [];
    } else if (a === 'delete') remove();
  }

  /** Tab / Shift+Tab: select the next item down (or up) the stack. */
  function cycle(dir: 1 | -1): void {
    const list = slide.elements.filter((e) => !hidden.includes(e.id)).sort((a, b) => b.zIndex - a.zIndex);
    if (!list.length) return;
    const i = selected.length ? list.findIndex((e) => e.id === selected[selected.length - 1]) : -1;
    selected = [list[(i + dir + list.length) % list.length].id];
  }

  function align(how: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'): void {
    for (const e of slide.elements.filter((x) => selected.includes(x.id) && !x.locked)) {
      if (how === 'left') e.x = 0;
      if (how === 'hcenter') e.x = Math.round((SLIDE_W - e.w) / 2);
      if (how === 'right') e.x = SLIDE_W - e.w;
      if (how === 'top') e.y = 0;
      if (how === 'vcenter') e.y = Math.round((SLIDE_H - e.h) / 2);
      if (how === 'bottom') e.y = SLIDE_H - e.h;
    }
  }

  function copySlide(): void {
    clipboard.slide = clone(slide);
    toast('Slide copied');
  }

  function pasteSlide(): void {
    if (!clipboard.slide || !confirm('Replace everything on this slide with the copied slide?')) return;
    const s = clone(clipboard.slide);
    for (const e of s.elements) e.id = newId();
    slide.background = s.background;
    slide.elements = s.elements;
    selected = [];
  }

  function typing(e: Event): boolean {
    return !!(e.target as HTMLElement)?.closest?.('input, textarea, select, [contenteditable]');
  }

  function onkey(e: KeyboardEvent): void {
    if (typing(e) || picker || menu) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    const onCanvas = document.activeElement === document.body || !!canvasEl?.contains(document.activeElement);
    if (k === 'tab' && !mod && !e.altKey && onCanvas && slide.elements.length) {
      e.preventDefault();
      cycle(e.shiftKey ? -1 : 1);
    } else if (mod && (e.code === 'BracketRight' || e.code === 'BracketLeft') && selected.length) {
      e.preventDefault();
      const up = e.code === 'BracketRight';
      restack(slide.elements, selected, e.shiftKey ? (up ? 'front' : 'back') : up ? 'forward' : 'backward');
    } else if (mod && k === 'z') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.shiftKey) redo();
      else undo();
    } else if (mod && k === 'y') {
      e.preventDefault();
      redo();
    } else if (mod && k === 'd' && selected.length) {
      e.preventDefault();
      duplicate();
    } else if (mod && k === 'a') {
      e.preventDefault();
      selected = slide.elements.filter((x) => !x.locked && !hidden.includes(x.id)).map((x) => x.id);
    } else if ((k === 'delete' || k === 'backspace') && selected.length) {
      e.preventDefault();
      remove();
    } else if (k === 'escape' && selected.length) {
      e.stopImmediatePropagation();
      selected = [];
    } else if (k.startsWith('arrow') && selected.length && !e.altKey) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      for (const el of slide.elements.filter((x) => selected.includes(x.id) && !x.locked)) {
        if (k === 'arrowleft') el.x -= step;
        if (k === 'arrowright') el.x += step;
        if (k === 'arrowup') el.y -= step;
        if (k === 'arrowdown') el.y += step;
      }
    }
  }

  function oncopy(e: ClipboardEvent): void {
    if (typing(e) || !selected.length) return;
    e.preventDefault();
    clipboard.elements = clone(slide.elements.filter((x) => selected.includes(x.id)));
    toast(`Copied ${clipboard.elements.length} item(s)`);
  }

  function onpaste(e: ClipboardEvent): void {
    if (typing(e)) return;
    const files = e.clipboardData?.files;
    if (files?.length) {
      e.preventDefault();
      dropFiles(files, { x: SLIDE_W / 2, y: SLIDE_H / 2 });
      return;
    }
    if (clipboard.elements.length) {
      e.preventDefault();
      const copies = clipboard.elements.map((x) => ({ ...clone(x), id: newId(), zIndex: topZ() }));
      slide.elements.push(...copies);
      selected = copies.map((c) => c.id);
    }
  }

  function preview(): void {
    previewing = !previewing;
    previewKey++;
  }
</script>

<svelte:window onkeydowncapture={(e) => !editingImage && onkey(e)} oncopy={oncopy} onpaste={onpaste} />

{#if imageEl}
  <ImageEditor el={imageEl} onclose={() => (editingImage = null)} />
{/if}
{#if menu}
  <LayerMenu
    {...menu}
    selected={slide.elements.filter((e) => selected.includes(e.id))}
    {game}
    bind:hovered
    onpick={(id) => (selected = [id])}
    onaction={menuAction}
    onclose={() => (menu = null)}
  />
{/if}

<div class="se">
  <div class="toolbar">
    <button onclick={addText} title="Add a text box">🅣 Text</button>
    <div class="pop">
      <button onclick={() => (picker = 'image')}>🖼 Image</button>
      {#if picker === 'image' && !replacing}<MediaPicker kind="image" onpick={picked} onclose={() => (picker = null)} />{/if}
    </div>
    <div class="pop">
      <button onclick={() => (picker = 'video')}>🎬 Video</button>
      {#if picker === 'video' && !replacing}<MediaPicker kind="video" onpick={picked} onclose={() => (picker = null)} />{/if}
    </div>
    <div class="pop">
      <button onclick={() => (picker = 'audio')}>🔊 Audio</button>
      {#if picker === 'audio' && !replacing}<MediaPicker kind="audio" onpick={picked} onclose={() => (picker = null)} />{/if}
    </div>
    <div class="pop">
      <button onclick={() => (shapeMenu = !shapeMenu)}>◼ Shape ▾</button>
      {#if shapeMenu}
        <div class="menu">
          <button onclick={() => addShape('rect')}>▭ Rectangle</button>
          <button onclick={() => addShape('ellipse')}>◯ Ellipse</button>
          <button onclick={() => addShape('line')}>― Line</button>
          <button onclick={() => addShape('arrow')}>➝ Arrow</button>
        </div>
      {/if}
    </div>
    <button onclick={addLink} title="YouTube or a link to online media (needs internet)">🌐 Link</button>
    <span class="sep"></span>
    <label class="bg" title="Slide background color">
      BG <input type="color" value={slide.background.color ?? '#060ce9'} oninput={(e) => (slide.background.color = e.currentTarget.value)} />
    </label>
    <div class="pop">
      <button onclick={() => (picker = 'image', (replacing = 'bg'))} title="Background image">🖼 BG</button>
      {#if picker === 'image' && replacing === 'bg'}
        <MediaPicker
          kind="image"
          onpick={(id) => {
            slide.background.image = id;
            picker = null;
            replacing = null;
          }}
          onclose={() => ((picker = null), (replacing = null))}
        />
      {/if}
    </div>
    {#if slide.background.image || slide.background.color}
      <button class="ghost small" onclick={() => (slide.background = {})} title="Reset background">✕ BG</button>
    {/if}
    <span class="spacer"></span>
    <button class="ghost small" onclick={copySlide}>Copy slide</button>
    <button class="ghost small" onclick={pasteSlide} disabled={!clipboard.slide}>Paste slide</button>
    <button class="small" class:primary={previewing} onclick={preview} title="Play entrance animations and media">▶ Preview</button>
    <button class="ghost small" onclick={undo} title="Undo (Ctrl+Z)">↶</button>
    <button class="ghost small" onclick={redo} title="Redo (Ctrl+Y)">↷</button>
  </div>

  <div class="body">
    <div
      class="canvas"
      style={themeStyle(game.theme)}
      bind:this={canvasEl}
      ondragover={(e) => e.preventDefault()}
      {ondrop}
      role="region"
      aria-label="Slide canvas. Drop files here."
    >
      <Stage>
        {#if previewing}
          {#key previewKey}
            <SlideView {slide} mode="play" role="mirror" />
          {/key}
        {:else}
          <SlideView slide={editView} mode="edit" />
          <EditLayer
            {slide}
            bind:selected
            {hidden}
            bind:hovered
            onmenu={(m) => (menu = m)}
            onchange={() => {}}
            ondblclick={(el) => (el.kind === 'text' ? textArea?.focus() : el.kind === 'image' && (editingImage = el.id))}
          />
        {/if}
      </Stage>
    </div>

    <aside class="side">
      {#if slide.elements.length > 1 || hidden.length}
        <details class="layers-box" open>
          <summary>Layers <span class="muted">({slide.elements.length}, top first)</span></summary>
          <LayersPanel elements={slide.elements} {game} bind:selected bind:hidden bind:hovered />
        </details>
      {/if}
      {#if single}
        <Inspector
          el={single}
          {game}
          bind:textArea
          onorder={order}
          onduplicate={duplicate}
          ondelete={remove}
          onreplace={() => {
            if (single && (single.kind === 'image' || single.kind === 'video' || single.kind === 'audio')) {
              replacing = single.id;
              picker = single.kind;
            }
          }}
          onapplystyle={(el, scope) => onapplystyle?.(el, scope)}
          onuploadfont={() => {
            replacing = null;
            picker = 'font';
          }}
          oneditimage={single.kind === 'image' ? () => (editingImage = single!.id) : undefined}
        />
        {#if picker && replacing === single.id}
          <div class="pop-anchor"><MediaPicker kind={picker} onpick={picked} onclose={() => ((picker = null), (replacing = null))} /></div>
        {/if}
      {:else if selected.length > 1}
        <p class="muted">{selected.length} items selected.</p>
        <div class="row">
          <button class="small" onclick={duplicate}>Duplicate</button>
          <button class="small bad" onclick={remove}>Delete</button>
        </div>
      {:else}
        <p class="muted">
          Click an item to edit it. Drag to move, pull the handles to resize, and use the round handle to rotate. Drop image, video or
          audio files onto the slide. Shift-click or drag a box on an empty spot to select several. Ctrl+C / Ctrl+V copy items
          between slides.
        </p>
        <p class="muted small">
          Something hidden under a bigger item? <b>Right-click</b> to pick from everything under the pointer, <b>Alt+click</b> to
          go one layer down, <b>Tab</b> to step through items, or use the <b>Layers</b> list. Lock a background so clicks go
          through it.
        </p>
      {/if}
      {#if selected.length}
        <div class="aligns">
          <span class="muted small">Align to slide</span>
          <div class="row">
            <button class="small" onclick={() => align('left')} title="Left">⇤</button>
            <button class="small" onclick={() => align('hcenter')} title="Center horizontally">↔</button>
            <button class="small" onclick={() => align('right')} title="Right">⇥</button>
            <button class="small" onclick={() => align('top')} title="Top">⤒</button>
            <button class="small" onclick={() => align('vcenter')} title="Center vertically">↕</button>
            <button class="small" onclick={() => align('bottom')} title="Bottom">⤓</button>
          </div>
        </div>
      {/if}
      {#if picker === 'font'}
        <div class="pop-anchor"><MediaPicker kind="font" onpick={(id) => ((picker = null), addMedia('font', id))} onclose={() => (picker = null)} /></div>
      {/if}
    </aside>
  </div>
</div>

<style>
  .se {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 0;
  }
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .pop {
    position: relative;
  }
  .menu {
    position: absolute;
    top: 100%;
    left: 0;
    z-index: 50;
    margin-top: 4px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 6px;
  }
  .menu button {
    text-align: left;
  }
  .sep {
    width: 8px;
  }
  .bg {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--muted);
    font-size: 12px;
  }
  .small {
    font-size: 12px;
  }
  .body {
    display: grid;
    grid-template-columns: 1fr 300px;
    gap: 12px;
    min-height: 0;
  }
  .canvas {
    aspect-ratio: 16 / 9;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
    align-self: start;
  }
  .side {
    position: relative;
    overflow-y: auto;
    max-height: 70vh;
    padding-right: 4px;
  }
  .side p {
    margin: 0 0 8px;
  }
  .aligns {
    margin-top: 12px;
  }
  .layers-box {
    margin-bottom: 12px;
  }
  .layers-box summary {
    cursor: pointer;
    margin-bottom: 6px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
  }
  .layers-box :global(.layers) {
    max-height: 190px;
    overflow-y: auto;
  }
  .pop-anchor {
    position: relative;
  }
  @media (max-width: 900px) {
    .body {
      grid-template-columns: 1fr;
    }
    .side {
      max-height: none;
    }
  }
</style>
