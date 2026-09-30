<!-- Final round host flow: private wagers, then a one-by-one reveal (spec §6.4). -->
<script lang="ts">
  import { textOn } from '../../lib/colors';
  import { formatPoints, roundName, type Game, type Session } from '../../lib/model';
  import { finalJudge, finalNext, finalShow, finalUnjudged, finalWagerCap, score } from '../../lib/session';

  let {
    game,
    session,
    armed = false,
    onstep,
    onreveal,
    onback,
  }: {
    game: Game;
    session: Session;
    /** Everyone is judged and N was pressed once: the next N finishes. */
    armed?: boolean;
    onstep: () => void;
    onreveal: () => void;
    /** Back to the round before this Final (wagers entered so far are kept). */
    onback: () => void;
  } = $props();
  const f = $derived(session.final);
  const sym = $derived(game.settings.currencySymbol);
  const byId = $derived(Object.fromEntries(session.players.map((p) => [p.id, p])));
  let override = $state(false);

  const wagersOk = $derived(
    !!f && f.players.every((id) => {
      const w = f.wagers[id];
      return typeof w === 'number' && w >= 0 && (override || w <= finalWagerCap(session, id));
    }),
  );

  function toggleIn(id: string): void {
    if (!f) return;
    if (f.players.includes(id)) {
      f.players = f.players.filter((x) => x !== id);
      f.order = f.order.filter((x) => x !== id);
    } else {
      f.players.push(id);
      f.order.push(id);
    }
  }

  function move(id: string, d: number): void {
    if (!f) return;
    const i = f.order.indexOf(id);
    const j = i + d;
    if (j < 0 || j >= f.order.length) return;
    [f.order[i], f.order[j]] = [f.order[j], f.order[i]];
  }

  // The round before this Final (where "◀ Back" goes).
  const lastRound = $derived(game.rounds[session.currentRound - 1]);
  const unjudged = $derived(finalUnjudged(session).length);

  /** "Finish game" was pressed with players still unjudged: it asks inline (a browser dialog would show on stream). */
  let askFinish = $state(false);
  let askedAt = 0;
  $effect(() => {
    if (!unjudged || session.finalStep !== 'reveal') askFinish = false;
  });

  function next(): void {
    // Finishing shows the winner and confetti on stream, so ask first if some players were never judged.
    if (session.finalStep === 'reveal' && unjudged && !askFinish) {
      askFinish = true;
      askedAt = Date.now();
      return;
    }
    // The second half of a double-click on "Finish game" doesn't count as the answer.
    if (askFinish && Date.now() - askedAt < 400) return;
    askFinish = false;
    finalNext(session, game);
    onstep();
  }

  const after = $derived(game.rounds[session.currentRound + 1]);
  const labels = $derived({
    category: 'Lock category, take wagers ▶',
    wagers: 'Show question ▶',
    question: 'Reveal answer ▶',
    answer: 'Start player reveals ▶',
    reveal: after ? `Next: ${roundName(after, session.currentRound + 1)} ▶` : 'Finish game ▶',
  });
</script>

