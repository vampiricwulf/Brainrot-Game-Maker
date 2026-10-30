<!--
  Answers players type on their phone, which only the host sees, here: a ✍ clue's (everyone) or the Final's (its
  players). On a ✍ clue ✔ / ✘ on each marks it right or wrong (the clue's value, as ＋ Award / − Deduct would), once per
  player; Ctrl+Z takes one back. In a single window (viewers see this panel) only who has answered shows until the
  answer is up, in the rows (and with the room) the words then take, so the stage on stream keeps its size; then the
  words, to judge, in that room (long ones scroll). The Final's stay hidden there until each is revealed (hideUntilShown), on one line.
  Multiple choice: each pick by its letter, how many picked each (where the words show, never in the head's status, so
  a screen reader doesn't read a tally after every pick), and once the answers are locked ✔ Judge all, by the choice
  marked ✔ Right.
-->
<script lang="ts">
  import { textOn } from '../../lib/colors';
  import type { Session } from '../../lib/model';
  import { choiceCounts, countsLine, judgeAllPlan, letter, matchChoice, pickLabel, rightChoice, type UsableChoice } from '../../lib/choices';

  let {
    session,
    players,
    answers,
    title = '✍ Everyone answers',
    clueId,
    phones = [],
    open,
    dual = true,
    hideUntilShown = false,
    onjudge,
    choices = [],
    note = '',
    onjudgeall,
  }: {
    session: Session;
    /** Who answers (ids), in the players' order. */
    players: string[];
    /** What their phones sent, by player (teams: `by`, who on it sent it; `pick`: the choice picked). */
    answers: Record<string, { text: string; by?: string; pick?: string }>;
    title?: string;
    /** A ✍ clue: its judgments are in the score log under it. */
    clueId?: string;
    /** The players with a phone connected now. */
    phones?: string[];
    /** Phones can still send (the answer isn't on screen). */
    open: boolean;
    /** An audience window is open: this panel is off stream. */
    dual?: boolean;
    /** The Final: in a single window the words stay hidden after the answer shows too (each shows as it's revealed). */
    hideUntilShown?: boolean;
    /** ✔ / ✘ on each (none without it). */
    onjudge?: (playerId: string, sign: 1 | -1) => void;
    /** Multiple choice: the usable ones (choices.ts usableChoices), lettered as the phones letter them. */
    choices?: UsableChoice[];
    /** Said under the head (a buzzer server that can't show the choices). */
    note?: string;
    /** ✔ Judge all (once the answers are locked, with a choice marked ✔ Right). */
    onjudgeall?: () => void;
  } = $props();

  const listed = $derived(session.players.filter((p) => players.includes(p.id)));
  const inCount = $derived(listed.filter((p) => answers[p.id]).length);
  /** The words are on this panel: off stream, or (a ✍ clue) once the answer is up. */
  const words = $derived(dual || (!open && !hideUntilShown));
  /** How each player was judged on this clue (from the score log): 1 right, -1 wrong. */
  const judged = $derived.by(() => {
    const out: Record<string, 1 | -1> = {};
    if (clueId) for (const e of session.scoreLog) if (!e.undone && e.clueId === clueId) out[e.playerId] = (e.right ?? e.delta > 0) ? 1 : -1;
    return out;
  });
  const onStream = $derived(
    hideUntilShown
      ? 'viewers see this window: each answer shows here as you reveal it. Open the 📺 audience window to read them before they go on screen'
      : 'viewers see this window: the answers show here once the answer is up',
  );
  /** The answer is on screen now (the Final: its answer step; a ✍ clue: revealed), not hidden again. */
  const showing = $derived(hideUntilShown ? session.finalStep === 'answer' : session.revealed);
  const locked = $derived(showing ? ' · locked (the answer is showing)' : ' · locked (the answer was on screen)');
  const ids = $derived(listed.map((p) => p.id));
  const right = $derived(rightChoice(choices));
  /** Who ✔ Judge all would mark (nobody while answers can still change). */
  const plan = $derived(onjudgeall && right && !open ? judgeAllPlan(ids, answers, choices, judged) : { right: [], wrong: [] });
  const rightLetter = $derived(right ? letter(choices.indexOf(right)) : '');
  /** A single window's ✍ clue: the words' rows, counts and ✔ Judge all keep their room while those aren't there. */
  const keepRoom = $derived(!dual && !hideUntilShown);
  /**
   * The rows' height while the words were hidden: shown, they keep it (long answers scroll in it), so the stage on
   * stream doesn't shrink as the answer comes up.
   */
  let rowsBox = $state<DOMRectReadOnly>();
  let rowsH = $state(0);
  $effect(() => {
    if (keepRoom && !words && rowsBox) rowsH = rowsBox.height;
  });
  const capH = $derived(keepRoom && words && rowsH > 0 ? rowsH : 0);
  /** Where the words aren't shown: whether this player's is in (and once locked, that none came). */
  const inTitle = (id: string) => (answers[id] ? 'Answer in' : !phones.includes(id) ? 'No phone connected' : open ? 'Waiting…' : 'No answer');
  const inMark = (id: string) => (answers[id] ? '✔' : open ? '…' : '—');
</script>

<section class="answers" aria-label="Answers from phones">
  <div class="head">
    <b>{title}{choices.length ? ' · multiple choice' : ''}</b>
    <!-- (A single window's ✍ clue: the line keeps the room it takes once locked, its longest, so it never wraps anew.) -->
    <span class="muted small slot"
      ><span role="status">{inCount} of {listed.length} in · {dual ? 'only you see them' : onStream}{open ? '' : locked}</span
      >{#if keepRoom}<span class="room" aria-hidden="true">{inCount} of {listed.length} in · {onStream} · locked (the answer was on screen)</span>{/if}</span
    >
  </div>
  {#if note}<p class="small note">{note}</p>{/if}
  {#if words && choices.length}
    <p class="small counts" data-choice-counts>{countsLine(choiceCounts(ids, answers, choices))}</p>
  {:else if keepRoom && choices.length}
    <p class="small counts" aria-hidden="true">&nbsp;</p>
  {/if}
  {#if plan.right.length || plan.wrong.length}
    <p class="judge-all">
      <button
        class="good small"
        onclick={onjudgeall}
        title="Right (+ the clue's value) for every {rightLetter}, wrong for every other choice (− the value, if the rules take points). Players with no answer, or words that match no choice, are left for you. One Ctrl+Z takes it all back."
        >✔ Judge all: {rightLetter} is right</button
      >
    </p>
  {:else if keepRoom && onjudgeall && right}
    <p class="judge-all" aria-hidden="true"></p>
  {/if}
  {#if words || keepRoom}
    <ul class:dense={!dual} class:capped={capH > 0} style:max-height={capH ? `${capH}px` : null} bind:contentRect={rowsBox}>
      {#each listed as p (p.id)}
        {#if !words}
          <!-- Single window, the words not to be seen yet: who has answered (✔), never the words. -->
          <li data-answer-in={p.id} title={inTitle(p.id)}>
            <span class="who" style:background={p.color} style:color={textOn(p.color)}>{p.name}</span>
            <span class="text muted">{inMark(p.id)}</span>
          </li>
        {:else}
          {@const a = answers[p.id]}
          {@const j = judged[p.id]}
          <!-- Multiple choice: a pick by its letter ("B · Stockholm"); typed words with the choice they name ("= B"), if any. -->
          {@const picked = a && choices.length ? pickLabel(choices, a.pick) : undefined}
          {@const named = a && choices.length && !picked ? matchChoice(a.text, choices) : null}
          <li data-answer-row={p.id}>
            <span class="who" style:background={p.color} style:color={textOn(p.color)}>{p.name}</span>
            <!-- (Each answer keeps its own direction in a <bdi>: a right-to-left one sits by the name, not at the row's far end.
                 The spaces go before the spans: one inside a span's start would be dropped.) -->
            <span class="text" class:muted={!a || (!!a.pick && !picked)} class:selectable={dual}
              >{#if a}{#if picked}<b><bdi>{picked}</bdi></b>{:else}“<bdi>{a.text}</bdi>”{#if named}{' '}<span class="muted">= {letter(choices.findIndex((c) => c.id === named))}</span>{/if}{/if}{#if a.by}{' '}<span
                    class="muted small">· {a.by}</span
                  >{/if}{:else if phones.includes(p.id)}{open ? 'waiting…' : 'no answer'}{:else}no phone connected{/if}</span
            >
            {#if j}
              <span class="mark" class:right={j > 0} class:wrong={j < 0}>{j > 0 ? '✔ Right' : '✘ Wrong'}</span>
            {:else if onjudge}
              <button class="good small" onclick={() => onjudge(p.id, 1)} aria-label="{p.name} is right" title="Right: + the clue's value">✔</button>
              <button class="bad small" onclick={() => onjudge(p.id, -1)} aria-label="{p.name} is wrong" title="Wrong: − the clue's value (if the rules take points)">✘</button>
            {/if}
          </li>
        {/if}
      {/each}
    </ul>
  {:else}
    <!-- The Final in a single window: on one line, who has answered (✔), never the words. -->
    <p class="small in">
      {#each listed as p (p.id)}
        <span
          class="who"
          style:background={p.color}
          style:color={textOn(p.color)}
          data-answer-in={p.id}
          title={inTitle(p.id)}>{p.name} {inMark(p.id)}</span
        >
      {/each}
    </p>
  {/if}
</section>

<style>
  .answers {
    max-width: 760px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .head {
    display: flex;
    gap: 10px;
    align-items: baseline;
    flex-wrap: wrap;
  }
  .slot {
    display: inline-grid;
  }
  .slot > * {
    grid-area: 1 / 1;
  }
  .room {
    visibility: hidden;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  /* A single window (on stream): rows side by side (2 a line in the box), so the words take less of the stage's height. */
  ul.dense {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 4px 16px;
  }
  /* (Rows of a few lines start at their top, name and ✔ / ✘ by the first line: in sight before any scrolling.) */
  ul.capped {
    overflow-y: auto;
    align-items: start;
  }
  ul.capped li {
    align-items: flex-start;
  }
  .in {
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 8px;
  }
  /* A row is as tall as its ✔ / ✘ buttons with them or without (16px a line, 2px padding and 1px border each side). */
  li {
    display: flex;
    gap: 8px;
    align-items: center;
    min-height: 22px;
  }
  button.small {
    line-height: 16px;
  }
  .who {
    flex: none;
    padding: 1px 8px;
    border-radius: 6px;
    font-weight: 700;
    max-width: 12em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* On a crowded row a long name gives way (cut short, …), not the answer: it keeps room for a few words a line. */
  li .who {
    flex-shrink: 1;
    min-width: 3em;
  }
  .text {
    flex: 1;
    min-width: 8em;
    overflow-wrap: anywhere;
  }
  .mark {
    font-weight: 700;
  }
  .note,
  .counts,
  .judge-all {
    margin: 0;
  }
  /* (Its button's height, empty too: see li. Up to 1180px wide the host panel's buttons are a size bigger: see the
     narrow rule in HostPanel.) */
  .judge-all {
    display: flex;
    min-height: 22px;
  }
  @media (max-width: 1180px) {
    .judge-all {
      min-height: 28px;
    }
  }
  .note {
    color: var(--warn, var(--muted));
  }
  .counts {
    font-weight: 600;
  }
  .mark.right {
    color: var(--good);
  }
  .mark.wrong {
    color: var(--bad);
  }
</style>
