<!--
  Host-only controls (scoring, reveal, navigation). Never part of the audience view. One layout in every state, top to
  bottom: what's going on (with the 📱 and ⏱ chips on the right), the players, the action row (what this moment needs)
  with the one main button in the NEXT cell at its right (its key on it), the tools and round navigation, a confirmation
  strip when something asks, and the fixed bar (↶ Undo … 🚪 Exit), the same in every state and round.
-->
<script lang="ts">
  import { announce, announceChanges } from '../lib/announce';
  import { textOn } from '../lib/colors';
  import { hostSlots, type HostAsk, type NextAction } from './host/slots.svelte';
  import { phoneAwaySince } from './host/phoneaway.svelte';
  import { categoryLabel, finalName, formatPoints, isBoard, typedPoints, wholePoints, type Game, type Session } from '../lib/model';
  import { answerShowing, awardOpen, clueMarks, clueName, clueScored, currentClueInfo, currentFinal, findClueRef, roundComplete, score, setScore, slidePosition, tiedForFirst, toolOnlyClue, usedTiles } from '../lib/session';
  import MediaControls from './MediaControls.svelte';
  import SoundWarnings from './host/SoundWarnings.svelte';
  import TimerControls from './host/TimerControls.svelte';
  import DDControls from './host/DDControls.svelte';
  import FinalControls from './host/FinalControls.svelte';
  import EndControls from './host/EndControls.svelte';
  import ToolsControls from './host/ToolsControls.svelte';
  import RoundNav from './host/RoundNav.svelte';
  import AnswersHost from './host/AnswersHost.svelte';
  import InlineAsk from './host/InlineAsk.svelte';
  import RpgHost from './rpg/RpgHost.svelte';
  import type { RpgAsk } from './rpg/hostops';
  import BoardHost from './boardgame/BoardHost.svelte';
  import type { LogTab } from './ScoreLog.svelte';
  import { app, toast } from '../lib/app.svelte';
  import { buzzerOn } from '../lib/remote.svelte';
  import { teamsOn } from '../lib/buzz';
  import { scoresWindow } from '../lib/sync.svelte';
  import { onMount, tick, untrack, type Snippet } from 'svelte';

  let {
    game,
    session,
    selected = $bindable(),
    amount = $bindable(),
    rpgObject = $bindable(null),
    rpgSelObjects = $bindable([]),
    rpgMap = $bindable(false),
    rpgAsk = $bindable(null),
    rpgMapSend = $bindable(null),
    bgSpace = $bindable(null),
    editingScore = $bindable(null),
    wagerLimitsOff = $bindable(true),
    wagerPhones = [],
    wagerNote = '',
    timerSeconds = $bindable(null),
    bgSteps = $bindable(null),
    undoText = null,
    redoText = null,
    dual,
    side = false,
    pickerPending = false,
    finishArmed = false,
    tools,
    onaward,
    onright,
    onwrong,
    onreveal,
    onslide,
    onback,
    oncancelclue,
    onreopen,
    onundo,
    onredo,
    onnextround,
    onprevround,
    ongotoround,
    onbackfromfinal,
    everyone = false,
    answerPhones = [],
    onanswerjudge = () => {},
    onbackfromend,
    onrematch,
    onintronext,
    onskipintro,
    onddshow,
    onfinalstep,
    ontiebreaker,
    ontiebreakerdone,
    oncowinners,
    onjudge,
    onrevealnext,
    onrolloff,
    onlog,
    onplayers,
    onrules,
    onhide,
    onexit,
    onaudience,
    onscores,
    onsound,
    onkeys,
    oncloseoverlay,
    onopenbuzzers,
    tieNames = '',
    onrolltie,
    phonesDown = '',
    buzzExtra,
    phoneChip,
    nextAction = $bindable(null),
  }: {
    game: Game;
    session: Session;
    selected: string[];
    amount: number | null;
    /** RPG rounds: the object whose card is open (clicked on the stage). */
    rpgObject?: string | null;
    /** RPG rounds: the objects selected on the stage (they drag with the selected players). */
    rpgSelObjects?: string[];
    /** RPG rounds: the full map (jump anywhere) is open. */
    rpgMap?: boolean;
    /** RPG rounds: a name or text being asked for (text right-clicked onto the stage too). */
    rpgAsk?: RpgAsk | null;
    /** RPG rounds: the full map was opened to send these players somewhere (from their menu). */
    rpgMapSend?: { players: string[]; label: string } | null;
    /** Board-game rounds: the space whose card is open (clicked on the stage). */
    bgSpace?: string | null;
    /** The player whose score is being set (clicked here, or ✎ Set the score… in their menu). */
    editingScore?: string | null;
    /** Final wagers: "Ignore the limits" is ticked (the default). */
    wagerLimitsOff?: boolean;
    /** Players (teams) with a phone in the buzzer room that can send their wager from it. */
    wagerPhones?: string[];
    /** Why phones can't send wagers ('' when they can, or there are none): an older buzzer server. */
    wagerNote?: string;
    /** Seconds typed in the timer box (T uses them too). */
    timerSeconds?: number | null;
    /** Board-game rounds: the steps to move (Enter moves them too). */
    bgSteps?: number | null;
    /** What ↶ Undo would take back next (null: nothing), and ↷ Redo bring back. */
    undoText?: string | null;
    redoText?: string | null;
    dual: boolean;
    /** RPG and board-game rounds on a wide window: the panel is a column beside the stage (see Play's `side`). */
    side?: boolean;
    /** P was pressed and the next number key picks the picker. */
    pickerPending?: boolean;
    /** Everyone in the final reveal is judged; the next N finishes the game. */
    finishArmed?: boolean;
    /** The tool buttons (dice, wheel…), on the tools row. */
    tools?: Snippet;
    onaward: (sign: 1 | -1) => void;
    /** One-click correct answer for one player (awards the clue value or Daily Double wager). */
    onright: (playerId: string) => void;
    onwrong: (playerId: string) => void;
    onreveal: () => void;
    /** A clue with several question slides: the next one (1) or the one before (-1). */
    onslide: (d: 1 | -1) => void;
    /** Done with the clue: back to the board, tile used. */
    onback: () => void;
    /** Back to the board without using up the tile. */
    oncancelclue: () => void;
    /** Put a used tile back on the board. */
    onreopen: (clueId: string) => void;
    onundo: () => void;
    onredo: () => void;
    onnextround: () => void;
    onprevround: () => void;
    /** Jump to any round (the round picker). */
    ongotoround: (index: number) => void;
    onbackfromfinal: () => void;
    /** A ✍ clue: everyone answers on their phone (AnswersHost). */
    everyone?: boolean;
    /** The players with a phone connected now. */
    answerPhones?: string[];
    /** ✔ / ✘ on one player's phone answer. */
    onanswerjudge?: (playerId: string, sign: 1 | -1) => void;
    onbackfromend: () => void;
    onrematch: () => void;
    onintronext: () => void;
    onskipintro: () => void;
    onddshow: (playerId: string, wager: number) => void;
    onfinalstep: () => void;
    /** Play the tiebreaker clue (from the end screen's tie). */
    ontiebreaker: () => void;
    ontiebreakerdone: () => void;
    /** The tied leaders were declared co-winners (the winner fanfare). */
    oncowinners?: () => void;
    /** The Final reveals: a player marked right or wrong (with its sound). */
    onjudge: (playerId: string, right: boolean) => void;
    /** The Final reveals' next step (N): show the spotlit wager, then the next player. */
    onrevealnext: () => void;
    onrolloff?: (ids: string[]) => void;
    /** Open or close the 📜 Log (with a tab: open it on that tab). */
    onlog: (tab?: LogTab) => void;
    onplayers: () => void;
    /** ⚖ Game rules, mid-game (a window). */
    onrules: () => void;
    onhide: () => void;
    /** Leave the game: `keep`, it stays saved to resume later; else it's discarded. */
    onexit: (keep: boolean) => void;
    /** Open the audience window, or close it (the panel has asked first). */
    onaudience: () => void;
    /** Open or close the scores-only window (a lower third for OBS). */
    onscores: () => void;
    /** Open the streaming-sound help (Test sound, output device). */
    onsound: () => void;
    /** ⌨ The keyboard shortcuts. */
    onkeys?: () => void;
    oncloseoverlay: () => void;
    /** Buzzer mode: open the buzzers (U), or for everyone (`all`, 0). */
    onopenbuzzers?: (all?: boolean) => void;
    /** Buzzer mode: phones tied for the fastest buzz (their names), left to the host. */
    tieNames?: string;
    /** 🎲 Roll for it: the tied players roll for who answers. */
    onrolltie?: () => void;
    /** Buzzer mode with no buzzer room to reach: why phones can't buzz (said instead of "Buzzers open"). */
    phonesDown?: string;
    /** Buzzer mode: what phones add to the buzzer row (later buzzes, the phones' status). */
    buzzExtra?: Snippet;
    /** Phone buzzers: the "📱 3/4" chip (its list of phones). */
    phoneChip?: Snippet;
    /** The NEXT cell's main button now (read back: N on a clue does what it shows). */
    nextAction?: NextAction | null;
  } = $props();

  const info = $derived(currentClueInfo(session, game));
  const sym = $derived(game.settings.currencySymbol);
  const round = $derived(game.rounds[session.currentRound]);
  const finalRound = $derived(currentFinal(session, game));
  const done = $derived(session.phase === 'board' && !session.intro && roundComplete(session, game));
  const ddWager = $derived(session.phase === 'clue' && session.dd?.stage === 'splash');
  const scoring = $derived(awardOpen(session));
  // (Off in a copy with no buzzer server, see buzzerOn.)
  const buzzing = $derived(buzzerOn(game.settings) && session.phase === 'clue' && !session.dd && !everyone);
  /** Phone buzzer teams: each player is a team (the 👥 button says so, as the list it opens does). */
  const teams = $derived(buzzerOn(game.settings) && teamsOn(game.settings));
  const buzz = $derived(app.live.buzz);
  const lockedNames = $derived(
    (buzz?.lockedOut ?? [])
      .map((id) => session.players.find((p) => p.id === id)?.name)
      .filter(Boolean)
      .join(', '),
  );
  // At the end the chips stay (scores can still be fixed) but there's nothing to award.
  const showPlayers = $derived((scoring || session.phase === 'end') && session.phase !== 'rpg' && session.phase !== 'boardgame');
  const introLabel = $derived(
    session.intro?.stage === 'title'
      ? isBoard(round)
        ? 'Show board ▶'
        : 'Start the round ▶'
      : session.intro?.stage === 'fill'
        ? 'Reveal categories ▶'
        : `Reveal category ${(session.intro?.revealed ?? 0) + 1} of ${isBoard(round) ? round.categories.length : 0} ▶`,
  );
  // (A clue's own time from an older game can be anything typed: only whole seconds of at least 1 count.)
  const clueSecs = $derived(Math.round(info?.clue.timerSeconds ?? 0));
  const timerDefault = $derived(
    session.phase === 'final'
      ? currentFinal(session, game)?.timerSeconds || game.settings.finalTimerSeconds || 30
      : (clueSecs >= 1 ? clueSecs : 0) || game.settings.defaultTimerSeconds || 30,
  );
  const used = $derived(session.phase === 'board' ? usedTiles(session, game) : []);
  // Only in the round it's from: reopening a tile of another round would change a board nobody is looking at.
  const lastClosedRef = $derived.by(() => {
    const ref = session.lastClosed && session.used[session.lastClosed] ? findClueRef(game, session.lastClosed) : null;
    return ref?.round === session.currentRound ? ref : null;
  });
  /** A wheel/dice tile with nothing to ask: no answer to reveal (closing the tool goes back to the board). */
  const toolOnly = $derived(session.phase === 'clue' && !!info && toolOnlyClue(info.clue));
  /** A clue (or the tiebreaker) with several question slides: which one is on screen ("Slide 2 of 3"); null for one slide. */
  const slidePos = $derived(ddWager ? null : slidePosition(session, game));
  /** The tiebreaker clue's winner, picked (while they're still tied for first: an older roll-off's doesn't count). */
  const tbWinner = $derived(
    session.phase === 'tiebreaker' && session.tiebreakClue && tiedForFirst(session).some((p) => p.id === session.rollOffWinner)
      ? session.players.find((p) => p.id === session.rollOffWinner)
      : undefined,
  );
  /** More question slides to show before the answer. */
  const moreSlides = $derived(!!slidePos && !answerShowing(session) && slidePos.at < slidePos.of);
  const nextSlide = () => onslide(1);
  const openBuzzers = () => onopenbuzzers?.();
  const finalStepText = $derived({
    // Single window: viewers see this window, the wager boxes too.
    wagers: dual ? 'Category on screen · taking wagers (only you see them)' : 'Category on screen · taking wagers (viewers can see them in this window)',
    question: 'Question on screen',
    answer: 'Answer on screen',
    reveal: 'Player reveals',
  });
  /** Points were given for the open clue, so "Cancel (keep tile)" would let it be scored twice. */
  const cancelBlocked = $derived(!ddWager && !!info && clueScored(session, info.clue.id));
  const quickValue = $derived(session.dd?.stage === 'question' ? (session.dd.wager ?? 0) : (info?.value ?? 0));
  /** 0 is an amount too: a Daily Double wagered at 0 or a clue worth 0 (a 0 result), the tiebreaker's winner (no points). */
  const zeroOk = $derived(
    amount === 0 &&
      ((session.phase === 'clue' && (session.dd?.stage === 'question' || (!session.dd && info?.value === 0 && !toolOnly))) || session.phase === 'tiebreaker'),
  );
  const canAward = $derived(!!selected.length && (!!amount || zeroOk));
  /** Why ＋ Award and − Deduct are off (their tooltip). */
  const awardWhyNot = $derived(selected.length ? 'Type an amount first' : `Pick who answered first (1–${Math.min(9, session.players.length) || 9})`);
  /** The one player picked, if one is (＋ Award and − Deduct name them). */
  const pickedName = $derived(selected.length === 1 ? (session.players.find((x) => x.id === selected[0])?.name ?? '') : '');
  /**
   * ＋ Award / − Deduct name who and how much, alike ("＋ Award Bob +$200", "− Deduct Bob −$200"). On the button the name
   * is apart from `head` and `tail`, so a crowded row cuts it short (…), never the amount; `text` is the whole label.
   */
  const scoreLabel = (word: string, sign: string) => {
    const head = selected.length > 1 ? `${word} (${selected.length})` : word;
    const tail = selected.length === 1 && amount ? `${sign}${formatPoints(Math.abs(amount), sym)}` : '';
    return { head, tail, text: [head, pickedName, tail].filter(Boolean).join(' ') };
  };
  const awardLabel = $derived(scoreLabel('＋ Award', '+'));
  const deductLabel = $derived(scoreLabel('− Deduct', '−'));

  const scoreFor = $derived(session.players.find((p) => p.id === editingScore));
  // The NEXT cell and the confirmation strip, filled by the parts in here too (see slots).
  const slots = hostSlots();
  /**
   * The main button stays one button while its job changes: the second click of a double-click on "Show question ▶" (or
   * 🔔 Open the buzzers) must not land on the 👁 Reveal answer it just became, and put the answer on stream.
   */
  let lastNext = { label: '', at: 0 };
  function clickNext(e: MouseEvent, n: { label: string; run: () => void }): void {
    const now = Date.now();
    if (e.detail >= 2 && now - lastNext.at < 600 && lastNext.label !== n.label) return;
    lastNext = { label: n.label, at: now };
    n.run();
  }

  /** Exit was pressed: it asks in the strip (a browser dialog would show on stream). */
  let askExit = $state(false);
  /** 📺 Audience was pressed with the window open: it asks too (it's usually the stream capture). */
  let askCloseAudience = $state(false);
  $effect(() => {
    if (!dual) askCloseAudience = false;
  });
  /** What the strip asks: leaving, closing the audience window, or what a part asked (Next round, Rematch…). */
  const ask = $derived.by((): HostAsk | null => {
    if (askExit && app.test)
      // ▶ Test this round: nothing is kept, so nothing to ask but whether to stop.
      return { text: 'Stop testing? Nothing from this test is kept.', ok: '◀ Back to editor', cancel: 'Stay', onok: () => onexit(false), oncancel: () => (askExit = false) };
    if (askExit && session.phase === 'end')
      return {
        text: 'Leave the results screen? (Copy the standings first if you want to keep them.)',
        ok: 'Leave',
        cancel: 'Stay',
        danger: true,
        onok: () => onexit(false),
        oncancel: () => (askExit = false),
      };
    // Asked once here: kept, the game waits to be resumed (from ▶ Play, or the line over the editor); discarded, it's gone.
    if (askExit)
      return {
        text: 'Leave this game: keep it to resume later?',
        ok: 'Keep & leave',
        alt: 'Discard & leave',
        cancel: 'Stay',
        onok: () => onexit(true),
        onalt: () => onexit(false),
        oncancel: () => (askExit = false),
      };
    if (askCloseAudience)
      return {
        text: 'Close the audience window? Your stream capture goes black.',
        ok: 'Close it',
        cancel: 'Keep it',
        danger: true,
        onok: () => ((askCloseAudience = false), onaudience()),
        oncancel: () => (askCloseAudience = false),
      };
    return slots.ask;
  });

  // The fixed bar ignores the second click of a double-click for a moment after the screen changes (the game starting,
  // a new round or phase): a double-click on Start game ▶ or Done ▶ board never lands on 📺 Audience or 🚪 Exit under
  // it. (A single click, or the keyboard, always goes through.)
  const GUARD_MS = 400;
  let shownAt = Date.now();
  onMount(() => (shownAt = Date.now()));
  $effect(() => {
    void session.phase;
    void session.currentRound;
    shownAt = Date.now();
  });
  function guard(e: MouseEvent): void {
    if (e.detail < 2 || Date.now() - shownAt >= GUARD_MS) return;
    e.stopPropagation();
    e.preventDefault();
  }

  /** On the board, the Amount row stays folded (± Adjust score) until a player is selected. */
  let adjust = $state(false);
  $effect(() => {
    if (session.phase !== 'board') adjust = false;
  });
  const showAward = $derived(scoring && (session.phase !== 'board' || !!selected.length || adjust));

  function toggle(id: string): void {
    selected = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
  }

  function commitScore(id: string, value: string): void {
    if (value.trim() !== '') {
      // (Whole points, within what reads on screen: "1,000", "$500" or "500 pts" read too.)
      const n = typedPoints(value);
      // Not a number: the box stays open, saying why (not closed as if the score was set).
      if (n === null) return void toast(`“${value.trim()}” isn’t a number: type one, like 1500`);
      setScore(session, id, n);
      announce(`${session.players.find((p) => p.id === id)?.name ?? 'Player'} now ${formatPoints(n, sym)}`);
    }
    editingScore = null;
  }

  // How each player was marked on the open clue (✔ / ✘, or Award / Deduct): on their chip, and the same quick button
  // again isn't taken twice. Only since the clue opened (a reopened tile starts afresh; after a reload, all of it).
  let markSince = $state(0);
  let markClue: string | null = untrack(() => clueKey());
  function clueKey(): string | null {
    const c = session.phase === 'clue' ? session.currentClue : null;
    return c ? `${c.round}.${c.cat}.${c.row}` : null;
  }
  $effect(() => {
    const k = clueKey();
    untrack(() => {
      if (k === markClue) return;
      markClue = k;
      markSince = Date.now();
    });
  });
  // A clue just opened, or a Daily Double's question showed: the focus goes to the main button (not lost on the tile
  // that went away; and not left in the wager box, where the Enter that showed it would go on to reveal the answer).
  $effect(() => {
    if (!clueKey() || ddWager) return;
    queueMicrotask(() => document.querySelector<HTMLElement>('.panel [data-next]')?.focus({ preventScroll: true }));
  });
  const marks = $derived(session.phase === 'clue' && info ? clueMarks(session, info.clue.id, markSince) : {});
  /** ✔ / ✘ pressed: that button is off now, so the focus goes on to the main button (not lost to the page). */
  function judged(): void {
    void tick().then(() => {
      const a = document.activeElement;
      if (!a || a === document.body || (a as HTMLButtonElement).disabled) document.querySelector<HTMLElement>('.panel [data-next]')?.focus({ preventScroll: true });
    });
  }

  /**
   * The quick ✔/✘ buttons: clue phase only (not on a wheel/dice tile with nothing to judge), and during a Daily Double
   * only for the player who found it.
   */
  const quickFor = (id: string) =>
    game.settings.deductOnWrong && session.phase === 'clue' && !!info && !toolOnly && (session.dd?.stage !== 'question' || session.dd.playerId === id);
  /** On the board and through a clue the chips keep one width (the mark's place, and ✔ / ✘'s, kept where unused). */
  const chipSlots = $derived(session.phase === 'board' || (session.phase === 'clue' && !!info));

  // ---------- The NEXT cell: one main button ----------
  /** Buzzer mode: the buzzers are closed, nobody answering or picked. */
  const buzzClosed = $derived(buzzing && buzz?.phase !== 'armed' && buzz?.phase !== 'answering' && !selected.length);
  /**
   * Someone got the open clue right (the buzzers closed on it, or a ✔ / ＋ Award on it, after a reload too): the answer
   * comes next, not the buzzers again (🔔 Open the buzzers stays a quiet button beside it).
   */
  const gotIt = $derived(session.phase === 'clue' && (!!buzz?.done || Object.values(marks).some((m) => m.right)));
  /** Someone is answering (picked, or the buzz): ＋ Award is the main button then, and the NEXT cell goes quiet. */
  // (Not while a Daily Double has question slides still to show: its player hasn't heard it all, Next slide ▶ is next.)
  const answering = $derived(session.phase === 'clue' && !ddWager && !!selected.length && canAward && !(session.dd && moreSlides));
  /**
   * This moment's own main button, by priority: a buzzer tie's 🎲 Roll for it, 🔔 Open the buzzers, then 👁 Reveal
   * answer, then ▦ Done ▶ board. (A part's offer comes first: a tool on screen, the Daily Double's wager, the Final…)
   */
  const flow = $derived.by((): NextAction | null => {
    if (session.intro) return { label: introLabel, key: 'N', title: 'N (or click the screen)', run: onintronext };
    if (session.phase === 'clue' && info && !ddWager) {
      if (tieNames && onrolltie) return { label: '🎲 Roll for it', title: 'The tied players roll: the order they roll in is the order they answer in', run: onrolltie };
      // A clue's question slides come first (the host opens the buzzers whenever they like: 🔔 next to it, or U).
      if (moreSlides && slidePos)
        return { label: 'Next slide ▶', key: 'N', title: `N: slide ${slidePos.at + 1} of ${slidePos.of} (Shift+N: the slide before) · or click the slide`, run: nextSlide };
      if (buzzClosed && !gotIt) return { label: '🔔 Open the buzzers', key: 'U', title: "U: buzzers open for everyone who hasn't missed this clue", run: openBuzzers };
      if (!toolOnly && !session.revealed) return { label: '👁 Reveal answer', key: 'R', title: 'R (press again to hide) · or click the slide', run: onreveal };
      return { label: '▦ Done ▶ board', key: 'Esc', title: 'Esc: back to the board (marks the tile used)', run: doneUnscored };
    }
    if (session.phase === 'tiebreaker') {
      if (moreSlides && slidePos)
        return { label: 'Next slide ▶', key: 'N', title: `N: slide ${slidePos.at + 1} of ${slidePos.of} (Shift+N: the slide before) · or click the slide`, run: nextSlide };
      return answerShowing(session)
        ? { label: '🏁 Back to results', run: ontiebreakerdone }
        : { label: '👁 Reveal answer', key: 'R', title: 'R (press again to hide)', run: onreveal };
    }
    return null;
  });
  /**
   * ▦ Done ▶ board as the main button (N): with someone still picked and nothing given on this clue, the first press says
   * so (their points would be lost), the second closes it. (Esc and the plain Done button close at once.)
   */
  let warnedFor = $state<string | null>(null);
  function doneUnscored(): void {
    const id = info?.clue.id ?? null;
    if (answering && id && warnedFor !== id && !Object.keys(marks).length) {
      warnedFor = id;
      const who = session.players.filter((p) => selected.includes(p.id)).map((p) => p.name).join(', ');
      toast(`${who || 'A player'} is picked with no points given: Enter awards, X marks wrong, or N again closes without points`, 5000);
      return;
    }
    onback();
  }
  const next = $derived(slots.offers.tool?.() ?? flow ?? slots.next());
  $effect(() => {
    nextAction = next;
  });
