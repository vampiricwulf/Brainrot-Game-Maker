<!--
  A world's maps as grids of screens. The audience's version shows only what its map settings allow (whole map, or
  discovered screens), with arrows for open ways out that lead somewhere unknown. The host's version shows
  everything and can be clicked.
-->
<script lang="ts">
  import { textOn } from '../../lib/colors';
  import type { Player, Screen, ScreenRef, World, WorldMap, WorldState } from '../../lib/model';
  import { DIR_ARROW, DIR_VEC, DIRS, exitOf, mapState, mapVisible, sameRef } from '../../lib/rpg';

  let {
    world,
    st,
    players,
    audience,
    focus,
    onpick,
    only,
    big = false,
    picked = null,
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
    /** A screen the host picked (outlined). */
    picked?: ScreenRef | null;
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

<div class="maps" class:audience class:big>
  {#each maps as m (m.id)}
    <div class="map">
      <div class="title">{m.name}</div>
      <div class="grid" style:grid-template-columns="repeat({m.cols}, 1fr)" style:aspect-ratio="{m.cols * 16} / {m.rows * 9}">
        {#each Array.from({ length: m.rows }, (_, r) => r) as r (r)}
          {#each Array.from({ length: m.cols }, (_, c) => c) as c (c)}
            {@const s = cells.get(m.id)?.get(`${c},${r}`)}
            {@const k = s ? stateOf(m, s) : null}
            {#if s && k}
              {@const bg = s.slide.background.color ?? '#2f6b3a'}
              {@const cur = sameRef(focus, { map: m.id, screen: s.id })}
              <button
                class="cell {k}"
                class:cur
                class:picked={sameRef(picked, { map: m.id, screen: s.id })}
                class:click={!!onpick}
                style:background={bg}
                style:color={textOn(bg)}
                disabled={!onpick}
                onclick={() => onpick?.({ map: m.id, screen: s.id }, s)}
                title={audience ? undefined : `${s.name}${k === 'unknown' ? ' (not discovered)' : ''}`}
                aria-label={audience ? undefined : `${m.name} · ${s.name}`}
              >
                {#if !audience || k === 'visited'}<span class="nm">{s.name}</span>{/if}
                <span class="dots">
                  {#each byScreen.get(s.id) ?? [] as p (p.id)}<span class="dot" style:background={p.color} title={p.name}></span>{/each}
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
  {/each}
</div>

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
