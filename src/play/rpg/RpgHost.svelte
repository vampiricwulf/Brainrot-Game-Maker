<!--
  The host's controls for an RPG round (games-maker spec §10.2): the movement pad, parties, the host map, the card of
  the object clicked on the stage (or every object here), and each player's stats and inventory.
-->
<script lang="ts">
  import { app, toast } from '../../lib/app.svelte';
  import { textOn } from '../../lib/colors';
  import type { RunContext } from '../../lib/actions';
  import type { Dir8, Game, ScreenRef, Session } from '../../lib/model';
  import { activeParty, DIR_ARROW, DIR_NAME, DIRS, exitOf, findIn, focusRef, moveTo, screenElements } from '../../lib/rpg';
  import { lastAction, logged } from '../../lib/toolset';
  import MapView from './MapView.svelte';
  import ObjectCard from './ObjectCard.svelte';
  import PlayerCard from './PlayerCard.svelte';
  import { focusParty, objectAt, regroupAll, rpgNow, splitOff, stepParty, toggleMap } from './hostops';

  let {
    game,
    session,
    selected = $bindable(),
    object = $bindable(),
    dual,
  }: { game: Game; session: Session; selected: string[]; object: string | null; dual: boolean } = $props();

  const now = $derived(rpgNow(game, session));
  const world = $derived(now.world);
  const st = $derived(now.st);
  const here = $derived(st && world ? findIn(world, focusRef(st) ?? { map: '', screen: '' }) : null);
  const party = $derived(st ? activeParty(st) : undefined);
  const ctx = $derived<RunContext>({ game, session, live: app.live, world, st, selected });
  const obj = $derived(object ? objectAt(game, session, object) : null);
  const objects = $derived(here && st ? screenElements(st, here.screen, false).filter((e) => e.role || e.name) : []);
  const last = $derived(lastAction(session));
  let showPlayers = $state(true);
  /** A screen picked on the host map, waiting for "Move here". */
  let picked = $state<ScreenRef | null>(null);
  const pickedFound = $derived(picked && world ? findIn(world, picked) : null);

  const PAD: (Dir8 | null)[] = ['nw', 'n', 'ne', 'w', null, 'e', 'sw', 's', 'se'];

  function go(d: Dir8): void {
    const why = stepParty(game, session, d);
    if (why) toast(why);
  }

  function split(): void {
    const why = splitOff(game, session, selected);
    if (why) toast(why);
    else selected = [];
  }

  function moveHere(who?: string[]): void {
    if (!picked || !world || !st) return;
    const to = picked;
    const s = st;
    const w = world;
    logged(session, `${who ? 'Selected players' : 'Party'} to ${pickedFound?.screen.name}`, () => moveTo(game, s, w, to, { players: who }));
    picked = null;
  }
</script>

