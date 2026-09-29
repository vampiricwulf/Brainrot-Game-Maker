<!-- The game board in stage coordinates (fills its parent). -->
<script lang="ts">
  import { clueValue, type ClueRef, type Game, type Session } from '../lib/model';
  import { autofit } from '../lib/autofit';

  let { game, session, onpick }: { game: Game; session: Session; onpick?: (ref: ClueRef) => void } = $props();
  const round = $derived(game.rounds[session.currentRound]);
  const sym = $derived(game.settings.currencySymbol);
</script>

{#if round}
  <div
    class="board"
    style:grid-template-columns="repeat({round.categories.length}, 1fr)"
    style:grid-template-rows="1.35fr repeat({round.values.length}, 1fr)"
  >
    {#each round.categories as cat (cat.id)}
      <div class="cell header" use:autofit={{ size: 54, enabled: true, text: cat.title }}>
        <div>{cat.title}</div>
      </div>
    {/each}
    {#each round.values as _, row}
      {#each round.categories as cat, ci (cat.id)}
        {@const clue = cat.clues[row]}
        {@const used = clue.empty || !!session.used[clue.id]}
        <button
          class="cell tile"
          class:used
          disabled={used || !onpick}
          onclick={() => onpick?.({ round: session.currentRound, cat: ci, row })}
          aria-label="{cat.title} for {clueValue(round, row, clue)}"
        >
          {#if !used}<span>{sym}{clueValue(round, row, clue)}</span>{/if}
        </button>
      {/each}
    {/each}
  </div>
{/if}

<style>
  .board {
    position: absolute;
    inset: 0;
    display: grid;
    gap: 10px;
    padding: 10px;
    background: var(--board-gap);
  }
  .cell {
    background: var(--tile);
    color: var(--board-text);
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    overflow: hidden;
    min-width: 0;
    min-height: 0;
    border: none;
    border-radius: 0;
    padding: 12px;
    box-shadow: inset 0 0 0 3px rgba(0, 0, 0, 0.35);
  }
  .header {
    font-family: var(--board-font);
    font-weight: 800;
    text-transform: uppercase;
    line-height: 1.05;
    text-shadow: 4px 4px 0 #000;
    border-bottom: 6px solid #000;
  }
  .tile {
    font-family: var(--value-font);
    font-size: 84px;
    font-weight: 800;
    color: var(--value);
    text-shadow: 5px 5px 0 #000;
    cursor: pointer;
    transition: filter 0.12s;
  }
  .tile:hover:not(:disabled) {
    filter: brightness(1.25);
  }
  .tile.used {
    background: var(--tile-used);
    cursor: default;
  }
  .tile:disabled {
    opacity: 1;
  }
</style>
