<!-- Pre-game: 📱 Phone buzzers. Start the room, then players open the link (or scan the code) and tap their name. -->
<script lang="ts">
  import type { Session } from '../lib/model';
  import QrCode from '../lib/QrCode.svelte';
  import { buzzerBase, remote, roomLink } from '../lib/remote.svelte';
  import { copyText } from './standings';
  import PhoneList from './PhoneList.svelte';

  let {
    session,
    max,
    onstart,
    onadd,
    onreject,
    onkick,
  }: {
    session: Session;
    max: number;
    onstart: () => void;
    onadd: (conn: string, name: string) => void;
    onreject: (conn: string) => void;
    onkick: (seatId: string) => void;
  } = $props();

  const base = $derived(buzzerBase());
  const link = $derived(roomLink());
  const joined = $derived(session.players.filter((p) => remote.phones.some((ph) => ph.seatId === p.id && ph.connected)).length);
</script>

<section class="card" aria-label="Phone buzzers">
  <h2>📱 Phone buzzers</h2>
  {#if !base}
    <p class="muted small">
      Phone buzzers aren't set up in this copy. A buzzer server's address can go in ⚙ Settings › Buzzer server (in the
      editor).
    </p>
  {:else if !remote.code || remote.status === 'off'}
    <p class="muted small">Players buzz from their phone: start the room, then share the link or the code on stream.</p>
    <div class="row">
      <button class="primary" onclick={onstart} disabled={remote.status === 'connecting'}>
        {remote.status === 'connecting' ? 'Starting the room…' : '▶ Start the room'}
      </button>
      {#if remote.status === 'error' && remote.error}<span class="warn small" role="alert">{remote.error}</span>{/if}
    </div>
  {:else}
    <div class="room">
      {#if link}<QrCode text={link} size={148} label="QR code for the join link {link}" />{/if}
      <div class="info">
        <div class="muted small">Room code</div>
        <div class="code" aria-label="Room code {remote.code}">{remote.code}</div>
        <div class="row">
          <a href={link} target="_blank" rel="noreferrer" class="link">{link}</a>
          <button class="small" onclick={() => copyText(link, 'Join link copied: paste it in the Discord chat')}>📋 Copy link</button>
        </div>
        {#if remote.status === 'online'}
          <span class="muted small" role="status">{joined} of {session.players.length} players joined</span>
        {:else if remote.status === 'error'}
          <span class="warn small" role="alert">⚠ {remote.error || 'Lost the buzzer room'}</span>
          <button class="small" onclick={onstart}>Start a new room</button>
        {:else}
          <span class="warn small" role="status">⚠ Reconnecting to the buzzer room…</span>
        {/if}
      </div>
    </div>
    <PhoneList {session} {max} {onadd} {onreject} {onkick} />
  {/if}
</section>

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--panel);
  }
  h2 {
    margin: 0;
    font-size: 15px;
  }
  p {
    margin: 0;
  }
  .row {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  .room {
    display: flex;
    gap: 16px;
    align-items: center;
    flex-wrap: wrap;
  }
  .info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .code {
    font-size: 44px;
    font-weight: 800;
    letter-spacing: 0.15em;
    line-height: 1.1;
  }
  .link {
    word-break: break-all;
  }
  .small {
    font-size: 12px;
  }
  .warn {
    color: var(--warn);
  }
</style>
