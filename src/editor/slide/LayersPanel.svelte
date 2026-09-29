<!--
  Layers list for a slide (or the board's images): top-most first. Click to select (Shift/Ctrl adds),
  drag to restack, 👁 hides an item while editing (never in the game), 🔒 locks it in place.
-->
<script lang="ts">
  import { mediaUrls } from '../../lib/media.svelte';
  import type { Game, SlideElement } from '../../lib/model';
  import { LAYER_ICON, layerLabel } from './layerlabel';

  let {
    elements,
    game,
    selected = $bindable(),
    hidden = $bindable([]),
    hovered = $bindable(null),
    onchange,
  }: {
    elements: SlideElement[];
    game: Game;
    selected: string[];
    /** Items hidden in the editor only. */
    hidden?: string[];
    /** Item under the mouse in this list (the canvas outlines it). */
    hovered?: string | null;
    /** A discrete change happened (restack, lock), for undo history. */
    onchange?: () => void;
  } = $props();

  const top = $derived([...elements].sort((a, b) => b.zIndex - a.zIndex));
  function pick(e: MouseEvent, el: SlideElement): void {
    if (e.shiftKey || e.ctrlKey || e.metaKey) selected = selected.includes(el.id) ? selected.filter((x) => x !== el.id) : [...selected, el.id];
    else selected = [el.id];
  }

  function toggleHidden(el: SlideElement): void {
    hidden = hidden.includes(el.id) ? hidden.filter((x) => x !== el.id) : [...hidden, el.id];
    if (hidden.includes(el.id)) selected = selected.filter((x) => x !== el.id);
  }

  function toggleLock(el: SlideElement): void {
    el.locked = el.locked ? undefined : true;
    onchange?.();
  }

  /** Restack: `order` is top-most first. */
  function apply(order: SlideElement[]): void {
    order.forEach((el, i) => (el.zIndex = order.length - 1 - i));
    onchange?.();
  }

  function nudge(el: SlideElement, dir: -1 | 1): void {
    const order = [...top];
    const i = order.indexOf(el);
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    apply(order);
  }

  // ---------- Drag to restack ----------
  let dragId = $state<string | null>(null);
  let dropAt = $state<{ id: string; after: boolean } | null>(null);

  function over(e: DragEvent, el: SlideElement): void {
    if (!dragId) return;
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    dropAt = { id: el.id, after: e.clientY > r.top + r.height / 2 };
  }

  function drop(e: DragEvent): void {
    e.preventDefault();
    const moving = top.find((x) => x.id === dragId);
    if (moving && dropAt && dropAt.id !== dragId) {
      const order = top.filter((x) => x !== moving);
      const at = order.findIndex((x) => x.id === dropAt!.id);
      order.splice(at + (dropAt.after ? 1 : 0), 0, moving);
      apply(order);
      selected = [moving.id];
    }
    dragId = null;
    dropAt = null;
  }

  function rowKey(e: KeyboardEvent, el: SlideElement): void {
    // Alt+↑/↓ restacks the focused item; ↑/↓ alone moves the selection through the list.
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    e.stopPropagation();
    const dir = e.key === 'ArrowUp' ? -1 : 1;
    if (e.altKey) {
      nudge(el, dir);
      return;
    }
    const next = top[top.indexOf(el) + dir];
    if (!next) return;
    selected = [next.id];
    (e.currentTarget as HTMLElement).parentElement?.querySelector<HTMLElement>(`[data-layer="${next.id}"] .name`)?.focus();
  }
</script>

<div class="layers" role="list" aria-label="Layers">
  {#each top as el, i (el.id)}
    {@const isSel = selected.includes(el.id)}
    {@const isHidden = hidden.includes(el.id)}
    {@const thumb = el.kind === 'image' ? mediaUrls[el.editedMedia ?? el.media] : undefined}
    <div
      class="row"
      class:sel={isSel}
      class:hl={hovered === el.id && !isSel}
      class:off={isHidden}
      class:drop-before={dropAt?.id === el.id && !dropAt.after}
      class:drop-after={dropAt?.id === el.id && dropAt.after}
      class:dragging={dragId === el.id}
      data-layer={el.id}
      role="listitem"
      draggable="true"
      ondragstart={(e) => {
        dragId = el.id;
        e.dataTransfer?.setData('text/x-layer', el.id);
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
      }}
      ondragover={(e) => over(e, el)}
      ondrop={drop}
      ondragend={() => ((dragId = null), (dropAt = null))}
      onpointerenter={() => (hovered = el.id)}
      onpointerleave={() => hovered === el.id && (hovered = null)}
    >
      <span class="grip" aria-hidden="true">⋮⋮</span>
      <button
        class="name"
        onclick={(e) => pick(e, el)}
        onkeydown={(e) => rowKey(e, el)}
        aria-pressed={isSel}
        title="Click to select (Shift/Ctrl adds). Drag to restack; Alt+↑/↓ moves it up or down."
      >
        {#if thumb}<img src={thumb} alt="" />{:else}<span class="ic">{LAYER_ICON[el.kind]}</span>{/if}
        <span class="txt">{layerLabel(el, game)}</span>
      </button>
      <button class="ico" class:on={!isHidden} onclick={() => toggleHidden(el)} aria-label={isHidden ? 'Show while editing' : 'Hide while editing'} title={isHidden ? 'Show while editing' : 'Hide while editing (still shows in the game)'}>
        {isHidden ? '◌' : '👁'}
      </button>
      <button class="ico" class:on={!!el.locked} onclick={() => toggleLock(el)} aria-label={el.locked ? 'Unlock' : 'Lock'} aria-pressed={!!el.locked} title={el.locked ? 'Unlock' : 'Lock: clicks on the slide go through it to what is underneath'}>
        {el.locked ? '🔒' : '🔓'}
      </button>
      <span class="updown">
        <button class="ico" onclick={() => nudge(el, -1)} disabled={i === 0} aria-label="Bring forward" title="Bring forward">▲</button>
        <button class="ico" onclick={() => nudge(el, 1)} disabled={i === top.length - 1} aria-label="Send backward" title="Send backward">▼</button>
      </span>
    </div>
  {:else}
    <p class="muted small empty">Nothing here yet.</p>
  {/each}
</div>

<style>
  .layers {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 2px 4px;
    border-radius: 6px;
    border: 1px solid transparent;
    background: var(--panel-2);
    position: relative;
  }
  .row:hover,
  .row.hl {
    border-color: var(--border);
  }
  .row.hl {
    border-style: dashed;
    border-color: var(--accent);
  }
  .row.sel {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 22%, var(--panel-2));
  }
  .row.off .txt,
  .row.off img,
  .row.off .ic {
    opacity: 0.45;
  }
  .row.dragging {
    opacity: 0.5;
  }
  .row.drop-before::before,
  .row.drop-after::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--accent);
  }
  .row.drop-before::before {
    top: -2px;
  }
  .row.drop-after::after {
    bottom: -2px;
  }
  .grip {
    cursor: grab;
    color: var(--muted);
    font-size: 11px;
    letter-spacing: -2px;
    padding: 0 3px 0 0;
    user-select: none;
  }
  .name {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 4px;
    background: none;
    border: none;
    text-align: left;
    font-size: 12px;
  }
  .name img {
    width: 28px;
    height: 18px;
    object-fit: cover;
    border-radius: 3px;
    flex: none;
  }
  .ic {
    width: 28px;
    text-align: center;
    flex: none;
  }
  .txt {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ico {
    padding: 2px 4px;
    background: none;
    border: none;
    font-size: 12px;
    opacity: 0.55;
    line-height: 1;
  }
  .ico.on,
  .ico:hover:not(:disabled) {
    opacity: 1;
  }
  .ico:disabled {
    opacity: 0.2;
  }
  .updown {
    display: flex;
    flex-direction: column;
  }
  .updown .ico {
    font-size: 8px;
    padding: 1px 3px;
  }
  .empty {
    margin: 4px 0;
  }
  .small {
    font-size: 12px;
  }
</style>
