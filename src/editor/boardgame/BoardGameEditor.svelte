<!--
  A board-game round (games-maker spec §7.13): the spaces on the board and their links (a loop or a path, forks
  allowed), what each space does when passed or landed on, the backdrop, off-board zones, how a turn's move is
  decided, and how to win.
-->
<script lang="ts">
  import { app } from '../../lib/app.svelte';
  import { showMenu } from '../../lib/contextmenu.svelte';
  import { clampToBoard, newBoardSpace, previousOf, SPACE_COLORS, spaceById } from '../../lib/boardgame';
  import BoardSpaces from '../../lib/boardgame/BoardSpaces.svelte';
  import { mediaUrls } from '../../lib/media.svelte';
  import { newId, SLIDE_H, SLIDE_W, textSlide, type BoardGameRound, type BoardSpace } from '../../lib/model';
  import SlideView from '../../lib/slide/SlideView.svelte';
  import ActionListEditor from '../rpg/ActionListEditor.svelte';
  import SlideModal from '../rpg/SlideModal.svelte';
  import MediaPicker from '../slide/MediaPicker.svelte';
  import SlideEditor from '../slide/SlideEditor.svelte';

  let { round }: { round: BoardGameRound } = $props();
  const game = $derived(app.game);

  let view = $state<'spaces' | 'backdrop' | 'zones'>('spaces');
  let selId = $state<string | null>(null);
  const sel = $derived(spaceById(round, selId ?? undefined));
  /** The next space clicked is linked from (or unlinked from) the selected one. */
  let linking = $state(false);
  let pickingIcon = $state(false);
  let zoneSlide = $state<string | null>(null);

  let boxW = $state(0);
  const scale = $derived(boxW / SLIDE_W || 1);
  let drag: { id: string; dx: number; dy: number; moved: boolean } | null = null;
  let canvas = $state<HTMLDivElement>();

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
    drag = { id: s.id, dx: p.x - s.x, dy: p.y - s.y, moved: false };
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
    if (Math.abs(at.x - s.x) + Math.abs(at.y - s.y) > 2) drag.moved = true;
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
    const s = newBoardSpace(p.x, p.y, `Space ${round.spaces.length + 1}`, SPACE_COLORS[round.spaces.length % SPACE_COLORS.length]);
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

  /** Delete / Backspace removes the selected space (not while typing in a field). */
  function key(e: KeyboardEvent): void {
    if (view !== 'spaces' || !sel) return;
    if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      removeSpace(sel);
    } else if (e.key === 'Escape') {
      linking = false;
      selId = null;
    }
  }

  function removeSpace(s: BoardSpace): void {
    // Spaces that led here now lead where it led (when it had one way on).
    for (const p of previousOf(round, s.id)) {
      p.next = p.next.filter((n) => n !== s.id);
      if (s.next.length === 1 && s.next[0] !== p.id && !p.next.includes(s.next[0])) p.next.push(s.next[0]);
    }
    round.spaces = round.spaces.filter((x) => x.id !== s.id);
    if (round.start === s.id) round.start = undefined;
    selId = null;
  }

  function addZone(): void {
    const slide = textSlide(`Shadow Realm`);
    slide.background = { color: '#2a0845' };
    round.zones = [...round.zones, { id: newId(), name: round.zones.length ? `Zone ${round.zones.length + 1}` : 'Shadow Realm', slide }];
  }

  const zone = $derived(round.zones.find((z) => z.id === zoneSlide));
</script>

<svelte:window onkeydown={key} />

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
          round.mover = v === 'dice' ? { kind: 'dice', dice: 'd6' } : v === 'step' ? { kind: 'step' } : { kind: 'wheel', wheel: v };
        }}
      >
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
        <option value={undefined}>{round.spaces[0]?.name ?? '—'} (first)</option>
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
      <span class="muted small">Drag spaces to move them.</span>
    </div>
    <div class="main">
      <div class="canvas-box" bind:clientWidth={boxW} style:height="{SLIDE_H * scale}px">
        <div
          class="canvas"
          bind:this={canvas}
          style:transform="scale({scale})"
          onpointerdown={boardDown}
          oncontextmenu={boardMenu}
          onpointermove={boardMove}
          onpointerup={() => (drag = null)}
          role="application"
          aria-label="Board"
        >
          <div class="backdrop"><SlideView slide={round.slide} mode="edit" fallbackBg="#1d5e3a" /></div>
          <BoardSpaces {round} selected={selId} ondown={spaceDown} />
        </div>
      </div>
      <aside class="side">
        {#if sel}
          <h4>Space</h4>
          <label class="field">Name<input bind:value={sel.name} aria-label="Space name" /></label>
          <div class="row">
            <label class="check small">Color <input type="color" bind:value={sel.color} aria-label="Space color" /></label>
            <div class="pop">
              <button class="small" onclick={() => (pickingIcon = !pickingIcon)}>
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
          <p class="muted small">Click a space to set it up, or click the board to add one. New spaces go after the selected space, so you can draw the path in order.</p>
        {/if}
      </aside>
    </div>
  {:else if view === 'backdrop'}
    <div class="se-wrap"><SlideEditor slide={round.slide} placeholder="Click to type" fill /></div>
  {:else}
    <div class="zones">
      <p class="muted small">Places off the board (the Shadow Realm) where players get sent until they escape. Send players there from a space's actions or the host panel.</p>
      {#each round.zones as z, i (z.id)}
        <div class="row zone">
          <input bind:value={z.name} aria-label="Zone name" />
          <input class="grow" bind:value={z.hostNotes} placeholder="Host notes (how to escape…)" aria-label="{z.name} notes" />
          <button class="small" onclick={() => (zoneSlide = z.id)}>Edit its screen…</button>
          <button class="ghost small" onclick={() => round.zones.splice(i, 1)} aria-label="Delete zone {z.name}">✕</button>
        </div>
      {/each}
      <button onclick={addZone}>＋ Zone</button>
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
  }
  .tabs .on,
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
