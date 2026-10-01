<!-- Final round host flow: private wagers, then a one-by-one reveal (spec §6.4). -->
<script lang="ts">
  import { tick } from 'svelte';
  import { toast } from '../../lib/app.svelte';
  import { textOn } from '../../lib/colors';
  import { DragOrder } from '../../lib/dragorder.svelte';
  import { finalName, formatPoints, roundName, type Game, type Session } from '../../lib/model';
  import {
    currentFinal, finalChoose, finalShow, finalUnjudged, finalWagerCap, finalWagerProblems, finalWagerRefused, finalWagersOk, hasWager, nameList, score,
  } from '../../lib/session';
  import { finalNextStep, logged, startStep } from '../../lib/toolset';

  let {
    game,
    session,
    dual = false,
    armed = false,
    override = $bindable(false),
    onstep,
    onreveal,
    onjudge,
    onback,
  }: {
    game: Game;
    session: Session;
    /** An audience window is open: viewers don't see this window. */
    dual?: boolean;
    /** Everyone is judged and N was pressed once: the next N finishes. */
    armed?: boolean;
    /** "Ignore the limits" is ticked (bound, so N follows it too). */
    override?: boolean;
    onstep: () => void;
    onreveal: () => void;
    /** Mark a player right or wrong in the reveals (with its sound, as C / X). */
    onjudge: (id: string, right: boolean) => void;
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
  /** Their wager still has to be typed, or fixed (not a whole number, or over the max). */
  const needsWager = (id: string) => problems.missing.includes(id) || problems.whole.includes(id) || problems.over.includes(id);

  /** Enter in a wager box: show the question once every wager is fine, else go to the next box that needs one. */
  function wagerEnter(i: number): void {
    if (!f) return;
    if (wagersOk) return next();
    const after = [...f.players.slice(i + 1), ...f.players.slice(0, i + 1)];
    const todo = after.find(needsWager);
    if (todo) wagerBoxes[f.players.indexOf(todo)]?.focus();
  }

  // The wagers come up with the first one still to type focused, as a Daily Double's does (else typed digits select
  // players, or go into the ⏱ seconds box, where Enter starts a countdown). All in (Ctrl+Z back to them): N goes on.
  $effect(() => {
    if (session.finalStep !== 'wagers') return;
    void tick().then(() => {
      const fs = f;
      if (!fs || session.finalStep !== 'wagers') return;
      const todo = fs.players.findIndex(needsWager);
      if (todo >= 0) wagerBoxes[todo]?.focus();
    });
  });

  // Who plays, the reveal order and each wager are undoable steps (Ctrl+Z, the 📜 Log's history). A player ticked
  // back in goes back to their place in the reveal order (lowest score first).
  function toggleIn(id: string): void {
    const fs = f;
    if (!fs) return;
    const out = fs.players.includes(id);
    logged(session, `${byId[id]?.name ?? '?'} ${out ? 'sits out' : 'plays'} ${title}`, () => finalChoose(session, id, !out));
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
    // From the wagers to the question is a step: Ctrl+Z goes back to the wagers, as they were.
    finalNextStep(session, game);
    onstep();
  }

  /**
   * The reveals: a player with no wager (never taken as 0) gets one typed in their row, as a step. A whole number, up
   * to their max unless "Ignore the limits" was ticked.
   */
  function setWager(id: string, value: string): void {
    const fs = f;
    const v = Number(value);
    if (!fs || value.trim() === '' || !Number.isFinite(v)) return;
    const why = finalWagerRefused(session, id, v, override);
    if (why === 'whole') return toast('A wager is a whole number, 0 or more', 3000);
    if (why === 'over') return toast(`Over ${byId[id]?.name ?? '?'}’s max of ${formatPoints(finalWagerCap(session, id), sym)}`, 3000);
    logged(session, `${byId[id]?.name ?? '?'}’s wager: ${formatPoints(v, sym)}`, () => (fs.wagers[id] = v));
  }

  // The spotlit row stays in sight in a long list (8 players in a short window).
  $effect(() => {
    const id = f?.current;
    if (!id || session.finalStep !== 'reveal') return;
    void tick().then(() => orderEl?.querySelector(`[data-row="${id}"]`)?.scrollIntoView({ block: 'nearest' }));
  });

  const after = $derived(game.rounds[session.currentRound + 1]);
  const goOn = $derived(after ? `Next: ${roundName(after, session.currentRound + 1)} ▶` : 'Finish game ▶');
  const labels = $derived({
    // Everyone sat out: straight on (finalNext skips the wagers and reveals).
    category: f && !f.players.length ? goOn : 'Lock category, take wagers ▶',
    wagers: 'Show question ▶',
    question: 'Reveal answer ▶',
    answer: 'Start player reveals ▶',
    reveal: goOn,
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
      {#if !f.players.length}
        <!-- Nobody to wager or reveal: the button goes on to the next round (or the end). -->
        <span class="nobody" role="status">Nobody is playing this Final: tick a player to play it, or go on.</span>
      {/if}
    {:else if session.finalStep === 'wagers'}
      {#if dual}
        <span class="muted">Enter each wager (only you see these).</span>
      {:else}
        <span class="exposed">⚠ Viewers can see this: they see this window, the wagers as you type them too. Open the 📺 audience window to keep them secret.</span>
      {/if}
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
              step="1"
              value={w ?? ''}
              class:bad={typeof w === 'number' && ((!override && w > cap) || !Number.isInteger(w))}
              oninput={(e) => (f.wagers[id] = e.currentTarget.value === '' ? (undefined as unknown as number) : +e.currentTarget.value)}
              onfocus={() => {
                wagerDone();
                wagerStep = { id, done: startStep(session) };
              }}
              onblur={wagerDone}
              onkeydown={(e) => e.key === 'Enter' && wagerEnter(i)}
              bind:this={wagerBoxes[i]}
              data-wager={id}
            />
            <span class="muted small">{cap || override ? `max ${formatPoints(cap, sym)}` : `can only wager ${formatPoints(0, sym)}`}</span>
          </label>
        {/each}
      </div>
      <label class="check small">
        <input type="checkbox" bind:checked={override} onkeydown={(e) => e.key === 'Enter' && wagersOk && next()} /> Ignore the limits
      </label>
    {:else if session.finalStep === 'reveal'}
      <!-- The how-to folds away: the rows (and the stage) keep the room. -->
      <details class="how">
        <summary class="muted">One by one: spotlight → show wager → right or wrong (N, C, X)</summary>
        <span class="muted small">
          Click a name here or on the stage to spotlight it. Reorder by dragging ⋮⋮ (or ▲▼, Alt+↑/↓). Keys: N shows the wager,
          then the next player · Shift+N back · 1–9 spotlight · C right · X wrong.
        </span>
      </details>
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
            {#if hasWager(f, id)}
              <span class="muted small">{formatPoints(score(session, id), sym)} · wager {formatPoints(f.wagers[id], sym)}</span>
              <button class="small" onclick={() => finalShow(session, id)} disabled={f.shown[id]}>Show wager</button>
            {:else}
              <!-- No wager in (it's never taken as 0): asked for here before they can be judged. -->
              {@const cap = finalWagerCap(session, id)}
              <label class="check small no-wager">
                {formatPoints(score(session, id), sym)} · no wager:
                <input
                  type="number"
                  min="0"
                  step="1"
                  max={override ? undefined : cap}
                  placeholder="wager"
                  aria-label="{p?.name}’s wager"
                  onkeydown={(e) => e.key === 'Enter' && setWager(id, e.currentTarget.value)}
                  onchange={(e) => setWager(id, e.currentTarget.value)}
                />
                {#if !override}<span class="muted">max {formatPoints(cap, sym)}</span>{/if}
              </label>
            {/if}
            <button class="small good" class:on={res === 'right'} aria-pressed={res === 'right'} disabled={!hasWager(f, id)} onclick={() => onjudge(id, true)}>✔ Right</button>
            <button class="small bad" class:on={res === 'wrong'} aria-pressed={res === 'wrong'} disabled={!hasWager(f, id)} onclick={() => onjudge(id, false)}>✘ Wrong</button>
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
          {problems.missing.length
            ? `Waiting on: ${names(problems.missing)}`
            : problems.whole.length
              ? `Not a whole number: ${names(problems.whole)}`
              : `Over the max: ${names(problems.over)}`}
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
  /* The step's button (Finish…) stays in sight while a long list of players scrolls. */
  .fj > .row:last-child {
    position: sticky;
    bottom: 0;
    z-index: 1;
    padding: 4px 0;
    background: var(--panel);
  }
  .no-wager {
    color: var(--warn);
  }
  .no-wager input {
    width: 80px;
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
  .how summary {
    cursor: pointer;
    font-size: 12px;
  }
  .pl {
    position: relative;
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
    padding: 2px 6px;
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
    font-size: 12px;
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
  /* Not chosen: outlined only (dimming them read too faintly). */
  button.good:not(.on) {
    background: transparent;
    color: var(--good);
  }
  button.bad:not(.on) {
    background: transparent;
    border-color: var(--bad);
    color: var(--bad);
  }
  button.on {
    box-shadow: 0 0 0 2px #fff;
  }
  .exposed {
    color: var(--warn);
    font-size: 12px;
  }
  .nobody {
    color: var(--warn);
    font-weight: 600;
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
