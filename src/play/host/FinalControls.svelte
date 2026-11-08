<!--
  Final round host flow (spec §6.4): one wager screen while the category is up (who plays, and each one's wager), then
  the question, the answer and a one-by-one reveal (a typed answer, a multiple choice's pick by its letter and whether
  it's the one marked ✔ Right); and its own 🤫 cards (TileCards), from the wagers to the last reveal (below the panel's
  foot, 🤫 N cards ↓ in the step's row goes to them). The blue button is the Final's next step (goon.ts: Show question ▶,
  👁 Reveal answer, Show answer ▶, Next player ▶, Finish game ▶): this box has the rest, the verdicts in the rows.
-->
<script lang="ts">
  import { onDestroy, tick, untrack } from 'svelte';
  import { announce } from '../../lib/announce';
  import { toast } from '../../lib/app.svelte';
  import { teamsOn } from '../../lib/buzz';
  import { buzzerOn } from '../../lib/remote.svelte';
  import { textOn } from '../../lib/colors';
  import { DragOrder } from '../../lib/dragorder.svelte';
  import { cardSlides, finalName, formatPoints, MAX_POINTS, roundName, wagerFloor, type Game, type Id, type Session, type WagerSource } from '../../lib/model';
  import {
    currentFinal, finalAdjustWager, finalChoose, finalRevealNow, finalSetWager, finalShow, finalUnjudged, finalWagerCap, finalWagerEditable, finalWagerProblems, finalWagerRefused,
    finalWagersOk, hasWager, score, slidePosition, typedAnswer, wagerFromPhone, wagerSentBy,
  } from '../../lib/session';
  import { finalNextStep, logged } from '../../lib/toolset';
  import { letter, pickLabel, pickOf, rightChoice, usableChoices } from '../../lib/choices';
  import { foldLines } from '../../lib/buzzproto';
  import { hostAsk, offerExposed, offerMenu, offerPlayerVerbs } from './slots.svelte';
  import type { StageItem } from './stagemenu';
  import { wagersLine } from './goon';
  import { FLOW } from './verbs';
  import AnswersHost from './AnswersHost.svelte';
  import TileCards from './TileCards.svelte';

  let {
    game,
    session,
    dual = false,
    armed = false,
    override = $bindable(false),
    phones = [],
    phoneNote = '',
    typed = false,
    answerPhones = [],
    answersNote = '',
    choicesNote = '',
    onshowanswer = () => {},
    onstep,
    onreveal,
    onjudge,
    onback,
    onslide,
    oncardtakeback = () => {},
    ongo = () => {},
    ring = null,
  }: {
    game: Game;
    session: Session;
    /** An audience window is open: viewers don't see this window. */
    dual?: boolean;
    /** Everyone is judged and N was pressed once: the next N finishes. */
    armed?: boolean;
    /** "Ignore the limits" is ticked (unticked as each Final starts; bound, so N follows it too). */
    override?: boolean;
    /** Players (teams) with a phone in the buzzer room: they can send their wager from it. */
    phones?: string[];
    /** Why phones can't send wagers here (an older buzzer server), or ''. */
    phoneNote?: string;
    /** Players type their answer on their phone (from the question until the answer shows). */
    typed?: boolean;
    /** The players with a phone connected now. */
    answerPhones?: string[];
    /** Why phones can't send answers here (an older buzzer server), or ''. */
    answersNote?: string;
    /** Why phones can't show its multiple choices (an older buzzer server), or ''. */
    choicesNote?: string;
    /** Put a player's typed answer on screen (and spotlight them). */
    onshowanswer?: (id: string) => void;
    /** The Final went on (finished early, from Finish game ▶ here). */
    onstep: () => void;
    onreveal: () => void;
    /** Mark a player right or wrong in the reveals (with its sound, as C / X). */
    onjudge: (id: string, right: boolean) => void;
    /** Back to the round before this Final (who plays and the wagers entered so far are kept). */
    onback: () => void;
    /** Its question slides (several): the next one (1) or the one before (-1). */
    onslide?: (d: 1 | -1) => void;
    /** ↩ Take back on one of the Final's 🤫 cards. */
    oncardtakeback?: (id: Id) => void;
    /** Enter in the last wager box (or N in one): the blue button's Show question ▶, through the check before going on. */
    ongo?: (by: 'enter' | 'n') => void;
    /** The box button that wears the ring (goon.ts): the spotlit row's likely verdict ('verdict:right'), a card's 📤. */
    ring?: string | null;
  } = $props();
  /** A question with several slides, while it's up: which one is on screen ("Slide 2 of 3"). */
  const slidePos = $derived(slidePosition(session, game));
  const moreSlides = $derived(!!slidePos && slidePos.at < slidePos.of);
  const f = $derived(session.final);
  const sym = $derived(game.settings.currencySymbol);
  /** The wager rule, in words: "their score, or $2,000 if they have less". */
  const rule = $derived(`their score, or ${formatPoints(wagerFloor(game.settings), sym)} if they have less`);
  const byId = $derived(Object.fromEntries(session.players.map((p) => [p.id, p])));
  /** Phone buzzer teams: each row is a team, and the buttons say so ("Next team ▶"). */
  const noun = $derived(buzzerOn(game.settings) && teamsOn(game.settings) ? 'team' : 'player');
  const problems = $derived(finalWagerProblems(session, game, override));
  const wagersOk = $derived(finalWagersOk(session, game, override));
  /** The number key that spotlights them in the reveals (1–9, in the players' order), if they have one. */
  const keyOf = (id: string): number | null => {
    const i = session.players.findIndex((p) => p.id === id);
    return i >= 0 && i < 9 ? i + 1 : null;
  };
  /** The Final being played. */
  const round = $derived(currentFinal(session, game));
  const title = $derived(round ? finalName(round) : 'the Final');
  /** Its multiple choices (as phones letter them), and the one marked ✔ Right. */
  const choices = $derived(usableChoices(round?.choices));
  const rightOne = $derived(rightChoice(choices));

  let wagersEl = $state<HTMLElement>();
  const wagerBox = (id: string) => wagersEl?.querySelector<HTMLInputElement>(`input[data-wager="${id}"]`);
  /** Their wager still has to be typed, or fixed (not a whole number, or over the max). */
  const needsWager = (id: string) => problems.missing.includes(id) || problems.whole.includes(id) || problems.over.includes(id);
  /** The wager box's first line: whose wager it waits on, or that every wager is in and Show question ▶ is next. */
  const waitLine = $derived(wagersLine(session, game, phones, override));
  // One window: viewers see the wager boxes as they're typed (the status line's ⚠ chip says so, the box's first line
  // says what it waits on).
  offerExposed(() =>
    session.finalStep === 'wagers' ? '⚠ Viewers can see this: they see this window, the wagers as you type them too. Open the 📺 audience window to keep them secret.' : null,
  );

  /** Who plays, in the rows' order (the players' order: the reveal order, lowest score first, isn't the screen's). */
  const rowOrder = () => session.players.map((p) => p.id).filter((id) => !!f?.players.includes(id));

  /** Enter in a wager box: show the question once every wager is fine, else go to the next box that needs one. */
  function wagerEnter(id: string): void {
    if (!f) return;
    if (wagersOk) return ongo('enter');
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
      // Phones send the wagers: the keys stay the host's (N goes on once they're all in), no box to type in. (The list
      // takes the focus, where it is: else it would go to the next button, scrolling the panel's box and cutting its top
      // line, on stream in one window.)
      if (phones.some((id) => fs.players.includes(id))) return void wagersEl?.focus({ preventScroll: true });
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
    logged(session, `${byId[id]?.name ?? '?'} ${out ? 'sits out' : 'plays'} ${title}`, () => finalChoose(session, game, id, !out));
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
  /**
   * "Ann’s wager: $300", or "Ann’s wager: $500 → $300" when it changes one already in. A phone's amount stays out of it
   * (in one window viewers see ↶ Undo's toast and the 📜 Log, and a step keeps its name if the audience window closes):
   * "Ann’s wager (from their phone) → $300".
   */
  function wagerText(id: string, was: number | undefined, now: number | undefined, wasPhone: boolean): string {
    const name = `${byId[id]?.name ?? '?'}’s wager`;
    if (was === undefined) return `${name}: ${shownWager(now)}`;
    if (wasPhone) return `${name} (from their phone) → ${shownWager(now)}`;
    return `${name}: ${shownWager(was)} → ${shownWager(now)}`;
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
  // phone)"): the host's change starts again from it.
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

  /** Finish now…, while players are still to judge (the blue button finishes once they're all judged). */
  function finishNow(): void {
    // Finishing shows the winner and confetti on stream, so ask first if some players were never judged. (The strip's
    // own guard keeps the second half of a double-click on "Finish now…" from answering it.)
    if (session.finalStep === 'reveal' && unjudged && !askFinish) {
      askFinish = true;
      setAsk({
        text: `${unjudged} ${noun}${unjudged === 1 ? '' : 's'} not judged yet · finish anyway?`,
        ok: 'Finish',
        cancel: 'Keep judging',
        onok: finishNow,
        oncancel: stopAsking,
      });
      return;
    }
    stopAsking();
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
    // (At most what reads on screen, as finalSetWager keeps it: the step and the box say what it is.)
    const typed = Number(value);
    const v = Math.min(MAX_POINTS, typed);
    const was = fs?.wagers[id];
    // (In one window a phone's amount stays hidden: the box goes back to empty.)
    const back = (): void => {
      box.value = typeof was === 'number' && (dual || !(fs && wagerFromPhone(fs, id))) ? String(was) : '';
    };
    if (!fs || value.trim() === '' || !Number.isFinite(v)) return back();
    if (typed > MAX_POINTS) toast(`At most ${formatPoints(MAX_POINTS, sym)}`, 3000);
    // (Already the most: the box goes back to it, not the digits typed on past it.)
    if (v === was) return void (typed !== v && back());
    const why = finalWagerRefused(session, game, id, v, override);
    if (why) back();
    if (why === 'whole') return toast('A wager is a whole number, 0 or more', 3000);
    if (why === 'over') return toast(`Over ${byId[id]?.name ?? '?'}’s max of ${formatPoints(finalWagerCap(session, game, id), sym)}`, 3000);
    logged(session, wagerText(id, was, v, wagerFromPhone(fs, id)), () => finalSetWager(session, id, v));
  }

  /** ½ Halve / 0 Nullify in a reveal row: any time in the reveals; a judged player's points follow. */
  function adjustWager(id: string, how: 'half' | 'zero'): void {
    const name = byId[id]?.name ?? '?';
    logged(session, how === 'half' ? `${name}’s wager halved` : `${name}’s wager made 0`, () => void finalAdjustWager(session, game, id, how), game);
  }

  // ---------- Its 🤫 cards, out of sight ----------
  /** How many 🤫 cards the Final has (its box comes under the rows). */
  const cardCount = $derived(round ? cardSlides(round).length : 0);
  /** The box of the Final's 🤫 cards. */
  let cardsBox = $state<HTMLElement>();
  /** Its heading ("🤫 This Final’s cards") isn't all in sight: it's below the panel's foot, or behind the step's row there. */
  let cardsBelow = $state(false);
  /** What scrolls the panel: the nearest box around `el` that scrolls (none: the window). */
  function scroller(el: HTMLElement): HTMLElement | null {
    for (let p = el.parentElement; p; p = p.parentElement) if (/auto|scroll/.test(getComputedStyle(p).overflowY)) return p;
    return null;
  }
  // With many players (or a short window) the box is below the panel's foot: the step's row says it's there. (Its sticky
  // row covers the foot of the panel's scrolling part: the heading has to be above it.)
  $effect(() => {
    const head = cardsBox?.querySelector<HTMLElement>('[data-final-cards] > .row');
    if (!head || typeof IntersectionObserver === 'undefined') return;
    const seen = new IntersectionObserver(
      ([e]) => (cardsBelow = e.intersectionRatio < 1 && (!e.rootBounds || e.boundingClientRect.bottom > e.rootBounds.bottom)),
      { root: scroller(head), rootMargin: '0px 0px -48px 0px', threshold: [0, 1] },
    );
    seen.observe(head);
    return () => {
      seen.disconnect();
      cardsBelow = false;
    };
  });
  /** 🤫 N cards ↓: the box in sight, the keys on its first button. */
  function toCards(): void {
    cardsBox?.scrollIntoView({ block: 'nearest' });
    cardsBox?.querySelector<HTMLElement>('button:not(:disabled)')?.focus({ preventScroll: true });
  }

  // The spotlit row stays in sight in a long list (8 players in a short window).
  $effect(() => {
    const id = f?.current;
    if (!id || session.finalStep !== 'reveal') return;
    void tick().then(() => orderEl?.querySelector(`[data-row="${id}"]`)?.scrollIntoView({ block: 'nearest' }));
  });

  /**
   * What the blue button does next in the reveals (lib's finalRevealNow, as goon.ts reads it): the spotlit row's Show
   * answer or Show wager is that button's, so its slot stays empty meanwhile (other rows keep theirs, out of turn); and
   * with the last one's verdict due, the blue button is Finish game ▶, so finishing early isn't offered twice.
   */
  const blueDoes = $derived(session.finalStep === 'reveal' ? finalRevealNow(session) : null);
  const blueFinishes = $derived(blueDoes?.at === 'judge' && !!blueDoes.last);

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
  /** On past the Final: the next round by its name, or Finish game ▶. */
  const goOn = $derived((after ? FLOW.nextNamed(roundName(after, session.currentRound + 1)) : FLOW.finishGame).label);
  /**
   * Finish now…, finishing early while some are still to judge (it asks first), at the left of the box's foot beside
   * "2 still to judge", away from the verdicts: not while the blue button is Finish game ▶ itself (one way to finish).
   */
  const finishEarly = $derived(session.finalStep === 'reveal' && !!unjudged && !askFinish && !blueFinishes);
  const FINISH_NOW = 'Finish now…';

  // A player's menu at the wagers starts with their row's own: plays or sits out this Final, and ✎ Set wager… (the keys in
  // their wager box: in one window it keeps a phone's amount hidden, as ever).
  offerPlayerVerbs('final', (id) => {
    if (!f || session.finalStep !== 'wagers' || !byId[id]) return [];
    const plays = f.players.includes(id);
    return [
      { label: plays ? 'Sits out this Final' : 'Plays this Final', onclick: () => toggleIn(id) },
      {
        label: '✎ Set wager…',
        panel: true,
        disabled: !plays,
        ...(plays ? {} : { hint: `${byId[id].name} sits out this Final` }),
        onclick: () => {
          const box = wagerBox(id);
          box?.focus();
          box?.select();
        },
      },
    ];
  });

  // The stage's menu: the box's own way back, 🙈 Hide answer, or finishing early (the steps are the blue button's).
  offerMenu('final', () => {
    if (!f) return [];
    const out: StageItem[] = [];
    if (session.finalStep === 'wagers' && lastRound) out.push({ label: `◀ Previous round (${roundName(lastRound, session.currentRound - 1)})`, onclick: onback });
    if (session.finalStep === 'answer') out.push({ id: 'reveal', label: '🙈 Hide answer', keys: 'R', onclick: onreveal });
    if (finishEarly) out.push({ label: FINISH_NOW, hint: `Asks first: ${unjudged} not judged yet, then ${goOn}`, onclick: finishNow });
    return out;
  });
</script>

{#if f}
  <div class="fj">
    {#if session.finalStep === 'wagers'}
      <!-- The box's first line: whose wager it waits on, or that the blue button is next (names only, never an amount;
           in one window the status line's ⚠ chip says viewers see the boxes). -->
      <div class="row lead" data-wagers-line>
        {#if !f.players.length}
          <!-- Nobody to wager or reveal: the button goes on to the next round (or the end). -->
          <span class="nobody" role="status">Nobody is playing this Final: tick a {noun} to play it, or go on.</span>
        {:else if waitLine?.ok}
          <span class="muted" data-wagers-in>{waitLine.text}</span>
        {:else if waitLine}
          <span class="muted">{waitLine.text}</span>
        {/if}
      </div>
      <!-- One row per player: plays or sits out (players at 0 or less sit out unless the round lets them play), and their wager. -->
      <div class="wagers" role="list" aria-label="Who plays and their wagers" tabindex="-1" bind:this={wagersEl}>
        {#each session.players as p (p.id)}
          {@const plays = f.players.includes(p.id)}
          {@const cap = finalWagerCap(session, game, p.id)}
          {@const w = f.wagers[p.id]}
          {@const phone = plays && wagerFromPhone(f, p.id)}
          {@const hide = !dual && phone}
          <!-- One window: viewers see this panel, so a phone's amount stays hidden here (as ✍ answers and 🤫 card words
               do) until it's shown in the reveals. Typing a wager over it makes it the host's. -->
          <div class="wrow chip" class:out={!plays} style:border-color={p.color} role="listitem" data-player={p.id} data-player-id={p.id}>
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
                value={hide ? '' : (w ?? '')}
                placeholder={hide ? 'hidden' : 'wager'}
                aria-label="{p.name}’s wager"
                title={override ? `No max now (their score: ${formatPoints(score(session, p.id), sym)})` : cap ? `Max ${formatPoints(cap, sym)} (${rule})` : `Can only wager ${formatPoints(0, sym)}`}
                class:bad={typeof w === 'number' && ((!override && w > cap) || !Number.isInteger(w))}
                oninput={(e) => {
                  const box = e.currentTarget;
                  const v = box.value === '' ? undefined : +box.value;
                  finalSetWager(session, p.id, v);
                  // Past what reads on screen it's kept at the most, and the box says so (it's only written back when the
                  // wager changes, so a digit typed on past it would stay).
                  if (v !== undefined && v > MAX_POINTS) {
                    box.value = String(MAX_POINTS);
                    toast(`At most ${formatPoints(MAX_POINTS, sym)}`, 3000);
                  }
                }}
                onfocus={() => {
                  wagerDone();
                  wagerStep = { id: p.id, was: f.wagers[p.id], ...sourceOf(f, p.id) };
                }}
                onblur={wagerDone}
                onkeydown={(e) => {
                  if (e.key === 'Enter') wagerEnter(p.id);
                  // N (no number has one) is the blue button, as anywhere else: a wager still missing, the keys go to its
                  // box, saying whose.
                  else if (e.key.toLowerCase() === 'n' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
                    e.preventDefault();
                    ongo('n');
                  }
                }}
                data-wager={p.id}
              />
              {#if phone}
                {@const by = wagerSentBy(f, p.id)}
                <span
                  class="phone small"
                  title={dual
                    ? 'Sent from their phone (only you see the amount). You can still change it.'
                    : 'Sent from their phone. The amount stays hidden here (viewers see this window) until you show it in the reveals. Typing a wager replaces it.'}
                  data-phone-wager={p.id}>📱 {dual ? `${formatPoints(w ?? 0, sym)} ` : ''}from phone ✔{by ? ` · sent by ${by}` : ''}</span
                >
              {:else if phones.includes(p.id) && !f.phonesLocked}
                <!-- (One the host typed, or the 0 filled in for nothing to wager: their phone can still send another.) -->
                <span class="muted small" data-phone-wager={p.id} title="Their phone can send their wager"
                  >{w === undefined ? '📱 waiting…' : '📱 can still send'}</span
                >
              {/if}
              <!-- The max only while the limits apply: ignored, their score is beside their name already and the ticked box
                   says so (the row stays short: on a short window more wager boxes fit in sight). -->
              {#if !override}
                <span class="muted small">{cap ? `max ${formatPoints(cap, sym)}` : `can only wager ${formatPoints(0, sym)}`}</span>
              {/if}
            {:else}
              <!-- (Left out for their score, not by the host: say so, they can still be ticked in.) -->
              <span class="muted small">{f.chosen?.[p.id] === false || score(session, p.id) > 0 ? 'sits out' : `sits out: no points (tick to let them play${cap ? `, up to ${formatPoints(cap, sym)}` : ''})`}</span>
            {/if}
          </div>
        {/each}
      </div>
      {#if f.phonesLocked && phones.some((id) => f.players.includes(id))}
        <span class="muted small">📱 The question was on screen: phones can’t send wagers any more (type any change here).</span>
      {:else if phones.some((id) => f.players.includes(id))}
        <span class="muted small">📱 {noun === 'team' ? 'Teams' : 'Players'} with a phone can send their wager from it, and change it until you show the question.</span>
      {:else if phoneNote}
        <span class="muted small">{phoneNote}</span>
      {/if}
      <label class="check small" title="Ticked, any wager is taken. Unticked (as each Final starts), a wager goes up to the {noun}'s max: {rule}.">
        <input type="checkbox" bind:checked={override} onkeydown={(e) => e.key === 'Enter' && wagersOk && ongo('enter')} data-limits /> Ignore the limits
      </label>
    {:else if session.finalStep === 'reveal'}
      <!-- The how-to folds away: the rows (and the stage) keep the room. -->
      <details class="how" bind:open={howOpen}>
        {#if f.answers}
          <summary class="muted">One by one: spotlight → show answer → right or wrong (N, C, X)</summary>
          <span class="muted small">
            Click a name here or on the stage to spotlight it. Reorder by dragging ⋮⋮ (or ▲▼, Alt+↑/↓). Keys: N shows their typed
            answer (or their wager, for a {noun} who answered out loud), C / X judge them (their answer and wager go up with it), then N
            goes to the next {noun} · Shift+N back · 1–9 spotlight (the number on each row) · C right · X wrong.
          </span>
        {:else}
          <summary class="muted">One by one: spotlight → show wager → right or wrong (N, C, X)</summary>
          <span class="muted small">
            Click a name here or on the stage to spotlight it. Reorder by dragging ⋮⋮ (or ▲▼, Alt+↑/↓). Keys: N shows the wager,
            C / X judge them, then N goes to the next {noun} · Shift+N back · 1–9 spotlight (the number on each row) · C right · X wrong.
          </span>
        {/if}
      </details>
      <!-- One row per player, in straight columns that keep their places from row to row whatever a row holds (its own
           Show answer or Show wager empty, a wager still to type or shown): the player, their typed answer, Show answer,
           the score and wager, Show wager, then ✔ Right and ✘ Wrong at the right end. -->
      <div class="order" class:typedcol={!!f.answers} role="list" aria-label="Reveal order" bind:this={orderEl}>
        {#each f.order as id, i (id)}
          {@const p = byId[id]}
          {@const res = f.results[id]}
          {@const line = rows.lineAt(id)}
          {@const k = keyOf(id)}
          <!-- (The spotlit one's likely verdict, as goon.ts rings it; their Show answer or Show wager is the blue button's.) -->
          {@const lit = f.current === id && !res ? ring : null}
          {@const blue = blueDoes?.id === id ? blueDoes.at : null}
          <div
            class="pl"
            class:cur={f.current === id}
            class:drop-before={line === 'before'}
            class:drop-after={line === 'after'}
            class:dragging={rows.dragging === id}
            style:--c={p?.color}
            data-row={id}
            data-player-id={id}
            role="listitem"
            ondragover={(e) => rows.over(e, id)}
            ondrop={(e) => {
              const m = rows.drop(e, f.order);
              if (m) move(f.order[m.from], m.to - m.from);
            }}
          >
            <span class="cell who">
            <!-- Only the grip drags: a press on Right or Wrong that moves a little is still a press. -->
            <span
              class="grip"
              draggable="true"
              ondragstart={(e) => rows.start(e, id, (e.currentTarget as HTMLElement).closest<HTMLElement>('.pl'))}
              ondragend={() => rows.end()}
              aria-hidden="true"
              title="Drag to change the order">⋮⋮</span
            >
            <button class="ghost small up" onclick={() => nudge(id, -1, '.up')} disabled={i === 0} aria-label="Earlier: {p?.name ?? '?'}">▲</button>
            <button class="ghost small down" onclick={() => nudge(id, 1, '.down')} disabled={i === f.order.length - 1} aria-label="Later: {p?.name ?? '?'}">▼</button>
            <!-- The key that spotlights them (1–9: their place in the players, as on the chips and plates). -->
            {#if k}<span class="key" aria-hidden="true">{k}</span>{/if}
            <button
              class="name"
              style:background={p?.color}
              style:color={p ? textOn(p.color) : undefined}
              onclick={() => {
                f.current = id;
                // (Screen readers hear it: the spotlight is on the stage, not the status line.)
                announce(`Spotlight: ${p?.name ?? '?'}`);
              }}
              onkeydown={(e) => {
                // Alt+↑/↓ moves them in the order.
                if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
                e.preventDefault();
                e.stopPropagation();
                nudge(id, e.key === 'ArrowUp' ? -1 : 1);
              }}
              title="{p?.name ?? '?'}: spotlight on screen{k ? ` (key ${k})` : ''} · drag the row (or Alt+↑/↓) to change the order"
            >{p?.name}</button>
            </span>
            {#if f.answers}
              <!-- What they typed on their phone: in one window (viewers see this panel) only once it's on screen. -->
              {@const a = typedAnswer(f, id)}
              {@const shownA = !!f.answerShown?.[id]}
              <span class="cell ans">
              {#if !a}
                <span class="muted small typed">no typed answer</span>
              {:else if dual || shownA}
                <!-- Multiple choice: the pick by its letter ("B · Stockholm"), or typed words with the choice they name ("= B");
                     with one marked ✔ Right, whether it's that one. Typed lines on one (" / "), all of them in its title. -->
                {@const picked = choices.length ? pickLabel(choices, a.pick) : undefined}
                {@const named = choices.length ? pickOf(a, choices) : null}
                <span class="typed" class:muted={!!a.pick && !picked} class:selectable={dual} dir="auto" title="{picked ?? a.text}{dual && a.by ? ` · sent by ${a.by}` : ''}" data-typed={id}
                  >{#if picked}<b>{picked}</b>{:else}“{foldLines(a.text)}”{#if named}{' '}<span class="muted">= {letter(choices.findIndex((c) => c.id === named))}</span>{/if}{/if}</span
                >
                {#if rightOne && named}
                  {#if named === rightOne.id}<span class="small pick-right" data-pick-hint={id}>✔ right choice</span>
                  {:else}<span class="muted small" data-pick-hint={id}>✘ not {letter(choices.indexOf(rightOne))}</span>{/if}
                {/if}
              {:else}
                <span class="muted small typed" title="Shown here once you put it on screen" data-typed={id}>✍ hidden</span>
              {/if}
              </span>
              <span class="cell">
                {#if a}
                  <button
                    class="small"
                    class:slot={blue === 'answer'}
                    onclick={() => onshowanswer(id)}
                    disabled={shownA}
                    aria-label="Show answer: {p?.name ?? '?'}"
                    title="Puts their answer on screen (the spotlit one's: the blue button, or N)">Show answer</button
                  >
                {/if}
              </span>
            {/if}
            {#if finalWagerEditable(session, id)}
              <!-- Until it's shown (or they're judged) the wager can still be changed here; with none in (it's never taken as
                   0) it's asked for here before they can be judged. -->
              {@const cap = finalWagerCap(session, game, id)}
              <!-- (One window: a phone's amount stays hidden until it's shown, as on the wager screen.) -->
              {@const hideW = !dual && wagerFromPhone(f, id)}
              <span class="cell sw">
              <span class="muted small pscore">{formatPoints(score(session, id), sym)}</span>
              <label class="check small" class:no-wager={!hasWager(f, id)}>
                {hasWager(f, id) ? 'wager' : 'no wager:'}
                <input
                  type="number"
                  min="0"
                  step="1"
                  max={override ? undefined : cap}
                  value={hideW ? '' : (f.wagers[id] ?? '')}
                  placeholder={hideW ? 'hidden' : 'wager'}
                  aria-label="{p?.name}’s wager"
                  data-reveal-wager={id}
                  onkeydown={(e) => e.key === 'Enter' && setWager(id, e.currentTarget)}
                  onchange={(e) => setWager(id, e.currentTarget)}
                />
                {#if wagerFromPhone(f, id)}<span class="phone" title="Sent from their phone. You can still change it until it's shown.">📱</span>{/if}
                {#if !override}<span class="muted">max {formatPoints(cap, sym)}</span>{/if}
              </label>
              {#if session.finalStep === 'reveal' && hasWager(f, id) && (f.wagers[id] ?? 0) > 0}
                <button class="small" onclick={() => adjustWager(id, 'half')} aria-label="Halve wager: {p?.name ?? '?'}" title="Halve their wager, rounded down. If they're already judged, their points change with it.">½ Halve</button>
                <button class="small" onclick={() => adjustWager(id, 'zero')} aria-label="Nullify wager: {p?.name ?? '?'}" title="Make their wager 0. If they're already judged, their points change with it.">0 Nullify</button>
              {/if}
              </span>
              <span class="cell">
                {#if hasWager(f, id)}<button class="small" class:slot={blue === 'wager'} onclick={() => finalShow(session, id)} aria-label="Show wager: {p?.name ?? '?'}">Show wager</button>{/if}
              </span>
            {:else}
              <span class="cell sw">
                <span class="muted small pscore">{formatPoints(score(session, id), sym)}</span>
                <span class="muted small">wager {formatPoints(f.wagers[id], sym)}</span>
              {#if session.finalStep === 'reveal' && hasWager(f, id) && (f.wagers[id] ?? 0) > 0}
                <button class="small" onclick={() => adjustWager(id, 'half')} aria-label="Halve wager: {p?.name ?? '?'}" title="Halve their wager, rounded down. If they're already judged, their points change with it.">½ Halve</button>
                <button class="small" onclick={() => adjustWager(id, 'zero')} aria-label="Nullify wager: {p?.name ?? '?'}" title="Make their wager 0. If they're already judged, their points change with it.">0 Nullify</button>
              {/if}
              </span>
              <span class="cell">
                <button class="small" class:slot={blue === 'wager'} onclick={() => finalShow(session, id)} disabled={f.shown[id]} aria-label="Show wager: {p?.name ?? '?'}">Show wager</button>
              </span>
            {/if}
            <button class="small good" class:on={res === 'right'} class:ring={lit === 'verdict:right'} aria-pressed={res === 'right'} disabled={!hasWager(f, id)} onclick={() => onjudge(id, true)} aria-label="✔ Right: {p?.name ?? '?'}">✔ Right</button>
            <button class="small bad" class:on={res === 'wrong'} class:ring={lit === 'verdict:wrong'} aria-pressed={res === 'wrong'} disabled={!hasWager(f, id)} onclick={() => onjudge(id, false)} aria-label="✘ Wrong: {p?.name ?? '?'}">✘ Wrong</button>
          </div>
        {/each}
      </div>
    {/if}
    {#if (session.finalStep === 'question' || session.finalStep === 'answer') && answersNote}
      <span class="muted small">{answersNote}</span>
    {:else if (session.finalStep === 'question' || session.finalStep === 'answer') && typed && f.answers}
      <!-- The answers phones send: only the host sees them (in one window, not until each is revealed). Not for a
           Final whose answers never began (a room started after the question): its phones were never asked. -->
      <AnswersHost
        {session}
        {dual}
        players={f.players}
        answers={f.answers ?? {}}
        title="✍ Answers from phones"
        phones={answerPhones}
        open={session.finalStep === 'question' && !f.answersLocked}
        hideUntilShown
        {choices}
        note={choicesNote}
      />
    {/if}
    <!-- The Final's own 🤫 cards: under the wager or reveal rows (every wager box comes first), above the step's buttons. -->
    {#if round && cardCount}
      {#key round.id}
        <div class="cards-box" bind:this={cardsBox}><TileCards {game} {session} final={round} ontakeback={oncardtakeback} {ring} /></div>
      {/key}
    {/if}
    <div class="row">
      {#if session.finalStep === 'wagers'}
        {#if lastRound}<button class="ghost" onclick={onback} title="Who plays and the wagers entered so far are kept">◀ Previous round ({roundName(lastRound, session.currentRound - 1)})</button>{/if}
      {/if}
      {#if session.finalStep === 'answer'}
        <button data-flow="reveal" onclick={onreveal} title="R">🙈 Hide answer</button>
      {:else if session.finalStep === 'question'}
        {#if slidePos}
          <span class="slidepos" data-slidepos>Slide {slidePos.at} of {slidePos.of}</span>
          <button class="ghost" data-flow="pager" onclick={() => onslide?.(-1)} disabled={slidePos.at <= 1} title="Shift+N: the slide before">◀ Slide</button>
          {#if moreSlides}<button data-flow="reveal" onclick={onreveal} title="R">👁 Reveal answer</button>{/if}
        {/if}
        <span class="muted small">Tip: click the screen to continue</span>
      {:else if session.finalStep === 'reveal'}
        {#if armed}
          <span class="armed">Everyone is judged: press N again (or the button) to {after ? 'go on' : 'finish'}.</span>
        {:else if unjudged}
          {#if finishEarly}
            <!-- Finishing early, at the left away from the verdicts, asks first (not while the blue button is Finish game ▶
                 itself: one way to finish). -->
            <button class="ghost" data-finish-early onclick={finishNow} title="Ends the Final with {unjudged} still to judge: it asks first, then {goOn}">{FINISH_NOW}</button>
          {/if}
          <span class="muted small">{unjudged} still to judge</span>
        {/if}
      {/if}
      {#if cardsBelow}
        <button class="ghost small" data-cards-down onclick={toCards} title="This Final’s 🤫 cards are further down the panel: go to them"
          >🤫 {cardCount} card{cardCount === 1 ? '' : 's'} ↓</button
        >
      {/if}
      <span class="spacer"></span>
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
  /* (Scrolled to by 🤫 N cards ↓, it stops above the step's sticky row, not behind it.) */
  .cards-box {
    scroll-margin-bottom: 48px;
  }
  .no-wager {
    color: var(--warn);
  }
  /* The spotlit row's Show answer or Show wager while the blue button does it: its place kept, empty. */
  .slot {
    visibility: hidden;
  }
  /* A typed answer: one line, cut with … (all of it in its tooltip). */
  .typed {
    max-width: 260px;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pick-right {
    color: var(--good);
    font-weight: 600;
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
  /* (Focused only to hold the keys, with phones sending the wagers: no ring on stream.) */
  .wagers:focus {
    outline: none;
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
  }
  .pl.cur {
    border-color: var(--c);
  }
  .name {
    font-weight: 700;
    border: none;
    /* A long name is cut short (whole in its tooltip, and for screen readers). */
    max-width: 14em;
    min-width: 3em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* A reveal row's parts, each a cell of the columns below: its own buttons and words side by side. */
  .cell {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .cell.sw > label {
    gap: 6px;
  }
  /* The reveal rows in straight columns: each row a subgrid of the list, so a column is as wide as its widest cell and
     keeps its place in every row whatever that row holds. The typed answer (with none, the name) takes the room left,
     so the score and wager, Show wager and the verdicts stay at the right end. On a narrow window, or where subgrid
     isn't known, the rows wrap as before. */
  @supports (grid-template-columns: subgrid) {
    @media (min-width: 900px) {
      .order {
        display: grid;
        grid-template-columns: minmax(7em, 1fr) repeat(4, auto);
        column-gap: 6px;
      }
      .order.typedcol {
        grid-template-columns: minmax(7em, max-content) minmax(0, 1fr) repeat(5, auto);
      }
      .pl {
        grid-column: 1 / -1;
        display: grid;
        grid-template-columns: subgrid;
      }
      .typed {
        max-width: none;
      }
    }
  }
  .key {
    font-size: 12px;
    opacity: 0.7;
    margin-right: -2px;
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
  .nobody {
    color: var(--warn);
    font-weight: 600;
  }
  .armed {
    color: var(--good);
    font-weight: 600;
  }
</style>
