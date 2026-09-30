<!--
  The host's controls for an RPG round (games-maker spec §10.2): the movement pad, parties, the host map, the card of
  the object clicked on the stage (or every object here), and each player's stats and inventory.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { showMenu } from '../../lib/menustate.svelte';
  import { app, toast } from '../../lib/app.svelte';
  import { textOn } from '../../lib/colors';
  import type { RunContext } from '../../lib/actions';
  import { newId, newImageEl, type Dir8, type Game, type Screen, type ScreenRef, type Session, type Slide } from '../../lib/model';
  import { activeParty, addScreenBeside, DIR_ARROW, DIR_NAME, DIR_VEC, DIRS, exitOf, findIn, focusRef, keepScreen, moveTo, newVariant, screenElements, screenAt, screenSlide } from '../../lib/rpg';
  import LiveScreenEditor from './LiveScreenEditor.svelte';
  import MapJump from './MapJump.svelte';
  import DrawPad from '../../editor/slide/DrawPad.svelte';
  import Stage from '../../lib/Stage.svelte';
  import AvatarToken from '../../lib/rpg/AvatarToken.svelte';
  import SlideView from '../../lib/slide/SlideView.svelte';
  import { addMediaFile } from '../../lib/media.svelte';
  import { lastAction, logged, wornItems } from '../../lib/toolset';
  import MapView from './MapView.svelte';
  import ObjectCard from './ObjectCard.svelte';
  import PlayerCard, { cardsShown, playerCards } from './PlayerCard.svelte';
  import InlineAsk from '../host/InlineAsk.svelte';
  import { addLive, centredOn, focusParty, liveText, objectAt, regroupAll, rpgNow, splitOff, stepParty, toggleMap, type RpgAsk, type StagePoint } from './hostops';

  let {
    game,
    session,
    selected = $bindable(),
    object = $bindable(),
    mapOpen = $bindable(false),
    ask = $bindable(null),
    dual,
  }: {
    game: Game;
    session: Session;
    selected: string[];
    object: string | null;
    mapOpen?: boolean;
    /** A name or text being asked for (＋ Screen, a new look, ＋ Text, or text right-clicked onto the stage). */
    ask?: RpgAsk | null;
    dual: boolean;
  } = $props();
  /** The drawpad is open (drawing an object for the screen on air). */
  let drawpad = $state(false);

  /** The finished drawing goes on the screen where it was drawn, hidden until revealed; its card opens. */
  async function insertDrawing(png: Blob, box: { x: number; y: number; w: number; h: number }): Promise<void> {
    drawpad = false;
    try {
      const ref = await addMediaFile(game, png, 'drawing.png');
      const el = newImageEl(ref.id, box.w, box.h);
      Object.assign(el, { x: box.x, y: box.y, name: 'Drawing' });
      if (addLive(game, session, el, 'Add a drawing')) object = el.id;
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 4000);
    }
  }

  const now = $derived(rpgNow(game, session));
  const world = $derived(now.world);
  const st = $derived(now.st);
  const here = $derived(st && world ? findIn(world, focusRef(st) ?? { map: '', screen: '' }) : null);
  const party = $derived(st ? activeParty(st) : undefined);
  const ctx = $derived<RunContext>({ game, session, live: app.live, world, st, selected });
  const obj = $derived(object ? objectAt(game, session, object) : null);
  const objects = $derived(here && st ? screenElements(st, here.screen, false).filter((e) => e.role || e.name) : []);
  const last = $derived(lastAction(session, session.currentRound));
  const showPlayers = $derived(cardsShown());
  /** A screen picked on the host map, waiting for "Move here". */
  let picked = $state<ScreenRef | null>(null);
  const pickedFound = $derived(picked && world ? findIn(world, picked) : null);

  /** The screen (and which of its looks) open in the live editor. */
  let live = $state<{ screen: Screen; slide: Slide; title: string } | null>(null);
  const variantId = $derived(here && st?.variant?.[here.screen.id]);
  /**
   * Directions with room for a new screen next to this one that the party could then go: not a side that's blocked
   * or leads elsewhere, nor a diagonal on a map without diagonal moves.
   */
  const freeDirs = $derived(
    here
      ? DIRS.filter((d) => {
          const [dx, dy] = DIR_VEC[d];
          const c = here.screen.col + dx;
          const r = here.screen.row + dy;
          return c >= 0 && r >= 0 && !screenAt(here.map, c, r) && !here.screen.exits?.[d] && (d.length === 1 || here.map.diagonals);
        })
      : [],
  );

  // Moving on (the pad, the map, a doorway, an action) closes the card of an object left behind, and a question
  // about the screen left behind.
  let cardScreen = untrack(() => here?.screen.id);
  $effect(() => {
    const at = here?.screen.id;
    if (at === cardScreen) return;
    cardScreen = at;
    if (untrack(() => obj && obj.screen.id !== at)) object = null;
    ask = null;
  });

  /** The live editor on the screen an object is on (its current look). */
  function editObject(screen: Screen): void {
    const v = screen.variants?.find((x) => x.id === st?.variant?.[screen.id]);
    live = { screen, slide: v?.slide ?? screen.slide, title: `${screen.name}${v ? ` (${v.name})` : ''}` };
  }

  function editLive(): void {
    if (!here) return;
    const v = here.screen.variants?.find((x) => x.id === variantId);
    live = { screen: here.screen, slide: v?.slide ?? here.screen.slide, title: `${here.screen.name}${v ? ` (${v.name})` : ''}` };
  }

  function addScreen(d: Dir8, name: string): void {
    ask = null;
    if (!here) return;
    const { map, screen } = here;
    let id = '';
    logged(session, `Add ${name}`, () => (id = addScreenBeside(map, screen, d, name)?.id ?? ''), game);
    // The screen as the game holds it now, so what the live editor changes shows on the stage.
    const s = map.screens.find((x) => x.id === id);
    if (!s) return void toast('There’s already a screen that way');
    const way = DIR_NAME[d].toLowerCase();
    toast(`Added “${s.name}”${exitOf(map, screen, d).kind === 'open' ? `: the party can go ${way} now` : `, but the party can’t go ${way} from here`}`, 3000);
    live = { screen: s, slide: s.slide, title: s.name };
  }

  /** A copy of this screen's look, under a new name: it's put on, and opens in the live editor. */
  function newLook(name: string): void {
    ask = null;
    if (!here || !st) return;
    const screen = here.screen;
    const look = newVariant(st, screen, name);
    // One step: undoing it takes the new look away again, not only back to the old one.
    logged(
      session,
      `${screen.name}: ${name}`,
      () => {
        screen.variants = [...(screen.variants ?? []), look];
        st.variant ??= {};
        st.variant[screen.id] = look.id;
      },
      game,
    );
    live = { screen, slide: screen.variants!.at(-1)!.slide, title: `${screen.name} (${name})` };
  }

  function setLook(v: string): void {
    if (!here || !st) return;
    const screen = here.screen;
    if (v === '+') return void (ask = { what: 'look' });
    const name = screen.variants?.find((x) => x.id === v)?.name ?? 'the original look';
    logged(session, `${screen.name}: ${name}`, () => {
      st.variant ??= {};
      if (v) st.variant[screen.id] = v;
      else delete st.variant[screen.id];
    });
  }

  /**
   * Typed text goes on the screen hidden: where the stage was right-clicked (kept on the stage, on that pane's screen in
   * split view; its card opens), else clear of the avatars.
   */
  function addText(text: string, at?: StagePoint): void {
    ask = null;
    const el = liveText(game, session, text);
    if (at) Object.assign(el, centredOn(at, el.w, el.h));
    if (!addLive(game, session, el, `Text: ${text}`, at?.screen)) return;
    if (at) object = el.id;
    else toast('Added, hidden: reveal it from its card');
  }

  /** Copy a screen as it is now (default: the one on air) into the editor's game, so it's there next time. */
  function keep(ref: ScreenRef | null = here ? { map: here.map.id, screen: here.screen.id } : null): void {
    if (!ref || !world) return;
    if (app.game.id !== game.id) return void toast('The editor has a different game open, so there’s nowhere to keep it');
    toast(keepScreen(game, app.game, world.id, ref, st), 4000);
  }

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

  /** Right-click a screen on the minimap: move the party (or some players) there. */
  function mapMenu(e: MouseEvent, ref: ScreenRef, screen: Screen): void {
    picked = ref;
    showMenu(e, [
      { heading: screen.name },
      { label: `▶ Move ${party?.name ?? 'the party'} here`, onclick: () => moveHere() },
      { label: `Only the selected (${selected.length})`, disabled: !selected.length, onclick: () => moveHere(selected) },
      { sep: true },
      { label: '⤢ Full map…', onclick: () => ((picked = null), (mapOpen = true)) },
    ]);
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
      {#if now.round?.hostNotes && !dual}<span class="notes" title="Round notes">📝 {now.round.hostNotes}</span>{/if}
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
      {#if game.shops?.length}
        <select
          class="small"
          aria-label="Open a shop"
          onchange={(e) => {
            const id = e.currentTarget.value;
            e.currentTarget.value = '';
            e.currentTarget.blur();
            if (id) app.live.overlay = { kind: 'shop', nonce: newId(), shopId: id, buyer: selected[0] ?? party?.members[0] };
          }}
        >
          <option value="">🛒 Shop…</option>
          {#each game.shops as sh (sh.id)}<option value={sh.id}>{sh.name}</option>{/each}
        </select>
      {/if}
      <button class="small" class:on={st.mapShown} onclick={() => toggleMap(game, session)} title="M: the map on screen">🗺 Map</button>
      <button class="small" class:on={app.live.cover} onclick={() => (app.live.cover = !app.live.cover)} title="B: viewers see only a 'Be right back' card">
        ⏸ Cover
      </button>
    </div>

    <div class="row improv">
      <span class="muted small">Improvise:</span>
      <button class="small" onclick={editLive} title="Change this screen while the game runs">✎ Edit screen</button>
      <select
        class="small"
        aria-label="Add a screen"
        disabled={!freeDirs.length}
        title={freeDirs.length ? 'An empty screen next to this one' : 'No open side here without a screen'}
        onchange={(e) => {
          const d = e.currentTarget.value as Dir8;
          e.currentTarget.value = '';
          e.currentTarget.blur();
          if (d) ask = { what: 'screen', dir: d };
        }}
      >
        <option value="">＋ Screen…</option>
        {#each freeDirs as d (d)}<option value={d}>{DIR_ARROW[d]} {DIR_NAME[d]}</option>{/each}
      </select>
      <select
        class="small"
        aria-label="Look"
        value={variantId ?? ''}
        onchange={(e) => {
          const v = e.currentTarget.value;
          e.currentTarget.value = variantId ?? '';
          e.currentTarget.blur();
          setLook(v);
        }}
        title="Other looks for this screen (the village, on fire)"
      >
        <option value="">🎭 Original look</option>
        {#each here?.screen.variants ?? [] as v (v.id)}<option value={v.id}>🎭 {v.name}</option>{/each}
        <option value="+">＋ New look (a copy)…</option>
      </select>
      <button class="small" onclick={() => (ask = { what: 'text' })} title="Type text onto the screen">＋ Text</button>
      <button
        class="small"
        onclick={() => (drawpad = true)}
        title="Draw an object over this screen (as many strokes as it takes), then insert it: make it an item, a zone, a hazard…"
      >
        ✏ Draw
      </button>
      <span class="muted small">or drop a picture on the stage</span>
      <span class="spacer"></span>
      <button class="small" onclick={() => keep()} title="Copy this screen as it is now (its looks and added objects) into the game in the editor, so it's there next time">
        💾 Keep in game
      </button>
    </div>
    {#if ask && here}
      {@const a = ask}
      <!-- Fresh for every question, so a new one starts with its own text. -->
      {#key a}
        {#if a.what === 'screen'}
          <InlineAsk
            text="Name of the new screen {DIR_ARROW[a.dir]} (viewers see it on the map once visited):"
            field="Screen name"
            value="New {DIR_NAME[a.dir].toLowerCase()} of {here.screen.name}"
            ok="＋ Add screen"
            onok={(name) => addScreen(a.dir, name)}
            oncancel={() => (ask = null)}
          />
        {:else if a.what === 'look'}
          <InlineAsk text="Name of the new look (e.g. On fire):" field="Look name" value="New look" ok="＋ Add look" onok={newLook} oncancel={() => (ask = null)} />
        {:else}
          <InlineAsk
            text="Text to put {a.at ? 'here' : 'on the screen'} (hidden until you reveal it):"
            field="Text"
            ok="＋ Add text"
            onok={(text) => addText(text, a.at)}
            oncancel={() => (ask = null)}
          />
        {/if}
      {/key}
    {/if}

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
        <div class="row mini-head">
          <span class="spacer"></span>
          <button class="small" onclick={() => (mapOpen = true)} title="J: every map, big, to jump anywhere">⤢ Full map</button>
        </div>
        <MapView {world} {st} players={session.players} audience={false} focus={focusRef(st)} only={here?.map.id} fit {picked} onpick={(ref) => (picked = ref)} onmenu={mapMenu} />
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
            <ObjectCard el={obj.el} screen={obj.screen} {world} {st} {ctx} onclose={() => (object = null)} onedit={() => editObject(obj.screen)} onkeep={() => keep({ map: obj.map.id, screen: obj.screen.id })} />
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
      <button class="ghost small" onclick={() => (playerCards.open = !showPlayers)} aria-expanded={showPlayers}>
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
  {#if drawpad && here}
    {@const scr = here.screen}
    <DrawPad title="Draw on {scr.name}" oninsert={insertDrawing} oncancel={() => (drawpad = false)}>
      {#snippet backdrop()}
        <Stage>
          <SlideView slide={{ ...screenSlide(st, scr), elements: screenElements(st, scr, false) }} mode="edit" fallbackBg="#2f6b3a" />
          <!-- The players where they stand, so a drawing can go over or around them. -->
          {#each session.players.filter((pl) => st.positions[pl.id]?.screen === scr.id && !st.positions[pl.id]?.hidden) as pl (pl.id)}
            {@const pos = st.positions[pl.id]}
            <div class="pad-token" style:left="{pos.x}px" style:top="{pos.y}px">
              <AvatarToken player={pl} size={120} worn={wornItems(game, session, pl.id)} />
            </div>
          {/each}
        </Stage>
      {/snippet}
    </DrawPad>
  {/if}
  {#if mapOpen}
    <MapJump {game} {session} {world} {st} {selected} onclose={() => (mapOpen = false)} />
  {/if}
  {#if live}
    <LiveScreenEditor {world} {st} screen={live.screen} slide={live.slide} title={live.title} onclose={() => (live = null)} />
  {/if}
{:else if world}
  <div class="muted">{world.name} has no screen to start on: add one to its map in the editor.</div>
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
  .top select,
  .improv select {
    padding: 2px 6px;
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
  /* The whole map shows (it's fitted into the box), the party's screen included. Shorter on a short window, so the
     players' row below stays in sight. */
  .mapbox {
    flex: 1 1 260px;
    max-width: 420px;
    height: clamp(110px, 20vh, 200px);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .pick {
    font-size: 12px;
  }
  .pad-token {
    position: absolute;
    transform: translate(-50%, -50%);
  }
  .mini-head {
    gap: 4px;
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
