<script lang="ts">
  import type { ScoreEvent, Session } from '../lib/model';
  import { stepAmount, stepOf, toggleEvent, toggleStep } from '../lib/session';

  let {
    session,
    sym,
    onreopen,
    onclose,
  }: {
    session: Session;
    sym: string;
    /** Put a used tile back on the board. */
    onreopen?: (clueId: string) => void;
    onclose: () => void;
  } = $props();
  const byId = $derived(Object.fromEntries([...(session.removedPlayers ?? []), ...session.players].map((p) => [p.id, p])));
  const removed = $derived(new Set((session.removedPlayers ?? []).map((p) => p.id)));
  // One row per award: the events of a multi-player award (or a swap) are grouped, newest first.
  const steps = $derived.by(() => {
    const out: { key: string; events: ScoreEvent[] }[] = [];
    for (const e of session.scoreLog) {
      const key = stepOf(e);
      const last = out[out.length - 1];
      if (last?.key === key) last.events.push(e);
      else out.push({ key, events: [e] });
    }
    return out.reverse();
  });
  const rolls = $derived([...(session.rollLog ?? [])].reverse());
  let tab = $state<'scores' | 'rolls'>('scores');
  let expanded = $state<Record<string, boolean>>({});
  const icon = { wheel: '🎡', dice: '🎲', rolloff: '🏁' } as const;
  const time = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const name = (id: string) => (byId[id] ? byId[id].name + (removed.has(id) ? ' (removed)' : '') : '(removed player)');
</script>

<aside>
  <header class="row">
    <button class="tab" class:on={tab === 'scores'} onclick={() => (tab = 'scores')}>Scores ({steps.length})</button>
    <button class="tab" class:on={tab === 'rolls'} onclick={() => (tab = 'rolls')}>Rolls ({session.rollLog?.length ?? 0})</button>
    <span class="spacer"></span>
    <button class="ghost small" onclick={onclose}>✕</button>
  </header>
  {#if tab === 'rolls'}
    <div class="list">
      {#each rolls as r (r.id)}
        <div class="roll">
          <div><span>{icon[r.source]}</span> <b>{r.name}</b> <span class="muted small">{time(r.ts)}</span></div>
          <div>{r.result}</div>
          {#if r.playerIds?.length}
            <div class="small">For: {r.playerIds.map((id) => byId[id]?.name ?? '?').join(', ')}</div>
          {/if}
        </div>
      {:else}
        <div class="muted">No spins or rolls yet.</div>
      {/each}
    </div>
  {:else}
  <div class="list">
    {#each steps as step (step.key)}
      {@const first = step.events[0]}
      {@const allUndone = step.events.every((e) => e.undone)}
      {@const clueId = first.clueId}
      <div class="step">
        {#if step.events.length === 1}
          {@const p = byId[first.playerId]}
          <div class="ev" class:undone={first.undone}>
            <span class="dot" style:background={p?.color ?? '#666'}></span>
            <span class="who">{name(first.playerId)}</span>
            <span class="delta" class:neg={first.delta < 0}>{first.delta > 0 ? '+' : '−'}{sym}{Math.abs(first.delta).toLocaleString()}</span>
            <span class="why muted">{first.reason} · {time(first.ts)}</span>
            <button class="small ghost" onclick={() => toggleEvent(session, first.id)}>{first.undone ? 'Restore' : 'Undo'}</button>
          </div>
        {:else}
          <div class="ev" class:undone={allUndone}>
            <span class="dots">
              {#each step.events as e (e.id)}<span class="dot" style:background={byId[e.playerId]?.color ?? '#666'}></span>{/each}
            </span>
            <button class="who link" onclick={() => (expanded[step.key] = !expanded[step.key])} aria-expanded={!!expanded[step.key]}>
              {expanded[step.key] ? '▾' : '▸'} {step.events.length} players
            </button>
            <span class="delta" class:neg={first.delta < 0}>{stepAmount(step.events, sym)}</span>
            <span class="why muted">{step.events.map((e) => name(e.playerId)).join(', ')} · {first.reason} · {time(first.ts)}</span>
            <button class="small ghost" onclick={() => toggleStep(session, step.key)}>{allUndone ? 'Restore all' : 'Undo all'}</button>
          </div>
          {#if expanded[step.key]}
            {#each step.events as e (e.id)}
              {@const p = byId[e.playerId]}
              <div class="ev sub" class:undone={e.undone}>
                <span class="dot" style:background={p?.color ?? '#666'}></span>
                <span class="who">{name(e.playerId)}</span>
                <span class="delta" class:neg={e.delta < 0}>{e.delta > 0 ? '+' : '−'}{sym}{Math.abs(e.delta).toLocaleString()}</span>
                <button class="small ghost" onclick={() => toggleEvent(session, e.id)}>{e.undone ? 'Restore' : 'Undo'}</button>
              </div>
            {/each}
          {/if}
        {/if}
        {#if clueId && onreopen && session.used[clueId]}
          <button class="small ghost reopen" onclick={() => onreopen(clueId)} title="Put this tile back on the board">↶ Reopen tile</button>
        {/if}
      </div>
    {:else}
      <div class="muted">No score changes yet.</div>
    {/each}
  </div>
  {/if}
</aside>

<style>
  aside {
    position: fixed;
    right: 0;
    top: 0;
    bottom: 0;
    width: min(420px, 100vw);
    background: var(--panel);
    border-left: 1px solid var(--border);
    z-index: 50;
    display: flex;
    flex-direction: column;
    box-shadow: -8px 0 30px rgba(0, 0, 0, 0.4);
  }
  .tab.on {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
  .roll {
    padding: 6px 8px;
    background: var(--panel-2);
    border-radius: 6px;
  }
  .small {
    font-size: 12px;
  }
  header {
    padding: 12px;
    border-bottom: 1px solid var(--border);
  }
  .list {
    overflow-y: auto;
    padding: 8px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .step {
    display: flex;
    flex-direction: column;
    gap: 2px;
    background: var(--panel-2);
    border-radius: 6px;
  }
  .ev {
    display: grid;
    grid-template-columns: auto 1fr auto auto;
    grid-template-areas: 'dot who delta btn' '. why why btn';
    column-gap: 8px;
    align-items: center;
    padding: 6px 8px;
  }
  .ev.sub {
    grid-template-areas: 'dot who delta btn';
    padding: 2px 8px 2px 24px;
  }
  .ev.undone {
    opacity: 0.45;
  }
  .ev.undone .delta {
    text-decoration: line-through;
  }
  .dot {
    grid-area: dot;
    display: inline-block;
    width: 12px;
    height: 12px;
    border-radius: 50%;
  }
  .dots {
    grid-area: dot;
    display: flex;
    gap: 2px;
  }
  .who {
    grid-area: who;
    font-weight: 600;
  }
  .link {
    background: none;
    border: none;
    padding: 0;
    text-align: left;
  }
  .delta {
    grid-area: delta;
    font-weight: 700;
    color: var(--good);
  }
  .delta.neg {
    color: var(--bad);
  }
  .why {
    grid-area: why;
    font-size: 12px;
  }
  .ev button:not(.link) {
    grid-area: btn;
  }
  .reopen {
    align-self: flex-start;
    margin: 0 8px 6px;
  }
</style>
