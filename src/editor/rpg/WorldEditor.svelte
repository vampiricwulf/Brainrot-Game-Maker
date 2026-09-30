<!--
  An RPG world: its maps (the primary map and the others, joined by doorways), each a grid of screens. Click an
  empty cell to add a screen, click a screen for its settings (name, exits in 8 directions, music, notes), and
  ✎ Edit screen to lay out its picture and objects.
-->
<script lang="ts">
  import Stage from '../../lib/Stage.svelte';
  import SlideView from '../../lib/slide/SlideView.svelte';
  import { toast } from '../../lib/app.svelte';
  import { newId, type Dir8, type Screen, type World, type WorldMap } from '../../lib/model';
  import { clone } from '../../lib/ops';
  import { DIR_ARROW, DIR_NAME, DIRS, exitOf, newScreen, newVariant, newWorldMap, screenAt } from '../../lib/rpg';
  import MediaPicker from '../slide/MediaPicker.svelte';
  import ScreenEditor from './ScreenEditor.svelte';
  import ScreenPicker from './ScreenPicker.svelte';

  let { world }: { world: World } = $props();
  let mapId = $state<string | null>(null);
  let selId = $state<string | null>(null);
  let editing = $state(false);
  /** Which look of the screen is being edited (null: its own slide). */
  let lookId = $state<string | null>(null);
  let musicFor = $state<'map' | 'screen' | null>(null);

  const map = $derived(world.maps.find((m) => m.id === mapId) ?? world.maps[0]);
  const sel = $derived(map?.screens.find((s) => s.id === selId));
  const look = $derived(sel?.variants?.find((v) => v.id === lookId));

  function addMap(): void {
    const m = newWorldMap(`Area ${world.maps.length}`, 3, 3, false);
    world.maps.push(m);
    mapId = m.id;
    selId = m.screens[0].id;
  }

  function removeMap(m: WorldMap): void {
    if (world.maps.length <= 1) return;
    if (!confirm(`Delete the map "${m.name}" and its ${m.screens.length} screen(s)?`)) return;
    world.maps = world.maps.filter((x) => x.id !== m.id);
    mapId = world.maps[0].id;
    selId = null;
  }

  function addScreen(col: number, row: number): void {
    const s = newScreen(col, row);
    map.screens.push(s);
    selId = s.id;
  }

  function removeScreen(s: Screen): void {
    if (!confirm(`Delete the screen "${s.name}"?`)) return;
    map.screens = map.screens.filter((x) => x.id !== s.id);
    selId = null;
    editing = false;
  }

  function duplicateScreen(s: Screen): void {
    // The first free cell to its right (or anywhere).
    let spot: [number, number] | null = null;
    for (let r = 0; r < map.rows && !spot; r++)
      for (let c = 0; c < map.cols && !spot; c++) {
        const cc = (s.col + 1 + c) % map.cols;
        const rr = (s.row + r) % map.rows;
        if (!screenAt(map, cc, rr)) spot = [cc, rr];
      }
    if (!spot) return void toast('No free cell on this map: make the grid bigger first');
    const copy = clone($state.snapshot(s) as Screen);
    copy.id = newId();
    copy.name = `${s.name} (copy)`;
    copy.col = spot[0];
    copy.row = spot[1];
    copy.exits = undefined;
    for (const el of copy.slide.elements) el.id = newId();
    map.screens.push(copy);
    selId = copy.id;
  }

  /** Nudge a screen one cell (only into an empty cell). */
  function nudge(s: Screen, dc: number, dr: number): void {
    const c = s.col + dc;
    const r = s.row + dr;
    if (c < 0 || r < 0 || c >= map.cols || r >= map.rows || screenAt(map, c, r)) return;
    s.col = c;
    s.row = r;
  }

  function setExit(s: Screen, d: Dir8, kind: string): void {
    const exits = { ...(s.exits ?? {}) };
    if (kind === 'auto') delete exits[d];
    else if (kind === 'blocked') exits[d] = { kind: 'blocked' };
    else if (kind === 'warp') {
      const first = world.maps.find((m) => m.id !== map.id)?.screens[0] ?? map.screens.find((x) => x.id !== s.id);
      const m = world.maps.find((mm) => mm.screens.includes(first!));
      if (!first || !m) return void toast('Add another screen first');
      exits[d] = { kind: 'warp', to: { map: m.id, screen: first.id } };
    }
    s.exits = Object.keys(exits).length ? exits : undefined;
  }

  function resize(cols: number, rows: number): void {
    const outside = map.screens.filter((s) => s.col >= cols || s.row >= rows);
    if (outside.length && !confirm(`${outside.length} screen(s) are outside the new size and will be deleted. Go on?`)) return;
    map.screens = map.screens.filter((s) => s.col < cols && s.row < rows);
    map.cols = cols;
    map.rows = rows;
  }

  const blockedSide = (s: Screen, d: Dir8) => s.exits?.[d]?.kind === 'blocked';
  const warpSide = (s: Screen, d: Dir8) => s.exits?.[d]?.kind === 'warp';
  const doorways = (s: Screen) => s.slide.elements.filter((e) => e.role?.class === 'doorway');
  const screenName = (ref?: { map: string; screen: string }) => {
    const m = world.maps.find((x) => x.id === ref?.map);
    const s = m?.screens.find((x) => x.id === ref?.screen);
    return s ? `${m!.name} · ${s.name}` : 'nowhere';
  };
