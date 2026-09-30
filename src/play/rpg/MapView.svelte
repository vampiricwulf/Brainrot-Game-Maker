<!--
  A world's maps as grids of screens. The audience's version shows only what its map settings allow (whole map, or
  discovered screens), with arrows for open ways out that lead somewhere unknown. The host's version shows
  everything and can be clicked; the players on a screen can be dragged to another one.
-->
<script lang="ts">
  import { textOn } from '../../lib/colors';
  import type { Player, Screen, ScreenRef, World, WorldMap, WorldState } from '../../lib/model';
  import { DIR_ARROW, DIR_VEC, DIRS, exitOf, mapState, mapVisible, sameRef } from '../../lib/rpg';
  import { dropHover, dropTarget } from '../dragdrop.svelte';

  let {
    world,
    st,
    players,
    audience,
    focus,
    onpick,
    only,
    big = false,
    fit = false,
    picked = null,
    onmenu,
    onmove,
  }: {
    world: World;
    st: WorldState | undefined;
    players: Player[];
    audience: boolean;
    focus?: ScreenRef | null;
    onpick?: (ref: ScreenRef, screen: Screen) => void;
    /** Show just this map (the host's minimap, or one tab of the full map). */
    only?: string;
    /** The host's full map: bigger cells and names. */
    big?: boolean;
    /** Fill the box it's in, the whole map showing (scaled to its height too, not only its width). */
    fit?: boolean;
    /** A screen the host picked (outlined). */
    picked?: ScreenRef | null;
    /** Host: a screen was right-clicked. */
    onmenu?: (e: MouseEvent, ref: ScreenRef, screen: Screen) => void;
    /** Host: the players on a screen were dragged onto another one. */
    onmove?: (from: ScreenRef, to: ScreenRef) => void;
  } = $props();

  const maps = $derived((audience ? world.maps.filter((m) => mapVisible(st, m)) : world.maps).filter((m) => !only || m.id === only));
  const stateOf = (m: WorldMap, s: Screen) => (audience ? mapState(st, m, s) : (st?.knowledge[s.id] ?? 'unknown'));
  /** Screens by cell, per map (big maps look each cell up once instead of searching the list). */
  const cells = $derived(new Map(maps.map((m) => [m.id, new Map(m.screens.map((s) => [`${s.col},${s.row}`, s]))])));
  /** Players by screen. */
  const byScreen = $derived.by(() => {
    const out = new Map<string, Player[]>();
    for (const p of players) {
      const pos = st?.positions[p.id];
      if (!pos || pos.hidden) continue;
      out.set(pos.screen, [...(out.get(pos.screen) ?? []), p]);
    }
    return out;
  });

  /** The players on a screen being dragged (their dots follow the pointer) to another screen. */
  let dotDrag = $state<{ from: ScreenRef; colors: string[]; sx: number; sy: number; x: number; y: number; moved: boolean } | null>(null);

  function dotsDown(e: PointerEvent, from: ScreenRef, here: Player[]): void {
    if (!onmove || !here.length || e.button !== 0) return;
    dotDrag = { from, colors: here.map((p) => p.color), sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, moved: false };
  }

  /** The screen under the pointer (on this map or any other), when it isn't the one the players are on. */
  function screenOver(e: PointerEvent): ScreenRef | null {
    const t = dropTarget(e.clientX, e.clientY, '[data-screen]');
    return t && dotDrag && t.dataset.screen !== dotDrag.from.screen ? { map: t.dataset.map!, screen: t.dataset.screen! } : null;
  }

  function dotsMove(e: PointerEvent): void {
    if (!dotDrag) return;
    const moved = dotDrag.moved || Math.abs(e.clientX - dotDrag.sx) + Math.abs(e.clientY - dotDrag.sy) > 4;
    dotDrag = { ...dotDrag, x: e.clientX, y: e.clientY, moved };
    const to = moved ? screenOver(e) : null;
    dropHover.at = to ? `screen:${to.screen}` : null;
  }

  function dotsUp(e: PointerEvent): void {
    const d = dotDrag;
    const to = d?.moved ? screenOver(e) : null;
    dotDrag = null;
    if (!d?.moved) return;
    dropHover.at = null;
    if (to) onmove?.(d.from, to);
  }

  /** Audience arrows: open ways out of a known screen whose destination is still unknown to viewers. */
  function arrows(m: WorldMap, s: Screen) {
    if (!audience || !m.showExits) return [];
    return DIRS.filter((d) => {
      const e = exitOf(m, s, d);
      if (e.kind !== 'open' && e.kind !== 'warp') return false;
      if (e.kind === 'warp' && e.to.map !== m.id) return true;
      const dest = m.screens.find((x) => x.id === e.to.screen);
      return !dest || !mapState(st, m, dest);
    });
  }
</script>

<svelte:window onpointermove={dotsMove} onpointerup={dotsUp} />

