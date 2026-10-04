<!--
  Host controls for whatever tool overlay is on screen. Its main button (Spin!, Roll!, then Close) is the panel's main
  one, in the main cell: the card keeps the result, the actions and spinning or rolling again.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from '../../lib/app.svelte';
  import { textOn } from '../../lib/colors';
  import { overlayDoneAt, startTimer } from '../../lib/live';
  import type { Game, Outcome, Session } from '../../lib/model';
  import { addWheel, removeWheel, rollDice, spinWheel, wheelSpentUp } from '../../lib/overlay';
  import { isRespin, rollOutcome, rollResult, sliceLabel } from '../../lib/tools';
  import ActionCard from './ActionCard.svelte';
  import WheelEdit from './WheelEdit.svelte';
  import ShopControls from './ShopControls.svelte';
  import { newId, PLAYER_WHEEL, type Action } from '../../lib/model';
  import { describeAction, needsPlayers, runAction } from '../../lib/actions';
  import { toast } from '../../lib/app.svelte';
  import { rpgNow } from '../rpg/hostops';
  import { setPicker } from '../../lib/toolset';
  import { copyText, standingsText } from '../standings';
  import { currentClueInfo, toolOnlyClue } from '../../lib/session';
  import { boardNow, moverResult } from '../boardgame/bgops';
  import { offerNext } from './slots.svelte';

  let { game, session, selected = [], onclose }: { game: Game; session: Session; selected?: string[]; onclose: () => void } = $props();
  const o = $derived(app.live.overlay);
  let now = $state(Date.now());
  onMount(() => {
    const id = setInterval(() => (now = Date.now()), 200);
    return () => clearInterval(id);
  });
  const busy = $derived(!!o && now < overlayDoneAt(o));
  let actionDone = $state<string | null>(null);
  /** Score effects of the other wheels already applied or dismissed (by spin and wheel). */
  let doneKeys = $state<string[]>([]);
  /** The added wheel whose edit box is open (by its key). */
  let editExtra = $state<string | null>(null);
  const editedExtra = $derived(o?.kind === 'wheel' ? o.extra?.find((w) => w.key === editExtra) : undefined);

  const outcome = $derived.by((): Outcome | undefined => {
    if (o?.kind === 'wheel' && o.result !== null && o.spin) return o.segments[o.result];
    if (o?.kind === 'dice' && o.roll) return rollOutcome(o.roll).main;
    return undefined;
  });
  /** What the outcome is called: a slice left blank is "Slice 3". */
  const outcomeName = $derived(o?.kind === 'wheel' && o.result !== null ? sliceLabel(o.segments[o.result], o.result) : (outcome?.label ?? ''));
  const resultText = $derived.by(() => {
    if (o?.kind === 'wheel' && o.spin && (o.result !== null || o.extra?.length))
      return [o.result !== null ? sliceLabel(o.segments[o.result], o.result) : '', ...(o.extra ?? []).map((w) => (w.result !== null ? sliceLabel(w.segments[w.result], w.result) : ''))]
        .filter(Boolean)
        .join(' · ');
    if (o?.kind === 'dice' && o.roll) return rollResult(o.roll);
    return '';
  });
  const actionKey = $derived(o && 'nonce' in o ? `${o.nonce}-${o.kind === 'wheel' ? o.spin?.startedAt : o.kind === 'dice' ? o.startedAt : ''}` : '');
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
    toast(runAction({ game, session, live: app.live, world, st, selected, chosen }, a, `${from}: ${describeAction(game, a)}`), 3000);
  }

  /** The wheel landed on a "Spin again" slice: spinning again is the main button. */
  const again = $derived(o?.kind === 'wheel' && !!o.spin && o.result !== null && isRespin(o.segments[o.result]));
  /** The wheel landed or the dice came up: Close is the main button now, and spinning or rolling again is secondary. */
  const landed = $derived(!busy && ((o?.kind === 'wheel' && !!o.spin) || (o?.kind === 'dice' && !!o.roll)));
  /** A wheel/dice tile with nothing to ask, showing its own tool: closing it goes back to the board (the tile is done). */
  const tileDone = $derived.by(() => {
    const info = session.phase === 'clue' ? currentClueInfo(session, game) : undefined;
    return !!info && !!o && toolOnlyClue(info.clue) && o.kind === info.clue.type;
  });

  // The main button: spin or roll until it's done, then close (a question pop-up reveals its answer first). A shop has its
  // own 🚪 Leave shop.
  offerNext('tool', () => {
    if (!o || o.kind === 'shop') return null;
    // (A spent wheel can't spin: Close it, or Restore its slices in the card.)
    if (o.kind === 'wheel' && !landed && !spent)
      return {
        label: o.spin ? 'Spin again' : 'Spin!',
        key: 'W',
        disabled: busy,
        run: () => spinWheel(app.live, session, game),
      };
    if (o.kind === 'wheel' && landed && again && !spent) return { label: '↻ Spin again', key: 'W', run: () => spinWheel(app.live, session, game) };
    if (o.kind === 'dice' && !landed) return { label: o.roll ? 'Roll again' : 'Roll!', key: 'D', disabled: busy, run: () => rollDice(app.live, session, o.preset, o.mover) };
    if (o.kind === 'popup' && o.answer && !o.revealed) return { label: '👁 Reveal answer', key: 'R', run: () => (o.revealed = true) };
    // A board game's own roll (or spin) that came up: moving is next (▶ Move, Enter, which closes it), not Close.
    const { round } = boardNow(game, session);
    if (round && moverResult(game, round, o) !== null) return null;
    return { label: tileDone ? 'Close ▶ board' : 'Close', key: 'Esc', run: onclose };
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
        <!-- (Spin! is the main button until it lands, then Close is.) -->
        {#if landed && !again}<button onclick={() => spinWheel(app.live, session, game)} disabled={spent} title={spent ? 'Every slice has landed: Restore them to spin again' : 'W'}>Spin again</button>{/if}
        <button class="small" class:on={o.editing} aria-pressed={!!o.editing} onclick={() => ((o.editing = !o.editing), o.editing && (editExtra = null))} title="Turn slices off or change their chances for this spin">
          ✎ Edit wheel{o.pool ? ' (edited)' : ''}
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
          aria-label="Spin another wheel too"
          disabled={busy}
          title="Spin several wheels at once"
          onchange={(e) => {
            const id = e.currentTarget.value;
            e.currentTarget.value = '';
            e.currentTarget.blur();
            if (id) addWheel(app.live, session, game, id);
          }}
        >
          <option value="">＋ Spin another wheel too…</option>
          {#each game.wheels as w (w.id)}<option value={w.id}>{w.name}</option>{/each}
          <option value={PLAYER_WHEEL}>🎯 Pick a player</option>
        </select>
        {#if spent && !busy}<span class="warn small" role="status">Every slice has landed: Restore to spin again</span>
        {:else if again && landed}<span class="small" role="status">↻ It landed on {outcomeName}: spin again (W)</span>{/if}
        {#if removed}
          <button class="ghost small" onclick={() => o.wheelId && session.removedSegments && (session.removedSegments[o.wheelId] = [])}>
            Restore {removed} used slice{removed === 1 ? '' : 's'}
          </button>
        {/if}
      {:else if o.kind === 'dice'}
        <b>🎲 {o.name}</b>
        {#if landed}<button onclick={() => rollDice(app.live, session, o.preset, o.mover)} title="D">Roll again</button>{/if}
      {:else if o.kind === 'rolloff'}
        <b>{o.purpose === 'tiebreak' ? '🏆 Tiebreaker roll-off' : o.purpose === 'buzz' ? '🎲 Buzzer tie' : '🏁 Who goes first'}</b>
        {#if !busy && o.purpose === 'buzz'}
          <span>Answering order: {o.ranking.map((id) => session.players.find((p) => p.id === id)?.name ?? '?').join(' → ')}</span>
        {:else if !busy}
          <span>{session.players.find((p) => p.id === o.winner)?.name} {o.purpose === 'tiebreak' ? 'wins the game.' : 'picks first.'}</span>
        {:else}<span class="muted">Rolling…</span>{/if}
      {:else if o.kind === 'popup'}
        <b>🖼 {o.title ?? (o.answer ? 'Question' : 'Pop-up slide')}</b>
        {#if o.value}<span class="muted small">worth {o.value}</span>{/if}
        {#if o.answer && o.revealed}
          <button onclick={() => (o.revealed = false)} title="R">🙈 Hide answer</button>
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
        <button class="small" onclick={() => copyText(standingsText(game, session), 'Standings copied: paste them in chat')} title="The standings as one line of text, for chat">
          📋 Copy standings
        </button>
      {/if}
      <span class="spacer"></span>
      {#if resultText && !busy}<span class="result" title={resultText}>Result: <b>{resultText}</b></span>{/if}
      <!-- Before it's spun or rolled: a way out without (Spin! / Roll! is the main button; Esc can't, from a box). -->
      {#if (o.kind === 'wheel' || o.kind === 'dice') && !landed && !busy}
        <button class="small ghost" onclick={onclose} title="Close it without {o.kind === 'wheel' ? 'spinning' : 'rolling'}">✕ Close</button>
      {/if}
    </div>
    {#if outcome?.actions?.length && !busy && (o.kind === 'wheel' || o.kind === 'dice')}
      <div class="row">
        <span class="muted small">{outcomeName}:</span>
        {#each outcome.actions as a (a.id)}<button class="small" onclick={() => runOutcome(a, `${o.name} → ${outcomeName}`)}>{describeAction(game, a)}</button>{/each}
      </div>
    {/if}
    {#if !busy}
      {#each otherFaces as f (f.i)}
        {@const label = f.face.label || `Die ${f.i + 1}`}
        {@const diceName = o.kind === 'dice' ? o.name : ''}
        <div class="row">
          <span class="muted small">Die {f.i + 1} → {label}:</span>
          {#each f.face.actions ?? [] as a (a.id)}<button class="small" onclick={() => runOutcome(a, `${diceName} → ${label}`)}>{describeAction(game, a)}</button>{/each}
          {#if f.face.timerSeconds}<button class="small" onclick={() => startTimer(app.live, f.face.timerSeconds!)}>⏱ Start {f.face.timerSeconds}s</button>{/if}
        </div>
        {#if f.face.scoreAction && !doneKeys.includes(`${actionKey}-die${f.i}`)}
          {#key `${actionKey}-die${f.i}`}
            <ActionCard
              action={f.face.scoreAction}
              {game}
              {session}
              reason={`Dice: ${diceName} → ${label}`}
              rollTotal={o.kind === 'dice' ? (o.roll?.total ?? 0) : 0}
              defaultTargets={chosen}
              ondone={() => (doneKeys = [...doneKeys, `${actionKey}-die${f.i}`])}
            />
          {/key}
        {/if}
      {/each}
      {#each extraResults as r (r.w.key)}
        {@const label = sliceLabel(r.seg, r.w.result ?? 0)}
        {#if r.seg.actions?.length || r.seg.scoreAction || r.seg.timerSeconds}
          <div class="row">
            <span class="muted small">{r.w.name} → {label}:</span>
            {#each r.seg.actions ?? [] as a (a.id)}<button class="small" onclick={() => runOutcome(a, `${r.w.name} → ${label}`)}>{describeAction(game, a)}</button>{/each}
            {#if r.seg.timerSeconds}<button class="small" onclick={() => startTimer(app.live, r.seg.timerSeconds!)}>⏱ Start {r.seg.timerSeconds}s</button>{/if}
          </div>
          {#if r.seg.scoreAction && !doneKeys.includes(`${actionKey}-${r.w.key}`)}
            {#key `${actionKey}-${r.w.key}`}
              <ActionCard
                action={r.seg.scoreAction}
                {game}
                {session}
                reason={`Wheel: ${r.w.name} → ${label}`}
                rollTotal={0}
                defaultTargets={chosen}
                ondone={() => (doneKeys = [...doneKeys, `${actionKey}-${r.w.key}`])}
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
    {#if picked && !busy}
      <div class="row">
        {#if session.currentPickerId === picked.id}
          <span class="muted small">★ {picked.name} picks the next clue.</span>
        {:else}
          <button class="small" onclick={() => setPicker(session, picked.id)} title="Mark them as the player who picks the next clue">
            ★ Make {picked.name} the picker
          </button>
        {/if}
      </div>
    {:else if (o.kind === 'wheel' || o.kind === 'dice') && resultText && !busy && !(o.kind === 'wheel' && o.players)}
      <div class="row">
        <span class="muted small">This was for (optional, goes in the roll log):</span>
        {#each session.players as p (p.id)}
          {@const on = tagRoll?.playerIds?.includes(p.id)}
          <button
            class="chip"
            style:border-color={p.color}
            style:background={on ? p.color : undefined}
            style:color={on ? textOn(p.color) : undefined}
            aria-pressed={!!on}
            onclick={() => tag(p.id)}>{p.name}</button>
        {/each}
        {#if outcome?.timerSeconds}
          <button class="small" onclick={() => startTimer(app.live, outcome!.timerSeconds!)}>⏱ Start {outcome.timerSeconds}s</button>
        {/if}
      </div>
      {#if outcome?.scoreAction && actionDone !== actionKey}
        {#key actionKey}
          <ActionCard
            action={outcome.scoreAction}
            {game}
            {session}
            reason={`${o.kind === 'wheel' ? 'Wheel' : 'Dice'}: ${o.name} → ${outcomeName}`}
            rollTotal={o.kind === 'dice' ? (o.roll?.total ?? 0) : 0}
            defaultTargets={chosen}
            ondone={() => (actionDone = actionKey)}
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
  .result {
    max-width: 50%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
