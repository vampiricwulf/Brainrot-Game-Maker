<!-- "Who goes first" (or a tiebreaker roll-off for the win): everyone rolls in their color; tied leaders re-roll until one winner remains. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { fly } from '../../lib/motion.svelte';
  import { ROLLOFF_REVEAL_MS, ROLLOFF_ROLL_MS, type Overlay } from '../../lib/live';
  import type { Session } from '../../lib/model';
  import { textOn } from '../../lib/colors';
  import Die from './Die.svelte';

  let { o, session }: { o: Extract<Overlay, { kind: 'rolloff' }>; session: Session } = $props();
  let now = $state(Date.now());
  onMount(() => {
    const id = setInterval(() => (now = Date.now()), 70);
    return () => clearInterval(id);
  });

  const ROLL = ROLLOFF_ROLL_MS;
  const byId = $derived(Object.fromEntries(session.players.map((p) => [p.id, p])));
  const elapsed = $derived(now - o.startedAt);
  const roundIdx = $derived(Math.min(o.rounds.length - 1, Math.floor(elapsed / o.roundMs)));
  const round = $derived(o.rounds[roundIdx]);
  const rolling = $derived(elapsed - roundIdx * o.roundMs < ROLL);
  const done = $derived(elapsed >= (o.rounds.length - 1) * o.roundMs + ROLLOFF_REVEAL_MS);
  const top = $derived(Math.max(...round.players.map((p) => round.rolls[p])));
  const tied = $derived(!rolling && !done && round.players.filter((p) => round.rolls[p] === top).length > 1);
  const winner = $derived(byId[o.winner]);

  function shown(pid: string, i: number): string {
    if (rolling) return String(1 + ((Math.floor(now / 70) * 7919 + i * 104729) % o.sides));
    return String(round.rolls[pid]);
  }
</script>

<!-- Many players (who goes first with 12): smaller dice and names, so every row, the title and the result stay on the stage. -->
<div class="wrap" class:many={round.players.length > 8}>
  <div class="title">
    {roundIdx === 0 ? (o.purpose === 'tiebreak' ? 'Tiebreaker roll-off!' : o.purpose === 'buzz' ? 'Tie! Roll for it' : 'Who goes first?') : 'Re-roll!'}
  </div>
  <div class="row">
    {#each round.players as pid, i (pid)}
      {@const p = byId[pid]}
      <div class="pl" class:lead={!rolling && round.rolls[pid] === top} class:out={!rolling && round.rolls[pid] !== top}>
        <Die value={shown(pid, i)} sides={o.sides} color={p?.color ?? '#fff'} {rolling} size={round.players.length > 8 ? 120 : round.players.length > 5 ? 160 : 200} label={false} />
        <div class="nm" dir="auto" title={p?.name} style:background={p?.color} style:color={p ? textOn(p.color) : undefined}>{p?.name ?? '?'}</div>
      </div>
    {/each}
  </div>
  <!-- The line under the dice keeps its room from the start: the dice don't jump up when the result comes. -->
  <div class="foot">
    {#if tied}<div class="msg">Tie! Re-rolling…</div>{/if}
    {#if done && winner}
      <div class="win" in:fly={{ y: 60, duration: 400 }}>
        <span dir="auto" style:background={winner.color} style:color={textOn(winner.color)}>{winner.name}</span> {o.purpose === 'tiebreak' ? 'wins the game!' : o.purpose === 'buzz' ? 'answers first!' : 'goes first!'}
      </div>
    {/if}
  </div>
</div>

<style>
  .wrap {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 60px;
  }
  .title {
    font-family: var(--value-font);
    font-size: 90px;
    font-weight: 900;
    color: var(--value);
    text-shadow: 6px 6px 0 #000;
  }
  .row {
    display: flex;
    gap: 50px;
    flex-wrap: wrap;
    justify-content: center;
    /* Room at the sides for the leader's bigger die and name. */
    max-width: 1760px;
  }
  .many {
    gap: 36px;
  }
  .many .row {
    gap: 28px 40px;
  }
  .many .nm {
    font-size: 36px;
    max-width: 380px;
  }
  .pl {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 18px;
    transition: opacity 0.3s, scale 0.3s;
  }
  .pl.lead {
    scale: 1.12;
  }
  .pl.lead .nm {
    box-shadow: 0 0 0 5px #fff;
  }
  /* Out of the running, but still readable on a scaled-down stream. */
  .pl.out {
    opacity: 0.72;
  }
  .nm {
    font-family: var(--board-font);
    font-size: 44px;
    font-weight: 800;
    padding: 4px 20px;
    border-radius: 12px;
    /* A long name ends in "…" rather than pushing the others off. */
    max-width: 520px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .foot {
    min-height: 130px;
    max-width: 1800px;
    display: grid;
    place-items: center;
    text-align: center;
  }
  .msg {
    font-size: 70px;
    font-weight: 900;
    color: #fff;
    font-family: var(--value-font);
  }
  .win {
    font-family: var(--value-font);
    font-size: 84px;
    font-weight: 900;
    color: #fff;
    text-shadow: 6px 6px 0 #000;
  }
  .win span {
    padding: 0 26px;
    border-radius: 16px;
    text-shadow: none;
    /* A long name wraps instead of running off the stage. */
    box-decoration-break: clone;
    -webkit-box-decoration-break: clone;
  }
  .win {
    line-height: 1.25;
  }
</style>
