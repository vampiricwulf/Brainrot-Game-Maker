<!-- The top of a round's page (any mode): its name, its mode as a chip and where it plays, with move, duplicate and
     delete on the right. -->
<script lang="ts">
  import { ROUND_MODES } from '../lib/modes';
  import { roundName, type Round } from '../lib/model';
  import PageHeader from './PageHeader.svelte';

  let {
    round,
    index,
    count,
    onmove,
    onduplicate,
    ondelete,
  }: { round: Round; index: number; count: number; onmove: (delta: number) => void; onduplicate: () => void; ondelete: () => void } =
    $props();
  const mode = $derived(ROUND_MODES[round.mode]);
</script>

<div class="ra">
  <PageHeader title={roundName(round, index)} chip="{mode.icon} {mode.label}" chipTitle={mode.hint} sub="Round {index + 1} of {count}">
    {#snippet actions()}
      <button class="ghost" disabled={index === 0} onclick={() => onmove(-1)} title="Play this round earlier (Alt+↑ on its tab)">▲ Move up</button>
      <button class="ghost" disabled={index >= count - 1} onclick={() => onmove(1)} title="Play this round later (Alt+↓ on its tab)">▼ Move down</button>
      <button class="ghost" onclick={onduplicate} title="A copy of this round, right after it">⧉ Duplicate round</button>
      <button class="ghost danger" onclick={ondelete} title="Delete this round (Undo brings it back)">🗑 Delete round</button>
    {/snippet}
  </PageHeader>
</div>

<style>
  .ra :global(.page-header) {
    padding-bottom: 12px;
    border-bottom: 1px solid var(--border);
  }
</style>
