<!--
  Free-placed images on a round's board screen (Round.decor): logos, stickers, memes. Drag, resize and
  rotate them over a live preview of the board, fade them, put them behind the tiles, or let clicks
  pass through them to the tiles.
-->
<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { app, toast } from '../lib/app.svelte';
  import { begin, history, redo, step, stepAsync, undo } from '../lib/history.svelte';
  import { addMediaFile, mediaUrls } from '../lib/media.svelte';
  import { newLive } from '../lib/live';
  import { clone } from '../lib/ops';
  import { restack } from '../lib/layers';
  import { boardRounds, newId, newImageEl, SLIDE_H, SLIDE_W, type BoardDecor, type ImageEl, type BoardRound, type Slide, type SlideElement } from '../lib/model';
  import { newSession } from '../lib/session';
  import Stage from '../lib/Stage.svelte';
  import AudienceView from '../play/AudienceView.svelte';
  import EditLayer from './slide/EditLayer.svelte';
  import Inspector from './slide/Inspector.svelte';
  import LayersPanel from './slide/LayersPanel.svelte';
  import MediaPicker from './slide/MediaPicker.svelte';
  import ImageEditor from './slide/ImageEditor.svelte';
  import LayerMenu from './slide/LayerMenu.svelte';
  import { lockedNote, type LayerAction } from '../lib/layerlabel';
  import { itemsFor, placeElement, take } from '../lib/nav.svelte';

  let { round, onclose }: { round: BoardRound; onclose: () => void } = $props();

  const game = $derived(app.game);
  const decor = $derived(round.decor ?? []);
  // EditLayer and the Inspector work on slides; the board's images are image elements, so wrap them as one.
  const pseudo = $derived<Slide>({ background: {}, elements: decor });
  let selected = $state<string[]>([]);
  let hidden = $state<string[]>([]);
  let hovered = $state<string | null>(null);
  let picking = $state<'add' | 'replace' | null>(null);
  /** The Replace… button its picker drops from. */
  let replaceFrom = $state<HTMLElement>();
  let editingImage = $state<string | null>(null);
  let canvasEl = $state<HTMLDivElement>();
  let menu = $state<{ x: number; y: number; stack: SlideElement[] } | null>(null);
  const single = $derived(selected.length === 1 ? decor.find((d) => d.id === selected[0]) : undefined);
  const imageEl = $derived(decor.find((d) => d.id === editingImage) as ImageEl | undefined);
  const others = $derived(boardRounds(game).filter((r) => r.id !== round.id));
  // Images an undo took away are no longer selected (or hidden).
  $effect(() => {
    const ids = new Set(decor.map((d) => d.id));
    untrack(() => {
      if (selected.some((id) => !ids.has(id))) selected = selected.filter((id) => ids.has(id));
      if (hidden.some((id) => !ids.has(id))) hidden = hidden.filter((id) => ids.has(id));
    });
  });
  // An undo or redo that changed an image here selects it (and the others it changed with it).
  const handled = { seq: 0 };
  $effect(() => {
    const place = take(handled);
    const id = place && placeElement(place);
    untrack(() => {
      if (id && decor.some((d) => d.id === id)) selected = itemsFor(id, decor);
    });
  });

  // The board as it looks at the start of this round, minus anything hidden while editing.
  const session = $derived.by(() => {
    const s = newSession(game);
    s.currentRound = Math.max(0, game.rounds.findIndex((r) => r.id === round.id));
    if (!s.players.length)
      s.players = ['Alex', 'Sam', 'Jordan'].map((name, i) => ({ id: `demo-${i}`, name, color: ['#e6194b', '#3cb44b', '#4363d8'][i], startScore: 0 }));
    return s;
  });
  const preview = $derived(
    hidden.length
      ? { ...game, rounds: game.rounds.map((r) => (r.id === round.id ? { ...r, decor: decor.filter((d) => !hidden.includes(d.id)) } : r)) }
      : game,
  );
  const live = newLive();

  const topZ = () => Math.max(0, ...decor.map((d) => d.zIndex)) + 1;

  // ---------- Undo: the game's history, as in the slide editor (Ctrl+Z / Ctrl+Y are the editor's) ----------
  // Adding, deleting or restacking is a step of its own, and so is each drag.
  /** Record a discrete edit as its own undo step. */
  const edit = (fn: () => void) => step(null, fn);
  let endDrag: (() => void) | null = null;
  onDestroy(() => endDrag?.());

  // "Deleted image · Undo" on the board, until the next change or a few seconds.
  let notice = $state<{ text: string; undo?: () => void; at: string | null } | null>(null);
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;
  function tell(text: string, undoFn?: () => void): void {
    notice = { text, undo: undoFn, at: history.top };
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => (notice = null), 6000);
  }

  /** round.decor, created on first use (assign first, then read back: pushing to `??= []` would miss the proxy). */
  function items(): BoardDecor[] {
    if (!round.decor) round.decor = [];
    return round.decor;
  }

  function imageSize(id: string): Promise<{ w: number; h: number }> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(560 / img.naturalWidth, 400 / img.naturalHeight, 1.5);
        resolve({ w: Math.round(img.naturalWidth * s) || 480, h: Math.round(img.naturalHeight * s) || 270 });
      };
      img.onerror = () => resolve({ w: 480, h: 270 });
      img.src = mediaUrls[id];
    });
  }

  async function add(id: string, at?: { x: number; y: number }): Promise<void> {
    const { w, h } = await imageSize(id);
    const d: BoardDecor = { ...newImageEl(id, w, h), clickThrough: true, zIndex: topZ() };
    if (at) {
      d.x = Math.round(at.x - w / 2);
      d.y = Math.round(at.y - h / 2);
    }
    edit(() => {
      items().push(d);
      selected = [d.id];
    });
  }

  // The files and the board images they make: one step.
  function addFiles(files: FileList | File[], at?: { x: number; y: number }): Promise<void> {
    return stepAsync(null, async () => {
      let i = 0;
      for (const file of Array.from(files)) {
        try {
          const ref = await addMediaFile(game, file);
          if (ref.kind !== 'image') {
            toast(`"${ref.name}" isn't an image. Board images can be pictures or GIFs.`);
            continue;
          }
          await add(ref.id, at && { x: at.x + i * 40, y: at.y + i * 40 });
          i++;
        } catch (e) {
          toast((e as Error).message, 5000);
        }
      }
    });
  }

  function picked(id: string): void {
    const el = single;
    if (picking === 'replace' && el)
      edit(() => {
        el.media = id;
        el.editedMedia = undefined;
        el.edits = undefined;
      });
    else add(id);
    picking = null;
  }

  function ondrop(e: DragEvent): void {
    e.preventDefault();
    if (!e.dataTransfer?.files.length || !canvasEl) return;
    const r = (canvasEl.querySelector('.stage') as HTMLElement).getBoundingClientRect();
    addFiles(e.dataTransfer.files, { x: ((e.clientX - r.left) / r.width) * SLIDE_W, y: ((e.clientY - r.top) / r.height) * SLIDE_H });
  }

  function remove(): void {
    const gone = decor.filter((d) => selected.includes(d.id) && !d.locked);
    const locked = decor.filter((d) => selected.includes(d.id) && d.locked).length;
    if (!gone.length) {
      if (locked) tell(lockedNote(locked, 'image'));
      return;
    }
    edit(() => {
      round.decor = decor.filter((d) => !gone.includes(d));
      selected = selected.filter((id) => decor.some((d) => d.id === id));
    });
    tell(`Deleted ${gone.length === 1 ? 'image' : `${gone.length} images`}${locked ? ` · ${lockedNote(locked, 'image')}` : ''}`, () => undo('button'));
  }

  function duplicate(): void {
    edit(() => {
      const copies = decor.filter((d) => selected.includes(d.id)).map((d) => ({ ...clone(d), id: newId(), x: d.x + 30, y: d.y + 30, zIndex: topZ() }));
      items().push(...copies);
      selected = copies.map((c) => c.id);
    });
  }

  function order(dir: 'front' | 'back' | 'up' | 'down'): void {
    edit(() => restack(decor, selected, dir === 'up' ? 'forward' : dir === 'down' ? 'backward' : dir));
  }

  function menuAction(a: LayerAction): void {
    if (a === 'front' || a === 'forward' || a === 'backward' || a === 'back') edit(() => restack(decor, selected, a));
    else if (a === 'duplicate') duplicate();
    else if (a === 'lock' || a === 'unlock')
      edit(() => {
        for (const d of decor) if (selected.includes(d.id)) d.locked = a === 'lock' || undefined;
      });
    else if (a === 'hide') {
      hidden = [...hidden, ...selected];
      selected = [];
    } else if (a === 'delete') remove();
  }

  /** Copy the selected images (or all of them) onto every other round's board. */
  function copyToRounds(): void {
    const src = selected.length ? decor.filter((d) => selected.includes(d.id)) : decor;
    if (!src.length || !others.length) return;
    const what = `${src.length} image${src.length === 1 ? '' : 's'} to ${others.length} other round${others.length === 1 ? '' : 's'}`;
    step(`Copied ${what}`, () => {
      for (const r of others) {
        if (!r.decor) r.decor = [];
        const z = Math.max(0, ...r.decor.map((d) => d.zIndex)) + 1;
        r.decor.push(...src.map((d, i) => ({ ...clone(d), id: newId(), zIndex: z + i })));
      }
    });
    toast(`Copied ${what}`);
  }

  function typing(e: Event): boolean {
    return !!(e.target as HTMLElement)?.closest?.('input, textarea, select, [contenteditable]');
  }

  function onkey(e: KeyboardEvent): void {
    if (editingImage || picking || menu || typing(e)) return;
    const k = e.key.toLowerCase();
    const mod = e.ctrlKey || e.metaKey;
    if (k === 'tab' && !mod && !e.altKey && (document.activeElement === document.body || !!canvasEl?.contains(document.activeElement)) && decor.length) {
      const list = decor.filter((d) => !hidden.includes(d.id)).sort((a, b) => b.zIndex - a.zIndex);
      const i = selected.length ? list.findIndex((d) => d.id === selected[selected.length - 1]) : -1;
      if (list.length) selected = [list[(i + (e.shiftKey ? -1 : 1) + list.length) % list.length].id];
    } else if (mod && (e.code === 'BracketRight' || e.code === 'BracketLeft') && selected.length) {
      const up = e.code === 'BracketRight';
      edit(() => restack(decor, selected, e.shiftKey ? (up ? 'front' : 'back') : up ? 'forward' : 'backward'));
    } else if (k === 'escape') {
      if (selected.length) selected = [];
      else onclose();
    } else if ((k === 'delete' || k === 'backspace') && selected.length) {
      remove();
    } else if (mod && k === 'd' && selected.length) {
      duplicate();
    } else if (mod && k === 'a') {
      selected = decor.filter((d) => !d.locked && !hidden.includes(d.id)).map((d) => d.id);
    } else if (k.startsWith('arrow') && selected.length && !(e.target as HTMLElement)?.closest?.('[role="list"]')) {
      const step = e.shiftKey ? 10 : 1;
      for (const d of decor.filter((x) => selected.includes(x.id) && !x.locked)) {
        if (k === 'arrowleft') d.x -= step;
        if (k === 'arrowright') d.x += step;
        if (k === 'arrowup') d.y -= step;
        if (k === 'arrowdown') d.y += step;
      }
    } else return;
    // Handled here: keep it from the editor underneath.
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  function onpaste(e: ClipboardEvent): void {
    if (typing(e) || !e.clipboardData?.files.length) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    addFiles(e.clipboardData.files, { x: SLIDE_W / 2, y: SLIDE_H / 2 });
  }
</script>

<svelte:window onkeydowncapture={onkey} onpastecapture={onpaste} />

{#if imageEl}
  <ImageEditor el={imageEl} onclose={() => (editingImage = null)} />
{/if}
{#if menu}
  <LayerMenu
    {...menu}
    selected={decor.filter((d) => selected.includes(d.id))}
    {game}
    bind:hovered
    onpick={(id) => (selected = [id])}
    onaction={menuAction}
    onclose={() => (menu = null)}
  />
{/if}

<div class="backdrop" role="presentation">
  <div class="modal" role="dialog" aria-modal="true" aria-label="Board images">
    <header>
      <div>
        <div class="muted small">{round.name}</div>
        <h3>🖼 Board images</h3>
      </div>
      <div class="pop">
        <button class="primary" onclick={() => (picking = 'add')}>＋ Add image</button>
        {#if picking === 'add'}<MediaPicker kind="image" onpick={picked} onclose={() => (picking = null)} />{/if}
      </div>
      <button onclick={copyToRounds} disabled={!decor.length || !others.length} title="Put a copy of the selected images (or all of them) on every other round's board">
        Copy {selected.length ? 'selected' : 'all'} to other rounds
      </button>
      <span class="spacer"></span>
      <button class="ghost" onclick={() => undo()} disabled={!history.canUndo} aria-label="Undo (Ctrl+Z)" title={history.undoTitle}>↶</button>
      <button class="ghost" onclick={() => redo()} disabled={!history.canRedo} aria-label="Redo (Ctrl+Y)" title={history.redoTitle}>↷</button>
      <button class="primary" onclick={onclose}>Done</button>
    </header>

    <div class="body">
      <div
        class="canvas"
        bind:this={canvasEl}
        ondragover={(e) => e.preventDefault()}
        {ondrop}
        role="region"
        aria-label="Board preview. Drop images here."
      >
        <Stage>
          <AudienceView game={preview} {session} {live} role="mirror" />
          <EditLayer
            slide={pseudo}
            bind:selected
            {hidden}
            bind:hovered
            onmenu={(m) => (menu = m)}
            onstart={() => {
              endDrag?.();
              endDrag = begin();
            }}
            onchange={() => {
              endDrag?.();
              endDrag = null;
            }}
            ondblclick={(el) => el.kind === 'image' && (editingImage = el.id)}
          />
        </Stage>
        {#if notice && notice.at === history.top && !history.pending}
          <div class="notice" role="status">
            <span>{notice.text}</span>
            {#if notice.undo}
              <button
                class="small"
                onclick={() => {
                  const fn = notice?.undo;
                  notice = null;
                  fn?.();
                }}>Undo</button>
            {/if}
          </div>
        {/if}
      </div>

      <aside class="side">
        <section>
          <h4>Layers <span class="muted">(top first)</span></h4>
          <LayersPanel elements={decor} {game} bind:selected bind:hidden bind:hovered onedit={edit} />
        </section>
        {#if single}
          <section class="board-opts">
            <h4>On the board</h4>
            <label class="field">
              Opacity {Math.round(single.opacity * 100)}%
              <input type="range" min="0" max="1" step="0.05" bind:value={single.opacity} />
            </label>
            <label class="check">
              <input type="checkbox" checked={!!single.behind} onchange={(e) => (single.behind = e.currentTarget.checked || undefined)} />
              <span>Behind the tiles <span class="muted">(peeks through the gaps)</span></span>
            </label>
            <label class="check" class:dim={single.behind}>
              <input type="checkbox" checked={!!single.clickThrough} onchange={(e) => (single.clickThrough = e.currentTarget.checked || undefined)} />
              <span>Click-through <span class="muted">(clicks reach the tiles under it)</span></span>
            </label>
          </section>
          <Inspector
            el={single}
            {game}
            onorder={order}
            onduplicate={duplicate}
            ondelete={remove}
            onreplace={(from) => ((picking = 'replace'), (replaceFrom = from))}
            onapplystyle={() => {}}
            onuploadfont={() => {}}
            oneditimage={() => (editingImage = single!.id)}
            onedit={edit}
          />
          {#if picking === 'replace'}
            <MediaPicker kind="image" anchor={replaceFrom} onpick={picked} onclose={() => (picking = null)} />
          {/if}
        {:else if selected.length > 1}
          <p class="muted">{selected.length} images selected.</p>
          <div class="row">
            <button class="small" onclick={duplicate}>Duplicate</button>
            <button class="small bad" onclick={remove}>Delete</button>
          </div>
        {:else}
          <p class="muted small">
            Add logos, stickers or GIFs anywhere on this round's board. Drop image files onto the preview or paste them. Drag to
            move, pull the handles to resize, and use the round handle to rotate. Double-click an image to edit it. Right-click,
            Alt+click or the Layers list picks an image hidden under another.
          </p>
        {/if}
      </aside>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    grid-template-columns: minmax(0, 1fr);
    place-items: center;
    z-index: 100;
    padding: 12px;
  }
  .modal {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    width: min(1400px, 100%);
    max-height: 100%;
    overflow: auto;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  header {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  h3 {
    margin: 0;
  }
  h4 {
    margin: 0 0 6px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
  }
  .body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px;
    gap: 12px;
    min-height: 0;
  }
  .canvas {
    position: relative;
    aspect-ratio: 16 / 9;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
    align-self: start;
    /* Keep the whole board on screen on short windows. */
    max-height: calc(100dvh - 140px);
    max-width: calc((100dvh - 140px) * 16 / 9);
  }
  .side {
    display: flex;
    flex-direction: column;
    gap: 14px;
    overflow-y: auto;
    max-height: 75vh;
    padding-right: 4px;
  }
  .side p {
    margin: 0;
  }
  .board-opts {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .dim {
    opacity: 0.5;
  }
  .notice {
    position: absolute;
    left: 50%;
    bottom: 10px;
    translate: -50% 0;
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 6px 8px 6px 14px;
    border-radius: 8px;
    background: var(--panel-2);
    border: 1px solid var(--border);
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.45);
    white-space: nowrap;
    z-index: 2000;
  }
  .pop {
    position: relative;
  }
  .small {
    font-size: 12px;
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
