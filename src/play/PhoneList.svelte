<!--
  Phone buzzers: each player and their phone (joined, gone quiet, or not yet), and people asking to join from theirs.
  Teams: each team and the people on it (move one to another team, or take them off).
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { Session } from '../lib/model';
  import { FULL_SHOWN_MS, remote } from '../lib/remote.svelte';
  import { awayFor, phoneAwaySince } from './host/phoneaway.svelte';

  let {
    session,
    max,
    onadd,
    onreject,
    onkick,
    onlock,
    teams = false,
    onkickmember,
    onmove,
  }: {
    session: Session;
    /** Most players the game takes (⚖ Game rules). */
    max: number;
    /** Add the person waiting on this phone as a new player. */
    onadd: (conn: string, name: string) => void;
    onreject: (conn: string) => void;
    /** Take a player's seat back from their phone (they can pick their name again). */
    onkick: (seatId: string) => void;
    /** 🔒 Lock seats on or off. */
    onlock?: (on: boolean) => void;
    /** Teams: each player is a team that several phones join. */
    teams?: boolean;
    /** Teams: take one person (their phone) off their team. */
    onkickmember?: (seatId: string, member: string, name: string) => void;
    /** Teams: put one person on another team. */
    onmove?: (member: string, seatId: string, name: string) => void;
  } = $props();

  // "Room full" shows for a while after the room last turned a phone away.
  let now = $state(Date.now());
  onMount(() => {
    // (Every second: "phone offline 0:12" counts up.)
    const id = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(id);
  });
  const roomFull = $derived(!!remote.fullAt && now - remote.fullAt < FULL_SHOWN_MS);
  const locked = $derived(!!session.remote?.locked);

  const phoneOf = (id: string) => remote.phones.find((p) => p.seatId === id);
  /** Teams: the people on a team (connected ones first), by the name they joined with. */
  const membersOf = (id: string) =>
    remote.phones.filter((p) => p.seatId === id && p.member).sort((a, b) => Number(b.connected) - Number(a.connected));
  const waiting = $derived(remote.phones.filter((p) => !p.seatId && p.pendingName && p.connected && !remote.answered.includes(p.conn)));
  const full = $derived(session.players.length >= max);
  /** Phones open on the join screen that haven't picked a name (teams: a team) yet. */
  const picking = $derived(remote.phones.filter((p) => !p.seatId && !p.pendingName && p.connected).length);
</script>

<ul class="phones">
  {#each session.players as p (p.id)}
    {@const ph = phoneOf(p.id)}
    {#if teams}
      {@const ms = membersOf(p.id)}
      <li style:--c={p.color} class="team">
        <span class="dot" aria-hidden="true"></span>
        <span class="name" dir="auto">{p.name}</span>
        <span class="muted">{ms.length ? `${ms.length} on it` : 'nobody yet'}</span>
        {#if phoneAwaySince(p.id) !== null}
          {@const at = phoneAwaySince(p.id) ?? now}
          <span class="away" data-phone-offline={p.id}>📵 offline {awayFor(at, now)}</span>
        {/if}
        {#if ms.length}
          <button class="ghost small x" onclick={() => onkick(p.id)} aria-label="Take everyone off {p.name}" title="Take everyone off this team: those phones can't join it again for 2 minutes">✕</button>
        {/if}
      </li>
      {#each ms as m (m.member)}
        <li class="member" style:--c={p.color}>
          <span class="name" dir="auto">{m.name}</span>
          {#if m.connected}<span class="ok">✔ joined</span>{:else}<span class="away">… phone away</span>{/if}
          {#if onmove && session.players.length > 1}
            <select
              class="small move"
              aria-label="Move {m.name} to another team"
              value=""
              onchange={(e) => {
                const to = e.currentTarget.value;
                e.currentTarget.value = '';
                if (to && m.member) onmove(m.member, to, m.name ?? '');
              }}
            >
              <option value="">Move to…</option>
              {#each session.players.filter((x) => x.id !== p.id) as o (o.id)}
                <option value={o.id}>{o.name}</option>
              {/each}
            </select>
          {/if}
          {#if onkickmember}
            <button class="ghost small x" onclick={() => m.member && onkickmember(p.id, m.member, m.name ?? '')} aria-label="Take {m.name} off {p.name}" title="Take them off the team: that phone can't join it again for 2 minutes">✕</button>
          {/if}
        </li>
      {/each}
    {:else}
    <li style:--c={p.color}>
      <span class="dot" aria-hidden="true"></span>
      <span class="name" dir="auto">{p.name}</span>
      {#if ph?.connected}
        <span class="ok">✔ joined</span>
      {:else if ph}
        {@const at = phoneAwaySince(p.id)}
        <span class="away" data-phone-offline={p.id}>📵 phone offline{at !== null ? ` ${awayFor(at, now)}` : ''}</span>
      {:else}
        <span class="muted">waiting</span>
      {/if}
      {#if ph}
        <button class="ghost small x" onclick={() => onkick(p.id)} aria-label="Take {p.name}’s seat back from their phone" title="Take the seat back: that phone can't take it again for 2 minutes (it can pick another free name)">✕</button>
      {/if}
    </li>
    {/if}
  {/each}
</ul>
{#if picking}
  <p class="muted small note">
    {picking === 1 ? '1 more phone is' : `${picking} more phones are`} on the join screen, not {teams ? 'on a team' : 'a player'} yet.
  </p>
{/if}
{#if roomFull}
  <p class="warn small" role="status">
    ⚠ Room full: too many phones are connected, so some were turned away. They try again by themselves; idle ones make
    room for players.
  </p>
{/if}
{#if remote.status === 'online' && remote.error}
  <p class="warn small" role="alert">⚠ {remote.error}</p>
{/if}
{#if onlock && session.remote}
  <label class="check small lock">
    <input type="checkbox" checked={locked} onchange={(e) => onlock(e.currentTarget.checked)} />
    🔒 Lock seats: no new phones (players already in can come back)
  </label>
{/if}
{#if waiting.length}
  <div class="asks" role="status">
    {#each waiting as w (w.conn)}
      <div class="ask">
        <span>📱 <b>{w.pendingName}</b> wants to join</span>
        <button class="good small" disabled={full} title={full ? 'The game is full (⚖ Game rules › Most players)' : 'Add them as a new player'} onclick={() => onadd(w.conn, w.pendingName ?? '')}>✔ Add</button>
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
  .member {
    padding-left: 18px;
    min-height: 24px;
  }
  .member .name {
    font-weight: 400;
    min-width: 5em;
  }
  .move + .x {
    margin-left: 4px;
  }
  .move {
    margin-left: auto;
    max-width: 9em;
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
  .warn {
    color: var(--warn);
    margin: 0;
  }
  .note {
    margin: 0;
  }
  .lock {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .ask {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
</style>