<div class="maps" class:audience class:big class:fit>
  {#each maps as m (m.id)}
    <div class="map">
      <div class="title">{m.name}</div>
      <div class="area">
        <div
          class="grid"
          style:grid-template-columns="repeat({m.cols}, 1fr)"
          style:aspect-ratio="{m.cols * 16} / {m.rows * 9}"
          style:--ratio={(m.cols * 16) / (m.rows * 9)}
          style:--rows={m.rows}
        >
          {#each Array.from({ length: m.rows }, (_, r) => r) as r (r)}
            {#each Array.from({ length: m.cols }, (_, c) => c) as c (c)}
              {@const s = cells.get(m.id)?.get(`${c},${r}`)}
              {@const k = s ? stateOf(m, s) : null}
              {#if s && k}
                {@const bg = s.slide.background.color ?? '#2f6b3a'}
                {@const cur = sameRef(focus, { map: m.id, screen: s.id })}
                {@const here = byScreen.get(s.id) ?? []}
                {@const grab = !!onmove && !!here.length}
                <button
                  class="cell {k}"
                  class:cur
                  class:picked={sameRef(picked, { map: m.id, screen: s.id })}
                  class:click={!!onpick}
                  class:grab
                  class:drop-on={dropHover.at === `screen:${s.id}`}
                  style:background={bg}
                  style:color={textOn(bg)}
                  disabled={!onpick}
                  data-map={m.id}
                  data-screen={s.id}
                  onclick={() => onpick?.({ map: m.id, screen: s.id }, s)}
                  onpointerdown={grab ? (e) => dotsDown(e, { map: m.id, screen: s.id }, here) : undefined}
                  oncontextmenu={onmenu ? (e) => onmenu(e, { map: m.id, screen: s.id }, s) : undefined}
                  title={audience ? undefined : `${s.name}${k === 'unknown' ? ' (not discovered)' : ''}${grab ? ' · drag the players to another screen to move them' : ''}`}
                  aria-label={audience ? undefined : `${m.name} · ${s.name}`}
                >
                  {#if !audience || k === 'visited'}<span class="nm">{s.name}</span>{/if}
                  <span class="dots">
                    {#each here as p (p.id)}<span class="dot" style:background={p.color} title={p.name}></span>{/each}
                  </span>
                  {#each arrows(m, s) as d (d)}
                    <span class="arrow" style:left="{50 + DIR_VEC[d][0] * 42}%" style:top="{50 + DIR_VEC[d][1] * 40}%">{DIR_ARROW[d]}</span>
                  {/each}
                </button>
              {:else}
                <span class="cell none"></span>
              {/if}
            {/each}
          {/each}
        </div>
      </div>
    </div>
  {/each}
</div>
{#if dotDrag?.moved}
  <div class="dots ghost" style:left="{dotDrag.x}px" style:top="{dotDrag.y}px" aria-hidden="true">
    {#each dotDrag.colors as c, i (i)}<span class="dot" style:background={c}></span>{/each}
  </div>
{/if}

<style>
  .maps {
    display: flex;
    gap: 14px;
    flex-wrap: wrap;
    align-items: flex-start;
  }
  .map {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    flex: 1 1 200px;
  }
  .title {
    font-weight: 700;
    font-size: 12px;
    opacity: 0.8;
  }
  .audience .title {
    font-size: 28px;
    color: #fff;
    text-shadow: 2px 2px 0 #000;
  }
  .grid {
    display: grid;
    gap: 3px;
    width: 100%;
  }
  /* Fitted: each map fills its share of the box, as wide as the height allows. */
  .fit {
    height: 100%;
    flex: 1 1 0;
    min-height: 0;
    flex-wrap: nowrap;
  }
  .fit .map {
    height: 100%;
  }
  .fit .area {
    flex: 1;
    min-height: 0;
    container-type: size;
  }
  .fit .grid {
    width: min(100cqw, 100cqh * var(--ratio));
    margin: 0 auto;
    /* Even rows, however small the cells get. */
    grid-template-rows: repeat(var(--rows), minmax(0, 1fr));
  }
  .cell {
    position: relative;
    padding: 0;
    border: 2px solid rgba(0, 0, 0, 0.5);
    border-radius: 4px;
    min-height: 0;
    font: inherit;
    font-size: 11px;
    overflow: visible;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .audience .cell {
    font-size: 20px;
    border-width: 4px;
  }
  .cell.none {
    border: none;
    background: transparent;
  }
  .cell.discovered {
    filter: saturate(0.25) brightness(0.6);
  }
  .cell.unknown {
    opacity: 0.45;
    border-style: dashed;
  }
  .cell.cur {
    border-color: #ffcc00;
    box-shadow: 0 0 0 3px #ffcc00;
    z-index: 1;
  }
  .cell.picked {
    outline: 3px dashed #fff;
    outline-offset: -6px;
  }
  .cell.grab {
    cursor: grab;
  }
  /* Where dragged players (dots, or an avatar from the stage) would go. */
  .cell.drop-on {
    outline: 3px dashed #ffcc00;
    outline-offset: 2px;
    z-index: 2;
  }
  .big .cell {
    font-size: 14px;
    border-width: 3px;
    min-height: 44px;
  }
  .big .dot {
    width: 14px;
    height: 14px;
  }
  .big .cell.none {
    border: 1px dashed rgba(255, 255, 255, 0.12);
  }
  .big .title {
    display: none;
  }
  .cell.click {
    cursor: pointer;
  }
  .cell:disabled {
    cursor: default;
  }
  .nm {
    padding: 1px 4px;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
  }
  .dots {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    padding: 2px 4px;
  }
  .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    border: 1px solid #000;
  }
  /* The dragged players' dots, beside the pointer (the screen under it stays in sight). */
  .ghost {
    position: fixed;
    z-index: 300;
    transform: translate(6px, 6px);
    padding: 4px 6px;
    border-radius: 10px;
    background: rgba(0, 0, 0, 0.7);
    pointer-events: none;
  }
  .ghost .dot {
    width: 14px;
    height: 14px;
  }
  .audience .dot {
    width: 18px;
    height: 18px;
    border-width: 2px;
  }
  .arrow {
    position: absolute;
    transform: translate(-50%, -50%);
    color: #ffcc00;
    text-shadow: 0 0 3px #000, 0 0 3px #000;
    font-weight: 900;
    pointer-events: none;
  }
</style>
