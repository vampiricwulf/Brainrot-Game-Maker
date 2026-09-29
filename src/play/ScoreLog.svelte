<script lang="ts">
  import type { Session } from '../lib/model';
  import { toggleEvent } from '../lib/session';

  let { session, sym, onclose }: { session: Session; sym: string; onclose: () => void } = $props();
  const byId = $derived(Object.fromEntries(session.players.map((p) => [p.id, p])));
  const events = $derived([...session.scoreLog].reverse());
</script>

<aside>
  <header class="row">
    <b>Score log</b>
    <span class="muted">{session.scoreLog.length} changes</span>
    <span class="spacer"></span>
    <button class="ghost small" onclick={onclose}>✕</button>
  </header>
  <div class="list">
    {#each events as e (e.id)}
      {@const p = byId[e.playerId]}
      <div class="ev" class:undone={e.undone}>
        <span class="dot" style:background={p?.color ?? '#666'}></span>
        <span class="who">{p?.name ?? '(removed player)'}</span>
        <span class="delta" class:neg={e.delta < 0}>{e.delta > 0 ? '+' : '−'}{sym}{Math.abs(e.delta).toLocaleString()}</span>
        <span class="why muted">{e.reason} · {new Date(e.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        <button class="small ghost" onclick={() => toggleEvent(session, e.id)}>{e.undone ? 'Restore' : 'Undo'}</button>
      </div>
    {:else}
      <div class="muted">No score changes yet.</div>
    {/each}
  </div>
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
  .ev {
    display: grid;
    grid-template-columns: 12px 1fr auto auto;
    grid-template-areas: 'dot who delta btn' '. why why btn';
    column-gap: 8px;
    align-items: center;
    padding: 6px 8px;
    background: var(--panel-2);
    border-radius: 6px;
  }
  .ev.undone {
    opacity: 0.45;
  }
  .ev.undone .delta {
    text-decoration: line-through;
  }
  .dot {
    grid-area: dot;
    width: 12px;
    height: 12px;
    border-radius: 50%;
  }
  .who {
    grid-area: who;
    font-weight: 600;
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
  button {
    grid-area: btn;
  }
</style>