</script>

<div class="panel" class:dual class:side class:final={session.phase === 'final' && !side}>
  <!-- What's going on, read out to screen readers as it changes (buttons and hints left out). Its chips on the right. -->
  <div class="status row" use:announceChanges>
    {#if session.phase === 'board'}
      <b>{round?.name}</b>
      <!-- (Says where the intro is, and nothing about picking tiles once none are left.) -->
      {#if session.intro}
        {@const intro = session.intro}
        {@const cats = round?.mode === 'board' ? round.categories.length : 0}
        {#if intro.stage === 'categories' && cats}
          <span class="muted"
            >Revealing the categories: {Math.min(intro.revealed, cats)} of {cats}
            <span class="hint">· {game.settings.roundIntro.categoryReveal === 'auto' ? 'they come up on their own' : 'click the screen (or N) for the next'}</span></span
          >
        {:else}
          <span class="muted">Round intro <span class="hint">· click the screen (or N) to go on</span></span>
        {/if}
      {:else if done}
        <span class="done">Round complete!</span>
      {:else}
        <span class="muted">Pick a tile on the board <span class="hint">(arrows + Enter)</span>.</span>
      {/if}
      {#if !session.intro && lastClosedRef && session.lastClosed}
        {@const id = session.lastClosed}
        <button class="small ghost" onclick={() => onreopen(id)} title="Put the last tile you closed back on the board">
          ↶ Reopen {clueName(game, lastClosedRef)}
        </button>
      {/if}
      {#if !session.intro && used.length}
        <select
          class="small"
          aria-label="Reopen a used tile"
          title="Put a used tile back on the board (or right-click it on the board)"
          onchange={(e) => {
            const id = e.currentTarget.value;
            e.currentTarget.value = '';
            // Let go of the keys: shortcuts ignore a focused select, and arrow keys would reopen another tile.
            e.currentTarget.blur();
            if (id) onreopen(id);
          }}
        >
          <option value="">↶ Reopen a tile…</option>
          {#each used as t (t.id)}
            <option value={t.id}>{clueName(game, t.ref)}</option>
          {/each}
        </select>
      {/if}
    {:else if session.phase === 'clue' && info}
      <b>{categoryLabel(info.category)}</b>
      <span class="val">{formatPoints(info.value, sym)}</span>
      {#if session.dd?.stage === 'question'}
        {@const dd = session.dd}
        <span class="ddtag">DD {formatPoints(dd.wager ?? 0, sym)}</span>
        <button
          class="ghost small"
          onclick={() => (dd.shown = !dd.shown)}
          title={dual ? "Viewers don't see the wager until you show it" : 'Puts the wager on the slide (viewers can see this window anyway)'}
        >
          {dd.shown ? 'Hide wager' : 'Show wager'}
        </button>
      {/if}
      {#if slidePos && !session.revealed}<span class="slidepos" data-slidepos>Slide {slidePos.at} of {slidePos.of}</span>{/if}
      <span class="muted">·</span>
      {#if session.revealed}
        <span class="revealed">Answer is showing</span>
      {:else if toolOnly}
        <span class="muted">No question on this tile</span>
      {:else if ddWager}
        <span class="muted">Daily Double: who found it, and their wager</span>
      {:else}
        <span class="muted">Answer hidden</span>
      {/if}
      {#if info.clue.hostNotes && !dual}<span class="notes" title="Host notes: viewers can see them in this window">📝 {info.clue.hostNotes}</span>{/if}
    {:else if session.phase === 'final'}
      <b>{finalRound ? finalName(finalRound) : 'Final'}</b>
      {#if session.intro?.stage === 'title'}
        <!-- Its title card is up: viewers don't see the category yet. -->
        <span class="muted">Title card <span class="hint">· click the screen (or N) to go on</span></span>
      {:else}
        <span class="muted">{finalStepText[session.finalStep ?? 'wagers']}</span>
      {/if}
    {:else if (session.phase === 'rpg' || session.phase === 'boardgame') && session.intro?.stage === 'title'}
      <b>{round?.name}</b>
      <span class="muted">Title card <span class="hint">· click the screen (or N) to go on</span></span>
    {:else if session.phase === 'rpg'}
      <b>{round?.name}</b>
      <span class="muted hint">Move with the pad (numpad / Alt+arrows) · click objects on the stage · drag avatars</span>
    {:else if session.phase === 'boardgame'}
      <b>{round?.name}</b>
      <span class="muted hint">
        {round?.mode === 'boardgame' && round.mover.kind === 'step'
          ? 'Pick the way (→ buttons, the space, or Enter when there’s one)'
          : 'D rolls or spins, then ▶ Move (Enter)'} · Shift+N turn back · click a token to select them, drag it to send them
      </span>
    {:else if session.phase === 'slides'}
      <b>{round?.name}</b>
      {#if slidePos}<span class="slidepos" data-slidepos>Slide {slidePos.at} of {slidePos.of}</span>{/if}
      <span class="muted hint"
        >{slidePos && slidePos.at < slidePos.of ? 'N (or a click on the stage) shows the next slide' : 'The last slide: N (or a click on the stage) goes on'} · Shift+N the one before</span
      >
    {:else if session.phase === 'tiebreaker'}
      <b>Tiebreaker</b>
      {#if slidePos && !answerShowing(session)}<span class="slidepos" data-slidepos>Slide {slidePos.at} of {slidePos.of}</span>{/if}
      {#if tbWinner}
        <span class="muted">{tbWinner.name} won the tiebreaker: 🏁 Back to results (or select someone else and ＋ Award to change it).</span>
      {:else}
        <span class="muted">Select the winner and press ＋ Award (Amount 0 settles the tie without points), then go back to the results.</span>
      {/if}
    {:else}
      <b>Game over</b>
      <span class="muted hint">Click a score to fix it.</span>
    {/if}
    {#if app.live.cover}<span class="covered">⏸ Viewers see the cover</span>{/if}
    {#if pickerPending}<span class="pending">Picker: press 1–{Math.min(9, session.players.length)}</span>{/if}
    <span class="spacer"></span>
    {#if session.phase === 'clue' && info}
      <!-- Up here, away from the main cell and the fixed bar, so it's never hit by a double-click meant for something else. -->
      <button
        class="small ghost"
        onclick={oncancelclue}
        disabled={cancelBlocked}
        title={cancelBlocked
          ? 'Points were given for this clue: undo them first, or use Done ▶ board'
          : ddWager
            ? 'Esc: the question never showed, so the tile stays on the board'
            : 'Shift+Esc: back to the board without using up this tile'}
      >↩ Cancel (keep tile)</button>
    {/if}
    {@render phoneChip?.()}
    <TimerControls defaultSeconds={timerDefault} bind:custom={timerSeconds} />
  </div>

  <!-- A score asked for from the player's menu, where there are no score chips to type it into (RPG and board games). -->
  {#if scoreFor && !showPlayers}
    {#key scoreFor.id}
      <InlineAsk
        text="{scoreFor.name}’s score:"
        field="Score"
        value={String(score(session, scoreFor.id))}
        ok="✎ Set"
        onok={(v) => commitScore(scoreFor.id, v)}
        oncancel={() => (editingScore = null)}
      />
    {/key}
  {/if}

  <SoundWarnings {dual} onhelp={onsound} />
  <MediaControls {dual} />

  {#if showPlayers}
    <div class="players">
      {#each session.players as p, i (p.id)}
        {@const on = selected.includes(p.id)}
        <div
          class="p"
          class:on
          class:picker={session.currentPickerId === p.id}
          style:--c={p.color}
          role="group"
          aria-label={p.name}
          data-player-id={p.id}
        >
          {#if scoring}
            <button
              class="sel"
              onclick={() => toggle(p.id)}
              style:background={on ? p.color : undefined}
              style:color={on ? textOn(p.color) : undefined}
              aria-pressed={on}
              title="Toggle (key {i + 1})"
            >
              <span class="key">{i + 1}</span>
              <span class="who" dir="auto" title={p.name}>{p.name}</span>{@render away(p.id, p.name)}
            </button>
          {:else}
            <span class="sel name"><span class="who" dir="auto" title={p.name}>{p.name}</span>{@render away(p.id, p.name)}</span>
          {/if}
          {#if editingScore === p.id}
            <!-- svelte-ignore a11y_autofocus -->
            <input
              class="score-edit"
              type="number"
              autofocus
              value={score(session, p.id)}
              onfocus={(e) => e.currentTarget.select()}
              onkeydown={(e) => {
                if (e.key === 'Enter') commitScore(p.id, e.currentTarget.value);
                // Cancel: stop editing first, so the blur that follows doesn't commit the typed value.
                if (e.key === 'Escape') editingScore = null;
              }}
              onblur={(e) => editingScore === p.id && commitScore(p.id, e.currentTarget.value)}
            />
          {:else}
            <button class="score ghost" onclick={() => (editingScore = p.id)} title="Click to set this score">
              {formatPoints(score(session, p.id), sym)}
            </button>
          {/if}
          <!-- On the board and during a clue, the mark's place is kept (empty until they're marked), and ✔ / ✘'s where they
               aren't offered (the board, a wheel tile, another player's Daily Double): the chips keep one width, so
               opening a clue never wraps the row and shrinks the stage, and ✔ / ✘ never move under the host's cursor. -->
          {#if chipSlots}
            {@const m = marks[p.id]}
            <span class="mark" class:right={m?.right} class:wrong={m && !m.right} class:empty={!m}>
              {#if m}{m.right ? '✔' : '✘'}{m.delta ? ` ${m.delta > 0 ? '+' : ''}${formatPoints(m.delta, sym)}` : ''}{/if}
            </span>
          {/if}
          {#if quickFor(p.id)}
            <!-- Pressed once on this clue, the same one is off (＋ Award / − Deduct still give or take more on purpose). -->
            {@const was = marks[p.id]?.right}
            <button
              class="small quick right"
              onclick={() => (onright(p.id), judged())}
              disabled={was === true}
              aria-label="Right: {p.name} +{formatPoints(quickValue, sym)}"
              title={was === true ? `${p.name} is marked right on this clue (＋ Award gives more)` : `Correct: award ${formatPoints(quickValue, sym)} to ${p.name} only`}
              >✔</button
            >
            <button
              class="small quick wrong"
              onclick={() => (onwrong(p.id), judged())}
              disabled={was === false}
              aria-label="Wrong: {p.name} −{formatPoints(quickValue, sym)}"
              title={was === false ? `${p.name} is marked wrong on this clue (− Deduct takes more)` : `Wrong: deduct ${formatPoints(quickValue, sym)} from ${p.name}`}
              >✘</button
            >
          {:else if chipSlots && game.settings.deductOnWrong}
            <!-- (Hidden copies with the same classes: exactly as wide as the real ones.) -->
            <span class="quick-slot" aria-hidden="true" inert>
              <button class="small quick" tabindex="-1" disabled aria-label="Right">✔</button>
              <button class="small quick" tabindex="-1" disabled aria-label="Wrong">✘</button>
            </span>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  {#snippet away(id: string, name: string)}
    {#if phoneAwaySince(id) !== null}
      <span class="away" data-phone-away={id} role="img" aria-label="{name}’s phone is offline" title="{name}’s phone is offline (the 📱 chip lists the phones)">📵</span>
    {/if}
  {/snippet}

  <!-- What this moment needs (it changes) on the left; the one main button in the NEXT cell on the right. -->
  <div class="act">
    <div class="action">
      {#if app.live.overlay}
        <div class="mode-host tools"><ToolsControls {game} {session} {selected} onclose={oncloseoverlay} /></div>
      {/if}

      {#if ddWager}
        {#key info?.clue.id}
          <DDControls {game} {session} {dual} bind:override={wagerLimitsOff} phones={wagerPhones} phoneNote={wagerNote} onshow={onddshow} oncancel={oncancelclue} />
        {/key}
      {/if}

      {#if everyone && info}
        <div class="mode-host"><AnswersHost {game} {session} clueId={info.clue.id} phones={answerPhones} open={!session.revealed && !session.remote?.answers?.locked} onjudge={onanswerjudge} /></div>
      {/if}

      <!-- (Not while its title card is up: the category isn't on screen yet.) -->
      {#if session.phase === 'final' && session.intro?.stage !== 'title'}
        <div class="mode-host">
          <FinalControls {game} {session} {dual} armed={finishArmed} bind:override={wagerLimitsOff} phones={wagerPhones} phoneNote={wagerNote} onstep={onfinalstep} {onreveal} {onjudge} {onrevealnext} onback={onbackfromfinal} {onslide} />
        </div>
      {/if}

      {#if session.phase === 'boardgame'}
        <div class="mode-host">
          <BoardHost {game} {session} bind:selected bind:steps={bgSteps} bind:space={bgSpace} {dual} onhistory={() => onlog('history')} />
        </div>
      {/if}

      {#if session.phase === 'rpg'}
        <div class="mode-host">
          <RpgHost
            {game}
            {session}
            bind:selected
            bind:object={rpgObject}
            bind:selectedObjects={rpgSelObjects}
            bind:mapOpen={rpgMap}
            bind:mapSend={rpgMapSend}
            bind:ask={rpgAsk}
            {dual}
            onhistory={() => onlog('history')}
          />
        </div>
      {/if}

      {#if session.phase === 'end'}
        <div class="mode-host"><EndControls {game} {session} {onrolloff} {ontiebreaker} {oncowinners} onback={onbackfromend} {onrematch} /></div>
      {/if}

      <!-- The moment's other buttons (whichever isn't the main one): at the end of the Amount row, else a row of their own. -->
      {#snippet others()}
        {#if session.intro}
          <button class="ghost" onclick={onskipintro}>Skip intro</button>
        {/if}
        {#if session.phase === 'clue' && !ddWager}
          {#if slidePos && !session.revealed}
            <!-- A clue's question slides: back one (quiet), and on when something else is the main button. -->
            <button class="ghost" onclick={() => onslide(-1)} disabled={slidePos.at <= 1} title="Shift+N: the slide before">◀ Slide</button>
            {#if moreSlides && next?.run !== nextSlide}<button onclick={nextSlide} title="N: the next slide">Next slide ▶</button>{/if}
          {/if}
          {#if buzzClosed && next?.run !== openBuzzers && !tieNames}
            <button onclick={openBuzzers} title="U: buzzers open for everyone who hasn't missed this clue">🔔 Open the buzzers</button>
          {/if}
          {#if !toolOnly && next?.run !== onreveal}
            <button onclick={onreveal} title="R (press again to hide)">
              {session.revealed ? '🙈 Hide answer' : '👁 Reveal answer'}
            </button>
          {/if}
          <!-- A wheel/dice tile with nothing to ask has one way out: its tool's Close ▶ board. -->
          {#if !(toolOnly && app.live.overlay) && next?.run !== doneUnscored}
            <button onclick={onback} title="Esc: back to the board (marks the tile used)">▦ Done ▶ board</button>
          {/if}
        {:else if session.phase === 'slides'}
          {#if slidePos}<button class="ghost" onclick={() => onslide(-1)} disabled={slidePos.at <= 1} title="Shift+N: the slide before">◀ Slide</button>{/if}
        {:else if session.phase === 'tiebreaker'}
          {#if slidePos && !answerShowing(session)}
            <button class="ghost" onclick={() => onslide(-1)} disabled={slidePos.at <= 1} title="Shift+N: the slide before">◀ Slide</button>
            {#if moreSlides && next?.run !== nextSlide}<button onclick={nextSlide} title="N: the next slide">Next slide ▶</button>{/if}
            {#if next?.run !== onreveal}<button onclick={onreveal} title="R (press again to hide)">👁 Reveal answer</button>{/if}
          {/if}
          {#if answerShowing(session)}
            <button onclick={onreveal} title="R (press again to hide)">🙈 Hide answer</button>
          {:else}
            <button onclick={ontiebreakerdone}>🏁 Back to results</button>
          {/if}
        {/if}
        {#if scoring && !showAward}
          <button class="ghost" aria-expanded="false" onclick={() => (adjust = true)} title="Give or take points (or press a player's number)">± Adjust score</button>
        {/if}
      {/snippet}
      {#if !showAward && (session.intro || (session.phase === 'clue' && !ddWager) || session.phase === 'tiebreaker' || session.phase === 'slides' || scoring)}
        <div class="row flow">{@render others()}</div>
      {/if}

      {#if showAward}
        {#if buzzing}
          <!-- Buzzer mode: the first one in answers, the others are locked out until the buzzers open again. The buzzers'
               own things go together on a row of their own above the Amount row, one height whatever it says (the stage
               doesn't resize as people buzz or the slides change): how they stand, who buzzed, ⏭ Skip, → Next in line,
               the order, then ↺ Reset at the end. -->
          <div class="row buzzrow" data-buzzrow>
            {#if phonesDown && !selected.length && buzz?.phase !== 'answering'}
              <span class="phones-down" role="status">{phonesDown}</span>
            {/if}
            {#if tieNames}
              <span class="tie" role="status">Tie: {tieNames} <span class="muted hint">· 🎲 Roll for it, or pick one (1–{Math.min(9, session.players.length) || 9})</span></span>
            {:else if buzz?.phase === 'armed' && !selected.length}
              {#if !phonesDown}
                <span class="muted hint">🔔 Buzzers open: the fastest phone answers (1–{Math.min(9, session.players.length) || 9} picks by hand)</span>
              {/if}
            {:else if buzzClosed && gotIt}
              <span class="muted hint">✔ Answered: reveal the answer, or 🔔 open the buzzers again</span>
            {:else if buzzClosed}
              <span class="muted hint">Buzzers closed (number keys still pick)</span>
            {/if}
            {#if lockedNames}<span class="muted hint">Missed: {lockedNames}</span>{/if}
            {@render buzzExtra?.()}
            <span class="spacer"></span>
            <button class="ghost small" onclick={() => onopenbuzzers?.(true)} title="0: nobody is locked out any more, and the buzzers open for everyone">↺ Reset buzzers</button>
          </div>
        {/if}
        <div class="row award">
          <label class="check">
            Amount
            <input
              type="number"
              bind:value={() => amount, (v) => (amount = wholePoints(v))}
              onkeydown={(e) => {
                // Give the keys back to the shortcuts afterwards, so the next "2" selects a player instead of typing.
                if (e.key === 'Enter') {
                  onaward(e.shiftKey ? -1 : 1);
                  e.currentTarget.blur();
                } else if (e.key === 'Escape') e.currentTarget.blur();
              }}
            />
          </label>
          <!-- ＋ Award / − Deduct's text: the name apart (in full in its tooltip, and in the button's name for screen
               readers), so a crowded row cuts it short instead of wrapping: see .named. -->
          {#snippet scoreText(l: { head: string; tail: string }, key: string)}
            {l.head}{#if pickedName}<span class="who" dir="auto" title={pickedName}>{pickedName}</span>{/if}{l.tail}
            <kbd aria-hidden="true">{key}</kbd>
          {/snippet}
          <!-- Someone answering: ＋ Award is the main button (green). -->
          <button class="good named" class:primary={answering} disabled={!canAward} onclick={() => onaward(1)} title={canAward ? 'Enter' : awardWhyNot} aria-label={awardLabel.text}>
            {@render scoreText(awardLabel, '⏎')}
          </button>
          <button
            class="bad named"
            disabled={!canAward || (session.phase === 'tiebreaker' && !amount)}
            onclick={() => onaward(-1)}
            title={canAward ? 'Shift+Enter' : awardWhyNot}
            aria-label={deductLabel.text}
          >
            {@render scoreText(deductLabel, '⇧⏎')}
          </button>
          <!-- (Buzzer mode: the buzzers' own things are on their row, above.) -->
          {#if selected.length && !buzzing}
            <!-- (Just ✕ on a narrow window, so the row stays one line: see the media query.) -->
            <button class="ghost clear" onclick={() => (selected = [])} title="Clear selection (Esc)" aria-label="Clear selection"
              ><span class="word">Clear selection</span><span class="x" aria-hidden="true">✕</span></button
            >
          {:else if session.phase === 'board'}
            <button class="ghost" onclick={() => (adjust = false)}>Done</button>
          {:else if !toolOnly && !buzzing}
            <span class="muted hint">Pick who answered (1–{Math.min(9, session.players.length) || 9}, 0 for everyone)</span>
          {/if}
          <span class="spacer"></span>
          {@render others()}
        </div>
      {/if}
    </div>

    {#if next}
      {@const n = next}
      <div class="next">
        <!-- Its quiet companions first (◀ Previous turn), then the one main button (quiet while someone answers: ＋ Award is
             the main one then; and while the strip asks). -->
        {#each n.also ?? [] as a (a.label)}
          <button class="also" data-next-also disabled={a.disabled} onclick={() => a.run()} title={a.title ?? a.key}>
            {a.label}{#if a.key} <kbd aria-hidden="true">{a.key}</kbd>{/if}
          </button>
        {/each}
        <button class:primary={!answering && !ask} data-next disabled={n.disabled} onclick={(e) => clickNext(e, n)} title={n.title ?? n.key}>
          {n.label}{#if n.key} <kbd aria-hidden="true">{n.key}</kbd>{/if}
        </button>
      </div>
    {/if}
  </div>

  <!-- The tools, then the round's navigation (quiet; leaving a round asks), away from the main cell. -->
  <div class="row toolsrow">
    {@render tools?.()}
    {#if session.phase === 'board' || session.phase === 'rpg' || session.phase === 'boardgame' || session.phase === 'slides'}
      <span class="spacer"></span>
      <!-- Fresh per round, so its click guard also covers the second half of a double-click on "Yes". -->
      {#key session.currentRound}
        <RoundNav {game} {session} onprev={onprevround} onnext={onnextround} ongoto={ongotoround} {onslide} />
      {/key}
    {/if}
  </div>

  {#if ask}
    <!-- Confirmations: one strip across the panel, right above the fixed bar (never squeezed into a row of buttons). -->
    <div class="confirm" role="alert">
      {#key ask}
        <InlineAsk text={ask.text} ok={ask.ok} cancel={ask.cancel} danger={ask.danger} alt={ask.alt} onalt={ask.onalt} focusCancel onok={ask.onok} oncancel={ask.oncancel} />
      {/key}
    </div>
  {/if}

  <!-- The fixed bar: the same buttons in the same places in every state and round, 🚪 Exit at the far end. -->
  <div class="fixed" onclickcapture={guard}>
    <span class="group g-edit">
      <!-- Right-click either one for the whole history. -->
      <button
        onclick={onundo}
        oncontextmenu={(e) => (e.preventDefault(), onlog('history'))}
        disabled={!undoText}
        title={undoText ? `Undo: ${undoText} (Ctrl+Z · right-click: history)` : 'Nothing to undo'}>↶ <span class="word">Undo</span></button
      >
      <button
        onclick={onredo}
        oncontextmenu={(e) => (e.preventDefault(), onlog('history'))}
        disabled={!redoText}
        title={redoText ? `Redo: ${redoText} (Ctrl+Shift+Z · right-click: history)` : 'Nothing to redo'}>↷ <span class="word">Redo</span></button
      >
      <button onclick={onsound} title="Test sound, sound output, and how to stream the sound (Discord, OBS)">🔊 Sound</button>
    </span>
    <span class="divider" aria-hidden="true"></span>
    <span class="group g-lists">
      <button onclick={() => onlog()} title="L: the history, scores and rolls">📜 Log</button>
      <!-- The game's rules go with its players (Most players). -->
      <button onclick={onplayers}>{teams ? '👥 Teams' : '👥 Players'}</button>
      <button onclick={onrules} title="⚖ Game rules: scoring, most players, timers, the round intro">⚖ Rules</button>
    </span>
    <span class="divider" aria-hidden="true"></span>
    <span class="group g-screen">
      <button
        class="cover-toggle"
        class:on={app.live.cover}
        aria-pressed={!!app.live.cover}
        onclick={() => (app.live.cover = !app.live.cover)}
        title={app.live.cover ? 'K: viewers see the game again' : "K: viewers see only a 'Be right back' card"}
      >
        {app.live.cover ? '▶ Uncover' : '⏸ Cover'} <kbd aria-hidden="true">K</kbd>
      </button>
      <button onclick={onhide} title="H: hide the controls (in a single window, viewers see only the stage)">🙈 Hide</button>
    </span>
    <span class="divider" aria-hidden="true"></span>
    <!-- The audience window and the scores-only window (a lower third for OBS). Closing the audience window blacks out
         the stream capture, so it asks first. -->
    <span class="group g-windows">
      <button
        onclick={() => (dual ? (askCloseAudience = true) : onaudience())}
        class:on={dual}
        aria-pressed={dual}
        title={dual ? 'The audience window is open: click to close it (A brings it to the front)' : 'A opens or focuses it'}
      >{dual ? '📺 Audience ●' : '📺 Audience'}</button>
      <button
        onclick={onscores}
        class:on={scoresWindow.open}
        aria-label={scoresWindow.open ? 'Close the scores window' : 'Scores window'}
        title={scoresWindow.open
          ? 'Close the scores window'
          : 'Scores window: only the score plates and the countdown, for a lower-third capture in OBS (Shift+A)'}>▭</button
      >
    </span>
    <span class="spacer"></span>
    <!-- ⌨ beside 🚪 Exit: in the side column, Undo, Redo and Sound fill their cell (⌨ there would wrap to a row alone). -->
    <span class="group g-exit">
      {#if onkeys}<button class="ghost" onclick={onkeys} title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">⌨</button>{/if}
      <button class="ghost exit" onclick={() => (askExit = true)}>🚪 Exit</button>
    </span>
  </div>
</div>

<style>
  .panel {
    background: var(--panel);
    border-top: 1px solid var(--border);
    padding: 10px 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    /* Its pop-ups (🎲 / 🎡 / 🏁, the 📱 phones list) are fixed to the window (see anchored.ts): nothing here cuts them
       off, and they show over the stage only with an audience window. The stage above shrinks instead, down to its
       floor, and the panel's tall parts scroll. */
    min-height: 0;
  }
  /* Single window: an open 🎲 / 🎡 / 🏁 menu or the 📱 phones list may not cover the stage, so the panel grows to make
     room for it (the stage shrinks, down to its floor) and the bottom rows move to its foot. The pop-up stays inside
     the panel, scrolling if it must (or, on a window too short for even that, goes where there's room). */
  .panel:not(.dual):has(:global(:is(.tl .menu, #phone-pop))) {
    min-height: min(62vh, 420px);
  }
  .panel:not(.dual):has(:global(.tl .menu)) > .toolsrow {
    margin-top: auto;
  }
  .mode-host {
    min-height: 0;
    overflow: auto;
  }
  /*
    Beside the stage (RPG and board-game rounds on a wide window): a column the window's height, the same stack with the
    round's controls scrolling in the middle and smaller buttons at its foot. An open 🎲 / 🎡 / 🏁 menu pops up over
    the column, never the stage.
  */
  .panel.side {
    width: clamp(420px, 28vw, 540px);
    flex-shrink: 0;
    border-top: none;
    border-left: 1px solid var(--border);
  }
  /* With an audience window the stage here is only a preview: the controls get more of the width (two player cards a
     row in RPG and board-game rounds, so less scrolling). */
  .panel.side.dual {
    width: clamp(420px, 36vw, 720px);
  }
  /* The action row and its NEXT cell: the main button keeps its place at the right, level with the row's foot. */
  .act {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
    gap: 10px;
    min-height: 0;
  }
  .action {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    min-height: 0;
  }
  /* The folded row (± Adjust score) as tall as the Amount row: opening a clue doesn't resize the stage. */
  .flow {
    min-height: 32px;
  }
  /* The buzzers' row keeps one height (a button's) when it only has a hint in it. */
  .buzzrow {
    min-height: 32px;
  }
  .next {
    display: flex;
    justify-content: flex-end;
    align-items: stretch;
    flex-wrap: wrap;
    gap: 6px;
  }
  kbd {
    font: 11px/1 ui-monospace, monospace;
    padding: 1px 4px;
    margin-left: 4px;
    border: 1px solid currentColor;
    border-radius: 4px;
    opacity: 0.75;
  }
  /* The fixed bar: its groups in one row (wrapping on a narrow window), 🚪 Exit at the far right. */
  .fixed {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    padding-top: 8px;
    border-top: 1px solid var(--border);
  }
  /* Only the action part gives up height (it scrolls): the status, the tools and the fixed bar keep theirs. */
  .panel > :is(.status, .toolsrow, .confirm, .fixed) {
    flex-shrink: 0;
  }
  .group {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .confirm {
    padding: 6px 10px;
    border: 1px solid var(--warn);
    border-radius: 8px;
  }
  .toolsrow:empty {
    display: none;
  }
  /* In the column: the action part takes the height left and scrolls; the tools and the fixed bar stay at its foot. */
  /* The Final in a single window: the panel keeps one height through its steps (the title card to the reveals), so the
     stage viewers see doesn't change size; its rows scroll in there instead. */
  .panel.final:not(.dual) {
    height: clamp(280px, 44vh, 440px);
  }
  /* Under the stage, when the panel runs out of height (a tall wheel editor, a long Final), the action part scrolls in
     its place: it never spills up over the stage, out of the scrollbar's reach (the row sits at its foot). */
  .panel:not(.side) > .act {
    flex: 0 1 auto;
    grid-template-rows: minmax(0, 1fr);
  }
  .panel:not(.side) > .act > .action {
    max-height: 100%;
    overflow: auto;
  }
  .panel.final:not(.dual) > .toolsrow {
    margin-top: auto;
  }
  .side > .act {
    flex: 1 1 auto;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) auto;
    align-items: start;
  }
  .side > .act > .action {
    align-self: stretch;
    overflow: auto;
  }
  .side > .act > .next {
    justify-self: end;
    align-self: end;
  }
  .side > .toolsrow,
  .side > .toolsrow :global(.tl),
  .side > .fixed,
  .side .group {
    gap: 4px;
  }
  .side > :is(.toolsrow, .fixed) :global(:is(button, select)) {
    padding: 4px 8px;
    font-size: 12px;
  }
  /* The fixed bar as a two-column grid of its groups, 🚪 Exit in the bottom-right cell. */
  .side > .fixed {
    display: grid;
    /* (The left groups as wide as they need, the right ones the rest: Log, Players and Rules stay on one line.) */
    grid-template-columns: auto minmax(0, 1fr);
    grid-template-areas: 'edit lists' 'screen windows' '. exit';
    align-items: start;
  }
  .side .g-edit {
    grid-area: edit;
  }
  .side .g-lists {
    grid-area: lists;
  }
  .side .g-screen {
    grid-area: screen;
  }
  .side .g-windows {
    grid-area: windows;
  }
  .side .g-exit {
    grid-area: exit;
    justify-content: flex-end;
  }
  .side > .fixed > :is(.divider, .spacer) {
    display: none;
  }
  /* (In the column: ↶ and ↷ alone, so Undo, Redo and Sound fit their cell; their tooltips say what they'd undo.) */
  .side .g-edit .word {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .side .award .hint {
    display: none;
  }
  /* (Amount, ＋ Award and − Deduct on one line in the column: their keys are in their tooltips.) */
  .side .award input {
    width: 80px;
  }
  .side .award kbd {
    display: none;
  }
  /* The round's how-to under its name and the chips, not between them (one line less in the column). */
  .side > .status > .hint {
    order: 1;
    flex-basis: 100%;
  }
  .clear .x {
    display: none;
  }
  /* Up to 1280px wide under the stage: ＋ Award and − Deduct without their keys (they're in their tooltips) and Clear
     selection as ✕, so a picked player's name has the room on the Amount row. */
  @media (max-width: 1280px) {
    .panel:not(.side) .award kbd,
    .panel:not(.side) .clear .word {
      display: none;
    }
    .panel:not(.side) .clear .x {
      display: inline;
    }
  }
  /* A narrow window under the stage: the fixed bar's buttons a little smaller, so 🚪 Exit stays on its line at the right
     instead of wrapping to the left under ↶ Undo, and the Amount row's too, so a clue's buttons stay on one line. */
  @media (max-width: 1180px) {
    .panel:not(.side) > .act :global(button) {
      padding: 5px 9px;
    }
    .panel:not(.side) .award input {
      width: 80px;
    }
    /* (The folded row as tall as the Amount row is here.) */
    .panel:not(.side) .flow {
      min-height: 30px;
    }
    .panel:not(.side) > .fixed :global(button) {
      padding: 5px 8px;
      font-size: 13px;
    }
    .panel:not(.side) > .fixed > .divider {
      margin: 0;
    }
  }
  /* The player cards (RPG and board games) take the column's width and height: the round's box scrolls instead. */
  .side .mode-host :global(.cards) {
    max-height: none;
  }
  .side .mode-host :global(.cards > *) {
    flex-grow: 1;
  }
  /* Above a round's own box (RPG, board game, Final), the tools keep their height (a shop's "Short by…" answers) and
     that box scrolls instead. A tall wheel editor still scrolls in here. */
  .tools:has(~ .mode-host) {
    flex-shrink: 0;
    max-height: 45vh;
  }
  .val {
    color: var(--value);
    font-weight: 800;
  }
  .ddtag {
    background: #7a00ff;
    color: #fff;
    border-radius: 6px;
    padding: 1px 8px;
    font-weight: 700;
    font-size: 12px;
  }
  .done,
  .revealed {
    color: var(--good);
    font-weight: 600;
  }
  .slidepos {
    font-size: 12px;
    font-weight: 600;
    padding: 1px 7px;
    border: 1px solid var(--border);
    border-radius: 999px;
    white-space: nowrap;
  }
  .hint {
    font-size: 12px;
  }
  .phones-down {
    font-size: 12px;
    color: var(--warn);
  }
  .tie {
    font-weight: 700;
    color: var(--warn);
  }
  .notes {
    background: var(--panel-2);
    padding: 2px 8px;
    border-radius: 6px;
  }
  .covered {
    color: var(--warn);
    font-weight: 600;
  }
  /* A fixed width, kept while empty: the chip doesn't grow when its player is marked. */
  .mark {
    font-size: 12px;
    font-weight: 700;
    padding: 0 4px;
    min-width: 7ch;
    white-space: nowrap;
  }
  .mark.empty {
    visibility: hidden;
  }
  .pending {
    background: var(--warn);
    color: #000;
    border-radius: 6px;
    padding: 1px 8px;
    font-weight: 700;
    font-size: 12px;
  }
  .players {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  /* Under the stage on a short window, many players' chips scroll in their own box (a row stays in sight): the buttons
     under them stay in the window, and the page never scrolls the stage away. */
  .panel:not(.side) > .players {
    flex-shrink: 1000;
    min-height: 48px;
    overflow: auto;
    /* (Room for a selected chip's ring.) */
    padding: 2px;
    margin: -2px;
  }
  .p {
    display: flex;
    align-items: center;
    gap: 4px;
    border: 2px solid var(--c);
    border-radius: 8px;
    padding: 3px;
  }
  .p.on {
    box-shadow: 0 0 0 2px var(--c);
  }
  .p.picker .sel::after {
    content: ' ★';
  }
  .sel {
    font-weight: 700;
    border: none;
  }
  .sel.name {
    padding: 6px 12px;
  }
  /* A very long name ends in "…", so its row never runs past the panel. */
  .who {
    display: inline-block;
    max-width: 14em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    vertical-align: bottom;
  }
  .key {
    font-size: 12px;
    opacity: 0.7;
    margin-right: 4px;
  }
  /* Their phone dropped. */
  .away {
    margin-left: 4px;
    font-size: 12px;
  }
  .score {
    font-weight: 700;
    min-width: 70px;
    border: none;
  }
  .score-edit {
    width: 100px;
  }
  .quick {
    padding: 4px 8px;
  }
  /* ✔ / ✘'s place where they aren't offered: unseen, but as wide (the chip's gap still applies). */
  .quick-slot {
    display: contents;
    visibility: hidden;
  }
  .right {
    color: var(--good);
  }
  .wrong {
    color: var(--bad);
  }
  .small {
    font-size: 12px;
  }
  select.small {
    padding: 2px 6px;
  }
  .award input {
    width: 110px;
  }
  /* ＋ Award and − Deduct take the room the row has, up to their whole label: on a crowded row (a long name, a narrow
     window) the name is cut short (…) instead of the row wrapping, which would shrink the stage when a player is picked.
     The amount never is. (Only when not even 12em each is left do they wrap.) */
  .award .named {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: 1 1 12em;
    max-width: max-content;
    overflow: hidden;
  }
  /* (So they get the room first, and what's left goes before the moment's other buttons.) */
  .award > .spacer {
    flex: none;
    margin-left: auto;
  }
  /* ＋ Award as the main button: green, with a ring. */
  .award .good.primary:not(:disabled) {
    box-shadow: 0 0 0 2px var(--good);
  }
  /* ▶ Uncover while viewers see the card: filled, so it's plain the stream is covered. */
  .cover-toggle.on {
    background: var(--warn);
    border-color: var(--warn);
    color: #000;
    font-weight: 700;
  }
  .divider {
    width: 1px;
    align-self: stretch;
    background: var(--border);
    margin: 0 4px;
  }
</style>
