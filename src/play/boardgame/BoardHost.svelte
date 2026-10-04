<!--
  The host's controls for a board-game round: whose turn it is and the turn order (drag to reorder, click a name for
  their turn), roll or spin to move (the host confirms or edits the count), forks, the passed and landed spaces' action
  buttons, the card of a space clicked on the stage, sending players to spaces and zones, what's on screen, and each
  player's stats and inventory.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { app, toast } from '../../lib/app.svelte';
  import { textOn } from '../../lib/colors';
  import { describeAction, needsPlayers, runAction, type RunContext } from '../../lib/actions';
  import { clampSteps, currentPlayer, MAX_STEPS, spaceById, waysOn } from '../../lib/boardgame';
  import { DragOrder } from '../../lib/dragorder.svelte';
  import { newId, type Action, type BoardSpace, type Game, type Session } from '../../lib/model';
  import { lastAction, logged } from '../../lib/toolset';
  import { overlayDoneAt } from '../../lib/live';
  import PlayerCard, { cardsShown, playerCards } from '../rpg/PlayerCard.svelte';
  import { boardNow, busyZones, moveNow, moverDiceName, moverResult, playerName, reorderTurns, rollMover, sendNow, setTurn, turnNow, turnOrder } from './bgops';
  import SpaceCard from './SpaceCard.svelte';
  import { offerNext } from '../host/slots.svelte';
  import { boardEdit, setEditing } from './boardedit.svelte';
  import BoardEditPanel from './BoardEditPanel.svelte';

  let {
    game,
    session,
    selected = $bindable(),
    steps = $bindable(null),
    space = $bindable(null),
    dual,
    onhistory,
  }: {
    game: Game;
    session: Session;
    selected: string[];
    /** The steps to move, typed or rolled (Enter moves them too). */
    steps?: number | null;
    /** The space whose card is open (clicked on the stage). */
    space?: string | null;
    dual: boolean;
    /** Open the 📜 Log's history. */
    onhistory?: () => void;
  } = $props();

  const now_ = $derived(boardNow(game, session));
  const round = $derived(now_.round);
  const bs = $derived(now_.bs);
  const turnId = $derived(bs ? currentPlayer(bs) : undefined);
  const turnName = $derived(playerName(session, turnId));
  const fork = $derived(bs?.fork);
  const forkSpace = $derived(round && fork ? spaceById(round, fork.at) : undefined);
  /** The ways on from the fork, as the move saw them (backwards when it was going back). */
  const forkWays = $derived(round && bs && fork ? waysOn(round, fork.at, fork.came ?? bs.prev?.[fork.playerId], fork.stepsLeft < 0) : []);
  const last = $derived(bs?.last);
  const landed = $derived(round && last?.landed ? spaceById(round, last.landed) : undefined);
  // (The space landed on shows its passing buttons with its own, once: not here too after a loop round it.)
  const passed = $derived(
    round && last
      ? last.passed.filter((id) => id !== last.landed).map((id) => spaceById(round, id)).filter((s): s is BoardSpace => !!s?.onPass?.length)
      : [],
  );
  /** One-space boards: where the player whose turn it is can go (not straight back along a two-way link). */
  const turnSpace = $derived(turnId ? bs?.positions[turnId]?.space : undefined);
  const stepWays = $derived(round && bs && turnSpace ? waysOn(round, turnSpace, turnId ? bs.prev?.[turnId] : undefined) : []);
  const ctx = $derived<RunContext>({ game, session, live: app.live, board: round, bs, selected });
  const recent = $derived(lastAction(session, session.currentRound));
  /** Zones with players in them, or on screen: their notes (how to escape…) are worth having at hand. */
  const zones = $derived(round && bs ? busyZones(round, bs) : []);
  const showPlayers = $derived(cardsShown());
  /** This turn's move is made (or there's nothing to roll: a one-space board, a fork to pick). */
  const moved = $derived(!!bs && (!!bs.fork || round?.mover.kind === 'step' || (!!last && last.playerId === turnId && (last.turn ?? 0) === (bs.turns ?? 0))));
  /**
   * The round's main button, in the host panel's main cell: 🎲 Roll (D), then ▶ Move (Enter), then Next turn ▶ (N), with
   * ◀ Previous turn (Shift+N) right beside it (and Next turn ▶ too while the main button rolls or moves). While the
   * board is being edited: ✓ Done editing (Esc).
   */
  offerNext('turn', () => {
    if (!bs || !round) return null;
    if (boardEdit.on) return { label: '✓ Done editing', key: 'Esc', title: 'Esc: back to playing (the changes stay in this game)', run: () => setEditing(false) };
    const prev = { label: '◀ Previous turn', key: '⇧N', title: 'Shift+N: back to the turn before', run: () => turnNow(game, session, -1) };
    const next = { label: 'Next turn ▶', key: 'N', title: 'N: the next player’s turn', run: () => turnNow(game, session, 1) };
    // At a fork the way is picked first (Next turn ▶ beside it drops the steps left).
    if (bs.fork)
      return {
        label: '🔀 Pick a way',
        title: `Pick which way ${turnName} goes: the buttons under “which way?”, or a marked space on the stage`,
        run: () => toast(`Pick which way first (${Math.abs(bs.fork?.stepsLeft ?? 0)} to go): the buttons under “which way?”, or a marked space`),
        also: [prev, next],
      };
    if (moved) return { ...next, also: [prev] };
    const also = [prev, next];
    if (steps) return { label: `▶ Move ${steps}`, key: '⏎', title: `Enter: move ${turnName} ${steps} space${Math.abs(steps) === 1 ? '' : 's'}`, run: () => move(steps), also };
    const wheel = round.mover.kind === 'wheel';
    return { label: wheel ? '🎡 Spin' : '🎲 Roll', key: 'D', title: `D: ${wheel ? 'spin the movement wheel' : `roll ${moverDiceName(game, round)}`}`, run: roll, also };
  });

  // A new turn starts with no count: the last player's roll isn't theirs. A move (a way picked on the stage too) uses it up.
  $effect(() => {
    void turnId;
    void bs?.last;
    steps = null;
  });
  const card = $derived(round && space ? spaceById(round, space) : undefined);

  /** The number the round's dice or movement wheel just gave, to fill in the steps (no other dice or wheel). */
  const rolled = $derived(round ? moverResult(game, round, app.live.overlay) : null);
  $effect(() => {
    // Every roll or spin, even one that comes up the same as the last (a new turn has emptied the box since). Once it
    // has landed on stream: the count shows (and can move) no sooner than viewers see it.
    const o = app.live.overlay;
    void (o?.kind === 'dice' ? o.roll : o?.kind === 'wheel' ? o.spin : null);
    const r = rolled;
    if (r === null) return;
    const wait = o && (o.kind === 'dice' || o.kind === 'wheel') ? overlayDoneAt(o) - Date.now() : 0;
    if (wait <= 0) return void (steps = r);
    const t = setTimeout(() => (steps = r), wait);
    return () => clearTimeout(t);
  });

  function roll(): void {
    const why = rollMover(game, session, app.live);
    if (why) toast(why);
  }

  function move(n: number | null, choose?: string, who?: string): void {
    // A whole number, at most MAX_STEPS (a typo of 100000 isn't walked).
    n = n === null ? null : clampSteps(n);
    if (!n) return void toast('How many spaces? Roll first, or type a number');
    const o = app.live.overlay;
    if ((o?.kind === 'dice' || o?.kind === 'wheel') && Date.now() < overlayDoneAt(o)) return void toast('Still rolling…');
    toast(moveNow(game, session, n, choose, who), 3000);
    app.live.overlay = null;
    // Moved: the count is used up (a fork goes on with the steps left, not these).
    steps = null;
  }

  function run(a: Action, who: string): void {
    if (needsPlayers(a) && !who) return void toast('Pick who it’s for first');
    toast(runAction({ ...ctx, chosen: [who] }, a, describeAction(game, a)), 3000);
  }

  function send(to: string): void {
    if (!to) return;
    const who = selected.length ? selected : turnId ? [turnId] : [];
    const [k, id] = [to.slice(0, 1), to.slice(2)];
    sendNow(game, session, who, k === 'z' ? { zone: id } : { space: id });
  }

  /**
   * Move a player one place earlier or later in the turn order. Focus goes back to the moved chip's `refocus` button
   * (its name if that one is now disabled), so ◀▶ or Alt+←/→ can repeat.
   */
  function reorder(i: number, d: number, refocus = '.nm'): void {
    const id = bs?.order[i];
    if (!id) return;
    reorderTurns(game, session, i, i + d);
    tick().then(() => {
      const chip = orderEl?.querySelector(`[data-player-id="${id}"]`);
      const target = chip?.querySelector<HTMLButtonElement>(refocus);
      (target && !target.disabled ? target : chip?.querySelector<HTMLElement>('.nm'))?.focus();
    });
  }

  let orderEl = $state<HTMLElement>();
  const turnDrag = new DragOrder(true);

  function shuffle(): void {
    if (!bs) return;
    const b = bs;
    const o = [...b.order];
    for (let i = o.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [o[i], o[j]] = [o[j], o[i]];
    }
    // Whose turn it is stays theirs (now wherever they are in the order).
    const now = b.order[b.turn];
    logged(session, `Shuffle the turn order: ${turnOrder(session, o)}`, () => {
      b.order = o;
      delete b.before;
      b.turn = Math.max(0, now ? o.indexOf(now) : 0);
    });
  }

  let cardEl = $state<HTMLElement>();

  /** Open a space's card from the Spaces… list, and go into it (its first button), so the keyboard carries on there. */
  function openCard(id: string): void {
    space = id;
    tick().then(() => cardEl?.querySelector<HTMLElement>('button')?.focus());
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
      <span class="order" role="list" aria-label="Turn order" bind:this={orderEl}>
        {#each bs.order as id, i (id)}
          {@const p = session.players.find((x) => x.id === id)}
          {#if p}
            {@const line = turnDrag.lineAt(id)}
            <span
              class="ord"
              class:cur={id === turnId}
              class:drop-before={line === 'before'}
              class:drop-after={line === 'after'}
              class:dragging={turnDrag.dragging === id}
              style:border-color={p.color}
              data-player-id={id}
              role="listitem"
              draggable="true"
              ondragstart={(e) => turnDrag.start(e, id)}
              ondragover={(e) => turnDrag.over(e, id)}
              ondrop={(e) => {
                const m = turnDrag.drop(e, bs.order);
                if (m) reorderTurns(game, session, m.from, m.to);
              }}
              ondragend={() => turnDrag.end()}
            >
              <span class="grip" aria-hidden="true">⋮⋮</span>
              <button class="ghost tiny earlier" onclick={() => reorder(i, -1, '.earlier')} disabled={i === 0} aria-label="{p.name} earlier in the turn order">◀</button>
              <button
                class="nm"
                style:background={id === turnId ? p.color : undefined}
                style:color={id === turnId ? textOn(p.color) : undefined}
                onclick={() => setTurn(game, session, id)}
                onkeydown={(e) => {
                  // Alt+←/→ moves them in the order.
                  if (!e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
                  e.preventDefault();
                  e.stopPropagation();
                  reorder(i, e.key === 'ArrowLeft' ? -1 : 1);
                }}
                title={id === turnId ? `${p.name}’s turn · drag (or Alt+←/→) to move them in the order` : `Click: ${p.name}’s turn · drag (or Alt+←/→) to move them in the order`}
              >{p.name}</button>
              {#if bs.skips?.[id]}<span class="mark" title="Misses {bs.skips[id] === 1 ? 'their next turn' : `${bs.skips[id]} turns`}">⏭{bs.skips[id] > 1 ? bs.skips[id] : ''}</span>{/if}
              {#if bs.again === id}<span class="mark" title="Rolls again: Next turn comes back to them">🔁</span>{/if}
              <button class="ghost tiny later" onclick={() => reorder(i, 1, '.later')} disabled={i === bs.order.length - 1} aria-label="{p.name} later in the turn order">▶</button>
            </span>
          {/if}
        {/each}
      </span>
      <button class="ghost small" onclick={shuffle}>🔀 Shuffle</button>
      <span class="spacer"></span>
      <button
        class="small"
        class:on={boardEdit.on}
        aria-pressed={boardEdit.on}
        onclick={() => setEditing(!boardEdit.on)}
        title={boardEdit.on ? 'E or Esc: back to playing' : 'E: add, move, delete and connect spaces while you play (this game only, unless you keep it)'}
      >✎ Edit board <kbd aria-hidden="true">E</kbd></button>
    </div>

    {#if boardEdit.on}
      <BoardEditPanel {game} {session} {round} {bs} {dual} />
    {:else}
    <div class="row move">
      <b>🎲 {turnName}’s turn</b>
      {#if round.mover.kind === 'step'}
        <!-- One space per turn: the player picks which way. -->
        {#if fork}
          <!-- (A move that stopped at a fork goes on with its own steps: its ways are below.) -->
          <span class="muted small">{playerName(session, fork.playerId)} is at a fork: pick the way below first.</span>
        {:else if !stepWays.length}
          <span class="muted small">{turnSpace ? 'No way on from here.' : `${turnName} isn’t on the board.`}</span>
        {:else}
          <span class="muted small">{stepWays.length > 1 ? 'Which way?' : 'Move to:'}</span>
          {#each stepWays as w (w)}
            <button class="good" onclick={() => move(1, w, turnId)}>→ {spaceById(round, w)?.name}</button>
          {/each}
        {/if}
      {:else}
      <button onclick={roll} title="D: {round.mover.kind === 'dice' ? moverDiceName(game, round) : 'the movement wheel'}">
        {round.mover.kind === 'wheel' ? '🎡 Spin to move' : `🎲 Roll ${moverDiceName(game, round)}`}
      </button>
      <label class="small">
        Steps
        <input
          type="number"
          class="n"
          bind:value={steps}
          aria-label="Steps"
          min={-MAX_STEPS}
          max={MAX_STEPS}
          step="1"
          onkeydown={(e) => {
            if (e.key !== 'Enter') return;
            // At a fork the move goes on with the steps it has left: these would replace them.
            if (fork) return void toast(`${playerName(session, fork.playerId)} is at a fork: pick the way first`);
            move(steps);
            e.currentTarget.blur();
          }}
        />
      </label>
      <button disabled={!steps || !!fork} onclick={() => move(steps)} title="Enter">▶ Move {turnName} {steps ?? ''}</button>
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
      <!-- A space's card (its actions, Put … here, Reveal) without the mouse: the same as clicking it on the stage. -->
      <select
        class="small"
        aria-label="Open a space's card"
        onchange={(e) => {
          const v = e.currentTarget.value;
          e.currentTarget.value = '';
          if (v) openCard(v);
        }}
      >
        <option value="">🗂 Spaces…</option>
        {#each round.spaces as s (s.id)}<option value={s.id}>{s.name}{s.secret && !bs.revealed?.includes(s.id) ? ' (secret)' : ''}</option>{/each}
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

    {/if}

    {#if card && !boardEdit.on}
      <div bind:this={cardEl}>
        {#key card.id}
          <SpaceCard {game} {session} space={card} {round} {bs} {selected} {turnId} onclose={() => (space = null)} />
        {/key}
      </div>
    {/if}

    {#if fork && forkSpace && !boardEdit.on}
      <div class="row fork" role="alert">
        <b>{playerName(session, fork.playerId)} is at {forkSpace.name}: which way? ({Math.abs(fork.stepsLeft)} to go)</b>
        <span class="muted small">(or click the space on the stage)</span>
        {#each forkWays as n (n)}
          <button class="good" onclick={() => move(fork.stepsLeft, n)}>→ {spaceById(round, n)?.name}</button>
        {/each}
      </div>
    {/if}

    {#if last && (passed.length || landed) && !boardEdit.on}
      <div class="row acts">
        {#each passed as s (s.id)}
          <span class="muted small">Passed {s.name}:</span>
          {#each s.onPass ?? [] as a (a.id)}<button class="small" onclick={() => run(a, last.playerId)}>{describeAction(game, a)}</button>{/each}
        {/each}
        {#if landed}
          <!-- Landing on a space counts as passing it too (landing on Start still pays). -->
          <span class="muted small"
            >Landed on <b>{landed.name}</b>{landed.onPass?.length ? ' (counts as passing)' : ''}{landed.onLand?.length || landed.onPass?.length ? ':' : '.'}</span
          >
          {#each landed.onPass ?? [] as a (a.id)}<button class="small" onclick={() => run(a, last.playerId)}>{describeAction(game, a)}</button>{/each}
          {#each landed.onLand ?? [] as a (a.id)}<button class="small" onclick={() => run(a, last.playerId)}>{describeAction(game, a)}</button>{/each}
          {#if landed.secret && !bs.revealed?.includes(landed.id)}<button class="small ghost" onclick={() => reveal(landed)}>👁 Reveal space</button>{/if}
          {#if landed.hostNotes && !dual}<span class="notes">📝 {landed.hostNotes}</span>{/if}
        {/if}
      </div>
    {/if}

    <div class="row">
      {#if round.winNotes}<span class="notes" title={round.winPublic ? 'Shown on the board' : dual ? 'Only you see this' : 'Not on the board (viewers can see it here, in this window)'}>🏆 {round.winNotes}{round.winPublic ? '' : dual ? ' (secret)' : ' (not on the board)'}</span>{/if}
      {#if round.hostNotes && !dual}<span class="notes">📝 {round.hostNotes}</span>{/if}
      {#if !dual}
        {#each zones.filter((z) => z.hostNotes) as z (z.id)}<span class="notes">🌀 {z.name}: 📝 {z.hostNotes}</span>{/each}
      {/if}
      <span class="spacer"></span>
      {#if recent}<button class="muted small last" onclick={onhistory} title="Ctrl+Z undoes it · click for the whole history">Last: {recent.text}</button>{/if}
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
  .order {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .ord {
    position: relative;
    display: inline-flex;
    align-items: center;
    border: 2px solid;
    border-radius: 8px;
    font-size: 12px;
  }
  .ord.dragging {
    opacity: 0.5;
  }
  /* Where a dragged chip goes. */
  .ord.drop-before::before,
  .ord.drop-after::after {
    content: '';
    position: absolute;
    top: -2px;
    bottom: -2px;
    width: 2px;
    background: var(--accent);
  }
  .ord.drop-before::before {
    left: -5px;
  }
  .ord.drop-after::after {
    right: -5px;
  }
  .grip {
    cursor: grab;
    color: var(--muted);
    font-size: 12px;
    letter-spacing: -2px;
    padding: 0 2px 0 3px;
    user-select: none;
  }
  .ord .nm {
    padding: 1px 6px;
    border: none;
    border-radius: 4px;
    background: none;
    font-size: 12px;
    font-weight: 700;
  }
  .mark {
    font-size: 12px;
    padding-right: 2px;
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
    padding: 0;
    border: none;
    background: none;
    max-width: 300px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .last:hover {
    text-decoration: underline;
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
    font-size: 12px;
    padding: 0 4px;
  }
  kbd {
    font: 10px/1 ui-monospace, monospace;
    padding: 1px 3px;
    margin-left: 3px;
    border: 1px solid currentColor;
    border-radius: 4px;
    opacity: 0.7;
  }
  button.on {
    outline: 2px solid var(--accent);
  }
</style>
