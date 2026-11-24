<!--
  Import rounds…: the rounds and 🎭 deals of another game, to tick and bring in (the rounds with their worlds, wheels,
  items and files; a deal with the wheel it draws from). One step.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { app, toast } from '../lib/app.svelte';
  import { modal } from '../lib/modal';
  import { step } from '../lib/history.svelte';
  import { ROUND_MODES } from '../lib/modes';
  import { roundName, type Game } from '../lib/model';
  import { addBundledRound, addDealFrom, bundleRound, copiesMessage, dealWheelName, mergedMessage, placeFor, type CopyIds } from '../lib/roundcopy';
  import { copiedFiles } from './roundtools';

  let { source, onclose, onadded }: { source: Game; onclose: () => void; onadded: (index: number) => void } = $props();

  // (A game of one round has it ticked already.)
  let picked = $state<string[]>(untrack(() => (source.rounds.length === 1 ? [source.rounds[0].id] : [])));
  /** The other game's 🎭 deals (made in its 🎡 Wheels, Dice & Deals tab), ticked by id. */
  const deals = $derived(source.deals ?? []);
  let pickedDeals = $state<string[]>([]);
  const all = $derived(source.rounds.length + deals.length);
  const ticked = $derived(picked.length + pickedDeals.length);
  /** "2 rounds", "1 deal", "2 rounds and 1 deal". */
  const count = (rounds: number, dealt: number) =>
    [rounds ? `${rounds} round${rounds === 1 ? '' : 's'}` : '', dealt ? `${dealt} deal${dealt === 1 ? '' : 's'}` : ''].filter(Boolean).join(' and ');

  function bring(): void {
    const rounds = source.rounds.filter((r) => picked.includes(r.id));
    const chosen = deals.filter((d) => pickedDeals.includes(d.id));
    if (!rounds.length && !chosen.length) return;
    const game = app.game;
    let first = -1;
    const copied: string[] = [];
    const merged: string[] = [];
    // The rounds and deals share the copies they bring.
    const ids: CopyIds = new Map();
    const media = new Map<string, { id: string; name: string }>();
    /** The deals this game has already (the same, by name): not added again. */
    const had: string[] = [];
    let dealt = 0;
    const one = rounds.length + chosen.length === 1;
    const label = one
      ? rounds.length
        ? `round “${roundName(rounds[0], source.rounds.indexOf(rounds[0]))}”`
        : `deal “${chosen[0].name}”`
      : count(rounds.length, chosen.length);
    step(`Imported ${label} from “${source.title}”`, () => {
      for (const r of rounds) {
        const b = bundleRound(source, r);
        // (Not a 🗜 copy for phones: it isn't one of the game's files to a person.)
        for (const m of b.media) if (!m.phoneCopy) media.set(m.id, m);
        const added = addBundledRound(game, b, placeFor(game, r), copied, ids, merged);
        const i = game.rounds.indexOf(added);
        if (first < 0 || i < first) first = i;
      }
      for (const d of chosen) {
        const before = game.media.length;
        if (addDealFrom(game, source, d, copied, ids, merged)) dealt++;
        else had.push(`“${d.name}”`);
        for (const m of game.media.slice(before)) if (!m.phoneCopy) media.set(m.id, m);
      }
    });
    const copies = copiesMessage([...copied, ...copiedFiles(source, [...media.values()])], 'the file');
    const already = had.length ? `${had.join(', ')} ${had.length === 1 ? 'is' : 'are'} in this game already` : '';
    const said = [mergedMessage(merged), copies, already].filter(Boolean);
    const done = count(rounds.length, dealt);
    toast(done ? `Imported ${done} from “${source.title}”${said.map((t) => `. ${t}`).join('')}` : `Nothing imported: ${said.join('. ')}`);
    onclose();
    // (Only deals: the editor stays on the round it showed.)
    if (first >= 0) onadded(first);
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
      <h2 class="modal-title">📥 Import rounds from “{source.title}”</h2>
      <button class="ghost modal-x" onclick={onclose} aria-label="Close" title="Close (Esc)">✕</button>
    </div>
    {#if !all}
      <p class="muted">That game has no rounds or deals.</p>
    {:else}
      <p class="hint" data-import-hint>
        Tick the {deals.length ? (source.rounds.length ? 'rounds and 🎭 deals' : '🎭 deals') : 'rounds'} to bring in. What they use comes along: {source.rounds.length
          ? 'RPG worlds, wheels, dice, stats, items, shops and files'
          : 'the wheel each deal draws from, and files'}. That game’s 🤫 Cards tab, sounds and theme stay in it.
      </p>
      <div class="list">
        {#each source.rounds as r, i (r.id)}
          <label class="check">
            <input type="checkbox" bind:group={picked} value={r.id} />
            <span aria-hidden="true">{ROUND_MODES[r.mode].icon}</span>
            {roundName(r, i)}
            <span class="hint">{ROUND_MODES[r.mode].label}</span>
          </label>
        {/each}
        {#each deals as d (d.id)}
          {@const wheel = dealWheelName(source, d)}
          <label class="check" data-import-deal>
            <input type="checkbox" bind:group={pickedDeals} value={d.id} />
            <span aria-hidden="true">🎭</span>
            {d.name}
            <span class="hint">Deal{wheel ? `, with its 🎡 ${wheel} wheel` : ''}</span>
          </label>
        {/each}
      </div>
    {/if}
    <div class="modal-foot">
      {#if all > 1}
        <button
          class="ghost"
          onclick={() => {
            const none = ticked === all;
            picked = none ? [] : source.rounds.map((r) => r.id);
            pickedDeals = none ? [] : deals.map((d) => d.id);
          }}
        >
          {ticked === all ? 'Tick none' : 'Tick all'}
        </button>
      {/if}
      <span class="spacer"></span>
      <button class="ghost" onclick={onclose}>Cancel</button>
      <button class="primary" onclick={bring} disabled={!ticked}>{ticked ? `Import ${count(picked.length, pickedDeals.length)}` : source.rounds.length ? 'Import rounds' : 'Import'}</button>
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
