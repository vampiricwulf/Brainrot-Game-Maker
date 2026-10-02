<!--
  Pre-game: 📱 Phone buzzers. Turn Buzzer mode on and set its options (saved with the game), start the room, then
  players open the link (or scan the code) and tap their name.
-->
<script lang="ts">
  import type { GameSettings, Session } from '../lib/model';
  import BuzzerOptions, { type SetBuzzSetting } from './BuzzerOptions.svelte';
  import QrCode from '../lib/QrCode.svelte';
  import { buzzerBase, remote, roomHasTeams, roomLink } from '../lib/remote.svelte';
  import { app } from '../lib/app.svelte';
  import { copyText } from './standings';
  import PhoneList from './PhoneList.svelte';

  let {
    session,
    settings,
    onset,
    max,
    onstart,
    onadd,
    onreject,
    onkick,
    onclose,
    onlock,
    onkickmember,
    onmove,
    onsetup,
  }: {
    session: Session;
    settings: GameSettings;
    onset: SetBuzzSetting;
    max: number;
    onstart: () => void;
    onadd: (conn: string, name: string) => void;
    onreject: (conn: string) => void;
    onkick: (seatId: string) => void;
    /** ✕ Close the room: the phones are told the game is over. */
    onclose: () => void;
    onlock: (on: boolean) => void;
    /** Teams: take one person off their team / put them on another. */
    onkickmember: (seatId: string, member: string, name: string) => void;
    onmove: (member: string, seatId: string, name: string) => void;
    /** ⚙ Set up phone buzzers… (no buzzer server yet): ⚙ Settings, at the phone buzzers. None in a player-only file. */
    onsetup?: () => void;
  } = $props();

  const base = $derived(buzzerBase());
  const link = $derived(roomLink());
  const joined = $derived(session.players.filter((p) => remote.phones.some((ph) => ph.seatId === p.id && ph.connected)).length);
  /** Teams: the people (phones) on a team. */
  const people = $derived(remote.phones.filter((ph) => ph.member && ph.connected && session.players.some((p) => p.id === ph.seatId)).length);
</script>

<section class="card" aria-label="Phone buzzers">
  <h2>📱 Phone buzzers</h2>
  {#if !base}
    <!-- (A game saved with Buzzer mode on plays without it here: you pick who answers.) -->
    <p class="muted small">
      Players can buzz in from their phones once phone buzzers are set up{settings.buzzer ? '. Until then you pick who answers (1–9 or a click)' : ''}.
      {#if !onsetup && !app.playerOnly}Set them up in ⚙ Settings (in the editor).{/if}
    </p>
    {#if onsetup}
      <div class="row">
        <button onclick={onsetup} title="Where phones meet the game: ⚙ Settings › Phone buzzers">⚙ Set up phone buzzers…</button>
      </div>
    {/if}
  {:else}
    <label class="check">
      <input type="checkbox" checked={!!settings.buzzer} onchange={(e) => onset('buzzer', e.currentTarget.checked || undefined, 'Buzzer mode')} />
      Buzzer mode: players buzz in from their phones
    </label>
    {#if !settings.buzzer}
      <p class="muted small">
        Turn it on and players buzz in from their phone during a clue: the fastest reaction answers, and a wrong answer
        locks that player out of the clue. You can still pick who answers by hand (1–9 or a click).
      </p>
    {:else}
      <BuzzerOptions {settings} {onset} />
    {/if}
  {/if}
  {#if !base || !settings.buzzer}
    <!-- Nothing to start until it's on. -->
  {:else if !remote.code || remote.status === 'off'}
    <p class="muted small">Start the room, then share the link or the code on stream.</p>
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
          <button class="small ghost" onclick={onclose} title="Phones are told the game is over. (◀ Back to editor keeps the room open.)">✕ Close the room</button>
        </div>
        {#if remote.status === 'online'}
          {#if settings.buzzTeams}
            <span class="muted small" role="status">{people} {people === 1 ? 'person' : 'people'} on {joined} of {session.players.length} teams</span>
          {:else}
            <span class="muted small" role="status">{joined} of {session.players.length} players joined</span>
          {/if}
        {:else if remote.status === 'error'}
          <span class="warn small" role="alert">⚠ {remote.error || 'Lost the buzzer room'}</span>
          <button class="small" onclick={onstart}>Start a new room</button>
        {:else}
          <span class="warn small" role="status">⚠ Reconnecting to the buzzer room…</span>
        {/if}
      </div>
    </div>
    {#if settings.buzzTeams && remote.status === 'online' && !roomHasTeams()}
      <p class="warn small" role="alert">
        ⚠ This buzzer server doesn't know teams yet (it needs updating): phones join as players, one each.
      </p>
    {:else if settings.buzzTeams}
      <p class="muted small">Teams: each player is a team. People pick theirs on their phone and type their own name.</p>
    {/if}
    <PhoneList {session} {max} {onadd} {onreject} {onkick} {onlock} teams={!!settings.buzzTeams} {onkickmember} {onmove} />
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
