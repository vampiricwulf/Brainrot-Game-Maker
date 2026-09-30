<!--
  A board-game round (games-maker spec §7.13): the spaces on the board and their links (a loop or a path, forks
  allowed), what each space does when passed or landed on, the backdrop, off-board zones, how a turn's move is
  decided, and how to win.
-->
<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { app } from '../../lib/app.svelte';
  import { take } from '../../lib/nav.svelte';
  import { begin, history, redo, step, undo } from '../../lib/history.svelte';
  import { showMenu } from '../../lib/menustate.svelte';
  import { clampToBoard, newBoardSpace, nextSpaceName, previousOf, SPACE_COLORS, spaceById } from '../../lib/boardgame';
  import BoardSpaces from '../../lib/boardgame/BoardSpaces.svelte';
  import { mediaUrls } from '../../lib/media.svelte';
  import { newId, SLIDE_H, SLIDE_W, textSlide, type BoardGameRound, type BoardSpace, type BoardZone } from '../../lib/model';
  import SlideView from '../../lib/slide/SlideView.svelte';
  import ActionListEditor from '../rpg/ActionListEditor.svelte';
  import SlideModal from '../rpg/SlideModal.svelte';
  import MediaPicker from '../slide/MediaPicker.svelte';
  import { fittingFile, hasFiles, mediaDrop, useFile } from '../../lib/mediadrop';
  import SlideEditor from '../slide/SlideEditor.svelte';

  let { round }: { round: BoardGameRound } = $props();
  const game = $derived(app.game);

  /** The wheel a turn's move spins, if it does. */
  const moverWheel = $derived(round.mover.kind === 'wheel' ? round.mover.wheel : null);

  let view = $state<'spaces' | 'backdrop' | 'zones'>('spaces');
  let selId = $state<string | null>(null);
  const sel = $derived(spaceById(round, selId ?? undefined));
  /** The next space clicked is linked from (or unlinked from) the selected one. */
  let linking = $state(false);
  let pickingIcon = $state(false);
  let zoneSlide = $state<string | null>(null);

  // An undo or redo here shows the view it changed: the space selected, the backdrop, the zone (and its screen).
  const handled = { seq: 0 };
  $effect(() => {
    const place = take(handled);
    if (place?.tab !== 'round' || place.round !== untrack(() => round.id) || !place.part) return;
    const part = place.part;
    if (part.kind === 'space') {
      view = 'spaces';
      selId = part.space;
    } else if (part.kind === 'backdrop') view = 'backdrop';
    else if (part.kind === 'zone') {
      view = 'zones';
      if (part.inSlide) zoneSlide = part.zone;
    }
  });

  let boxW = $state(0);
  const scale = $derived(boxW / SLIDE_W || 1);
  let drag: { id: string; dx: number; dy: number } | null = null;
  let canvas = $state<HTMLDivElement>();

  // ---------- Undo: the game's history (Ctrl+Z / Ctrl+Shift+Z are the editor's) ----------
  // A drag is one step, and so is a delete.
  let endDrag: (() => void) | null = null;
  onDestroy(() => endDrag?.());

  // "Deleted Space 3 · Undo" on the board, until the next change.
  let notice = $state<{ text: string; at: string | null } | null>(null);
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;
  function tell(text: string): void {
    notice = { text, at: history.top };
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => (notice = null), 6000);
  }

  function toBoard(e: PointerEvent): { x: number; y: number } {
    const r = canvas!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  }

  function spaceDown(e: PointerEvent, s: BoardSpace): void {
    e.stopPropagation();
    if (linking && sel && sel.id !== s.id) {
      sel.next = sel.next.includes(s.id) ? sel.next.filter((n) => n !== s.id) : [...sel.next, s.id];
      linking = false;
      return;
    }
    selId = s.id;
    const p = toBoard(e);
    drag = { id: s.id, dx: p.x - s.x, dy: p.y - s.y };
    endDrag?.();
    endDrag = begin();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // A synthetic pointer (tests, some pens) can't be captured: dragging still works while over the board.
    }
  }

  function boardMove(e: PointerEvent): void {
    if (!drag) return;
    const s = spaceById(round, drag.id);
    if (!s) return;
    const p = toBoard(e);
    const at = clampToBoard(p.x - drag.dx, p.y - drag.dy);
    s.x = at.x;
    s.y = at.y;
  }

  /** Ctrl+click (⌘+click) on the board adds a space after the selected one; a plain click deselects. */
  function boardDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).closest('.backdrop')) return;
    linking = false;
    if (!(e.ctrlKey || e.metaKey)) return void (selId = null);
    addSpaceAt(toBoard(e));
  }

  function addSpaceAt(at: { x: number; y: number }): void {
    const p = clampToBoard(at.x, at.y);
    const s = newBoardSpace(p.x, p.y, nextSpaceName(round), SPACE_COLORS[round.spaces.length % SPACE_COLORS.length]);
    // Inserted after the selected space: it takes over the selected space's links (so a loop stays a loop).
    if (sel) {
      s.next = [...sel.next];
      sel.next = [s.id];
    }
    round.spaces.push(s);
    selId = s.id;
  }

  /** Right-click: a space's menu, or the board's (add a space there). */
  function boardMenu(e: MouseEvent): void {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-space]');
    const s = el ? spaceById(round, el.dataset.space) : undefined;
    const at = toBoard(e as PointerEvent);
    if (s) {
      selId = s.id;
      showMenu(e, [
        { heading: s.name },
        { label: '🏁 Make it Start', onclick: () => (round.start = s.id), disabled: (round.start ?? round.spaces[0]?.id) === s.id },
        { label: '🔗 Link it to…', onclick: () => (linking = true), hint: 'Then click the space it leads to' },
        { label: '＋ Add a space after it', onclick: () => addSpaceAt({ x: s.x + 160, y: s.y }) },
        { sep: true },
        { label: '🗑 Delete space', danger: true, onclick: () => removeSpace(s) },
      ]);
    } else
      showMenu(e, [
        { label: sel ? `＋ Add a space here (after ${sel.name})` : '＋ Add a space here', onclick: () => addSpaceAt(at) },
        { label: 'Deselect', onclick: () => (selId = null), disabled: !sel },
      ]);
  }

  /**
   * Delete / Backspace removes the selected space. Not while typing in a field, nor while a dialog is open over the
   * board (a pop-up slide being edited, a picker): those keys are its own.
   */
  function key(e: KeyboardEvent): void {
    if (e.defaultPrevented || document.querySelector('[role="dialog"]')) return;
    if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return;
    const k = e.key.toLowerCase();
    if (view !== 'spaces' || !sel) return;
    if (k === 'delete' || k === 'backspace') {
      e.preventDefault();
      removeSpace(sel);
    } else if (k === 'escape') {
      linking = false;
      selId = null;
    }
  }

  // A picture dropped on a space is its icon; dropped on the empty board, it's the backdrop's background picture.
  /** Where a dragged file would go: a space's id, or 'board'. */
  let fileOver = $state<string | null>(null);
  const spaceUnder = (e: DragEvent) => spaceById(round, (e.target as HTMLElement).closest<HTMLElement>('[data-space]')?.dataset.space);
  function fileDragOver(e: DragEvent): void {
    if (!hasFiles(e)) return;
    e.preventDefault();
    fileOver = spaceUnder(e)?.id ?? 'board';
  }
  function fileDrop(e: DragEvent): void {
    fileOver = null;
    const file = fittingFile(Array.from(e.dataTransfer?.files ?? []), 'image');
    if (!hasFiles(e) || !file) return;
    e.preventDefault();
    const s = spaceUnder(e);
    if (s) selId = s.id;
    void useFile(file, { kind: 'image', onpick: (id) => (s ? (s.icon = id) : (round.slide.background.image = id)) });
  }

  /** Buttons that sent players to a deleted space or zone point nowhere now (the checklist says so). */
  function unlinkGotos(to: { space?: string; zone?: string }): void {
    for (const x of round.spaces)
      for (const a of [...(x.onPass ?? []), ...(x.onLand ?? [])]) {
        if (a.do !== 'goto') continue;
        if (to.space && a.space === to.space) a.space = undefined;
        if (to.zone && a.zone === to.zone) a.zone = undefined;
      }
  }

  function removeSpace(s: BoardSpace): void {
    step(`Deleted space “${s.name}”`, () => {
      // Spaces that led here now lead where it led (when it had one way on).
      for (const p of previousOf(round, s.id)) {
        p.next = p.next.filter((n) => n !== s.id);
        if (s.next.length === 1 && s.next[0] !== p.id && !p.next.includes(s.next[0])) p.next.push(s.next[0]);
      }
      round.spaces = round.spaces.filter((x) => x.id !== s.id);
      if (round.start === s.id) round.start = undefined;
      unlinkGotos({ space: s.id });
    });
    selId = null;
    tell(`Deleted ${s.name}`);
  }

  function addZone(): void {
    const name = round.zones.length ? `Zone ${round.zones.length + 1}` : 'Shadow Realm';
    const slide = textSlide(name);
    slide.background = { color: '#2a0845' };
    round.zones = [...round.zones, { id: newId(), name, slide }];
  }

  /** Done at once (with its screen): the note at the bottom offers Undo. */
  function removeZone(z: BoardZone): void {
    step(
      `Deleted zone “${z.name}”`,
      () => {
        round.zones = round.zones.filter((x) => x.id !== z.id);
        unlinkGotos({ zone: z.id });
      },
      { notify: true },
    );
  }

  const zone = $derived(round.zones.find((z) => z.id === zoneSlide));
