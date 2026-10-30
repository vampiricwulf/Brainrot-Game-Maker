<!--
  Daily Double: who found it, their wager, then Show question ▶ at the Wager row's end (the main button's step too). It
  opens at its top, the keys in the Wager box.
-->
<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { textOn } from '../../lib/colors';
  import { formatPoints, wholePoints, type Game, type Session } from '../../lib/model';
  import { ddCap, score } from '../../lib/session';
  import { offerExposed, offerNext, type NextAction } from './slots.svelte';
  import { VERBS } from './verbs';
  import StepButton from './StepButton.svelte';
  import { toast } from '../../lib/app.svelte';
  import { teamsOn } from '../../lib/buzz';
  import { buzzerOn } from '../../lib/remote.svelte';

  let {
    game,
    session,
    dual = false,
    override = $bindable(true),
    phones = [],
    phoneNote = '',
    onshow,
    oncancel,
  }: {
    game: Game;
    session: Session;
    /** An audience window is open: viewers don't see this window. */
    dual?: boolean;
    /** "Ignore the limit" is ticked (the default; bound, so a wager sent from a phone is held to the max only when it's off). */
    override?: boolean;
    /** Players (teams) with a phone in the buzzer room: theirs can send the wager from it. */
    phones?: string[];
    /** Why phones can't send wagers here (an older buzzer server), or ''. */
    phoneNote?: string;
    onshow: (playerId: string, wager: number) => void;
    /** Back to the board, the tile kept (Esc, even in the wager box). */
    oncancel: () => void;
  } = $props();

  // Initial choice only: whoever is picking (the host can change it). With no picker, nobody: the host picks (never a
  // silent Player 1).
  let playerId = $state(untrack(() => session.dd?.playerId ?? session.currentPickerId ?? ''));
  // The one picked taken out of the game (👥 Players) meanwhile: nobody picked, not a player who isn't there.
  $effect(() => {
    const ids = session.players.map((p) => p.id);
    untrack(() => {
      if (playerId && !ids.includes(playerId)) playerId = '';
    });
  });

  /** Who found it: the splash on stage (and their phone) names them at once, not only once the question shows. */
  function pick(id: string): void {
    // Someone else's turn: a wager their phone sent isn't this player's.
    if (id !== playerId && session.dd?.draftFrom === 'phone') {
      wager = null;
      typed(null);
    }
    playerId = id;
    if (session.dd) session.dd.playerId = id;
    // Their wager next: typed digits would otherwise select players.
    wagerBox?.focus();
  }
  // (Kept in the session as it's typed, so a wager sent from the player's phone can fill it, and a reload keeps it.)
  let wager = $state<number | null>(untrack(() => session.dd?.draft ?? null));
  /** The host typed (or picked) a wager: it's the host's now. */
  function typed(v: number | null): void {
    const dd = session.dd;
    if (!dd) return;
    if (v === null) delete dd.draft;
    else dd.draft = v;
    delete dd.draftFrom;
    delete dd.draftBy;
  }
  // A wager sent from their phone fills the box (the host can type over it).
  $effect(() => {
    const d = session.dd?.draft;
    untrack(() => {
      if (d !== undefined && d !== wager) wager = d;
    });
  });
  const fromPhone = $derived(session.dd?.draftFrom === 'phone' && wager === session.dd?.draft);
  /** One window: viewers see this panel, so the amount a phone sent stays hidden in the box (typing over it shows). */
  const hideAmount = $derived(!dual && fromPhone);
  const hasPhone = $derived(!!playerId && phones.includes(playerId));
  let wagerBox = $state<HTMLInputElement>();
  /** Phone buzzer teams: each row is a team, and what it says here too ("Pick a team."). */
  const noun = $derived(buzzerOn(game.settings) && teamsOn(game.settings) ? 'team' : 'player');
  const sym = $derived(game.settings.currencySymbol);
  const cap = $derived(playerId ? ddCap(session, game, playerId) : 0);
  const valid = $derived(!!playerId && wager !== null && wager >= 0 && (override || wager <= cap));

  /**
   * Enter in the wager box (or on "Ignore the limit"): show the question. The key goes no further: the 👁 Reveal answer
   * button that takes the focus next must not get this same Enter (the answer would be on stream at once).
   */
  function enter(e: KeyboardEvent): void {
    e.preventDefault();
    e.stopPropagation();
    if (valid) onshow(playerId, wager!);
    // (Why not, rather than nothing.)
    else
      toast(
        !playerId
          ? 'Pick who found it first'
          : wager === null
            ? 'Type a wager first'
            : wager < 0
              ? 'A wager can’t be below 0'
              : `That’s over the max (${formatPoints(cap, sym)}): type less, or tick Ignore the limit`,
      );
  }

  // One window: the status line's ⚠ Viewers see this chip says what viewers can read here.
  offerExposed(() => '⚠ Viewers can see this: they see this window, the wager as you type it too.');

  /**
   * Show question ▶: the main button's step, and the box's at the Wager row's end (Enter in the wager box does it too),
   * greyed with why until there's a wager to show it with.
   */
  const showStep = $derived<NextAction>({
    label: VERBS.showQuestion.label,
    key: '⏎',
    title: valid
      ? 'Enter in the wager box'
      : !playerId
        ? 'Pick who found it first'
        : wager !== null && wager < 0
          ? 'A wager can’t be below 0'
          : 'Type a wager within the max (or tick Ignore the limit)',
    disabled: !valid,
    run: () => valid && onshow(playerId, wager!),
  });
  offerNext('dd', () => showStep);

  // The keys in the Wager box, the box at its top: the heading and the names stay in view (focus would scroll it down to
  // the box, in one window where the panel keeps the board's height).
  onMount(() => wagerBox?.focus({ preventScroll: true }));
