<!--
  What a board-game round shows (games-maker spec §7.13): the board with its spaces, the players' tokens stepping
  along them, whose turn it is, who is stuck in an off-board zone, and the stats strip. Or a zone's own screen. The
  host's copy takes clicks (a token selects its player, a space opens its card or, at a fork, is the way to go) and
  drags (a token onto a space or a zone sends its player there).
-->
<script lang="ts">
  import { getContext, onDestroy } from 'svelte';
  import { fade } from '../../lib/motion.svelte';
  import { textOn } from '../../lib/colors';
  import { currentPlayer, HOP_MS, rimSpots, shownSpace, spaceById, waysNow } from '../../lib/boardgame';
  import BoardSpaces from '../../lib/boardgame/BoardSpaces.svelte';
  import type { MediaRole } from '../../lib/mediactl.svelte';
  import type { Game, Session } from '../../lib/model';
  import AvatarToken from '../../lib/rpg/AvatarToken.svelte';
  import SlideView from '../../lib/slide/SlideView.svelte';
  import { nameList } from '../../lib/session';
  import { wornItems } from '../../lib/toolset';
  import StatsStrip from '../rpg/StatsStrip.svelte';
  import { dropHover, dropTarget } from '../dragdrop.svelte';
  import { boardNow } from './bgops';

  let {
    game,
    session,
    role,
    selected = [],
    ontoken,
    onspace,
  }: {
    game: Game;
    session: Session;
    role: MediaRole;
    /** Host: the selected players (ringed in the host's copy in dual mode, never on stream). */
    selected?: string[];
    /** Host: a token was clicked (no drop), or dragged onto a space or a zone. */
    ontoken?: (playerId: string, to?: { space?: string; zone?: string }) => void;
    /** Host: a space was clicked. */
    onspace?: (spaceId: string) => void;
  } = $props();
  const now_ = $derived(boardNow(game, session));
  const round = $derived(now_.round);
  const bs = $derived(now_.bs);
  const audience = $derived(role !== 'mirror');
  const turnId = $derived(bs ? currentPlayer(bs) : undefined);
  const turn = $derived(session.players.find((p) => p.id === turnId));
  const zone = $derived(round?.zones.find((z) => z.id === bs?.zoneShown));
  const bar = $derived(game.theme?.scoreBar ?? 'bottom');

  // Ticks while a move animates, so tokens step space by space.
  let now = $state(Date.now());
  let raf = 0;
  $effect(() => {
    const h = bs?.hop;
    if (!h) return;
    const end = h.at + h.path.length * HOP_MS;
    const tick = () => {
      now = Date.now();
      if (now < end) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  });
  onDestroy(() => cancelAnimationFrame(raf));

  /** The height of the label row (whose turn, how to win, zones), and of the stats strip, in stage pixels. */
  let labelsH = $state(0);
  let stripH = $state(0);
  /** Along the top, tokens stay below the label row, or below the stats strip when it's at the top (the labels go to the bottom then). */
  const clearTop = $derived(bar === 'top' ? stripH + 8 : 20 + labelsH + 8);

  /** Each token on the board and where it's drawn (keyed by player, so a move slides from space to space). */
  const tokens = $derived.by(() => {
    if (!bs || !round) return [];
    const groups = new Map<string, string[]>();
    for (const p of session.players) {
      const s = shownSpace(bs, p.id, now);
      if (s) groups.set(s, [...(groups.get(s) ?? []), p.id]);
    }
    const out: { id: string; x: number; y: number; small: boolean }[] = [];
    for (const [spaceId, ids] of groups) {
      const sp = spaceById(round, spaceId);
      if (!sp) continue;
      const small = ids.length > 3;
      const spots = rimSpots(ids.length, small ? 32 : 42);
      // On a space near the top (boards made before spaces started lower), a token that would slip under the turn
      // banner, the win notes or the stats strip comes down just enough to stay in sight. The board itself stays as it is.
      const lowest = clearTop + (small ? 32 : 42);
      ids.forEach((id, i) => out.push({ id, x: sp.x + spots[i].dx, y: Math.max(lowest, sp.y + spots[i].dy), small }));
    }
    return out;
  });
  const inZone = (id: string) => session.players.filter((p) => bs?.positions[p.id]?.zone === id);
  /** The host's copy in dual mode: the selection, and the spaces to pick at a fork, are marked (never on stream). */
  const mirror = $derived(role === 'mirror');
  const ways = $derived(mirror && round && bs ? (waysNow(round, bs)?.ways ?? []) : []);

  const stage = getContext<{ scale: number } | undefined>('stage');
  /** A token being dragged by the host: where it is now on the board. */
  let drag = $state<{ id: string; sx: number; sy: number; ox: number; oy: number; x: number; y: number; moved: boolean } | null>(null);

  function tokenDown(e: PointerEvent, t: { id: string; x: number; y: number }): void {
    if (!ontoken || e.button !== 0) return;
    e.stopPropagation();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Synthetic pointers can't be captured; the drag still works over the stage.
    }
    drag = { id: t.id, sx: e.clientX, sy: e.clientY, ox: t.x, oy: t.y, x: t.x, y: t.y, moved: false };
  }

  /** The space or zone a dragged token is over. */
  const tokenOver = (e: PointerEvent) => dropTarget(e.clientX, e.clientY, '[data-space], [data-zone]', e.currentTarget as Element);
  const where = (t: HTMLElement | null) => (t?.dataset.space ? { space: t.dataset.space } : t?.dataset.zone ? { zone: t.dataset.zone } : undefined);

  function tokenMove(e: PointerEvent): void {
    if (!drag) return;
    const s = stage?.scale || 1;
    const moved = drag.moved || Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) > 4;
    drag = { ...drag, x: Math.round(drag.ox + (e.clientX - drag.sx) / s), y: Math.round(drag.oy + (e.clientY - drag.sy) / s), moved };
    const to = moved ? where(tokenOver(e)) : undefined;
    dropHover.at = to?.space ? `space:${to.space}` : to?.zone ? `zone:${to.zone}` : null;
  }

  /** The browser took the pointer away (a touch gesture, say): the token goes back where it was. */
  function tokenCancel(): void {
    drag = null;
    dropHover.at = null;
  }

  function tokenUp(e: PointerEvent): void {
    const d = drag;
    tokenCancel();
    if (!d) return;
    if (!d.moved) return ontoken?.(d.id);
    // Anywhere else, it goes back where it was.
    const to = where(tokenOver(e));
    if (to) ontoken?.(d.id, to);
  }

  /** A click on a space (the host's copy). */
  function boardClick(e: MouseEvent): void {
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-space]')?.dataset.space;
    if (id) onspace?.(id);
  }

  const lit = $derived(dropHover.at?.startsWith('space:') ? dropHover.at.slice(6) : null);
