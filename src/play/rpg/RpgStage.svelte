<!--
  What an RPG round shows (games-maker spec §10): the focused screen (or a 2×2 split view of every party), avatars,
  the stats strip and the map overlay, with a flip-screen transition when the party moves. The host's copy can click
  objects and drag avatars (to another screen or party too); viewers never get secret objects, hotspots or host notes
  drawn.
-->
<script lang="ts">
  import { getContext, onDestroy } from 'svelte';
  import { fade, fly } from '../../lib/motion.svelte';
  import type { MediaRole } from '../../lib/mediactl.svelte';
  import { mediaUrls } from '../../lib/media.svelte';
  import { isRpg, SLIDE_H, SLIDE_W, type Game, type Position, type Screen, type ScreenRef, type Session, type SlideElement } from '../../lib/model';
  import SlideView from '../../lib/slide/SlideView.svelte';
  import AvatarToken from '../../lib/rpg/AvatarToken.svelte';
  import { activeParty, DIR_VEC, findIn, focusRef, occupiedScreens, screenElements, screenSlide, worldById } from '../../lib/rpg';
  import { wornItems } from '../../lib/toolset';
  import { dragGhost, dropHover, dropTarget } from '../dragdrop.svelte';
  import { avatarSpot, wayOffEdge, type AvatarDrop } from './hostops';
  import MapView from './MapView.svelte';
  import MusicPlayer from './MusicPlayer.svelte';
  import StatsStrip from './StatsStrip.svelte';

  let {
    game,
    session,
    role,
    selected = [],
    onobject,
    onavatar,
    onobjectmove,
    onpickup,
  }: {
    game: Game;
    session: Session;
    role: MediaRole;
    /** Host: the selected players (ringed in the host's copy in dual mode, never on stream). */
    selected?: string[];
    /** Host: an object on the stage was clicked. */
    onobject?: (elId: string) => void;
    /** Host: an avatar was dragged somewhere (a spot, another screen, a party), or clicked (no drop). */
    onavatar?: (playerId: string, drop?: AvatarDrop) => void;
    /** Host: an object was dragged to a new spot on its screen. */
    onobjectmove?: (elId: string, at: { x: number; y: number }) => void;
    /** Host: an item or currency object was dropped on a player (they pick it up). */
    onpickup?: (elId: string, playerId: string) => void;
  } = $props();

  const round = $derived.by(() => {
    const r = game.rounds[session.currentRound];
    return isRpg(r) ? r : undefined;
  });
  const world = $derived(worldById(game, round?.world));
  const st = $derived(world ? session.worlds?.[world.id] : undefined);
  /** The host's copy (dual mode) sees secret objects faded; everyone else (viewers, single window) never sees them. */
  const hostCopy = $derived(role === 'mirror');
  const panes = $derived.by((): ScreenRef[] => {
    if (!st) return [];
    if (st.split) return occupiedScreens(st).slice(0, 4);
    const f = focusRef(st);
    return f ? [f] : [];
  });
  const split = $derived(panes.length > 1);
  const party = $derived(st ? activeParty(st) : undefined);
  const stripPlayers = $derived(
    session.players.length > 12 && party ? session.players.filter((p) => party.members.includes(p.id)) : session.players,
  );
  const bar = $derived(game.theme?.scoreBar ?? 'bottom');
  const placeCaption = $derived(!!game.settings.stream?.placeCaption);
  const music = $derived.by(() => {
    const ref = panes[0];
    const found = world && ref ? findIn(world, ref) : null;
    const id = found?.screen.music ?? found?.map.music;
    return id ? mediaUrls[id] : undefined;
  });

  /** Split view: each screen at half size, in a 2×2 grid; two side by side in the middle, a third centred below. */
  function paneAt(i: number, n: number): string {
    const x = n === 3 && i === 2 ? 25 : (i % 2) * 50;
    const y = n === 2 ? 25 : Math.floor(i / 2) * 50;
    return `translate(${x}%, ${y}%) scale(0.5)`;
  }

  /** Where the incoming screen slides in from (the flip-screen effect), by the direction of the last move. */
  function enter(node: Element, { map }: { map: string }) {
    const m = world?.maps.find((x) => x.id === map);
    const dir = st?.lastMove?.dir;
    if (m?.transition === 'cut' || !st?.lastMove || Date.now() - st.lastMove.at > 1500) return { duration: 0 };
    if (m?.transition === 'fade' || dir === 'warp' || !dir) return fade(node, { duration: 350 });
    const [dx, dy] = DIR_VEC[dir];
    return fly(node, { x: dx * SLIDE_W, y: dy * SLIDE_H, duration: 450, opacity: 1 });
  }

  const stage = getContext<{ scale: number } | undefined>('stage');
  /** The stage, and its stats strip (a dropped avatar stays clear of it). */
  let rpgEl = $state<HTMLElement>();
  let stripEl = $state<HTMLElement>();
  // Leaving the round mid-drag leaves nothing lit up or following the pointer.
  onDestroy(() => {
    dragGhost.now = null;
    dropHover.at = null;
  });

  /** The dragged thing keeps the pointer, even over the host panel (a screen on the minimap, a party's chip). */
  function capture(e: PointerEvent): void {
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Synthetic pointers can't be captured; the drag still works over the stage.
    }
  }

  /** Where the pointer has taken something dragged from (ox, oy) on its screen: split view draws each screen at half size. */
  function dragged<T extends { sx: number; sy: number; ox: number; oy: number; x: number; y: number; moved: boolean }>(d: T, e: PointerEvent): T {
    const s = (stage?.scale || 1) * (split ? 0.5 : 1);
    const moved = d.moved || Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 4;
    return { ...d, x: Math.round(d.ox + (e.clientX - d.sx) / s), y: Math.round(d.oy + (e.clientY - d.sy) / s), moved };
  }

  /** An avatar being dragged by the host: where it is now on its screen. */
  let drag = $state<{ id: string; sx: number; sy: number; ox: number; oy: number; x: number; y: number; moved: boolean } | null>(null);

  function avatarDown(e: PointerEvent, id: string, pos: Position): void {
    if (!onavatar || e.button !== 0) return;
    e.stopPropagation();
    capture(e);
    drag = { id, sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y, x: pos.x, y: pos.y, moved: false };
  }

  /** What a dragged avatar is over: a screen (on a map, or another split-view pane) or a party chip, else its own pane. */
  const avatarOver = (e: PointerEvent) => dropTarget(e.clientX, e.clientY, '[data-screen], [data-party]', e.currentTarget as Element);

  function avatarMove(e: PointerEvent): void {
    if (!drag) return;
    drag = dragged(drag, e);
    if (!drag.moved) return;
    const t = avatarOver(e);
    const screen = t?.dataset.screen;
    dropHover.at = t?.dataset.party ? `party:${t.dataset.party}` : screen && screen !== st?.positions[drag.id]?.screen ? `screen:${screen}` : null;
    // Off the stage (over the host panel): a copy follows the pointer.
    const r = rpgEl?.getBoundingClientRect();
    const off = !!r && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom);
    const player = session.players.find((p) => p.id === drag?.id);
    dragGhost.now = off && player ? { x: e.clientX, y: e.clientY, player } : null;
  }

  /** The browser took the pointer away (a touch gesture, say): the avatar goes back where it was. */
  function avatarCancel(): void {
    drag = null;
    dropHover.at = null;
    dragGhost.now = null;
  }

  function avatarUp(e: PointerEvent): void {
    const d = drag;
    avatarCancel();
    const pos = d && st?.positions[d.id];
    if (!d || !pos || !world) return;
    if (!d.moved) return onavatar?.(d.id);
    const t = avatarOver(e);
    if (t?.dataset.party) return onavatar?.(d.id, { party: t.dataset.party });
    const screen = t?.dataset.screen;
    const pane = t?.classList.contains('pane');
    if (t && screen && screen !== pos.screen) {
      const to = { map: t.dataset.map!, screen };
      // On another split-view pane: where it was dropped there.
      if (!pane) return onavatar?.(d.id, { to });
      const r = t.getBoundingClientRect();
      return onavatar?.(d.id, { to, at: spotOn(t, ((e.clientX - r.left) / r.width) * SLIDE_W, ((e.clientY - r.top) / r.height) * SLIDE_H) });
    }
    // Its own screen on a map, or far from the stage over nothing it can go to: it goes back where it was.
    const near = d.x > -SLIDE_W / 4 && d.x < SLIDE_W * 1.25 && d.y > -SLIDE_H / 4 && d.y < SLIDE_H * 1.25;
    if ((t && screen && !pane) || !near) return;
    // Just past an edge of its screen: through the way out there, like the pad. Where there's none, it stays inside.
    const way = wayOffEdge(world, pos, d.x, d.y);
    onavatar?.(d.id, way ?? { spot: spotOn((e.currentTarget as HTMLElement).closest('.pane'), d.x, d.y) });
  }

  /** Where an avatar dropped at (x, y) on a pane's screen stands: all of it on the screen, clear of the stats strip. */
  function spotOn(pane: Element | null, x: number, y: number): { x: number; y: number } {
    const r = pane?.getBoundingClientRect();
    const s = stripEl?.getBoundingClientRect();
    if (!r?.height || !s?.height) return avatarSpot(x, y);
    // The strip's edge in the pane's own 1920×1080 (in split view it only covers the panes along it).
    const k = SLIDE_H / r.height;
    return bar === 'top' ? avatarSpot(x, y, Math.max(0, (s.bottom - r.top) * k)) : avatarSpot(x, y, 0, Math.min(SLIDE_H, (s.top - r.top) * k));
  }

  /** An object being dragged by the host: where its box is now, and whether it can be picked up (dropped on a player). */
  let objDrag = $state<{ id: string; sx: number; sy: number; ox: number; oy: number; x: number; y: number; moved: boolean; pick: boolean } | null>(null);

  function objDown(e: PointerEvent, el: SlideElement): void {
    e.stopPropagation();
    if (e.button !== 0) return;
    capture(e);
    const pick = !!onpickup && (el.role?.class === 'item' || el.role?.class === 'currency');
    objDrag = { id: el.id, sx: e.clientX, sy: e.clientY, ox: el.x, oy: el.y, x: el.x, y: el.y, moved: false, pick };
  }

  /** The player a dragged item or pile of currency is over (their avatar, or their card on the stats strip). */
  const pickerOver = (e: PointerEvent) => (objDrag?.pick ? dropTarget(e.clientX, e.clientY, '[data-player-id]', e.currentTarget as Element)?.dataset.playerId : undefined);

  function objMove(e: PointerEvent): void {
    if (!objDrag) return;
    objDrag = dragged(objDrag, e);
    const on = objDrag.moved ? pickerOver(e) : undefined;
    dropHover.at = on ? `player:${on}` : null;
  }
  function objCancel(): void {
    objDrag = null;
    dropHover.at = null;
  }
  function objUp(e: PointerEvent): void {
    const d = objDrag;
    const on = d?.moved ? pickerOver(e) : undefined;
    objDrag = null;
    dropHover.at = null;
    if (!d) return;
    if (on && onpickup) onpickup(d.id, on);
    else if (d.moved && onobjectmove) onobjectmove(d.id, { x: d.x, y: d.y });
    else onobject?.(d.id);
  }

