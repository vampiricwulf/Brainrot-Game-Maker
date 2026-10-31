<!--
  Host controls for whatever tool overlay is on screen, in fixed places on its first row: its name, the spin or roll
  (Spin!, greyed while it turns, then Spin again; Roll!, then Roll again), ✎ Edit wheel and ＋ Spin another wheel too…,
  the result, and a way to close it last, in every state. The panel's main button copies the next step (Spin!, then
  Close): the box shows that same step, with the same words and key. Then the result's actions and score cards.
-->
<script lang="ts">
  import { onDestroy, onMount, tick, untrack } from 'svelte';
  import { app } from '../../lib/app.svelte';
  import { textOn } from '../../lib/colors';
  import { overlayDoneAt, startTimer, tileToolUp } from '../../lib/live';
  import type { Game, Outcome, ScoreEvent, Session } from '../../lib/model';
  import { addWheel, cardDone as isCardDone, cardsKey, removeWheel, rollDice, scoreCardsLeft, spinSegments, spinWheel, wheelEdited, wheelSpentUp } from '../../lib/overlay';
  import { rescued } from '../../lib/focusrescue';
  import { faceText, isRespin, outcomeText, rollOutcome, rollResult, sliceLabel } from '../../lib/tools';
  import ActionCard from './ActionCard.svelte';
  import WheelEdit from './WheelEdit.svelte';
  import ShopControls from './ShopControls.svelte';
  import { newId, PLAYER_WHEEL, type Action } from '../../lib/model';
  import { describeAction, needsPlayers, runAction } from '../../lib/actions';
  import { teamsOn } from '../../lib/buzz';
  import { buzzerOn } from '../../lib/remote.svelte';
  import { toast } from '../../lib/app.svelte';
  import { rpgNow } from '../rpg/hostops';
  import { setPicker } from '../../lib/toolset';
  import { copyText, standingsText } from '../standings';
  import { currentClueInfo, toolOnlyClue } from '../../lib/session';
  import { boardNow, moverResult } from '../boardgame/bgops';
  import { offerMenu, offerNext, step, type NextAction } from './slots.svelte';
  import { stepItem, type StageItem } from './stagemenu';
  import { VERBS } from './verbs';
  import StepButton from './StepButton.svelte';
  import { oneShot } from '../../lib/oneshot';
  import { offerIn } from './offered.svelte';
  import { announce } from '../../lib/announce';

  let { game, session, selected = [], onclose }: { game: Game; session: Session; selected?: string[]; onclose: () => void } = $props();
  /** Each player is a team: the 🎯 wheel picks a team. */
  const teams = $derived(buzzerOn(game.settings) && teamsOn(game.settings));
  const o = $derived(app.live.overlay);
  let now = $state(Date.now());
  onMount(() => {
    const id = setInterval(() => (now = Date.now()), 200);
    return () => clearInterval(id);
  });
  const busy = $derived(!!o && now < overlayDoneAt(o));
  /** A score card dealt with (see overlay.ts: closing the tool asks first while one isn't). */
  const cardDone = (key: string): boolean => isCardDone(o, session, key);
  /** A wheel or dice tile's own wheel or dice: its clue id. */
  const ownTile = $derived.by(() => {
    const info = session.phase === 'clue' ? currentClueInfo(session, game) : undefined;
    return info && tileToolUp(app.live, info.clue) ? info.clue.id : undefined;
  });
  /** The points it gave (`given`) go down as its tile's: ↩ Put back (keep tile) then waits for an Undo, as after an award. */
  function tileGave(tile: string | undefined, given: (e: ScoreEvent) => boolean): void {
    if (tile) for (const e of session.scoreLog) if (!e.clueId && given(e)) e.toolTile = tile;
  }
  const finish = (key: string) => (applied: boolean, batch?: string) => {
    if (o?.kind === 'wheel' || o?.kind === 'dice') o.cardsDone = { ...o.cardsDone, [key]: applied && batch ? batch : true };
    if (applied && batch) tileGave(ownTile, (e) => e.batchId === batch);
  };
  /** The added wheel whose edit box is open (by its key). */
  let editExtra = $state<string | null>(null);
  const editedExtra = $derived(o?.kind === 'wheel' ? o.extra?.find((w) => w.key === editExtra) : undefined);

  const outcome = $derived.by((): Outcome | undefined => {
    if (o?.kind === 'wheel' && o.result !== null && o.spin) return o.segments[o.result];
    if (o?.kind === 'dice' && o.roll) return rollOutcome(o.roll).main;
    return undefined;
  });
  /** What the outcome is called: a slice left blank is "Slice 3", a die face left blank its number. */
  const outcomeName = $derived(
    o?.kind === 'wheel' && o.result !== null ? sliceLabel(o.segments[o.result], o.result) : o?.kind === 'dice' && o.roll ? outcomeText(o.roll) : '',
  );
  const resultText = $derived.by(() => {
    if (o?.kind === 'wheel' && o.spin && (o.result !== null || o.extra?.length))
      return [o.result !== null ? sliceLabel(o.segments[o.result], o.result) : '', ...(o.extra ?? []).map((w) => (w.result !== null ? sliceLabel(w.segments[w.result], w.result) : ''))]
        .filter(Boolean)
        .join(' · ');
    if (o?.kind === 'dice' && o.roll) return rollResult(o.roll);
    return '';
  });
  const actionKey = $derived(o ? cardsKey(o) : '');
  const lastRoll = $derived(session.rollLog?.at(-1));
  /** This spin's roll-log entries (one per wheel spun together: a spent one, or one added since, didn't spin). */
  const spunExtras = $derived(o?.kind === 'wheel' && o.spin ? (o.extra ?? []).filter((w) => w.spin && w.spin.startedAt >= o.spin!.startedAt).length : 0);
  const spinRolls = $derived(spunExtras ? (session.rollLog ?? []).slice(-(1 + spunExtras)) : lastRoll ? [lastRoll] : []);
  /** The spin's entry the "This was for" chips show and set (not a 🎯 Pick a player wheel's, whose result is a player). */
  const tagRoll = $derived([...spinRolls].reverse().find((r) => !r.picked) ?? lastRoll);
  /** The other dice whose faces have effects (the first one's is `outcome`): each gets its buttons and score card. */
  const otherFaces = $derived(o?.kind === 'dice' && o.roll ? rollOutcome(o.roll).others : []);
  /** The other wheels spun with this one, once they've landed. */
  const extraResults = $derived(
    o?.kind === 'wheel' ? (o.extra ?? []).flatMap((w) => (w.spin && w.result !== null && w.segments[w.result] ? [{ w, seg: w.segments[w.result] }] : [])) : [],
  );
  /** Slices that landed and are off the wheel (not ones deleted in the editor since, nor any once it isn't "land once"). */
  const removed = $derived.by(() => {
    if (o?.kind !== 'wheel' || !o.wheelId) return 0;
    const w = game.wheels.find((x) => x.id === o.wheelId);
    if (!w?.removeAfterLanding) return 0;
    const ids = new Set(w.segments.map((s) => s.id));
    return (session.removedSegments?.[o.wheelId] ?? []).filter((id) => ids.has(id)).length;
  });
  /** A "land once" wheel with every slice landed: no spin until they're restored (it would start over unannounced). */
  const spent = $derived(o?.kind === 'wheel' && wheelSpentUp(o, session, game));

  /** The player the "Pick a player" wheel landed on. */
  const picked = $derived(
    o?.kind === 'wheel' && o.players && o.result !== null && o.spin ? session.players.find((p) => p.id === o.segments[o.result!]?.id) : undefined,
  );

  /**
   * Who this spin was for: the player the player wheel picked, else the players tagged, else the player a 🎯 wheel
   * spun with it landed on. Every effect of the spin (slice actions, score cards) starts with them.
   */
  const chosen = $derived.by(() => {
    const fromWheel = extraResults.find((r) => r.w.players)?.seg.id;
    return picked ? [picked.id] : tagRoll?.playerIds?.length ? tagRoll.playerIds : fromWheel ? [fromWheel] : [];
  });

  /** A slice's action button: for the players it was for (see `chosen`), else the selected. `from` names it in the log. */
  function runOutcome(a: Action, from: string): void {
    if (needsPlayers(a) && !chosen.length && !selected.length) return void toast('Tag who it was for first');
    const { world, st } = rpgNow(game, session);
    // (Its tile and the score log before it ran: the action can put something else up in the wheel's place.)
    const tile = ownTile;
    const before = new Set(session.scoreLog.map((e) => e.id));
    toast(runAction({ game, session, live: app.live, world, st, selected, chosen, teams, offerCard: offerIn(session) }, a, `${from}: ${describeAction(game, a, undefined, teams)}`), 3000);
    tileGave(tile, (e) => !before.has(e.id));
    // The button can go with what it did (a question pop-up replaces the wheel): the keys go to the main button, not to
    // the Amount box, where R, Esc and N mean nothing.
    void tick().then(() => {
      const f = document.activeElement;
      if (!f || f === document.body) document.querySelector<HTMLElement>('.panel [data-next]:not(:disabled)')?.focus({ preventScroll: true });
    });
  }

  /** Who won the roll-off, once it's rolled: what it did (the board's picker, who goes first, the win, the answer order). */
  const rolloffText = $derived.by(() => {
    if (o?.kind !== 'rolloff' || busy) return '';
    const name = (id: string) => session.players.find((p) => p.id === id)?.name ?? '?';
    if (o.purpose === 'buzz') return `Answering order: ${o.ranking.map(name).join(', ')}`;
    return `${name(o.winner)} ${o.purpose === 'tiebreak' ? 'wins the game' : session.phase === 'board' || session.phase === 'clue' ? 'picks first' : 'goes first'}`;
  });
  // Screen readers hear how it landed (on the stage and here, not in the status line), once it has.
  const landedSaid = $derived(rolloffText || (resultText && !busy ? `Result: ${resultText}` : ''));
  $effect(() => {
    if (landedSaid) announce(landedSaid);
  });

  /** The wheel landed on a "Spin again" slice: spinning again is the main button. */
  const again = $derived(o?.kind === 'wheel' && !!o.spin && o.result !== null && isRespin(o.segments[o.result]));
  /** The wheel landed or the dice came up: Close is the main button now, and spinning or rolling again is secondary. */
  const landed = $derived(!busy && ((o?.kind === 'wheel' && !!o.spin) || (o?.kind === 'dice' && !!o.roll)));
  /**
   * It landed, a score card went (confirmed or skipped), or it closed: the keys go on to the main button (Close, Close ▶
   * board, 👁 Reveal answer), not stay on the side button they fell to while Spin! was off or the card's button went.
   * (Never from a button or box the host chose.)
   */
  function keysToMain(): void {
    void tick().then(() => {
      const a = document.activeElement;
      if (a && a !== document.body && !(rescued() && a.closest('.panel'))) return;
      document.querySelector<HTMLElement>('.panel [data-next]:not(:disabled)')?.focus({ preventScroll: true });
    });
  }
  $effect(() => {
    if (landed) untrack(keysToMain);
  });
  const cardsLeft = $derived(scoreCardsLeft(o, session, now).length);
  let cardsBefore = 0;
  $effect(() => {
    const n = cardsLeft;
    if (n < cardsBefore) untrack(keysToMain);
    cardsBefore = n;
  });
  onDestroy(keysToMain);

  /** A wheel/dice tile with nothing to ask, showing its own tool: closing it goes back to the board (the tile is done). */
  const tileDone = $derived.by(() => {
    const info = session.phase === 'clue' ? currentClueInfo(session, game) : undefined;
    return !!info && !!o && toolOnlyClue(info.clue) && o.kind === info.clue.type;
  });

  /**
   * A board game's own roll (or its movement wheel): its turn box rolls again (🎲 Roll), and it's the turn player's, so
   * the box here has no Roll again nor "This was for".
   */
  const boardMover = $derived.by(() => {
    const { round } = boardNow(game, session);
    return !!round && ((o?.kind === 'dice' && !!o.mover) || (o?.kind === 'wheel' && round.mover.kind === 'wheel' && o.wheelId === round.mover.wheel));
  });
  const spin = () => spinWheel(app.live, session, game);
  const roll = () => o?.kind === 'dice' && rollDice(app.live, session, o.preset, o.mover);

  const closeStep = $derived(step(tileDone ? VERBS.closeToolBoard : VERBS.closeTool, onclose));
  /** A 🤝 partner clue's wheel (or its describer wheel): the 🤝 box spins it again, the blue button's Next ▶ closes it. */
  const partnerWheel = $derived(o?.kind === 'wheel' && !!o.partnerFor);
  // The main button: spin or roll until it's done, then close (a question pop-up reveals its answer first). A shop has its
  // own 🚪 Leave shop.
  const next = $derived.by((): NextAction | null => {
    // (A shop has its 🚪 Leave shop; the partner wheel is the blue button's: Next ▶ puts it away, the pair on PARTNER UP!.)
    if (!o || o.kind === 'shop' || partnerWheel) return null;
    // (A spent wheel can't spin: Close it, or Restore its slices in the card.)
    if (o.kind === 'wheel' && !landed && !spent) return step(o.spin ? VERBS.spinning : VERBS.spin, spin, { disabled: busy });
    if (o.kind === 'wheel' && landed && again && !spent) return step(VERBS.spinAgain, spin);
    if (o.kind === 'dice' && !landed) return step(o.roll ? VERBS.rollAgain : VERBS.roll, roll, { disabled: busy });
    if (o.kind === 'popup' && o.answer && !o.revealed) return step(VERBS.reveal, () => (o.revealed = true), { title: undefined });
    // A board game's own roll (or spin) that came up: moving is next (▶ Move, Enter, which closes it), not Close.
    const { round } = boardNow(game, session);
    if (round && moverResult(game, round, o) !== null) return null;
    return closeStep;
  });
  offerNext('tool', () => next);

  /**
   * The spin or roll's place in the box, after its name: the main button's step while that's the spin (Spin!, greyed
   * while it turns; ↻ Spin again on a "Spin again" slice), else spinning or rolling again (W, D). None for the partner's
   * wheel (the 🤝 box spins it again) or a board game's own roll.
   */
  const spinPlace = $derived.by((): NextAction | null => {
    if (o?.kind === 'wheel' && !o.partnerFor && !boardMover) {
      if (next && next !== closeStep) return next;
      const why = spent ? { disabled: true, title: 'Every slice has landed: Restore them to spin again' } : {};
      return step(!o.spin ? VERBS.spin : again ? VERBS.spinAgain : VERBS.spinning, spin, why);
    }
    if (o?.kind === 'dice' && !boardMover) return next && next !== closeStep ? next : step(VERBS.rollAgain, roll);
    return null;
  });
  /** A wheel or dice still turning waits for it to land to close (Esc says so); the roll-off and the partner's wheel don't. */
  const closeWaits = $derived(busy && ((o?.kind === 'wheel' && !o.partnerFor) || o?.kind === 'dice'));
  /** ✕ Close's tooltip, while closing isn't the main button's step. */
  const closeTitle = $derived.by(() => {
    if (closeWaits) return `Still ${o?.kind === 'wheel' ? 'spinning' : 'rolling'}: wait for it to land`;
    if ((o?.kind === 'wheel' && !o.spin) || (o?.kind === 'dice' && !o.roll))
      return `Close it without ${o.kind === 'wheel' ? 'spinning' : 'rolling'}${tileDone && !spent ? ' (the tile stays on the board)' : ''}`;
    if (o?.kind === 'popup' && o.answer && !o.revealed) return 'Close it without showing the answer';
    if (boardMover && !next) return 'Close it without moving';
    return 'Esc';
  });

  /** ＋ Spin another wheel too…: its list (the stage's menu opens it). */
  let another = $state<HTMLSelectElement>();
  function pickAnother(): void {
    another?.focus();
    try {
      another?.showPicker();
    } catch {
      // (Where a page can't open it: the list has the keys, and ↓ or Space opens it.)
    }
  }
  // The stage's menu: the box's buttons in their order, the spin or roll first and the way out last.
  offerMenu('tool', () => {
    if (!o) return [];
    const out: StageItem[] = [];
    if (spinPlace) out.push(stepItem(spinPlace, o.kind === 'dice' ? 'roll' : 'spin'));
    if (o.kind === 'popup' && o.answer) out.push(o.revealed ? { id: 'reveal', label: VERBS.hide.label, keys: 'R', onclick: () => (o.revealed = false) } : stepItem(step(VERBS.reveal, () => (o.revealed = true)), 'reveal'));
    if (o.kind === 'wheel') {
      out.push({ label: '✎ Edit wheel', disabled: !!o.editing, hint: 'Turn slices off or change their chances for this spin', onclick: () => ((o.editing = true), (editExtra = null)) });
      out.push({ label: '＋ Spin another wheel too…', disabled: busy, onclick: pickAnother });
      if (removed && o.wheelId) {
        const id = o.wheelId;
        out.push({
          label: `Restore ${removed} used slice${removed === 1 ? '' : 's'}`,
          onclick: () => {
            if (!session.removedSegments) return;
            session.removedSegments[id] = [];
            for (const w of [o, ...(o.extra ?? [])]) if (w.wheelId === id && !w.spin) w.segments = spinSegments(w, session, game);
          },
        });
      }
    }
    if (picked && !busy && !(o.kind === 'wheel' && o.partnerFor) && session.currentPickerId !== picked.id) {
      const who = picked;
      out.push({ label: `★ Make ${who.name} the picker`, onclick: () => setPicker(session, who.id) });
    }
    if (o.kind === 'scoreboard') out.push({ label: '📋 Copy standings', onclick: () => copyText(standingsText(game, session), 'Standings copied: paste them in chat') });
    if (o.kind === 'shop') out.push({ id: 'close', label: '🚪 Leave shop', keys: 'Esc', onclick: () => (app.live.overlay = null) });
    else if (next === closeStep) out.push(stepItem(closeStep, 'close'));
    else out.push({ id: 'close', label: VERBS.closeToolBox.label, keys: 'Esc', disabled: closeWaits, hint: closeTitle, onclick: onclose });
    return out;
  });

  function tag(id: string): void {
    if (!o || (o.kind !== 'wheel' && o.kind !== 'dice') || !tagRoll) return;
    const cur = tagRoll.playerIds ?? [];
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    // Every wheel spun together goes in the log for the same players (a 🎯 wheel's keeps the player it picked).
    for (const r of spinRolls) if (!r.picked) r.playerIds = next;
    o.tagged = next;
  }
