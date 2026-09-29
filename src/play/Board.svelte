<!-- The game board in stage coordinates (fills its parent). -->
<script lang="ts">
  import { clueValue, type ClueRef, type Game, type Session } from '../lib/model';
  import { autofit } from '../lib/autofit';
  import { mediaUrls } from '../lib/media.svelte';

  let { game, session, onpick }: { game: Game; session: Session; onpick?: (ref: ClueRef) => void } = $props();
  const round = $derived(game.rounds[session.currentRound]);
  const sym = $derived(game.settings.currencySymbol);
  const intro = $derived(session.intro);
  // Tile-fill animation: each tile pops in after a random delay (stable per round).
  const delays = $derived.by(() => {
    void round?.id;
    return Array.from({ length: 200 }, () => Math.random() * 1.4);
  });
  const catShown = (ci: number) => !intro || (intro.stage === 'categories' && ci < intro.revealed);
</script>

{#if round}
  <div
    class="board"
    style:grid-template-columns="repeat({round.categories.length}, 1fr)"
    style:grid-template-rows="1.35fr repeat({round.values.length}, 1fr)"
  >
    {#each round.categories as cat, ci (cat.id)}
      <div class="cell header" class:fill={intro?.stage === 'fill'} style:animation-delay="{delays[ci]}s">
        {#if catShown(ci)}
          <div class="title" class:revealing={!!intro} use:autofit={{ size: 54, enabled: true, text: cat.title }}>
            <div>{cat.title}</div>
          </div>
        {/if}
      </div>
    {/each}
    {#each round.values as _, row}
      {#each round.categories as cat, ci (cat.id)}
        {@const clue = cat.clues[row]}
        {@const used = clue.empty || !!session.used[clue.id]}
        <button
          class="cell tile"
          class:used
          class:fill={intro?.stage === 'fill'}
          style:animation-delay="{delays[(row + 1) * round.categories.length + ci] ?? 0}s"
          disabled={used || !onpick || !!intro}
          onclick={() => onpick?.({ round: session.currentRound, cat: ci, row })}
          aria-label="{cat.title} for {clueValue(round, row, clue)}"
        >
          {#if !used}
            {#if clue.tileFace?.image && mediaUrls[clue.tileFace.image]}
              <img src={mediaUrls[clue.tileFace.image]} alt="" draggable="false" />
            {/if}
            {#if clue.tileFace?.text}
              <span class="face" use:autofit={{ size: 84, enabled: true, text: clue.tileFace.text }}><span>{clue.tileFace.text}</span></span>
            {:else if !clue.tileFace?.image}
              <span>{sym}{clueValue(round, row, clue)}</span>
            {/if}
          {/if}
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
  .fill {
    animation: fill-in 0.35s cubic-bezier(0.3, 1.5, 0.5, 1) both;
  }
  @keyframes fill-in {
    from {
      scale: 0;
      opacity: 0;
    }
  }
  .title {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .title.revealing {
    animation: cat-in 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }
  @keyframes cat-in {
    from {
      translate: 0 -120%;
      opacity: 0;
    }
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
  .tile {
    position: relative;
  }
  .tile img {
    position: absolute;
    inset: 6px;
    width: calc(100% - 12px);
    height: calc(100% - 12px);
    object-fit: contain;
  }
  .face {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .tile.used {
    background: var(--tile-used);
    cursor: default;
  }
  .tile:disabled {
    opacity: 1;
  }
</style>
