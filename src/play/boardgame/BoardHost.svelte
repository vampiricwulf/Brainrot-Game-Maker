<!--
  The host's controls for a board-game round, the turn first: the turn box (its first line says what to do; one slot,
  🎲 Roll then ▶ Move in the same place, beside the Steps box, ◀ Back and 📍 Send to…), the round's own dice or wheel
  under it, a fork's ways, then the landing box (the passed and landed spaces' buttons). Beside the stage that part
  sits at the column's foot, by the blue button. Then the card of a space clicked on the stage; the turn order in one
  line (✎ Change unfolds it: drag to reorder, click a name for their turn, 🔀 Shuffle); ✎ Edit board, the spaces' cards,
  what's on screen and the shops; and each player's stats and inventory. Next turn ▶ is the panel's blue button (the
  play screen's, goon.ts), never here.
-->
<script lang="ts">
  import { tick, type Snippet } from 'svelte';
  import { app, hint, toast } from '../../lib/app.svelte';
  import { textOn } from '../../lib/colors';
  import { describeAction, needsPlayers, runAction, type RunContext } from '../../lib/actions';
  import { teamsOn } from '../../lib/buzz';
  import { buzzerOn } from '../../lib/remote.svelte';
  import { clampSteps, currentPlayer, MAX_STEPS, spaceById, spaceListShown, spaceShown, unrevealed, waysOn } from '../../lib/boardgame';
  import { DragOrder } from '../../lib/dragorder.svelte';
  import { newId, type Action, type BoardSpace, type Game, type Session } from '../../lib/model';
  import { lastAction, logged, stepText } from '../../lib/toolset';
  import { overlayDoneAt, toolOverlay } from '../../lib/live';
  import PlayerCard, { cardsShown, playerCards } from '../rpg/PlayerCard.svelte';
  import { boardNow, busyZones, isMover, landingRan, moveNow, moverDiceName, offBoard, playerName, reorderTurns, revealSpace, rollMover, runLanding, sendNow, setTurn, spaceActText, turnOrder } from './bgops';
  import SpaceCard from './SpaceCard.svelte';
  import { START_FIRST } from '../rpg/hostops';
  import { offerMenu, step as nextStep, type NextAction } from '../host/slots.svelte';
  import { stepItem, type StageItem } from '../host/stagemenu';
  import StepButton from '../host/StepButton.svelte';
  import { VERBS } from '../host/verbs';
  import { offerIn } from '../host/offered.svelte';
  import { boardEdit, setEditing } from './boardedit.svelte';
  import BoardEditPanel from './BoardEditPanel.svelte';
  import CardOffers from '../host/CardOffers.svelte';
  import { RememberedFold } from '../../lib/fold.svelte';
  import { oneShot } from '../../lib/oneshot';

  let {
    game,
    session,
    selected = $bindable(),
    steps = $bindable(null),
    space = $bindable(null),
    dual,
    ring = null,
    side = false,
    mover,
    onhistory,
  }: {
    game: Game;
    session: Session;
    selected: string[];
    /** The steps to move, typed or rolled (Enter moves them too). The play screen fills and empties it (H hides this panel). */
    steps?: number | null;
    /** The space whose card is open (clicked on the stage). */
    space?: string | null;
    dual: boolean;
    /** The box button that wears the ring (the check's first thing left): 'turnslot', the slot or the only way on. */
    ring?: string | null;
    /** Beside the stage (a wide window): the turn box and the landing go at the column's foot, by the blue button. */
    side?: boolean;
    /** The round's own dice or movement wheel's box, once rolled or spun: it goes under the turn box. */
    mover?: Snippet;
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
  // (A 🤫 card its landing box's buttons offer shows under the turn, where they were pressed.)
  const ctx = $derived<RunContext>({ game, session, live: app.live, board: round, bs, hide: !dual, selected, teams: buzzerOn(game.settings) && teamsOn(game.settings), offerCard: offerIn(session, 'land') });
  const recent = $derived(lastAction(session, session.currentRound));
  /** Zones with players in them, or on screen: their notes (how to escape…) are worth having at hand. */
  const zones = $derived(round && bs ? busyZones(round, bs) : []);
  const showPlayers = $derived(cardsShown());
  /** This turn's move is made (or there's nothing to roll: a fork to pick). */
  const moved = $derived(!!bs && (!!bs.fork || (!!last && last.playerId === turnId && (last.turn ?? 0) === (bs.turns ?? 0))));
  /** A space's name here: in one window (on stream), a secret one not revealed yet is “?”, as on the board. */
  const shown = (id: string | undefined) => (round && bs ? spaceShown(round, bs, id, !dual) : '?');
  /** A passed or landed space's button (a Send to a secret space says “? (secret)” in one window, as its toast does). */
  const actText = (a: Action, on: 'land' | 'pass') => describeAction(game, a, on, ctx.teams, dual ? undefined : bs);
  /** Goes up once the round's own dice (or movement wheel) land: the slot wakes. */
  let landedTick = $state(0);
  $effect(() => {
    const o = toolOverlay(app.live);
    if (o?.kind !== 'dice' && o?.kind !== 'wheel') return;
    const wait = overlayDoneAt(o) - Date.now();
    if (wait <= 0) return;
    const t = setTimeout(() => landedTick++, wait + 20);
    return () => clearTimeout(t);
  });
  /** The round's own dice (or movement wheel) still going on stream (under the scores too). */
  const rolling = $derived.by(() => {
    void landedTick;
    const o = toolOverlay(app.live);
    return !!round && !!o && isMover(round, o) && Date.now() < overlayDoneAt(o);
  });
  const rollWords = $derived(round?.mover.kind === 'wheel' ? '🎡 Spin to move' : `🎲 Roll ${round ? moverDiceName(game, round) : ''}`);
  /**
   * The turn box's one slot: 🎲 Roll (D), then ▶ Move (Enter) once there's a count, in the same place; greyed while the
   * dice roll and at a fork (the way first). A one-space board has its ways instead.
   */
  const slot = $derived.by((): NextAction | null => {
    if (!round || round.mover.kind === 'step') return null;
    const what = round.mover.kind === 'dice' ? moverDiceName(game, round) : 'the movement wheel';
    if (fork) return nextStep({ label: rollWords, key: 'D' }, roll, { disabled: true, title: 'Pick the way first: below, or the space on the stage' });
    if (rolling) return nextStep({ label: rollWords, key: 'D' }, roll, { disabled: true, title: `Still ${round.mover.kind === 'wheel' ? 'spinning' : 'rolling'}…` });
    if (steps) {
      const n = steps;
      return nextStep({ label: `${n < 0 ? '◀ Back' : '▶ Move'} ${turnName}: ${Math.abs(n)}`, key: '⏎' }, () => move(n), { title: `Enter: move ${turnName} ${n < 0 ? 'back ' : ''}${Math.abs(n)} space${Math.abs(n) === 1 ? '' : 's'}` });
    }
    return nextStep({ label: rollWords, key: 'D' }, roll, { title: `D: ${what}` });
  });
  /** The turn box's first line: what to do next, in words a mouse host can follow. */
  const firstLine = $derived.by(() => {
    if (!round || !bs) return '';
    if (fork) return `${playerName(session, fork.playerId)} is at a fork: pick the way below first, or click the space on the stage.`;
    const off = turnId ? offBoard(session, round, bs, turnId) : null;
    if (off) return `${off}.`;
    if (moved) {
      // (The landing's actions not run yet: its buttons are below. Next turn ▶ asks first, while they aren't.)
      const left = !!landed?.onLand?.length && !!last && !landingRan(session, last);
      return left && landed ? `${turnName} landed on ${shown(landed.id)}: its buttons are below, then Next turn ▶ (N).` : `${turnName}’s turn is played: Next turn ▶ (N).`;
    }
    if (round.mover.kind === 'step') return stepWays.length ? `${turnName}’s turn: → the way on (Enter, or click the space on the stage).` : `${turnName}’s turn: no way on from here.`;
    return round.mover.kind === 'wheel'
      ? `${turnName}’s turn: 🎡 Spin (D), then ▶ Move (Enter, or click the wheel once it lands).`
      : `${turnName}’s turn: 🎲 Roll (D), then ▶ Move (Enter, or click the dice once they land).`;
  });
  // The stage's menu: the turn box's own actions (its slot, or the one way on), then ✎ Edit board and 🔀 Shuffle. (Next
  // turn ▶ is the blue button's step: the moment's own.)
  offerMenu('turn', () => {
    if (!bs || !round) return [];
    if (boardEdit.on) return [stepItem(nextStep(VERBS.doneEditing, () => setEditing(false)), 'edit')];
    const out: StageItem[] = [];
    if (slot) out.push(stepItem(slot, steps ? 'move' : 'roll'));
    else if (stepWays.length === 1 && !moved && !fork) out.push(stepItem(nextStep(VERBS.stepTo(shown(stepWays[0])), () => move(1, stepWays[0], turnId)), 'move'));
    out.push({ id: 'edit', label: '✎ Edit board', keys: 'E', onclick: () => setEditing(true) }, { label: '🔀 Shuffle', hint: 'The turn order, shuffled (whose turn it is stays theirs)', onclick: shuffle });
    return out;
  });

  const card = $derived(round && space ? spaceById(round, space) : undefined);
  /**
   * The spaces' names in the lists below (a name that repeats says where it is: “Bonus (after Space 6)”). In one window
   * (on stream) a secret one not revealed yet is “? (secret)”, as on the board.
   */
  const listNames = $derived(round && bs ? spaceListShown(round, bs, !dual) : new Map<string, string>());

  function roll(): void {
    // (As D: under the round's title card nobody would see it.)
    if (session.intro) return void hint(START_FIRST);
    const why = rollMover(game, session, app.live);
    // (Each says what to do first: it goes once that's done, or the next turn starts.)
    if (why) hint(why);
  }

  function move(n: number | null, choose?: string, who?: string): void {
    // (Nor a move: the token would go unseen, and the turn be used up.)
    if (session.intro) return void hint(START_FIRST);
    // A whole number, at most MAX_STEPS (a typo of 100000 isn't walked).
    n = n === null ? null : clampSteps(n);
    if (!n) return void hint('How many spaces? Roll first, or type a number');
    // (Under the scores too: the move would end them unseen.)
    const o = toolOverlay(app.live);
    if ((o?.kind === 'dice' || o?.kind === 'wheel') && Date.now() < overlayDoneAt(o)) return void hint('Still rolling…');
    // Not on a space (in a zone): the roll stays on screen and in the Steps box (for the zone's escape, say).
    const mover = who ?? fork?.playerId ?? turnId;
    const off = round && bs && mover ? offBoard(session, round, bs, mover) : null;
    if (off) return void hint(off);
    toast(moveNow(game, session, n, choose, who, !dual), 3000);
    app.live.overlay = null;
    // Moved: the count is used up (a fork goes on with the steps left, not these).
    steps = null;
  }

  /** A passed or landed space's button: logged with the space's name, as from its card. */
  function run(s: BoardSpace, a: Action, who: string, on: 'land' | 'pass'): void {
    if (needsPlayers(a) && !who) return void hint('Pick who it’s for first');
    // (For the players picked: nobody picked, it does nothing, and the landing isn't run.)
    if ('who' in a && a.who === 'selected' && !selected.length) return void hint('Pick who it’s for first (1–9)');
    const go = () => runAction({ ...ctx, chosen: [who] }, a, ...(bs ? spaceActText(game, bs, s, a, on, !!ctx.teams) : [`${s.name}: ${actText(a, on)}`]));
    // (The landing's own: it counts as run, for the check before Next turn ▶.)
    toast(on === 'land' ? runLanding(game, session, s, go) : go(), 3000);
  }

  function send(to: string): void {
    if (!to) return;
    const who = selected.length ? selected : turnId ? [turnId] : [];
    const [k, id] = [to.slice(0, 1), to.slice(2)];
    sendNow(game, session, who, k === 'z' ? { zone: id } : { space: id }, !dual);
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
  /** The turn order's chips (✎ Change): folded to one line until the host opens them, and remembered. */
  const orderFold = new RememberedFold('jb.turnOrderOpen');
  /** Whose turns, in order, for the folded line (and its tooltip): skips and Roll again marked. */
  const orderLine = $derived(
    (bs?.order ?? []).map((id) => {
      const p = session.players.find((x) => x.id === id);
      const skips = bs?.skips?.[id];
      return { id, name: p?.name ?? '?', marks: `${skips ? `⏭${skips > 1 ? skips : ''}` : ''}${bs?.again === id ? '🔁' : ''}` };
    }),
  );

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
      delete b.after;
      b.turn = Math.max(0, now ? o.indexOf(now) : 0);
    });
  }

  let cardEl = $state<HTMLElement>();
  /** The fork's "which way?" row: brought into view when a move stops there (a long turn order can push it down). */
  let forkEl = $state<HTMLElement>();
  $effect(() => {
    if (forkEl) forkEl.scrollIntoView({ block: 'nearest' });
  });

  /** Open a space's card from the Spaces… list, and go into it (its first button), so the keyboard carries on there. */
  function openCard(id: string): void {
    space = id;
    tick().then(() => cardEl?.querySelector<HTMLElement>('button')?.focus());
  }

  function reveal(s: BoardSpace): void {
    if (bs) revealSpace(session, bs, s);
  }