</script>

<!-- A drag ends wherever the pointer is let go (it's one undo step). -->
<svelte:window
  onkeydown={key}
  onpointerup={() => {
    endDrag?.();
    endDrag = null;
    drag = null;
  }}
/>

<div class="bge">
  <div class="row settings">
    <label class="field">Round name<input bind:value={round.name} /></label>
    <label class="field">
      Move by
      <select
        aria-label="Move by"
        value={round.mover.kind === 'wheel' ? round.mover.wheel : round.mover.kind}
        onchange={(e) => {
          const v = e.currentTarget.value;
          step(`Move by: ${e.currentTarget.selectedOptions[0]?.text}`, () => {
            round.mover = v === 'dice' ? { kind: 'dice', dice: 'd6' } : v === 'step' ? { kind: 'step' } : { kind: 'wheel', wheel: v };
          });
        }}
      >
        {#if moverWheel && !game.wheels.some((w) => w.id === moverWheel)}<option value={moverWheel}>⚠ Deleted wheel — pick another</option>{/if}
        <option value="dice">🎲 Dice</option>
        <option value="step">👣 One space a turn (pick the way)</option>
        {#each game.wheels as w (w.id)}<option value={w.id}>🎡 {w.name}</option>{/each}
      </select>
    </label>
    {#if round.mover.kind === 'dice'}
      <label class="field">Dice<input class="n" bind:value={round.mover.dice} placeholder="d6, 2d6" list="bg-dice" /></label>
      <datalist id="bg-dice">{#each game.dice as d (d.id)}<option value={d.name}></option>{/each}</datalist>
    {/if}
    <label class="field">
      Start
      <select bind:value={round.start} aria-label="Start space">
        <option value={undefined}>— first space —</option>
        {#each round.spaces as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
      </select>
    </label>
  </div>
  <div class="row settings">
    <label class="field grow">How to win<input bind:value={round.winNotes} placeholder="e.g. Own 3 Flamingos and get back to Start" /></label>
    <label class="check small"><input type="checkbox" bind:checked={round.winPublic} /> Show it on the board</label>
    <label class="field grow">Host notes<input bind:value={round.hostNotes} placeholder="Only you see these" /></label>
  </div>

  <div class="tabs" role="tablist">
    <button role="tab" aria-selected={view === 'spaces'} class:on={view === 'spaces'} onclick={() => (view = 'spaces')}>⬤ Spaces ({round.spaces.length})</button>
    <button role="tab" aria-selected={view === 'backdrop'} class:on={view === 'backdrop'} onclick={() => (view = 'backdrop')}>🎨 Board backdrop</button>
    <button role="tab" aria-selected={view === 'zones'} class:on={view === 'zones'} onclick={() => (view = 'zones')}>🌀 Off-board zones ({round.zones.length})</button>
  </div>

  {#if view === 'spaces'}
    <div class="row tools">
      <span class="muted small">Ctrl+click the board to add a space (after the selected one) · Delete removes the selected space · right-click for more</span>
      {#if linking}<span class="warn small">Click the space {sel?.name} should lead to (again to unlink)…</span>{/if}
      <span class="spacer"></span>
      <span class="muted small">Drag spaces to move them. Drop a picture on a space for its icon, or on the board for its backdrop.</span>
      <button class="ghost small" onclick={() => undo()} disabled={!history.canUndo} title={history.undoTitle} aria-label="Undo">↶</button>
      <button class="ghost small" onclick={() => redo()} disabled={!history.canRedo} title={history.redoTitle} aria-label="Redo">↷</button>
    </div>
    <div class="main">
      <div class="canvas-box" class:media-drop={fileOver === 'board'} bind:clientWidth={boxW} style:height="{SLIDE_H * scale}px">
        <div
          class="canvas"
          bind:this={canvas}
          style:transform="scale({scale})"
          onpointerdown={boardDown}
          oncontextmenu={boardMenu}
          onpointermove={boardMove}
          ondragover={fileDragOver}
          ondragleave={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && (fileOver = null)}
          ondrop={fileDrop}
          role="application"
          aria-label="Board"
        >
          <div class="backdrop"><SlideView slide={round.slide} mode="edit" fallbackBg="#1d5e3a" /></div>
          <BoardSpaces {round} selected={selId} marked={fileOver && fileOver !== 'board' ? [fileOver] : []} ondown={spaceDown} />
        </div>
        {#if notice && notice.at === history.top && !history.pending}
          <div class="notice" role="status">
            <span>{notice.text}</span>
            <button class="small" onclick={() => ((notice = null), undo())}>Undo</button>
          </div>
        {/if}
      </div>
      <aside class="side">
        {#if sel}
          <h4>Space</h4>
          <label class="field">Name<input bind:value={sel.name} aria-label="Space name" /></label>
          <div class="row">
            <label class="check small">Color <input type="color" bind:value={sel.color} aria-label="Space color" /></label>
            <div class="pop">
              <button class="small" onclick={() => (pickingIcon = !pickingIcon)} use:mediaDrop={{ kind: 'image', onpick: (id) => sel && (sel.icon = id) }}>
                {#if sel.icon && mediaUrls[sel.icon]}<img class="ic" src={mediaUrls[sel.icon]} alt="" />{:else}🖼{/if} Icon
              </button>
              {#if pickingIcon}
                <MediaPicker kind="image" onpick={(id) => ((sel.icon = id), (pickingIcon = false))} onclose={() => (pickingIcon = false)} />
              {/if}
            </div>
            {#if sel.icon}<button class="ghost small" onclick={() => (sel.icon = undefined)}>No icon</button>{/if}
          </div>
          <div class="row">
            <span class="muted small">Leads to:</span>
            {#each sel.next as n (n)}
              {@const other = spaceById(round, n)}
              {@const both = !!other?.next.includes(sel.id)}
              <span class="chip">
                {both ? '↔' : '→'} {other?.name ?? '?'}
                <button
                  class="ghost tiny"
                  class:on={both}
                  aria-pressed={both}
                  onclick={() => other && (other.next = both ? other.next.filter((x) => x !== sel.id) : [...other.next, sel.id])}
                  aria-label="Both ways with {other?.name}"
                  title={both ? 'Both ways: click for one way only' : 'Make it both ways (back and forth)'}>⇄</button
                >
                <button class="ghost tiny" onclick={() => (sel.next = sel.next.filter((x) => x !== n))} aria-label="Unlink">✕</button>
              </span>
            {:else}
              <span class="muted small">nothing (the path ends)</span>
            {/each}
            <button class="small" class:on={linking} onclick={() => (linking = !linking)} title="Then click the space it leads to; two or more ways make a fork">🔗 Link to…</button>
          </div>
          {#if sel.next.length > 1}<div class="muted small">A fork: the host picks the way in play.</div>{/if}
          <h5>When passed <span class="muted small">(e.g. Start: +2 gold)</span></h5>
          <ActionListEditor bind:actions={sel.onPass} board={round} />
          <h5>When landed on</h5>
          <ActionListEditor bind:actions={sel.onLand} board={round} />
          <label class="check small"><input type="checkbox" bind:checked={sel.secret} /> Secret (viewers see “?” until you reveal it)</label>
          <label class="field">Host notes<textarea rows="2" bind:value={sel.hostNotes}></textarea></label>
          <div class="row">
            <button class="small" onclick={() => (round.start = sel.id)} disabled={(round.start ?? round.spaces[0]?.id) === sel.id}>🏁 Make it Start</button>
            <span class="spacer"></span>
            <button class="ghost small" onclick={() => removeSpace(sel)}>Delete space</button>
          </div>
        {:else}
          <p class="muted small">
            Click a space to set it up. Ctrl+click (⌘+click) the board to add one, or right-click → Add a space here. New spaces go after
            the selected space, so you can draw the path in order.
          </p>
        {/if}
      </aside>
    </div>
  {:else if view === 'backdrop'}
    <div class="se-wrap"><SlideEditor slide={round.slide} placeholder="Click to type" fill /></div>
  {:else}
    <div class="zones">
      <p class="muted small">Places off the board (the Shadow Realm) where players get sent until they escape. Send players there from a space's actions or the host panel.</p>
      {#each round.zones as z (z.id)}
        <div class="row zone" data-place="zone:{z.id}">
          <input bind:value={z.name} aria-label="Zone name" />
          <input class="grow" bind:value={z.hostNotes} placeholder="Host notes (how to escape…)" aria-label="{z.name} notes" />
          <button class="small" onclick={() => (zoneSlide = z.id)}>Edit its screen…</button>
          <button class="ghost small" onclick={() => removeZone(z)} aria-label="Delete zone {z.name}">✕</button>
        </div>
      {/each}
      <div class="row"><button onclick={addZone}>＋ Zone</button></div>
    </div>
  {/if}
</div>
{#if zone}
  <SlideModal slide={zone.slide} title={zone.name} onclose={() => (zoneSlide = null)} />
{/if}

<style>
  .bge {
    display: flex;
    flex-direction: column;
    gap: 8px;
    height: 100%;
    min-height: 0;
  }
  .row {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  .settings .field {
    min-width: 120px;
  }
  .grow {
    flex: 1;
  }
  .n {
    width: 80px;
  }
  .tabs {
    display: flex;
    gap: 4px;
    border-bottom: 1px solid var(--border);
  }
  .tabs button {
    border-radius: 6px 6px 0 0;
  }
  .tabs button.on {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
  .on {
    border-color: var(--accent);
    background: rgba(79, 124, 255, 0.2);
  }
  .main {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    min-height: 0;
  }
  .canvas-box {
    flex: 1;
    min-width: 0;
    position: relative;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 6px;
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
  }
  .canvas {
    position: absolute;
    left: 0;
    top: 0;
    width: 1920px;
    height: 1080px;
    transform-origin: 0 0;
    cursor: crosshair;
  }
  .backdrop {
    position: absolute;
    inset: 0;
  }
  .side {
    width: 320px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 70vh;
    overflow: auto;
  }
  h4,
  h5 {
    margin: 4px 0 0;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 1px 6px;
    border-radius: 6px;
    background: var(--panel-2);
    font-size: 12px;
  }
  .ic {
    width: 18px;
    height: 18px;
    object-fit: contain;
    vertical-align: middle;
  }
  .pop {
    position: relative;
  }
  .se-wrap {
    flex: 1;
    min-height: 480px;
    display: flex;
    flex-direction: column;
  }
  .zones {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .small {
    font-size: 12px;
  }
  .tiny {
    font-size: 10px;
    padding: 0 4px;
  }
  .warn {
    color: var(--warn);
  }
</style>
