<script module lang="ts">
  export type LogTab = 'history' | 'scores' | 'rolls';
</script>

<script lang="ts">
  import { formatPoints, roundName, type Game, type ScoreEvent, type Session } from '../lib/model';
  import { ROUND_MODES } from '../lib/modes';
  import { nameList, stepAmount, stepOf, toggleEvent, toggleStep } from '../lib/session';
  import { timelineRows, type TimelineRow } from '../lib/timeline';
  import InlineAsk from './host/InlineAsk.svelte';

  let {
    game,
    session,
    sym,
    tab = $bindable('history'),
    onreopen,
    onback,
    onredoto,
    onclose,
    area = null,
  }: {
    game: Game;
    session: Session;
    sym: string;
    tab?: LogTab;
    /** Put a used tile back on the board. */
    onreopen?: (clueId: string) => void;
    /** 🕘 History: undo everything newer than this row. */
    onback: (row: TimelineRow) => void;
    /** 🕘 History: redo up to this (undone) row. */
    onredoto: (row: TimelineRow) => void;
    onclose: () => void;
    /** Single window: the host panel's box. The log shows in there, never over the stage viewers see. */
    area?: { top: number; left: number; width: number; height: number } | null;
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
  let expanded = $state<Record<string, boolean>>({});
  const icon = { wheel: '🎡', dice: '🎲', rolloff: '🏁' } as const;
  const time = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const name = (id: string) => (byId[id] ? byId[id].name + (removed.has(id) ? ' (removed)' : '') : '(removed player)');
  /** "+$200", "−$200", or "$0" (a Final judgment with nothing wagered). */
  const amount = (d: number) => `${d > 0 ? '+' : d < 0 ? '−' : ''}${formatPoints(Math.abs(d), sym)}`;
  /** A Final judgment says which it was. */
  const judged = (e: ScoreEvent) => (e.right === undefined ? '' : e.right ? ' ✔' : ' ✘');

  // ---------- 🕘 History ----------

  const rows = $derived(timelineRows(session, game, sym));
  const undone = (r: TimelineRow) => r.kind !== 'roll' && r.state === 'redo';
  /** The list as shown: the undone steps, "● Now", then the rest, with a heading where the round changes. */
  const items = $derived.by(() => {
    const out: ({ kind: 'now' } | { kind: 'round'; text: string } | { kind: 'row'; row: TimelineRow; current: boolean })[] = [];
    let round: number | undefined;
    let current = true;
    rows.forEach((row, i) => {
      if (!undone(row) && (i === 0 || undone(rows[i - 1]))) out.push({ kind: 'now' });
      const r = row.round !== undefined ? game.rounds[row.round] : undefined;
      if (r && row.round !== round) out.push({ kind: 'round', text: `${ROUND_MODES[r.mode].icon} ${roundName(r, row.round)}` });
      if (row.round !== undefined) round = row.round;
      // Where things stand: the newest step that counts.
      const here = current && !undone(row) && row.kind !== 'roll' && row.state === 'done';
      if (here) current = false;
      out.push({ kind: 'row', row, current: here });
    });
    if (rows.length && undone(rows[rows.length - 1])) out.push({ kind: 'now' });
    return out;
  });
  /** A jump of more than one step, waiting for its inline OK. */
  let asking = $state<TimelineRow | null>(null);
  // Anything done since it was asked changes how many steps it is: it's asked again.
  $effect(() => {
    void rows;
    asking = null;
  });

  function jump(row: TimelineRow): void {
    if (row.steps > 1) asking = row;
    else go(row);
  }

  function go(row: TimelineRow): void {
    asking = null;
    if (undone(row)) onredoto(row);
    else onback(row);
  }
</script>

<aside
  class:in-panel={!!area}
  style:top={area ? `${area.top}px` : undefined}
  style:left={area ? `${area.left}px` : undefined}
  style:width={area ? `${area.width}px` : undefined}
  style:height={area ? `${area.height}px` : undefined}
  aria-label="Log"
>
  <header class="row">
    <button class="tab" class:on={tab === 'history'} aria-pressed={tab === 'history'} onclick={() => (tab = 'history')}>🕘 History</button>
    <button class="tab" class:on={tab === 'scores'} aria-pressed={tab === 'scores'} onclick={() => (tab = 'scores')}>Scores ({steps.length})</button>
    <button class="tab" class:on={tab === 'rolls'} aria-pressed={tab === 'rolls'} onclick={() => (tab = 'rolls')}>Rolls ({session.rollLog?.length ?? 0})</button>
    <span class="spacer"></span>
    <button class="ghost small" onclick={onclose} aria-label="Close">✕</button>
  </header>
  {#if tab === 'history'}
    <p class="muted small intro">
      Newest first. <b>↶ Back to here</b> undoes everything after a step, <b>↷ Redo to here</b> brings undone steps back. Ctrl+Z and
      Ctrl+Shift+Z go one at a time.
    </p>
    <div class="list tl" role="list">
      {#each items as it, i (it.kind === 'row' ? `${it.row.kind}:${it.row.id}` : `${it.kind}:${i}`)}
        {#if it.kind === 'now'}
          <div class="now" role="separator"><span>● Now</span></div>
        {:else if it.kind === 'round'}
          <div class="round">{it.text}</div>
        {:else}
          {@const row = it.row}
          {@const back = !undone(row) && row.steps > 0}
          {@const reopen = row.kind === 'score' && row.clueId && onreopen && session.used[row.clueId] ? row.clueId : undefined}
          <div
            class="item"
            class:redo={undone(row)}
            class:off={row.kind === 'score' && row.state === 'off'}
            class:moment={row.kind === 'roll'}
            class:current={it.current}
            class:asked={asking?.kind === row.kind && asking.id === row.id}
            role="listitem"
            aria-current={it.current ? 'step' : undefined}
          >
            <span class="time muted">{time(row.ts)}</span>
            <span class="icon" aria-hidden="true">
              {#if undone(row)}↷
              {:else if row.kind === 'score'}
                <span class="dots">{#each row.events as e (e.id)}<span class="dot" style:background={byId[e.playerId]?.color ?? '#666'}></span>{/each}</span>
              {:else if row.kind === 'roll'}{icon[row.source]}
              {:else}•{/if}
            </span>
            <span class="text">{row.text}</span>
            {#if reopen || undone(row) || back}
              <span class="acts">
                {#if reopen}
                  <button class="small ghost" onclick={() => onreopen?.(reopen)} title="Put this tile back on the board">↶ Reopen tile</button>
                {/if}
                {#if undone(row)}
                  <button class="small" onclick={() => jump(row)} title="Redo {row.steps} step{row.steps === 1 ? '' : 's'}, up to this one">↷ Redo to here</button>
                {:else if back}
                  <button class="small" onclick={() => jump(row)} title="Undo the {row.steps} step{row.steps === 1 ? '' : 's'} after this">↶ Back to here</button>
                {/if}
              </span>
            {/if}
          </div>
        {/if}
      {:else}
        <div class="muted">Nothing yet. Scores, moves, items and rolls show up here, and you can go back to any point.</div>
      {/each}
    </div>
    <!-- Under the list, so the rows don't move under the pointer (a double-click's second half). -->
    {#if asking}
      {@const n = asking.steps}
      {@const row = asking}
      <div class="asking">
        <InlineAsk
          text={undone(row)
            ? `Redo ${n} steps, up to ${time(row.ts)}?`
            : `Undo ${n} steps, back to ${time(row.ts)}? Scores, moves and items go back.`}
          ok={undone(row) ? `Redo ${n} steps` : `Undo ${n} steps`}
          onok={() => go(row)}
          oncancel={() => (asking = null)}
        />
      </div>
    {/if}
  {:else if tab === 'rolls'}
    <div class="list">
      {#each rolls as r (r.id)}
        <div class="roll">
          <div><span>{icon[r.source]}</span> <b>{r.name}</b> <span class="muted small">{time(r.ts)}</span></div>
          <div>{r.result}</div>
          {#if r.playerIds?.length}
            <div class="small">For: {nameList(r.playerIds.map((id) => byId[id]?.name ?? '?'))}</div>
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
            <span class="delta" class:neg={first.delta < 0}>{amount(first.delta)}</span>
            <span class="why muted">{first.reason}{judged(first)} · {time(first.ts)}</span>
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
            <span class="why muted">{nameList(step.events.map((e) => name(e.playerId)))} · {first.reason} · {time(first.ts)}</span>
            <button class="small ghost" onclick={() => toggleStep(session, step.key)}>{allUndone ? 'Restore all' : 'Undo all'}</button>
          </div>
          {#if expanded[step.key]}
            {#each step.events as e (e.id)}
              {@const p = byId[e.playerId]}
              <div class="ev sub" class:undone={e.undone}>
                <span class="dot" style:background={p?.color ?? '#666'}></span>
                <span class="who">{name(e.playerId)}</span>
                <span class="delta" class:neg={e.delta < 0}>{amount(e.delta)}</span>
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
    width: min(460px, 100vw);
    background: var(--panel);
    border-left: 1px solid var(--border);
    z-index: 50;
    display: flex;
    flex-direction: column;
    box-shadow: -8px 0 30px rgba(0, 0, 0, 0.4);
  }
  aside.in-panel {
    right: auto;
    bottom: auto;
    border-left: none;
    border-top: 1px solid var(--border);
    box-shadow: none;
  }
  .tab.on {
    background: var(--accent-fill);
    border-color: var(--accent-fill);
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
  /* 🕘 History */
  .intro {
    margin: 0;
    padding: 8px 12px 0;
  }
  .asking {
    padding: 8px 12px;
    border-top: 1px solid var(--border);
  }
  .tl {
    gap: 2px;
  }
  .item {
    display: grid;
    grid-template-columns: 56px 24px minmax(0, 1fr) auto;
    column-gap: 6px;
    align-items: center;
    min-height: 30px;
    padding: 3px 6px;
    border: 1px solid transparent;
    border-radius: 6px;
  }
  .item:hover,
  .item:focus-within {
    background: var(--panel-2);
  }
  .item.current {
    border-color: var(--accent);
  }
  /* The step the question under the list is about. */
  .item.asked {
    border: 1px dashed var(--warn);
    opacity: 1;
  }
  .item.redo,
  .item.off {
    opacity: 0.5;
  }
  .item.redo .text {
    font-style: italic;
  }
  .item.off .text {
    text-decoration: line-through;
  }
  .item.moment .text {
    color: var(--muted);
  }
  .time {
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .icon {
    display: flex;
    justify-content: center;
    color: var(--muted);
  }
  .icon .dots {
    flex-wrap: wrap;
    max-width: 24px;
  }
  .icon .dot {
    width: 9px;
    height: 9px;
  }
  .text {
    font-size: 13px;
    overflow-wrap: anywhere;
  }
  /* A row without buttons has the whole width for its text. */
  .text:last-child {
    grid-column: 3 / -1;
  }
  /*
    The row's buttons have their own column at its end (one above the other when there are two), so they never cover
    its text; they show when it's pointed at or tabbed to (they stay in the tab order).
  */
  .acts {
    display: flex;
    flex-direction: column;
    gap: 2px;
    opacity: 0;
    pointer-events: none;
  }
  .item:hover .acts,
  .item:focus-within .acts {
    opacity: 1;
    pointer-events: auto;
  }
  .item.redo:hover,
  .item.off:hover,
  .item.redo:focus-within {
    opacity: 1;
  }
  .now {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 4px 0;
    color: var(--accent);
    font-size: 12px;
    font-weight: 600;
  }
  .now::before,
  .now::after {
    content: '';
    flex: 1;
    border-top: 1px dashed var(--accent);
  }
  .round {
    margin-top: 6px;
    padding: 2px 6px;
    font-size: 12px;
    font-weight: 700;
    color: var(--muted);
  }
</style>