</script>

{#if editing && sel}
  <div class="screen-edit">
    <div class="row">
      <button onclick={() => (editing = false)}>◀ Back to the map</button>
      <b>{map.name} · {sel.name}{look ? ` (${look.name})` : ''}</b>
      <span class="muted small">Give items a class in the inspector's Object section (doorway, item, character…).</span>
    </div>
    {#key `${sel.id}:${lookId}`}<div class="se-wrap"><ScreenEditor {world} screen={sel} slide={look?.slide} /></div>{/key}
  </div>
{:else}
  <div class="we">
    <div class="tabs" role="tablist" aria-label="Maps">
      {#each world.maps as m, i (m.id)}
        <button role="tab" class:on={m.id === map?.id} aria-selected={m.id === map?.id} onclick={() => ((mapId = m.id), (selId = null))}>
          {i === 0 ? '🗺' : '🏠'} {m.name}
        </button>
      {/each}
      <button class="ghost" onclick={addMap} title="A dungeon, a shop, an interior, the Shadow Realm… joined to the rest by doorways">＋ Map</button>
    </div>

    {#if map}
      <details class="settings">
        <summary>Map settings: {map.name} ({map.cols}×{map.rows})</summary>
        <div class="grid">
          <label class="field">Name<input bind:value={map.name} /></label>
          <label class="field">Columns<input type="number" min="1" max="16" value={map.cols} onchange={(e) => resize(Math.max(1, Math.min(16, +e.currentTarget.value)), map.rows)} /></label>
          <label class="field">Rows<input type="number" min="1" max="16" value={map.rows} onchange={(e) => resize(map.cols, Math.max(1, Math.min(16, +e.currentTarget.value)))} /></label>
          <label class="field">
            Audience sees
            <select bind:value={map.visibility} aria-label="Audience sees">
              <option value="discovered">Only screens they've discovered</option>
              <option value="full">The whole map</option>
              <option value="hidden">Nothing (a secret map)</option>
            </select>
          </label>
          <label class="field">
            Moving between screens
            <select bind:value={map.transition} aria-label="Transition">
              <option value="slide">Flip-screen slide</option>
              <option value="fade">Fade</option>
              <option value="cut">Cut</option>
            </select>
          </label>
        </div>
        <div class="row wrap">
          <label class="check"><input type="checkbox" bind:checked={map.showExits} /> Show open directions on the audience map (not where they lead)</label>
          <label class="check"><input type="checkbox" bind:checked={map.revealNeighbors} /> Arriving somewhere discovers the screens next to it</label>
          <label class="check"><input type="checkbox" bind:checked={map.diagonals} /> Diagonal moves</label>
          <label class="check"><input type="checkbox" bind:checked={map.wrap} /> Edges wrap around</label>
        </div>
        <div class="row">
          <div class="pop">
            <button class="small" onclick={() => (musicFor = 'map')}>🎵 {map.music ? 'Change map music' : 'Map music…'}</button>
            {#if musicFor === 'map'}<MediaPicker kind="audio" onpick={(id) => ((map.music = id), (musicFor = null))} onclose={() => (musicFor = null)} />{/if}
          </div>
          {#if map.music}<button class="ghost small" onclick={() => (map.music = undefined)}>No music</button>{/if}
          <span class="spacer"></span>
          {#if world.maps.length > 1}<button class="ghost small" onclick={() => removeMap(map)}>Delete map</button>{/if}
        </div>
      </details>

      <div class="layout">
        <div class="grid-map" style:grid-template-columns="repeat({map.cols}, minmax(0, 1fr))" role="grid" aria-label="{map.name} grid">
          {#each Array.from({ length: map.rows }, (_, r) => r) as r (r)}
            {#each Array.from({ length: map.cols }, (_, c) => c) as c (c)}
              {@const s = screenAt(map, c, r)}
              {#if s}
                <button
                  class="cell screen"
                  class:sel={s.id === selId}
                  class:bn={blockedSide(s, 'n')}
                  class:be={blockedSide(s, 'e')}
                  class:bs={blockedSide(s, 's')}
                  class:bw={blockedSide(s, 'w')}
                  onclick={() => (selId = s.id)}
                  ondblclick={() => ((selId = s.id), (editing = true))}
                  aria-label="Screen {s.name}"
                  title="{s.name}: click for settings, double-click to edit"
                >
                  <div class="thumb"><Stage><SlideView slide={s.slide} mode="edit" /></Stage></div>
                  <span class="nm">{s.name}</span>
                  {#if doorways(s).length || DIRS.some((d) => warpSide(s, d))}<span class="door" title="Has doorways or warps">🚪</span>{/if}
                </button>
              {:else}
                <button class="cell empty" onclick={() => addScreen(c, r)} aria-label="Add a screen at column {c + 1}, row {r + 1}">＋</button>
              {/if}
            {/each}
          {/each}
        </div>

        <aside class="side">
          {#if sel}
            <h4>Screen</h4>
            <label class="field">Name<input bind:value={sel.name} /></label>
            <div class="row">
              <button class="primary" onclick={() => ((lookId = null), (editing = true))}>✎ Edit screen</button>
              <button class="small" onclick={() => duplicateScreen(sel)}>⧉ Duplicate</button>
              <button class="ghost small" onclick={() => removeScreen(sel)}>Delete</button>
            </div>
            <div class="looks">
              <span class="muted small" title="Other looks for the same place, switched in play (the village, on fire)">Other looks:</span>
              {#each sel.variants ?? [] as v, i (v.id)}
                <span class="look">
                  <input bind:value={v.name} aria-label="Look name" />
                  <button class="small" onclick={() => ((lookId = v.id), (editing = true))}>✎</button>
                  <button class="ghost small" onclick={() => sel.variants?.splice(i, 1)} aria-label="Delete look {v.name}">✕</button>
                </span>
              {/each}
              <button class="small" onclick={() => (sel.variants = [...(sel.variants ?? []), newVariant(undefined, sel, `Look ${(sel.variants?.length ?? 0) + 2}`)])}>
                ＋ Look (a copy)
              </button>
            </div>
            <div class="row nudge">
              <span class="muted small">Move:</span>
              <button class="ghost small" onclick={() => nudge(sel, -1, 0)} aria-label="Move left">◀</button>
              <button class="ghost small" onclick={() => nudge(sel, 0, -1)} aria-label="Move up">▲</button>
              <button class="ghost small" onclick={() => nudge(sel, 0, 1)} aria-label="Move down">▼</button>
              <button class="ghost small" onclick={() => nudge(sel, 1, 0)} aria-label="Move right">▶</button>
            </div>
            <h4>Ways out</h4>
            <p class="muted small">By default each side leads to the screen next to it on the grid. Block a side, or send it anywhere (another map too).</p>
            <table class="exits">
              <tbody>
                {#each DIRS as d (d)}
                  {@const rule = sel.exits?.[d]}
                  {@const e = exitOf(map, sel, d)}
                  <tr>
                    <td title={DIR_NAME[d]}>{DIR_ARROW[d]}</td>
                    <td>
                      <select value={rule?.kind ?? 'auto'} onchange={(ev) => setExit(sel, d, ev.currentTarget.value)} aria-label="{DIR_NAME[d]} exit">
                        <option value="auto">{e.kind === 'open' ? `→ ${screenName(e.to)}` : e.kind === 'none' ? '— nothing there' : 'Grid'}</option>
                        <option value="blocked">Blocked</option>
                        <option value="warp">Leads somewhere else…</option>
                      </select>
                      {#if rule?.kind === 'warp'}
                        <ScreenPicker {world} value={rule.to} label="to" onchange={(ref) => ref && (rule.to = ref)} />
                      {:else if rule?.kind === 'blocked'}
                        <input class="note" bind:value={rule.note} placeholder="Why (e.g. a river)" aria-label="{DIR_NAME[d]} blocked because" />
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
            {#if doorways(sel).length}
              <h4>Doorways</h4>
              <ul class="small">
                {#each doorways(sel) as dw (dw.id)}<li>{dw.name || 'Doorway'} → {screenName(dw.role?.to)}</li>{/each}
              </ul>
            {/if}
            <div class="row">
              <div class="pop">
                <button class="small" onclick={() => (musicFor = 'screen')}>🎵 {sel.music ? 'Change screen music' : 'Screen music…'}</button>
                {#if musicFor === 'screen'}<MediaPicker kind="audio" onpick={(id) => ((sel.music = id), (musicFor = null))} onclose={() => (musicFor = null)} />{/if}
              </div>
              {#if sel.music}<button class="ghost small" onclick={() => (sel.music = undefined)}>No music</button>{/if}
            </div>
            <label class="field">
              Host notes
              <textarea rows="3" value={sel.hostNotes ?? ''} oninput={(e) => (sel.hostNotes = e.currentTarget.value || undefined)}></textarea>
            </label>
          {:else}
            <p class="muted">
              Click an empty cell (＋) to add a screen, click a screen for its settings, double-click it to edit its picture and
              objects. Screens next to each other are connected; block sides or send them elsewhere in <b>Ways out</b>.
              Add dungeons, shops and interiors as more maps (＋ Map) and join them with doorway objects.
            </p>
          {/if}
        </aside>
      </div>
    {/if}
  </div>
{/if}

<style>
  .looks {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
  }
  .look {
    display: inline-flex;
    gap: 2px;
  }
  .look input {
    width: 110px;
  }
  .we {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .tabs {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    border-bottom: 1px solid var(--border);
    padding-bottom: 4px;
  }
  .tabs button.on {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
  .settings summary {
    cursor: pointer;
    font-weight: 600;
  }
  .grid {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin: 8px 0;
  }
  .grid input[type='number'] {
    width: 70px;
  }
  .row {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .row.wrap {
    flex-wrap: wrap;
    gap: 4px 14px;
  }
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 330px;
    gap: 14px;
    align-items: start;
  }
  .grid-map {
    display: grid;
    gap: 6px;
    max-width: 1100px;
  }
  .cell {
    position: relative;
    aspect-ratio: 16 / 9;
    padding: 0;
    border-radius: 6px;
    overflow: hidden;
  }
  .cell.empty {
    border: 2px dashed var(--border);
    background: transparent;
    color: var(--muted);
    font-size: 22px;
  }
  .cell.screen {
    border: 3px solid var(--border);
  }
  .cell.screen.sel {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent);
  }
  .cell.bn {
    border-top-color: #e6194b;
  }
  .cell.be {
    border-right-color: #e6194b;
  }
  .cell.bs {
    border-bottom-color: #e6194b;
  }
  .cell.bw {
    border-left-color: #e6194b;
  }
  .thumb {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .nm {
    position: absolute;
    left: 4px;
    bottom: 4px;
    padding: 1px 6px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.7);
    color: #fff;
    font-size: 12px;
    max-width: calc(100% - 8px);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .door {
    position: absolute;
    right: 4px;
    top: 4px;
    font-size: 14px;
  }
  .side {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  h4 {
    margin: 6px 0 0;
  }
  .exits td {
    padding: 2px 4px;
    vertical-align: top;
  }
  .exits select {
    max-width: 220px;
  }
  .note {
    width: 200px;
    margin-top: 2px;
  }
  .small {
    font-size: 12px;
  }
  .pop {
    position: relative;
  }
  .screen-edit {
    display: flex;
    flex-direction: column;
    gap: 8px;
    height: calc(100vh - 170px);
  }
  .se-wrap {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
</style>
