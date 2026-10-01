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
    onshow,
    oncancel,
  }: {
    game: Game;
    session: Session;
    /** An audience window is open: viewers don't see this window. */
    dual?: boolean;
    onshow: (playerId: string, wager: number) => void;
    /** Back to the board, the tile kept (Esc, even in the wager box). */
    oncancel: () => void;
  } = $props();

  // Initial choice only: whoever is picking (the host can change it). With no picker, nobody: the host picks (never a
  // silent Player 1).
  let playerId = $state(untrack(() => session.dd?.playerId ?? session.currentPickerId ?? ''));

  /** Who found it: the splash on stage (and their phone) names them at once, not only once the question shows. */
  function pick(id: string): void {
    playerId = id;
    if (session.dd) session.dd.playerId = id;
    // Their wager next: typed digits would otherwise select players.
    wagerBox?.focus();
  }
  let wager = $state<number | null>(null);
  let override = $state(false);
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
  <span class="muted">Who found it?{#if !playerId}<span class="warn"> Pick a player.</span>{/if}</span>
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
        autofocus
        onkeydown={(e) => {
          if (e.key === 'Enter') enter(e);
          else if (e.key === 'Escape') oncancel();
        }}
      />
    </label>
    <button class="small ghost" onclick={() => (wager = cap)}>True Daily Double ({formatPoints(cap, sym)})</button>
    <span class="muted small">Max {formatPoints(cap, sym)} (their score or the round's top value)</span>
    <label class="check small">
      <input type="checkbox" bind:checked={override} onkeydown={(e) => e.key === 'Enter' && enter(e)} /> Ignore the limit
    </label>
  </div>
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
  input[type='number'] {
    width: 110px;
  }
</style>
