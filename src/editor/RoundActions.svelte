<!-- The top of a round's page (any mode): its name, its mode as a chip and where it plays, with move, duplicate and ⋯
     for the round's menu on the right (the same as its tab's; a right-click on the bar opens it too), then 🗑 Delete
     apart at the end. -->
<script lang="ts">
  import { ROUND_MODES } from '../lib/modes';
  import { roundName, type Round } from '../lib/model';
  import { dropMenu, showMenu, type MenuEntry } from '../lib/menustate.svelte';
  import PageHeader from './PageHeader.svelte';

  let {
    round,
    index,
    count,
    onmove,
    onduplicate,
    ondelete,
    ontest,
    menu,
  }: {
    round: Round;
    index: number;
    count: number;
    onmove: (delta: number) => void;
    onduplicate: () => void;
    ondelete: () => void;
    /** ▶ Test this round: play just this round in a throwaway game (nothing kept), back here after. */
    ontest?: () => void;
    /** The round's menu, as its tab's. */
    menu?: () => MenuEntry[];
  } = $props();
  const mode = $derived(ROUND_MODES[round.mode]);
  // (A slides round says how it plays here, in the header's line, so its slide has the height below.)
  const SLIDES_NOTE =
    ' · Viewers see these slides one after another: N (or a click on the stage) shows the next, Shift+N the one before, and after the last one N goes on to the next round. Nothing to answer, no scores.';
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="ra" oncontextmenu={(e) => menu && showMenu(e, menu())}>
  <PageHeader title={roundName(round, index)} chip="{mode.icon} {mode.label}" chipTitle={mode.hint} sub="Round {index + 1} of {count}{round.mode === 'slides' ? SLIDES_NOTE : ''}">
    {#snippet actions()}
      {#if ontest}
        <button
          onclick={ontest}
          title="Play just this round to try it out, with sample players if the game has none. Nothing is kept, and the game kept to resume stays as it is. Exit comes back here."
          >▶ Test this round</button
        >
      {/if}
      <!-- Short labels, so the round's name keeps its line on a small laptop (the full words are their names and tips). -->
      <button class="ghost" disabled={index === 0} onclick={() => onmove(-1)} aria-label="▲ Move round up" title="Move up: play this round earlier (Alt+↑ on its tab)">▲</button>
      <button class="ghost" disabled={index >= count - 1} onclick={() => onmove(1)} aria-label="▼ Move round down" title="Move down: play this round later (Alt+↓ on its tab)">▼</button>
      <button class="ghost" onclick={onduplicate} aria-label="⧉ Duplicate round" title="Duplicate: a copy of this round, right after it">⧉ Duplicate</button>
      {#if menu}
        <button class="ghost" aria-haspopup="menu" onclick={(e) => dropMenu(e, menu())} aria-label="More for this round" title="Rename, copy, paste after it… (or right-click this bar or the round’s tab)">⋯</button>
      {/if}
      <button class="ghost danger del" onclick={ondelete} aria-label="🗑 Delete round" title="Delete this round (Undo brings it back)">🗑 Delete</button>
    {/snippet}
  </PageHeader>
</div>

<style>
  /* Last, apart from the rest, so a slip doesn't delete. */
  .del {
    margin-left: 8px;
  }
  .ra :global(.page-header) {
    padding-bottom: 12px;
    border-bottom: 1px solid var(--border);
  }
  /* On a phone the buttons go under the name and its line, which keep the width. */
  @media (max-width: 700px) {
    .ra :global(.page-header) {
      flex-wrap: wrap;
    }
    .ra :global(.page-header .titles) {
      flex-basis: 100%;
    }
  }
</style>
