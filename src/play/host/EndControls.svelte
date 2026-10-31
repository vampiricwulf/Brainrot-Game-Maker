<!--
  End of game: tie handling (spec §6.4 step 6), a way back, rematch and shareable results. No blue button here: a tie is
  settled in its box (❓ Tiebreaker clue, 🎲 Tiebreaker roll-off, 🤝 Declare co-winners), and N says so.
-->
<script lang="ts">
  import { app } from '../../lib/app.svelte';
  import { getContext, onDestroy } from 'svelte';
  import { NEXT_GAME } from './nextgame';
  import { isFinal, questionSlides, roundName, type Game, type Session } from '../../lib/model';
  import { coWinnersHold, nameList, standings, tiebreakHolds, tiedForFirst, tiedLeaders } from '../../lib/session';
  import { announce } from '../../lib/announce';
  import { slideHasContent } from '../../lib/usage';
  import { logged } from '../../lib/toolset';
  import { copyText, standingsText } from '../standings';
  import { hostAsk, offerMenu, step } from './slots.svelte';
  import { stepItem, type StageItem } from './stagemenu';
  import { VERBS } from './verbs';

  let {
    game,
    session,
    onrolloff,
    ontiebreaker,
    oncowinners,
    onback,
    onrematch,
  }: {
    game: Game;
    session: Session;
    onrolloff?: (ids: string[]) => void;
    /** Play the tiebreaker clue. */
    ontiebreaker: () => void;
    /** The tie was settled by declaring co-winners (the winner fanfare plays). */
    oncowinners?: () => void;
    /** Back to the last round (a final round goes back to its reveals). */
    onback: () => void;
    /** New game with the same players, via the pre-game screen. */
    onrematch: () => void;
  } = $props();
  const ties = $derived(coWinnersHold(session) ? [] : tiedLeaders(session));
  /** Level on the top score, settled or not (a settled tie says how, while there still is one). */
  const level = $derived(tiedForFirst(session));
  const lastIndex = $derived(game.rounds.length - 1);
  const last = $derived(game.rounds[lastIndex]);
  /** A tiebreaker clue with a question written (one ticked on but left empty would put a blank slide on stream). */
  const tbReady = $derived(!!game.tiebreaker && questionSlides(game.tiebreaker).some(slideHasContent));

  /**
   * How it ended, as the stage's heading says it: screen readers hear it on arriving and as it changes (a tie to settle,
   * co-winners, the winner). Not a roll-off's win: its card says that as it lands.
   */
  const outcome = $derived.by(() => {
    if (ties.length) return `Tie for first: ${nameList(ties.map((p) => p.name))}`;
    if (coWinnersHold(session) && level.length) return `Co-winners: ${nameList(level.map((p) => p.name))}`;
    if (!session.tiebreakClue && tiebreakHolds(session, level.map((p) => p.id))) return '';
    const top = standings(session)[0];
    return top ? `${top.player.name} wins` : '';
  });
  $effect(() => {
    if (outcome) announce(outcome, 'end-outcome');
  });

  const copyStandings = () => copyText(standingsText(game, session), 'Standings copied: paste them in chat');
  const rollOff = () => onrolloff?.(ties.map((p) => p.id));

  /** 🔁 Rematch asks first, in the panel's confirmation strip: the results go. */
  const setAsk = hostAsk();
  let asking = $state(false);
  function askRematch(): void {
    asking = true;
    setAsk({
      text: 'Start a rematch? Scores go back to 0.',
      ok: '🔁 Rematch',
      cancel: 'Stay',
      danger: true,
      onok: () => ((asking = false), setAsk(null), onrematch()),
      oncancel: () => ((asking = false), setAsk(null)),
    });
  }
  onDestroy(() => asking && setAsk(null));

  /** ▶ Next game… (a stream of several games): the editor's Open… / Recent games, the room and audience window kept. */
  const nextGame = getContext<(() => void) | undefined>(NEXT_GAME);

  // The stage's menu: the ways to settle a tie, then the end screen's own buttons in their order.
  offerMenu('end', () => {
    const out: StageItem[] = [];
    if (ties.length) {
      out.push(tbReady ? stepItem(step(VERBS.tiebreakerClue, ontiebreaker), 'tbclue') : { id: 'tbclue', label: VERBS.tiebreakerClue.label, disabled: true, onclick: () => {} });
      if (onrolloff) out.push(stepItem(step(VERBS.rollOff, rollOff), 'rolloff'));
      out.push({ id: 'cowinners', label: VERBS.coWinners.label, onclick: () => (logged(session, 'Co-winners declared', () => (session.coWinners = ties.map((p) => p.id))), oncowinners?.()) });
    }
    if (last) out.push({ label: isFinal(last) ? '◀ Back to final reveals' : `◀ Back to ${roundName(last, lastIndex)}`, onclick: onback });
    out.push({ label: '📋 Copy standings', onclick: copyStandings });
    if (nextGame && !asking && !app.test) out.push({ label: '▶ Next game…', onclick: nextGame });
    if (!asking && !app.test) out.push({ label: '🔁 Rematch', hint: 'Asks first: the scores go back to 0', onclick: askRematch });
    return out;
  });
