<!--
  The host's card for a space clicked on the board (like an RPG object's card): its notes, who is on it, its landing
  and passing action buttons (for the selected players, else whoever's turn it is), putting players there, and
  revealing a secret space. Esc closes it. Every change is one undoable step.
-->
<script lang="ts">
  import { app, toast } from '../../lib/app.svelte';
  import { textOn } from '../../lib/colors';
  import { describeAction, needsPlayers, runAction } from '../../lib/actions';
  import type { Action, BoardGameRound, BoardGameState, BoardSpace, Game, Session } from '../../lib/model';
  import { nameList } from '../../lib/session';
  import { logged } from '../../lib/toolset';
  import { playerName, runSpace, sendNow } from './bgops';

  let {
    game,
    session,
    space,
    round,
    bs,
    selected,
    turnId,
    onclose,
  }: {
    game: Game;
    session: Session;
    space: BoardSpace;
    round: BoardGameRound;
    bs: BoardGameState;
    selected: string[];
    /** Whose turn it is (the buttons are for them when nobody is selected). */
    turnId: string | undefined;
    onclose: () => void;
  } = $props();

  const who = $derived(selected.length ? selected : turnId ? [turnId] : []);
  const whoNames = $derived(nameList(who.map((id) => playerName(session, id))) || 'nobody');
  const on = $derived(session.players.filter((p) => bs.positions[p.id]?.space === space.id));
  const hidden = $derived(!!space.secret && !bs.revealed?.includes(space.id));
  const isStart = $derived((round.start ?? round.spaces[0]?.id) === space.id);

  function run(a: Action): void {
    if (needsPlayers(a) && !who.length) return void toast('Pick who it’s for first');
    toast(runAction({ game, session, live: app.live, board: round, bs, selected, chosen: who }, a, `${space.name}: ${describeAction(game, a)}`), 3000);
  }

  function reveal(): void {
    logged(session, `Reveal ${space.name}`, () => (bs.revealed = [...(bs.revealed ?? []), space.id]));
  }
</script>

<div class="card" role="dialog" aria-label="Space: {space.name}">
  <div class="row head">
    <b>{space.name}</b>
    {#if isStart}<span class="tag">🏁 Start</span>{/if}
    {#if space.secret}<span class="vis" class:off={hidden}>{hidden ? '🙈 Secret: viewers see “?”' : '👁 Revealed'}</span>{/if}
    <span class="spacer"></span>
    <button class="ghost small" onclick={onclose} aria-label="Close" title="Esc">✕</button>
  </div>
  {#if space.hostNotes}<div class="notes">📝 {space.hostNotes}</div>{/if}
  <div class="row">
    <span class="muted small">Here:</span>
    {#each on as p (p.id)}
      <span class="chip" style:background={p.color} style:color={textOn(p.color)} data-player-id={p.id}>{p.name}</span>
    {:else}
      <span class="muted small">nobody</span>
    {/each}
  </div>
  {#if space.onLand?.length}
    <div class="row">
      <span class="muted small">Landing on it{who.length ? ` (${whoNames})` : ''}:</span>
      {#each space.onLand as a (a.id)}<button class="small" onclick={() => run(a)}>{describeAction(game, a)}</button>{/each}
      {#if space.onLand.length > 1}
        <button class="small" onclick={() => toast(runSpace(game, session, app.live, space, who), 3000)} title="Every landing action, in order">▶ Run all</button>
      {/if}
    </div>
  {/if}
  {#if space.onPass?.length}
    <div class="row">
      <span class="muted small">Passing it:</span>
      {#each space.onPass as a (a.id)}<button class="small" onclick={() => run(a)}>{describeAction(game, a)}</button>{/each}
    </div>
  {/if}
  {#if !space.onLand?.length && !space.onPass?.length}<span class="muted small">No buttons on this space.</span>{/if}
  <div class="row">
    <button class="small" disabled={!who.length || who.every((id) => bs.positions[id]?.space === space.id)} onclick={() => sendNow(game, session, who, { space: space.id })}>
      📍 Put {selected.length ? `the selected (${selected.length})` : playerName(session, turnId)} here
    </button>
    <span class="muted small">or drag a token onto it</span>
    {#if hidden}<button class="small" onclick={reveal}>👁 Reveal to viewers</button>{/if}
  </div>
</div>

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    border: 1px solid var(--accent);
    border-radius: 8px;
    background: rgba(79, 124, 255, 0.08);
  }
  .row {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
  }
  .tag {
    font-size: 12px;
    padding: 1px 6px;
    border-radius: 6px;
    background: var(--panel-2);
  }
  .vis {
    font-size: 12px;
    color: var(--good);
  }
  .vis.off {
    color: var(--warn);
  }
  .notes {
    font-size: 12px;
    background: var(--panel-2);
    padding: 2px 8px;
    border-radius: 6px;
  }
  .chip {
    padding: 1px 8px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 700;
  }
  .small {
    font-size: 12px;
  }
</style>