</script>

{#if round && bs}
  <div class="bh" class:side>
    {#if boardEdit.on}
      <BoardEditPanel {game} {session} {round} {bs} {dual} />
      <!-- (The turn box waits while you edit; the round's dice or wheel keeps its box.) -->
      {@render mover?.()}
    {:else if !side}
      {@render turnPart()}
    {/if}

    {#if card && !boardEdit.on}
      <div bind:this={cardEl} {@attach (el) => el.scrollIntoView({ block: 'nearest' })}>
        {#key card.id}
          <SpaceCard {game} {session} space={card} {round} {bs} {selected} {turnId} {dual} onclose={() => (space = null)} />
        {/key}
        <!-- (A 🤫 card its buttons offer shows here, under it.) -->
        <CardOffers {game} {session} {dual} at="space:{card.id}" />
      </div>
    {/if}

    <!-- The turn order, one line: ✎ Change opens its chips (drag, Alt+←/→ or ◀ ▶ to reorder, a click for their turn)
         and 🔀 Shuffle, remembered. ✎ Change stays at the line's end on its first row, so a second click never lands on
         a chip. -->
    <div class="row order-row" data-turn-order>
      <span class="muted small">Turn order:</span>
      {#if orderFold.open}
        <span class="body">
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
                  aria-current={id === turnId ? 'true' : undefined}
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
                {#if bs.skips?.[id]}<span class="mark" role="img" aria-label="Misses {bs.skips[id] === 1 ? 'their next turn' : `${bs.skips[id]} turns`}" title="Misses {bs.skips[id] === 1 ? 'their next turn' : `${bs.skips[id]} turns`}">⏭{bs.skips[id] > 1 ? bs.skips[id] : ''}</span>{/if}
                {#if bs.again === id}<span class="mark" role="img" aria-label="Rolls again" title="Rolls again: Next turn comes back to them">🔁</span>{/if}
                <button class="ghost tiny later" onclick={() => reorder(i, 1, '.later')} disabled={i === bs.order.length - 1} aria-label="{p.name} later in the turn order">▶</button>
              </span>
            {/if}
          {/each}
        </span>
        <button class="ghost small" onclick={shuffle} title="The turn order, shuffled (whose turn it is stays theirs)">🔀 Shuffle</button>
        </span>
      {:else}
        {@const said = orderLine.map((o) => `${o.name}${o.marks ? ` ${o.marks}` : ''}`).join(' → ')}
        <!-- (Cut short where narrow: its tooltip has it whole. Whose turn it is, in bold.) -->
        <span class="seq" title={said}
          >{#each orderLine as o, i (o.id)}{i ? ' → ' : ''}{#if o.id === turnId}<b>{o.name}</b>{:else}{o.name}{/if}{o.marks ? ` ${o.marks}` : ''}{/each}</span
        >
      {/if}
      <button
        class="ghost small change"
        class:on={orderFold.open}
        aria-expanded={orderFold.open}
        use:oneShot
        onclick={() => orderFold.set(!orderFold.open)}
        title={orderFold.open ? 'Fold the turn order back to one line' : 'Change the turn order: drag a name, or 🔀 Shuffle; click a name for their turn'}>✎ Change</button
      >
    </div>

    <!-- The rest: ✎ Edit board, the spaces' cards, what's on screen and the shops; then the last step and the players. -->
    <div class="row more">
      <button
        class="small"
        class:on={boardEdit.on}
        aria-pressed={boardEdit.on}
        onclick={() => setEditing(!boardEdit.on)}
        title={boardEdit.on ? 'E or Esc: back to playing' : 'E: add, move, delete and connect spaces while you play (this game only, unless you keep it)'}
      >✎ Edit board <kbd aria-hidden="true">E</kbd></button>
      {#if !boardEdit.on}
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
          {#each round.spaces as s (s.id)}<option value={s.id}>{listNames.get(s.id)}{dual && unrevealed(bs, s) ? ' (secret)' : ''}</option>{/each}
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
      {/if}
      <span class="spacer"></span>
      {#if recent}<button class="muted small last" onclick={onhistory} title="Ctrl+Z undoes it · click for the whole history">Last: {stepText(recent, !dual)}</button>{/if}
      <button class="ghost small" onclick={() => (playerCards.open = !showPlayers)} aria-expanded={showPlayers}>{showPlayers ? '▾' : '▸'} {ctx.teams ? 'Teams' : 'Players'}</button>
    </div>

    {#if round.winNotes || (round.hostNotes && !dual) || (!dual && zones.some((z) => z.hostNotes))}
      <div class="row">
        {#if round.winNotes}<span class="notes" title={round.winPublic ? 'Shown on the board' : dual ? 'Only you see this' : 'Not on the board (viewers can see it here, in this window)'}>🏆 {round.winNotes}{round.winPublic ? '' : dual ? ' (secret)' : ' (not on the board)'}</span>{/if}
        {#if round.hostNotes && !dual}<span class="notes">📝 {round.hostNotes}</span>{/if}
        {#if !dual}
          {#each zones.filter((z) => z.hostNotes) as z (z.id)}<span class="notes">🌀 {z.name}: 📝 {z.hostNotes}</span>{/each}
        {/if}
      </div>
    {/if}
    {#if showPlayers}
      <div class="cards">
        {#each session.players as pl (pl.id)}
          <PlayerCard
            {game}
            {session}
            player={pl}
            board={round}
            {bs}
            hide={!dual}
            {selected}
            ontoggle={() => (selected = selected.includes(pl.id) ? selected.filter((x) => x !== pl.id) : [...selected, pl.id])}
          />
        {/each}
      </div>
    {/if}

    <!-- Beside the stage: the turn's part at the column's foot, by the blue button (it stays in sight as the rest scrolls). -->
    {#if side && !boardEdit.on}
      {@render turnPart()}
    {/if}
  </div>
{/if}

<!-- The turn: its box (first line, the one slot or the ways, Steps, ◀ Back, 📍 Send to…), the round's own dice or wheel
     once rolled, a fork's ways, then the landing box. -->
{#snippet turnPart()}
  {#if round && bs}
    <div class="turn" data-turn-part>
      <div class="row move" data-turn-box>
        <!-- The first line: what to do next (one line, cut short where narrow: the whole of it in its tooltip). -->
        <span class="first" title={firstLine} data-turn-next>{firstLine}</span>
        {#if round.mover.kind === 'step'}
          <!-- One space per turn: the player picks which way. -->
          {#if !fork && stepWays.length}
            {#each stepWays as w (w)}
              <!-- (The only way on is Enter's, until they've moved.) -->
              <button class="good" class:ring={ring === 'turnslot' && stepWays.length === 1} onclick={() => move(1, w, turnId)}
                >→ {shown(w)}{#if stepWays.length === 1 && !moved} <kbd aria-hidden="true">⏎</kbd>{/if}</button
              >
            {/each}
          {/if}
        {:else if slot}
          <!-- The one slot: 🎲 Roll, then ▶ Move in the same place (ringed while it's what's next). -->
          <StepButton step={slot} ring={ring === 'turnslot'} />
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
                if (fork) return void hint(`${playerName(session, fork.playerId)} is at a fork: pick the way first`);
                move(steps);
                e.currentTarget.blur();
              }}
            />
          </label>
          <!-- (A negative count, typed or a wheel's "Back 2", moves back: the buttons say which way they go.) -->
          <button class="small" disabled={!steps || !!fork} onclick={() => move(-(steps ?? 0))}>{steps && steps < 0 ? '▶ Forward' : '◀ Back'} {steps ? Math.abs(steps) : ''}</button>
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
          {#each round.spaces as s (s.id)}<option value="s:{s.id}">{listNames.get(s.id)}</option>{/each}
          {#each round.zones as z (z.id)}<option value="z:{z.id}">🌀 {z.name}</option>{/each}
        </select>
      </div>

      <!-- The round's own dice or wheel, once rolled or spun: what they came to, under the turn they're for. -->
      {@render mover?.()}

      {#if fork && forkSpace}
        <div class="row fork" role="alert" bind:this={forkEl}>
          <b>{playerName(session, fork.playerId)} is at {shown(forkSpace.id)}: which way? ({Math.abs(fork.stepsLeft)} to go)</b>
          <span class="muted small">(or click the space on the stage)</span>
          {#each forkWays as n (n)}
            <button class="good" onclick={() => move(fork.stepsLeft, n)}>→ {shown(n)}</button>
          {/each}
        </div>
      {/if}

      {#if last && (passed.length || landed)}
        <!-- The landing box: the spaces passed and landed on, their buttons (in sight after each move: in one window under
             the stage the panel keeps one height, and this part scrolls). -->
        <div class="row acts" data-landing {@attach (el) => (void last, el.scrollIntoView({ block: 'nearest' }))}>
          {#each passed as s (s.id)}
            <span class="muted small">Passed {shown(s.id)}:</span>
            {#each s.onPass ?? [] as a (a.id)}<button class="small" onclick={() => run(s, a, last.playerId, 'pass')}>{actText(a, 'pass')}</button>{/each}
          {/each}
          {#if landed}
            <!-- Landing on a space counts as passing it too (landing on Start still pays), unless sent back onto it
                 (passed on the way there this turn, it's still owed). -->
            {@const passOn = last.back && !last.passed.includes(landed.id) ? [] : (landed.onPass ?? [])}
            <span class="small"
              >Landed on <b>{shown(landed.id)}</b>{!dual && unrevealed(bs, landed) ? ' (secret)' : ''}{passOn.length ? ' (counts as passing)' : ''}{landed.onLand?.length || passOn.length ? ':' : '.'}</span
            >
            {#each passOn as a (a.id)}<button class="small" onclick={() => run(landed, a, last.playerId, 'pass')}>{actText(a, 'pass')}</button>{/each}
            {#each landed.onLand ?? [] as a (a.id)}<button class="small" onclick={() => run(landed, a, last.playerId, 'land')}>{actText(a, 'land')}</button>{/each}
            {#if unrevealed(bs, landed)}<button class="small ghost" onclick={() => reveal(landed)}>👁 Reveal space</button>{/if}
            <!-- (One window: a secret space's note waits for 👁 Reveal space, as its name does.) -->
            {#if landed.hostNotes && !dual && !unrevealed(bs, landed)}<span class="notes">📝 {landed.hostNotes}</span>{/if}
          {/if}
        </div>
      {/if}
      <!-- A 🤫 card the landing's buttons offered (sent only by its 📤 Send), under them. -->
      <CardOffers {game} {session} {dual} at="land" />
    </div>
  {/if}
{/snippet}

<style>
  .bh {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .turn {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  /* Beside the stage: the box fills the column, its turn part at the foot, by the blue button, in sight as the rest
     scrolls (on the panel's own background, so what scrolls under it doesn't show through). */
  .bh.side {
    flex: 1 0 auto;
  }
  .bh.side > .turn {
    margin-top: auto;
    position: sticky;
    bottom: 0;
    z-index: 1;
    padding-top: 6px;
    background: var(--panel);
    box-shadow: 0 -6px 6px -6px rgba(0, 0, 0, 0.6);
  }
  /* The turn order: one line, ✎ Change at its end on the first row whatever the chips do. */
  .order-row {
    flex-wrap: nowrap;
    align-items: flex-start;
  }
  .order-row > .muted {
    flex-shrink: 0;
    line-height: 24px;
  }
  .order-row .body {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .seq {
    flex: 1 1 auto;
    min-width: 0;
    font-size: 12px;
    line-height: 24px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .change {
    flex-shrink: 0;
    margin-left: auto;
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
  /* The turn box's first line: the row's whole width, one line (cut short where narrow). */
  .first {
    flex: 1 0 100%;
    min-width: 0;
    font-weight: 600;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .fork {
    padding: 6px 8px;
    border: 1px solid var(--warn);
    border-radius: 8px;
  }
  /* The landing box. */
  .acts {
    padding: 4px 8px;
    border: 1px solid var(--accent);
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