</script>

{#if o}
  <div class="tc" data-tool-controls>
    <div class="row">
      {#if o.kind === 'wheel'}
        <b>🎡 {o.name}</b>
        {#if spinPlace}<StepButton step={spinPlace} />{/if}
        <button class="small" class:on={o.editing} aria-pressed={!!o.editing} onclick={() => ((o.editing = !o.editing), o.editing && (editExtra = null))} title="Turn slices off or change their chances for this spin">
          ✎ Edit wheel{wheelEdited(o, session) ? ' (edited)' : ''}
        </button>
        {#each o.extra ?? [] as w (w.key)}
          <span class="xw" class:on={editExtra === w.key}>
            ＋ {w.name}{w.pool ? ' (edited)' : ''}
            <button
              class="ghost tiny"
              aria-pressed={editExtra === w.key}
              onclick={() => ((editExtra = editExtra === w.key ? null : w.key), editExtra && (o.editing = false))}
              aria-label="Edit {w.name} for this spin"
              title="Turn slices off or change their chances for this spin">✎</button
            >
            <button class="ghost tiny" disabled={busy} onclick={() => removeWheel(app.live, w.key)} aria-label="Stop spinning {w.name}">✕</button>
          </span>
        {/each}
        <select
          class="small"
          bind:this={another}
          aria-label="Spin another wheel too"
          disabled={busy}
          title="Spin several wheels at once"
          onchange={(e) => {
            const id = e.currentTarget.value;
            e.currentTarget.value = '';
            e.currentTarget.blur();
            if (id) addWheel(app.live, session, game, id, teams);
          }}
        >
          <option value="">＋ Spin another wheel too…</option>
          {#each game.wheels as w (w.id)}<option value={w.id}>{w.name}</option>{/each}
          <option value={PLAYER_WHEEL}>🎯 Pick a {teams ? 'team' : 'player'}</option>
        </select>
        {#if spent && !busy}<span class="warn small" role="status">Every slice has landed: Restore to spin again</span>
        {:else if again && landed}<span class="small" role="status">↻ It landed on {outcomeName}: spin again (W)</span>{/if}
        {#if removed}
          <button
            class="ghost small"
            onclick={() => {
              if (!o.wheelId || !session.removedSegments) return;
              session.removedSegments[o.wheelId] = [];
              // Back on the wheel on screen now, not only at the next spin (unless it's showing a result).
              for (const w of [o, ...(o.extra ?? [])]) if (w.wheelId === o.wheelId && !w.spin) w.segments = spinSegments(w, session, game);
            }}
          >
            Restore {removed} used slice{removed === 1 ? '' : 's'}
          </button>
        {/if}
      {:else if o.kind === 'dice'}
        <b>🎲 {o.name}</b>
        {#if spinPlace}<StepButton step={spinPlace} />{/if}
      {:else if o.kind === 'rolloff'}
        <b>{o.purpose === 'tiebreak' ? '🏆 Tiebreaker roll-off' : o.purpose === 'buzz' ? '🎲 Buzzer tie' : '🏁 Who goes first'}</b>
        {#if !busy && o.purpose === 'buzz'}
          <span>Answering order: {o.ranking.map((id) => session.players.find((p) => p.id === id)?.name ?? '?').join(' → ')}</span>
        {:else if !busy}
          <!-- (What it did: the board's picker, else, as viewers are told, who goes first; a board game's turn.) -->
          <span>{session.players.find((p) => p.id === o.winner)?.name} {o.purpose === 'tiebreak' ? 'wins the game.' : session.phase === 'board' || session.phase === 'clue' ? 'picks first.' : 'goes first.'}</span>
        {:else}<span class="muted">Rolling…</span>{/if}
      {:else if o.kind === 'popup'}
        <b>🖼 {o.title ?? (o.answer ? 'Question' : 'Pop-up slide')}</b>
        {#if o.value}<span class="muted small">worth {o.value}</span>{/if}
        {#if o.answer && o.revealed}
          <button onclick={() => (o.revealed = false)} title="R">🙈 Hide answer</button>
        {:else if next && next !== closeStep}
          <!-- (Its answer next: 👁 Reveal answer, as the main button.) -->
          <StepButton step={next} />
        {/if}
      {:else if o.kind === 'sheet'}
        {@const i = session.players.findIndex((p) => p.id === o.playerId)}
        <b>📺 {session.players[i]?.name ?? 'Player'}'s sheet</b>
        <button class="small" disabled={i <= 0} onclick={() => (app.live.overlay = { kind: 'sheet', nonce: newId(), playerId: session.players[i - 1].id })} aria-label="Previous player's sheet">◀</button>
        <button class="small" disabled={i >= session.players.length - 1} onclick={() => (app.live.overlay = { kind: 'sheet', nonce: newId(), playerId: session.players[i + 1].id })} aria-label="Next player's sheet">▶</button>
      {:else if o.kind === 'shop'}
        <b>🛒 {game.shops?.find((s) => s.id === o.shopId)?.name ?? 'Shop'}</b>
      {:else}
        <b>📊 Scoreboard on screen</b>
        {#if o.kind === 'scoreboard' && o.under}
          <span class="muted small">Close (or S) puts the {o.under.kind === 'rolloff' ? 'roll-off' : o.under.kind === 'popup' ? 'pop-up' : o.under.kind} back</span>
        {/if}
        <button class="small" onclick={() => copyText(standingsText(game, session), 'Standings copied: paste them in chat')} title="The standings as one line of text, for chat">
          📋 Copy standings
        </button>
      {/if}
      <span class="spacer"></span>
      {#if resultText && !busy}<span class="result" title={resultText}>Result: <b>{resultText}</b></span>{/if}
      <!-- The way out, last, in every state (a shop has its 🚪 Leave shop, the partner wheel the blue button's Next ▶):
           the main button's Close when that's next, else ✕ Close (before it's spun, say). -->
      {#if o.kind !== 'shop' && !partnerWheel}
        {#if next === closeStep}
          <StepButton step={closeStep} />
        {:else}
          <button use:oneShot onclick={onclose} disabled={closeWaits} title={closeTitle}>{VERBS.closeToolBox.label} <kbd aria-hidden="true">{VERBS.closeToolBox.key}</kbd></button>
        {/if}
      {/if}
    </div>
    {#if outcome?.actions?.length && !busy && (o.kind === 'wheel' || o.kind === 'dice')}
      <div class="row">
        <span class="muted small">{outcomeName}:</span>
        {#each outcome.actions as a (a.id)}<button class="small" onclick={() => runOutcome(a, `${o.name} → ${outcomeName}`)}>{describeAction(game, a, undefined, teams)}</button>{/each}
      </div>
    {/if}
    {#if !busy}
      {#each otherFaces as f (f.i)}
        {@const label = f.face.label.trim() || (o.kind === 'dice' && o.roll?.dice[f.i] ? faceText(o.roll.dice[f.i]) : `Die ${f.i + 1}`)}
        {@const diceName = o.kind === 'dice' ? o.name : ''}
        <div class="row">
          <span class="muted small">Die {f.i + 1} → {label}:</span>
          {#each f.face.actions ?? [] as a (a.id)}<button class="small" onclick={() => runOutcome(a, `${diceName} → ${label}`)}>{describeAction(game, a, undefined, teams)}</button>{/each}
          {#if f.face.timerSeconds}<button class="small" onclick={() => startTimer(app.live, f.face.timerSeconds!)}>⏱ Start {f.face.timerSeconds}s</button>{/if}
        </div>
        {#if f.face.scoreAction && !cardDone(`${actionKey}-die${f.i}`)}
          {#key `${actionKey}-die${f.i}`}
            <ActionCard
              action={f.face.scoreAction}
              {game}
              {session}
              reason={`Dice: ${diceName} → ${label}`}
              rollTotal={o.kind === 'dice' ? (o.roll?.total ?? 0) : 0}
              defaultTargets={chosen}
              ondone={finish(`${actionKey}-die${f.i}`)}
            />
          {/key}
        {/if}
      {/each}
      {#each extraResults as r (r.w.key)}
        {@const label = sliceLabel(r.seg, r.w.result ?? 0)}
        {#if r.seg.actions?.length || r.seg.scoreAction || r.seg.timerSeconds}
          <div class="row">
            <span class="muted small">{r.w.name} → {label}:</span>
            {#each r.seg.actions ?? [] as a (a.id)}<button class="small" onclick={() => runOutcome(a, `${r.w.name} → ${label}`)}>{describeAction(game, a, undefined, teams)}</button>{/each}
            {#if r.seg.timerSeconds}<button class="small" onclick={() => startTimer(app.live, r.seg.timerSeconds!)}>⏱ Start {r.seg.timerSeconds}s</button>{/if}
          </div>
          {#if r.seg.scoreAction && !cardDone(`${actionKey}-${r.w.key}`)}
            {#key `${actionKey}-${r.w.key}`}
              <ActionCard
                action={r.seg.scoreAction}
                {game}
                {session}
                reason={`Wheel: ${r.w.name} → ${label}`}
                rollTotal={0}
                defaultTargets={chosen}
                ondone={finish(`${actionKey}-${r.w.key}`)}
              />
            {/key}
          {/if}
        {/if}
      {/each}
    {/if}
    {#if o.kind === 'shop'}
      <ShopControls {game} {session} {selected} />
    {/if}
    {#if o.kind === 'wheel' && o.editing}
      {#key o.nonce}<WheelEdit {o} {game} {session} disabled={busy} />{/key}
    {/if}
    {#if o.kind === 'wheel' && editedExtra}
      <div class="muted small">Editing <b>{editedExtra.name}</b>:</div>
      {#key editedExtra.key}<WheelEdit o={editedExtra} {game} {session} disabled={busy} />{/key}
    {/if}
    <!-- (Not the partner wheel's: who it landed on is the partner clue's partner, not the board's picker.) -->
    {#if picked && !busy && !(o.kind === 'wheel' && o.partnerFor)}
      <div class="row">
        {#if session.currentPickerId === picked.id}
          <span class="muted small">★ {picked.name} picks the next clue.</span>
        {:else}
          <button class="small" onclick={() => setPicker(session, picked.id)} title="Mark them as the player who picks the next clue" data-player-id={picked.id}>
            ★ Make {picked.name} the picker
          </button>
        {/if}
      </div>
    {:else if (o.kind === 'wheel' || o.kind === 'dice') && resultText && !busy && !(o.kind === 'wheel' && (o.players || o.members))}
      <!-- (A board game's own roll is the turn player's: the log says so already.) -->
      {#if !boardMover || outcome?.timerSeconds}
        <div class="row">
          {#if !boardMover}
            <span class="muted small">This was for (optional, goes in the roll log):</span>
            {#each session.players as p (p.id)}
              {@const on = tagRoll?.playerIds?.includes(p.id)}
              <button
                class="chip"
                style:border-color={p.color}
                style:background={on ? p.color : undefined}
                style:color={on ? textOn(p.color) : undefined}
                aria-pressed={!!on}
                data-player-id={p.id}
                onclick={() => tag(p.id)}>{p.name}</button>
            {/each}
          {/if}
          {#if outcome?.timerSeconds}
            <button class="small" onclick={() => startTimer(app.live, outcome!.timerSeconds!)}>⏱ Start {outcome.timerSeconds}s</button>
          {/if}
        </div>
      {/if}
      {#if outcome?.scoreAction && !cardDone(actionKey)}
        {#key actionKey}
          <ActionCard
            action={outcome.scoreAction}
            {game}
            {session}
            reason={`${o.kind === 'wheel' ? 'Wheel' : 'Dice'}: ${o.name} → ${outcomeName}`}
            rollTotal={o.kind === 'dice' ? (o.roll?.total ?? 0) : 0}
            defaultTargets={chosen}
            ondone={finish(actionKey)}
          />
        {/key}
      {/if}
    {/if}
  </div>
{/if}

<style>
  .tc {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    border: 1px solid var(--accent);
    border-radius: 8px;
    background: rgba(79, 124, 255, 0.08);
  }
  .chip {
    border-width: 2px;
    padding: 2px 8px;
    font-size: 12px;
  }
  .small {
    font-size: 12px;
  }
  .warn {
    color: var(--warn);
  }
  .xw.on {
    outline: 1px solid var(--accent);
  }
  .xw {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 1px 2px 1px 8px;
    border-radius: 6px;
    background: var(--panel-2);
    font-size: 12px;
  }
  .tiny {
    font-size: 12px;
    padding: 0 4px;
  }
  select.small {
    padding: 2px 6px;
  }
  kbd {
    font: 11px/1 ui-monospace, monospace;
    padding: 1px 4px;
    margin-left: 4px;
    border: 1px solid currentColor;
    border-radius: 4px;
    opacity: 0.75;
  }
  .result {
    max-width: 50%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