</script>

{#snippet screenPane(ref: ScreenRef, screen: Screen)}
  {@const els = screenElements(st, screen, !hostCopy)}
  <SlideView slide={{ ...screenSlide(st, screen), elements: els }} mode="play" {role} fallbackBg="#2f6b3a" />
  {#each els.filter((e) => e.role?.statsShown) as el (el.id)}
    {@const stats = st?.objects[el.id]?.stats ?? el.role?.stats ?? []}
    {#if stats.length}
      <div class="npc-stats" style:left="{el.x + el.w / 2}px" style:top="{el.y}px">
        {#each stats as s, i (i)}<span>{s.name} <b>{s.value}</b></span>{/each}
      </div>
    {/if}
  {/each}
  {#if onobject}
    <!-- Click targets over objects with a name or class (the host's copy only: viewers never get these). -->
    {#each els.filter((e) => e.role || e.name) as el (el.id)}
      {@const d = objDrag?.id === el.id ? objDrag : null}
      <button
        class="hit"
        class:dragging={!!d?.moved}
        style:left="{d ? d.x : el.x}px"
        style:top="{d ? d.y : el.y}px"
        style:width="{el.w}px"
        style:height="{el.h}px"
        style:transform="rotate({el.rotation}deg)"
        data-object={el.id}
        onpointerdown={(e) => objDown(e, el)}
        onpointermove={objMove}
        onpointerup={objUp}
        onpointercancel={objCancel}
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.key === 'Enter' && onobject(el.id)}
        aria-label="Object: {el.name || el.role?.class}"
        title="{el.name || el.role?.class}: click for its card, drag to move it{el.role?.class === 'item' || el.role?.class === 'currency' ? ' (onto a player: they pick it up)' : ''}"
      ></button>
    {/each}
  {/if}
  {#each session.players.filter((p) => st?.positions[p.id]?.screen === ref.screen && !st?.positions[p.id]?.hidden) as p (p.id)}
    {@const pos = st!.positions[p.id]}
    {@const d = drag?.id === p.id ? drag : null}
    <div
      class="avatar"
      data-player-id={p.id}
      class:down={pos.down}
      class:draggable={!!onavatar}
      class:dragging={!!d?.moved}
      class:picked={hostCopy && selected.includes(p.id)}
      class:drop-on={dropHover.at === `player:${p.id}`}
      style:left="{d ? d.x : pos.x}px"
      style:top="{d ? d.y : pos.y}px"
      onpointerdown={(e) => avatarDown(e, p.id, pos)}
      onpointermove={avatarMove}
      onpointerup={avatarUp}
      onpointercancel={avatarCancel}
      role="presentation"
    >
      <AvatarToken player={p} size={120} worn={wornItems(game, session, p.id)} />
    </div>
  {/each}
{/snippet}

<div class="rpg" class:split bind:this={rpgEl}>
  {#if world && st}
    {#each panes as ref, i (ref.screen)}
      {@const found = findIn(world, ref)}
      {#if found}
        <!-- Its screen: the host's right-click or drop puts things on the screen under the pointer. -->
        <div
          class="pane"
          class:drop-on={dropHover.at === `screen:${ref.screen}`}
          style:transform={split ? paneAt(i, panes.length) : undefined}
          data-map={ref.map}
          data-screen={ref.screen}
        >
          {#key ref.screen}
            <div class="screen" in:enter={{ map: ref.map }}>{@render screenPane(ref, found.screen)}</div>
          {/key}
          {#if split}
            <div class="pane-label">
              {st.parties.find((pt) => pt.members.some((m) => st.positions[m]?.screen === ref.screen))?.name ?? ''}
              {#if hostCopy || placeCaption}· {found.screen.name}{/if}
            </div>
          {:else if placeCaption}
            <!-- Where the party is, for viewers (an option on the pre-game screen). -->
            <div class="pane-label place" class:low={bar === 'top'}>📍 {found.screen.name}</div>
          {/if}
        </div>
      {/if}
    {/each}
    {#if bar !== 'hidden'}
      <div class="strip bar-{bar}" bind:this={stripEl}><StatsStrip {game} {session} players={stripPlayers} host={!!onavatar} draggable={!!onavatar} /></div>
    {/if}
    {#if st.mapShown}
      <div class="map-ov bar-{bar}" transition:fade={{ duration: 200 }}>
        <MapView {world} {st} players={session.players} audience fit focus={panes[0]} />
      </div>
    {/if}
  {:else}
    <!-- A world is only started (the state made) once it has a screen to start on. -->
    <div class="empty">{world ? `${world.name} has no screen to start on yet.` : 'This round has no world yet.'}</div>
  {/if}
</div>
{#if role !== 'mirror'}<MusicPlayer src={music} />{/if}

<style>
  .rpg {
    /* Its own layers: avatars and the strip stay under tool overlays (wheels, pop-ups) and the cover. */
    isolation: isolate;
    position: absolute;
    inset: 0;
    overflow: hidden;
    background: #000;
  }
  .pane {
    position: absolute;
    left: 0;
    top: 0;
    width: 1920px;
    height: 1080px;
    transform-origin: 0 0;
    overflow: hidden;
  }
  .split .pane {
    outline: 6px solid #000;
  }
  .screen {
    position: absolute;
    inset: 0;
  }
  .pane-label {
    position: absolute;
    left: 24px;
    top: 20px;
    padding: 6px 18px;
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.7);
    color: #fff;
    font: 48px 'Anton', 'Oswald', sans-serif;
  }
  .pane-label.place {
    z-index: 20;
    font-size: 40px;
    pointer-events: none;
  }
  .pane-label.place.low {
    top: auto;
    bottom: 20px;
  }
  .hit {
    position: absolute;
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
    z-index: 5000;
  }
  .hit.dragging {
    outline: 3px dashed #ffcc00;
    cursor: grabbing;
  }
  .hit:hover {
    outline: 3px solid rgba(255, 204, 0, 0.8);
  }
  .npc-stats {
    position: absolute;
    transform: translate(-50%, -110%);
    display: flex;
    gap: 10px;
    padding: 4px 14px;
    border-radius: 10px;
    background: rgba(0, 0, 0, 0.75);
    border: 3px solid #ffcc00;
    color: #fff;
    font: 30px 'Anton', 'Oswald', sans-serif;
    white-space: nowrap;
    z-index: 5500;
    pointer-events: none;
  }
  .npc-stats b {
    color: #ffcc00;
  }
  .avatar {
    position: absolute;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    z-index: 6000;
    transition:
      left 0.25s ease,
      top 0.25s ease;
    filter: drop-shadow(0 6px 8px rgba(0, 0, 0, 0.6));
  }
  /* No text selection from a drag: a selected name would be dragged off as text next time. */
  .avatar.draggable {
    cursor: grab;
    touch-action: none;
    user-select: none;
  }
  /* Following the pointer (no easing behind it). */
  .avatar.dragging {
    cursor: grabbing;
    transition: none;
    z-index: 6500;
  }
  .avatar.down {
    filter: grayscale(1) brightness(0.7);
    transform: translate(-50%, -50%) rotate(90deg);
  }
  /* Selected (the host's copy in dual mode only), or what a dragged item would go to. */
  .avatar.picked::before,
  .avatar.drop-on::before {
    content: '';
    position: absolute;
    left: 50%;
    top: 60px;
    width: 150px;
    height: 150px;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    border: 8px solid #ffcc00;
    box-shadow: 0 0 24px #ffcc00;
    pointer-events: none;
  }
  .avatar.drop-on::before {
    border-style: dashed;
    border-color: #fff;
  }
  /* A screen a dragged avatar would go to (split view). */
  .pane.drop-on::after {
    content: '';
    position: absolute;
    inset: 0;
    border: 16px dashed #ffcc00;
    pointer-events: none;
    z-index: 6900;
  }
  .strip {
    position: absolute;
    left: 0;
    right: 0;
    z-index: 7000;
  }
  .strip.bar-bottom {
    bottom: 0;
  }
  .strip.bar-top {
    top: 0;
  }
  /* Clear of the stats strip, wherever it is. */
  .map-ov {
    position: absolute;
    inset: 60px 80px 200px;
    z-index: 8000;
    padding: 30px;
    border-radius: 24px;
    background: rgba(0, 0, 20, 0.88);
    border: 4px solid #ffcc00;
    overflow: hidden;
  }
  .map-ov.bar-top {
    inset: 200px 80px 60px;
  }
  .map-ov.bar-hidden {
    inset: 60px 80px;
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
