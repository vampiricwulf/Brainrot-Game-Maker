<!--
  Host-only controls (scoring, reveal, navigation). Never part of the audience view. One layout in every state, top to
  bottom: what's going on (with the 📱 and ⏱ chips on the right), the players, the action row (what this moment needs)
  with the one main button in the NEXT cell at its right (its key on it), the tools and round navigation, a confirmation
  strip when something asks, and the fixed bar (↶ Undo … 🚪 Exit), the same in every state and round. The main button
  (the blue one) is the show's next step, from Play (goon.ts); with something left, it opens the check before going
  on, drawn over the panel's buttons here (GoOnCheck).
-->
<script lang="ts">
  import { announce, announceChanges } from '../lib/announce';
  import { textOn } from '../lib/colors';
  import { hostSlots, offerMenu, panelGuard, type HostAsk, type NextAction, type PlayerVerb, type PlayerVerbs } from './host/slots.svelte';
  import { verdictVerbs } from './playermenu';
  import type { StageItem } from './host/stagemenu';
  import { VERBS } from './host/verbs';
  import { justShown } from './host/guard';
  import { focusMain } from './host/focus';
  import GoOnCheck from './host/GoOnCheck.svelte';
  import { flowSteps, mayAsk, type GoPanel } from './host/goon';
  import { CHECK, FLOW } from './host/verbs';
  import { phoneAwaySince } from './host/phoneaway.svelte';
  import { endLine, tiebreakLine } from './host/endlines';
  import { movedNew } from './whatmoved.svelte';
  import { categoryLabel, clueCardWords, clueValue, finalName, formatPoints, isBoard, isBoardGame, isSlides, questionSlides, typedPoints, wholePoints, type Game, type Session } from '../lib/model';
  import { answerShowing, awardOpen, clueMarks, clueName, clueScored, currentClueInfo, currentFinal, findClueRef, ownPlayers, partnerSteal, roundComplete, score, setScore, slidePosition, stealersLeft, tiebreakHolds, tiedForFirst, toolOnlyClue, usedTiles } from '../lib/session';
  import MediaControls from './MediaControls.svelte';
  import SoundWarnings from './host/SoundWarnings.svelte';
  import TimerControls from './host/TimerControls.svelte';
  import DDControls from './host/DDControls.svelte';
  import PartnerControls from './host/PartnerControls.svelte';
  import TileCards from './host/TileCards.svelte';
  import CardOffers from './host/CardOffers.svelte';
  import { cardRecipients, cardSends, cardSlides, partnerPickStep, partnerRules, partnerShares, partnerVerdict, sentTo, toName } from '../lib/partner';
  import FinalControls from './host/FinalControls.svelte';
  import EndControls from './host/EndControls.svelte';
  import ToolsControls from './host/ToolsControls.svelte';
  import RoundNav from './host/RoundNav.svelte';
  import AnswersHost from './host/AnswersHost.svelte';
  import InlineAsk from './host/InlineAsk.svelte';
  import RpgHost from './rpg/RpgHost.svelte';
  import type { RpgAsk } from './rpg/hostops';
  import BoardHost from './boardgame/BoardHost.svelte';
  import { isMover } from './boardgame/bgops';
  import type { LogTab } from './ScoreLog.svelte';
  import { app, hint, toast } from '../lib/app.svelte';
  import { dropMenu } from '../lib/menustate.svelte';
  import { buzzerOn, remote, roomHasCards, roomMembers } from '../lib/remote.svelte';
  import { answerRoundId, teamsOn } from '../lib/buzz';
  import { usableChoices } from '../lib/choices';
  import { scoresWindow } from '../lib/sync.svelte';
  import { tileToolUp, timerRemaining } from '../lib/live';
  import { onMount, tick, untrack, type Snippet } from 'svelte';

  let {
    game,
    session,
    selected = $bindable(),
    amount = $bindable(),
    rpgObject = $bindable(null),
    rpgSelObjects = $bindable([]),
    rpgAgain = null,
    onrpgclear,
    rpgMap = $bindable(false),
    rpgAsk = $bindable(null),
    rpgMapSend = $bindable(null),
    bgSpace = $bindable(null),
    editingScore = $bindable(null),
    wagerLimitsOff = $bindable(false),
    wagerPhones = [],
    wagerNote = '',
    finalTyped = false,
    answersNote = '',
    onshowanswer = () => {},
    timerSeconds = $bindable(null),
    ontimerstart = () => {},
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
    askcancel = null,
    onreopen,
    onundo,
    onredo,
    onnextround,
    onprevround,
    ongotoround,
    onbackfromfinal,
    everyone = false,
    choicesNote = '',
    answerPhones = [],
    onanswerjudge = () => {},
    onanswerjudgeall = () => {},
    onbackfromend,
    onrematch,
    onskipintro,
    onpartnerspin = () => {},
    onpartnerclock = () => {},
    onpartnertakeback = () => {},
    onpartnermemberspin = () => {},
    onpartnerjudge = () => {},
    oncardtakeback = () => {},
    onfinalstep,
    ontiebreaker,
    ontiebreakerdone,
    ontiebreakwin,
    oncowinners,
    onjudge,
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
    passNames = '',
    allPassed = false,
    buzzExtra,
    inQueue = [],
    phoneChip,
    boxMenu = $bindable(null),
    playerVerbs = $bindable(null),
    markSince = 0,
    goon = null,
    clicknote = null,
  }: {
    game: Game;
    session: Session;
    selected: string[];
    amount: number | null;
    /** RPG rounds: the object whose card is open (clicked on the stage). */
    rpgObject?: string | null;
    /** RPG rounds: the objects selected on the stage (they drag with the selected players). */
    rpgSelObjects?: string[];
    /** RPG rounds: ↩ Select them again, while a selection just cleared or replaced can come back (5 s). */
    rpgAgain?: (() => void) | null;
    /** RPG rounds: the selection line's Clear selection (players and objects; ↩ Select them again brings them back). */
    onrpgclear?: () => void;
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
    /** Wagers: "Ignore the limit(s)" is ticked (unticked by default: a wager is held to its max). */
    wagerLimitsOff?: boolean;
    /** Players (teams) with a phone in the buzzer room that can send their wager from it. */
    wagerPhones?: string[];
    /** Why phones can't send wagers ('' when they can, or there are none): an older buzzer server. */
    wagerNote?: string;
    /** The Final: players type their answer on their phone. */
    finalTyped?: boolean;
    /** Why phones can't send the Final's answers ('' when they can): an older buzzer server. */
    answersNote?: string;
    /** Put a player's typed Final answer on screen. */
    onshowanswer?: (playerId: string) => void;
    /** Seconds typed in the timer box (T uses them too). */
    timerSeconds?: number | null;
    /** The status line's ⏱ Start (or ▶) started the countdown: a partner clue handing out its cards goes on with it, as with T. */
    ontimerstart?: () => void;
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
    /** What ↩ Put back (keep tile) asks first when a card went (Play asks it): in the strip. */
    askcancel?: HostAsk | null;
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
    /** A ✍ clue's (or a typed Final's) multiple choices that the buzzer server can't show on phones (an older one): why they type. */
    choicesNote?: string;
    /** ✔ / ✘ on one player's phone answer. */
    onanswerjudge?: (playerId: string, sign: 1 | -1) => void;
    /** ✔ Judge all on a multiple-choice ✍ clue (once its answers are locked). */
    onanswerjudgeall?: () => void;
    onbackfromend: () => void;
    onrematch: () => void;
    onskipintro: () => void;
    /** A 🤝 partner clue: 🎡 Spin for a partner, 📤 Send and start or ⏱ Start the clock (Show question ▶ is the blue button's). */
    onpartnerspin?: () => void;
    onpartnerclock?: () => void;
    /** ↩ Take back a 🤫 card from every phone it was sent to. */
    onpartnertakeback?: (card: string) => void;
    /** 🎡 Spin for the describer: the member wheel (teams, the picker's own team playing it). */
    onpartnermemberspin?: () => void;
    /** ✔ Got it (true) or ✘ Missed (false) on a partner clue: both of the two in one step. */
    onpartnerjudge?: (got: boolean) => void;
    /** ↩ Take back a card sent with 🤫 Send a card… or from a tile's or the Final's panel. */
    oncardtakeback?: (id: string) => void;
    onfinalstep: () => void;
    /** Play the tiebreaker clue (from the end screen's tie). */
    ontiebreaker: () => void;
    ontiebreakerdone: () => void;
    /** 🏆 This tied player won the tiebreaker clue (no points: as ＋ Award with 0; another 🏆 changes it). */
    ontiebreakwin: (id: string) => void;
    /** The tied leaders were declared co-winners (the winner fanfare). */
    oncowinners?: () => void;
    /** The Final reveals: a player marked right or wrong (with its sound). */
    onjudge: (playerId: string, right: boolean) => void;
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
    /** ❔ Help: the keys window, on the game's keys. */
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
    /** Phone buzzers: who passed on the open clue from their phone ("Ann, Bob"; teams "Red team (Zoe)"). */
    passNames?: string;
    /** Phone buzzers: everyone still able to buzz passed (goon.ts everyonePassed): the answer comes next. */
    allPassed?: boolean;
    /** Buzzer mode: what phones add to the buzzer row (later buzzes, the phones' status). */
    buzzExtra?: Snippet;
    /** The players in the buzz order buzzExtra lists (those who missed struck out there, so not named again here). */
    inQueue?: string[];
    /** Phone buzzers: the "📱 3/4" chip (its list of phones). */
    phoneChip?: Snippet;
    /** What the boxes open here add to the stage's menu (read back by the play screen: see stagemenu.ts). */
    boxMenu?: (() => StageItem[]) | null;
    /** What the boxes open here add to a player's menu, first in it (read back by the play screen: see playermenu.ts). */
    playerVerbs?: PlayerVerbs | null;
    /** When the open clue opened (Play's: 0 after a reload): its players' marks count from then (a reopened tile starts afresh). */
    markSince?: number;
    /** The blue button's step and the check before going on (Play's: see goon.ts). */
    goon?: GoPanel | null;
    /**
     * What a click on the stage says (what to do, or what it did, with ↶ Undo): the status line shows it a few seconds,
     * over where it says where you are (Play's: see stageclick.ts).
     */
    clicknote?: { text: string; undo?: () => void } | null;
  } = $props();

  /** The status line, and how much of it a click's note covers: its start, up to the spacer before its chips. */
  let statusEl = $state<HTMLElement>();
  let noteW = $state(0);
  $effect(() => {
    if (!clicknote || !statusEl) return;
    const sp = statusEl.querySelector<HTMLElement>(':scope > .spacer');
    noteW = sp ? Math.max(0, sp.offsetLeft + sp.offsetWidth) : 0;
  });

  const info = $derived(currentClueInfo(session, game));
  const sym = $derived(game.settings.currencySymbol);
  const round = $derived(game.rounds[session.currentRound]);
  /** A board game's own dice or movement wheel is up: its box goes under the turn box (BoardHost), not on top. */
  const moverUp = $derived(session.phase === 'boardgame' && isBoardGame(round) && !!session.boardgames?.[round.id] && isMover(round, app.live.overlay));
  const finalRound = $derived(currentFinal(session, game));
  const done = $derived(session.phase === 'board' && !session.intro && roundComplete(session, game));
  const ddWager = $derived(session.phase === 'clue' && session.dd?.stage === 'splash');
  /** The open clue is played by its own players (a Daily Double, a partner clue): nobody buzzes. */
  const own = $derived(ownPlayers(session));
  /** Before such a clue's question shows: a Daily Double's wager, a partner clue's PARTNER UP!. */
  const setup = $derived(!!own?.setup);
  /** A 🤝 partner clue that's open (its own part of the panel is up). */
  const partner = $derived(session.phase === 'clue' && info?.clue.type === 'partner' ? session.partner : null);
  /** Its miss let the others steal it: they answer it as any clue (the two locked out). */
  const steal = $derived(partner ? partnerSteal(session) : null);
  const scoring = $derived(awardOpen(session));
  // (Off in a copy with no buzzer server, see buzzerOn.)
  const buzzing = $derived(buzzerOn(game.settings) && session.phase === 'clue' && !own && !everyone);
  /**
   * Single window, buzzer mode: the buzzers' row keeps its room (empty) where there are no buzzers, on the board and on a
   * Daily Double's question, so the stage viewers see keeps one size.
   */
  const roomForBuzzers = $derived(!dual && buzzerOn(game.settings));
  /**
   * Single window: a board or slides round with videos, sounds or embeds on its slides keeps the media controls' room
   * (empty) through the round, as many rows as the most on any one slide, so the stage viewers see doesn't shrink when a
   * slide's media comes up. (Other games don't give up that room.)
   */
  const roomForMedia = $derived.by(() => {
    // (Not in a 🤝 partner clue: its panel keeps a height of its own.)
    if (dual || side || partner) return 0;
    const slides =
      isBoard(round) && (session.phase === 'board' || session.phase === 'clue')
        ? round.categories.flatMap((c) => c.clues.flatMap((q) => [...questionSlides(q), q.answerSlide]))
        : isSlides(round) && session.phase === 'slides'
          ? questionSlides(round)
          : [];
    return Math.max(0, ...slides.map((sl) => sl?.elements.filter((e) => e.kind === 'video' || e.kind === 'audio' || e.kind === 'embed').length ?? 0));
  });
  /**
   * Single window: the panel's height on the board (measured there). A Daily Double's splash holds the panel to it (its
   * box scrolls, the chips and the Wager box in sight), so the stage keeps its size from the board to the splash to the
   * question.
   */
  let panelH = $state(0);
  let boardH = $state(0);
  $effect(() => {
    if (session.phase === 'board' && !session.intro && panelH) boardH = panelH;
  });
  const ddHold = $derived(ddWager && !dual && !side && boardH > 0);
  /**
   * Single window, under the stage: the panel keeps one height (the Final's) through the results, a roll-off and the
   * tiebreaker clue, through a board-game round's turns, and through a wheel or dice tile (its tool, then its question),
   * so the stage changes size only as the tile opens and closes. Its rows scroll instead (see .held).
   */
  const held = $derived(
    !side &&
      (session.phase === 'end' ||
        session.phase === 'tiebreaker' ||
        session.phase === 'boardgame' ||
        (session.phase === 'clue' && (info?.clue.type === 'wheel' || info?.clue.type === 'dice'))),
  );
  /** Phone buzzer teams: each player is a team (the 👥 button says so, as the list it opens does). */
  const teams = $derived(buzzerOn(game.settings) && teamsOn(game.settings));
  /**
   * Teams, a partner clue: the people on its picker's team whose phones get the cards (more than one: that team playing
   * it spins for who describes first, as the main button says). A room that takes cards, as PartnerControls has it.
   */
  const describers = $derived(
    partner?.pickerId && teams && !!remote.code && remote.status !== 'off' && remote.status !== 'error' && roomHasCards() ? roomMembers(partner.pickerId).length : 0,
  );
  /** What the status line says of the open clue: where it is. */
  const clueSay = $derived.by((): string => {
    if (toolOnly) return 'No question on this tile';
    if (session.revealed) return 'Answer is showing';
    if (ddWager) return 'Daily Double: who found it, and their wager';
    if (partner?.stage === 'pick') return pickLine;
    if (steal && !steal.by) return stealersLeft(session.players, steal, marks).length ? 'Answer hidden · 🔔 a steal: the others can answer' : 'Answer hidden · nobody stole it: reveal the answer';
    if (partnerJudged) return 'Answer hidden · judged';
    if (allPassed) return 'Answer hidden · everyone passed';
    // (T started the clock with phone cards still to send: Enter sends them.)
    if (partner?.stage === 'distribute' && partnerUnsent && clockRuns) return `Clock running: Enter sends the ${partnerUnsent === 1 ? 'card' : `${partnerUnsent} cards`}`;
    const sent = sentNote ? ` · ${sentNote}` : '';
    return partner?.stage === 'distribute' ? `Answer hidden · hand out the cards${sent}` : `Answer hidden${sent}`;
  });
  /** PARTNER UP!'s status line: what it waits on, in the main button's order (partnerPickStep), so the two agree. */
  const pickLine = $derived.by(() => {
    if (partner?.stage !== 'pick') return '';
    const step = partnerPickStep(session, partner, describers);
    if (step === 'describer') return 'Partner clue: spin for the describer';
    if (step === 'show') return 'Partner clue: show the question when you’re ready';
    if (step === 'picker') return `Partner clue: ${teams ? 'which team' : 'who'} picked it? (1–${Math.min(9, session.players.length) || 9})`;
    return step === 'nobody' ? 'Partner clue: nobody to partner with (Solo, or Esc)' : 'Partner clue: spin for a partner';
  });
  const buzz = $derived(app.live.buzz);
  // (Who missed and isn't struck out in the buzz order: named once in the row.)
  const lockedNames = $derived(
    (buzz?.lockedOut ?? [])
      .filter((id) => !inQueue.includes(id))
      .map((id) => session.players.find((p) => p.id === id)?.name)
      .filter(Boolean)
      .join(', '),
  );
  // At the end the chips stay (scores can still be fixed) but there's nothing to award.
  const showPlayers = $derived((scoring || session.phase === 'end') && session.phase !== 'rpg' && session.phase !== 'boardgame');
  // (A clue's own time from an older game can be anything typed: only whole seconds of at least 1 count.)
  const clueSecs = $derived(Math.round(info?.clue.timerSeconds ?? 0));
  const timerDefault = $derived(
    session.phase === 'final'
      ? currentFinal(session, game)?.timerSeconds || game.settings.finalTimerSeconds || 30
      : (clueSecs >= 1 ? clueSecs : 0) || game.settings.defaultTimerSeconds || 30,
  );
  /** The countdown is running. */
  const clockRuns = $derived(!!app.live.timer && app.live.timer.startedAt !== null && !app.live.timer.expired);
  /**
   * What a partner clue's ⏱ Start the clock counts down from: a paused countdown's time left, else the seconds typed in
   * the ⏱ box (as T takes them), else the clue's or the game's.
   */
  const clockSecs = $derived.by(() => {
    const t = app.live.timer;
    if (t && !t.expired && t.startedAt === null) return Math.max(1, Math.ceil(timerRemaining(t)));
    return timerSeconds != null && timerSeconds >= 1 ? Math.min(3600, Math.round(timerSeconds)) : timerDefault;
  });
  /** A partner clue's cards still to send to phones (not sent, someone to go to), when the room takes cards. */
  const partnerUnsent = $derived.by(() => {
    if (!partner || !info || !buzzerOn(game.settings) || !remote.code || remote.status === 'off' || remote.status === 'error' || !roomHasCards()) return 0;
    return cardSlides(info.clue).filter((c) => !cardSends(partner, c.id).length && cardRecipients(session, partner, c).length > 0).length;
  });
  const used = $derived(session.phase === 'board' ? usedTiles(session, game) : []);
  /**
   * ↶ Reopen (the status line's button, or a tile picked from ↶ Reopen a tile…): back on the board, and the keys go to
   * that tile, as after ▦ Done ▶ board, so the arrows and Enter go on from it (not the panel's first button).
   */
  function reopenPicked(id: string): void {
    onreopen(id);
    void tick().then(() => document.querySelector<HTMLElement>(`.play .stage-box .tile[data-clue="${id}"]`)?.focus({ preventScroll: true }));
  }
  // Only in the round it's from: reopening a tile of another round would change a board nobody is looking at.
  const lastClosedRef = $derived.by(() => {
    const ref = session.lastClosed && session.used[session.lastClosed] ? findClueRef(game, session.lastClosed) : null;
    return ref?.round === session.currentRound ? ref : null;
  });
  /** A wheel/dice tile with nothing to ask: no answer to reveal (closing the tool goes back to the board). */
  const toolOnly = $derived(session.phase === 'clue' && !!info && toolOnlyClue(info.clue));
  /** A wheel or dice tile's tool, in words. */
  const toolName = $derived(info?.clue.type === 'dice' ? 'dice' : 'wheel');
  /**
   * A wheel or dice tile's own wheel or dice still up (spun or not): its question comes once it's closed, so 👁 Reveal
   * answer waits until then (R asks first, then shows it anyway).
   */
  const toolFirst = $derived(session.phase === 'clue' && !!info && !session.revealed && tileToolUp(app.live, info.clue));
  /**
   * A situation's box is open (a 🤝 partner clue's, a Daily Double's wager, a tile's own 🎡 / 🎲, the Final's): the tools
   * row steps back (the ghost look, at full contrast), so the box is what the eye finds. Nothing moves, every tool works.
   */
  const quietTools = $derived(!!partner || ddWager || toolFirst || session.phase === 'final');
  /** A clue (or the tiebreaker) with several question slides: which one is on screen ("Slide 2 of 3"); null for one slide. */
  const slidePos = $derived(setup ? null : slidePosition(session, game));
  /** The tiebreaker clue's winner, picked (while they're still tied for first: an older roll-off's doesn't count). */
  const tbWinner = $derived(
    session.phase === 'tiebreaker' && session.tiebreakClue && tiebreakHolds(session, tiedForFirst(session).map((p) => p.id))
      ? session.players.find((p) => p.id === session.rollOffWinner)
      : undefined,
  );
  /** The tiebreaker clue's "Who won?" row: the players tied for first (none once points given there settled it). */
  const tbTied = $derived(session.phase === 'tiebreaker' ? tiedForFirst(session) : []);
  /** ↩ Put back (keep tile)'s words in their three widths: its sign, then " Put back", then " (keep tile)". */
  const putBackWords = (() => {
    const l = VERBS.putBack.label;
    const i = l.indexOf(' ');
    const j = l.indexOf(' (');
    return [l.slice(0, i), l.slice(i, j > i ? j : l.length), j > i ? l.slice(j) : ''];
  })();
  const openBuzzers = () => onopenbuzzers?.();
  const finalStepText = $derived({
    // Single window: viewers see this window, the wager boxes too.
    wagers: dual ? 'Category on screen · taking wagers (only you see them)' : 'Category on screen · taking wagers (viewers can see them in this window)',
    question: 'Question on screen',
    answer: 'Answer on screen',
    reveal: teams ? 'Team reveals' : 'Player reveals',
  });
  /**
   * Points were given for the open clue (what its own wheel or dice gave too), so "Put back (keep tile)" would let it be
   * scored twice. (Before its question shows they're an earlier play's, unless it's a partner clue sent back to PARTNER
   * UP! after it was scored.)
   */
  const cancelBlocked = $derived.by(() => (!setup || (!!partner && Object.keys(marks).length > 0)) && !!info && clueScored(session, info.clue.id));
  const quickValue = $derived(session.dd?.stage === 'question' ? (session.dd.wager ?? 0) : (info?.value ?? 0));
  /**
   * One window: a Daily Double wager its player sent from their phone stays hidden in this panel (viewers see it) until
   * Show wager, as it was in the wager box. Typing an amount over it makes it the host's, and shows it.
   */
  const ddHidden = $derived(!dual && session.dd?.stage === 'question' && session.dd.draftFrom === 'phone' && !session.dd.shown);
  /** 0 is an amount too: a Daily Double wagered at 0 or a clue worth 0 (a 0 result), the tiebreaker's winner (no points). */
  const zeroOk = $derived(
    amount === 0 &&
      ((session.phase === 'clue' && (own ? !own.setup : info?.value === 0 && !toolOnly)) || session.phase === 'tiebreaker'),
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
    const tail = selected.length === 1 && amount && !ddHidden ? `${sign}${formatPoints(Math.abs(amount), sym)}` : '';
    return { head, tail, text: [head, pickedName, tail].filter(Boolean).join(' ') };
  };
  const awardLabel = $derived(scoreLabel('＋ Award', '+'));
  const deductLabel = $derived(scoreLabel('− Deduct', '−'));

  const scoreFor = $derived(session.players.find((p) => p.id === editingScore));
  // The NEXT cell and the confirmation strip, filled by the parts in here too (see slots).
  const slots = hostSlots();
  /** One window: what the boxes open say viewers can read of them (the status line's ⚠ Viewers see this chip). */
  const viewersSee = $derived(dual ? [] : slots.viewersSee());
  /**
   * The main button stays one button while its job changes: the second click of a double-click on "Show question ▶"
   * must not land on the 👁 Reveal answer it just became, and put the answer on stream. (The panel's one click guard: a
   * box's own buttons go through it too.)
   */
  const guard = panelGuard();
  function clickNext(e: MouseEvent, n: NextAction): void {
    if (guard.press(`main:${n.label}`, e.detail, { step: true, x: e.clientX, y: e.clientY }) !== 'go') return;
    // (The blue button's step, through the check: Shift+click goes on without asking.)
    if (goon) goon.main(e.shiftKey ? 'shift' : 'main');
    else n.run();
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
        altDanger: true,
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
    return askcancel ?? slots.ask;
  });
  // ↩ Put back (keep tile)'s question and a part's (a partner card's) share the strip: the newer one shows, the older one
  // is put away (answered no), so a press never seems to do nothing behind an old question.
  $effect(() => {
    if (askcancel) untrack(() => slots.ask?.oncancel());
  });
  $effect(() => {
    if (slots.ask) untrack(() => askcancel?.oncancel());
  });
  // The check opening answers the strip's question as its cancel (Stay, Keep playing): the two never show together.
  $effect(() => {
    if (goon?.check) untrack(() => ask?.oncancel());
  });

  // The fixed bar ignores the second click of a double-click for a moment after the screen changes (the game starting,
  // a new round or phase): a double-click on Start game ▶ or Done ▶ board never lands on 📺 Audience or 🚪 Exit under
  // it. (A single click, or the keyboard, always goes through.)
  let shownAt = Date.now();
  onMount(() => (shownAt = Date.now()));
  $effect(() => {
    void session.phase;
    void session.currentRound;
    shownAt = Date.now();
  });
  function barGuard(e: MouseEvent): void {
    if (!justShown(shownAt, Date.now(), e.detail, true)) return;
    e.stopPropagation();
    e.preventDefault();
  }

  /** On the board, the Amount row stays folded (± Adjust score) until a player is selected. */
  let adjust = $state(false);
  let amountBox = $state<HTMLInputElement>();
  /** The keys are in the Amount box: number keys type points there, so the chips' keys go (see .key.gone). */
  let amountKeys = $state(false);
  /**
   * The board's tile the keys came to the Amount box from (2, then Enter on it): its Enter or Esc gives them back there,
   * so the arrows and Enter go on with the board. Opened with ± Adjust score, they go to the board's tile (the one Tab
   * reaches), never the page itself. (Elsewhere they're let go, for the shortcuts.)
   */
  let amountFrom: HTMLElement | null = null;
  function amountDone(box: HTMLInputElement): void {
    const to = session.phase === 'board' ? (amountFrom?.isConnected ? amountFrom : document.querySelector<HTMLElement>('.play .stage-box .tile[data-clue][tabindex="0"]')) : null;
    amountFrom = null;
    if (to) to.focus({ preventScroll: true });
    else box.blur();
  }
  $effect(() => {
    if (session.phase !== 'board') adjust = false;
  });
  /**
   * The tiebreaker clue: its 🏆 row settles the tie, so the Amount row folds behind ± Also give points… (opened, it
   * stays open for this tiebreaker).
   */
  let tbPoints = $state(false);
  $effect(() => {
    if (session.phase !== 'tiebreaker') tbPoints = false;
  });

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

  /** The open clue (round.cat.row), null for none. */
  function clueKey(): string | null {
    const c = session.phase === 'clue' ? session.currentClue : null;
    return c ? `${c.round}.${c.cat}.${c.row}` : null;
  }
  // A clue just opened, or a Daily Double's question showed: the focus goes to the main button (not lost on the tile
  // that went away; and not left in the wager box, where the Enter that showed it would go on to reveal the answer).
  // A partner clue's each step too (who picked it chosen: 🎡 Spin for a partner is on now; its question showing, the
  // clock starting).
  $effect(() => {
    void session.partner?.stage;
    void session.partner?.pickerId;
    if (!clueKey() || ddWager) return;
    queueMicrotask(focusMain);
  });
  // How each player was marked on the open clue (✔ / ✘, or Award / Deduct): on their chip, and the same quick button
  // again isn't taken twice. Only since the clue opened (Play's markSince). (A partner clue knows when it opened, a
  // reload too.)
  const marks = $derived(session.phase === 'clue' && info ? clueMarks(session, info.clue.id, partner?.at ?? markSince) : {});
  /** The open partner clue is judged: each of the two has a mark on it (an Undo takes that away again). */
  const partnerJudged = $derived(!!partner && partnerVerdict(partner, marks).judged);
  /**
   * A 🤝 partner clue's question (not a steal): ✔ Got it / ✘ Missed give the points, so the Amount row folds behind
   * ± Other points…. It opens by itself once a player is picked (1–9) or points were given by hand on this clue (someone
   * but the two marked, or one of the two before the verdict), and stays open for the clue.
   */
  const partnerFold = $derived(!!partner && partner.stage !== 'pick' && !steal);
  const handGiven = $derived.by(() => {
    if (!partnerFold || !partner) return false;
    const two = [partner.pickerId, partner.partnerId];
    const ids = Object.keys(marks);
    return ids.some((id) => !two.includes(id)) || (!partnerJudged && ids.length > 0);
  });
  /** This play of the partner clue (a tile played again is another). */
  const partnerPlay = $derived(partner ? `${partner.clue}:${partner.at ?? 0}` : null);
  /** The play of a partner clue whose Amount row was opened. */
  let otherFor = $state<string | null>(null);
  const otherPoints = $derived(!!partnerPlay && otherFor === partnerPlay);
  $effect(() => {
    if (partnerFold && (selected.length || handGiven)) untrack(() => (otherFor = partnerPlay));
  });
  /** The Amount row is open: on the board once a player is picked (or ± Adjust score), in a partner clue as above. */
  const showAward = $derived(
    scoring &&
      (session.phase === 'board'
        ? !!selected.length || adjust
        : partnerFold
          ? otherPoints || !!selected.length || handGiven
          : session.phase === 'tiebreaker'
            ? tbPoints
            : true),
  );
  /** The folded Amount row's button: ± Adjust score, a partner clue's ± Other points…, the tiebreaker's ± Also give points…. */
  const amountFold = $derived(partnerFold ? '± Other points…' : session.phase === 'tiebreaker' ? '± Also give points…' : '± Adjust score');
  // (A box taken away with the keys in it says no blur.)
  $effect(() => {
    if (!showAward) amountKeys = false;
  });
  /**
   * What went to phones, for the status row: "🤫 card 1 sent to Bob" (card “Clue tip” for a named one), "🤫 2 cards
   * sent" (who, never what).
   */
  const sentNote = $derived.by(() => {
    if (!partner?.sent?.length || !info) return '';
    const out = cardSlides(info.clue).flatMap((c, i) => (partner.sent!.some((x) => x.card === c.id) ? [{ c, n: i + 1 }] : []));
    if (out.length !== 1) return out.length ? `🤫 ${out.length} cards sent` : '';
    const who = sentTo(session, partner, out[0].c.id).map((t) => toName(session, t));
    return `🤫 ${clueCardWords(out[0].c, out[0].n - 1)} sent to ${who.join(', ')}`;
  });
  /** What a partner clue's shares are of: the Amount box (the tile's value, unless the host changed it). */
  const partnerValue = $derived(typeof amount === 'number' && Number.isFinite(amount) ? Math.abs(amount) : (info?.value ?? 0));
  /**
   * A quick ✔ (`got`) or ✘ on a partner clue's player: their part's share, signed ("+$400", "−$200", "$0"); null for
   * anyone else (and on any other clue).
   */
  function quickShare(id: string, got: boolean): string | null {
    if (!partner || !info) return null;
    const p = partnerShares(partnerValue, partnerRules(info.clue), partner, got).find((x) => x.id === id)?.points;
    return p === undefined ? null : `${p > 0 ? '+' : ''}${formatPoints(p, sym)}`;
  }
  /** ✔ / ✘ pressed: that button is off now, so the focus goes on to the main button (not lost to the page). */
  function judged(): void {
    void tick().then(() => {
      const a = document.activeElement;
      if (!a || a === document.body || (a as HTMLButtonElement).disabled) focusMain();
    });
  }

  /**
   * The quick ✔/✘ buttons: clue phase only (not on a wheel/dice tile with nothing to judge), and during a Daily Double
   * only for the player who found it.
   */
  const quickFor = (id: string) =>
    game.settings.deductOnWrong &&
    session.phase === 'clue' &&
    !!info &&
    !toolOnly &&
    (session.dd?.stage !== 'question' || session.dd.playerId === id) &&
    // A partner clue's question: only its two (each with their share); in a steal, everyone else (the tile's value).
    (!partner || (partner.stage !== 'pick' && (steal ? !steal.out.includes(id) : quickShare(id, true) !== null)));
  /** On the board and through a clue the chips keep one width (the mark's place, and ✔ / ✘'s, kept where unused). */
  const chipSlots = $derived(session.phase === 'board' || (session.phase === 'clue' && !!info));
  /** The round's largest clue value (0 outside a board round). */
  const topValue = $derived(isBoard(round) ? Math.max(0, ...round.categories.flatMap((c) => c.clues.map((cl, row) => clueValue(round, row, cl)))) : 0);
  /**
   * On the board and in a clue each chip keeps the room its mark and its score can take there, so a ✔ / ✘ never widens
   * it (and the row never wraps anew, shrinking the stage). The mark's: the widest a clue of this round gives
   * ("✘ −$1,000"), in ch, one more for the ✘ and the minus (wider than a digit in some fonts). The score's: as wide as it
   * gets the round's largest value away from the score before this clue's marks (so a mark never changes it), with a
   * minus. (A Daily Double's wager can be more: that one may grow.)
   */
  const markCh = $derived(Math.max(7, `✘ −${formatPoints(topValue, sym)}`.length + 1));
  const scoreRoom = (n: number) => (chipSlots && topValue ? `max(70px, ${`−${formatPoints(Math.abs(n) + topValue, sym)}`.length}ch + 24px)` : undefined);

  // ---------- The NEXT cell: one main button ----------
  /**
   * Buzzer mode: the buzzers are closed, nobody answering or picked. (Not while a wheel or dice tile's own tool is up:
   * they're put away until its question shows.)
   */
  const buzzClosed = $derived(buzzing && buzz?.phase === 'closed' && !selected.length);
  /**
   * Someone got the open clue right (the buzzers closed on it, or a ✔ / ＋ Award on it, after a reload too): the answer
   * comes next (🔔 Open the buzzers in the buzzers' row opens them again for the rest).
   */
  const gotIt = $derived(session.phase === 'clue' && (!!buzz?.done || Object.values(marks).some((m) => m.right)));
  /** Buzzer mode: every player has missed this clue (only ↺ Reset lets them buzz again): the answer comes next. */
  const allMissed = $derived(buzzing && session.players.length > 0 && session.players.every((p) => buzz?.lockedOut.includes(p.id)));
  /** The answer is on screen: the buzzers stay closed (🙈 Hide answer lets them open again). */
  const answerUp = $derived(session.phase === 'clue' && session.revealed);
  /**
   * The blue button's step (goon.ts), as the main button: its words and key, its tooltip (what it puts on screen, its
   * keys, how to go on without asking, and what's left first). A click goes through the check.
   */
  const blue = $derived.by((): NextAction | null => {
    const st = goon?.step;
    if (!st) return null;
    const keys = st.key ? `N${st.enterIsNext ? ' or Enter' : ''}` : 'Click it (N says so)';
    const title = st.busy ?? [st.verb.title, keys, mayAsk(st) ? CHECK.shiftClick : '', goon?.first ? `first: ${goon.first}` : ''].filter(Boolean).join(' · ');
    // (◀ Previous turn beside Next turn ▶: another flow step, quiet, never asking.)
    const also = st.also?.map((a): NextAction => ({ label: a.verb.label, ...(a.verb.key ? { key: a.verb.key } : {}), ...(a.verb.title ? { title: a.verb.title } : {}), run: a.run }));
    return { label: st.verb.label, ...(st.key ? { key: st.key } : {}), title, disabled: !!st.busy, ...(st.flow ? { flow: st.flow } : {}), ...(also?.length ? { also } : {}), run: () => goon?.main('main') };
  });
  const next = $derived(blue);
  /**
   * The blue button's room while a clue's flow row has its places (and the tiebreaker's): as wide as the widest step it
   * takes there (goon.flowSteps), so as it goes from one to the next the row beside it keeps its places and its words
   * (nothing moves under the pointer).
   */
  const mainRoom = $derived.by((): string[] => {
    const tb = session.phase === 'tiebreaker';
    if (!tb && !(session.phase === 'clue' && info && !setup && !ddWager)) return [];
    return flowSteps(tb, !!slidePos);
  });

  // ---------- The stage's menu: what the panel's own rows add ----------
  /** ± Adjust score / ± Other points…: the Amount row, opened, the keys in it. */
  function openAmount(): void {
    if (partnerFold) otherFor = partnerPlay;
    else if (session.phase === 'tiebreaker') tbPoints = true;
    else adjust = true;
    void tick().then(() => amountBox?.focus());
  }
  // The intro's steps, ↩ Put back (keep tile) as it is here (greyed once points were given), the Amount row folded, and the
  // last tile closed to put back.
  offerMenu('flow', () => {
    const out: StageItem[] = [];
    if (session.intro) out.push({ id: 'skipintro', label: VERBS.skipIntro.label, onclick: onskipintro });
    if (session.phase === 'clue' && info)
      out.push({
        id: 'putback',
        label: VERBS.putBack.label,
        disabled: cancelBlocked,
        ...(cancelBlocked ? { hint: 'Points were given for this clue: undo them first, or use ▦ Done ▶ board' } : {}),
        onclick: oncancelclue,
      });
    if (scoring && !showAward) out.push({ label: amountFold, onclick: openAmount });
    if (session.phase === 'board' && !session.intro && lastClosedRef && session.lastClosed) {
      const id = session.lastClosed;
      out.push({ label: `↶ Reopen ${clueName(game, lastClosedRef)}`, onclick: () => onreopen(id) });
    }
    return out;
  });
  $effect(() => {
    boxMenu = slots.menu;
  });

  /**
   * The open clue's ✔ / ✘ for one player, first in their menu: as their chip's (their share in a partner clue, a steal's
   * words), whether or not the chips show quick buttons (a menu item is no slip of the mouse); greyed for one the clue
   * isn't theirs to judge, or the verdict they already have.
   */
  function verdictsFor(id: string): PlayerVerb[] {
    if (session.phase !== 'clue' || !info || toolOnly || session.dd?.stage === 'splash' || partner?.stage === 'pick') return [];
    const p = session.players.find((x) => x.id === id);
    if (!p) return [];
    const ddFor = session.dd?.stage === 'question' ? session.dd.playerId : undefined;
    const notTheirs =
      ddFor && ddFor !== id
        ? `Only ${session.players.find((x) => x.id === ddFor)?.name ?? '?'} plays this Daily Double`
        : steal?.out.includes(id)
          ? `${p.name} already had their go at it`
          : partner && !steal && quickShare(id, true) === null
            ? `${p.name} isn’t in this partner clue`
            : '';
    const gets = quickShare(id, true) ?? (ddHidden ? '+ the wager' : `+${formatPoints(quickValue, sym)}`);
    const loses = quickShare(id, false) ?? (ddHidden ? '− the wager' : `−${formatPoints(quickValue, sym)}`);
    // (Enter and Shift+Enter do these for the one selected, at the clue's value: a partner clue's Enter judges the pair.)
    const enter = selected.length === 1 && selected[0] === id && (!partner || !!steal) && (amount ?? quickValue) === quickValue;
    return verdictVerbs(p.name, {
      kind: partner && !steal ? 'partner' : steal ? 'steal' : 'clue',
      gets: notTheirs ? null : gets,
      loses: notTheirs ? null : loses,
      ...(notTheirs ? { why: notTheirs } : {}),
      marked: marks[id]?.right,
      enter,
      right: () => onright(id),
      wrong: () => onwrong(id),
    }) as PlayerVerb[];
  }
  $effect(() => {
    slots.verbs.flow = [verdictsFor];
    playerVerbs = slots.playerVerbs;
  });
