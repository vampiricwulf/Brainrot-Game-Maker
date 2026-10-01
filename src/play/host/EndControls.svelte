<!-- End of game: tie handling (spec §6.4 step 6), a way back, rematch and shareable results. -->
<script lang="ts">
  import { isFinal, roundName, type Game, type Session } from '../../lib/model';
  import { nameList, tiedLeaders } from '../../lib/session';
  import { logged } from '../../lib/toolset';
  import { copyText, standingsText } from '../standings';

  let {
    game,
    session,
    onrolloff,
    ontiebreaker,
    onback,
    onrematch,
  }: {
    game: Game;
    session: Session;
    onrolloff?: (ids: string[]) => void;
    /** Play the tiebreaker clue. */
    ontiebreaker: () => void;
    /** Back to the last round (a final round goes back to its reveals). */
    onback: () => void;
    /** New game with the same players, via the pre-game screen. */
    onrematch: () => void;
  } = $props();
  const ties = $derived(tiedLeaders(session));
  const lastIndex = $derived(game.rounds.length - 1);
  const last = $derived(game.rounds[lastIndex]);

  const copyResults = () => copyText(standingsText(game, session), 'Results copied: paste them in chat');
</script>

{#if ties.length && !session.coWinners}
  <div class="tie">
    <b>Tie for first:</b> {nameList(ties.map((p) => p.name))}
    <div class="row">
      {#if onrolloff}<button onclick={() => onrolloff(ties.map((p) => p.id))}>🎲 Tiebreaker roll-off</button>{/if}
      <button onclick={ontiebreaker} disabled={!game.tiebreaker} title={game.tiebreaker ? '' : "Write one on the editor's Tiebreaker tab"}>
        ❓ Tiebreaker clue
      </button>
      <button onclick={() => logged(session, 'Co-winners declared', () => (session.coWinners = true))}>🤝 Declare co-winners</button>
    </div>
  </div>
{:else if session.rollOffWinner && session.players.some((p) => p.id === session.rollOffWinner)}
  <!-- Both are steps: ↶ Undo (Ctrl+Z) takes them back. -->
  <div class="muted">🎲 {session.players.find((p) => p.id === session.rollOffWinner)?.name} won the tiebreaker roll-off.</div>
{:else if session.coWinners}
  <div class="muted">🤝 Co-winners declared.</div>
{/if}
<div class="row">
  {#if last}
    <button class="ghost" onclick={onback}>{isFinal(last) ? '◀ Back to final reveals' : `◀ Back to ${roundName(last, lastIndex)}`}</button>
  {/if}
  <button onclick={copyResults} title="Copy the standings as one line of text">📋 Copy results</button>
  <button onclick={onrematch} title="Same players, scores back to 0, fresh board">🔁 Rematch</button>
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
