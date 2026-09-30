<!-- Move, duplicate or delete the round being edited (any mode). -->
<script lang="ts">
  import { ROUND_MODES } from '../lib/modes';
  import type { Round } from '../lib/model';

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
  <span class="mode" title={mode.hint}>{mode.icon} {mode.label}</span>
  <span class="muted small">Round {index + 1} of {count}</span>
  <span class="spacer"></span>
  <button class="ghost small" disabled={index === 0} onclick={() => onmove(-1)} title="Play this round earlier">◀ Move earlier</button>
  <button class="ghost small" disabled={index >= count - 1} onclick={() => onmove(1)} title="Play this round later">Move later ▶</button>
  <button class="ghost small" onclick={onduplicate} title="A copy of this round, right after it">⧉ Duplicate</button>
  <button class="ghost small danger" onclick={ondelete} title="Delete this round (asks first)">🗑 Delete round</button>
</div>

<style>
  .ra {
    display: flex;
    gap: 6px;
    align-items: center;
    padding-bottom: 8px;
    margin-bottom: 10px;
    border-bottom: 1px solid var(--border);
  }
  .mode {
    font-weight: 600;
    font-size: 13px;
  }
  .small {
    font-size: 12px;
  }
  .danger {
    color: var(--bad);
  }
</style>
