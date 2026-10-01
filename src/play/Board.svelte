<!-- The game board in stage coordinates (fills its parent). -->
<script lang="ts">
  import { categoryLabel, clueValue, formatPoints, isBoard, type ClueRef, type Game, type Session } from '../lib/model';
  import { autofit } from '../lib/autofit';
  import { imgFallback, mediaUrls } from '../lib/media.svelte';

  let {
    game,
    session,
    onpick,
    ontilemenu,
  }: {
    game: Game;
    session: Session;
    onpick?: (ref: ClueRef) => void;
    /** Host views only: a tile's right-click menu (used tiles then stay enabled for it, but can't be picked). */
    ontilemenu?: (e: MouseEvent, ref: ClueRef) => void;
  } = $props();
  const round = $derived.by(() => {
    const r = game.rounds[session.currentRound];
    return isBoard(r) ? r : undefined;
  });
  const sym = $derived(game.settings.currencySymbol);
  const intro = $derived(session.intro);
  // Tile-fill animation: each tile pops in after a random delay (stable per round).
  const delays = $derived.by(() => {
    void round?.id;
    return Array.from({ length: 200 }, () => Math.random() * 1.4);
  });
  const catShown = (ci: number) => !intro || (intro.stage === 'categories' && ci < intro.revealed);

  /**
   * The arrow keys move across the board, tile to tile (played ones too: their menu is still there). Only in the host's
   * board, where tiles can be picked.
   */
  function arrows(e: KeyboardEvent, row: number, ci: number): void {
    if (!round || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const d = ({ ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] } as Record<string, [number, number]>)[e.key];
    if (!d) return;
    // The arrow keys are the board's here (not the media's ← → seek).
    e.preventDefault();
    e.stopPropagation();
    const r = Math.max(0, Math.min(round.values.length - 1, row + d[0]));
    const c = Math.max(0, Math.min(round.categories.length - 1, ci + d[1]));
    const board = (e.currentTarget as HTMLElement).closest('.board');
    board?.querySelector<HTMLElement>(`.tile[data-row="${r}"][data-cat="${c}"]`)?.focus();
  }
</script>

{#if round}
  <div
    class="board"
    class:intro={!!intro}
    style:grid-template-columns="repeat({round.categories.length}, 1fr)"
    style:grid-template-rows="1.35fr repeat({round.values.length}, 1fr)"
  >
    {#each round.categories as cat, ci (cat.id)}
      <div class="cell header" class:fill={intro?.stage === 'fill'} style:animation-delay="{delays[ci]}s">
        {#if catShown(ci)}
          {#if cat.image && mediaUrls[cat.image]}
            <div class="title has-image" class:revealing={!!intro}>
              <img class="cat-img" src={mediaUrls[cat.image]} alt={cat.title} draggable="false" style:object-fit={cat.imageFit ?? 'contain'} onerror={imgFallback} />
              {#if cat.showTitleOverImage && cat.title}
                <div class="caption" use:autofit={{ size: 40, enabled: true, text: cat.title }}><div>{cat.title}</div></div>
              {/if}
            </div>
          {:else}
            <div class="title" class:revealing={!!intro} use:autofit={{ size: 54, enabled: true, text: cat.title }}>
              <div>{cat.title}</div>
            </div>
          {/if}
        {/if}
      </div>
    {/each}
    {#each round.values as _, row}
      {#each round.categories as cat, ci (cat.id)}
        {@const clue = cat.clues[row]}
        {@const used = clue.empty || !!session.used[clue.id]}
        {@const value = formatPoints(clueValue(round, row, clue), sym)}
        <!-- Played tiles are out of the Tab order (the arrow keys still reach them, for their menu). -->
        <button
          class="cell tile"
          class:used
          data-clue={clue.id}
          data-row={row}
          data-cat={ci}
          tabindex={used ? -1 : undefined}
          onkeydown={onpick ? (e) => arrows(e, row, ci) : undefined}
          class:fill={intro?.stage === 'fill'}
          style:animation-delay="{delays[(row + 1) * round.categories.length + ci] ?? 0}s"
          disabled={(used && !ontilemenu) || !onpick || !!intro}
          aria-disabled={used || undefined}
          onclick={() => !used && onpick?.({ round: session.currentRound, cat: ci, row })}
          oncontextmenu={ontilemenu && !clue.empty ? (e) => ontilemenu(e, { round: session.currentRound, cat: ci, row }) : undefined}
          aria-label="{categoryLabel(cat)} for {value}{clue.empty ? ', empty' : used ? ', played' : ''}"
        >
          {#if !used}
            {#if clue.tileFace?.image && mediaUrls[clue.tileFace.image]}
              <img src={mediaUrls[clue.tileFace.image]} alt="" draggable="false" onerror={imgFallback} />
            {/if}
            {#if clue.tileFace?.text}
              <span class="face" use:autofit={{ size: 84, enabled: true, text: clue.tileFace.text }}><span>{clue.tileFace.text}</span></span>
            {:else if !clue.tileFace?.image}
              <span>{value}</span>
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
    /* The board's background (gap colour / image) is drawn by AudienceView so board images can sit between it and the tiles. */
    background: transparent;
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
    box-shadow: inset 0 0 0 3px rgba(0, 0, 0, 0.35), 0 0 var(--glow-size, 0) var(--glow, transparent);
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
  .title.has-image {
    position: relative;
    width: calc(100% + 24px);
    height: calc(100% + 24px);
    margin: -12px;
  }
  .cat-img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .caption {
    position: absolute;
    left: 6px;
    right: 6px;
    bottom: 4px;
    height: 42%;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    overflow: hidden;
    text-shadow: 3px 3px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000;
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
  .tile:hover:not(:disabled):not(.used) {
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
  .tile.fill,
  .board.intro .tile {
    pointer-events: none;
  }
  .tile.used {
    background: var(--tile-used);
    cursor: default;
  }
  .tile:disabled {
    opacity: 1;
  }
</style>
