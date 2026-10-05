<!--
  Final round host flow (spec §6.4): one wager screen while the category is up (who plays, and each one's wager), then
  the question, the answer and a one-by-one reveal.
-->
<script lang="ts">
  import { onDestroy, tick, untrack } from 'svelte';
  import { toast } from '../../lib/app.svelte';
  import { textOn } from '../../lib/colors';
  import { DragOrder } from '../../lib/dragorder.svelte';
  import { finalName, formatPoints, roundName, type Game, type Session, type WagerSource } from '../../lib/model';
  import {
    currentFinal, finalChoose, finalSetWager, finalShow, finalUnjudged, finalWagerCap, finalWagerEditable, finalWagerProblems, finalWagerRefused, finalWagersOk,
    hasWager, nameList, score, slidePosition, wagerFromPhone, wagerSentBy,
  } from '../../lib/session';
  import { finalNextStep, logged, startStep } from '../../lib/toolset';
  import { hostAsk, offerNext } from './slots.svelte';

  let {
    game,
    session,
    dual = false,
    armed = false,
    override = $bindable(false),
    phones = [],
    phoneNote = '',
    onstep,
    onreveal,
    onrevealnext,
    onjudge,
    onback,
    onslide,
  }: {
    game: Game;
    session: Session;
    /** An audience window is open: viewers don't see this window. */
    dual?: boolean;
    /** Everyone is judged and N was pressed once: the next N finishes. */
    armed?: boolean;
    /** "Ignore the limits" is ticked (the default; bound, so N follows it too). */
    override?: boolean;
    /** Players (teams) with a phone in the buzzer room: they can send their wager from it. */
    phones?: string[];
    /** Why phones can't send wagers here (an older buzzer server), or ''. */
    phoneNote?: string;
    onstep: () => void;
    onreveal: () => void;
    /** N in the reveals: show the spotlit player's wager, then go on to the next player. */
    onrevealnext: () => void;
    /** Mark a player right or wrong in the reveals (with its sound, as C / X). */
    onjudge: (id: string, right: boolean) => void;
    /** Back to the round before this Final (who plays and the wagers entered so far are kept). */
    onback: () => void;
    /** Its question slides (several): the next one (1) or the one before (-1). */
    onslide?: (d: 1 | -1) => void;
  } = $props();
  /** A question with several slides, while it's up: which one is on screen ("Slide 2 of 3"). */
  const slidePos = $derived(slidePosition(session, game));
  const moreSlides = $derived(!!slidePos && slidePos.at < slidePos.of);
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

  let wagersEl = $state<HTMLElement>();
  const wagerBox = (id: string) => wagersEl?.querySelector<HTMLInputElement>(`input[data-wager="${id}"]`);
  /** Their wager still has to be typed, or fixed (not a whole number, or over the max). */
  const needsWager = (id: string) => problems.missing.includes(id) || problems.whole.includes(id) || problems.over.includes(id);
  /** Whose wager isn't right yet, and why (the wager screen's hint, as N's toast says it). */
  const waitingOn = $derived(
    problems.missing.length
      ? `Waiting on: ${names(problems.missing)}`
      : problems.whole.length
        ? `Not a whole number: ${names(problems.whole)}`
        : `Over the max: ${names(problems.over)}`,
  );

  /** Who plays, in the rows' order (the players' order: the reveal order, lowest score first, isn't the screen's). */
  const rowOrder = () => session.players.map((p) => p.id).filter((id) => !!f?.players.includes(id));

  /** Enter in a wager box: show the question once every wager is fine, else go to the next box that needs one. */
  function wagerEnter(id: string): void {
    if (!f) return;
    if (wagersOk) return next();
    const rows = rowOrder();
    const i = rows.indexOf(id);
    const after = [...rows.slice(i + 1), ...rows.slice(0, i + 1)];
    const todo = after.find(needsWager);
    if (todo) wagerBox(todo)?.focus();
  }

  // The wager screen comes up with the first wager still to type focused, as a Daily Double's does (else typed digits
  // select players, or go into the ⏱ seconds box, where Enter starts a countdown). All in (Ctrl+Z back to them): N
  // goes on.
  $effect(() => {
    if (session.finalStep !== 'wagers') return;
    void tick().then(() => {
      const fs = f;
      if (!fs || session.finalStep !== 'wagers') return;
      // Phones send the wagers: the keys stay the host's (N goes on once they're all in), no box to type in.
      if (phones.some((id) => fs.players.includes(id))) return;
      const todo = rowOrder().find(needsWager);
      if (todo) wagerBox(todo)?.focus();
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

  /** A wager as the history names it ("none" when there isn't one). */
  const shownWager = (v: number | undefined) => (typeof v === 'number' ? formatPoints(v, sym) : 'none');
  /** "Ann’s wager: $300", or "Ann’s wager: $500 → $300" when it changes one already in (a phone's too). */
  function wagerText(id: string, was: number | undefined, now: number | undefined, wasPhone: boolean): string {
    const name = `${byId[id]?.name ?? '?'}’s wager`;
    if (was === undefined) return `${name}: ${shownWager(now)}`;
    return `${name}${wasPhone ? ' (from their phone)' : ''}: ${shownWager(was)} → ${shownWager(now)}`;
  }

  /**
   * The wager being typed: what that player's wager was when the box got the focus. Once it's left, the change is one
   * step of that player's wager alone (taken as a step only then, so other players' phone wagers that came in meanwhile
   * aren't part of it: undoing it never takes those away).
   */
  let wagerStep: { id: string; was: number | undefined; from: WagerSource; by: string | undefined } | null = null;

  const sourceOf = (fs: NonNullable<typeof f>, id: string): { from: WagerSource; by: string | undefined } => ({
    from: wagerFromPhone(fs, id) ? 'phone' : 'host',
    by: fs.wagerBy?.[id],
  });

  function wagerDone(): void {
    const w = wagerStep;
    wagerStep = null;
    if (!w || !f) return;
    const now = f.wagers[w.id];
    if (now === w.was) return;
    // Back to what it was, then the change as a step.
    finalSetWager(session, w.id, w.was, w.from, w.by);
    logged(session, wagerText(w.id, w.was, now, w.from === 'phone'), () => finalSetWager(session, w.id, now));
  }

  // A wager sent from their phone while the host's focus is in that box is a step of its own ("Ann’s wager (from their
  // phone): $500"): the host's change starts again from it.
  $effect(() => {
    const fs = f;
    if (!fs) return;
    void JSON.stringify([fs.wagers, fs.wagerFrom]);
    untrack(() => {
      const w = wagerStep;
      if (w && wagerFromPhone(fs, w.id) && fs.wagers[w.id] !== w.was) wagerStep = { id: w.id, was: fs.wagers[w.id], ...sourceOf(fs, w.id) };
    });
  });

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

  /**
   * "Finish game" was pressed with players still unjudged: it asks in the panel's confirmation strip (a browser dialog
   * would show on stream).
   */
  let askFinish = $state(false);
  const setAsk = hostAsk();
  function stopAsking(): void {
    if (!askFinish) return;
    askFinish = false;
    setAsk(null);
  }
  $effect(() => {
    if (!unjudged || session.finalStep !== 'reveal') stopAsking();
  });
  onDestroy(stopAsking);

  function next(): void {
    // Finishing shows the winner and confetti on stream, so ask first if some players were never judged. (The strip's
    // own guard keeps the second half of a double-click on "Finish game" from answering it.)
    if (session.finalStep === 'reveal' && unjudged && !askFinish) {
      askFinish = true;
      setAsk({
        text: `${unjudged} player${unjudged === 1 ? '' : 's'} not judged yet · finish anyway?`,
        ok: 'Finish',
        cancel: 'Keep judging',
        onok: next,
        oncancel: stopAsking,
      });
      return;
    }
    stopAsking();
    wagerDone();
    // From the wagers to the question is a step: Ctrl+Z goes back to the wagers, as they were.
    finalNextStep(session, game);
    onstep();
  }

  /**
   * The reveals: a wager typed (or changed) in a player's row until it's shown, as a step. A player with no wager
   * (never taken as 0) gets one here before they can be judged. A whole number, up to their max only if the host
   * turned the limits on. Refused, the box goes back to the wager as it was.
   */
  function setWager(id: string, box: HTMLInputElement): void {
    const fs = f;
    const value = box.value;
    const v = Number(value);
    const was = fs?.wagers[id];
    const back = (): void => {
      box.value = typeof was === 'number' ? String(was) : '';
    };
    if (!fs || value.trim() === '' || !Number.isFinite(v)) return back();
    if (v === was) return;
    const why = finalWagerRefused(session, id, v, override);
    if (why) back();
    if (why === 'whole') return toast('A wager is a whole number, 0 or more', 3000);
    if (why === 'over') return toast(`Over ${byId[id]?.name ?? '?'}’s max of ${formatPoints(finalWagerCap(session, id), sym)}`, 3000);
    logged(session, wagerText(id, was, v, wagerFromPhone(fs, id)), () => finalSetWager(session, id, v));
  }

  // The spotlit row stays in sight in a long list (8 players in a short window).
  $effect(() => {
    const id = f?.current;
    if (!id || session.finalStep !== 'reveal') return;
    void tick().then(() => orderEl?.querySelector(`[data-row="${id}"]`)?.scrollIntoView({ block: 'nearest' }));
  });

  /**
   * What N does next in the reveals, for the main button until everyone is judged: show the spotlit player's wager,
   * or go on to the next player still to judge (none: the spotlit one is waiting on Right or Wrong).
   */
  const revealStep = $derived.by((): { label: string; disabled?: string; judge?: string } => {
    const fs = f;
    const cur = fs?.current && fs.order.includes(fs.current) ? fs.current : undefined;
    if (fs && cur && !fs.shown[cur] && !fs.results[cur]) return { label: 'Show wager ▶' };
    // Their wager is up: judging them is next (N waits for it).
    if (fs && cur && !fs.results[cur] && hasWager(fs, cur)) return { label: '✔ Right', judge: cur };
    if (fs && cur && fs.order.every((id) => id === cur || fs.results[id]))
      return { label: 'Next player ▶', disabled: `Mark ${byId[cur]?.name ?? '?'} right (C) or wrong (X) first` };
    return { label: 'Next player ▶' };
  });

  // The how-to in the reveals is open the first time on this computer, folded after that (the rows keep the room). In a
  // short window it starts folded: open, it pushed the third player's row out of sight at 1280×720.
  const HOW_KEY = 'jb.finalHowSeen';
  let howOpen = $state(readHowOpen());
  function readHowOpen(): boolean {
    try {
      return window.innerHeight >= 860 && localStorage.getItem(HOW_KEY) !== '1';
    } catch {
      return false;
    }
  }
  $effect(() => {
    if (session.finalStep !== 'reveal') return;
    try {
      localStorage.setItem(HOW_KEY, '1');
    } catch {
      // Storage may be off (private mode): it opens again next time.
    }
  });

  const after = $derived(game.rounds[session.currentRound + 1]);
  const goOn = $derived(after ? `Next: ${roundName(after, session.currentRound + 1)} ▶` : 'Finish game ▶');
  const labels = $derived({
    // Everyone sat out: straight on (finalNext skips the question and the reveals).
    wagers: f && !f.players.length ? goOn : 'Show question ▶',
    question: 'Reveal answer ▶',
    answer: 'Start player reveals ▶',
    reveal: goOn,
  });

  // The step's main button, in the panel's main cell (N does it too). In the reveals, until everyone is judged, it's N's
  // next step (show the wager, the next player); finishing early is the quiet button beside it, and asks first.
  offerNext('final', () => {
    if (!f) return null;
    const judge = revealStep.judge;
    if (session.finalStep === 'reveal' && unjudged && judge) {
      const who = byId[judge]?.name ?? '?';
      return {
        label: `✔ ${who} right`,
        key: 'C',
        title: `C: ${who} is right`,
        run: () => onjudge(judge, true),
        also: [{ label: '✘ Wrong', key: 'X', title: `X: ${who} is wrong`, run: () => onjudge(judge, false) }],
      };
    }
    if (session.finalStep === 'reveal' && unjudged)
      return { label: revealStep.label, key: 'N', title: revealStep.disabled ?? 'N', disabled: !!revealStep.disabled, run: onrevealnext };
    const step = session.finalStep ?? 'wagers';
    // Its question slides first, then the answer.
    if (step === 'question' && moreSlides && slidePos && onslide)
      return { label: 'Next slide ▶', key: 'N', title: `N: slide ${slidePos.at + 1} of ${slidePos.of} (Shift+N: the slide before) · or click the slide`, run: () => onslide(1) };
    return {
      label: labels[step],
      key: 'N',
      disabled: step === 'wagers' && !wagersOk,
      title: step === 'wagers' && !wagersOk ? 'Every wager in first' : 'N',
      run: step === 'question' ? onreveal : next,
    };
  });
</script>

{#if f}
  <div class="fj">
    {#if session.finalStep === 'wagers'}
      {#if dual}
        <span class="muted">Tick who plays and enter each wager.</span>
      {:else}
        <span class="exposed">⚠ Viewers can see this: they see this window, the wagers as you type them too. Open the 📺 audience window to keep them secret.</span>
      {/if}
      <!-- One row per player: plays or sits out (players at 0 or less sit out unless the round lets them play), and their wager. -->
      <div class="wagers" role="list" aria-label="Who plays and their wagers" bind:this={wagersEl}>
        {#each session.players as p (p.id)}
          {@const plays = f.players.includes(p.id)}
          {@const cap = finalWagerCap(session, p.id)}
          {@const w = f.wagers[p.id]}
          {@const phone = plays && wagerFromPhone(f, p.id)}
          <div class="wrow chip" class:out={!plays} style:border-color={p.color} role="listitem" data-player={p.id}>
            <label class="check" title={plays ? 'Untick: sits out this Final' : 'Tick: plays this Final'}>
              <input type="checkbox" checked={plays} onchange={() => toggleIn(p.id)} data-plays={p.id} />
              <b>{p.name}</b>
              <span class="muted small">{formatPoints(score(session, p.id), sym)}</span>
            </label>
            {#if plays}
              <input
                type="number"
                min="0"
                step="1"
                value={w ?? ''}
                placeholder="wager"
                aria-label="{p.name}’s wager"
                class:bad={typeof w === 'number' && ((!override && w > cap) || !Number.isInteger(w))}
                oninput={(e) => finalSetWager(session, p.id, e.currentTarget.value === '' ? undefined : +e.currentTarget.value)}
                onfocus={() => {
                  wagerDone();
                  wagerStep = { id: p.id, was: f.wagers[p.id], ...sourceOf(f, p.id) };
                }}
                onblur={wagerDone}
                onkeydown={(e) => {
                  if (e.key === 'Enter') wagerEnter(p.id);
                  // N (no number has one) goes on as anywhere else, once every wager is in.
                  else if (e.key.toLowerCase() === 'n' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
                    e.preventDefault();
                    if (wagersOk) next();
                    else {
                      // (Why not, rather than nothing: as N says outside the box.)
                      const { missing, over, whole } = finalWagerProblems(session, override);
                      const names = (ids: string[]) => nameList(ids.map((id) => byId[id]?.name ?? '?'));
                      toast(missing.length ? `Waiting on: ${names(missing)}` : whole.length ? `Not a whole number: ${names(whole)}` : `Over the max: ${names(over)}`, 3000);
                    }
                  }
                }}
                data-wager={p.id}
              />
              {#if phone}
                {@const by = wagerSentBy(f, p.id)}
                <span class="phone small" title="Sent from their phone (only you see the amount). You can still change it." data-phone-wager={p.id}
                  >📱 {formatPoints(w ?? 0, sym)} from phone ✔{by ? ` · sent by ${by}` : ''}</span
                >
              {:else if phones.includes(p.id) && !f.phonesLocked}
                <!-- (One the host typed, or the 0 filled in for nothing to wager: their phone can still send another.) -->
                <span class="muted small" data-phone-wager={p.id} title="Their phone can send their wager"
                  >{w === undefined ? '📱 waiting…' : '📱 can still send'}</span
                >
              {/if}
              <span class="muted small">
                {override ? `their score ${formatPoints(cap, sym)} (no limit now)` : cap ? `max ${formatPoints(cap, sym)}` : `can only wager ${formatPoints(0, sym)}`}
              </span>
            {:else}
              <!-- (Left out for their score, not by the host: say so, they can still be ticked in.) -->
              <span class="muted small">{f.chosen?.[p.id] === false || score(session, p.id) > 0 ? 'sits out' : 'sits out: no points to wager (tick to let them play)'}</span>
            {/if}
          </div>
        {/each}
      </div>
      {#if f.phonesLocked && phones.some((id) => f.players.includes(id))}
        <span class="muted small">📱 The question was on screen: phones can’t send wagers any more (type any change here).</span>
      {:else if phones.some((id) => f.players.includes(id))}
        <span class="muted small">📱 Players with a phone can send their wager from it, and change it until you show the question.</span>
      {:else if phoneNote}
        <span class="muted small">{phoneNote}</span>
      {/if}
      {#if !f.players.length}
        <!-- Nobody to wager or reveal: the button goes on to the next round (or the end). -->
        <span class="nobody" role="status">Nobody is playing this Final: tick a player to play it, or go on.</span>
      {/if}
      <label class="check small" title="Ticked, a wager can be more than the player's score. Untick to hold wagers to it (max: their score).">
        <input type="checkbox" bind:checked={override} onkeydown={(e) => e.key === 'Enter' && wagersOk && next()} data-limits /> Ignore the limits
      </label>
    {:else if session.finalStep === 'reveal'}
      <!-- The how-to folds away: the rows (and the stage) keep the room. -->
      <details class="how" bind:open={howOpen}>
        <summary class="muted">One by one: spotlight → show wager → right or wrong (N, C, X)</summary>
        <span class="muted small">
          Click a name here or on the stage to spotlight it. Reorder by dragging ⋮⋮ (or ▲▼, Alt+↑/↓). Keys: N shows the wager,
          C / X judge them, then N goes to the next player · Shift+N back · 1–9 spotlight · C right · X wrong.
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
            <button class="ghost small up" onclick={() => nudge(id, -1, '.up')} disabled={i === 0} aria-label="Earlier: {p?.name ?? '?'}">▲</button>
            <button class="ghost small down" onclick={() => nudge(id, 1, '.down')} disabled={i === f.order.length - 1} aria-label="Later: {p?.name ?? '?'}">▼</button>
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
            {#if finalWagerEditable(session, id)}
              <!-- Until it's shown (or they're judged) the wager can still be changed here; with none in (it's never taken as
                   0) it's asked for here before they can be judged. -->
              {@const cap = finalWagerCap(session, id)}
              <span class="muted small pscore">{formatPoints(score(session, id), sym)}</span>
              <label class="check small" class:no-wager={!hasWager(f, id)}>
                {hasWager(f, id) ? 'wager' : 'no wager:'}
                <input
                  type="number"
                  min="0"
                  step="1"
                  max={override ? undefined : cap}
                  value={f.wagers[id] ?? ''}
                  placeholder="wager"
                  aria-label="{p?.name}’s wager"
                  data-reveal-wager={id}
                  onkeydown={(e) => e.key === 'Enter' && setWager(id, e.currentTarget)}
                  onchange={(e) => setWager(id, e.currentTarget)}
                />
                {#if wagerFromPhone(f, id)}<span class="phone" title="Sent from their phone. You can still change it until it's shown.">📱</span>{/if}
                {#if !override}<span class="muted">max {formatPoints(cap, sym)}</span>{/if}
              </label>
              {#if hasWager(f, id)}<button class="small" onclick={() => finalShow(session, id)} aria-label="Show wager: {p?.name ?? '?'}">Show wager</button>{/if}
            {:else}
              <span class="muted small pscore">{formatPoints(score(session, id), sym)}</span>
              <span class="muted small">wager {formatPoints(f.wagers[id], sym)}</span>
              <button class="small" onclick={() => finalShow(session, id)} disabled={f.shown[id]} aria-label="Show wager: {p?.name ?? '?'}">Show wager</button>
            {/if}
            <button class="small good" class:on={res === 'right'} aria-pressed={res === 'right'} disabled={!hasWager(f, id)} onclick={() => onjudge(id, true)} aria-label="✔ Right: {p?.name ?? '?'}">✔ Right</button>
            <button class="small bad" class:on={res === 'wrong'} aria-pressed={res === 'wrong'} disabled={!hasWager(f, id)} onclick={() => onjudge(id, false)} aria-label="✘ Wrong: {p?.name ?? '?'}">✘ Wrong</button>
          </div>
        {/each}
      </div>
    {/if}
    <div class="row">
      {#if session.finalStep === 'wagers'}
        {#if lastRound}<button class="ghost" onclick={onback} title="Who plays and the wagers entered so far are kept">◀ Previous round ({roundName(lastRound, session.currentRound - 1)})</button>{/if}
      {/if}
      {#if session.finalStep === 'answer'}
        <button onclick={onreveal} title="R">🙈 Hide answer</button>
      {:else if session.finalStep === 'question'}
        {#if slidePos}
          <span class="slidepos" data-slidepos>Slide {slidePos.at} of {slidePos.of}</span>
          <button class="ghost" onclick={() => onslide?.(-1)} disabled={slidePos.at <= 1} title="Shift+N: the slide before">◀ Slide</button>
          {#if moreSlides}<button onclick={onreveal} title="R">👁 Reveal answer</button>{/if}
        {/if}
        <span class="muted small">Tip: click the screen to continue</span>
      {:else if session.finalStep === 'wagers' && !wagersOk}
        <span class="muted small">{waitingOn}</span>
      {:else if session.finalStep === 'reveal'}
        {#if armed}
          <span class="armed">Everyone is judged: press N again (or the button) to {after ? 'go on' : 'finish'}.</span>
        {:else if unjudged}
          <span class="muted small">{unjudged} still to judge</span>
        {/if}
      {/if}
      <span class="spacer"></span>
      {#if session.finalStep === 'reveal' && unjudged && !askFinish}
        <!-- Until everyone is judged the main button is N's next step; finishing early asks first. -->
        <button class="ghost" onclick={next}>{goOn}</button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .slidepos {
    font-size: 12px;
    font-weight: 600;
    padding: 1px 7px;
    border: 1px solid var(--border);
    border-radius: 999px;
    white-space: nowrap;
  }
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
  .pl input[type='number'] {
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
  .wrow {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  /* Sitting out: still there to tick back in, but quieter. */
  .wrow.out {
    border-style: dashed;
    opacity: 0.7;
  }
  .wagers input[type='number'] {
    width: 100px;
  }
  .phone {
    color: var(--accent);
    font-weight: 600;
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
</style>