{#if world && st}
  <div class="rh">
    <div class="row top">
      <b class="where">🗺 {here ? `${here.map.name} · ${here.screen.name}` : 'Nowhere'}</b>
      {#if here?.screen.hostNotes && !dual}<span class="notes">📝 {here.screen.hostNotes}</span>{/if}
      <span class="spacer"></span>
      {#each st.parties as pt (pt.id)}
        {@const lead = session.players.find((pl) => pl.id === pt.members[0])}
        <button
          class="small party"
          class:on={pt.id === party?.id}
          style:border-color={lead?.color}
          onclick={() => focusParty(game, session, pt.id)}
          title="Follow this party (the pad moves it): {pt.members.map((m) => session.players.find((pl) => pl.id === m)?.name).join(', ')}"
        >
          {pt.name} ({pt.members.length})
        </button>
      {/each}
      <button class="small" onclick={split} title="The selected players become their own party">
        ✂ Split off selected
      </button>
      {#if st.parties.length > 1}
        <button class="small" onclick={() => regroupAll(game, session)} title="G: everyone back together, here">🤝 Regroup</button>
        <button class="small" class:on={st.split} onclick={() => (st.split = !st.split)} title="Show every party's screen at once">▦ Split view</button>
      {/if}
      <button class="small" class:on={st.mapShown} onclick={() => toggleMap(game, session)} title="M: the map on screen">🗺 Map</button>
      <button class="small" class:on={app.live.cover} onclick={() => (app.live.cover = !app.live.cover)} title="B: viewers see only a 'Be right back' card">
        ⏸ Cover
      </button>
    </div>

    <div class="main">
      <div class="pad" role="group" aria-label="Move the party">
        {#each PAD as d, i (i)}
          {#if d && here}
            {@const e = exitOf(here.map, here.screen, d)}
            {@const dest = e.kind === 'open' || e.kind === 'warp' ? findIn(world, e.to) : null}
            <button
              class="dir"
              class:blocked={e.kind === 'blocked'}
              disabled={e.kind === 'none'}
              onclick={() => go(d)}
              title="{DIR_NAME[d]}: {dest ? dest.screen.name : e.kind === 'blocked' ? `blocked${e.note ? ` (${e.note})` : ''}` : 'nothing there'}"
              aria-label="Go {DIR_NAME[d]}">{e.kind === 'blocked' ? '🚫' : DIR_ARROW[d]}</button
            >
          {:else if d}
            <button class="dir" disabled aria-label="Go {DIR_NAME[d]}">{DIR_ARROW[d]}</button>
          {:else}
            <button class="dir mid" onclick={() => regroupAll(game, session)} disabled={st.parties.length < 2} title="Regroup (G)" aria-label="Regroup">⊙</button>
          {/if}
        {/each}
      </div>

      <div class="mapbox">
        <MapView {world} {st} players={session.players} audience={false} focus={focusRef(st)} onpick={(ref) => (picked = ref)} />
        {#if picked && pickedFound}
          <div class="row pick">
            <span>→ <b>{pickedFound.screen.name}</b></span>
            <button class="small primary" onclick={() => moveHere()}>Move {party?.name ?? 'party'} here</button>
            {#if selected.length}<button class="small" onclick={() => moveHere(selected)}>Only selected ({selected.length})</button>{/if}
            <button class="small ghost" onclick={() => (picked = null)}>✕</button>
          </div>
        {/if}
      </div>

      <div class="side">
        {#if obj}
          {#key obj.el.id}
            <ObjectCard el={obj.el} screen={obj.screen} {world} {st} {ctx} onclose={() => (object = null)} />
          {/key}
        {:else}
          <div class="muted small">Objects here (or click one on the stage):</div>
          <div class="objs">
            {#each objects as el (el.id)}
              <button class="small obj" class:secret={el.secret} onclick={() => (object = el.id)}>
                {el.name || el.role?.class}{el.role && el.name ? ` · ${el.role.class}` : ''}
              </button>
            {:else}
              <span class="muted small">None on this screen.</span>
            {/each}
          </div>
          {#if last}<div class="muted small last" title="Ctrl+Z undoes it">Last: {last.text}</div>{/if}
        {/if}
      </div>
    </div>

    <div class="row">
      <button class="ghost small" onclick={() => (showPlayers = !showPlayers)} aria-expanded={showPlayers}>
        {showPlayers ? '▾' : '▸'} Players: stats & inventory
      </button>
      {#each session.players as pl, i (pl.id)}
        {@const on = selected.includes(pl.id)}
        {#if !showPlayers}
          <button
            class="chip"
            style:border-color={pl.color}
            style:background={on ? pl.color : undefined}
            style:color={on ? textOn(pl.color) : undefined}
            onclick={() => (selected = on ? selected.filter((x) => x !== pl.id) : [...selected, pl.id])}
            title="Key {i + 1}">{pl.name}</button
          >
        {/if}
      {/each}
    </div>
    {#if showPlayers}
      <div class="cards">
        {#each session.players as pl (pl.id)}
          <PlayerCard
            {game}
            {session}
            player={pl}
            {world}
            {st}
            {selected}
            ontoggle={() => (selected = selected.includes(pl.id) ? selected.filter((x) => x !== pl.id) : [...selected, pl.id])}
          />
        {/each}
      </div>
    {/if}
  </div>
{:else}
  <div class="muted">This RPG round has no world to play (pick one in the editor).</div>
{/if}

<style>
  .rh {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .row {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
  }
  .where {
    font-size: 14px;
  }
  .notes {
    background: var(--panel-2);
    padding: 2px 8px;
    border-radius: 6px;
    font-size: 12px;
  }
  .party {
    border-width: 2px;
  }
  .on {
    border-color: var(--accent);
    background: rgba(79, 124, 255, 0.25);
  }
  .main {
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }
  .pad {
    display: grid;
    grid-template-columns: repeat(3, 38px);
    grid-auto-rows: 38px;
    gap: 3px;
    flex-shrink: 0;
  }
  .dir {
    padding: 0;
    font-size: 18px;
    font-weight: 800;
  }
  .dir.blocked {
    font-size: 14px;
  }
  .dir.mid {
    font-size: 16px;
  }
  .mapbox {
    flex: 1 1 260px;
    max-width: 420px;
    max-height: 200px;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .pick {
    font-size: 12px;
  }
  .side {
    flex: 1 1 320px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .objs {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .obj.secret {
    opacity: 0.6;
    border-style: dashed;
  }
  .last {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cards {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    max-height: 260px;
    overflow: auto;
  }
  .chip {
    border-width: 2px;
    padding: 1px 8px;
    font-size: 12px;
  }
  .small {
    font-size: 12px;
  }
</style>
