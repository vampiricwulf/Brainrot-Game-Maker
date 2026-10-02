<!--
  Host panel: "📱 3/4", the phones joined. Click for the list (kick, people asking to join), the code and the link. It
  drops from the chip, always whole in the window and over everything else (see anchored.ts). In a single window it
  stays in the host panel (which grows for it), scrolling if it must, so it doesn't cover the stage viewers see; with an
  audience window it may go over the stage's preview.
-->
<script lang="ts">
  import type { GameSettings, Session } from '../../lib/model';
  import { FULL_SHOWN_MS, remote, roomLink } from '../../lib/remote.svelte';
  import { anchored } from '../../lib/anchored';
  import { audience } from '../../lib/sync.svelte';
  import BuzzerOptions, { type SetBuzzSetting } from '../BuzzerOptions.svelte';
  import { copyText } from '../standings';
  import PhoneList from '../PhoneList.svelte';

  let {
    session,
    settings,
    onset,
    max,
    onstart,
    onadd,
    onreject,
    onkick,
    onlock,
    onkickmember,
    onmove,
  }: {
    session: Session;
    settings: GameSettings;
    onset: SetBuzzSetting;
    max: number;
    onstart: () => void;
    onadd: (conn: string, name: string) => void;
    onreject: (conn: string) => void;
    onkick: (seatId: string) => void;
    onlock: (on: boolean) => void;
    /** Teams: take one person off their team / put them on another. */
    onkickmember: (seatId: string, member: string, name: string) => void;
    onmove: (member: string, seatId: string, name: string) => void;
  } = $props();

  let open = $state(false);
  let chip = $state<HTMLButtonElement>();

  function toggle(): void {
    open = !open;
  }
  const joined = $derived(session.players.filter((p) => remote.phones.some((ph) => ph.seatId === p.id && ph.connected)).length);
  /** Teams: the people (phones) on a team. */
  const people = $derived(remote.phones.filter((ph) => ph.member && ph.connected && session.players.some((p) => p.id === ph.seatId)).length);
  const asking = $derived(remote.phones.filter((p) => !p.seatId && p.pendingName && p.connected && !remote.answered.includes(p.conn)).length);
  const trouble = $derived(remote.status === 'reconnecting' || remote.status === 'error');
  let now = $state(Date.now());
  $effect(() => {
    const id = setInterval(() => (now = Date.now()), 10_000);
    return () => clearInterval(id);
  });
  const full = $derived(!!remote.fullAt && now - remote.fullAt < FULL_SHOWN_MS);
  // Out of reach: the room's last list of phones is stale, so no count (it would say they're all there).
  const label = $derived(
    remote.status === 'off'
      ? '📱 Phones off'
      : remote.status === 'connecting'
        ? '📱 Starting…'
        : remote.status === 'reconnecting'
          ? '📱 ⚠ Phones not connected'
          : remote.status === 'error'
            ? '📱 ⚠ Room lost'
            : `📱 ${settings.buzzTeams ? `${people} ${people === 1 ? 'person' : 'people'} · ` : ''}${joined}/${session.players.length}${settings.buzzTeams ? ' teams' : ''}${asking ? ` · ${asking} asking` : ''}${full ? ' · room full' : ''}`,
  );
</script>

<svelte:window onkeydowncapture={(e) => open && e.key === 'Escape' && (e.stopImmediatePropagation(), (open = false))} />

<span class="wrap">
  <button
    class="small chip"
    class:warn={trouble}
    class:ask={asking > 0}
    aria-expanded={open}
    aria-controls="phone-pop"
    bind:this={chip}
    onclick={toggle}
    title={trouble ? 'The buzzer room isn’t reachable right now: phones can’t buzz' : 'Phone buzzers: who has joined'}
  >{label}</button>
  {#if open}
    <div
      class="pop"
      id="phone-pop"
      role="region"
      aria-label="Phone buzzers"
      use:anchored={{ anchor: chip, align: 'end', gap: 6, within: audience.open ? null : '.panel' }}
    >
      {#if remote.status === 'off'}
        <p class="muted small">No buzzer room is running.</p>
        <button class="small" onclick={onstart}>▶ Start the room</button>
      {:else}
        <div class="row">
          <b class="code">{remote.code}</b>
          <button class="small" onclick={() => copyText(roomLink(), 'Join link copied')}>📋 Copy link</button>
          <span class="spacer"></span>
          <button class="ghost small" onclick={() => (open = false)} aria-label="Close the phones list">✕</button>
        </div>
        {#if remote.status === 'reconnecting'}
          <p class="warn small" role="status">⚠ Reconnecting to the buzzer room… phones can’t buzz until it’s back.</p>
        {:else if remote.status === 'error'}
          <p class="warn small" role="alert">⚠ {remote.error || 'Lost the buzzer room'}</p>
          <button class="small" onclick={onstart}>Start a new room</button>
        {/if}
        <PhoneList {session} {max} {onadd} {onreject} {onkick} {onlock} teams={!!settings.buzzTeams} {onkickmember} {onmove} />
      {/if}
      <BuzzerOptions {settings} {onset} compact />
    </div>
  {/if}
</span>

<style>
  .wrap {
    position: relative;
    display: inline-flex;
  }
  .chip.warn {
    border-color: var(--warn);
    color: var(--warn);
  }
  .chip.ask {
    border-color: var(--accent);
  }
  /* Placed by anchored.ts (fixed to the window, over everything). */
  .pop {
    width: 300px;
    max-height: 60vh;
    overflow: auto;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  }
  .row {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .spacer {
    flex: 1;
  }
  .code {
    font-size: 18px;
    letter-spacing: 0.1em;
  }
  p {
    margin: 0;
  }
  .small {
    font-size: 12px;
  }
  .warn {
    color: var(--warn);
  }
</style>
