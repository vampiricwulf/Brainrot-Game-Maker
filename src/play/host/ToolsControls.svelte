<!-- Host controls for whatever tool overlay is on screen. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from '../../lib/app.svelte';
  import { textOn } from '../../lib/colors';
  import { overlayDoneAt, startTimer } from '../../lib/live';
  import type { Game, Outcome, Session } from '../../lib/model';
  import { addWheel, removeWheel, rollDice, spinWheel } from '../../lib/overlay';
  import { describeRoll } from '../../lib/tools';
  import ActionCard from './ActionCard.svelte';
  import WheelEdit from './WheelEdit.svelte';
  import ShopControls from './ShopControls.svelte';
  import { newId, PLAYER_WHEEL, type Action } from '../../lib/model';
  import { describeAction, needsPlayers, runAction } from '../../lib/actions';
  import { toast } from '../../lib/app.svelte';
  import { rpgNow } from '../rpg/hostops';
  import { setPicker } from '../../lib/toolset';

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
    if (o?.kind === 'dice' && o.roll) return o.roll.totalOutcome ?? o.roll.dice.find((d) => d.face?.scoreAction || d.face?.timerSeconds || d.face?.actions?.length)?.face;
    return undefined;
  });
  const resultText = $derived.by(() => {
    if (o?.kind === 'wheel' && o.spin && (o.result !== null || o.extra?.length))
      return [o.result !== null ? o.segments[o.result]?.label : '', ...(o.extra ?? []).map((w) => (w.result !== null ? w.segments[w.result]?.label : ''))]
        .filter(Boolean)
        .join(' · ');
    if (o?.kind === 'dice' && o.roll) return describeRoll(o.roll);
    return '';
  });
  const actionKey = $derived(o && 'nonce' in o ? `${o.nonce}-${o.kind === 'wheel' ? o.spin?.startedAt : o.kind === 'dice' ? o.startedAt : ''}` : '');
  const lastRoll = $derived(session.rollLog?.at(-1));
  /** This spin's roll-log entries (one per wheel spun together). */
  const spinRolls = $derived(o?.kind === 'wheel' && o.extra?.length ? (session.rollLog ?? []).slice(-(1 + o.extra.length)) : lastRoll ? [lastRoll] : []);
  /** The other wheels spun with this one, once they've landed. */
  const extraResults = $derived(
    o?.kind === 'wheel' ? (o.extra ?? []).flatMap((w) => (w.spin && w.result !== null && w.segments[w.result] ? [{ w, seg: w.segments[w.result] }] : [])) : [],
  );
  const removed = $derived(o?.kind === 'wheel' && o.wheelId ? (session.removedSegments?.[o.wheelId]?.length ?? 0) : 0);

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
    return picked ? [picked.id] : lastRoll?.playerIds?.length ? lastRoll.playerIds : fromWheel ? [fromWheel] : [];
  });

  /** A slice's action button: for the players it was for (see `chosen`), else the selected. `from` names it in the log. */
  function runOutcome(a: Action, from: string): void {
    if (needsPlayers(a) && !chosen.length && !selected.length) return void toast('Tag who it was for first');
    const { world, st } = rpgNow(game, session);
    toast(runAction({ game, session, live: app.live, world, st, selected, chosen }, a, `${from}: ${describeAction(game, a)}`), 3000);
  }

  function tag(id: string): void {
    if (!o || (o.kind !== 'wheel' && o.kind !== 'dice') || !lastRoll) return;
    const cur = lastRoll.playerIds ?? [];
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    // Every wheel spun together goes in the log for the same players.
    for (const r of spinRolls) r.playerIds = next;
    o.tagged = next;
  }
</script>

