<!--
  The host's controls for a board-game round: whose turn it is and the turn order, roll or spin to move (the host
  confirms or edits the count), forks, the passed and landed spaces' action buttons, sending players to spaces and
  zones, what's on screen, and each player's stats and inventory.
-->
<script lang="ts">
  import { app, toast } from '../../lib/app.svelte';
  import { textOn } from '../../lib/colors';
  import { describeAction, needsPlayers, runAction, type RunContext } from '../../lib/actions';
  import { currentPlayer, sendTo, spaceById, waysOn } from '../../lib/boardgame';
  import { newId, type Action, type BoardSpace, type Game, type Session } from '../../lib/model';
  import { lastAction, logged } from '../../lib/toolset';
  import PlayerCard, { cardsShown, playerCards } from '../rpg/PlayerCard.svelte';
  import { boardNow, busyZones, moveNow, playerName, rollMover, turnNow } from './bgops';

  let { game, session, selected = $bindable(), dual }: { game: Game; session: Session; selected: string[]; dual: boolean } = $props();

  const now_ = $derived(boardNow(game, session));
  const round = $derived(now_.round);
  const bs = $derived(now_.bs);
  const turnId = $derived(bs ? currentPlayer(bs) : undefined);
  const turnName = $derived(playerName(session, turnId));
  const fork = $derived(bs?.fork);
  const forkSpace = $derived(round && fork ? spaceById(round, fork.at) : undefined);
  const last = $derived(bs?.last);
  const landed = $derived(round && last?.landed ? spaceById(round, last.landed) : undefined);
  const passed = $derived(round && last ? last.passed.map((id) => spaceById(round, id)).filter((s): s is BoardSpace => !!s?.onPass?.length) : []);
  /** One-space boards: where the player whose turn it is can go (not straight back along a two-way link). */
  const turnSpace = $derived(turnId ? bs?.positions[turnId]?.space : undefined);
  const stepWays = $derived(round && bs && turnSpace ? waysOn(round, turnSpace, turnId ? bs.prev?.[turnId] : undefined) : []);
  const ctx = $derived<RunContext>({ game, session, live: app.live, board: round, bs, selected });
  const recent = $derived(lastAction(session, session.currentRound));
  /** Zones with players in them, or on screen: their notes (how to escape…) are worth having at hand. */
  const zones = $derived(round && bs ? busyZones(round, bs) : []);
  let steps = $state<number | null>(null);
  const showPlayers = $derived(cardsShown());

  // A new turn starts with no count: the last player's roll isn't theirs.
  $effect(() => {
    void turnId;
    steps = null;
  });

  /** The number the dice or wheel just gave (a wheel slice labeled "3" or "Move 3"), to fill in the steps. */
  const rolled = $derived.by(() => {
    const o = app.live.overlay;
    if (o?.kind === 'dice' && o.roll) return o.roll.total;
    if (o?.kind === 'wheel' && o.spin && o.result !== null) {
      const n = parseInt(o.segments[o.result]?.label.match(/-?\d+/)?.[0] ?? '', 10);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  });
  $effect(() => {
    // Every roll or spin, even one that comes up the same as the last (a new turn has emptied the box since).
    const o = app.live.overlay;
    void (o?.kind === 'dice' ? o.roll : o?.kind === 'wheel' ? o.spin : null);
    if (rolled !== null) steps = rolled;
  });

  function roll(): void {
    const why = rollMover(game, session, app.live);
    if (why) toast(why);
  }

  function move(n: number | null, choose?: string): void {
    if (!n) return void toast('How many spaces? Roll first, or type a number');
    toast(moveNow(game, session, n, choose), 3000);
    app.live.overlay = null;
    // Moved: the count is used up (a fork goes on with the steps left, not these).
    steps = null;
  }

  function run(a: Action, who: string): void {
    if (needsPlayers(a) && !who) return void toast('Pick who it’s for first');
    toast(runAction({ ...ctx, chosen: [who] }, a, describeAction(game, a)), 3000);
  }

  function send(to: string): void {
    if (!bs || !to) return;
    const who = selected.length ? selected : turnId ? [turnId] : [];
    if (!who.length) return;
    const [k, id] = [to.slice(0, 1), to.slice(2)];
    const b = bs;
    const where = k === 'z' ? round?.zones.find((z) => z.id === id)?.name : spaceById(round!, id)?.name;
    logged(session, `${who.map((w) => playerName(session, w)).join(', ')} → ${where}`, () => sendTo(b, who, k === 'z' ? { zone: id } : { space: id }));
  }

  function reorder(i: number, d: number): void {
    if (!bs) return;
    const b = bs;
    const j = i + d;
    if (j < 0 || j >= b.order.length) return;
    logged(session, 'Turn order', () => {
      const cur = b.order[b.turn];
      [b.order[i], b.order[j]] = [b.order[j], b.order[i]];
      b.turn = b.order.indexOf(cur);
    });
  }

  function shuffle(): void {
    if (!bs) return;
    const b = bs;
    logged(session, 'Shuffle the turn order', () => {
      const o = [...b.order];
      for (let i = o.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [o[i], o[j]] = [o[j], o[i]];
      }
      b.order = o;
      b.turn = 0;
    });
  }

  function reveal(s: BoardSpace): void {
    if (!bs) return;
    const b = bs;
    logged(session, `Reveal ${s.name}`, () => (b.revealed = [...(b.revealed ?? []), s.id]));
  }
</script>

{#if round && bs}
  <div class="bh">
    <div class="row">
      <span class="muted small">Turn order:</span>
      {#each bs.order as id, i (id)}
        {@const p = session.players.find((x) => x.id === id)}
        {#if p}
          <span class="ord" class:cur={id === turnId} style:border-color={p.color}>
            <button class="ghost tiny" onclick={() => reorder(i, -1)} disabled={i === 0} aria-label="Earlier">◀</button>
            <span style:background={id === turnId ? p.color : undefined} style:color={id === turnId ? textOn(p.color) : undefined} class="nm">{p.name}</span>
            <button class="ghost tiny" onclick={() => reorder(i, 1)} disabled={i === bs.order.length - 1} aria-label="Later">▶</button>
          </span>
        {/if}
      {/each}
      <button class="ghost small" onclick={shuffle}>🔀 Shuffle</button>
      <span class="spacer"></span>
      <button class="small" class:on={app.live.cover} onclick={() => (app.live.cover = !app.live.cover)} title="B: viewers see only a 'Be right back' card">
        ⏸ Cover
      </button>
      <button class="small" onclick={() => turnNow(game, session, -1)}>◀ Previous turn</button>
      <button class="primary" onclick={() => turnNow(game, session, 1)} title="N">Next turn ▶</button>
    </div>

    <div class="row move">
      <b>🎲 {turnName}’s turn</b>
      {#if round.mover.kind === 'step'}
        <!-- One space per turn: the player picks which way. -->
        {#if !stepWays.length}
          <span class="muted small">{turnSpace ? 'No way on from here.' : `${turnName} isn’t on the board.`}</span>
        {:else}
          <span class="muted small">{stepWays.length > 1 ? 'Which way?' : 'Move to:'}</span>
          {#each stepWays as w (w)}
            <button class="good" onclick={() => move(1, w)}>→ {spaceById(round, w)?.name}</button>
          {/each}
        {/if}
      {:else}
      <button onclick={roll} title="D: {round.mover.kind === 'dice' ? round.mover.dice : 'the movement wheel'}">
        {round.mover.kind === 'wheel' ? '🎡 Spin to move' : `🎲 Roll ${round.mover.dice || 'd6'}`}
      </button>
      <label class="small">
        Steps
        <input
          type="number"
          class="n"
          bind:value={steps}
          aria-label="Steps"
          onkeydown={(e) => {
            if (e.key === 'Enter') {
              move(steps);
              e.currentTarget.blur();
            }
          }}
        />
      </label>
      <button class="good" disabled={!steps || !!fork} onclick={() => move(steps)} title="Enter in the box">▶ Move {turnName} {steps ?? ''}</button>
      <button class="small" disabled={!steps || !!fork} onclick={() => move(-(steps ?? 0))}>◀ Back {steps ?? ''}</button>
      {/if}
      <span class="spacer"></span>
      <select
        class="small"
        aria-label="Send to"
        onchange={(e) => {
          const v = e.currentTarget.value;
          e.currentTarget.value = '';
          e.currentTarget.blur();
          send(v);
        }}
        title="Teleport the selected players (or whoever's turn it is)"
      >
        <option value="">📍 Send {selected.length ? `selected (${selected.length})` : turnName} to…</option>
        {#each round.spaces as s (s.id)}<option value="s:{s.id}">{s.name}</option>{/each}
        {#each round.zones as z (z.id)}<option value="z:{z.id}">🌀 {z.name}</option>{/each}
      </select>
      <select
        class="small"
        aria-label="On screen"
        value={bs.zoneShown ?? ''}
        onchange={(e) => {
          const v = e.currentTarget.value;
          e.currentTarget.blur();
          bs.zoneShown = v || null;
        }}
      >
        <option value="">📺 The board</option>
        {#each round.zones as z (z.id)}<option value={z.id}>📺 {z.name}</option>{/each}
      </select>
      {#if game.shops?.length}
        <select
          class="small"
          aria-label="Open a shop"
          onchange={(e) => {
            const id = e.currentTarget.value;
            e.currentTarget.value = '';
            e.currentTarget.blur();
            if (id) app.live.overlay = { kind: 'shop', nonce: newId(), shopId: id, buyer: selected[0] ?? turnId };
          }}
        >
          <option value="">🛒 Shop…</option>
          {#each game.shops as sh (sh.id)}<option value={sh.id}>{sh.name}</option>{/each}
        </select>
      {/if}
    </div>

    {#if fork && forkSpace}
      <div class="row fork" role="alert">
        <b>{playerName(session, fork.playerId)} is at {forkSpace.name}: which way? ({fork.stepsLeft} to go)</b>
        {#each forkSpace.next as n (n)}
          <button class="primary" onclick={() => move(fork.stepsLeft, n)}>→ {spaceById(round, n)?.name}</button>
        {/each}
      </div>
    {/if}

    {#if last && (passed.length || landed)}
      <div class="row acts">
        {#each passed as s (s.id)}
          <span class="muted small">Passed {s.name}:</span>
          {#each s.onPass ?? [] as a (a.id)}<button class="small" onclick={() => run(a, last.playerId)}>{describeAction(game, a)}</button>{/each}
        {/each}
        {#if landed}
          <span class="muted small">Landed on <b>{landed.name}</b>{landed.onLand?.length ? ':' : '.'}</span>
          {#each landed.onLand ?? [] as a (a.id)}<button class="small" onclick={() => run(a, last.playerId)}>{describeAction(game, a)}</button>{/each}
          {#if landed.secret && !bs.revealed?.includes(landed.id)}<button class="small ghost" onclick={() => reveal(landed)}>👁 Reveal space</button>{/if}
          {#if landed.hostNotes && !dual}<span class="notes">📝 {landed.hostNotes}</span>{/if}
        {/if}
      </div>
    {/if}

    <div class="row">
      {#if round.winNotes}<span class="notes" title={round.winPublic ? 'Shown on the board' : 'Only you see this'}>🏆 {round.winNotes}{round.winPublic ? '' : ' (secret)'}</span>{/if}
      {#if round.hostNotes && !dual}<span class="notes">📝 {round.hostNotes}</span>{/if}
      {#if !dual}
        {#each zones.filter((z) => z.hostNotes) as z (z.id)}<span class="notes">🌀 {z.name}: 📝 {z.hostNotes}</span>{/each}
      {/if}
      <span class="spacer"></span>
      {#if recent}<span class="muted small last" title="Ctrl+Z undoes it">Last: {recent.text}</span>{/if}
      <button class="ghost small" onclick={() => (playerCards.open = !showPlayers)} aria-expanded={showPlayers}>{showPlayers ? '▾' : '▸'} Players</button>
    </div>
    {#if showPlayers}
      <div class="cards">
        {#each session.players as pl (pl.id)}
          <PlayerCard
            {game}
            {session}
            player={pl}
            board={round}
            {bs}
            {selected}
            ontoggle={() => (selected = selected.includes(pl.id) ? selected.filter((x) => x !== pl.id) : [...selected, pl.id])}
          />
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .bh {
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
  .ord {
    display: inline-flex;
    align-items: center;
    border: 2px solid;
    border-radius: 8px;
    font-size: 12px;
  }
  .on {
    border-color: var(--accent);
    background: rgba(79, 124, 255, 0.25);
  }
  .ord .nm {
    padding: 1px 6px;
    border-radius: 4px;
    font-weight: 700;
  }
  .n {
    width: 64px;
  }
  .fork {
    padding: 6px 8px;
    border: 1px solid var(--warn);
    border-radius: 8px;
  }
  .acts {
    padding: 4px 8px;
    border-radius: 8px;
    background: rgba(79, 124, 255, 0.08);
  }
  .notes {
    background: var(--panel-2);
    padding: 2px 8px;
    border-radius: 6px;
    font-size: 12px;
  }
  .last {
    max-width: 300px;
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
  select.small {
    padding: 2px 6px;
  }
  .small {
    font-size: 12px;
  }
  .tiny {
    font-size: 10px;
    padding: 0 4px;
  }
</style>
