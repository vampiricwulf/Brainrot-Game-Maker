<!--
  The host's full map (J, or ⤢ on the minimap): every map of the world, big. Pick a screen to see it, then move the
  party (or only the selected players, or another party) there. Double-click a screen to move the party at once,
  right-click it to choose who goes, or drag a screen's players onto another. Opened to send some players (from their
  menu), it moves those instead.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { toast } from '../../lib/app.svelte';
  import { showMenu } from '../../lib/menustate.svelte';
  import type { Game, Screen, ScreenRef, Session, World, WorldState } from '../../lib/model';
  import { activeParty, findIn, focusRef, moveTo, screenElements, screenSlide } from '../../lib/rpg';
  import SlideView from '../../lib/slide/SlideView.svelte';
  import { nameList } from '../../lib/session';
  import { logged } from '../../lib/toolset';
  import { moveChoices, partyOn, sendPlayers } from './hostops';
  import MapView from './MapView.svelte';

  let {
    game,
    session,
    world,
    st,
    selected,
    send = null,
    onclose,
  }: {
    game: Game;
    session: Session;
    world: World;
    st: WorldState;
    selected: string[];
    /** Opened to send these players somewhere (their name for the buttons), instead of the party. */
    send?: { players: string[]; label: string } | null;
    onclose: () => void;
  } = $props();

  const here = $derived(focusRef(st));
  // Opens on the party's map; the tabs change it from there.
  let mapId = $state(untrack(() => focusRef(st)?.map ?? world.maps[0]?.id));
  let picked = $state<ScreenRef | null>(null);
  const found = $derived(picked ? findIn(world, picked) : null);
  const party = $derived(activeParty(st));
  /** Who the main button and a double-click move: the players it was opened for, else the followed party. */
  const who = $derived(send?.label ?? party?.name ?? 'the party');
  const there = $derived(found ? session.players.filter((p) => st.positions[p.id]?.screen === found.screen.id) : []);
  let lastClick = { id: '', at: 0 };

  let boxW = $state(0);
  const scale = $derived(boxW / 1920 || 0.2);

  function pick(ref: ScreenRef): void {
    const now = Date.now();
    const again = lastClick.id === ref.screen && now - lastClick.at < 400;
    lastClick = { id: ref.screen, at: now };
    picked = ref;
    if (again) go(send?.players, send?.label);
  }

  /** Right-click a screen: choose who goes there. */
  function menu(e: MouseEvent, ref: ScreenRef, screen: Screen): void {
    picked = ref;
    showMenu(e, [
      { heading: screen.name },
      ...(send ? [{ label: `▶ Move ${send.label} here`, onclick: () => go(send.players, send.label) }, { sep: true as const }] : []),
      ...moveChoices(session, st, selected, go),
    ]);
  }

  /** The players on a screen were dragged onto another: their party goes (the followed one, if it's there). */
  function moveDots(from: ScreenRef, to: ScreenRef): void {
    const pt = partyOn(st, from.screen);
    const text = pt && sendPlayers(game, session, pt.members, to, { label: pt.name });
    if (text) toast(text);
  }

  /** Move the party (or these players) to the picked screen, then close. */
  function go(players?: string[], label?: string): void {
    if (!picked || !found) return;
    const to = picked;
    const who = players ?? party?.members ?? [];
    if (!who.length) return void toast('Nobody to move');
    logged(session, `${label ?? party?.name ?? 'Party'} to ${found.screen.name}`, () => moveTo(game, st, world, to, { players: players }));
    toast(`${label ?? party?.name ?? 'Party'} → ${found.screen.name}`);
    onclose();
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === 'Escape' || (e.key.toLowerCase() === 'j' && !(e.target as HTMLElement).closest('input, textarea, select'))) {
      e.stopImmediatePropagation();
      e.preventDefault();
      onclose();
    }
  }}
/>

