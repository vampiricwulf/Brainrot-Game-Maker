<!-- End of game: tie handling (spec §6.4 step 6), a way back, rematch and shareable results. -->
<script lang="ts">
  import { app } from '../../lib/app.svelte';
  import { getContext, onDestroy } from 'svelte';
  import { NEXT_GAME } from './nextgame';
  import { isFinal, questionSlides, roundName, type Game, type Session } from '../../lib/model';
  import { coWinnersHold, nameList, tiedForFirst, tiedLeaders } from '../../lib/session';
  import { slideHasContent } from '../../lib/usage';
  import { logged } from '../../lib/toolset';
  import { copyText, standingsText } from '../standings';
  import { hostAsk, offerNext } from './slots.svelte';

  let {
    game,
    session,
    onrolloff,
    ontiebreaker,
    oncowinners,
    onback,
    onrematch,
  }: {
    game: Game;
    session: Session;
    onrolloff?: (ids: string[]) => void;
    /** Play the tiebreaker clue. */
    ontiebreaker: () => void;
    /** The tie was settled by declaring co-winners (the winner fanfare plays). */
    oncowinners?: () => void;
    /** Back to the last round (a final round goes back to its reveals). */
    onback: () => void;
    /** New game with the same players, via the pre-game screen. */
    onrematch: () => void;
  } = $props();
  const ties = $derived(coWinnersHold(session) ? [] : tiedLeaders(session));
  /** Level on the top score, settled or not (a settled tie says how, while there still is one). */
  const level = $derived(tiedForFirst(session));
  const lastIndex = $derived(game.rounds.length - 1);
  const last = $derived(game.rounds[lastIndex]);
  /** A tiebreaker clue with a question written (one ticked on but left empty would put a blank slide on stream). */
  const tbReady = $derived(!!game.tiebreaker && questionSlides(game.tiebreaker).some(slideHasContent));

  const copyStandings = () => copyText(standingsText(game, session), 'Standings copied: paste them in chat');
  const rollOff = () => onrolloff?.(ties.map((p) => p.id));

  // A tie for first: settling it is the main button (the tiebreaker clue when the game has one, else a roll-off).
  offerNext('end', () =>
    !ties.length ? null : tbReady ? { label: '❓ Tiebreaker clue', run: ontiebreaker } : onrolloff ? { label: '🎲 Tiebreaker roll-off', key: 'O', run: rollOff } : null,
  );

  /** 🔁 Rematch asks first, in the panel's confirmation strip: the results go. */
  const setAsk = hostAsk();
  let asking = $state(false);
  function askRematch(): void {
    asking = true;
    setAsk({
      text: 'Start a rematch? Scores go back to 0.',
      ok: '🔁 Rematch',
      cancel: 'Stay',
      danger: true,
      onok: () => ((asking = false), setAsk(null), onrematch()),
      oncancel: () => ((asking = false), setAsk(null)),
    });
  }
  onDestroy(() => asking && setAsk(null));

  /** ▶ Next game… (a stream of several games): the editor's Open… / Recent games, the room and audience window kept. */
  const nextGame = getContext<(() => void) | undefined>(NEXT_GAME);
</script>

{#if ties.length}
  <div class="tie">
    <b>Tie for first:</b> {nameList(ties.map((p) => p.name))}
    <div class="row">
      <!-- The main one is in the panel's main cell; these are the other ways to settle it. -->
      {#if tbReady && onrolloff}<button onclick={rollOff} title="O">🎲 Tiebreaker roll-off</button>{/if}
      {#if !tbReady}
        <button disabled title="Write one on the editor's Tiebreaker tab">❓ Tiebreaker clue</button>
      {/if}
      <button
        onclick={() => {
          // (Who they are: a different tie later, after a score is fixed, is still to settle.)
          logged(session, 'Co-winners declared', () => (session.coWinners = ties.map((p) => p.id)));
          oncowinners?.();
        }}>🤝 Declare co-winners</button
      >
    </div>
  </div>
{:else if level.some((p) => p.id === session.rollOffWinner)}
  <!-- Both are steps: ↶ Undo (Ctrl+Z) takes them back. -->
  <div class="muted">
    {session.tiebreakClue ? '❓' : '🎲'}
    {session.players.find((p) => p.id === session.rollOffWinner)?.name} won the tiebreaker {session.tiebreakClue ? 'clue' : 'roll-off'}.
  </div>
{:else if coWinnersHold(session) && level.length}
  <div class="muted">🤝 Co-winners declared.</div>
{/if}
<!-- The way back quiet on the left, the rematch (it clears the results) at the far end. -->
<div class="row">
  {#if last}
    <button class="ghost" onclick={onback}>{isFinal(last) ? '◀ Back to final reveals' : `◀ Back to ${roundName(last, lastIndex)}`}</button>
  {/if}
  <button onclick={copyStandings} title="Copy the standings as one line of text">📋 Copy standings</button>
  <span class="spacer"></span>
  <!-- (While it asks, the strip's own 🔁 Rematch answers.) -->
  <!-- (Not after ▶ Test this round either: a rematch would keep the throwaway test as the game to resume.) -->
  {#if !asking && !app.test}<button onclick={askRematch} title="Same players, scores back to 0, fresh board">🔁 Rematch</button>{/if}
  <!-- (Not after ▶ Test this round: nothing of a test is kept, and 🚪 Exit goes back to the tested round.) -->
  {#if nextGame && !asking && !app.test}
    <button onclick={nextGame} title="Open the stream's next game (Open… / Recent games). The buzzer room, its players and the audience window stay up; these results stay viewable from the editor.">
      ▶ Next game…
    </button>
  {/if}
</div>

<style>
  .tie {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    border: 1px solid var(--warn);
    border-radius: 8px;
  }
</style>
