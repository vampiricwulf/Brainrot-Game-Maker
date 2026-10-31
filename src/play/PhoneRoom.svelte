<!--
  Pre-game: 📱 Phone buzzers, in the order it's used. Turn phone buzzers on (Buzzer mode, Teams beside it), start the
  room (its code, link and QR code then), see who's in (who's asking to join first, then each player's phone), the
  options folded under ▸ Buzzer options (saved with the game), and at the foot 🔒 Lock seats and ⏹ Close the room….
  Players open the link (or scan the code) and tap their name.
-->
<script lang="ts">
  import type { GameSettings, Session } from '../lib/model';
  import BuzzerOptions, { type SetBuzzSetting } from './BuzzerOptions.svelte';
  import QrCode from '../lib/QrCode.svelte';
  import { buzzerBase, remote, roomCanColor, roomHasTeams, roomLink } from '../lib/remote.svelte';
  import { MAX_PHONES } from '../lib/buzzproto';
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
    onmenu,
    onrename,
    uses = '',
  }: {
    session: Session;
    settings: GameSettings;
    onset: SetBuzzSetting;
    max: number;
    onstart: () => void;
    onadd: (conn: string, name: string) => void;
    onreject: (conn: string) => void;
    onkick: (seatId: string, free?: boolean) => void;
    /** ⏹ Close the room…: the phones are sent out (told the game is over, or before it, that the host closed the room). */
    onclose: () => void;
    onlock: (on: boolean) => void;
    /** Teams: take one person off their team / put them on another. */
    onkickmember: (seatId: string, member: string, name: string) => void;
    onmove: (member: string, seatId: string, name: string) => void;
    /** ⚙ Set up phone buzzers… (no buzzer server yet): ⚙ Settings, at the phone buzzers. None in a player-only file. */
    onsetup?: () => void;
    /** A player's row: the 👥 list's menu for them, and F2 renaming them there. */
    onmenu?: (e: MouseEvent, id: string) => void;
    onrename?: (id: string) => void;
    /** What this game uses phones for, and what the host does without them (said while phone buzzers are off). */
    uses?: string;
  } = $props();
  /** Phones in the room with a seat: turning Teams on or off asks first (every phone picks again). */
  const seatedPhones = $derived(remote.phones.filter((p) => p.seatId).length);
  /** Phones in the room, on the join screen too: closing it (or turning Buzzer mode off) asks first. */
  const inRoom = $derived(remote.phones.filter((p) => p.connected).length);
  /** Asking before closing the room: ⏹ Close the room…, or Buzzer mode turned off. */
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

  /** An option this buzzer server can't do: the ▸ Buzzer options fold opens by itself to say so. */
  const optionsProblem = $derived(
    remote.code && remote.status === 'online' && !settings.buzzTeams && !settings.phoneColorsOff && !roomCanColor()
      ? "This buzzer server can't let players pick their color yet (it needs updating): they play in the color you give them."
      : '',
  );
  const base = $derived(buzzerBase());
  const link = $derived(roomLink());
  const joined = $derived(session.players.filter((p) => remote.phones.some((ph) => ph.seatId === p.id && ph.connected)).length);
  /** Teams: the people (phones) on a team. */
  const people = $derived(remote.phones.filter((ph) => ph.member && ph.connected && session.players.some((p) => p.id === ph.seatId)).length);
</script>

