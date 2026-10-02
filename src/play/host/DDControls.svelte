<!-- Daily Double: pick the player and wager before the clue is shown. -->
<script lang="ts">
  import { untrack } from 'svelte';
  import { textOn } from '../../lib/colors';
  import { formatPoints, type Game, type Session } from '../../lib/model';
  import { ddCap, score } from '../../lib/session';
  import { offerNext } from './slots.svelte';

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
  const hasPhone = $derived(!!playerId && phones.includes(playerId));
  let wagerBox = $state<HTMLInputElement>();
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
  }

  // The main button, in the panel's main cell (Enter in the wager box does it too).
  offerNext('dd', () => ({
    label: 'Show question ▶',
    key: '⏎',
    title: valid ? 'Enter in the wager box' : playerId ? 'Type a wager within the max (or tick Ignore the limit)' : 'Pick who found it first',
    disabled: !valid,
    run: () => valid && onshow(playerId, wager!),
  }));
</script>

<div class="dd">
  <b>Daily Double!</b>
  <span class="muted">Who found it?{#if !playerId}{' '}<span class="warn">Pick a player.</span>{/if}</span>
  <div class="row">
    {#each session.players as p (p.id)}
      <button
        class="chip"
        style:border-color={p.color}
        style:background={playerId === p.id ? p.color : undefined}
        style:color={playerId === p.id ? textOn(p.color) : undefined}
        aria-pressed={playerId === p.id}
        onclick={() => pick(p.id)}
      >
        {p.name} <span class="muted small">{formatPoints(score(session, p.id), sym)}</span>
      </button>
    {/each}
  </div>
  <div class="row">
    <label class="check">
      Wager
      <!-- svelte-ignore a11y_autofocus -->
      <input
        type="number"
        min="0"
        bind:value={wager}
        bind:this={wagerBox}
        oninput={(e) => typed(e.currentTarget.value === '' || !Number.isFinite(+e.currentTarget.value) ? null : +e.currentTarget.value)}
        autofocus
        onkeydown={(e) => {
          if (e.key === 'Enter') enter(e);
          else if (e.key === 'Escape') oncancel();
        }}
      />
    </label>
    <!-- Next to the box it's about, in the same place whatever the wager or the player (it never jumps). -->
    <label class="check small">
      <input type="checkbox" bind:checked={override} onkeydown={(e) => e.key === 'Enter' && enter(e)} /> Ignore the limit
    </label>
    <button class="small ghost" disabled={!playerId} onclick={() => ((wager = cap), typed(cap))} title={playerId ? undefined : 'Pick who found it first'}
      >True Daily Double{playerId ? ` (${formatPoints(cap, sym)})` : ''}</button
    >
    {#if playerId}
      <span class="muted small">{override ? 'TV max' : 'Max'} {formatPoints(cap, sym)} (their score or the round's top value){override ? ': not enforced' : ''}</span>
    {/if}
  </div>
  <!-- The phones' line: there from the start when anyone has one (the box doesn't grow as a wager comes in). -->
  {#if phones.length}
    <span class="small" data-dd-phones>
      {#if fromPhone}
        <span class="phone" title="Sent from their phone. You can still type over it." data-dd-phone
          >📱 from phone{session.dd?.draftBy ? ` · sent by ${session.dd.draftBy}` : ''}</span
        >
        <span class="muted">· you can still type over it (only you see it).</span>
      {:else if hasPhone}
        <span class="muted"
          >{#if wager === null}<span data-dd-phone>📱 waiting…</span>{' '}{/if}Their phone can send the wager: it fills in here (only you see it).</span
        >
      {:else if playerId}
        <span class="muted">📱 No phone for this player: type their wager.</span>
      {:else}
        <span class="muted">📱 Once you pick them, a player with a phone can send their wager from it.</span>
      {/if}
    </span>
  {:else if phoneNote}
    <span class="muted small">{phoneNote}</span>
  {/if}
  {#if !dual}
    <span class="exposed">⚠ Viewers can see this: they see this window, the wager as you type it too.</span>
  {/if}
</div>

<style>
  .dd {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
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
  .warn {
    color: var(--warn);
  }
  .exposed {
    color: var(--warn);
    font-size: 12px;
  }
  .phone {
    color: var(--accent);
    font-weight: 600;
  }
  input[type='number'] {
    width: 110px;
  }
</style>
