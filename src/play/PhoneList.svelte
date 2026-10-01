<!-- Phone buzzers: each player and their phone (joined, gone quiet, or not yet), and people asking to join from theirs. -->
<script lang="ts">
  import type { Session } from '../lib/model';
  import { remote } from '../lib/remote.svelte';

  let {
    session,
    max,
    onadd,
    onreject,
    onkick,
  }: {
    session: Session;
    /** Most players the game takes (Setup). */
    max: number;
    /** Add the person waiting on this phone as a new player. */
    onadd: (conn: string, name: string) => void;
    onreject: (conn: string) => void;
    /** Take a player's seat back from their phone (they can pick their name again). */
    onkick: (seatId: string) => void;
  } = $props();

  const phoneOf = (id: string) => remote.phones.find((p) => p.seatId === id);
  const waiting = $derived(remote.phones.filter((p) => !p.seatId && p.pendingName && p.connected));
  const full = $derived(session.players.length >= max);
</script>

<ul class="phones">
  {#each session.players as p (p.id)}
    {@const ph = phoneOf(p.id)}
    <li style:--c={p.color}>
      <span class="dot" aria-hidden="true"></span>
      <span class="name">{p.name}</span>
      {#if ph?.connected}
        <span class="ok">✔ joined</span>
      {:else if ph}
        <span class="away">… phone away</span>
      {:else}
        <span class="muted">waiting</span>
      {/if}
      {#if ph}
        <button class="ghost small x" onclick={() => onkick(p.id)} aria-label="Take {p.name}’s seat back from their phone" title="Take the seat back: their phone can pick a name again">✕</button>
      {/if}
    </li>
  {/each}
</ul>
{#if waiting.length}
  <div class="asks" role="status">
    {#each waiting as w (w.conn)}
      <div class="ask">
        <span>📱 <b>{w.pendingName}</b> wants to join</span>
        <button class="good small" disabled={full} title={full ? 'The game is full (Setup › Most players)' : 'Add them as a new player'} onclick={() => onadd(w.conn, w.pendingName ?? '')}>✔ Add</button>
        <button class="small" onclick={() => onreject(w.conn)} aria-label="Turn {w.pendingName} away" title="Turn them away">✕</button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .phones {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  li {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 26px;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--c);
    flex: none;
  }
  .name {
    font-weight: 600;
    min-width: 6em;
  }
  .ok {
    color: var(--good, #4caf50);
  }
  .away {
    color: var(--warn);
  }
  .x {
    margin-left: auto;
  }
  .small {
    font-size: 12px;
  }
  .asks {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 6px;
  }
  .ask {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
</style>