</script>

<!-- (One column, spaced as the rest of the panel: the tie box and the line under it never sit on the buttons.) -->
<div class="end">
  {#if ties.length}
    <div class="tie" data-tie>
      <b>Tie for first:</b> {nameList(ties.map((p) => p.name))}
      <div class="row">
        <!-- Every way to settle it, here only (no blue button on the end screen). -->
        {#if tbReady}
          <button onclick={ontiebreaker} title="The tiebreaker clue: its question on screen, then pick who won">{VERBS.tiebreakerClue.label}</button>
        {:else}
          <button disabled title={app.playerOnly ? 'This game has no tiebreaker clue' : "Write one on the editor's Tiebreaker tab"}>{VERBS.tiebreakerClue.label}</button>
        {/if}
        {#if onrolloff}<button onclick={rollOff} title="{VERBS.rollOff.key}: the tied players roll for first">{VERBS.rollOff.label} <kbd aria-hidden="true">{VERBS.rollOff.key}</kbd></button>{/if}
        <button
          onclick={() => {
            // (Who they are: a different tie later, after a score is fixed, is still to settle.)
            logged(session, 'Co-winners declared', () => (session.coWinners = ties.map((p) => p.id)));
            oncowinners?.();
          }}>{VERBS.coWinners.label}</button
        >
      </div>
    </div>
  {:else if tiebreakHolds(session, level.map((p) => p.id))}
    <!-- Both are steps: ↶ Undo (Ctrl+Z) takes them back. -->
    <div class="muted">
      {session.tiebreakClue ? '❓' : '🎲'}
      {session.players.find((p) => p.id === session.rollOffWinner)?.name} won the tiebreaker {session.tiebreakClue ? 'clue' : 'roll-off'}.
    </div>
  {:else if coWinnersHold(session) && level.length}
    <div class="muted">🤝 Co-winners declared.</div>
  {/if}
  <!-- After the show, all on the left (the main cell stays empty: nothing slides into its place): the way back quiet,
       📋 Copy standings, ▶ Next game…, then 🔁 Rematch last and set apart (it clears the results, and asks first). -->
  <div class="row">
    {#if last}
      <button class="ghost" onclick={onback}>{isFinal(last) ? '◀ Back to final reveals' : `◀ Back to ${roundName(last, lastIndex)}`}</button>
    {/if}
    <button onclick={copyStandings} title="Copy the standings as one line of text">📋 Copy standings</button>
    <!-- (Not after ▶ Test this round: nothing of a test is kept, and 🚪 Exit goes back to the tested round.) -->
    {#if nextGame && !asking && !app.test}
      <button onclick={nextGame} title="Open the stream's next game (Open… / Recent games). The buzzer room, its players and the audience window stay up; these results stay viewable from the editor.">
        ▶ Next game…
      </button>
    {/if}
    <!-- (While it asks, the strip's own 🔁 Rematch answers.) -->
    <!-- (Not after ▶ Test this round either: a rematch would keep the throwaway test as the game to resume.) -->
    {#if !asking && !app.test}<button class="apart" onclick={askRematch} title="Same players, scores back to 0, fresh board (it asks first)">🔁 Rematch</button>{/if}
  </div>
</div>

<style>
  .end {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .tie {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    border: 1px solid var(--warn);
    border-radius: 8px;
  }
  /* 🔁 Rematch, last and set apart from the rest. */
  .apart {
    margin-left: 16px;
  }
</style>
