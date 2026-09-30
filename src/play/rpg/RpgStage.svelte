<!--
  What an RPG round shows (games-maker spec §10): the focused screen (or a 2×2 split view of every party), avatars,
  the stats strip and the map overlay, with a flip-screen transition when the party moves. The host's copy can click
  objects and drag avatars; viewers never get secret objects, hotspots or host notes drawn.
-->
<script lang="ts">
  import { getContext } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import type { MediaRole } from '../../lib/mediactl.svelte';
  import { mediaUrls } from '../../lib/media.svelte';
  import { isRpg, SLIDE_H, SLIDE_W, type Game, type Screen, type ScreenRef, type Session } from '../../lib/model';
  import SlideView from '../../lib/slide/SlideView.svelte';
  import Avatar from '../../lib/rpg/Avatar.svelte';
  import { activeParty, DIR_VEC, findIn, focusRef, occupiedScreens, screenElements, screenSlide, worldById } from '../../lib/rpg';
  import { inventory, itemDef } from '../../lib/toolset';
  import MapView from './MapView.svelte';
  import MusicPlayer from './MusicPlayer.svelte';
  import StatsStrip from './StatsStrip.svelte';

  let {
    game,
    session,
    role,
    onobject,
    onavatar,
    onobjectmove,
  }: {
    game: Game;
    session: Session;
    role: MediaRole;
    /** Host: an object on the stage was clicked. */
    onobject?: (elId: string) => void;
    /** Host: an avatar was dragged to (x, y), or clicked (no position). */
    onavatar?: (playerId: string, at?: { x: number; y: number }) => void;
    /** Host: an object was dragged to a new spot on its screen. */
    onobjectmove?: (elId: string, at: { x: number; y: number }) => void;
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
  const music = $derived.by(() => {
    const ref = panes[0];
    const found = world && ref ? findIn(world, ref) : null;
    const id = found?.screen.music ?? found?.map.music;
    return id ? mediaUrls[id] : undefined;
  });

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
  let drag = $state<{ id: string; dx: number; dy: number; x: number; y: number; moved: boolean } | null>(null);

  function avatarDown(e: PointerEvent, id: string, x: number, y: number): void {
    if (!onavatar || split) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const s = stage?.scale || 1;
    drag = { id, dx: e.clientX / s - x, dy: e.clientY / s - y, x, y, moved: false };
  }
  function avatarMove(e: PointerEvent): void {
    if (!drag) return;
    const s = stage?.scale || 1;
    const x = Math.round(e.clientX / s - drag.dx);
    const y = Math.round(e.clientY / s - drag.dy);
    if (Math.abs(x - drag.x) + Math.abs(y - drag.y) > 3) drag = { ...drag, x, y, moved: true };
  }
  function avatarUp(): void {
    if (!drag) return;
    const d = drag;
    drag = null;
    onavatar?.(d.id, d.moved ? { x: Math.max(0, Math.min(SLIDE_W, d.x)), y: Math.max(0, Math.min(SLIDE_H, d.y)) } : undefined);
  }

  /** An object being dragged by the host: where its box is now. */
  let objDrag = $state<{ id: string; sx: number; sy: number; ox: number; oy: number; x: number; y: number; moved: boolean } | null>(null);

  function objDown(e: PointerEvent, id: string, x: number, y: number): void {
    e.stopPropagation();
    if (e.button !== 0) return;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Synthetic pointers can't be captured; the drag still works over the stage.
    }
    objDrag = { id, sx: e.clientX, sy: e.clientY, ox: x, oy: y, x, y, moved: false };
  }
  function objMove(e: PointerEvent): void {
    if (!objDrag) return;
    const s = stage?.scale || 1;
    const x = Math.round(objDrag.ox + (e.clientX - objDrag.sx) / s);
    const y = Math.round(objDrag.oy + (e.clientY - objDrag.sy) / s);
    const moved = objDrag.moved || Math.abs(e.clientX - objDrag.sx) + Math.abs(e.clientY - objDrag.sy) > 4;
    objDrag = { ...objDrag, x, y, moved };
  }
  function objUp(): void {
    const d = objDrag;
    objDrag = null;
    if (!d) return;
    if (d.moved && onobjectmove) onobjectmove(d.id, { x: d.x, y: d.y });
    else onobject?.(d.id);
  }

  /** Items a player has equipped that are worn (they show on the avatar). */
  const worn = (playerId: string) =>
    inventory(session, playerId)
      .filter((e) => e.equipped)
      .map((e) => itemDef(game, e.item))
      .filter((d): d is NonNullable<typeof d> => !!d?.wearable);
  const GEAR = { head: '🎩', hand: '🗡', body: '🛡', badge: '⭐' } as const;
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
        onpointerdown={(e) => objDown(e, el.id, el.x, el.y)}
        onpointermove={objMove}
        onpointerup={objUp}
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.key === 'Enter' && onobject(el.id)}
        aria-label="Object: {el.name || el.role?.class}"
        title="{el.name || el.role?.class}: click for its card, drag to move it"
      ></button>
    {/each}
  {/if}
  {#each session.players.filter((p) => st?.positions[p.id]?.screen === ref.screen && !st?.positions[p.id]?.hidden) as p (p.id)}
    {@const pos = st!.positions[p.id]}
    {@const x = drag?.id === p.id ? drag.x : pos.x}
    {@const y = drag?.id === p.id ? drag.y : pos.y}
    <div
      class="avatar"
      class:down={pos.down}
      class:draggable={!!onavatar && !split}
      style:left="{x}px"
      style:top="{y}px"
      onpointerdown={(e) => avatarDown(e, p.id, pos.x, pos.y)}
      onpointermove={avatarMove}
      onpointerup={avatarUp}
      role="presentation"
    >
      <Avatar player={p} size={120} />
      <div class="nameplate" style:background={p.color}>{p.name}</div>
      {#each worn(p.id) as w, i (i)}
        <span class="gear {w.wearable?.slot}" title={w.name}>
          {#if w.icon && mediaUrls[w.icon]}<img src={mediaUrls[w.icon]} alt="" />{:else}{GEAR[w.wearable?.slot ?? 'badge']}{/if}
        </span>
      {/each}
    </div>
  {/each}
{/snippet}

<div class="rpg" class:split>
  {#if world && st}
    {#each panes as ref, i (ref.screen)}
      {@const found = findIn(world, ref)}
      {#if found}
        <div
          class="pane"
          style:transform={split ? `translate(${(i % 2) * 50}%, ${Math.floor(i / 2) * 50}%) scale(0.5)` : undefined}
        >
          {#key ref.screen}
            <div class="screen" in:enter={{ map: ref.map }}>{@render screenPane(ref, found.screen)}</div>
          {/key}
          {#if split}
            <div class="pane-label">
              {st.parties.find((pt) => pt.members.some((m) => st.positions[m]?.screen === ref.screen))?.name ?? ''}
              {#if hostCopy}· {found.screen.name}{/if}
            </div>
          {/if}
        </div>
      {/if}
    {/each}
    {#if bar !== 'hidden'}
      <div class="strip bar-{bar}"><StatsStrip {game} {session} players={stripPlayers} /></div>
    {/if}
    {#if st.mapShown}
      <div class="map-ov" transition:fade={{ duration: 200 }}>
        <MapView {world} {st} players={session.players} audience focus={panes[0]} />
      </div>
    {/if}
  {:else}
    <div class="empty">{world ? 'Starting…' : 'This round has no world yet.'}</div>
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
  .avatar.draggable {
    cursor: grab;
    touch-action: none;
  }
  .avatar.down {
    filter: grayscale(1) brightness(0.7);
    transform: translate(-50%, -50%) rotate(90deg);
  }
  .nameplate {
    margin-top: -10px;
    padding: 2px 12px;
    border-radius: 8px;
    border: 3px solid #000;
    color: #fff;
    font: 26px 'Anton', 'Oswald', sans-serif;
    text-shadow: 1px 1px 0 #000;
    white-space: nowrap;
  }
  .gear {
    position: absolute;
    font-size: 44px;
    line-height: 1;
  }
  .gear img {
    width: 56px;
    height: 56px;
    object-fit: contain;
  }
  .gear.head {
    top: -34px;
  }
  .gear.hand {
    right: -30px;
    top: 40px;
  }
  .gear.body {
    left: -30px;
    top: 40px;
  }
  .gear.badge {
    right: -18px;
    top: -10px;
    font-size: 34px;
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
  .empty {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: #fff;
    font-size: 60px;
  }
</style>
