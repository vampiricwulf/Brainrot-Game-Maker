<!-- End of game: tie handling (spec §6.4 step 6). -->
<script lang="ts">
  import type { Game, Session } from '../../lib/model';
  import { startTiebreaker, tiedLeaders } from '../../lib/session';

  let { game, session, onrolloff }: { game: Game; session: Session; onrolloff?: (ids: string[]) => void } = $props();
  const ties = $derived(tiedLeaders(session));
</script>

{#if ties.length && !session.coWinners}
  <div class="tie">
    <b>Tie for first:</b> {ties.map((p) => p.name).join(', ')}
    <div class="row">
      {#if onrolloff}<button onclick={() => onrolloff(ties.map((p) => p.id))}>🎲 Tiebreaker roll-off</button>{/if}
      <button onclick={() => startTiebreaker(session)} disabled={!game.tiebreaker} title={game.tiebreaker ? '' : 'Write one in the editor on the final round tab'}>
        ❓ Tiebreaker clue
      </button>
      <button onclick={() => (session.coWinners = true)}>🤝 Declare co-winners</button>
    </div>
  </div>
{:else if session.coWinners}
  <div class="row"><span class="muted">Co-winners declared.</span><button class="ghost small" onclick={() => (session.coWinners = false)}>Undo</button></div>
{/if}

<style>
  .tie {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    border: 1px solid var(--warn);
    border-radius: 8px;
  }
  .small {
    font-size: 12px;
  }
</style>
