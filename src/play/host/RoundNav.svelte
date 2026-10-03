<!--
  Prev / Next round (or the final round / End game), and Go to round: quiet buttons at the end of the tools row.
  Leaving a round always asks first, in the panel's confirmation strip ("12 clues left · go on? Cancel / Yes"; an RPG
  or board-game round: "Leave Adventure?"), so a stray click or a double-click never jumps ahead on stream. Only a
  board played out goes on at once: then its Next round ▶ is the panel's main button.
-->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { isBoard, isFinal, playableClues, roundName, type Game, type Session } from '../../lib/model';
  import { ROUND_MODES } from '../../lib/modes';
  import { hostAsk, offerNext } from './slots.svelte';
  import { app } from '../../lib/app.svelte';

  let {
    game,
    session,
    onprev,
    onnext,
    ongoto,
  }: { game: Game; session: Session; onprev: () => void; onnext: () => void; ongoto?: (index: number) => void } = $props();

  const round = $derived(game.rounds[session.currentRound]);
  const board = $derived(!!round && isBoard(round));
  const left = $derived(round ? playableClues(round).filter((c) => !session.used[c.id]).length : 0);
  // (An RPG or board-game round has no clues to count: it's never "done", leaving it always asks.)
  const done = $derived(board && !session.intro && left === 0);
  const isLast = $derived(session.currentRound >= game.rounds.length - 1);
  const nextRound = $derived(game.rounds[session.currentRound + 1]);
  const target = $derived(isLast || !nextRound ? 'the end screen' : roundName(nextRound, session.currentRound + 1));
  const nextLabel = $derived(isLast || !nextRound ? 'End game ▶' : isFinal(nextRound) ? `${roundName(nextRound)} ▶` : 'Next round ▶');

  // Clicks right after this row appears (e.g. the second half of a double-click on "Done ▶ board") are ignored.
  const GUARD_MS = 400;
  const shownAt = Date.now();
  /** Asking before moving on: to the next round (`'next'`), or to the round picked in Go to round (its index). */
  let asking = $state<'next' | number | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let picker = $state<HTMLSelectElement>();
  const setAsk = hostAsk();
  onDestroy(() => {
    clearTimeout(timer);
    if (asking !== null) setAsk(null);
  });

  // A played-out board: going on is the moment's main button.
  offerNext('board', () => (done ? { label: nextLabel, run: next } : null));

  function next(): void {
    if (Date.now() - shownAt < GUARD_MS) return;
    if (done) return onnext();
    ask('next');
  }

  /** ◀ Prev round goes at once: the second click of a double-click (on the new round's ◀ Prev round) isn't a second step. */
  function prev(e: MouseEvent): void {
    if (e.detail >= 2 || Date.now() - shownAt < GUARD_MS) return;
    onprev();
  }

  /** A round picked in Go to round: at once when this one is played out, else asked like Next round. */
  function goto(i: number): void {
    if (i === session.currentRound) return;
    if (done) ongoto?.(i);
    else ask(i);
  }

  function stop(): void {
    asking = null;
    clearTimeout(timer);
    setAsk(null);
    // Cancel puts the list back on this round.
    if (picker) picker.value = String(session.currentRound);
  }

  /** It goes after 4 s, unless the keyboard focus is in it (someone reading it): then once the focus leaves. */
  function lapse(): void {
    timer = setTimeout(() => (document.activeElement?.closest('.confirm') ? lapse() : stop()), 4000);
  }

  function ask(what: 'next' | number): void {
    asking = what;
    clearTimeout(timer);
    lapse();
    const name = typeof what === 'number' ? roundName(game.rounds[what], what) : target;
    const r = round;
    // Short, so it reads at a glance. A round picked in Go to round is named (it may not be the next one).
    const text = board
      ? `${left} clue${left === 1 ? '' : 's'} left · ${what === 'next' ? 'go on?' : `go to ${name}?`}`
      : `Leave ${r ? roundName(r, session.currentRound) : 'this round'}${what === 'next' ? '' : ` for ${name}`}?`;
    setAsk({ text, ok: 'Yes', onok: yes, oncancel: stop });
  }

  function yes(): void {
    const what = asking;
    stop();
    if (what === 'next') onnext();
    else if (what !== null) ongoto?.(what);
  }
</script>

<div class="rn">
  {#if app.test}
    <!-- ▶ Test this round: one round, nothing kept (🚪 Exit goes back to the editor). -->
    <span class="test" title="Only this round plays, and nothing is kept: 🚪 Exit goes back to the editor">🧪 Testing this round</span>
  {:else}
    <button class="ghost" onclick={prev} disabled={session.currentRound === 0}>◀ Prev round</button>
  {/if}
  {#if ongoto && game.rounds.length > 2}
    <!-- Rounds can be played out of order: jump to any of them. -->
    <select class="pick" aria-label="Go to round" bind:this={picker} value={session.currentRound} onchange={(e) => goto(+e.currentTarget.value)}>
      {#each game.rounds as r, i (r.id)}
        <option value={i}>{ROUND_MODES[r.mode].icon} {roundName(r, i)}</option>
      {/each}
    </select>
  {/if}
  <!-- Played out, it's the main button instead (one of them, not two). -->
  {#if !done}
    <button class="ghost" onclick={next} title={board ? `${left} clue${left === 1 ? '' : 's'} not played yet` : 'Asks first'}>{nextLabel}</button>
  {/if}
</div>

<style>
  .rn {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .test {
    font-size: 12px;
    padding: 2px 8px;
    border: 1px dashed var(--warn);
    border-radius: 999px;
    color: var(--warn);
    white-space: nowrap;
  }
  .pick {
    max-width: 180px;
    font-size: 12px;
  }
</style>