{#if f}
  <div class="fj">
    {#if session.finalStep === 'category'}
      <span class="muted">Category is on screen. Players who can play:</span>
      <div class="row">
        {#each session.players as p (p.id)}
          <label class="check chip" style:border-color={p.color}>
            <input type="checkbox" checked={f.players.includes(p.id)} onchange={() => toggleIn(p.id)} />
            {p.name} <span class="muted small">{formatPoints(score(session, p.id), sym)}</span>
          </label>
        {/each}
      </div>
    {:else if session.finalStep === 'wagers'}
      <span class="muted">Enter each wager (only you see these).</span>
      <div class="wagers">
        {#each f.players as id (id)}
          {@const p = byId[id]}
          {@const cap = finalWagerCap(session, id)}
          {@const w = f.wagers[id]}
          <label class="check chip" style:border-color={p?.color}>
            {p?.name}
            <input
              type="number"
              min="0"
              value={w ?? ''}
              class:bad={typeof w === 'number' && !override && w > cap}
              oninput={(e) => (f.wagers[id] = e.currentTarget.value === '' ? (undefined as unknown as number) : +e.currentTarget.value)}
            />
            <span class="muted small">max {formatPoints(cap, sym)}</span>
          </label>
        {/each}
      </div>
      <label class="check small"><input type="checkbox" bind:checked={override} /> Ignore the limits</label>
    {:else if session.finalStep === 'reveal'}
      <span class="muted">
        Go one by one: spotlight → show wager → mark right or wrong. Reorder with ▲▼.
        <span class="small">Keys: N shows the wager, then the next player · C right · X wrong.</span>
      </span>
      <div class="order">
        {#each f.order as id, i (id)}
          {@const p = byId[id]}
          {@const res = f.results[id]}
          <div class="pl" class:cur={f.current === id} style:--c={p?.color}>
            <button class="ghost small" onclick={() => move(id, -1)} disabled={i === 0}>▲</button>
            <button class="ghost small" onclick={() => move(id, 1)} disabled={i === f.order.length - 1}>▼</button>
            <button
              class="name"
              style:background={p?.color}
              style:color={p ? textOn(p.color) : undefined}
              onclick={() => (f.current = id)}
              title="Spotlight on screen"
            >{p?.name}</button>
            <span class="muted small">{formatPoints(score(session, id), sym)} · wager {formatPoints(f.wagers[id] ?? 0, sym)}</span>
            <button class="small" onclick={() => finalShow(session, id)} disabled={f.shown[id]}>Show wager</button>
            <button class="small good" class:on={res === 'right'} onclick={() => (finalShow(session, id), finalJudge(session, game, id, true))}>✔ Right</button>
            <button class="small bad" class:on={res === 'wrong'} onclick={() => (finalShow(session, id), finalJudge(session, game, id, false))}>✘ Wrong</button>
          </div>
        {/each}
      </div>
    {/if}
    <div class="row">
      {#if session.finalStep === 'category' || session.finalStep === 'wagers'}
        {#if lastRound}<button class="ghost" onclick={onback} title="Wagers entered so far are kept">◀ Back to {roundName(lastRound, session.currentRound - 1)}</button>{/if}
      {/if}
      {#if session.finalStep === 'answer'}
        <button onclick={onreveal} title="R">🙈 Hide answer</button>
      {:else if session.finalStep === 'category' || session.finalStep === 'question'}
        <span class="muted small">Tip: click the screen to continue</span>
      {:else if session.finalStep === 'reveal'}
        {#if armed}
          <span class="armed">Everyone is judged: press N again (or the button) to finish.</span>
        {:else if unjudged}
          <span class="muted small">{unjudged} still to judge</span>
        {/if}
      {/if}
      <span class="spacer"></span>
      {#if askFinish}
        <span class="ask">{unjudged} player{unjudged === 1 ? '' : 's'} not judged yet · finish anyway?</span>
        <button class="primary small" onclick={next}>Finish</button>
        <button class="small" onclick={() => (askFinish = false)}>Keep judging</button>
      {:else}
        <button class="primary" onclick={session.finalStep === 'question' ? onreveal : next} disabled={session.finalStep === 'wagers' && !wagersOk} title="N">
          {labels[session.finalStep ?? 'category']}
        </button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .fj {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .chip {
    border: 2px solid;
    border-radius: 8px;
    padding: 4px 8px;
  }
  .wagers {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .wagers input {
    width: 100px;
  }
  input.bad {
    outline: 2px solid var(--bad);
  }
  .order {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .pl {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
    padding: 3px 6px;
    border-radius: 8px;
    border: 2px solid transparent;
  }
  .pl.cur {
    border-color: var(--c);
  }
  .name {
    font-weight: 700;
    border: none;
  }
  .small {
    font-size: 12px;
  }
  button.good:not(.on),
  button.bad:not(.on) {
    opacity: 0.7;
  }
  button.on {
    box-shadow: 0 0 0 2px #fff;
  }
  .armed {
    color: var(--good);
    font-weight: 600;
  }
  .ask {
    color: var(--warn);
    font-weight: 600;
    font-size: 12px;
  }
</style>