{#snippet teamsNote()}
  {#if settings.buzzTeams}
    <p class="muted small">
      Teams: each player is a team. People pick theirs on their phone and type their own name; up to {MAX_PHONES} phones can
      be in the room at once.
    </p>
  {/if}
{/snippet}

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
    <!-- 1. On or off, Teams beside it. -->
    <div class="row top">
      <label class="check">
        <input
          type="checkbox"
          checked={!!settings.buzzer}
          onchange={(e) => {
            // Off with phones in the room ends it: asked first (they'd all have to join again with a new code).
            if (!e.currentTarget.checked && inRoom) {
              e.currentTarget.checked = true;
              closing = 'off';
              return;
            }
            onset('buzzer', e.currentTarget.checked || undefined, 'Buzzer mode');
          }}
        />
        <span><b>Phone buzzers on</b> (Buzzer mode): players buzz, wager, answer and get secret cards on their phones</span>
      </label>
      {#if settings.buzzer}
        <label
          class="check"
          title="Each row of the list becomes a team (👥 Teams). On their phone people pick a team and type their own name; whoever on the team buzzes first answers for it, and a wrong answer locks out the whole team."
        >
          <input
            type="checkbox"
            checked={!!settings.buzzTeams}
            onchange={(e) => {
              // The box follows the setting: with phones in the room the card asks first, and "Keep" leaves it as it was.
              const on = e.currentTarget.checked;
              e.currentTarget.checked = !!settings.buzzTeams;
              setOption('buzzTeams', on || undefined, 'Teams');
            }}
          />
          Teams: people join a team, anyone on it can buzz for it
        </label>
      {/if}
    </div>
    {#if !settings.buzzer}
      <!-- What this game needs phones for, and what you do without them; else what phone buzzers do. -->
      <p class="muted small" data-phone-uses>
        {uses ||
          'Turn them on and players buzz in from their phone during a clue: the fastest reaction answers, and a wrong answer locks that player out of the clue. You can still pick who answers by hand (1–9 or a click).'}
      </p>
    {/if}
  {/if}
  {#if !base || !settings.buzzer}
    <!-- Nothing to start until it's on. -->
  {:else if !remote.code || remote.status === 'off' || remote.status === 'error'}
    <!-- 2. The room: its one next step, right under the tick box. (A room that ended or was lost: why, and a new one. Its
         code, link and QR code would only share a dead room.) -->
    <div class="row">
      <button class="primary" onclick={onstart} disabled={remote.status === 'connecting'}>
        {remote.status === 'connecting' ? 'Starting the room…' : '▶ Start the room'}
      </button>
      {#if remote.status === 'error' && remote.error}<span class="warn small selectable" role="alert">{remote.error}</span>{/if}
    </div>
    {#if offline}<p class="warn small" role="status">📵 This computer seems to be offline: connect to the internet to start the room.</p>{/if}
    <p class="muted small">
      Then share the link or the code on stream. The room runs online: this computer and the players’ phones need the
      internet (any network: they don’t have to be on yours).
    </p>
    {@render teamsNote()}
    <BuzzerOptions {settings} onset={setOption} problem={optionsProblem} />
  {:else}
    <!-- 2. The room: the QR code, the big code, the link. -->
    <div class="room">
      {#if link}<QrCode text={link} size={148} label="QR code for the join link {link}" />{/if}
      <div class="info">
        <div class="muted small">Room code</div>
        <div class="code selectable whole" aria-label="Room code {remote.code}">{remote.code}</div>
        <div class="row">
          <a href={link} target="_blank" rel="noreferrer" class="link">{link}</a>
          <button class="small" onclick={() => copyText(link, 'Join link copied: paste it in the Discord chat')}>📋 Copy link</button>
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
    {@render teamsNote()}
    {#if settings.buzzTeams && remote.status === 'online' && !roomHasTeams()}
      <p class="warn small" role="alert">
        ⚠ This buzzer server doesn't know teams yet (it needs updating): phones join as players, one each.
      </p>
    {/if}
    <!-- 3. Who's in: who's asking to join first, then each player's phone. -->
    <PhoneList {session} {max} {onadd} {onreject} {onkick} teams={!!settings.buzzTeams} {onkickmember} {onmove} {onmenu} {onrename} />
    <!-- 4. The options, folded. -->
    <BuzzerOptions {settings} onset={setOption} problem={optionsProblem} />
    <!-- 5. Lock seats, and closing the room apart at the other end (it asks while any phone is in). -->
    <div class="row foot">
      {#if session.remote}
        <label class="check small lock">
          <input type="checkbox" checked={!!session.remote.locked} onchange={(e) => onlock(e.currentTarget.checked)} />
          🔒 Lock seats: no new phones ({settings.buzzTeams ? 'people already on a team' : 'players already in'} can come back)
        </label>
      {/if}
      <button
        class="small ghost close"
        onclick={() => (inRoom ? (closing = 'close') : onclose())}
        title="Sends the phones out of the room (asks first while any phone is in). ({app.playerOnly ? '◀ Back' : '◀ Back to editor'} keeps the room open.)">⏹ Close the room…</button
      >
    </div>
  {/if}
  {#if closing}
    <div class="ask" role="alertdialog" aria-label="Close the room?">
      <span>
        {inRoom}
        {inRoom === 1 ? 'phone is' : 'phones are'} in the room: {closing === 'off' ? 'turning phone buzzers off closes it, which sends them out' : 'closing it sends them out'},
        and they’d join again with a new code.
      </span>
      <div class="row">
        <!-- svelte-ignore a11y_autofocus -->
        <button class="small" autofocus onclick={() => (closing = null)}>Keep it open</button>
        <button
          class="danger small"
          onclick={() => {
            const what = closing;
            closing = null;
            if (what === 'off') onset('buzzer', undefined, 'Buzzer mode');
            else onclose();
          }}>{closing === 'off' ? 'Turn off and close' : 'Close the room'}</button
        >
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
        <!-- svelte-ignore a11y_autofocus -->
        <button class="small" autofocus onclick={() => (switching = null)}>Keep teams {switching ? 'off' : 'on'}</button>
        <button
          class="danger small"
          onclick={() => {
            const on = switching;
            switching = null;
            onset('buzzTeams', on || undefined, 'Teams');
          }}>Turn teams {switching ? 'on' : 'off'}</button
        >
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
  .top {
    gap: 6px 16px;
  }
  /* 🔒 Lock seats at the left, ⏹ Close the room… apart at the right. */
  .foot {
    justify-content: space-between;
    padding-top: 4px;
  }
  .foot .close {
    margin-left: auto;
  }
  .lock {
    display: flex;
    align-items: center;
    gap: 6px;
  }
</style>