<div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
  <div class="modal" role="dialog" aria-label="Full map">
    <div class="row head">
      <b>🗺 Jump to a screen</b>
      <div class="tabs" role="tablist" aria-label="Maps">
        {#each world.maps as m (m.id)}
          <button role="tab" aria-selected={m.id === mapId} class:on={m.id === mapId} onclick={() => (mapId = m.id)}>
            {m.name}{m.id === here?.map ? ' •' : ''}
          </button>
        {/each}
      </div>
      <span class="spacer"></span>
      <span class="muted small">
        {send ? `Sending ${send.label}: click a screen, then Move.` : 'Click a screen, then choose who goes.'} Double-click to move {who} there.
      </span>
      <button onclick={onclose} title="Esc / J">✕ Close</button>
    </div>
    <div class="body">
      <div class="grid">
        <MapView {world} {st} players={session.players} audience={false} focus={here} only={mapId} big {picked} onpick={pick} onmenu={menu} onmove={moveDots} />
      </div>
      <aside class="side">
        {#if found && picked}
          <div class="preview" bind:clientWidth={boxW} style:height="{1080 * scale}px">
            <div class="slide" style:transform="scale({scale})">
              <SlideView slide={{ ...screenSlide(st, found.screen), elements: screenElements(st, found.screen, false) }} mode="edit" fallbackBg="#2f6b3a" />
            </div>
          </div>
          <b>{found.map.name} · {found.screen.name}</b>
          <span class="muted small">
            {st.knowledge[found.screen.id] === 'visited' ? 'Visited' : st.knowledge[found.screen.id] === 'discovered' ? 'Discovered, not visited' : 'Not discovered yet'}
            {#if there.length}· here: {nameList(there.map((p) => p.name))}{/if}
          </span>
          {#if found.screen.hostNotes}<span class="notes">📝 {found.screen.hostNotes}</span>{/if}
          {#if send}
            <button class="primary" onclick={() => go(send.players, send.label)}>▶ Move {send.label} here</button>
          {:else}
            <button class="primary" onclick={() => go()}>▶ Move {party?.name ?? 'party'} here</button>
            {#if selected.length}
              <button onclick={() => go(selected, `${selected.length} selected`)}>Only the selected ({selected.length})</button>
            {/if}
            {#each st.parties.filter((pt) => pt.id !== party?.id) as pt (pt.id)}
              <button onclick={() => go(pt.members, pt.name)}>Move {pt.name} here</button>
            {/each}
            {#if st.parties.length > 1}
              <button onclick={() => go(session.players.map((p) => p.id), 'Everyone')}>Everyone here</button>
            {/if}
          {/if}
        {:else}
          <p class="muted small">
            Pick a screen on the map{send ? ` to send ${send.label} there` : ''}. The yellow outline is where {party?.name ?? 'the party'} is now; faded screens aren’t
            discovered yet.
          </p>
        {/if}
      </aside>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 150;
    background: rgba(0, 0, 0, 0.6);
    display: grid;
    place-items: center;
    padding: 16px;
  }
  .modal {
    width: min(1500px, 100%);
    height: min(900px, 100%);
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
  }
  .row {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  .tabs {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }
  .tabs .on {
    border-color: var(--accent);
    background: rgba(79, 124, 255, 0.2);
  }
  .body {
    flex: 1;
    min-height: 0;
    display: flex;
    gap: 12px;
  }
  .grid {
    flex: 1;
    min-width: 0;
    overflow: auto;
  }
  .side {
    width: 340px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    overflow: auto;
  }
  .preview {
    position: relative;
    width: 100%;
    overflow: hidden;
    border-radius: 6px;
    border: 1px solid var(--border);
  }
  .slide {
    position: absolute;
    left: 0;
    top: 0;
    width: 1920px;
    height: 1080px;
    transform-origin: 0 0;
  }
  .notes {
    background: var(--panel-2);
    padding: 2px 8px;
    border-radius: 6px;
    font-size: 12px;
  }
  .small {
    font-size: 12px;
  }
</style>
