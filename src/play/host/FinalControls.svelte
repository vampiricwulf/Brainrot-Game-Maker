<!-- Final round host flow: private wagers, then a one-by-one reveal (spec §6.4). -->
<script lang="ts">
  import { tick } from 'svelte';
  import { textOn } from '../../lib/colors';
  import { DragOrder } from '../../lib/dragorder.svelte';
  import { finalName, formatPoints, roundName, type Game, type Session } from '../../lib/model';
  import { currentFinal, finalJudge, finalNext, finalShow, finalUnjudged, finalWagerCap, finalWagerProblems, finalWagersOk, nameList, score } from '../../lib/session';
  import { logged, startStep } from '../../lib/toolset';

  let {
    game,
    session,
    armed = false,
    override = $bindable(false),
    onstep,
    onreveal,
    onback,
  }: {
    game: Game;
    session: Session;
    /** Everyone is judged and N was pressed once: the next N finishes. */
    armed?: boolean;
    /** "Ignore the limits" is ticked (bound, so N follows it too). */
    override?: boolean;
    onstep: () => void;
    onreveal: () => void;
    /** Back to the round before this Final (wagers entered so far are kept). */
    onback: () => void;
  } = $props();
  const f = $derived(session.final);
  const sym = $derived(game.settings.currencySymbol);
  const byId = $derived(Object.fromEntries(session.players.map((p) => [p.id, p])));
  const problems = $derived(finalWagerProblems(session, override));
  const wagersOk = $derived(finalWagersOk(session, override));
  const names = (ids: string[]) => nameList(ids.map((id) => byId[id]?.name ?? '?'));
  const title = $derived.by(() => {
    const r = currentFinal(session, game);
    return r ? finalName(r) : 'the Final';
  });

  const wagerBoxes: HTMLInputElement[] = $state([]);

  /** Enter in a wager box: show the question once every wager is fine, else go to the next box that needs one. */
  function wagerEnter(i: number): void {
    if (!f) return;
    if (wagersOk) return next();
    const after = [...f.players.slice(i + 1), ...f.players.slice(0, i + 1)];
    const todo = after.find((id) => problems.missing.includes(id) || problems.over.includes(id));
    if (todo) wagerBoxes[f.players.indexOf(todo)]?.focus();
  }

  // Who plays, the reveal order and each wager are undoable steps (Ctrl+Z, the 📜 Log's history).
  function toggleIn(id: string): void {
    const fs = f;
    if (!fs) return;
    const out = fs.players.includes(id);
    logged(session, `${byId[id]?.name ?? '?'} ${out ? 'sits out' : 'plays'} ${title}`, () => {
      if (out) {
        fs.players = fs.players.filter((x) => x !== id);
        fs.order = fs.order.filter((x) => x !== id);
      } else {
        fs.players.push(id);
        fs.order.push(id);
      }
    });
  }

  /** Move a player `d` places up (−) or down the reveal order (the others close up). */
  function move(id: string, d: number): void {
    const fs = f;
    if (!fs) return;
    const i = fs.order.indexOf(id);
    const j = i + d;
    if (i < 0 || j < 0 || j >= fs.order.length || !d) return;
    // One step (Ctrl+Z, the 📜 Log's history), however far the row went (▲▼, Alt+↑/↓ or a drag).
    const [first, second] = d < 0 ? [id, fs.order[j]] : [fs.order[j], id];
    logged(session, `Reveal order: ${byId[first]?.name ?? '?'} before ${byId[second]?.name ?? '?'}`, () => {
      fs.order.splice(i, 1);
      fs.order.splice(j, 0, id);
    });
  }

  /** The wager being typed: one step from the box's focus until it's left. */
  let wagerStep: { id: string; done: (text: string) => void } | null = null;

  function wagerDone(): void {
    const w = wagerStep;
    wagerStep = null;
    if (!w || !f) return;
    const v = f.wagers[w.id];
    w.done(`${byId[w.id]?.name ?? '?'}’s wager: ${typeof v === 'number' ? formatPoints(v, sym) : 'none'}`);
  }

  let orderEl = $state<HTMLElement>();
  const rows = new DragOrder();

  /**
   * ▲▼ or Alt+↑/↓: one place up or down. Moving a row drops keyboard focus, so it goes back to the moved row's
   * `refocus` button (its name if that one is now disabled), letting them repeat.
   */
  function nudge(id: string, d: number, refocus = '.name'): void {
    move(id, d);
    tick().then(() => {
      const row = orderEl?.querySelector(`[data-row="${id}"]`);
      const target = row?.querySelector<HTMLButtonElement>(refocus);
      (target && !target.disabled ? target : row?.querySelector<HTMLElement>('.name'))?.focus();
    });
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
    wagerDone();
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
        {#each f.players as id, i (id)}
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
              onfocus={() => {
                wagerDone();
                wagerStep = { id, done: startStep(session) };
              }}
              onblur={wagerDone}
              onkeydown={(e) => e.key === 'Enter' && wagerEnter(i)}
              bind:this={wagerBoxes[i]}
            />
            <span class="muted small">{cap || override ? `max ${formatPoints(cap, sym)}` : `can only wager ${formatPoints(0, sym)}`}</span>
          </label>
        {/each}
      </div>
      <label class="check small">
        <input type="checkbox" bind:checked={override} onkeydown={(e) => e.key === 'Enter' && wagersOk && next()} /> Ignore the limits
      </label>
    {:else if session.finalStep === 'reveal'}
      <span class="muted">
        Go one by one: spotlight → show wager → mark right or wrong. Reorder by dragging ⋮⋮ (or ▲▼, Alt+↑/↓). Click a name
        here or on the stage to spotlight it.
        <span class="small">Keys: N shows the wager, then the next player · Shift+N back · 1–9 spotlight · C right · X wrong.</span>
      </span>
      <div class="order" role="list" aria-label="Reveal order" bind:this={orderEl}>
        {#each f.order as id, i (id)}
          {@const p = byId[id]}
          {@const res = f.results[id]}
          {@const line = rows.lineAt(id)}
          <div
            class="pl"
            class:cur={f.current === id}
            class:drop-before={line === 'before'}
            class:drop-after={line === 'after'}
            class:dragging={rows.dragging === id}
            style:--c={p?.color}
            data-row={id}
            role="listitem"
            ondragover={(e) => rows.over(e, id)}
            ondrop={(e) => {
              const m = rows.drop(e, f.order);
              if (m) move(f.order[m.from], m.to - m.from);
            }}
          >
            <!-- Only the grip drags: a press on Right or Wrong that moves a little is still a press. -->
            <span
              class="grip"
              draggable="true"
              ondragstart={(e) => rows.start(e, id, (e.currentTarget as HTMLElement).parentElement)}
              ondragend={() => rows.end()}
              aria-hidden="true"
              title="Drag to change the order">⋮⋮</span
            >
            <button class="ghost small up" onclick={() => nudge(id, -1, '.up')} disabled={i === 0} aria-label="Earlier">▲</button>
            <button class="ghost small down" onclick={() => nudge(id, 1, '.down')} disabled={i === f.order.length - 1} aria-label="Later">▼</button>
            <button
              class="name"
              style:background={p?.color}
              style:color={p ? textOn(p.color) : undefined}
              onclick={() => (f.current = id)}
              onkeydown={(e) => {
                // Alt+↑/↓ moves them in the order.
                if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
                e.preventDefault();
                e.stopPropagation();
                nudge(id, e.key === 'ArrowUp' ? -1 : 1);
              }}
              title="Spotlight on screen · drag the row (or Alt+↑/↓) to change the order"
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
      {:else if session.finalStep === 'wagers' && !wagersOk}
        <span class="muted small">
          {problems.missing.length ? `Waiting on: ${names(problems.missing)}` : `Over the max: ${names(problems.over)}`}
        </span>
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
    position: relative;
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
    padding: 3px 6px;
    border-radius: 8px;
    border: 2px solid transparent;
  }
  .pl.dragging {
    opacity: 0.5;
  }
  /* Where a dragged row goes. */
  .pl.drop-before::before,
  .pl.drop-after::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--accent);
  }
  .pl.drop-before::before {
    top: -3px;
  }
  .pl.drop-after::after {
    bottom: -3px;
  }
  .grip {
    cursor: grab;
    color: var(--muted);
    font-size: 11px;
    letter-spacing: -2px;
    user-select: none;
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
