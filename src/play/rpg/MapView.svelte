<!--
  A world's maps as grids of screens. The audience's version shows only what its map settings allow (whole map, or
  discovered screens), cut down to the part they know (with a cell around it), with arrows for open ways out that lead
  somewhere unknown, and says so when the party is on a map hidden from them. The host's version shows everything
  and can be clicked (one Tab stop: the arrow keys go from screen to screen); the players on a screen can be dragged
  to another one.
-->
<script lang="ts">
  import { textOn } from '../../lib/colors';
  import { initials, type Dir8, type Player, type Screen, type ScreenRef, type World, type WorldMap, type WorldState } from '../../lib/model';
  import { DIR_ARROW, DIR_VEC, DIRS, exitOf, mapCrop, mapState, mapVisible, sameRef } from '../../lib/rpg';
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
    near,
    onmenu,
    onmove,
    ratio = $bindable(0),
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
    /** The host's minimap: a map bigger than this shows only this many cells, around where the party is. */
    near?: { cols: number; rows: number };
    /** Host: a screen was right-clicked. */
    onmenu?: (e: MouseEvent, ref: ScreenRef, screen: Screen) => void;
    /** Host: the players on a screen were dragged onto another one. */
    onmove?: (from: ScreenRef, to: ScreenRef) => void;
    /** Out: the first map's width over its height as drawn (the host's minimap box fits its height to it). */
    ratio?: number;
  } = $props();

  const maps = $derived((audience ? world.maps.filter((m) => mapVisible(st, m)) : world.maps).filter((m) => !only || m.id === only));
  /** Viewers: the party is on a map they aren't shown. */
  const focusHidden = $derived(audience && !!focus && !maps.some((m) => m.id === focus.map));
  const stateOf = (m: WorldMap, s: Screen) => (audience ? mapState(st, m, s) : (st?.knowledge[s.id] ?? 'unknown'));
  /** Screens by cell, per map (big maps look each cell up once instead of searching the list). */
  const cells = $derived(new Map(maps.map((m) => [m.id, new Map(m.screens.map((s) => [`${s.col},${s.row}`, s]))])));
  /** The cells each map draws: viewers see the part they know (and a cell around it), the host all of it. */
  const areas = $derived(new Map(maps.map((m) => [m.id, (audience ? mapCrop(st, m) : nearby(m)) ?? { col: 0, row: 0, cols: m.cols, rows: m.rows }])));
  $effect(() => {
    const b = maps[0] && areas.get(maps[0].id);
    ratio = b ? (b.cols * 16) / (b.rows * 9) : 0;
  });

  /** The minimap's window on a big map: `near` cells around the party's screen, kept on the map. */
  function nearby(m: WorldMap) {
    const at = focus?.map === m.id ? m.screens.find((s) => s.id === focus.screen) : undefined;
    if (!near || !at || (m.cols <= near.cols && m.rows <= near.rows)) return null;
    const cols = Math.min(near.cols, m.cols);
    const rows = Math.min(near.rows, m.rows);
    const col = Math.max(0, Math.min(m.cols - cols, at.col - Math.floor(cols / 2)));
    const row = Math.max(0, Math.min(m.rows - rows, at.row - Math.floor(rows / 2)));
    return { col, row, cols, rows };
  }
  /** A player's dot carries their initials: colour isn't all that tells two players apart. */
  const initial = initials;
  const range = (from: number, n: number) => Array.from({ length: n }, (_, i) => from + i);
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
  let dotDrag = $state<{ from: ScreenRef; players: Player[]; sx: number; sy: number; x: number; y: number; moved: boolean } | null>(null);

  function dotsDown(e: PointerEvent, from: ScreenRef, here: Player[]): void {
    if (!onmove || !here.length || e.button !== 0) return;
    dotDrag = { from, players: here, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, moved: false };
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

  /**
   * Audience arrows, by screen: open ways out of a known screen whose destination is still unknown to viewers. Worked
   * out once per change (not for every cell each time anything moves): a 20×20 world would slow the audience window.
   */
  const arrows = $derived.by(() => {
    const out = new Map<string, Dir8[]>();
    if (!audience) return out;
    for (const m of maps) {
      if (!m.showExits) continue;
      const grid = cells.get(m.id);
      const byId = new Map(m.screens.map((s) => [s.id, s]));
      for (const s of m.screens) {
        if (!mapState(st, m, s)) continue;
        const ds = DIRS.filter((d) => {
          const e = exitOf(m, s, d, grid);
          if (e.kind !== 'open' && e.kind !== 'warp') return false;
          if (e.kind === 'warp' && e.to.map !== m.id) return true;
          const dest = byId.get(e.to.screen);
          return !dest || !mapState(st, m, dest);
        });
        if (ds.length) out.set(s.id, ds);
      }
    }
    return out;
  });

  /** The host's map is one Tab stop: the screen the party is on (else the first), or the one last focused. */
  let roving = $state<Record<string, string>>({});
  function tabTo(m: WorldMap, box: { col: number; row: number; cols: number; rows: number }): string | undefined {
    const shown = (s: Screen) => s.col >= box.col && s.row >= box.row && s.col < box.col + box.cols && s.row < box.row + box.rows;
    const ok = (id: string | undefined) => !!id && m.screens.some((s) => s.id === id && shown(s));
    const party = focus?.map === m.id ? focus.screen : undefined;
    return ok(roving[m.id]) ? roving[m.id] : ok(party) ? party : m.screens.find(shown)?.id;
  }

  const KEY_STEP: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

  /** The arrow keys go to the next screen that way on the host's map (skipping empty cells). */
  function gridKey(e: KeyboardEvent, m: WorldMap, box: { col: number; row: number; cols: number; rows: number }): void {
    const d = KEY_STEP[e.key];
    const t = e.target as HTMLElement;
    if (!d || !t.dataset.screen || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    e.stopPropagation();
    let [c, r] = [Number(t.dataset.col), Number(t.dataset.row)];
    for (;;) {
      c += d[0];
      r += d[1];
      if (c < box.col || r < box.row || c >= box.col + box.cols || r >= box.row + box.rows) return;
      const next = cells.get(m.id)?.get(`${c},${r}`);
      if (next) {
        roving[m.id] = next.id;
        (e.currentTarget as HTMLElement).querySelector<HTMLElement>(`[data-screen="${next.id}"]`)?.focus();
        return;
      }
    }
  }
</script>

<svelte:window onpointermove={dotsMove} onpointerup={dotsUp} />

<div class="maps" class:audience class:big class:fit>
  {#if focusHidden}
    <div class="hidden-note">🙈 This map is hidden from viewers</div>
  {/if}
  <!-- (Then none: the other maps would read as "you are here".) -->
  {#each focusHidden ? [] : maps as m (m.id)}
    {@const box = areas.get(m.id) ?? { col: 0, row: 0, cols: m.cols, rows: m.rows }}
    {@const tab = onpick ? tabTo(m, box) : undefined}
    <div class="map">
      <div class="title">{m.name}</div>
      <div class="area">
        <div
          class="grid"
          style:grid-template-columns="repeat({box.cols}, minmax(0, 1fr))"
          style:aspect-ratio="{box.cols * 16} / {box.rows * 9}"
          style:--ratio={(box.cols * 16) / (box.rows * 9)}
          style:--rows={box.rows}
          role="presentation"
          onkeydown={onpick ? (e) => gridKey(e, m, box) : undefined}
        >
          {#each range(box.row, box.rows) as r (r)}
            {#each range(box.col, box.cols) as c (c)}
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
                  tabindex={onpick && s.id !== tab ? -1 : undefined}
                  data-map={m.id}
                  data-screen={s.id}
                  data-col={c}
                  data-row={r}
                  onfocus={onpick ? () => (roving[m.id] = s.id) : undefined}
                  onclick={() => onpick?.({ map: m.id, screen: s.id }, s)}
                  onpointerdown={grab ? (e) => dotsDown(e, { map: m.id, screen: s.id }, here) : undefined}
                  oncontextmenu={onmenu ? (e) => onmenu(e, { map: m.id, screen: s.id }, s) : undefined}
                  title={audience ? undefined : `${s.name}${k === 'unknown' ? ' (not discovered)' : ''}${grab ? ' · drag the players to another screen to move them' : ''}${onpick ? ' · arrow keys: the next screen' : ''}`}
                  aria-label={audience ? undefined : `${m.name} · ${s.name}`}
                >
                  {#if !audience || k === 'visited'}<span class="nm">{s.name}</span>{/if}
                  <span class="dots">
                    {#each here as p (p.id)}<span class="dot" style:background={p.color} style:color={textOn(p.color)} title={p.name}>{initial(p.name)}</span>{/each}
                  </span>
                  {#each arrows.get(s.id) ?? [] as d (d)}
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
    {#each dotDrag.players as p (p.id)}<span class="dot" style:background={p.color} style:color={textOn(p.color)}>{initial(p.name)}</span>{/each}
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
  .hidden-note {
    align-self: center;
    margin: auto;
    padding: 10px 24px;
    border-radius: 10px;
    background: rgba(0, 0, 0, 0.75);
    color: #fff;
    font-size: 40px;
    font-weight: 700;
  }
  .fit .hidden-note {
    flex: none;
  }
  .title {
    font-weight: 700;
    font-size: 12px;
    opacity: 0.8;
  }
  .audience .title {
    font-size: 36px;
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
    /* The whole width of the box (else it shrank to a narrow column, the cells drawn small). */
    flex: 1 1 0;
    min-width: 0;
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
    font-size: 12px;
    overflow: visible;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .audience .cell {
    font-size: 28px;
    border-width: 4px;
  }
  .cell.none {
    border: none;
    background: transparent;
  }
  /* Darkened, the screen's name still bright enough to read on a stream (an inset shadow sits under the words). */
  .cell.discovered {
    box-shadow: inset 0 0 0 999px rgba(0, 0, 0, 0.5);
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
    width: 20px;
    height: 20px;
    font-size: 10px; /* glyph: initials */
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
  /* Viewers' cells are disabled buttons: not faded like a disabled button (only unknown screens are). */
  .cell:disabled:not(.unknown) {
    opacity: 1;
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
  /* A crowd on one screen overlaps in one row, inside its cell (wrapped, it would spill over the screens below). */
  .dots:has(.dot:nth-child(3)) {
    flex-wrap: nowrap;
    gap: 0;
  }
  .dots:has(.dot:nth-child(3)) .dot + .dot {
    margin-left: -5px;
  }
  .dot {
    display: grid;
    place-items: center;
    width: 13px;
    height: 13px;
    border-radius: 50%;
    border: 1px solid #000;
    font: 700 1px/1 'Inter', system-ui, sans-serif;
    font-size: 7px; /* glyph: a player's initials in their dot (the name is in its tooltip) */
    letter-spacing: -0.5px;
    overflow: hidden;
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
    width: 18px;
    height: 18px;
    font-size: 12px;
  }
  .audience .dot {
    width: 38px;
    height: 38px;
    border-width: 2px;
    font-size: 18px;
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