</script>

<div class="dd">
  <!-- (The heading leads the names' row, so the names and the Wager row are in view with it: in one window the panel keeps
       the board's height while this is up, and the rest scrolls. See HostPanel's ddHold.) -->
  <div class="row">
    <span><b>Daily Double!</b> <span class="muted">Who found it?{#if !playerId}{' '}<span class="warn">Pick a {noun}.</span>{:else}{' '}Click another to change.{/if}</span></span>
    {#each session.players as p, i (p.id)}
      <button
        class="chip"
        style:border-color={p.color}
        style:background={playerId === p.id ? p.color : undefined}
        style:color={playerId === p.id ? textOn(p.color) : undefined}
        aria-pressed={playerId === p.id}
        data-player-id={p.id}
        onclick={() => pick(p.id)}
        title={i < 9 ? (playerId ? 'Click to change who found it (number keys pick only while nobody is picked)' : `Key ${i + 1}`) : undefined}
      >
        {#if i < 9}<span class="key" class:gone={!!playerId}>{i + 1}</span>{/if}{p.name} <span class="score small">{formatPoints(score(session, p.id), sym)}</span>
      </button>
    {/each}
  </div>
  <!-- (One line: what's left of the max's words is cut short, its tooltip whole.) -->
  <div class="row wager">
    <label class="check">
      Wager
      <input
        type="number"
        min="0"
        bind:value={() => (hideAmount ? null : wager), (v) => (wager = wholePoints(v))}
        placeholder={hideAmount ? 'hidden' : undefined}
        bind:this={wagerBox}
        oninput={(e) => typed(e.currentTarget.value === '' ? null : wholePoints(+e.currentTarget.value))}
        onkeydown={(e) => {
          if (e.key === 'Enter') enter(e);
          else if (e.key === 'Escape') oncancel();
          // Nobody picked yet: 1–9 pick who found it (as everywhere else), not a wager.
          else if (!playerId && /^[1-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey && session.players[+e.key - 1]) {
            e.preventDefault();
            pick(session.players[+e.key - 1].id);
          }
        }}
      />
    </label>
    <!-- Next to the box it's about, in the same place whatever the wager or the player (it never jumps). -->
    <label class="check small">
      <input type="checkbox" bind:checked={override} onkeydown={(e) => e.key === 'Enter' && enter(e)} /> Ignore the limit
    </label>
    <button class="small ghost" disabled={!playerId} onclick={() => ((wager = cap), typed(cap), wagerBox?.focus())} title={playerId ? undefined : 'Pick who found it first'}
      >True Daily Double{playerId ? ` (${formatPoints(cap, sym)})` : ''}</button
    >
    {#if playerId}
      {@const max = `${override ? 'TV max' : 'Max'} ${formatPoints(cap, sym)} (their score or the round's top value)${override ? ': not enforced' : ''}`}
      <span class="muted small max" title={max}>{max}</span>
    {:else}
      <span class="spacer"></span>
    {/if}
    <StepButton step={showStep} />
  </div>
  <!-- The phones' line: there from the start when anyone has one (the box doesn't grow as a wager comes in). -->
  {#if phones.length}
    <span class="small" data-dd-phones>
      {#if fromPhone}
        <span class="phone" title="Sent from their phone. You can still type over it." data-dd-phone
          >📱 from phone{session.dd?.draftBy ? ` · sent by ${session.dd.draftBy}` : ''}</span
        >
        <span class="muted">{dual ? '· you can still type over it (only you see it).' : '· its amount stays hidden (viewers see this window) · you can type over it.'}</span>
      {:else if hasPhone}
        <span class="muted"
          >{#if wager === null}<span data-dd-phone>📱 waiting…</span>{' '}{/if}{noun === 'team' ? 'A phone on the team can send its wager' : 'Their phone can send the wager'}: {dual
            ? 'it fills in here (only you see it).'
            : 'it comes in hidden (viewers see this window).'}</span
        >
      {:else if playerId}
        <span class="muted">📱 No phone for this {noun}: type their wager.</span>
      {:else}
        <span class="muted">📱 Once you pick them, a {noun} with a phone can send their wager from it.</span>
      {/if}
    </span>
  {:else if phoneNote}
    <span class="muted small">{phoneNote}</span>
  {/if}
</div>

<style>
  .key {
    font-size: 12px;
    opacity: 0.7;
    margin-right: 4px;
  }
  /* Someone is picked: number keys type the wager now, not pick, so the key goes (its room kept: the chips don't move). */
  .key.gone {
    visibility: hidden;
  }
  .dd {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px 8px;
    border: 1px solid #b54cff;
    border-radius: 8px;
    background: rgba(122, 0, 255, 0.12);
  }
  .chip {
    border-width: 2px;
  }
  .small {
    font-size: 12px;
  }
  /* The score reads on the chip as it is: the muted grey on the outlined chip, the chip's own text color (bold) once the
     chip is filled with the player's color. */
  .score {
    color: var(--muted);
  }
  .chip[aria-pressed='true'] .score {
    color: inherit;
    font-weight: 700;
  }
  .warn {
    color: var(--warn);
  }
  .phone {
    color: var(--accent);
    font-weight: 600;
  }
  input[type='number'] {
    width: 110px;
  }
  /* The max's words take the room left (cut short), so Show question ▶ stays at the row's end, on its line. */
  .max {
    flex: 1 1 0;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
</style>
