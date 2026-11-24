<!--
  Prev / Next round (or the final round / End game), and Go to round: quiet buttons at the end of the tools row.
  Leaving a round always asks first, in the panel's confirmation strip, its answers saying what they do ("12 clues are
  left in Jeopardy! Go to Double Jeopardy!? Keep playing / Go to Double Jeopardy! ▶"; an RPG or board-game round:
  "Leave Adventure for Board game?"), so a stray click or a double-click never jumps ahead on stream. Only a board
  played out goes on at once (the panel's blue button is Next round ▶ then, goon.ts).
-->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { isBoard, isFinal, isSlides, playableClues, roundName, type Game, type Session } from '../../lib/model';
  import { slidePosition } from '../../lib/session';
  import { ROUND_MODES } from '../../lib/modes';
  import { hostAsk, offerMenu } from './slots.svelte';
  import { justShown } from './guard';
  import { secondClick } from '../../lib/oneshot';
  import { VERBS } from './verbs';
  import { app, clearToast, hint } from '../../lib/app.svelte';
  import { cardsHeld } from '../../lib/sentcards';

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
  /** A slides round: where it is (null: one slide). */
  const slides = $derived(!!round && isSlides(round));
  const slidePos = $derived(slides ? slidePosition(session, game) : null);
  const lastSlide = $derived(slides && (!slidePos || slidePos.at >= slidePos.of));
  // (An RPG or board-game round has no clues to count: it's never "done", leaving it always asks. A slides round is done
  // on its last slide.)
  const done = $derived((board && !session.intro && left === 0) || lastSlide);
  const isLast = $derived(session.currentRound >= game.rounds.length - 1);
  const nextRound = $derived(game.rounds[session.currentRound + 1]);
  const target = $derived(isLast || !nextRound ? 'the end screen' : roundName(nextRound, session.currentRound + 1));
  /** Where Next round ▶ goes: the next round, a final round by its name, or the end screen. */
  const nextName = $derived(isLast || !nextRound ? 'End game' : isFinal(nextRound) ? roundName(nextRound) : 'Next round');
  const nextLabel = $derived(`${nextName} ▶`);

  // Clicks right after this row appears (e.g. the second half of a double-click on "Done ▶ board") are ignored.
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

  // The stage's menu: back, and going on early (it asks first), as in this row. Played out, going on is the blue
  // button's step, first in the menu.
  offerMenu('board', () => [
    ...(app.test ? [] : [{ label: '◀ Previous round', disabled: session.currentRound === 0, onclick: onprev }]),
    ...(done ? [] : [{ id: 'nextround', label: nextLabel, hint: 'Asks first', onclick: next }]),
  ]);

  function next(): void {
    if (justShown(shownAt, Date.now(), 1)) return;
    if (done) return onnext();
    ask('next');
  }

  /** ◀ Previous round goes at once: the second click of a double-click (on the new round's) isn't a second step. */
  function prev(e: MouseEvent): void {
    if (secondClick(e) || justShown(shownAt, Date.now(), e.detail)) return;
    onprev();
  }

  /**
   * A round picked in Go to round: at once when this one is played out, else asked like Next round. Picked with the
   * keys on the closed list (`keyed`: ↓, ↑ or a round's first letter, while someone only looks through it), it's held
   * there instead, the keys staying in the list, and asks only on Enter (hold).
   */
  function goto(i: number, keyed = false): void {
    unhold();
    if (i === session.currentRound) return;
    if (keyed) return hold(i);
    if (done) ongoto?.(i);
    else ask(i);
  }
  /** The last key on Go to round changed it by itself (not Enter or Space in its open list, nor Alt+↓ opening it). */
  let keyed = false;
  /** The round the keys moved the closed list to: nothing happens until Enter asks to go there (Esc or leaving it: back). */
  let held: number | null = null;

  /** What it says Enter does, while it's up. */
  let holdSay = '';
  /** ↓ or ↑ on the closed list: the round is only shown there, and a hint says what Enter does. */
  function hold(i: number): void {
    held = i;
    holdSay = `Enter: go to ${roundName(game.rounds[i], i)} (it asks first) · Esc: stay`;
    hint(holdSay);
  }
  /** Nothing held any more: its hint goes too (the question, or the list back on this round, says the rest). */
  function unhold(): void {
    held = null;
    if (app.toast === holdSay) clearToast();
  }
  /** Keys on the list: Enter asks about the round held there, Esc puts it back on this round. */
  function pickerKey(e: KeyboardEvent): void {
    if (held !== null && !e.altKey && (e.key === 'Enter' || e.key === 'Escape')) {
      e.preventDefault();
      e.stopPropagation();
      const i = held;
      unhold();
      if (e.key === 'Enter') ask(i);
      else if (picker) picker.value = String(session.currentRound);
      return;
    }
    keyed = !e.altKey && !['Enter', ' ', 'Tab'].includes(e.key);
  }
  /** The keys left the list with a round only held there: nothing happens, the list shows this round again. */
  function pickerBlur(): void {
    if (held === null) return;
    unhold();
    if (picker) picker.value = String(session.currentRound);
  }

  function stop(): void {
    asking = null;
    clearTimeout(timer);
    setAsk(null);
    // Cancel puts the list back on this round.
    if (picker) picker.value = String(session.currentRound);
  }

  /**
   * It goes after 4 s, unless someone is reading it, the pointer on it or the keyboard focus in it: then once they've
   * left it.
   */
  function lapse(): void {
    timer = setTimeout(() => (document.activeElement?.closest('.confirm') || document.querySelector('.confirm:hover') ? lapse() : stop()), 4000);
  }

  /**
   * What leaving the round takes along, said in its question: the 🎭 deal's cards and the 🤫 cards out that last until
   * the round ends ("The 🎭 Odd one out cards and 2 🤫 cards go with Round 1."), or ''. The round left is named, not
   * "it": after "Go to Round 2?", "it" would read as the round they're going to. Only the deal's name and a count: never
   * what's on a card, nor whose.
   */
  function goesWith(here: string): string {
    const held = cardsHeld(game, session).filter((c) => c.until === 'round');
    const deal = session.deal && held.some((c) => c.deal === session.deal!.id) ? `🎭 ${session.deal.name}` : '';
    const n = held.filter((c) => !c.deal).length;
    const cards = n ? `${n} 🤫 card${n === 1 ? '' : 's'}` : '';
    // (No full stop after a name that ends in its own: "go with Jeopardy!".)
    const end = `with ${here}${/[.!?]$/.test(here) ? '' : '.'}`;
    if (deal && cards) return `The ${deal} cards and ${cards} go ${end}`;
    if (deal) return `The ${deal} cards go ${end}`;
    return cards ? `The ${cards} out ${n === 1 ? 'goes' : 'go'} ${end}` : '';
  }

  function ask(what: 'next' | number): void {
    asking = what;
    clearTimeout(timer);
    lapse();
    const name = typeof what === 'number' ? roundName(game.rounds[what], what) : target;
    const here = round ? roundName(round, session.currentRound) : 'this round';
    // (The end screen, after the last round.)
    const end = what === 'next' && (isLast || !nextRound);
    // The question says what leaving does, and its answers name it. A round picked in Go to round is named (it may not
    // be the next one). (A board played out only asks for a round picked with the arrow keys.)
    const lefts = `${left} clue${left === 1 ? ' is' : 's are'} left`;
    // (No full stop after a name that ends in its own: "left in Jeopardy! Go to …".)
    const text = board
      ? left
        ? end
          ? `End the game now? ${lefts}.`
          : `${lefts} in ${here}${/[.!?]$/.test(here) ? '' : '.'} Go to ${name}?`
        : `Go to ${name}?`
      : end
        ? `Leave ${here} and end the game?`
        : `Leave ${here} for ${name}?`;
    const also = goesWith(here);
    setAsk({ text: also ? `${text} ${also}` : text, ok: (end ? VERBS.endGame : VERBS.goToRound(name)).label, cancel: board && !left ? 'Stay' : VERBS.keepPlaying.label, onok: yes, oncancel: stop });
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
    <!-- (◀ alone on a narrow window and beside the stage, named in full: see HostPanel's .rn .word.) -->
    <button class="ghost" onclick={prev} disabled={session.currentRound === 0} title="Previous round">◀ <span class="word">Previous round</span></button>
  {/if}
  {#if ongoto && game.rounds.length > 2}
    <!-- Rounds can be played out of order: jump to any of them. -->
    <select
      class="pick"
      aria-label="Go to round"
      bind:this={picker}
      value={session.currentRound}
      onkeydown={pickerKey}
      onblur={pickerBlur}
      onpointerdown={() => (keyed = false)}
      onchange={(e) => goto(+e.currentTarget.value, keyed)}
    >
      <!-- (The name first, its sign after: typing a round's first letter goes to it.) -->
      {#each game.rounds as r, i (r.id)}
        <option value={i}>{roundName(r, i)} {ROUND_MODES[r.mode].icon}</option>
      {/each}
    </select>
  {/if}
  <!-- Played out, it's the blue button instead (one of them, not two): its room stays here, unseen, so ◀ Previous round
       and Go to round keep their places. (A final round's long name is cut short, never its ▶: in full in its tooltip.) -->
  {#if !done}
    <button class="ghost next" onclick={next} title={`${nextName} · ${board ? `${left} clue${left === 1 ? '' : 's'} not played yet` : 'asks first'}`}><span class="nm">{nextName}</span> ▶</button>
  {:else}
    <span class="next room" aria-hidden="true"><span class="nm">{nextName}</span> ▶</span>
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
  /* (As wide as the button it keeps the place of.) */
  .room {
    visibility: hidden;
    padding: 6px 12px;
    border: 1px solid transparent;
    white-space: nowrap;
  }
  /* A final round's long name on ▶ is cut short (…), as in Go to round, so on the board the tools and the round's ◀ /
     picker / ▶ stay on one line, as in a clue, and the stage keeps one size. Up to 1340px wide, to the width of the
     usual "Final Jeopardy!": room for 🔇 Stop sounds and the cards out beside 📊 Scoreboard (in DejaVu Sans, the widest
     font it's drawn in, the row needs 1330px with the longer cut). */
  .next .nm {
    display: inline-block;
    max-width: 11.5em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    vertical-align: bottom;
  }
  @media (max-width: 1340px) {
    .next .nm {
      max-width: 7.5em;
    }
  }
</style>
