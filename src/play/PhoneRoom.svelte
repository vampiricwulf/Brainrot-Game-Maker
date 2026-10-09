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
    onkick: (seatId: string, free?: boolean) => void;
    /** ✕ Close the room: the phones are told the game is over. */
    onclose: () => void;
    onlock: (on: boolean) => void;
    /** Teams: take one person off their team / put them on another. */
    onkickmember: (seatId: string, member: string, name: string) => void;
    onmove: (member: string, seatId: string, name: string) => void;
    /** ⚙ Set up phone buzzers… (no buzzer server yet): ⚙ Settings, at the phone buzzers. None in a player-only file. */
    onsetup?: () => void;
  } = $props();
  /** Phones in the room with a seat: closing it (or turning Buzzer mode off, or Teams on or off) asks first. */
  const seatedPhones = $derived(remote.phones.filter((p) => p.seatId).length);
  /** Asking before closing the room: ✕ Close the room, or Buzzer mode turned off. */
  let closing = $state<'close' | 'off' | null>(null);
  /** Asking before turning Teams on (true) or off (false) with phones in the room: every phone picks again. */
  let switching = $state<boolean | null>(null);
  /** Still a question: phones in the room, Teams not that way already (an undo), and not closing the room instead. */
  const asking = $derived(switching !== null && !!seatedPhones && !!settings.buzzTeams !== switching && !closing);
  // Nothing left to ask: the question goes for good (it doesn't come back if phones join again later).
  $effect(() => {
    if (switching !== null && !asking) switching = null;
  });
  /** The options' changes: Teams with phones in the room asks first, as closing the room does. */
  const setOption: SetBuzzSetting = (key, value, label) => {
    if (key === 'buzzTeams' && seatedPhones && !!value !== !!settings.buzzTeams) {
      // One question at a time: the newest one wins (a "Close the room?" still up goes).
      closing = null;
      switching = !!value;
    } else onset(key, value, label);
  };
  /** The browser says there's no network (it can be wrong the other way, never this way round for long). */
  let offline = $state(typeof navigator !== 'undefined' && navigator.onLine === false);
  $effect(() => {
    const on = () => (offline = navigator.onLine === false);
    addEventListener('online', on);
    addEventListener('offline', on);
    return () => (removeEventListener('online', on), removeEventListener('offline', on));
  });

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
      {#if app.playerOnly}
        <!-- An exported game made without a buzzer server: nothing to set up here. -->
        This file has no phone buzzers{settings.buzzer ? ': you pick who answers (1–9 or a click)' : ''}.
      {:else}
        Players can buzz in from their phones once phone buzzers are set up{settings.buzzer ? '. Until then you pick who answers (1–9 or a click)' : ''}.
        {#if !onsetup}Set them up in ⚙ Settings (in the editor).{/if}
      {/if}
    </p>
    {#if onsetup}
      <div class="row">
        <button onclick={onsetup} title="Where phones meet the game: ⚙ Settings › Phone buzzers">⚙ Set up phone buzzers…</button>
      </div>
    {/if}
  {:else}
    <label class="check">
      <input
        type="checkbox"
        checked={!!settings.buzzer}
        onchange={(e) => {
          // Off with phones in the room ends it: asked first (they'd all have to join again with a new code).
          if (!e.currentTarget.checked && seatedPhones) {
            e.currentTarget.checked = true;
            closing = 'off';
            return;
          }
          onset('buzzer', e.currentTarget.checked || undefined, 'Buzzer mode');
        }}
      />
      Buzzer mode: players buzz in from their phones
    </label>
    {#if !settings.buzzer}
      <p class="muted small">
        Turn it on and players buzz in from their phone during a clue: the fastest reaction answers, and a wrong answer
        locks that player out of the clue. You can still pick who answers by hand (1–9 or a click).
      </p>
    {:else}
      <BuzzerOptions {settings} onset={setOption} />
    {/if}
  {/if}
  {#if !base || !settings.buzzer}
    <!-- Nothing to start until it's on. -->
  {:else if !remote.code || remote.status === 'off' || remote.status === 'error'}
    <!-- (A room that ended or was lost: why, and a new one. Its code, link and QR code would only share a dead room.) -->
    <p class="muted small">
      Start the room, then share the link or the code on stream. The room runs online: this computer and the players’
      phones need the internet (any network: they don’t have to be on yours).
    </p>
    {#if offline}<p class="warn small" role="status">📵 This computer seems to be offline: connect to the internet to start the room.</p>{/if}
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
          <button
            class="small ghost"
            onclick={() => (seatedPhones ? (closing = 'close') : onclose())}
            title="Phones are told the game is over. (◀ Back to editor keeps the room open.)">✕ Close the room</button
          >
        </div>
        {#if remote.status === 'online'}
          {#if settings.buzzTeams}
            <span class="muted small" role="status">{people} {people === 1 ? 'person' : 'people'} on {joined} of {session.players.length} teams</span>
          {:else}
            <span class="muted small" role="status">{joined} of {session.players.length} players joined</span>
          {/if}
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
  {#if closing}
    <div class="ask" role="alertdialog" aria-label="Close the room?">
      <span>
        {seatedPhones}
        {seatedPhones === 1 ? 'phone is' : 'phones are'} in the room: {closing === 'off' ? 'turning Buzzer mode off closes it' : 'closing it'} tells them the game is over, and
        they’d join again with a new code.
      </span>
      <div class="row">
        <button
          class="danger small"
          onclick={() => {
            const what = closing;
            closing = null;
            if (what === 'off') onset('buzzer', undefined, 'Buzzer mode');
            else onclose();
          }}>{closing === 'off' ? 'Turn off and close' : 'Close the room'}</button
        >
        <!-- svelte-ignore a11y_autofocus -->
        <button class="small" autofocus onclick={() => (closing = null)}>Keep it open</button>
      </div>
    </div>
  {/if}
  {#if asking}
    <div class="ask" role="alertdialog" aria-label="Turn teams {switching ? 'on' : 'off'}?">
      <span>
        {seatedPhones}
        {seatedPhones === 1 ? 'phone is' : 'phones are'} in the room: turning teams {switching ? 'on' : 'off'} sends
        {seatedPhones === 1 ? 'it' : 'them all'} back to {switching ? 'pick a team' : 'tap their name'}.
      </span>
      <div class="row">
        <button
          class="danger small"
          onclick={() => {
            const on = switching;
            switching = null;
            onset('buzzTeams', on || undefined, 'Teams');
          }}>Turn teams {switching ? 'on' : 'off'}</button
        >
        <!-- svelte-ignore a11y_autofocus -->
        <button class="small" autofocus onclick={() => (switching = null)}>Keep teams {switching ? 'off' : 'on'}</button>
      </div>
    </div>
  {/if}
</section>

<style>
  .ask {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 8px;
    padding: 8px 10px;
    border: 1px solid var(--warn, #e0a030);
    border-radius: 8px;
  }
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
