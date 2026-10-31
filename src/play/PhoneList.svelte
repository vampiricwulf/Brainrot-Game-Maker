<!--
  Phone buzzers: each player and their phone (joined, gone quiet, or not yet), and people asking to join from theirs.
  Teams: each team and the people on it (move one to another team, or take them off). A player's row opens their menu
  (a right-click, Shift+F10; before the game the 👥 list's, in the game the host's) and F2 renames them before the game.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { Session } from '../lib/model';
  import { FULL_SHOWN_MS, remote, roomCanFree } from '../lib/remote.svelte';
  import { KICK_BLOCK_MS, MAX_PHONES } from '../lib/buzzproto';
  import { awayFor, phoneAwaySince } from './host/phoneaway.svelte';
  import JoinAsk, { joinAsks } from './JoinAsk.svelte';
  import { isMenuKey } from '../lib/menustate.svelte';

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
    onmenu,
    onrename,
  }: {
    session: Session;
    /** Most players the game takes (⚖ Game rules). */
    max: number;
    /** Add the person waiting on this phone as a new player. */
    onadd: (conn: string, name: string) => void;
    onreject: (conn: string) => void;
    /**
     * Take a player's seat back from their phone (that phone can't take it again for 2 minutes). free: only let go of
     * it, blocking nobody (they're back on a new phone, maybe on the same Wi-Fi).
     */
    onkick: (seatId: string, free?: boolean) => void;
    /** 🔒 Lock seats on or off. */
    onlock?: (on: boolean) => void;
    /** Teams: each player is a team that several phones join. */
    teams?: boolean;
    /** Teams: take one person (their phone) off their team. */
    onkickmember?: (seatId: string, member: string, name: string) => void;
    /** Teams: put one person on another team. */
    onmove?: (member: string, seatId: string, name: string) => void;
    /**
     * Before the game: a player's row opens the 👥 list's menu for them, and F2 there renames them. (In the game the
     * host's own player menu opens on their row, as on their chip.)
     */
    onmenu?: (e: MouseEvent, id: string) => void;
    onrename?: (id: string) => void;
  } = $props();

  /** Shift+F10 (or the menu key) on a row's button: its player's menu, under it; F2: rename them. */
  function rowKey(e: KeyboardEvent, id: string): void {
    if (e.defaultPrevented || !(e.target instanceof HTMLElement)) return;
    if (onmenu && isMenuKey(e)) {
      const r = e.target.getBoundingClientRect();
      e.preventDefault();
      onmenu(new MouseEvent('contextmenu', { clientX: r.left + 8, clientY: r.bottom + 2 }), id);
    } else if (onrename && e.key === 'F2' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      onrename(id);
    }
  }

  // "Room full" shows for a while after the room last turned a phone away.
  let now = $state(Date.now());
  onMount(() => {
    // (Every second: "offline 0:12" counts up.)
    const id = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(id);
  });
  const roomFull = $derived(!!remote.fullAt && now - remote.fullAt < FULL_SHOWN_MS);
  const locked = $derived(!!session.remote?.locked);
  const LOCKED_OUT = 'Lock seats keeps new phones out: untick 🔒 Lock seats to let their phone in';

  const phoneOf = (id: string) => remote.phones.find((p) => p.seatId === id);
  /** Teams: the people on a team (connected ones first), by the name they joined with. */
  const membersOf = (id: string) =>
    remote.phones.filter((p) => p.seatId === id && p.member).sort((a, b) => Number(b.connected) - Number(a.connected));
  const waiting = $derived(joinAsks());
  const full = $derived(session.players.length >= max);
  /**
   * The room can't be reached right now: nothing these buttons say would get to it (they're greyed out), and its last
   * list of phones is stale or gone (no ✔ joined from it, and no "waiting" or "nobody yet" either).
   */
  const down = $derived(remote.status !== 'online');
  const downTitle = 'The buzzer room isn’t reachable right now';
  /** Phones open on the join screen that haven't picked a name (teams: a team) yet. */
  const picking = $derived(remote.phones.filter((p) => !p.seatId && !p.pendingName && p.connected).length);
</script>

