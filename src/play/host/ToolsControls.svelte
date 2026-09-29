<!-- Host controls for whatever tool overlay is on screen. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from '../../lib/app.svelte';
  import { textOn } from '../../lib/colors';
  import { overlayDoneAt, startTimer } from '../../lib/live';
  import type { Game, Outcome, Session } from '../../lib/model';
  import { rollDice, spinWheel } from '../../lib/overlay';
  import { describeRoll } from '../../lib/tools';
  import ActionCard from './ActionCard.svelte';
  import WheelEdit from './WheelEdit.svelte';

  let { game, session, onclose }: { game: Game; session: Session; onclose: () => void } = $props();
  const o = $derived(app.live.overlay);
  let now = $state(Date.now());
  onMount(() => {
    const id = setInterval(() => (now = Date.now()), 200);
    return () => clearInterval(id);
  });
  const busy = $derived(!!o && now < overlayDoneAt(o));
  let actionDone = $state<string | null>(null);

  const outcome = $derived.by((): Outcome | undefined => {
    if (o?.kind === 'wheel' && o.result !== null && o.spin) return o.segments[o.result];
    if (o?.kind === 'dice' && o.roll) return o.roll.totalOutcome ?? o.roll.dice.find((d) => d.face?.scoreAction || d.face?.timerSeconds)?.face;
    return undefined;
  });
  const resultText = $derived.by(() => {
    if (o?.kind === 'wheel' && o.result !== null && o.spin) return o.segments[o.result].label;
    if (o?.kind === 'dice' && o.roll) return describeRoll(o.roll);
    return '';
  });
  const actionKey = $derived(o && 'nonce' in o ? `${o.nonce}-${o.kind === 'wheel' ? o.spin?.startedAt : o.kind === 'dice' ? o.startedAt : ''}` : '');
  const lastRoll = $derived(session.rollLog?.at(-1));
  const removed = $derived(o?.kind === 'wheel' && o.wheelId ? (session.removedSegments?.[o.wheelId]?.length ?? 0) : 0);

  /** The player the "Pick a player" wheel landed on. */
  const picked = $derived(
    o?.kind === 'wheel' && o.players && o.result !== null && o.spin ? session.players.find((p) => p.id === o.segments[o.result!]?.id) : undefined,
  );

  function tag(id: string): void {
    if (!o || (o.kind !== 'wheel' && o.kind !== 'dice') || !lastRoll) return;
    const cur = lastRoll.playerIds ?? [];
    lastRoll.playerIds = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    o.tagged = lastRoll.playerIds;
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
        {#if removed}
          <button class="ghost small" onclick={() => o.wheelId && session.removedSegments && (session.removedSegments[o.wheelId] = [])}>
            Restore {removed} used slice{removed === 1 ? '' : 's'}
          </button>
        {/if}
      {:else if o.kind === 'dice'}
        <b>🎲 {o.name}</b>
        <button class="primary" disabled={busy} onclick={() => rollDice(app.live, session, o.preset)} title="D">{o.roll ? 'Roll again' : 'Roll!'}</button>
      {:else if o.kind === 'rolloff'}
        <b>🏁 Who goes first</b>
        {#if !busy}<span>{session.players.find((p) => p.id === o.winner)?.name} picks first.</span>{:else}<span class="muted">Rolling…</span>{/if}
      {:else}
        <b>📊 Scoreboard on screen</b>
      {/if}
      <span class="spacer"></span>
      {#if resultText && !busy}<span class="result">Result: <b>{resultText}</b></span>{/if}
      <button onclick={onclose} title="Esc">Close</button>
    </div>
    {#if o.kind === 'wheel' && o.editing}
      {#key o.nonce}<WheelEdit {o} {game} {session} disabled={busy} />{/key}
    {/if}
    {#if picked && !busy}
      <div class="row">
        {#if session.currentPickerId === picked.id}
          <span class="muted small">★ {picked.name} picks the next clue.</span>
        {:else}
          <button class="small" onclick={() => (session.currentPickerId = picked.id)} title="Mark them as the player who picks the next clue">
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
            defaultTargets={lastRoll?.playerIds ?? []}
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
  .result {
    max-width: 50%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
