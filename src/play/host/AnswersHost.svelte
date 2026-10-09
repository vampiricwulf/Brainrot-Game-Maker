<!--
  A ✍ clue: everyone types an answer on their phone and only the host sees them, here. ✔ / ✘ on each marks it right or
  wrong (the clue's value, as ＋ Award / − Deduct would), once per player; Ctrl+Z takes one back. In a single window
  (viewers see this panel) only who has answered shows until the answer is up; then the words, to judge.
-->
<script lang="ts">
  import { textOn } from '../../lib/colors';
  import type { Game, Session } from '../../lib/model';

  let {
    session,
    clueId,
    phones = [],
    open,
    dual = true,
    onjudge,
  }: {
    game: Game;
    session: Session;
    clueId: string;
    /** The players with a phone connected now. */
    phones?: string[];
    /** Phones can still send (the answer isn't on screen). */
    open: boolean;
    /** An audience window is open: this panel is off stream. */
    dual?: boolean;
    onjudge: (playerId: string, sign: 1 | -1) => void;
  } = $props();

  const answers = $derived(session.remote?.answers?.id === clueId ? session.remote.answers.seats : {});
  const inCount = $derived(session.players.filter((p) => answers[p.id]).length);
  /** How each player was judged on this clue (from the score log): 1 right, -1 wrong. */
  const judged = $derived.by(() => {
    const out: Record<string, 1 | -1> = {};
    for (const e of session.scoreLog) if (!e.undone && e.clueId === clueId) out[e.playerId] = (e.right ?? e.delta > 0) ? 1 : -1;
    return out;
  });
</script>

<section class="answers" aria-label="Answers from phones">
  <div class="head">
    <b>✍ Everyone answers</b>
    <span class="muted small" role="status"
      >{inCount} of {session.players.length} in · {dual ? 'only you see them' : 'viewers see this window: the answers show here once the answer is up'}{open ? '' : ' · locked (the answer is showing)'}</span
    >
  </div>
  {#if dual || !open}
    <ul class:dense={!dual}>
      {#each session.players as p (p.id)}
        {@const a = answers[p.id]}
        {@const j = judged[p.id]}
        <li data-answer-row={p.id}>
          <span class="who" style:background={p.color} style:color={textOn(p.color)}>{p.name}</span>
          <span class="text" class:muted={!a} dir="auto"
            >{#if a}“{a.text}”{#if a.by}<span class="muted small"> · {a.by}</span>{/if}{:else if phones.includes(p.id)}waiting…{:else}no phone connected{/if}</span
          >
          {#if j}
            <span class="mark" class:right={j > 0} class:wrong={j < 0}>{j > 0 ? '✔ Right' : '✘ Wrong'}</span>
          {:else}
            <button class="good small" onclick={() => onjudge(p.id, 1)} aria-label="{p.name} is right" title="Right: + the clue's value">✔</button>
            <button class="bad small" onclick={() => onjudge(p.id, -1)} aria-label="{p.name} is wrong" title="Wrong: − the clue's value (if the rules take points)">✘</button>
          {/if}
        </li>
      {/each}
    </ul>
  {:else}
    <!-- Single window, answers still open: on one line, who has answered (✔), never the words. -->
    <p class="small in">
      {#each session.players as p (p.id)}
        {@const a = answers[p.id]}
        <span
          class="who"
          style:background={p.color}
          style:color={textOn(p.color)}
          data-answer-in={p.id}
          title={a ? 'Answer in' : phones.includes(p.id) ? 'Waiting…' : 'No phone connected'}>{p.name} {a ? '✔' : '…'}</span
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
  .in {
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 8px;
  }
  li {
    display: flex;
    gap: 8px;
    align-items: center;
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
  .mark.right {
    color: var(--good);
  }
  .mark.wrong {
    color: var(--bad);
  }
</style>