</script>

<div
  class="panel"
  role="region"
  aria-label="Host controls"
  class:dual
  class:side
  class:final={session.phase === 'final' && !side}
  class:partnerclue={!!partner && !side}
  class:held
  class:keepchips={held && (session.phase === 'end' || session.phase === 'tiebreaker')}
  class:ddhold={ddHold}
  class:quiettools={quietTools}
  bind:offsetHeight={panelH}
  style:height={ddHold ? `${boardH}px` : undefined}
  onpointerdowncapture={(e) => goon?.check && e.target instanceof Element && !e.target.closest('[data-goon], .cover-toggle') && goon.away()}
>
  <!-- What's going on, read out to screen readers as it changes (buttons and hints left out). Its chips on the right. -->
  <div class="status row" use:announceChanges bind:this={statusEl}>
    {#if clicknote}
      <!-- Over the line's start, up to its chips and buttons, so nothing in the line moves and the one-window stage keeps
           its size. (Read out by Play when it's said.) -->
      <span class="clicknote" data-click-note data-quiet style:width={noteW ? `${noteW}px` : undefined} title={clicknote.text}
        ><span class="nt">{clicknote.text}</span>{#if clicknote.undo}<button class="small ghost" onclick={clicknote.undo} title="Takes it back">↶ Undo</button>{/if}</span
      >
    {/if}
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
        <span class="muted">Pick a tile on the board. <span class="hint">(arrows + Enter)</span></span>
      {/if}
      {#if !session.intro && lastClosedRef && session.lastClosed}
        {@const id = session.lastClosed}
        <button class="small ghost" onclick={() => reopenPicked(id)} title="Put the last tile you closed back on the board">
          ↶ Reopen {clueName(game, lastClosedRef)}
        </button>
      {/if}
      {#if !session.intro && used.length}
        <!-- A menu, not a list box: on a closed list box, ↓ (to look through it) would put a tile back at once. -->
        <button
          class="small ghost"
          aria-haspopup="menu"
          title="Put a used tile back on the board (or right-click it on the board)"
          onclick={(e) => dropMenu(e, [{ heading: 'Reopen a tile (back on the board)' }, ...used.map((t) => ({ label: clueName(game, t.ref), onclick: () => reopenPicked(t.id) }))])}
        >
          ↶ Reopen a tile… ▾
        </button>
      {/if}
    {:else if session.phase === 'clue' && info}
      <b>{categoryLabel(info.category)}</b>
      <span class="val">{formatPoints(info.value, sym)}</span>
      {#if session.dd?.stage === 'question'}
        {@const dd = session.dd}
        <span class="ddtag">DD {ddHidden ? '📱' : formatPoints(dd.wager ?? 0, sym)}</span>
        <button
          class="ghost small"
          onclick={() => (dd.shown = !dd.shown)}
          title={dual
            ? "Viewers don't see the wager until you show it"
            : ddHidden
              ? 'The wager their phone sent stays hidden here and on the slide until you show it'
              : 'Puts the wager on the slide (viewers can see this window anyway)'}
        >
          {dd.shown ? 'Hide wager' : 'Show wager'}
        </button>
      {/if}
      {#if partner}
        {@const named = (id: string | undefined) => session.players.find((p) => p.id === id)?.name}
        <span class="ddtag partnertag" data-partner-tag
          >🤝 {named(partner.pickerId) ?? '?'}{partner.partnerId
            ? partner.partnerId === partner.pickerId
              ? partner.member
                ? ` · ${partner.member.name}`
                : partner.stage === 'pick' && teams
                  ? ' · its own team'
                  : ' · Solo'
              : ` + ${named(partner.partnerId) ?? '?'}`
            : ''}</span
        >
      {/if}
      {#if slidePos && !session.revealed}<span class="slidepos" data-slidepos>Slide {slidePos.at} of {slidePos.of}</span>{/if}
      <span class="muted">·</span>
      <!-- (Cut short on a narrow window, never wrapping the line: its tooltip has it whole.) -->
      <span class="say" class:muted={!session.revealed || toolOnly} class:revealed={session.revealed && !toolOnly} title={clueSay}>{clueSay}</span>
      {#if info.clue.hostNotes && !dual}<span class="notes" title="Host notes (viewers can see them in this window): {info.clue.hostNotes}">📝 {info.clue.hostNotes}</span>{/if}
    {:else if session.phase === 'final'}
      <b>{finalRound ? finalName(finalRound) : 'Final'}</b>
      {#if session.intro?.stage === 'title'}
        <!-- Its title card is up: viewers don't see the category yet. -->
        <span class="muted">Title card <span class="hint">· click the screen (or N) to go on</span></span>
      {:else}
        <!-- (Cut short on a narrow window, with the Final's own 🤫 cards' ⚠ chip: its tooltip has it whole.) -->
        <span class="muted say" title={finalStepText[session.finalStep ?? 'wagers']}>{finalStepText[session.finalStep ?? 'wagers']}</span>
      {/if}
      <!-- (Once its answer is up: the notes may give it away while the players are still writing theirs.) -->
      {#if finalRound?.hostNotes?.trim() && !dual && !session.intro && (session.finalStep === 'answer' || session.finalStep === 'reveal')}<span class="notes" title="Host notes (viewers can see them in this window): {finalRound.hostNotes}">📝 {finalRound.hostNotes}</span>{/if}
    {:else if (session.phase === 'rpg' || session.phase === 'boardgame') && session.intro?.stage === 'title'}
      <b>{round?.name}</b>
      <span class="muted">Title card <span class="hint">· click the screen (or N) to go on</span></span>
    {:else if session.phase === 'rpg'}
      <b>{round?.name}</b>
      <span class="muted hint">Move with the arrows or the pad (numpad / Alt+arrows) · click objects on the stage · drag avatars · drag a box to select several</span>
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
        >{slidePos && slidePos.at < slidePos.of ? 'N (or a click on the stage) shows the next slide' : 'The last slide: N goes on (or two clicks on the stage)'} · Shift+N the one before</span
      >
      {#if round?.mode === 'slides' && round.hostNotes?.trim() && !dual}<span class="notes" title="Host notes (viewers can see them in this window): {round.hostNotes}">📝 {round.hostNotes}</span>{/if}
    {:else if session.phase === 'tiebreaker'}
      <b>Tiebreaker</b>
      {#if slidePos && !answerShowing(session)}<span class="slidepos" data-slidepos>Slide {slidePos.at} of {slidePos.of}</span>{/if}
      <!-- (Who won, by the 🏆 row, then back to the results; points given there may settle it too.) -->
      {@const tbSay = tiebreakLine(session)}
      <span class="muted say" title={tbSay}>{tbSay}</span>
      {#if game.tiebreaker?.hostNotes?.trim() && !dual}<span class="notes" title="Host notes (viewers can see them in this window): {game.tiebreaker.hostNotes}">📝 {game.tiebreaker.hostNotes}</span>{/if}
    {:else}
      <!-- (Who won and that the show is over, or the tie to settle; cut short on a narrow window, whole in its tooltip.) -->
      {@const said = endLine(session)}
      <b>Game over</b>
      <span class="muted say" title={said}>{said}</span>
      <span class="muted hint">· click a score to fix it</span>
    {/if}
    {#if viewersSee.length}
      <!-- One window: the boxes open say viewers can read them (a card's name, never what's on it; the wager as it's
           typed): one chip, always in view, its whole sentence in its tooltip and for screen readers. -->
      <span class="viewers" data-viewers data-quiet title={viewersSee.join(' ')}
        ><span aria-hidden="true">⚠ Viewers see this</span><span class="sr-only">{viewersSee.join(' ')}</span></span
      >
    {/if}
    {#if app.live.cover}<span class="covered">⏸ Viewers see the cover</span>{/if}
    {#if app.playUnstored && !app.test}
      <span class="unsaved" title="Storage is full or blocked: the scores aren't being saved, so closing or reloading this window loses them">⚠ Not saving</span>
    {/if}
    {#if pickerPending}<span class="pending">Picker: press 1–{Math.min(9, session.players.length)}</span>{/if}
    <span class="spacer"></span>
    {@render phoneChip?.()}
    <TimerControls defaultSeconds={timerDefault} bind:custom={timerSeconds} onstart={ontimerstart} />
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
  <MediaControls {dual} reserve={roomForMedia} />

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
              <span class="key" class:gone={amountKeys}>{i + 1}</span>
              <span class="who" dir="auto" title={p.name}>{p.name}</span>{@render away(p.id, p.name)}
            </button>
          {:else}
            <span class="sel name"><span class="who" dir="auto" title={p.name}>{p.name}</span>{@render away(p.id, p.name)}</span>
          {/if}
          {#if editingScore === p.id}
            <!-- svelte-ignore a11y_autofocus -->
            <input
              class="score-edit"
              type="text"
              inputmode="text"
              autocomplete="off"
              spellcheck="false"
              autofocus
              value={score(session, p.id)}
              onfocus={(e) => e.currentTarget.select()}
              onkeydown={(e) => {
                if (e.key === 'Enter') commitScore(p.id, e.currentTarget.value);
                // Cancel: stop editing first, so the blur that follows doesn't commit the typed value.
                if (e.key === 'Escape') editingScore = null;
              }}
              onblur={(e) => {
                if (editingScore !== p.id) return;
                commitScore(p.id, e.currentTarget.value);
                // (Clicked away from something that isn't a number: commitScore said so, and the box closes rather than
                // staying open, unfocused, over the score.)
                if (editingScore === p.id) editingScore = null;
              }}
            />
          {:else}
            <button class="score ghost" onclick={() => (editingScore = p.id)} title="Click to set this score" style:min-width={scoreRoom(score(session, p.id) - (marks[p.id]?.delta ?? 0))}>
              {formatPoints(score(session, p.id), sym)}
            </button>
          {/if}
          <!-- On the board and during a clue, the mark's place is kept (empty until they're marked), and ✔ / ✘'s where they
               aren't offered (the board, a wheel tile, another player's Daily Double): the chips keep one width, so
               opening a clue never wraps the row and shrinks the stage, and ✔ / ✘ never move under the host's cursor. -->
          {#if chipSlots}
            {@const m = marks[p.id]}
            <span class="mark" class:right={m?.right} class:wrong={m && !m.right} class:empty={!m} style:min-width="{markCh}ch">
              {#if m}{m.right ? '✔' : '✘'}{m.delta ? ` ${m.delta > 0 ? '+' : ''}${formatPoints(m.delta, sym)}` : ''}{/if}
            </span>
          {/if}
          {#if quickFor(p.id)}
            <!-- Pressed once on this clue, the same one is off (＋ Award / − Deduct still give or take more on purpose). -->
            {@const was = marks[p.id]?.right}
            <!-- (A partner clue: each of the two's own share, a ✘ often 0 for the partner.) -->
            {@const gets = quickShare(p.id, true) ?? (ddHidden ? '+ the wager' : `+${formatPoints(quickValue, sym)}`)}
            {@const loses = quickShare(p.id, false) ?? (ddHidden ? '− the wager' : `−${formatPoints(quickValue, sym)}`)}
            <button
              class="small quick right"
              onclick={() => (onright(p.id), judged())}
              disabled={was === true}
              aria-label="Right: {p.name} {gets}"
              title={was === true
                ? `${p.name} is marked right on this clue (＋ Award gives more)`
                : partner && !steal
                  ? `Got it: ${p.name} only, ${gets} (their share)`
                  : steal
                    ? `Stole it: ${p.name} ${gets}`
                    : `Right: ${p.name} ${gets}`}
              >✔</button
            >
            <button
              class="small quick wrong"
              onclick={() => (onwrong(p.id), judged())}
              disabled={was === false}
              aria-label="Wrong: {p.name} {loses}"
              title={was === false
                ? `${p.name} is marked wrong on this clue (− Deduct takes more)`
                : partner && !steal
                  ? `Missed: ${p.name} only, ${loses} (their share)`
                  : `Wrong: ${p.name} ${loses}`}
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

  <!-- ↩ Put back (keep tile): at the far left of a clue's flow row (the row level with the blue button), quiet, the row's
       width away from ▦ Done ▶ board at its other end. As the row runs out of room its words go, "(keep tile)" first,
       then "Put back" (still named in full): see .pbslot. -->
  {#snippet putBack()}
    {@const keyed = setup && !!partner}
    <span class="pbslot" class:keyed>
      <button
        class="ghost putback"
        data-flow="putback"
        onclick={oncancelclue}
        disabled={cancelBlocked}
        title={cancelBlocked
          ? 'Points were given for this clue: undo them first, or use ▦ Done ▶ board'
          : setup
            ? 'Shift+Esc (or Esc): the question never showed, so the tile stays on the board'
            : VERBS.putBack.title}
        >{putBackWords[0]}<span class="w1">{putBackWords[1]}</span><span class="w2">{putBackWords[2]}</span>{#if keyed}{' '}<kbd aria-hidden="true">{VERBS.putBack.key}</kbd>{/if}</button
      >
    </span>
  {/snippet}

  <!-- The flow row's other places, at its right end beside the blue button, each kept while it's unused, so nothing moves
       as the clue goes on: ◀ Slide (with more than one question slide), 👁 Reveal answer while the blue button is still a
       slide, then the end place: ▦ Done ▶ board, a quiet skip while the blue button reveals (it asks first as the blue
       one would: goon.flowDone), and 🙈 Hide answer there once the answer is up (the tiebreaker's: 🏁 Back to results).
       The blue button's own step is never here. As the row runs out of room their words go (see .slots): their signs,
       still named in full. -->
  {#snippet flowEnd()}
    {#if (session.phase === 'clue' && info && !setup) || session.phase === 'tiebreaker'}
      {@const tb = session.phase === 'tiebreaker'}
      {@const up = tb ? answerShowing(session) : session.revealed}
      <span class="slots" class:paged={!!slidePos} data-flow-slots>
        {#if slidePos}
          {#if !up}
            <button class="ghost back-slide" data-flow="pager" onclick={() => onslide(-1)} disabled={slidePos.at <= 1} title={VERBS.prevSlide.title}>{@render iconWord(VERBS.prevSlide.label)}</button>
          {:else}
            {@render kept(VERBS.prevSlide.label)}
          {/if}
          {#if !up && !toolOnly && !toolFirst && next?.flow !== 'reveal'}
            <button class="ghost" data-flow="reveal" onclick={onreveal} title={VERBS.reveal.title}>{@render iconWord(VERBS.reveal.label)}</button>
          {:else}
            {@render kept(VERBS.reveal.label)}
          {/if}
        {/if}
        <span class="endcell">
          <!-- (Its room: the wider of its two, so what's left of it never moves.) -->
          <span class="sizer" aria-hidden="true" inert>
            <button class="ghost" tabindex="-1">{@render iconWord(tb ? FLOW.backToResults.label : VERBS.done.label)}</button>
            <button class="ghost" tabindex="-1">{@render iconWord(VERBS.hide.label)}</button>
          </span>
          {#if up && !toolOnly}
            <button class="ghost" data-flow="reveal" onclick={onreveal} title={VERBS.hide.title}>{@render iconWord(VERBS.hide.label)}</button>
          {:else if tb}
            <!-- (A skip, while the blue button reveals: it asks first while nobody has won it, as the blue one would.) -->
            <button class="ghost done-board" data-flow="done" onclick={() => (goon ? goon.flowDone() : ontiebreakerdone())}>{@render iconWord(FLOW.backToResults.label)}</button>
          {:else if !(toolOnly && app.live.overlay) && next?.flow !== 'done'}
            <!-- (A wheel/dice tile with nothing to ask has one way out: the blue ▦ Done ▶ board.) -->
            <button class="ghost done-board" data-flow="done" onclick={() => (goon ? goon.flowDone() : onback())} title={VERBS.done.title}>{@render iconWord(VERBS.done.label)}</button>
          {/if}
        </span>
      </span>
    {:else if session.phase === 'slides' && slidePos}
      <!-- (Beside the blue Next slide ▶: the slides' pager.) -->
      <button class="ghost" data-flow="pager" onclick={() => onslide(-1)} disabled={slidePos.at <= 1} title={VERBS.prevSlide.title}>{VERBS.prevSlide.label}</button>
    {/if}
  {/snippet}

  <!-- An unused place in the flow row: its button, unseen, so the others keep theirs. -->
  {#snippet kept(label: string)}<span class="kept" aria-hidden="true" inert><button class="ghost" tabindex="-1">{@render iconWord(label)}</button></span>{/snippet}

  <!-- A button's sign, then its words (the words go on a narrow window: see .word). -->
  {#snippet iconWord(label: string)}{label.slice(0, label.indexOf(' '))} <span class="word">{label.slice(label.indexOf(' ') + 1)}</span>{/snippet}

  {#snippet away(id: string, name: string)}
    {#if phoneAwaySince(id) !== null}
      <span class="away" data-phone-away={id} role="img" aria-label="{name}’s phone is offline" title="{name}’s phone is offline (the 📱 chip lists the phones)">📵</span>
    {/if}
  {/snippet}

  <!-- What this moment needs (it changes) on the left; the one main button in the NEXT cell on the right. -->
  <!-- The tool on the stage's box (its spin or roll, what it came to, its score cards): on top, but a board game's own
       dice or wheel under its turn box, and in an RPG round beside the pad, with the object's card. -->
  {#snippet toolBox()}<ToolsControls {game} {session} {selected} {dual} onclose={oncloseoverlay} ring={goon?.ring === 'toolslot'} />{/snippet}

  <div class="act">
    <div class="action">
      {#if app.live.overlay && !moverUp && session.phase !== 'rpg'}
        <div class="mode-host tools">{@render toolBox()}</div>
      {/if}

      <!-- 🤫 Cards an action's button offered: each goes only when you press its 📤 Send. Under what offered it (a board
           game's landing box, a space's or an RPG object's card, the tool's box) while that's on screen; here, the rest. -->
      <CardOffers {game} {session} {dual} />

      {#if ddWager}
        {#key info?.clue.id}
          <DDControls {game} {session} {dual} bind:override={wagerLimitsOff} phones={wagerPhones} phoneNote={wagerNote} onshow={() => goon?.main('enter')} oncancel={oncancelclue} lead={putBack} />
        {/key}
      {/if}

      {#if partner && info}
        {#key info.clue.id}
          <PartnerControls
            {game}
            {session}
            clue={info.clue}
            {dual}
            value={partnerValue}
            {marks}
            onspin={onpartnerspin}
            onclock={onpartnerclock}
            ontakeback={onpartnertakeback}
            oncardtakeback={oncardtakeback}
            onmemberspin={onpartnermemberspin}
            onjudge={onpartnerjudge}
            ring={goon?.ring}
            {clockSecs}
            {selected}
            onpick={(id) => (selected = [id])}
          />
        {/key}
      {/if}

      <!-- A tile's own 🤫 cards (any tile but a partner clue, whose 📤 Hand out the cards list has them): sent only by a press. -->
      {#if session.phase === 'clue' && info && !partner && cardSlides(info.clue).length}
        {#key info.clue.id}
          <TileCards {game} {session} clue={info.clue} ontakeback={oncardtakeback} ring={goon?.ring} />
        {/key}
      {/if}

      {#if everyone && info}
        <div class="mode-host">
          <AnswersHost
            {session}
            {dual}
            players={session.players.map((p) => p.id)}
            answers={session.remote?.answers?.id === answerRoundId(session, info.clue.id) ? session.remote.answers.seats : {}}
            clueId={info.clue.id}
            phones={answerPhones}
            open={!session.revealed && !session.remote?.answers?.locked}
            onjudge={onanswerjudge}
            choices={usableChoices(info.clue.choices)}
            note={choicesNote}
            onjudgeall={onanswerjudgeall}
            enterJudges={!selected.length}
            ring={goon?.ring === 'judgeall'}
            worth={formatPoints(Math.abs(amount ?? info.value ?? 0), sym)}
          />
        </div>
      {/if}

      <!-- (Not while its title card is up: the category isn't on screen yet.) -->
      {#if session.phase === 'final' && session.intro?.stage !== 'title'}
        <div class="mode-host">
          <FinalControls
            {game}
            {session}
            {dual}
            armed={finishArmed}
            bind:override={wagerLimitsOff}
            phones={wagerPhones}
            phoneNote={wagerNote}
            typed={finalTyped}
            {answerPhones}
            {answersNote}
            {choicesNote}
            {onshowanswer}
            onstep={onfinalstep}
            {onreveal}
            {onjudge}
            ongo={(by) => goon?.main(by)}
            ring={goon?.ring}
            onback={onbackfromfinal}
            {onslide}
            {oncardtakeback}
          />
        </div>
      {/if}

      {#if session.phase === 'boardgame'}
        <div class="mode-host bgame">
          <BoardHost {game} {session} bind:selected bind:steps={bgSteps} bind:space={bgSpace} {dual} {side} ring={goon?.ring} mover={moverUp ? toolBox : undefined} onhistory={() => onlog('history')} />
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
            again={rpgAgain}
            onclear={onrpgclear}
            bind:mapOpen={rpgMap}
            bind:mapSend={rpgMapSend}
            bind:ask={rpgAsk}
            {dual}
            tools={app.live.overlay ? toolBox : undefined}
            onhistory={() => onlog('history')}
          />
        </div>
      {/if}

      {#if session.phase === 'end'}
        <div class="mode-host"><EndControls {game} {session} {onrolloff} {ontiebreaker} {oncowinners} onback={onbackfromend} {onrematch} /></div>
      {/if}

      <!-- The row's own quiet buttons (the intro's skip, the folded Amount row), after the Amount row's or as a row's start. -->
      {#snippet rowOwn()}
        {#if session.intro}
          <button class="ghost" onclick={onskipintro}>{VERBS.skipIntro.label}</button>
        {/if}
        {#if scoring && !showAward}
          <!-- (The keys go to the Amount box: the points are typed first, then who gets them. In a partner clue ✔ Got it /
               ✘ Missed give them: this is for anyone else.) -->
          <button
            class="ghost"
            aria-expanded="false"
            onclick={openAmount}
            title={partnerFold
              ? 'Give or take points by hand, as on any clue (or press a player’s number): ✔ Got it / ✘ Missed give the pair theirs'
              : session.phase === 'tiebreaker'
                ? 'Give or take points too, as on any clue: the 🏆 row settles the tie without any'
                : "Give or take points (or press a player's number)"}>{amountFold}</button
          >
        {/if}
      {/snippet}
      <!-- The tiebreaker clue: who won it, the tied players only. One click settles the tie with no points, as ＋ Award
           with 0 does (another 🏆 changes it; Ctrl+Z takes it back). With one of them selected (their number), theirs takes
           Enter while the Amount row is folded. -->
      {#if tbTied.length >= 2}
        <div class="row tbwho" data-tb-who role="group" aria-label="Who won the tiebreaker?">
          <span class="muted">Who won?</span>
          {#each tbTied as p (p.id)}
            {@const won = tbWinner?.id === p.id}
            {@const k = session.players.findIndex((x) => x.id === p.id) + 1}
            {@const enter = !showAward && !won && selected.length === 1 && selected[0] === p.id}
            <button
              aria-pressed={won}
              data-player-id={p.id}
              onclick={() => ontiebreakwin(p.id)}
              title={won ? `${p.name} won the tiebreaker (another 🏆 changes it)` : `${p.name} won the tiebreaker: no points, the tie is settled${k <= 9 ? ` (or press ${k}, then Enter)` : ''}`}
              >🏆 {p.name}{#if enter}{' '}<kbd aria-hidden="true">⏎</kbd>{/if}</button
            >
          {/each}
        </div>
      {/if}
      <!-- The flow row, level with the blue button: in a clue ↩ Put back (keep tile) at its far left, the clue's other flow
           steps at its right end (see flowEnd); the Amount row is it while that's open (below). On PARTNER UP! ↩ Put back
           alone (a Daily Double's splash has its own row for it: the ⭐ box's Wager row, its whole room). -->
      {#if !showAward && (session.intro || (session.phase === 'clue' && !ddWager) || session.phase === 'tiebreaker' || session.phase === 'slides' || scoring)}
        <div class="row flow" class:flowrow={session.phase === 'clue' || session.phase === 'tiebreaker'} data-flowrow>
          {#if session.phase === 'clue' && info}{@render putBack()}{/if}
          {@render rowOwn()}
          <span class="spacer"></span>
          {@render flowEnd()}
        </div>
      {/if}
      <!-- Single window, buzzer mode: the buzzers' row (on clues, below) kept on the board too, empty, so the stage viewers
           see keeps one size when a clue opens (and on a Daily Double's question, below). -->
      {#if roomForBuzzers && session.phase === 'board'}
        <div class="row buzzrow" aria-hidden="true"></div>
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
              <span class="tie" role="status">Tie: {tieNames}</span>
              {#if onrolltie}
                <button class:ring={goon?.ring === 'rolltie'} data-box="rolltie" onclick={onrolltie} title="{VERBS.rollForIt.key}: {VERBS.rollForIt.title}"
                  >{VERBS.rollForIt.label} <kbd aria-hidden="true">{VERBS.rollForIt.key}</kbd></button
                >
              {/if}
              <span class="muted hint">or pick one (1–{Math.min(9, session.players.length) || 9})</span>
            {:else if answerUp && !selected.length}
              <span class="muted hint">Answer on screen: the buzzers stay closed (🙈 Hide answer to open them again)</span>
            {:else if allPassed}
              <span class="passed-all" role="status">Everyone passed: reveal the answer</span>
            {:else if buzz?.phase === 'armed' && !selected.length}
              {#if !phonesDown}
                <span class="muted hint">🔔 Buzzers open: the fastest phone answers (1–{Math.min(9, session.players.length) || 9} picks by hand)</span>
              {/if}
            {:else if buzzClosed && gotIt}
              <span class="muted hint">✔ Answered: reveal the answer, or 🔔 open the buzzers again</span>
            {:else if buzzClosed && allMissed}
              <span class="muted hint">Everyone missed: reveal the answer (↺ Reset lets them all buzz again)</span>
            {:else if buzz?.phase === 'lobby' && !selected.length}
              <!-- A wheel or dice tile's own tool is up: its question isn't on screen yet (or it has none: the tool is all). -->
              <span class="muted hint"
                >{toolOnly ? `Nothing to buzz on: this tile is just its ${toolName}` : `The buzzers wait for the question (after the ${toolName})`}</span
              >
            {:else if buzzClosed}
              <span class="muted hint">Buzzers closed (number keys still pick)</span>
            {/if}
            {#if lockedNames}<span class="muted hint">Missed: {lockedNames}</span>{/if}
            {#if passNames && !allPassed}<span class="muted hint passed" title="Passed: {passNames}">Passed: {passNames}</span>{/if}
            {@render buzzExtra?.()}
            <span class="spacer"></span>
            <!-- Closed: they open on U, here (after a right answer, for the rest). -->
            {#if buzzClosed && !answerUp && !tieNames && !allMissed}
              <button class:ring={goon?.ring === 'buzzers'} data-box="buzzers" onclick={openBuzzers} title={VERBS.openBuzzers.title}
                >{VERBS.openBuzzers.label} <kbd aria-hidden="true">U</kbd></button
              >
            {/if}
            <!-- (Not while they're put away for the tile's own tool: nobody can buzz yet. Nor with the answer on screen.) -->
            {#if buzz?.phase !== 'lobby' && !answerUp}
              <button class="ghost small" onclick={() => onopenbuzzers?.(true)} title={VERBS.resetBuzzers.title}>{VERBS.resetBuzzers.label}</button>
            {/if}
          </div>
        {:else if roomForBuzzers && session.phase === 'clue' && own && !own.setup}
          <!-- A Daily Double's or a partner clue's question has no buzzers (its players answer): their row is kept, empty,
               as on the board. -->
          <div class="row buzzrow" aria-hidden="true"></div>
        {/if}
        <div class="row award" class:flowrow={session.phase === 'clue' || session.phase === 'tiebreaker'} data-flowrow>
          {#if session.phase === 'clue' && info}{@render putBack()}{/if}
          <label class="check">
            Amount
            <input
              type="number"
              min="0"
              bind:value={() => (ddHidden ? null : amount), (v) => (amount = wholePoints(v === null ? null : Math.abs(v)))}
              placeholder={ddHidden ? 'hidden' : undefined}
              bind:this={amountBox}
              onfocus={(e) => {
                amountKeys = true;
                amountFrom = e.relatedTarget instanceof HTMLElement && e.relatedTarget.matches('.tile[data-clue]') ? e.relatedTarget : null;
              }}
              onblur={() => ((amountKeys = false), (amountFrom = null))}
              onkeydown={(e) => {
                // Give the keys back to the shortcuts afterwards, so the next "2" selects a player instead of typing.
                // (Its Enter goes no further: given back to a tile, it would open it.)
                if (e.key === 'Enter') {
                  e.preventDefault();
                  // The points typed first (± Adjust score): who gets them next.
                  if (!selected.length && amount && !ddHidden)
                    hint(
                      `Now pick who ${e.shiftKey ? 'loses' : 'gets'} ${e.shiftKey ? '−' : '+'}${formatPoints(Math.abs(amount), sym)} (1–${Math.min(9, session.players.length) || 9}), then ${e.shiftKey ? 'Shift+Enter' : 'Enter'}`,
                    );
                  else onaward(e.shiftKey ? -1 : 1);
                  amountDone(e.currentTarget);
                } else if (e.key === 'Escape') amountDone(e.currentTarget);
              }}
            />
          </label>
          <!-- ＋ Award / − Deduct's text: the name apart (in full in its tooltip, and in the button's name for screen
               readers), so a crowded row cuts it short instead of wrapping: see .named. -->
          {#snippet scoreText(l: { head: string; tail: string }, key: string)}
            {l.head}{#if pickedName}<span class="who" dir="auto" title={pickedName}>{pickedName}</span>{/if}{l.tail}
            <kbd aria-hidden="true">{key}</kbd>
          {/snippet}
          <!-- (Green, never blue: the main button is the panel's one blue.) -->
          <button class="good named" disabled={!canAward} onclick={() => onaward(1)} title={canAward ? 'Enter' : awardWhyNot} aria-label={awardLabel.text}>
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
            <!-- (Just ✕ on a narrow window, so the row stays one line: see the media query. An RPG round's is the RPG box's
                 selection line's Clear selection, for players and objects at once: not two.) -->
            {#if session.phase !== 'rpg'}
              <button class="ghost clear" onclick={() => (selected = [])} title="Clear selection (Esc)" aria-label="Clear selection"
                ><span class="word">Clear selection</span><span class="x" aria-hidden="true">✕</span></button
              >
            {/if}
          {:else if session.phase === 'board'}
            <!-- (It folds the row back: ± Adjust score.) -->
            <button class="ghost" onclick={() => (adjust = false)} title="Fold the Amount row back (± Adjust score opens it)">✕ Close</button>
          {:else if !toolOnly && !buzzing}
            <!-- (In the tiebreaker this row is for points: its 🏆 row settles the tie.) -->
            {@const pickHint =
              session.phase === 'tiebreaker'
                ? `Pick who gets them (1–${Math.min(9, session.players.length) || 9})`
                : `Pick who answered (1–${Math.min(9, session.players.length) || 9}, 0 for everyone)`}
            <span class="muted hint pick-hint" title={pickHint}>{pickHint}</span>
          {/if}
          <span class="spacer"></span>
          {@render rowOwn()}
          {@render flowEnd()}
        </div>
      {/if}
    </div>

    {#if next}
      {@const n = next}
      <div class="next">
        <!-- Its quiet companions first (◀ Previous turn), then the one main button (quiet while the strip asks). With the
             check open over it, it says so to screen readers: the check is what it opened. -->
        {#each n.also ?? [] as a (a.label)}
          <button class="also" data-next-also disabled={a.disabled} onclick={() => a.run()} title={a.title ?? a.key}>
            {a.label}{#if a.key} <kbd aria-hidden="true">{a.key}</kbd>{/if}
          </button>
        {/each}
        <span class="mainroom">
          <!-- (Its room in a clue: the widest of its steps there, so the flow row beside it never moves: see mainRoom.) -->
          {#if mainRoom.length}
            <span class="sizer" aria-hidden="true" inert>
              {#each mainRoom as l (l)}<button tabindex="-1">{l} <kbd aria-hidden="true">N</kbd></button>{/each}
            </span>
          {/if}
          <button
            class:primary={!ask}
            class:ring={goon?.ring === 'main'}
            data-next
            data-flow={n.flow}
            disabled={n.disabled}
            aria-expanded={goon?.check ? 'true' : undefined}
            aria-controls={goon?.check ? 'goon-check' : undefined}
            onclick={(e) => clickNext(e, n)}
            title={n.title ?? n.key}
          >
            {n.label}{#if n.key} <kbd aria-hidden="true">{n.key}</kbd>{/if}
          </button>
        </span>
      </div>
    {/if}
  </div>

  <!-- The tools, then the round's navigation (quiet; leaving a round asks), away from the main cell. -->
  <div class="row toolsrow">
    {@render tools?.()}
    <!-- (A Final's title card too: a way back from it without putting its category on stream.) -->
    {#if session.phase === 'board' || session.phase === 'rpg' || session.phase === 'boardgame' || session.phase === 'slides' || (session.phase === 'final' && session.intro?.stage === 'title')}
      <span class="spacer"></span>
      <!-- Fresh per round, so its click guard also covers the second half of a double-click on "Yes". -->
      {#key session.currentRound}
        <RoundNav {game} {session} onprev={onprevround} onnext={onnextround} ongoto={ongotoround} />
      {/key}
    {/if}
  </div>

  {#if ask}
    <!-- Confirmations: one strip across the panel, right above the fixed bar (never squeezed into a row of buttons). In a
         single window it lies over the tools row (and what's above it, if it needs more), so the panel keeps its height
         and the stage viewers see keeps its size for a question only the host sees. -->
    <div class="askslot">
      <div class="confirm" role="alert">
        {#key ask}
          <InlineAsk text={ask.text} ok={ask.ok} cancel={ask.cancel} danger={ask.danger} alt={ask.alt} onalt={ask.onalt} altDanger={ask.altDanger} focusCancel onok={ask.onok} oncancel={ask.oncancel} />
        {/key}
      </div>
    </div>
  {/if}

  <!-- The fixed bar: the same buttons in the same places in every state and round, in groups by what they're for (the
       safety net, the lists, what viewers see, the windows and sound for the stream), 🚪 Exit at the far end. -->
  <div class="fixed" onclickcapture={barGuard}>
    <span class="group g-edit">
      <!-- Right-click either one for the whole history. Their words stay, in the column beside the stage too. -->
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
        title={redoText ? `Redo: ${redoText} (Ctrl+Y or Ctrl+Shift+Z · right-click: history)` : 'Nothing to redo'}>↷ <span class="word">Redo</span></button
      >
    </span>
    <span class="divider" aria-hidden="true"></span>
    <span class="group g-lists">
      <button onclick={() => onlog()} title="L: the history, scores and rolls">📜 <span class="txt">Log</span></button>
      <!-- The game's rules go with its players (Most players). -->
      <button onclick={onplayers} title={teams ? 'Teams' : 'Players'}>👥 <span class="txt">{teams ? 'Teams' : 'Players'}</span></button>
      <button onclick={onrules} title="⚖ Game rules: scoring, most players, timers, the round intro">⚖ <span class="txt">Rules</span></button>
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
      <button onclick={onhide} title="H: hide the controls (in a single window, viewers see only the stage)">🙈 <span class="txt">Hide</span></button>
    </span>
    <span class="divider" aria-hidden="true"></span>
    <!-- What goes to the stream: its sound, the audience window and the scores-only window (a lower third for OBS).
         Closing the audience window blacks out the stream capture, so it asks first. -->
    <span class="group g-windows">
      <button onclick={onsound} title="Test sound, sound output, and how to stream the sound (Discord, OBS)">🔊 <span class="txt">Sound</span></button>
      <button
        onclick={() => (dual ? (askCloseAudience = true) : onaudience())}
        class:on={dual}
        aria-pressed={dual}
        title={dual ? 'The audience window is open: click to close it (A brings it to the front)' : 'A opens or focuses it'}
      >📺 <span class="txt">Audience</span>{dual ? ' ●' : ''}</button>
      <!-- (Its word goes where the bar has no room for it: see .sw.) -->
      <button
        class="sw"
        onclick={onscores}
        class:on={scoresWindow.open}
        aria-label={scoresWindow.open ? 'Close the scores window' : 'Scores window'}
        title={scoresWindow.open
          ? 'The scores window is open: click to close it (Shift+A brings it to the front)'
          : 'A window with only the scores, for OBS: the score plates and the countdown, for a lower third (Shift+A)'}
        >▭ <span class="txt">Scores window</span>{scoresWindow.open ? ' ●' : ''}</button
      >
    </span>
    <span class="spacer"></span>
    <!-- ❔ Help beside 🚪 Exit, at the far end. -->
    <span class="group g-exit">
      <!-- (A dot while what moved in this version hasn't been shown on this computer: the keys window opens on it.) -->
      {#if onkeys}<button
          class="ghost help"
          onclick={onkeys}
          title={`Every key for this round (?), 📖 How to host and 💡 the tips${movedNew('game') ? ' · 🆕 What moved in this version' : ''}`}
          >❔ <span class="txt">Help</span>{#if movedNew('game')}<span class="newdot" data-moved-dot aria-hidden="true"></span>{/if}</button
        >{/if}
      <button class="ghost exit" onclick={() => (askExit = true)}>🚪 Exit</button>
    </span>
  </div>
  {#if goon?.check && !goon.check.held}
    {@const g = goon}
    <GoOnCheck check={g.check!} {side} lit={g.lit} flash={g.flash} onquick={g.quick} onanyway={g.anyway} onstep={g.takeStep} onnotyet={g.notYet} onquiet={g.quiet} onflash={g.flashIt} />
  {/if}
</div>

<style>
  .panel {
    /* (The check before going on is placed in it: GoOnCheck.) */
    position: relative;
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
  /* Single window: an open 🎲 / 🎡 / 🏁 menu, the 📱 phones list or a color box's picker may not cover the stage, so the
     panel grows to make room for it (the stage shrinks, down to its floor) and the bottom rows move to its foot. The
     pop-up stays inside the panel, scrolling if it must (or, on a window too short for even that, goes where there's
     room). */
  .panel:not(.dual):has(:global(:is(.tl .menu, #phone-pop, input[data-picking]))) {
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
  /* The row's buttons are one height (32px, as its rows' min-heights), whatever font draws a sign in them: ＋ falls back
     to a taller font on some computers, and a clue's ＋ Award made the row taller than the board's, shrinking the stage. */
  .act :global(button:not(.small, .tiny)),
  .award input {
    line-height: calc(18 / 14);
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
  /* A clue's flow row (↩ Put back at its far left, its other flow steps at its right end, the Amount row while that's
     open) stays in view at the action part's foot, level with the blue button, as the rows above it scroll. In a
     one-window 🤝 partner clue the box's foot holds that place (✔ Got it, 📤 Send and start): there the row scrolls under
     it (Shift+Esc, Esc and the stage's menu still reach its buttons), as two rows held there would leave the box no room
     on a laptop. */
  .action > .flowrow {
    position: sticky;
    bottom: 0;
    z-index: 1;
    background: var(--panel);
  }
  .panel.partnerclue:not(.dual) > .act > .action:has(:global([data-partner-foot])) > .flowrow {
    position: static;
  }
  /* (What's brought into view in the scrolling part, a score effect's Skip / Confirm as it comes, stops above that row,
     not under it: its 32px and the gap.) */
  .action:has(> .flowrow) {
    scroll-padding-bottom: 40px;
  }
  .panel.partnerclue:not(.dual) > .act > .action:has(:global([data-partner-foot])) {
    scroll-padding-bottom: 0;
  }
  /* ↩ Put back (keep tile)'s place: the room the row has left once ＋ Award and − Deduct have theirs, up to its whole
     label, a gap after it. As that runs out its words go, "(keep tile)" first, then "Put back" (still named in full), so
     it never wraps the row (the one-window stage keeps its size). */
  .pbslot {
    container: pb / inline-size;
    display: flex;
    flex: 100 1 2.9em;
    min-width: 2.9em;
    max-width: 13.5em;
    margin-right: 6px;
  }
  /* (PARTNER UP!'s shows its key, ⇧Esc.) */
  .pbslot.keyed {
    max-width: 16.5em;
  }
  /* A clue with several question slides, from 1240px wide (where the row holds them all in words before a pick): after
     ＋ Award and − Deduct, the right end's places (◀ Slide, 👁 Reveal answer, ▦ Done ▶ board) have the room before
     ↩ Put back's words, and those before "Pick who answered" (each grows a hundred times faster than the next). So a
     player picked (＋ Award Ann +$600 taking more room) takes it from "(keep tile)" and "Put back" first, and ▦ Done ▶
     board keeps its place under the pointer. (Narrower, they share the room as on any clue: see .slots.) */
  @media (min-width: 1240px) {
    .award:has(> .slots.paged) > .named {
      flex-grow: 100000;
    }
    .award > .slots.paged {
      flex-grow: 1000;
    }
    .award:has(> .slots.paged) > .pbslot {
      flex-grow: 10;
    }
  }
  /* (Never wider than its place: in a font wider than these sizes allow for, its words are cut short.) */
  .putback {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  @container pb (width < 8.2em) {
    .pbslot:not(.keyed) .w1 {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }
  @container pb (width < 10.6em) {
    .pbslot.keyed .w1 {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }
  @container pb (width < 13.3em) {
    .pbslot:not(.keyed) .w2 {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }
  @container pb (width < 16.2em) {
    .pbslot.keyed .w2 {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }
  /* The flow row's other places, at its right end: the room left after ↩ Put back's, up to their whole words, which go
     as that runs out (◀ Slide's first), down to their signs (still named in full): never wrapping the row. */
  .slots {
    container: flow / inline-size;
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 6px;
    flex: 100 1 3.6em;
    min-width: 3.6em;
    max-width: 12em;
  }
  .slots.paged {
    flex-basis: 10.8em;
    min-width: 10.8em;
    max-width: 29em;
  }
  @container flow (width < 11.5em) {
    .slots .word {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }
  /* (◀ as its sign, 👁 Reveal answer's place and the end place in words take 24.1em in DejaVu Sans, the widest font
     they're drawn in, with the buttons' padding over 1180px wide; 22.8em under it. ◀ Slide in words takes 26.9em.) */
  @container flow (width < 24.5em) {
    .slots.paged .word {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }
  @container flow (width < 28.5em) {
    .slots.paged .back-slide .word {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }
  /* An unused place: its button, unseen. The end place is as wide as the wider of its two (▦ Done ▶ board, then
     🙈 Hide answer in its place). */
  .kept {
    display: contents;
    visibility: hidden;
  }
  .endcell {
    display: grid;
    justify-items: end;
  }
  .endcell > *,
  .sizer > * {
    grid-area: 1 / 1;
  }
  .sizer {
    display: grid;
    visibility: hidden;
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
  /* The blue button over its room (the widest of its steps in a clue: see mainRoom), as wide as it. */
  .mainroom {
    display: grid;
  }
  .mainroom > * {
    grid-area: 1 / 1;
  }
  .mainroom > [data-next] {
    justify-self: stretch;
  }
  /* The keycap look for every key hint in the panel, its boxes' too (as weak as a bare kbd rule, so a box's own kbd
     rule still wins). */
  :where(.panel) :global(kbd) {
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
  .panel > :is(.status, .toolsrow, .askslot, .fixed) {
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
  /* Single window: the strip takes no room of its own (its slot is no height, and the panel's gap before it is taken
     back), lying over the tools row from its foot up, so the panel, and the stage above it, keep their size. */
  .panel:not(.dual) > .askslot {
    position: relative;
    height: 0;
    margin-top: -10px;
  }
  .panel:not(.dual) > .askslot > .confirm {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 2;
    background: var(--panel);
  }
  .toolsrow:empty {
    display: none;
  }
  /* Under the stage, with 🔇 Stop sounds, cards out or a 🎭 deal's state in the tools row (they come and go on the
     board), ◀ Previous round as ◀ (still read out by name, its tooltip says it): the board's tools and the round's ◀ /
     picker / ▶ stay on one line, as in a clue, so the stage keeps one size. (Up to 1520px wide: on a wider window it
     fits in full.) Up to 1440px wide, and beside the stage, it's ◀ anyway (with 📊 Scoreboard and a long Final's name
     the row would wrap). */
  .side > .toolsrow :global(.rn .word) {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  @media (max-width: 1440px) {
    .panel:not(.side) > .toolsrow :global(.rn .word) {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }
  @media (max-width: 1520px) {
    .panel:not(.side) > .toolsrow:has(:global(.tl :is(.stop, .cardsout, .dealt))) :global(.rn .word) {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }
  /* In the column: the action part takes the height left and scrolls; the tools and the fixed bar stay at its foot. */
  /* The Final in a single window: the panel keeps one height through its steps (the title card to the reveals), and on
     through the results, a roll-off or the tiebreaker clue, so the stage viewers see doesn't change size; its rows
     scroll in there instead. A board-game round's under the stage too, through its turns (the landing row comes and
     goes). A 🤝 partner clue's too, from PARTNER UP! (the wheel, the question and 📤 Distribute, a steal) to the answer,
     and a wheel or dice tile's (its tool, then its question): the stage changes size only as the tile opens and closes.
     A partner clue's box scrolls, its foot kept in sight (📤 Send and start and ✔ Got it / ✘ Missed; the steal's row);
     a tile's tool keeps its height at the top (an outcome's score buttons in sight), what's under it scrolls. */
  .panel:is(.final, .partnerclue, .held):not(.dual) {
    height: clamp(280px, 44vh, 440px);
  }
  .panel.held:not(.dual) > .act > .action > .tools {
    flex-shrink: 0;
  }
  .panel.partnerclue:not(.dual) :global([data-partner-foot]) {
    position: sticky;
    bottom: 0;
    z-index: 1;
    /* (The box's own green on the panel: what scrolls under it doesn't show through.) */
    background: linear-gradient(rgba(43, 182, 115, 0.1), rgba(43, 182, 115, 0.1)), var(--panel);
  }
  /* Under the stage, when the panel runs out of height (a tall wheel editor, a long Final), the action part scrolls in
     its place: it never spills up over the stage, out of the scrollbar's reach (the row sits at its foot). It keeps one
     row of buttons (＋ Award, the main button) in sight, at 200% zoom on a laptop too: the stage gives way first. */
  .panel:not(.side) > .act {
    flex: 0 1 auto;
    grid-template-rows: minmax(0, 1fr);
    min-height: 32px;
  }
  .panel:not(.side) > .act > .action {
    max-height: 100%;
    overflow: auto;
  }
  .panel:is(.final, .partnerclue, .held):not(.dual) > .toolsrow,
  .panel.ddhold > .toolsrow {
    margin-top: auto;
  }
  /* A situation's box open: the tools row in the ghost look (its words and edges as they are). What's on keeps its
     look (📊 Scoreboard pressed, a deal out, a warning), and under the mouse it's a button as ever. */
  .panel.quiettools > .toolsrow
    :global(:is(.tl > button, .tl > .pop > button, .rn > button):not([aria-pressed='true'], .on, .warn, :hover, :disabled)) {
    background: transparent;
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
  /* The fixed bar as a two-column grid of its groups, 🚪 Exit in the bottom-right cell: ↶ Undo ↷ Redo and the lists,
     then the stream's (🔊 Sound, 📺 Audience, ▭ Scores window) across both, then ⏸ Cover 🙈 Hide and ❔ Help 🚪 Exit. */
  .side > .fixed {
    display: grid;
    /* (The left groups as wide as they need, the right ones the rest: Log, Players and Rules stay on one line.) */
    grid-template-columns: auto minmax(0, 1fr);
    grid-template-areas: 'edit lists' 'windows windows' 'screen exit';
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
  /* A clue with several question slides, up to 1500px wide: Clear selection as ✕ too, so a player picked leaves the flow
     row's right end where it was (see .slots.paged). */
  @media (max-width: 1500px) {
    .panel:not(.side) .award:has(> .slots.paged) .clear .word {
      display: none;
    }
    .panel:not(.side) .award:has(> .slots.paged) .clear .x {
      display: inline;
    }
  }
  /* "Pick who answered" takes only the room the row has left (its keys are in the tooltips and ❔ Help): on a crowded row it's
     cut short (…), or not there, instead of wrapping the row, which would shrink the stage. */
  .award .pick-hint {
    flex: 1 1 0;
    min-width: 0;
    max-width: max-content;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  /* Up to 1100px wide under the stage, a clue with several question slides (◀ Slide on its row): the hint goes, so the
     row stays one line and the stage keeps its size (the flow row's own buttons shrink to their signs by themselves:
     see .slots). */
  @media (max-width: 1100px) {
    .panel:not(.side) .award:has(.back-slide) .pick-hint {
      display: none;
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
      padding-block: 5px;
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
    /* (And the tools row's, never its menus': on the board the tools and the round's ◀ / picker / ▶ stay on one line,
       as in a clue, so the stage keeps one size.) */
    .panel:not(.side) > .toolsrow :global(:is(.tl > button, .tl > .pop > button, .rn > button, .rn > .room)) {
      padding-left: 9px;
      padding-right: 9px;
    }
  }
  /* Under the stage up to 1340px wide, ▭ Scores window as ▭ (still read out by name, its ● when open), first: with its
     word the bar would wrap to two lines there, shrinking the stage. */
  @media (max-width: 1340px) {
    .panel:not(.side) > .fixed .sw .txt {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }
  /* Under the stage up to 1040px wide, ❔ Help as its sign (still read out by name), before the others: its word would
     wrap the bar to two lines (with ▶ Uncover and 📺 Audience ●, up to 1008px), where it fitted on one before. */
  @media (max-width: 1040px) {
    .panel:not(.side) > .fixed .g-exit .txt {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }
  /* Narrower still under the stage (a laptop zoomed in): ↶ ↷ 🔊 📜 👥 ⚖ 🙈 📺 ❔ as their signs only (still read out by
     name, their tooltips say what they do), so the fixed bar stays one line, 🚪 Exit at its right, and the stage keeps
     its height. */
  @media (max-width: 940px) {
    .panel:not(.side) > .fixed :is(.word, .txt) {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }
  /* Beside the stage, a board game's box takes the column's height: its turn part sits at the foot, by the blue button. */
  .side .mode-host.bgame {
    flex: 1 1 0;
    display: flex;
    flex-direction: column;
  }
  /* The player cards (RPG and board games) take the column's width and height: the round's box scrolls instead. */
  .side .mode-host :global(.cards) {
    max-height: none;
  }
  .side .mode-host :global(.cards > *) {
    flex-grow: 1;
  }
  /* Above a round's own box (RPG, board game, Final) or a 🤝 partner clue's, the tools keep their height (a shop's
     "Short by…" answers, the wheel's ✎ Edit wheel) and that box scrolls instead. A tall wheel editor still scrolls in
     here. */
  .tools:has(~ .mode-host),
  .tools:has(~ :global([data-partner-panel])) {
    flex-shrink: 0;
    max-height: 45vh;
  }
  /* (While a roll's or a wheel's box is up, the round's own box under it keeps a few rows in sight too: the column, or
     the act row, scrolls instead of shrinking the round's controls to nothing.) */
  .mode-host.tools ~ .mode-host {
    min-height: min(120px, 25vh);
  }
  /* A short window under the stage (a laptop zoomed in): the moment's own box (✍ answers with their ✔ / ✘, the Final's
     wagers and reveals, the end, an RPG or board-game round) keeps a few rows in sight. The stage gives way first, then
     the panel scrolls (the fixed bar's keys still work when it's out of sight). Not on a taller window: the stage keeps
     its size there. */
  @media (max-height: 560px) {
    .panel:not(.side) > .act:has(> .action > .mode-host:not(.tools)) {
      min-height: min(150px, 34vh);
    }
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
  .partnertag {
    background: #1f8a57;
    max-width: 260px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
  /* Who passed: on one line in the room left, cut short (…) rather than wrapping the row, which would shrink the stage
     viewers see in one window (its tooltip has them all). */
  .hint.passed {
    flex: 1 1 0;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* Everyone passed: the answer comes next (👁 Reveal answer wears the ring). */
  .passed-all {
    font-weight: 700;
  }
  /* The open clue's words: cut short (…) rather than wrapping the line, which would shrink the stage viewers see (its
     tooltip has them whole). They take the room they need first; the host notes and the spacer get the rest. */
  .say {
    flex: 1000 1 0;
    min-width: 0;
    max-width: max-content;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  /* One line, cut short (the whole note is in its tooltip): a long one doesn't push the row onto more lines, shrinking
     the stage viewers see. (It takes the row's room, not the spacer's.) */
  .notes {
    background: var(--panel-2);
    padding: 2px 8px;
    border-radius: 6px;
    flex: 100 1 0;
    min-width: 8em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* What a click on the stage says: over the status line's start, up to its chips (measured as it shows), the line's own
     words under it, so nothing in the line moves and the one-window stage keeps its size. */
  .status {
    position: relative;
  }
  .clicknote {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    max-width: 100%;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--panel);
    font-weight: 600;
  }
  .clicknote .nt {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .clicknote button {
    flex-shrink: 0;
  }
  /* (A chip, never wrapping: the status line keeps one line.) */
  .viewers {
    color: var(--warn);
    font-size: 12px;
    font-weight: 600;
    padding: 1px 7px;
    border: 1px solid var(--warn);
    border-radius: 999px;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .covered,
  .unsaved {
    color: var(--warn);
    font-weight: 600;
  }
  /* A fixed width (the round's widest mark: see markCh), kept while empty: the chip doesn't grow when its player is
     marked. */
  .mark {
    font-size: 12px;
    font-weight: 700;
    padding: 0 4px;
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
  /* A 🤝 partner clue's panel keeps one height (see .partnerclue), so there it's the action part that gives up height
     first (it scrolls, ✔ Got it / ✘ Missed or the steal's row kept at its foot), down to room for that row and the main
     button: the chips stay whole, quick buttons and all, while there's room. Then they scroll, as above. The same at
     the end and in the tiebreaker (held too), down to one row of buttons: every score in sight to fix, and every
     player to pick the winner from. */
  .panel:is(.partnerclue, .keepchips):not(.dual) > .players {
    flex-shrink: 1;
  }
  .panel:is(.partnerclue, .keepchips):not(.dual) > .act {
    flex-shrink: 1000;
  }
  .panel.partnerclue:not(.dual) > .act {
    min-height: 80px;
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
  /* (Read out as words, not "black star"; a browser without alt text for it keeps the plain star.) On the name's corner,
     taking no room: the chip keeps its width as the pick goes to another player. */
  .p.picker .sel::after {
    content: '★';
    content: '★' / ', picks next';
    position: absolute;
    top: -9px;
    right: -7px;
    font-size: 13px;
    line-height: 1;
    color: var(--warn);
    pointer-events: none;
  }
  .sel {
    position: relative;
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
  /* The keys are in the Amount box: number keys type the points there, not pick (the key's room kept). */
  .key.gone {
    visibility: hidden;
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
  .award input {
    width: 110px;
  }
  /* ＋ Award and − Deduct take the room the row has, up to their whole label: on a crowded row (a long name, a narrow
     window) the name is cut short (…) instead of the row wrapping, which would shrink the stage when a player is picked.
     The amount never is. (Only when not even 12em each is left do they wrap.) They have the room first: ↩ Put back's
     and the flow places' words come after. */
  .award .named {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: 1000 1 12em;
    max-width: max-content;
    overflow: hidden;
  }
  /* (So they get the room first, and what's left goes before the moment's other buttons.) */
  .award > .spacer {
    flex: none;
    margin-left: auto;
  }
  /* ❔ Help's dot: what moved in this version, not shown yet (on its corner, taking no room). */
  .help {
    position: relative;
  }
  .newdot {
    position: absolute;
    top: 3px;
    right: 3px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--accent);
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