</script>

<div class="bg">
  {#if round && bs}
    {#if zone}
      {#key zone.id}
        <div class="layer" in:fade={{ duration: 300 }}>
          <SlideView slide={zone.slide} mode="play" {role} fallbackBg="#2a0845" />
          <div class="zone-players">
            {#each inZone(zone.id) as p (p.id)}
              <div class="tok"><AvatarToken player={p} size={130} worn={wornItems(game, session, p.id)} /></div>
            {/each}
          </div>
        </div>
      {/key}
    {:else}
      <div class="layer" class:clickable={!!onspace} onclick={onspace ? boardClick : undefined} role="presentation">
        <SlideView slide={round.slide} mode="play" {role} fallbackBg="#1d5e3a" />
        <BoardSpaces {round} {audience} revealed={bs.revealed ?? []} marked={ways} {lit} />
        {#each tokens as t (t.id)}
          {@const p = session.players.find((x) => x.id === t.id)}
          {@const d = drag?.id === t.id ? drag : null}
          {#if p}
            <div
              class="tok on-board"
              class:current={t.id === turnId}
              class:grab={!!ontoken}
              class:dragging={!!d?.moved}
              class:picked={mirror && selected.includes(p.id)}
              class:drop-on={dropHover.at === `player:${p.id}`}
              style:left="{d ? d.x : t.x}px"
              style:top="{d ? d.y : t.y}px"
              data-player={p.name}
              data-player-id={p.id}
              onpointerdown={(e) => tokenDown(e, t)}
              onpointermove={tokenMove}
              onpointerup={tokenUp}
              onpointercancel={tokenCancel}
              role="presentation"
            >
              <AvatarToken player={p} size={t.small ? 64 : 84} worn={wornItems(game, session, p.id)} name={false} />
            </div>
          {/if}
        {/each}
      </div>
    {/if}
    <!-- Whose turn, how to win, who's in a zone: one thin row along the top (the bottom when the stats strip is at the top). -->
    <div class="labels" class:low={bar === 'top'} bind:clientHeight={labelsH}>
      {#if turn}
        <div class="turn-banner" style:background={turn.color} style:color={textOn(turn.color)}>🎲 {turn.name}’s turn</div>
      {/if}
      {#if round.winPublic && round.winNotes}<div class="win">🏆 {round.winNotes}</div>{/if}
      <span class="spacer"></span>
      <!-- While the host drags a token in their own copy (dual mode), every zone is there to drop it on. -->
      {#if (round.zones.some((z) => inZone(z.id).length) || (mirror && drag?.moved)) && !zone}
        <div class="zones">
          {#each round.zones as z (z.id)}
            {#if inZone(z.id).length || (mirror && drag?.moved)}
              <div class="zone" class:target={!!ontoken} class:drop-on={dropHover.at === `zone:${z.id}`} data-zone={z.id}>
                🌀 {z.name}{inZone(z.id).length ? `: ${nameList(inZone(z.id).map((p) => p.name))}` : ''}
              </div>
            {/if}
          {/each}
        </div>
      {/if}
    </div>
    {#if bar !== 'hidden'}
      <div class="strip bar-{bar}" bind:clientHeight={stripH}><StatsStrip {game} {session} players={session.players} host={!!ontoken} /></div>
    {/if}
  {:else}
    <div class="empty">Starting…</div>
  {/if}
</div>

<style>
  .bg,
  .layer {
    position: absolute;
    inset: 0;
    overflow: hidden;
  }
  .bg {
    /* Its own layers: avatars and the strip stay under tool overlays (wheels, pop-ups) and the cover. */
    isolation: isolate;
    background: #000;
  }
  .tok {
    display: flex;
    flex-direction: column;
    align-items: center;
    filter: drop-shadow(0 6px 8px rgba(0, 0, 0, 0.6));
  }
  .on-board {
    position: absolute;
    transform: translate(-50%, -50%);
    transition:
      left 0.3s ease,
      top 0.3s ease;
    z-index: 10;
  }
  .on-board.current {
    z-index: 11;
    filter: drop-shadow(0 0 12px #ffcc00);
  }
  /* No text selection from a drag: a selected name would be dragged off as text next time. */
  .on-board.grab {
    cursor: grab;
    touch-action: none;
    user-select: none;
  }
  /* Following the pointer (no easing behind it). */
  .on-board.dragging {
    cursor: grabbing;
    transition: none;
    z-index: 12;
  }
  /* Selected (the host's copy in dual mode only), or what a dragged item would go to. */
  .on-board.picked::before,
  .on-board.drop-on::before {
    content: '';
    position: absolute;
    inset: -10px;
    border-radius: 50%;
    border: 6px solid #ffcc00;
    box-shadow: 0 0 18px #ffcc00;
    pointer-events: none;
  }
  .on-board.drop-on::before {
    border-style: dashed;
    border-color: #fff;
  }
  .layer.clickable :global([data-space]) {
    cursor: pointer;
  }
  .zone-players {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 200px;
    display: flex;
    justify-content: center;
    gap: 40px;
  }
  /* Labels over the board never catch clicks meant for the tokens and spaces under them. */
  .labels {
    position: absolute;
    left: 30px;
    right: 30px;
    top: 20px;
    display: flex;
    align-items: flex-start;
    gap: 16px;
    z-index: 20;
    pointer-events: none;
  }
  .labels.low {
    top: auto;
    bottom: 20px;
    align-items: flex-end;
  }
  .turn-banner {
    padding: 4px 20px;
    border-radius: 12px;
    border: 4px solid #000;
    font: 38px 'Anton', 'Oswald', sans-serif;
    white-space: nowrap;
  }
  .zones {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  /* The host can drop tokens on the zones (the labels row lets every other click through). */
  .zone.target {
    pointer-events: auto;
  }
  .zone.drop-on {
    outline: 5px dashed #ffcc00;
    outline-offset: 3px;
  }
  .zone,
  .win {
    padding: 6px 18px;
    border-radius: 12px;
    background: rgba(42, 8, 69, 0.9);
    border: 3px solid #b388ff;
    color: #fff;
    font: 28px 'Anton', 'Oswald', sans-serif;
  }
  .win {
    align-self: center;
    background: rgba(0, 0, 0, 0.75);
    border-color: #ffcc00;
  }
  .strip {
    position: absolute;
    left: 0;
    right: 0;
    z-index: 30;
  }
  .strip.bar-bottom {
    bottom: 0;
  }
  .strip.bar-top {
    top: 0;
  }
  .empty {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: #fff;
    font-size: 60px;
  }
</style>