<ul class="phones">
  {#each session.players as p (p.id)}
    {@const ph = phoneOf(p.id)}
    {#if teams}
      {@const ms = membersOf(p.id)}
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <li style:--c={p.color} class="team" data-player-id={p.id} oncontextmenu={(e) => onmenu?.(e, p.id)} onkeydown={(e) => rowKey(e, p.id)}>
        <span class="dot" aria-hidden="true"></span>
        <span class="name" dir="auto">{p.name}</span>
        {#if !down && !ms.length && locked}
          <span class="muted" title={LOCKED_OUT}>🔒 locked out</span>
        {:else}
          <span class="muted">{down ? 'room out of reach' : ms.length ? `${ms.length} on it` : 'nobody yet'}</span>
        {/if}
        {#if phoneAwaySince(p.id) !== null}
          {@const at = phoneAwaySince(p.id) ?? now}
          <span class="away" data-phone-offline={p.id}>📵 offline {awayFor(at, now)}</span>
        {/if}
        {#if ms.length}
          <!-- (Its words set it apart from each person's ✕ right under it.) -->
          <button class="ghost small x" onclick={() => onkick(p.id)} disabled={down} aria-label="Take everyone off {p.name}" title={down ? downTitle : "Take everyone off this team: those phones can't join it again for 2 minutes"}>✕ All</button>
        {/if}
      </li>
      {#each ms as m (m.member)}
        <li class="member" style:--c={p.color}>
          <span class="name" dir="auto">{m.name}</span>
          {#if down}<span class="muted">room out of reach</span>{:else if m.connected}<span class="ok">✔ joined</span>{:else}<span class="away">… phone away</span>{/if}
          {#if onmove && session.players.length > 1}
            <select
              class="small move"
              aria-label="Move {m.name} to another team"
              value=""
              disabled={down}
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
            <button class="ghost small x" onclick={() => m.member && onkickmember(p.id, m.member, m.name ?? '')} disabled={down} aria-label="Take {m.name} off {p.name}" title={down ? downTitle : "Take them off the team: that phone can't join it again for 2 minutes"}>✕</button>
          {/if}
        </li>
      {/each}
    {:else}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <li style:--c={p.color} data-player-id={p.id} oncontextmenu={(e) => onmenu?.(e, p.id)} onkeydown={(e) => rowKey(e, p.id)}>
      <span class="dot" aria-hidden="true"></span>
      <span class="name" dir="auto">{p.name}</span>
      {#if down}
        <span class="muted">phone: room out of reach</span>
      {:else if ph?.connected}
        <span class="ok">✔ joined</span>
      {:else if ph}
        {@const at = phoneAwaySince(p.id)}
        <span class="away" data-phone-offline={p.id}>📵 offline{at !== null ? ` ${awayFor(at, now)}` : ''}</span>
      {:else if locked}
        <!-- (No phone has its seat: Lock seats keeps any new one out, so they couldn't take it.) -->
        <span class="muted" title={LOCKED_OUT}>🔒 locked out</span>
      {:else}
        <span class="muted">waiting</span>
      {/if}
      {#if !ph && roomCanFree() && now - (remote.kicked[p.id] ?? -Infinity) < KICK_BLOCK_MS}
        <!-- Kicked a moment ago (by mistake, the wrong row): that phone can be let back before its 2 minutes are up. -->
        <button class="small ghost" onclick={() => onkick(p.id, true)} disabled={down} aria-label="Let back: {p.name}’s phone" title={down ? downTitle : 'Let the phone you kicked take this seat again now'}>↩ Let back</button>
      {/if}
      {#if ph}
        {#if roomCanFree()}
          <button
            class="small free"
            class:ghost={ph.connected}
            onclick={() => onkick(p.id, true)}
            disabled={down}
            aria-label="Free seat: {p.name}’s (moved phone)"
            title={down ? downTitle : "They're on a new phone or browser: free the seat so they can tap their name there. Blocks nobody."}
          >Free seat</button>
        {/if}
        <button class="ghost small kick" onclick={() => onkick(p.id)} disabled={down} aria-label="Kick {p.name}: take their seat back from their phone" title={down ? downTitle : "Kick: take the seat back. That phone, and any on the same Wi-Fi, can't take it again for 2 minutes (they can pick another free name)"}>✕ Kick</button>
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
    {#if teams}
      ⚠ Room full: a buzzer room takes {MAX_PHONES} phones at once. Phones still on the join screen make way after a few
      idle seconds, but once {MAX_PHONES} people are on teams nobody else can join until someone leaves (✕ takes a person
      off).
    {:else}
      ⚠ Room full: too many phones are connected, so some were turned away. They try again by themselves; idle ones make
      room for players.
    {/if}
  </p>
{/if}
{#if remote.status === 'online' && remote.error}
  <p class="warn small selectable" role="alert">⚠ {remote.error}</p>
{/if}
{#if onlock && session.remote}
  <label class="check small lock">
    <input type="checkbox" checked={locked} onchange={(e) => onlock(e.currentTarget.checked)} />
    🔒 Lock seats: no new phones ({teams ? 'people already on a team' : 'players already in'} can come back)
  </label>
{/if}
{#if waiting.length}
  <!-- (The ▶ Play bar's Show ↓ brings this into sight, with the keys on it.) -->
  <div class="asks" role="status" data-join-asks tabindex="-1" aria-label="Asking to join">
    {#each waiting as w (w.conn)}
      <div class="ask"><JoinAsk phone={w} {full} {down} {onadd} {onreject} /></div>
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
  /* (A row's status on one line: "✔ joined", "📵 offline 0:03".) */
  li .ok,
  li .away,
  li .muted {
    white-space: nowrap;
  }
  .away {
    color: var(--warn);
  }
  .x,
  .free,
  .kick:first-of-type {
    margin-left: auto;
  }
  .free + .kick {
    margin-left: 0;
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
  }
</style>