{#if o}
  <div class="tc">
    <div class="row">
      {#if o.kind === 'wheel'}
        <b>🎡 {o.name}</b>
        <button class="primary" disabled={busy} onclick={() => spinWheel(app.live, session, game)} title="W">{o.spin ? 'Spin again' : 'Spin!'}</button>
        <button class="small" class:on={o.editing} aria-pressed={!!o.editing} onclick={() => (o.editing = !o.editing)} title="Turn slices off or change their chances for this spin">
          ✎ Edit wheel{o.pool ? ' (edited)' : ''}
        </button>
        {#each o.extra ?? [] as w (w.key)}
          <span class="xw" class:on={editExtra === w.key}>
            ＋ {w.name}{w.pool ? ' (edited)' : ''}
            <button
              class="ghost tiny"
              aria-pressed={editExtra === w.key}
              onclick={() => (editExtra = editExtra === w.key ? null : w.key)}
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
        {#if removed}
          <button class="ghost small" onclick={() => o.wheelId && session.removedSegments && (session.removedSegments[o.wheelId] = [])}>
            Restore {removed} used slice{removed === 1 ? '' : 's'}
          </button>
        {/if}
      {:else if o.kind === 'dice'}
        <b>🎲 {o.name}</b>
        <button class="primary" disabled={busy} onclick={() => rollDice(app.live, session, o.preset)} title="D">{o.roll ? 'Roll again' : 'Roll!'}</button>
      {:else if o.kind === 'rolloff'}
        <b>{o.purpose === 'tiebreak' ? '🏆 Tiebreaker roll-off' : '🏁 Who goes first'}</b>
        {#if !busy}
          <span>{session.players.find((p) => p.id === o.winner)?.name} {o.purpose === 'tiebreak' ? 'wins the game.' : 'picks first.'}</span>
        {:else}<span class="muted">Rolling…</span>{/if}
      {:else if o.kind === 'popup'}
        <b>🖼 {o.title ?? (o.answer ? 'Question' : 'Pop-up slide')}</b>
        {#if o.value}<span class="muted small">worth {o.value}</span>{/if}
        {#if o.answer}
          <button class:primary={!o.revealed} onclick={() => (o.revealed = !o.revealed)} title="R">{o.revealed ? '🙈 Hide answer' : '👁 Reveal answer'}</button>
        {/if}
      {:else if o.kind === 'sheet'}
        {@const i = session.players.findIndex((p) => p.id === o.playerId)}
        <b>📺 {session.players[i]?.name ?? 'Player'}'s sheet</b>
        <button class="small" disabled={i <= 0} onclick={() => (app.live.overlay = { kind: 'sheet', nonce: newId(), playerId: session.players[i - 1].id })}>◀</button>
        <button class="small" disabled={i >= session.players.length - 1} onclick={() => (app.live.overlay = { kind: 'sheet', nonce: newId(), playerId: session.players[i + 1].id })}>▶</button>
      {:else if o.kind === 'shop'}
        <b>🛒 {game.shops?.find((s) => s.id === o.shopId)?.name ?? 'Shop'}</b>
      {:else}
        <b>📊 Scoreboard on screen</b>
      {/if}
      <span class="spacer"></span>
      {#if resultText && !busy}<span class="result">Result: <b>{resultText}</b></span>{/if}
      <!-- A shop has its own 🚪 Leave shop. -->
      {#if o.kind !== 'shop'}<button onclick={onclose} title="Esc">Close</button>{/if}
    </div>
    {#if outcome?.actions?.length && !busy && (o.kind === 'wheel' || o.kind === 'dice')}
      <div class="row">
        <span class="muted small">{outcome.label}:</span>
        {#each outcome.actions as a (a.id)}<button class="small" onclick={() => runOutcome(a, `${o.name} → ${outcome.label}`)}>{describeAction(game, a)}</button>{/each}
      </div>
    {/if}
    {#if !busy}
      {#each extraResults as r (r.w.key)}
        {#if r.seg.actions?.length || r.seg.scoreAction || r.seg.timerSeconds}
          <div class="row">
            <span class="muted small">{r.w.name} → {r.seg.label}:</span>
            {#each r.seg.actions ?? [] as a (a.id)}<button class="small" onclick={() => runOutcome(a, `${r.w.name} → ${r.seg.label}`)}>{describeAction(game, a)}</button>{/each}
            {#if r.seg.timerSeconds}<button class="small" onclick={() => startTimer(app.live, r.seg.timerSeconds!)}>⏱ Start {r.seg.timerSeconds}s</button>{/if}
          </div>
          {#if r.seg.scoreAction && !doneKeys.includes(`${actionKey}-${r.w.key}`)}
            {#key `${actionKey}-${r.w.key}`}
              <ActionCard
                action={r.seg.scoreAction}
                {game}
                {session}
                reason={`Wheel: ${r.w.name} → ${r.seg.label}`}
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
          {@const on = lastRoll?.playerIds?.includes(p.id)}
          <button
            class="chip"
            style:border-color={p.color}
            style:background={on ? p.color : undefined}
            style:color={on ? textOn(p.color) : undefined}
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
            reason={`${o.kind === 'wheel' ? 'Wheel' : 'Dice'}: ${o.name} → ${outcome.label}`}
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
    font-size: 10px;
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
