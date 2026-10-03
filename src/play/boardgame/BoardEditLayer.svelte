<!--
  ✎ Edit board, on the host's stage: over the board, it takes the clicks and drags. Click a space or a link to pick it,
  drag a space to move it, Shift+click another space to connect the picked one to it, Ctrl+click or double-click an empty
  spot to add a space (or ＋ Space, then click), right-click for more. Its marks are quiet (a dashed ring, a dashed
  link): in a single window, viewers see them.
-->
<script lang="ts">
  import { clampToBoard, nameShown, spaceById } from '../../lib/boardgame';
  import { linkAt } from '../../lib/boardedit';
  import { showMenu } from '../../lib/menustate.svelte';
  import { SLIDE_H, SLIDE_W, type BoardGameRound, type Game, type Session } from '../../lib/model';
  import { boardEdit, editAdd, editAllNames, editBothWays, editConnect, editDelete, editDisconnect, editDrag, editIdle, editReverse, editShowName, editStart } from './boardedit.svelte';

  let { game, session, round }: { game: Game; session: Session; round: BoardGameRound } = $props();

  const R = 58;
  let el = $state<HTMLDivElement>();
  /** The pointer, on the board (for the line Connect to… draws). */
  let hover = $state<{ x: number; y: number } | null>(null);
  let drag: { id: string; sx: number; sy: number; ox: number; oy: number; end: (() => void) | null } | null = null;

  function toBoard(e: MouseEvent): { x: number; y: number } {
    const r = el!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * SLIDE_W) / (r.width || 1), y: ((e.clientY - r.top) * SLIDE_H) / (r.height || 1) };
  }
  const spaceAt = (p: { x: number; y: number }) => [...round.spaces].reverse().find((s) => Math.hypot(s.x - p.x, s.y - p.y) <= R + 6);

  function down(e: PointerEvent): void {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const p = toBoard(e);
    const s = spaceAt(p);
    if (s) {
      const from = boardEdit.sel;
      if (from && from !== s.id && (boardEdit.connecting || e.shiftKey)) return editConnect(game, session, from, s.id);
      boardEdit.sel = s.id;
      boardEdit.link = null;
      boardEdit.adding = false;
      drag = { id: s.id, sx: p.x, sy: p.y, ox: s.x, oy: s.y, end: null };
      try {
        el?.setPointerCapture(e.pointerId);
      } catch {
        // (A synthetic pointer can't be captured: the drag still works over the board.)
      }
      return;
    }
    if (boardEdit.adding || e.ctrlKey || e.metaKey) return editAdd(game, session, p);
    const l = linkAt(round, p);
    if (l) {
      boardEdit.link = l;
      boardEdit.sel = null;
      boardEdit.connecting = false;
      return;
    }
    editIdle();
  }

  function move(e: PointerEvent): void {
    const p = toBoard(e);
    hover = p;
    if (!drag) return;
    const s = spaceById(round, drag.id);
    if (!s) return;
    if (!drag.end && Math.abs(p.x - drag.sx) + Math.abs(p.y - drag.sy) < 6) return;
    drag.end ??= editDrag(game, session, drag.id);
    const at = clampToBoard(drag.ox + p.x - drag.sx, drag.oy + p.y - drag.sy);
    s.x = at.x;
    s.y = at.y;
  }

  function up(): void {
    drag?.end?.();
    drag = null;
  }

  function dbl(e: MouseEvent): void {
    // (Two quick Ctrl+clicks, or clicks while ＋ adding, already added a space each: no third.)
    if (boardEdit.adding || e.ctrlKey || e.metaKey) return;
    const p = toBoard(e);
    if (!spaceAt(p) && !linkAt(round, p)) editAdd(game, session, p);
  }

  /** Right-click: a space's, a link's or the board's edits. */
  function menu(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    const p = toBoard(e);
    const s = spaceAt(p);
    const l = s ? null : linkAt(round, p);
    if (s) {
      boardEdit.sel = s.id;
      boardEdit.link = null;
      return showMenu(e, [
        { heading: s.name },
        { label: '✎ Rename', keys: 'F2', onclick: () => document.querySelector<HTMLInputElement>('[data-edit-name]')?.select() },
        { label: '🔗 Connect to…', hint: 'Then click the space it leads to (or Shift+click it)', onclick: () => (boardEdit.connecting = true) },
        { label: '🏁 Make it Start', disabled: (round.start ?? round.spaces[0]?.id) === s.id, onclick: () => editStart(game, session, s.id) },
        nameShown(s)
          ? { label: '⊘ Hide name', hint: 'Viewers don’t see its name', onclick: () => editShowName(game, session, s.id, false) }
          : { label: '👁 Show name', hint: 'Viewers see its name under it', onclick: () => editShowName(game, session, s.id, true) },
        { label: '＋ Add a space after it', onclick: () => editAdd(game, session, { x: s.x + 160, y: s.y }) },
        { sep: true },
        { label: '🗑 Delete space', danger: true, keys: 'Delete', onclick: () => editDelete(game, session, s.id) },
      ]);
    }
    if (l) {
      boardEdit.link = l;
      boardEdit.sel = null;
      const both = !!spaceById(round, l.to)?.next.includes(l.from);
      return showMenu(e, [
        { label: both ? '→ One way only' : '⇄ Both ways', onclick: () => editBothWays(game, session, l) },
        { label: '↺ Reverse', disabled: both, onclick: () => editReverse(game, session, l) },
        { sep: true },
        { label: '✂ Disconnect', danger: true, keys: 'Delete', onclick: () => editDisconnect(game, session, l) },
      ]);
    }
    const sel = spaceById(round, boardEdit.sel ?? undefined);
    showMenu(e, [
      { label: sel ? `＋ Add a space here (after ${sel.name})` : '＋ Add a space here', onclick: () => editAdd(game, session, p) },
      { sep: true },
      { label: '👁 Show all space names', disabled: round.spaces.every(nameShown), onclick: () => editAllNames(game, session, true) },
      { label: '⊘ Hide all space names', disabled: !round.spaces.some(nameShown), onclick: () => editAllNames(game, session, false) },
    ]);
  }

  const sel = $derived(spaceById(round, boardEdit.sel ?? undefined));
  const link = $derived.by(() => {
    const l = boardEdit.link;
    const a = l && spaceById(round, l.from);
    const b = l && spaceById(round, l.to);
    return a && b ? { a, b } : null;
  });
