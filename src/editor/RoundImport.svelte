<!--
  Import rounds…: the rounds of another game, to tick and bring in (with their worlds, wheels, items
  and files). One step.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { app, toast } from '../lib/app.svelte';
  import { modal } from '../lib/modal';
  import { step } from '../lib/history.svelte';
  import { ROUND_MODES } from '../lib/modes';
  import { roundName, type Game } from '../lib/model';
  import { addBundledRound, bundleRound, copiesMessage, placeFor, type CopyIds } from '../lib/roundcopy';
  import { copiedFiles } from './roundtools';

  let { source, onclose, onadded }: { source: Game; onclose: () => void; onadded: (index: number) => void } = $props();

  // (A game of one round has it ticked already.)
  let picked = $state<string[]>(untrack(() => (source.rounds.length === 1 ? [source.rounds[0].id] : [])));

  function bring(): void {
    const rounds = source.rounds.filter((r) => picked.includes(r.id));
    if (!rounds.length) return;
    const game = app.game;
    let first = -1;
    const copied: string[] = [];
    // The rounds share the copies they bring.
    const ids: CopyIds = new Map();
    const media = new Map<string, { id: string; name: string }>();
    step(`Imported ${rounds.length === 1 ? `round “${roundName(rounds[0])}”` : `${rounds.length} rounds`} from “${source.title}”`, () => {
      for (const r of rounds) {
        const b = bundleRound(source, r);
        for (const m of b.media) media.set(m.id, m);
        const added = addBundledRound(game, b, placeFor(game, r), copied, ids);
        const i = game.rounds.indexOf(added);
        if (first < 0 || i < first) first = i;
      }
    });
    const copies = copiesMessage([...copied, ...copiedFiles(source, [...media.values()])], 'the file');
    toast(`Imported ${rounds.length} round${rounds.length === 1 ? '' : 's'} from “${source.title}”${copies ? `. ${copies}` : ''}`);
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

<div class="modal-backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
  <div class="modal" role="dialog" aria-modal="true" aria-label="Import rounds" use:modal data-undo="off">
    <div class="modal-head">
      <h2 class="modal-title">📂 Import rounds from “{source.title}”</h2>
      <button class="ghost modal-x" onclick={onclose} aria-label="Close" title="Close (Esc)">✕</button>
    </div>
    {#if !source.rounds.length}
      <p class="muted">That game has no rounds.</p>
    {:else}
      <p class="hint">Tick the rounds to bring in. Their RPG worlds, wheels, dice, stats, items, shops and files come along.</p>
      <div class="list">
        {#each source.rounds as r, i (r.id)}
          <label class="check">
            <input type="checkbox" bind:group={picked} value={r.id} />
            <span aria-hidden="true">{ROUND_MODES[r.mode].icon}</span>
            {roundName(r, i)}
            <span class="hint">{ROUND_MODES[r.mode].label}</span>
          </label>
        {/each}
      </div>
    {/if}
    <div class="modal-foot">
      <button class="ghost" onclick={onclose}>Cancel</button>
      {#if source.rounds.length > 1}
        <button class="ghost" onclick={() => (picked = picked.length === source.rounds.length ? [] : source.rounds.map((r) => r.id))}>
          {picked.length === source.rounds.length ? 'Tick none' : 'Tick all'}
        </button>
      {/if}
      <span class="spacer"></span>
      <button class="primary" onclick={bring} disabled={!picked.length}>Import {picked.length || ''} round{picked.length === 1 ? '' : 's'}</button>
    </div>
  </div>
</div>

<style>
  .list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
</style>
