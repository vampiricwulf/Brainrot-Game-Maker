<!--
  Import round from a .brainrot…: the rounds of another game, to tick and bring in (with their worlds, wheels, items
  and files). One step.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { app, toast } from '../lib/app.svelte';
  import { step } from '../lib/history.svelte';
  import { ROUND_MODES } from '../lib/modes';
  import { roundName, type Game } from '../lib/model';
  import { addBundledRound, bundleRound, placeFor } from '../lib/roundcopy';

  let { source, onclose, onadded }: { source: Game; onclose: () => void; onadded: (index: number) => void } = $props();

  // (A game of one round has it ticked already.)
  let picked = $state<string[]>(untrack(() => (source.rounds.length === 1 ? [source.rounds[0].id] : [])));

  function bring(): void {
    const rounds = source.rounds.filter((r) => picked.includes(r.id));
    if (!rounds.length) return;
    const game = app.game;
    let first = -1;
    step(`Imported ${rounds.length === 1 ? `round “${roundName(rounds[0])}”` : `${rounds.length} rounds`} from “${source.title}”`, () => {
      for (const r of rounds) {
        const added = addBundledRound(game, bundleRound(source, r), placeFor(game, r));
        const i = game.rounds.indexOf(added);
        if (first < 0 || i < first) first = i;
      }
    });
    toast(`Imported ${rounds.length} round${rounds.length === 1 ? '' : 's'} from “${source.title}”`);
    onclose();
    onadded(first);
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === 'Escape') {
      e.stopImmediatePropagation();
      onclose();
    }
  }}
/>

<div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
  <div class="modal" role="dialog" aria-modal="true" aria-label="Import rounds" data-undo="off">
    <div class="row">
      <h2>Import rounds from “{source.title}”</h2>
      <span class="spacer"></span>
      <button class="ghost" onclick={onclose} aria-label="Close">✕</button>
    </div>
    {#if !source.rounds.length}
      <p class="muted">That game has no rounds.</p>
    {:else}
      <p class="muted small">Tick the rounds to bring in. Their RPG worlds, wheels, dice, stats, items, shops and files come along.</p>
      <div class="list">
        {#each source.rounds as r, i (r.id)}
          <label class="check">
            <input type="checkbox" bind:group={picked} value={r.id} />
            <span aria-hidden="true">{ROUND_MODES[r.mode].icon}</span>
            {roundName(r, i)}
            <span class="muted small">{ROUND_MODES[r.mode].label}</span>
          </label>
        {/each}
      </div>
    {/if}
    <div class="row">
      {#if source.rounds.length > 1}
        <button class="ghost small" onclick={() => (picked = picked.length === source.rounds.length ? [] : source.rounds.map((r) => r.id))}>
          {picked.length === source.rounds.length ? 'None' : 'All'}
        </button>
      {/if}
      <span class="spacer"></span>
      <button class="ghost" onclick={onclose}>Cancel</button>
      <button class="primary" onclick={bring} disabled={!picked.length}>Import {picked.length || ''} round{picked.length === 1 ? '' : 's'}</button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 150;
    background: rgba(0, 0, 0, 0.6);
    display: grid;
    place-items: center;
    padding: 16px;
  }
  .modal {
    width: min(520px, 100%);
    max-height: 100%;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
  }
  h2,
  p {
    margin: 0;
  }
  h2 {
    font-size: 18px;
  }
  .row {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .small {
    font-size: 12px;
  }
</style>