</script>

<div
  class="edit-layer"
  class:adding={boardEdit.adding}
  bind:this={el}
  onpointerdown={down}
  onpointermove={move}
  onpointerup={up}
  onpointercancel={up}
  onpointerleave={() => (hover = null)}
  ondblclick={dbl}
  oncontextmenu={menu}
  role="application"
  aria-label="Editing the board"
  data-board-edit
>
  <svg viewBox="0 0 {SLIDE_W} {SLIDE_H}" aria-hidden="true">
    {#if link}
      <line x1={link.a.x} y1={link.a.y} x2={link.b.x} y2={link.b.y} class="picked-link" data-picked-link="{link.a.id}>{link.b.id}" />
    {/if}
    {#if sel}
      <circle cx={sel.x} cy={sel.y} r={R + 16} class="picked" data-picked-space={sel.id} />
      {#if boardEdit.connecting && hover}
        <line x1={sel.x} y1={sel.y} x2={hover.x} y2={hover.y} class="wire" />
      {/if}
    {/if}
  </svg>
</div>

<style>
  .edit-layer {
    position: absolute;
    inset: 0;
    z-index: 15;
    cursor: default;
    touch-action: none;
    user-select: none;
  }
  .edit-layer.adding {
    cursor: crosshair;
  }
  svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
  /* Quiet marks (viewers may see them): a dashed ring, a dashed link. */
  .picked {
    fill: none;
    stroke: #ffcc00;
    stroke-width: 6;
    stroke-dasharray: 14 10;
  }
  .picked-link {
    stroke: #ffcc00;
    stroke-width: 10;
    stroke-dasharray: 18 12;
  }
  .wire {
    stroke: #ffcc00;
    stroke-width: 6;
    stroke-dasharray: 10 10;
  }
</style>
