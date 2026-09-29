<!--
  Prev / Next round (or the final round / End game). Moving on while tiles are left takes a second, inline
  click ("12 clues left · go to …? Yes"), so a stray click or a double-click never jumps ahead on stream.
-->
<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import { finalName, playableClues, type Game, type Session } from '../../lib/model';

  let { game, session, onprev, onnext }: { game: Game; session: Session; onprev: () => void; onnext: () => void } = $props();

  const round = $derived(game.rounds[session.currentRound]);
  const left = $derived(round ? playableClues(round).filter((c) => !session.used[c.id]).length : 0);
  const done = $derived(!session.intro && left === 0);
  const isLast = $derived(session.currentRound >= game.rounds.length - 1);
  const target = $derived(
    isLast ? (game.final.enabled ? finalName(game) : 'the end screen') : (game.rounds[session.currentRound + 1]?.name ?? 'the next round'),
  );

  // Clicks right after this row appears (e.g. the second half of a double-click on "Done ▶ board") are ignored.
  const GUARD_MS = 400;
  const shownAt = Date.now();
  let askedAt = $state(0);
  let asking = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancelBtn = $state<HTMLButtonElement>();
  onDestroy(() => clearTimeout(timer));

  async function next(): Promise<void> {
    if (Date.now() - shownAt < GUARD_MS) return;
    if (done) return onnext();
    asking = true;
    askedAt = Date.now();
    clearTimeout(timer);
    timer = setTimeout(() => (asking = false), 4000);
    // The clicked button is gone: keep keyboard focus in the row, on the harmless choice.
    await tick();
    cancelBtn?.focus();
  }

  function yes(): void {
    if (Date.now() - askedAt < GUARD_MS) return;
    asking = false;
    clearTimeout(timer);
    onnext();
  }
</script>

<div class="rn">
  {#if asking}
    <!-- Short, so it fits where the two round buttons were (the row doesn't re-wrap under the host's cursor). -->
    <span class="ask" title="Go to {target} with {left} clue{left === 1 ? '' : 's'} not played?">{left} clue{left === 1 ? '' : 's'} left · go on?</span>
    <button class="primary small" onclick={yes}>Yes</button>
    <button class="small" bind:this={cancelBtn} onclick={() => ((asking = false), clearTimeout(timer))}>Cancel</button>
  {:else}
    <button class="ghost" onclick={onprev} disabled={session.currentRound === 0}>◀ Prev round</button>
    <button class={done ? 'primary' : 'ghost'} onclick={next} title={done ? '' : `${left} clue${left === 1 ? '' : 's'} not played yet`}>
      {isLast ? (game.final.enabled ? `${finalName(game)} ▶` : 'End game ▶') : 'Next round ▶'}
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
    color: var(--warn);
    font-weight: 600;
    font-size: 12px;
  }
  .small {
    font-size: 12px;
  }
</style>
