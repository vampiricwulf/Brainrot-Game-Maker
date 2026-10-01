<!--
  Prev / Next round (or the final round / End game), and Go to round. Moving on while tiles are left takes a second,
  inline click ("12 clues left · go on? Yes"), so a stray click or a double-click never jumps ahead on stream.
-->
<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import { isFinal, playableClues, roundName, type Game, type Session } from '../../lib/model';
  import { ROUND_MODES } from '../../lib/modes';

  let {
    game,
    session,
    onprev,
    onnext,
    ongoto,
  }: { game: Game; session: Session; onprev: () => void; onnext: () => void; ongoto?: (index: number) => void } = $props();

  const round = $derived(game.rounds[session.currentRound]);
  const left = $derived(round ? playableClues(round).filter((c) => !session.used[c.id]).length : 0);
  const done = $derived(!session.intro && left === 0);
  const isLast = $derived(session.currentRound >= game.rounds.length - 1);
  const nextRound = $derived(game.rounds[session.currentRound + 1]);
  const target = $derived(isLast || !nextRound ? 'the end screen' : roundName(nextRound, session.currentRound + 1));

  // Clicks right after this row appears (e.g. the second half of a double-click on "Done ▶ board") are ignored.
  const GUARD_MS = 400;
  const shownAt = Date.now();
  let askedAt = $state(0);
  /** Asking before moving on: to the next round (`'next'`), or to the round picked in Go to round (its index). */
  let asking = $state<'next' | number | null>(null);
  const askedFor = $derived(typeof asking === 'number' ? roundName(game.rounds[asking], asking) : target);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancelBtn = $state<HTMLButtonElement>();
  let rowEl = $state<HTMLDivElement>();
  // The 4 s ran out with the focus in the row (a keyboard user reading it): it goes once the focus leaves.
  let lapsed = false;
  onDestroy(() => clearTimeout(timer));

  function next(): void {
    if (Date.now() - shownAt < GUARD_MS) return;
    if (done) return onnext();
    void ask('next');
  }

  /** A round picked in Go to round: at once when this one is played out, else asked like Next round. */
  function goto(i: number): void {
    if (i === session.currentRound) return;
    if (done) ongoto?.(i);
    else void ask(i);
  }

  async function ask(what: 'next' | number): Promise<void> {
    asking = what;
    askedAt = Date.now();
    clearTimeout(timer);
    lapsed = false;
    timer = setTimeout(() => {
      if (rowEl?.contains(document.activeElement)) lapsed = true;
      else asking = null;
    }, 4000);
    // The clicked button is gone: keep keyboard focus in the row, on the harmless choice.
    await tick();
    cancelBtn?.focus();
  }

  function yes(): void {
    if (Date.now() - askedAt < GUARD_MS) return;
    const what = asking;
    asking = null;
    clearTimeout(timer);
    if (what === 'next') onnext();
    else if (what !== null) ongoto?.(what);
  }
</script>

<div class="rn" bind:this={rowEl} onfocusout={(e) => lapsed && !rowEl?.contains(e.relatedTarget as Node | null) && (asking = null)}>
  {#if asking !== null}
    <!-- Short, so it fits where the two round buttons were (the row doesn't re-wrap under the host's cursor). A round
         picked in Go to round is named (it may not be the next one). Cancel puts the list back on this round. -->
    <span class="ask" title="Go to {askedFor} with {left} clue{left === 1 ? '' : 's'} not played?"
      >{left} clue{left === 1 ? '' : 's'} left · {asking === 'next' ? 'go on?' : `go to ${askedFor}?`}</span
    >
    <button class="primary small" onclick={yes}>Yes</button>
    <!-- The focus is put here, so Enter and Space press it (not the host's Enter = Award). -->
    <button
      class="small"
      bind:this={cancelBtn}
      onclick={() => ((asking = null), clearTimeout(timer))}
      onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && e.stopPropagation()}>Cancel</button
    >
  {:else}
    <button class="ghost" onclick={onprev} disabled={session.currentRound === 0}>◀ Prev round</button>
    {#if ongoto && game.rounds.length > 2}
      <!-- Rounds can be played out of order: jump to any of them. -->
      <select class="pick" aria-label="Go to round" value={session.currentRound} onchange={(e) => goto(+e.currentTarget.value)}>
        {#each game.rounds as r, i (r.id)}
          <option value={i}>{ROUND_MODES[r.mode].icon} {roundName(r, i)}</option>
        {/each}
      </select>
    {/if}
    <button class={done ? 'primary' : 'ghost'} onclick={next} title={done ? '' : `${left} clue${left === 1 ? '' : 's'} not played yet`}>
      {isLast || !nextRound ? 'End game ▶' : isFinal(nextRound) ? `${roundName(nextRound)} ▶` : 'Next round ▶'}
    </button>
  {/if}
</div>

<style>
  .rn {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .ask {
    max-width: 260px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--warn);
    font-weight: 600;
    font-size: 12px;
  }
  .small {
    font-size: 12px;
  }
  .pick {
    max-width: 180px;
    font-size: 12px;
  }
</style>
