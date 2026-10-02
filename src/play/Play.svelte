<script lang="ts">
  import { modal, takeFocus } from '../lib/modal';
  import { app, toast } from '../lib/app.svelte';
  import { prefs, savePrefs } from '../lib/prefs.svelte';
  import { commit, history, redo as redoStep, step, undo as undoStep } from '../lib/history.svelte';
  import { createFieldTracker, undoKeyOf } from '../lib/undokeys';
  import { blankName, finalName, formatPoints, getClue, isBoard, isBoardGame, isRpg, MAX_PLAYERS, newId, PLAYER_WHEEL, questionSlides, type ClueRef } from '../lib/model';
  import {
    applyScore, awardOpen, backToBoard, backToLastRound, currentFinal, clueName, clueReason, clueScored, currentClueInfo, ddShowQuestion, describeStep,
    finalAdvance, finalBack, finalJudge, finalShow, finalUnjudged, findClueRef, goToRound, introNext, nameList, newSession, openClue, playerName,
    randomizeDailyDoubles, redo, removePlayer, restorePlayer, answerShowing, rosterChange, score, skipIntro, startIntro, toggleUsed, undo,
    blankSlide, toolOnlyClue, stepSlide, finalWagerProblems, finalWagersOk, finalStepFix, startTiebreaker, stepOf, logZero, tiedLeaders, winnerKnown,
    finalSetWager, forViewers, wagerFromPhone,
  } from '../lib/session';
  import { addTime, newLive, overlayDoneAt, startTimer, timerRemaining, toggleTimer, type StageAction, type TimerState } from '../lib/live';
  import {
    buzzArm, buzzClueOpened, buzzDone, buzzIdle, buzzMissed, buzzReset, buzzTake, hostState, newBuzz, phoneStatus, SEAT_NAME_MAX, SETTING_UP, teamsOn, wagerAsk, whoBuzzed,
    type BuzzState,
  } from '../lib/buzz';
  import { clip, type HostState, type WagerAsk } from '../lib/buzzproto';
  import {
    acceptPhone, buzzerBase, buzzerOn, closeRoom, endRoom, inRoom, kept, kickMember, kickSeat, moveMember, onRoomBuzz, onRoomQueue, onRoomWager, rejectPhone, rejoinRoom, remote,
    resendHostState, roomHasWagers, roomLink, sendHostState, startRoom,
  } from '../lib/remote.svelte';
  import { clearRoom, saveRoom, type SavedRoom } from '../lib/persist';
  import { chime } from '../lib/chime';
  import type { RoomBuzz, RoomQueue, RoomWager } from '../lib/roomlink';
  import PhoneRoom from './PhoneRoom.svelte';
  import type { SetBuzzSetting } from './BuzzerOptions.svelte';
  import PhoneChip from './host/PhoneChip.svelte';
  import { openDice, openPlayerWheel, openWheel, quickDice, rollDice, spinWheel, startRollOff, toggleScoreboard, wheelSpentUp } from '../lib/overlay';
  import type { DicePreset } from '../lib/model';
  import { tileDice } from '../lib/tools';
  import { dailyDoublesShort, validate } from '../lib/validate';
  import { nearKey, nextFreeColor } from '../lib/colors';
  import { announce } from '../lib/announce';
  import { STAGE_KEYS } from '../lib/theme';
  import ToolLauncher from './host/ToolLauncher.svelte';
  import KeysHelp from './KeysHelp.svelte';
  import Stage from '../lib/Stage.svelte';
  import PlayerList from '../editor/PlayerList.svelte';
  import GameRules from './GameRules.svelte';
  import SettingsDialog from '../editor/SettingsDialog.svelte';
  import InlineAsk from './host/InlineAsk.svelte';
  import { keptRoster, type RosterRow } from './roster';
  import AudienceView from './AudienceView.svelte';
  import type { NextAction } from './host/slots.svelte';
  import HostPanel from './HostPanel.svelte';
  import ModeCards from './ModeCards.svelte';
  import ScoreLog, { type LogTab } from './ScoreLog.svelte';
  import HostInfo from './HostInfo.svelte';
  import AudioHelp from './AudioHelp.svelte';
  import SoundWarnings from './host/SoundWarnings.svelte';
  import { playCue } from './cues';
  import { watchSinks } from '../lib/audioout.svelte';
  import { finalNextStep, logged, redoAction, redoFrom, revealStep, setPicker, startStep, undoAction, type Undone } from '../lib/toolset';
  import { groupPops, stopsTimer } from './flow';
  import { nextUndo, stillUndone, type TimelineRow } from '../lib/timeline';
  import {
    addLive, droppedFile, dropEntry, giveEntry, joinPartyNow, moveGroup, objectAt, objectMenu, pickUp, regroupAll, removeObject, rpgNow, sendPlayers, stepParty, toggleMap,
    type AvatarDrop, type RpgAsk, type StagePoint,
  } from './rpg/hostops';
  import { showMenu, type MenuEntry } from '../lib/menustate.svelte';
  import { currentPlayer, ensureBoard, waysNow, waysOn } from '../lib/boardgame';
  import { ensureWorld, override } from '../lib/rpg';
  import { boardNow, moveNow, rollMover, runSpace, sendNow, turnNow } from './boardgame/bgops';
  import { boardEdit, editDelete, editDisconnect, editIdle, setEditing } from './boardgame/boardedit.svelte';
  import { playerMenu } from './playermenu';
  import { playerCards } from './rpg/PlayerCard.svelte';
  import { dragDone, dragGhost, dropHover, itemDrag } from './dragdrop.svelte';
  import Avatar from '../lib/rpg/Avatar.svelte';
  import { shopBuy } from './host/shopops';
  import { SLIDE_H, SLIDE_W } from '../lib/model';
  import type { ActionEvent, Dir8, Game, GameSettings, Player, ScoreEvent } from '../lib/model';
  import type { Pop } from '../lib/live';
  import {
    audience,
    audienceTitle,
    closeAudienceWindow,
    closeScoresWindow,
    openScoresWindow,
    scoresWindow,
    mediaCommand,
    onAudienceKey,
    openAudienceWindow,
    pushGame,
    pushLive,
    pushSession,
  } from '../lib/sync.svelte';
  import { localMedia, openMediaPopup, POPUP_FAILED, remoteMedia } from '../lib/mediactl.svelte';
  import { registerGameFonts } from '../lib/fonts';
  import { inTauri, toggleFullscreen } from '../lib/platform';
  import { onMount, tick, untrack } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';

  let {
    onexit,
    oncancel,
    onresume,
    gameRev = 0,
    gameCopy,
  }: {
    /** Leave the game: `keep`, it stays saved and resumable (Exit asks); else it's discarded. */
    onexit: (keep: boolean) => void;
    /**
     * The pre-game screen's ▶ Resume: play on with the game kept to resume (with the editor's version of the game:
     * `withEdits`), shown as picked here. The pre-game's buzzer room, if one is open, goes with it.
     */
    onresume?: (withEdits: boolean, room: SavedRoom['remote'] | null) => void;
    /** Pre-game "Back to editor" ("Back" to the start screen in a player-only file): nothing was played, so nothing is saved or cleared. */
    oncancel: () => void;
    /** Goes up when the game in play changes (App's watcher). */
    gameRev?: number;
    /** That watcher's plain copy of the game (null until it has started). Never read inside an effect. */
    gameCopy?: () => Game | null;
  } = $props();

  // Play is only mounted when these exist.
  const game = $derived(app.playGame!);
  const session = $derived(app.session!);

  // Resuming into an open clue starts with its Amount (a Daily Double's wager, and who's playing it), as picking it did.
  const ddUp = untrack(() => (session.dd?.stage === 'question' ? session.dd : null));
  /** The open clue, as the buzzers' saved state names it. */
  const clueKey = (c: ClueRef | null | undefined) => (c ? `${c.round}.${c.cat}.${c.row}` : null);
  // Phone buzzers: resuming mid-clue, whoever was answering still is (see the buzzers below).
  const buzzUp = untrack(() => (session.remote?.buzz && session.remote.buzz.clue === clueKey(session.currentClue) ? session.remote.buzz : null));
  let selected = $state<string[]>(ddUp?.playerId ? [ddUp.playerId] : buzzUp?.phase === 'answering' && buzzUp.answering ? [buzzUp.answering] : []);
  let amount = $state<number | null>(ddUp ? (ddUp.wager ?? null) : untrack(() => currentClueInfo(session, game)?.value ?? null));
  let showLog = $state(false);
  /** The 📜 Log's tab (L opens the one used last, 🕘 History to begin with). */
  let logTab = $state<LogTab>('history');
  let showPlayers = $state(false);
  /** ⚖ Game rules mid-game (the host panel's ⚖ Rules): the same rules as before the game, in a window. */
  let showRules = $state(false);
  let hideControls = $state(false);
  let showKeys = $state(false);
  /** The streaming-sound help (Test sound, output device, Discord/OBS steps). */
  let showSound = $state(false);
  /** P was pressed: the next 1–9 sets the picker. */
  let pickerPending = $state(false);
  /** Everyone in the final reveal is judged and N was pressed once: the next N finishes the game. */
  let finishArmed = $state(false);
  /** The host panel's main button (its NEXT cell) now: N on a clue does it. */
  let hostNext = $state<NextAction | null>(null);
  /**
   * Final wagers: "Ignore the limits" is ticked (the default: the host turns the limits on), so a wager over its cap
   * doesn't hold up N / Show question.
   */
  let wagerLimitsOff = $state(true);
  /** Seconds typed in the host panel's timer box: T starts that countdown, like its Start button. */
  let timerSeconds = $state<number | null>(null);
  /** RPG rounds: the object whose card is open in the host panel. */
  let rpgObject = $state<string | null>(null);
  /** RPG rounds: the objects selected on the stage (Shift/Ctrl+click): they drag with the selected players. */
  let rpgSelObjects = $state<string[]>([]);
  /** RPG rounds: the host's full map is open (J). */
  let rpgMap = $state(false);
  /** RPG rounds: a name or text the host panel is asking for (right-clicking the stage asks for text there). */
  let rpgAsk = $state<RpgAsk | null>(null);
  /** Board-game rounds: the steps typed or rolled in the host panel (Enter moves them). */
  let bgSteps = $state<number | null>(null);
  /** RPG rounds: the full map was opened to send these players somewhere (from their menu). */
  let rpgMapSend = $state<{ players: string[]; label: string } | null>(null);
  /** Board-game rounds: the space whose card is open in the host panel (clicked on the stage). */
  let bgSpace = $state<string | null>(null);
  /** The player whose score the host panel is asking for (✎ Set the score… in their menu). */
  let editingScore = $state<string | null>(null);
  /**
   * Single window: the host panel's box while the ⌨ keys or 👥 Players are open. They show in there, never over the stage
   * viewers see (the panel grows for them, as for a tool menu).
   */
  let panelBox = $state<{ top: number; left: number; width: number; height: number } | null>(null);
  /** What each combined Undo took back (from the score log or the action log), so Redo goes back the same way. */
  const undone = $state<Undone[]>([]);

  const sym = $derived(game.settings.currencySymbol);
  const dual = $derived(audience.open);
  /** A window wide for its height (1280×720, 1920×1080), where a tall host panel fits better beside the stage. */
  const wide = new MediaQuery('(min-aspect-ratio: 3/2) and (min-width: 1000px)');
  // RPG and board-game rounds have a tall host panel (the player cards, the round's own controls): on a wide window it
  // goes beside the stage instead of under it, so the stage keeps a good share. (The Final fits under the stage.)
  const side = $derived(wide.current && (session.phase === 'rpg' || session.phase === 'boardgame'));

  // Timeouts that touch the live state (score pops, roll-off pickers) are cancelled if the game is left.
  const pending = new Set<ReturnType<typeof setTimeout>>();
  function later(fn: () => void, ms: number): void {
    const id = setTimeout(() => {
      pending.delete(id);
      fn();
    }, ms);
    pending.add(id);
  }

  // Mirror state to the audience window whenever it changes. Before Start, viewers get a "Starting soon" card and no
  // session: the board would give away the categories the round intro reveals.
  // The game goes as App's plain copy (its watcher), and only while a window is open: copying the whole game on every
  // change made ▶ Play and each rule ticked lag in big games. What changed goes together a moment later, the game
  // first, so a viewer never gets a session or overlay that refers to a part of the game it hasn't got yet.
  const viewers = $derived(audience.open || scoresWindow.open);
  let sentGame: Game | null = null;
  let outSession: Parameters<typeof pushSession>[0] | null = null;
  let outLive: Parameters<typeof pushLive>[0] | null = null;
  let sendQueued = false;
  let left = false;
  $effect(() => () => (left = true));
  function sendSoon(): void {
    if (sendQueued) return;
    sendQueued = true;
    queueMicrotask(() => {
      sendQueued = false;
      if (left || !(audience.open || scoresWindow.open)) return;
      // (Until the watcher has started, a copy of its own.)
      const g = gameCopy?.() ?? $state.snapshot(game);
      if (g !== sentGame) pushGame((sentGame = g));
      if (outSession) pushSession(outSession);
      if (outLive) pushLive(outLive);
      outSession = outLive = null;
    });
  }
  $effect(() => {
    void gameRev;
    // A window opened again gets the game again.
    if (!viewers) sentGame = null;
    else sendSoon();
  });
  $effect(() => {
    // The action log (the host's undo history) and the buzzer room's key stay here: viewers never need them.
    const { actionLog, actionRedo, remote, ...s } = session;
    if (viewers && !app.pregame) {
      // Nor wagers that aren't on screen yet (typed by the host or sent from a phone).
      outSession = forViewers($state.snapshot(s));
      sendSoon();
    }
  });
  $effect(() => {
    const l = $state.snapshot(app.live);
    if (viewers) {
      outLive = app.pregame ? { ...l, pregame: true } : l;
      sendSoon();
    }
  });
  // Score pops belong to the moment: a new clue, the Daily Double splash, another round or Final step clears them. Back to
  // the board from a clue they stay (over the score bar there).
  let popsAt = '';
  let popsPhase = untrack(() => session.phase);
  $effect(() => {
    const c = session.currentClue;
    const at = `${session.phase} ${session.currentRound} ${c ? `${c.round}.${c.cat}.${c.row}` : ''} ${session.dd?.stage ?? ''} ${session.finalStep ?? ''}`;
    untrack(() => {
      const fromClue = popsPhase === 'clue' && session.phase === 'board';
      if (at !== popsAt && !fromClue && app.live.pops.length) app.live.pops = [];
      popsAt = at;
      popsPhase = session.phase;
    });
  });
  // "Press N again to finish" only applies right where it was armed, and not once a judgment is taken back (Ctrl+Z).
  $effect(() => {
    void session.phase;
    void session.finalStep;
    void finalUnjudged(session).length;
    finishArmed = false;
  });
  // H hid the controls, but a list (?, L, 👥 Players, ⚖ Rules) or a wager to type (a Daily Double's, the Final's) needs
  // them: they come back for it, and hide again once it's done (unless the host pressed H meanwhile).
  const needControls = $derived(
    (!dual && (showKeys || showPlayers || showRules || showLog)) ||
      (session.phase === 'clue' && session.dd?.stage === 'splash') ||
      (session.phase === 'final' && session.finalStep === 'wagers' && session.intro?.stage !== 'title'),
  );
  let hideAgain = false;

  /**
   * 🙈 Hide: the controls go. In one window, the first time ever, a short note says how to bring them back (there's no
   * button for it on screen until the mouse moves). Viewers see it for those few seconds too.
   */
  function hideByButton(): void {
    hideAgain = false;
    hideControls = true;
    if (dual) return;
    try {
      if (localStorage.getItem('jb.hideHintSeen')) return;
      localStorage.setItem('jb.hideHintSeen', '1');
    } catch {
      /* not kept: said again next time */
    }
    // (Not a toast: those stay off the stage while it's on air.)
    hideNote = true;
    setTimeout(() => (hideNote = false), 3500);
  }
  /** The note 🙈 Hide shows the first time: "Press H to bring the controls back". */
  let hideNote = $state(false);
  $effect(() => {
    const need = needControls;
    untrack(() => {
      if (need && hideControls) {
        hideControls = false;
        hideAgain = true;
      } else if (!need && hideAgain) {
        hideAgain = false;
        hideControls = true;
      }
    });
  });
  $effect(() => {
    if (dual || !(showKeys || showPlayers || showRules || showLog)) return void (panelBox = null);
    let ro: ResizeObserver | undefined;
    const read = () => {
      const el = document.querySelector<HTMLElement>('.play > .panel');
      if (!el) return;
      if (!ro) (ro = new ResizeObserver(read)).observe(el);
      const r = el.getBoundingClientRect();
      panelBox = { top: r.top, left: r.left, width: r.width, height: r.height };
    };
    // After the panel is back and has grown.
    const raf = requestAnimationFrame(read);
    window.addEventListener('resize', read);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener('resize', read);
    };
  });
  // Undo took the Final back from its question to the wagers: its countdown and think music stop.
  let finalStepWas = untrack(() => session.finalStep);
  $effect(() => {
    const now = session.phase === 'final' ? session.finalStep : undefined;
    untrack(() => {
      if ((finalStepWas === 'question' || finalStepWas === 'answer') && now === 'wagers') {
        app.live.timer = null;
        app.live.sound = null;
      }
      finalStepWas = now;
    });
  });
  // ⏸ Cover: what's going on waits under it (the countdown, a clue's video or sound), and goes on after it.
  let coverHeld: { timer: TimerState | null; media: string[] } | null = null;
  $effect(() => {
    const on = !!app.live.cover;
    untrack(() => {
      if (on && !coverHeld) {
        const t = app.live.timer;
        const running = t && !t.expired && t.startedAt !== null ? t : null;
        if (running) toggleTimer(app.live);
        const media = Object.entries(dual ? remoteMedia : localMedia)
          .filter(([, m]) => !m.paused && m.kind !== 'external' && (dual || (m as { role?: string }).role !== 'mirror'))
          .map(([id]) => id);
        for (const id of media) mediaCommand({ el: id, op: 'pause' });
        coverHeld = { timer: running, media };
      } else if (!on && coverHeld) {
        const held = coverHeld;
        coverHeld = null;
        const t = app.live.timer;
        // The same countdown, still paused (not one started or stopped meanwhile).
        if (held.timer && t === held.timer && t.startedAt === null && !t.expired) toggleTimer(app.live);
        for (const id of held.media) if ((dual ? remoteMedia : localMedia)[id]) mediaCommand({ el: id, op: 'play' });
      }
    });
  });
  // "Ignore the limits" is for the wagers being entered now: the next Final starts with them off again (the default).
  $effect(() => {
    void session.phase;
    wagerLimitsOff = true;
  });
  // An undo back to a step saved before the category and the wagers were one screen: it's the wager screen.
  $effect(() => {
    if (session.phase === 'final' && (session.finalStep as string) === 'category') untrack(() => finalStepFix(session));
  });
  /** Controls hidden: the "Show controls" button shows for a moment only after the mouse moves (else it's on stream). */
  let pointerMoved = $state(false);
  let pointerTimer: ReturnType<typeof setTimeout> | undefined;
  function pointerMove(): void {
    if (!hideControls) return;
    pointerMoved = true;
    clearTimeout(pointerTimer);
    pointerTimer = setTimeout(() => (pointerMoved = false), 2500);
  }
  $effect(() => {
    if (!hideControls) pointerMoved = false;
  });
  // Single window with the controls hidden: the whole window is on stream, so no toast pops up over the stage.
  $effect(() => {
    app.onAir = hideControls && !dual;
    return () => (app.onAir = false);
  });
  // An RPG round's question (a new screen's name…), its object card and a board game's space card are for that round
  // only, and so are a shop, a player's sheet, an object's pop-up, dice or a wheel on the stage: they don't follow into the next round.
  $effect(() => {
    void session.currentRound;
    rpgAsk = null;
    rpgObject = null;
    rpgSelObjects = [];
    bgSpace = null;
    untrack(() => {
      // ✎ Edit board is for the board on screen: another round starts without it.
      setEditing(false);
      const k = app.live.overlay?.kind;
      if (k === 'shop' || k === 'sheet' || k === 'popup' || k === 'dice' || k === 'wheel') app.live.overlay = null;
    });
  });
  /** The round's party or turn order takes in the players added or removed. */
  function catchUp(): void {
    const round = game.rounds[session.currentRound];
    if (session.phase === 'rpg' && isRpg(round)) ensureWorld(session, game, round);
    else if (session.phase === 'boardgame' && isBoardGame(round)) ensureBoard(session, game, round);
  }
  // Players added or removed mid-round (👥 Players), or a round's state put back by Undo: its party or turn order
  // catches up at once, not only when the round is next visited.
  $effect(() => {
    void session.players.map((p) => p.id).join();
    void session.worlds;
    void session.boardgames;
    untrack(catchUp);
  });
  // A player taken out by Undo (one added in 👥 Players) isn't selected any more either.
  $effect(() => {
    const here = new Set(session.players.map((p) => p.id));
    untrack(() => {
      if (selected.some((id) => !here.has(id))) selected = selected.filter((id) => here.has(id));
    });
  });

  // ✎ Edit board ends with the game.
  onMount(() => () => setEditing(false));

  onMount(() => {
    registerGameFonts(game);
    // Game audio output: route every sound this window plays (single-window mode) to the chosen device.
    const offSinks = watchSinks();
    // Keys pressed in the audience window work as if pressed here (the host clicked it to allow sound).
    const offKeys = onAudienceKey((k) => onkey(new KeyboardEvent('keydown', k)));
    // Phone buzzers: a resumed game (after a reload or a crash) gets back into its room.
    const offBuzz = onRoomBuzz(roomBuzz);
    const offQueue = onRoomQueue(roomQueueIn);
    const offWager = onRoomWager(roomWager);
    if (session.remote && phonesOn) rejoinRoom(session.remote);
    else if (session.remote) {
      // Buzzer mode was turned off (in the editor) while the room was left open: it's closed now.
      endRoom(session.remote);
      session.remote = null;
      void clearRoom();
    }
    // Time's up watcher (the host is the single source of truth for expiry).
    const id = setInterval(() => {
      const t = app.live.timer;
      if (t && !t.expired && t.startedAt !== null && timerRemaining(t) <= 0) {
        t.elapsed = t.total;
        t.startedAt = null;
        t.expired = true;
        playCue(app.live, game, 'timesUp');
      }
    }, 150);
    return () => {
      clearInterval(id);
      offSinks();
      offKeys();
      offBuzz();
      offQueue();
      offWager();
      // Leaving the game (Exit): the phones are told it's over. Not ◀ Back to editor from the pre-game screen: the room
      // stays open for ▶ Play (see backToEditor).
      if (!keepRoomOpen && !app.test) closeRoom();
      // The scores window belongs to this game (the audience window is closed by leaving it).
      closeScoresWindow();
      for (const t of pending) clearTimeout(t);
      pending.clear();
    };
  });

  /** Seconds for the open clue's countdown: its own setting, else the game default (0/blank = none). */
  function clueTimer(): number | null {
    const c = currentClueInfo(session, game)?.clue;
    const t = c?.timerSeconds ?? game.settings.defaultTimerSeconds;
    return t && t > 0 ? t : null;
  }

  function autoTimer(): void {
    const t = clueTimer();
    if (t && game.settings.timerAutoStart) startTimer(app.live, t);
  }

  /** The first controllable media element on screen (for the Space / ← → / M / Y shortcuts). */
  function firstMedia(): [string, { paused: boolean; muted: boolean; openUrl?: string }] | undefined {
    const src = dual ? Object.entries(remoteMedia) : Object.entries(localMedia).filter(([, s]) => s.role !== 'mirror');
    return src[0];
  }

  /** Open the audience window, or bring it to the front if it's already open. Never closes it. */
  async function openAudience(): Promise<boolean> {
    const ok = await openAudienceWindow(audienceTitle(game));
    if (!ok)
      toast(
        inTauri()
          ? "Couldn't open the audience window. Try again, or use single-window mode."
          : 'The browser blocked the popup. Allow popups for this file and try again.',
        5000,
      );
    return ok;
  }

  /** The host panel's scores-window button (a lower-third capture for OBS): opens or closes it. */
  function toggleScores(): void {
    if (scoresWindow.open) closeScoresWindow();
    else openScores();
  }

  function openScores(): void {
    if (!openScoresWindow()) toast('The browser blocked the popup. Allow popups for this file and try again.', 5000);
  }

  /** The host panel's audience button (it asks before closing, since it's usually the stream capture). */
  function toggleAudience(): void {
    if (!audience.open) openAudience();
    else closeAudienceWindow();
  }

  /** A score pop on stream for a moment. */
  function pop(p: Omit<Pop, 'id'>): void {
    const id = newId();
    const live = app.live;
    live.pops.push({ id, ...p });
    later(() => (live.pops = live.pops.filter((x) => x.id !== id)), 2200);
  }

  /** The countdown stops (a right answer, the answer going up): no "Time's up" over the answer. */
  function stopTimer(what: 'right' | 'reveal'): void {
    if (app.live.timer && stopsTimer(session.phase, what)) app.live.timer = null;
  }

  /** The winner fanfare, once the end screen has its winner (not while a tie for first is still to settle). */
  function winnerCue(): void {
    if (session.phase === 'end' && winnerKnown(session)) playCue(app.live, game, 'winner');
  }

  function reasonNow(): string {
    if (session.phase === 'clue' && session.currentClue)
      return clueReason(game, session.currentClue) + (session.dd?.stage === 'question' ? ' (Daily Double)' : '');
    if (session.phase === 'final') {
      const f = currentFinal(session, game);
      return f ? finalName(f) : 'Final';
    }
    if (session.phase === 'tiebreaker') return 'Tiebreaker';
    return 'Adjustment';
  }

  function award(sign: 1 | -1, ids = selected, amt = amount): void {
    if (!ids.length) return toast(`Select a player first (press 1–${Math.min(9, session.players.length) || 9} or click a name)`);
    // The tiebreaker settles the tie, with or without points (its Amount starts at 0).
    if (!amt && session.phase === 'tiebreaker') return tiebreakWin(sign, ids);
    // A Daily Double wagered at 0 is still right or wrong: a 0 result is logged.
    const zeroDD = amt === 0 && session.phase === 'clue' && session.dd?.stage === 'question';
    if (!amt && !zeroDD) return toast('Enter an amount first');
    const batch = newId();
    const events = zeroDD
      ? logZero(session, ids, reasonNow(), info?.clue.id, sign > 0, batch)
      : applyScore(session, game, ids, sign * Math.abs(amt!), reasonNow(), info?.clue.id, false, batch);
    // Wrong with no negative scores, from a player on 0 (or less): nothing to take, but it's still a wrong answer (the
    // log says so, the cue plays, and in Buzzer mode that player is locked out).
    if (!zeroDD && sign < 0) {
      const missed = ids.filter((id) => !events.some((e) => e.playerId === id));
      if (missed.length) events.push(...logZero(session, missed, reasonNow(), info?.clue.id, false, batch));
    }
    if (events.length) playCue(app.live, game, sign > 0 ? 'right' : 'wrong');
    if (events.length && sign > 0) stopTimer('right');
    // Buzzer mode: a right answer closes the buzzers; a wrong one locks that player out, and the next in the buzz order
    // answers (with nobody left in it, the buzzers open for the rest).
    const b = app.live.buzz;
    let next: string | null = null;
    if (buzzing && b?.answering && events.length && ids.includes(b.answering)) {
      if (sign > 0) setBuzz(buzzDone(b));
      else next = passOn(b, b.answering);
    }
    // One pop per player, or one for a group ("Everyone +$200").
    for (const p of groupPops(events, session.players, sym, game.theme?.value || '#ffcc00')) pop(p);
    // Screen readers: what changed, and where that leaves each player.
    for (const e of events) {
      const total = formatPoints(score(session, e.playerId), sym);
      announce(`${playerName(session, e.playerId)} ${e.delta > 0 ? '+' : ''}${formatPoints(e.delta, sym)}, now ${total}`);
    }
    // Awarding control of the board follows TV rules: the last correct player picks next.
    if (game.settings.pickerFollowsAward !== false && sign > 0 && ids.length === 1) session.currentPickerId = ids[0];
    selected = next ? [next] : [];
  }

  /** The tiebreaker clue's winner with no points (Amount 0): the tie is settled, the scores stay as they are. */
  function tiebreakWin(sign: 1 | -1, ids: string[]): void {
    const id = ids[0];
    if (sign < 0) return toast('Nothing to deduct: type an amount, or select the winner and ＋ Award');
    if (ids.length > 1) return toast('Select the one player who won the tiebreaker');
    if (!tiedLeaders(session).some((p) => p.id === id)) return toast(`${playerName(session, id)} isn’t tied for first`);
    logged(session, `${playerName(session, id)} won the tiebreaker clue`, () => {
      session.rollOffWinner = id;
      session.tiebreakClue = true;
    });
    playCue(app.live, game, 'right');
    stopTimer('right');
    const p = session.players.find((x) => x.id === id);
    if (p) pop({ text: `${p.name} wins the tiebreaker!`, color: p.color });
    selected = [];
  }

  /** Players whose color a chroma-key stage background would take out on stream (the pre-game screen warns). */
  const keyedOut = $derived.by(() => {
    const key = game.theme?.stageBg ? STAGE_KEYS[game.theme.stageBg] : undefined;
    return key ? session.players.filter((p) => nearKey(p.color, key)) : [];
  });

  const info = $derived(currentClueInfo(session, game));

  /** Buzzer mode, while a clue is open (a Daily Double has its one player): players buzz in. */
  const buzzing = $derived(buzzerOn(game.settings) && session.phase === 'clue' && !session.dd);
  /** The buzzers' state (see buzz.ts). */
  const buzz = $derived(app.live.buzz ?? newBuzz(session.remote?.armId ?? 0));
  const playerIds = () => session.players.map((p) => p.id);

  function setBuzz(b: BuzzState): void {
    app.live.buzz = b;
    // The room's openings only go up, also after a reload (see Session.remote).
    if (session.remote && (session.remote.armId ?? 0) < b.armId) session.remote.armId = b.armId;
    // Saved with the game while a clue is open, so a reload mid-clue doesn't open the buzzers afresh for everyone.
    if (session.remote) {
      if (buzzClue) session.remote.buzz = { ...b, clue: buzzClue, floor: clueArmFloor };
      else delete session.remote.buzz;
    }
  }

  // The buzzers follow the clue: a tile opening (or a resumed game opening on one) starts them afresh, open at once or
  // closed until the host opens them (📱 Phone buzzers); leaving it (back to the board, a Daily Double) puts them away.
  let buzzClue: string | null = null;
  $effect(() => {
    const key = buzzing ? clueKey(session.currentClue) : null;
    untrack(() => {
      if (key === buzzClue && app.live.buzz) return;
      buzzClue = key;
      // The phones' queue starts afresh: only openings after this one belong to this clue.
      roomQueue = null;
      // Back after a reload on the same clue: the buzzers as they were (who's answering, who already missed it).
      const saved = key && session.remote?.buzz?.clue === key ? $state.snapshot(session.remote.buzz) : null;
      if (saved) {
        const { clue: _clue, floor, ...b } = saved;
        clueArmFloor = floor;
        return setBuzz(b);
      }
      const next = key ? buzzClueOpened(buzz, game.settings.buzzArm !== 'host') : buzzIdle(buzz);
      clueArmFloor = next.phase === 'armed' ? next.armId - 1 : next.armId;
      setBuzz(next);
    });
  });
  // Outside buzzer mode viewers see who's answering too: the one player selected during a clue. In buzzer mode a player
  // picked (or let go) by hand, a number key or a click in the host panel, answers (or the buzzers open again for the rest).
  $effect(() => {
    const one = session.phase === 'clue' && !session.dd && selected.length === 1 ? selected[0] : null;
    const on = buzzing;
    untrack(() => {
      const b = app.live.buzz;
      if (!on) {
        if (!buzzerOn(game.settings) && (b?.answering ?? null) !== one) app.live.buzz = { ...buzzIdle(buzz), answering: one };
        return;
      }
      if (!b) return;
      if (one && one !== b.answering) setBuzz(buzzTake(b, one, true)!);
      else if (!one && b.answering) setBuzz(buzzArm({ ...b, answering: null }, playerIds()));
    });
  });

  /**
   * A phone's buzz won (the room decided): that player answers, the others are locked out until a wrong answer or 0
   * opens the buzzers again. Never an undo step: a stray buzz must not cost the host their redo.
   */
  function buzzPlayer(id: string, by?: string): boolean {
    const b = app.live.buzz;
    const p = session.players.find((x) => x.id === id);
    // Someone picked already (a number key or a click): the host's choice stands. And only while the buzzers are open.
    if (!buzzing || !b || !p || selected.length || b.phase !== 'armed') return false;
    // Teams: who on the team buzzed ("Ann (Red team)").
    const next = buzzTake(b, id, false, by);
    if (!next) return false;
    setBuzz(next);
    selected = [id];
    playCue(app.live, game, 'buzz');
    return true;
  }

  /** U or 🔔 Open the buzzers: everyone who hasn't missed this clue may buzz. While someone is answering: everyone (0). */
  function openBuzzers(all = false): void {
    if (!buzzing) return;
    if (all || buzz.phase === 'answering') {
      if (selected.length || buzz.lockedOut.length) toast('Buzzers open for everyone');
      selected = [];
      setBuzz(buzzReset(buzz));
      roomQueue = null;
      return;
    }
    if (buzz.phase === 'armed') return;
    const next = buzzArm(buzz, playerIds());
    if (next.phase !== 'armed') return toast('Everyone missed this one: 0 lets everyone buzz again');
    setBuzz(next);
  }

  // ---------- Phone buzzers ----------

  /**
   * Buzzer mode (the pre-game screen's 📱 Phone buzzers card): players buzz from their phones. Off in a copy with no
   * buzzer server, whatever the game says (its setting is kept for a copy that has one).
   */
  const phonesOn = $derived(buzzerOn(game.settings));

  /** A buzzer setting, here and in the editor's copy of this game (kept, undoable there). Turning it off ends the room. */
  const setBuzzSetting: SetBuzzSetting = (key, value, label) => {
    const apply = (g: Game) => (g.settings[key] = value);
    apply(game);
    if (app.game.id === game.id) step(label, () => apply(app.game), { during: 'play' });
    if (key === 'buzzer' && !value && session.remote) closePhoneRoom();
  };
  const earlyMs = $derived(Math.round((game.settings.earlyBuzzLock ?? 1) * 1000));
  /**
   * The room's queue for this clue: every phone buzz of the latest opening, fastest reaction first (the host panel
   * lists it). It stays through a rebound until the new opening has buzzes of its own, for "→ Next in line".
   */
  let roomQueue = $state<RoomQueue | null>(null);
  /** Openings at or below this belong to earlier clues. */
  let clueArmFloor = 0;
  const queueRows = $derived(
    (roomQueue?.queue ?? []).map((q, i) => ({
      id: q.seatId,
      rank: i + 1,
      // Teams: who on the team buzzed, "Ann (Red team)".
      name: whoBuzzed(session.players.find((p) => p.id === q.seatId)?.name ?? '?', q.by),
      by: q.by,
      after: q.arrivedLate ? 'faster, but arrived late' : q.afterMs ? `+${(q.afterMs / 1000).toFixed(2)} s` : '',
      rolled: q.rolled,
      out: buzz.lockedOut.includes(q.seatId),
    })),
  );
  /** A tie the room left to the host: nobody answers until the host picks or rolls. */
  const tie = $derived(
    roomQueue?.tie && roomQueue.armId === buzz.armId && buzz.phase === 'armed' && !selected.length
      ? roomQueue.tie.filter((id) => session.players.some((p) => p.id === id))
      : [],
  );
  /**
   * After a wrong answer: the next player in the queue who hasn't missed this clue (the default stays the rebound).
   * None once someone got it right.
   */
  const nextInLine = $derived(
    buzzing && buzz.phase !== 'answering' && !buzz.done && !selected.length && buzz.lockedOut.length && !tie.length
      ? queueRows.find((r) => !r.out && r.id !== buzz.answering)
      : undefined,
  );
  // Screen readers hear the buzz order, a tie, and who answers as they change (said once, after a moment's quiet).
  const buzzOrderSaid = $derived(queueRows.map((r) => `${r.rank}. ${r.name}${r.out ? ' (out)' : ''}`).join(', '));
  $effect(() => {
    if (buzzOrderSaid) announce(`Buzz order: ${buzzOrderSaid}`);
  });
  $effect(() => {
    if (tie.length) announce(`Tie: ${nameList(tie.map((id) => playerName(session, id)))}`);
  });
  $effect(() => {
    const id = buzzing ? app.live.buzz?.answering : null;
    if (id) announce(`${whoBuzzed(playerName(session, id), app.live.buzz?.by)} is answering`);
  });
  const ordinal = (n: number) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'));

  function roomQueueIn(q: RoomQueue): void {
    if (!phonesOn || !buzzing || q.armId <= clueArmFloor || q.armId > buzz.armId) return;
    // An older opening's queue doesn't replace a newer one's.
    if (roomQueue && q.armId < roomQueue.armId) return;
    roomQueue = q;
    // The room decided this opening, but its "buzz" never got here (the connection dropped just then): the queue's
    // first answers, as the buzz would have made them.
    if (q.armId === buzz.armId && buzz.phase === 'armed' && !q.tie && q.queue.length && !selected.length) buzzPlayer(q.queue[0].seatId, q.queue[0].by);
  }

  /**
   * The one answering is done with this clue (wrong, or skipped): they're locked out, and the next in the buzz order
   * answers (with nobody left in it, the buzzers open for the rest). Returns who answers now.
   */
  function passOn(b: BuzzState, id: string): string | null {
    const queue = roomQueue && roomQueue.armId > clueArmFloor ? roomQueue.queue.map((q) => ({ id: q.seatId, by: q.by })) : [];
    const after = buzzMissed(b, id, session.players.map((p) => p.id), queue);
    setBuzz(after);
    return after.phase === 'answering' ? after.answering : null;
  }

  /** ⏭ Skip: the one answering passes, with no points taken (they can't buzz again on this clue). Not an undo step. */
  function skipAnswering(): void {
    const b = app.live.buzz;
    if (!buzzing || !b?.answering) return;
    const who = playerName(session, b.answering);
    const next = passOn(b, b.answering);
    selected = next ? [next] : [];
    toast(next ? `Skipped ${who}: ${playerName(session, next)} answers` : `Skipped ${who}: the buzzers are open for the rest`);
  }

  /** → Next in line: they answer now, no new opening. Not an undo step (like a buzz). */
  function takeNext(id: string, by?: string): void {
    const b = app.live.buzz;
    if (!buzzing || !b) return;
    setBuzz(buzzTake(b, id, true, by)!);
    selected = [id];
    playCue(app.live, game, 'buzz');
  }

  /** 🎲 Roll for it: the tied players roll; the order they roll in is the order they answer in. */
  function rollTie(): void {
    if (tie.length < 2) return;
    startRollOff(app.live, session, tie, game.settings.rollOffDie || 20, 'buzz', buzz.armId);
    const o = app.live.overlay;
    if (o?.kind !== 'rolloff') return;
    const nonce = o.nonce;
    const s = session;
    later(() => {
      if (app.session !== s) return;
      const now = app.live.overlay;
      if (now?.kind !== 'rolloff' || now.nonce === nonce) rollOffResult(s, o);
    }, overlayDoneAt(o) - Date.now() + 200);
  }

  async function startPhoneRoom(): Promise<void> {
    if (!buzzerBase()) return toast("Phone buzzers aren't set up in this copy", 4000);
    const s = session;
    const room = await startRoom();
    if (!room) return toast(remote.error || "Couldn't start the buzzer room", 5000);
    // Left the game while the room was being made.
    if (app.session !== s) return closeRoom();
    s.remote = { ...room, armId: buzz.armId };
  }

  /** What the buzzer room gets now: the game's state for the phones, their status line, 🔒, and the wagers they may send. */
  function roomState(): HostState {
    return hostState(game, session, buzz, earlyMs, { status: phoneStatus(game, session, app.pregame), locked: !!session.remote?.locked, wager: phoneWagerAsk() });
  }

  /** The wagers phones may send now (none before the game starts), with the ones already taken from them. */
  function phoneWagerAsk(): WagerAsk | null {
    if (app.pregame) return null;
    const first = wagerAsk(game, session, wagerLimitsOff);
    const got = first && session.remote?.wagerGot?.id === first.id ? session.remote.wagerGot.seats : {};
    return first && Object.keys(got).length ? wagerAsk(game, session, wagerLimitsOff, got) : first;
  }

  /**
   * A player sent their wager from their phone (the room checked it). It goes in their box, marked 📱 (the host can
   * still type over it): a Daily Double's before its question shows; a Final's on its wager screen, as a step ("Ann’s
   * wager (from their phone): $500"). One already taken (a room passing it on again after a reconnect) is skipped.
   */
  function roomWager(w: RoomWager): void {
    const r = session.remote;
    const ask = phonesOn && r ? phoneWagerAsk() : null;
    const seat = ask?.open && ask.id === w.id ? ask.seats.find((x) => x.id === w.seatId) : undefined;
    if (!r || !ask || !seat || w.n <= (seat.got ?? 0)) return;
    if (ask.limit && w.amount > seat.max) return;
    r.wagerGot = { id: ask.id, seats: { ...(r.wagerGot?.id === ask.id ? r.wagerGot.seats : {}), [w.seatId]: w.n } };
    const name = playerName(session, w.seatId);
    const by = w.by && game.settings.buzzTeams ? w.by : '';
    if (ask.kind === 'dd' && session.dd) {
      session.dd.draft = w.amount;
      session.dd.draftFrom = 'phone';
      if (by) session.dd.draftBy = by;
      else delete session.dd.draftBy;
      return;
    }
    const f = session.final;
    if (ask.kind !== 'final' || !f) return;
    const was = f.wagers[w.seatId];
    if (was === w.amount && wagerFromPhone(f, w.seatId) && (f.wagerBy?.[w.seatId] ?? '') === by) return;
    const sym = game.settings.currencySymbol;
    const from = by ? `from ${by}’s phone` : 'from their phone';
    const text = `${name}’s wager (${from}): ${typeof was === 'number' ? `${formatPoints(was, sym)} → ` : ''}${formatPoints(w.amount, sym)}`;
    logged(session, text, () => finalSetWager(session, w.seatId, w.amount, 'phone', by || undefined));
  }

  /**
   * Phone wagers: the players (teams) with a phone in the room now, who can send their wager from it ([] when the room
   * can't take them: an older buzzer server, see wagerNote).
   */
  const wagerPhones = $derived(
    phonesOn && remote.status === 'online' && roomHasWagers() ? [...new Set(remote.phones.filter((p) => p.connected && p.seatId).map((p) => p.seatId!))] : [],
  );
  /** An older buzzer server with phones in it: they can't send wagers, the host types them. */
  const wagerNote = $derived(
    phonesOn && remote.status === 'online' && !roomHasWagers() && remote.phones.some((p) => p.seatId)
      ? 'This buzzer server can’t take wagers from phones (it’s an older one): type them in.'
      : '',
  );

  /** A buzz the room let through: the first one answers (unless the host picked someone already). */
  function roomBuzz(b: RoomBuzz): void {
    if (!phonesOn) return;
    // The room moved on to "answering" by itself: if that's not what happened here, it hears the host's state again.
    if (b.rank === 1 && (b.armId !== buzz.armId || !buzzPlayer(b.seatId, b.by))) resendHostState();
  }

  /** Someone asked to join from their phone: a new player (an undoable step mid-game), then their phone gets the seat. */
  function addPhonePlayer(conn: string, name: string): void {
    if (session.players.length >= game.settings.maxPlayers) return toast(`The game is full: ${game.settings.maxPlayers} players at most (⚖ Game rules › Most players)`);
    let who = clip(name.trim(), SEAT_NAME_MAX) || `Player ${session.players.length + 1}`;
    // Never a second "Ann": the new one is "Ann 2".
    const taken = (n: string) => session.players.some((x) => x.name.trim().toLowerCase() === n.toLowerCase());
    if (taken(who)) {
      let i = 2;
      while (taken(`${who} ${i}`)) i++;
      who = `${who} ${i}`;
    }
    const p = { id: newId(), name: who, color: nextFreeColor(session.players.map((x) => x.color)), startScore: 0 };
    if (app.pregame) session.players.push(p);
    else logged(session, `Added ${who} (from their phone)`, () => session.players.push(p));
    // The room has to know the seat before the phone takes it.
    sendHostState(roomState(), true);
    acceptPhone(conn, p.id);
    toast(`${who} joined from their phone`);
  }

  function kickPhone(seatId: string): void {
    if (!kickSeat(seatId)) return;
    if (game.settings.buzzTeams) toast(`Everyone's phone is off ${playerName(session, seatId)} (they can't join it again for 2 minutes)`, 4000);
    else toast(`${playerName(session, seatId)}'s phone let go of the seat (that phone can't take it again for 2 minutes)`, 4000);
  }

  /** Teams: one person off their team (their phone can't join it again for 2 minutes; another team it can). */
  function kickTeamMember(seatId: string, member: string, name: string): void {
    if (kickMember(seatId, member)) toast(`${name} is off ${playerName(session, seatId)} (that phone can't join it again for 2 minutes)`, 4000);
  }

  /** Teams: put one person on another team. */
  function moveTeamMember(member: string, seatId: string, name: string): void {
    if (moveMember(member, seatId)) toast(`${name} moved to ${playerName(session, seatId)}`);
  }

  // Whatever the phones need to know (the players, scores, the buzzers, the clue's words) goes to the room as it changes.
  let sentPhase = '';
  $effect(() => {
    if (!phonesOn || remote.status === 'off' || remote.status === 'error') return;
    const st = roomState();
    // The buzzers opening goes at once (players are racing).
    const now = st.phase !== sentPhase && st.phase === 'armed';
    sentPhase = st.phase;
    untrack(() => !keepRoomOpen && sendHostState(st, now));
  });
  // The pre-game screen's room is saved on its own (nothing else is before Start game): a reload gets back into it.
  $effect(() => {
    if (!app.pregame || !session.remote || !phonesOn) return;
    const r: SavedRoom = { gameId: game.id, remote: $state.snapshot(session.remote), players: $state.snapshot(session.players), screen: 'pregame', savedAt: Date.now(), settings: $state.snapshot(game.settings) };
    untrack(() => !keepRoomOpen && void saveRoom(r));
  });

  /** Set by ◀ Back to editor: the room stays open while the host is in the editor. */
  let keepRoomOpen = false;
  /**
   * ◀ Back to editor (pre-game): the room stays open, its phones told the host is setting up; ▶ Play goes back into it.
   * Only Exit / End game, ✕ Close the room or turning Buzzer mode off close it.
   */
  function backToEditor(): void {
    const r = session.remote;
    if (app.pregame && phonesOn && r && inRoom(r.code)) {
      const saved: SavedRoom = { gameId: game.id, remote: $state.snapshot(r), players: $state.snapshot(session.players), screen: 'editor', savedAt: Date.now(), settings: $state.snapshot(game.settings) };
      sendHostState(hostState(game, session, buzzIdle(buzz), earlyMs, { status: { text: SETTING_UP }, locked: !!r.locked }), true);
      keepRoomOpen = true;
      kept.room = saved;
      void saveRoom(saved);
    }
    oncancel();
  }

  /** ✕ Close the room (the 📱 card): the phones are told the game is over; Start the room makes a new one. */
  function closePhoneRoom(): void {
    closeRoom();
    session.remote = null;
    void clearRoom();
    toast('Buzzer room closed: the phones were told');
  }

  /** 🔒 Lock seats: no new phone takes a seat or asks to join; players already in come back. */
  function lockSeats(on: boolean): void {
    if (!session.remote) return;
    session.remote.locked = on || undefined;
    toast(on ? '🔒 Seats locked: only players already in can come back' : 'Seats open again');
  }

  /** Buzzer mode with the room out of reach: the host panel says the phones can't buzz (not "Buzzers open"). */
  const phonesDown = $derived(
    !phonesOn
      ? ''
      : remote.status === 'off'
        ? 'No buzzer room is running: phones can’t buzz (📱 chip › Start the room). 1–9 still pick.'
        : remote.status === 'online'
          ? ''
          : '⚠ Phones not connected: the buzzer room can’t be reached right now, so phones can’t buzz. 1–9 still pick.',
  );

  // Someone asks to join from their phone: the host hears it (a toast, and a soft chime when the stream is the other
  // window), not only a number on the 📱 chip.
  let askSeen = new Set<string>();
  $effect(() => {
    const asking = phonesOn ? remote.phones.filter((p) => !p.seatId && p.pendingName && p.connected && !remote.answered.includes(p.conn)) : [];
    untrack(() => {
      const fresh = asking.filter((p) => !askSeen.has(p.conn));
      askSeen = new Set(asking.map((p) => p.conn));
      if (!fresh.length) return;
      const names = nameList(fresh.map((p) => p.pendingName ?? ''));
      toast(`📱 ${names} ${fresh.length === 1 ? 'wants' : 'want'} to join: ${app.pregame ? 'see 📱 Phone buzzers below' : 'click the 📱 chip'}`, 5000);
      if (dual) chime();
    });
  });
  // Viewers' "Starting soon" card shows the room's code, link and QR code.
  $effect(() => {
    const live = app.live;
    const room = phonesOn && remote.code && remote.status !== 'off' && remote.status !== 'error' ? { code: remote.code, link: roomLink(remote.code) } : null;
    // Nobody new can join (seats locked, or every seat has its phone and phones can't add players): the stage's join
    // badge stops inviting everyone.
    const seated = session.players.every((p) => remote.phones.some((ph) => ph.seatId === p.id));
    const closed =
      !!room && (!!session.remote?.locked || (!teamsOn(game.settings) && seated && (!game.settings.phoneJoin || session.players.length >= game.settings.maxPlayers)));
    untrack(() => {
      if (live.room?.code !== room?.code || live.room?.link !== room?.link || !!live.room?.closed !== closed) live.room = room && (closed ? { ...room, closed } : room);
    });
  });

  /** Exit: the room closes (phones are told) and the saved game forgets it. (A test never had one: a room kept open
   *  in the editor stays open.) */
  function exitGame(keep: boolean): void {
    if (!app.test) {
      closeRoom();
      session.remote = null;
      void clearRoom();
    }
    onexit(keep);
  }

  function pick(ref: ClueRef): void {
    openClue(session, ref, game);
    selected = [];
    const c = currentClueInfo(session, game);
    amount = c?.value ?? null;
    app.live.timer = null;
    app.live.overlay = null;
    playCue(app.live, game, session.dd ? 'dailyDouble' : 'tileOpen');
    if (session.dd) return;
    if (c?.clue.type === 'wheel') {
      const w = game.wheels.find((x) => x.id === c.clue.wheelId);
      if (c.clue.wheelId === PLAYER_WHEEL) openPlayerWheel(app.live, session);
      else if (w) openWheel(app.live, session, w);
      else toast('This tile has no wheel chosen');
    } else if (c?.clue.type === 'dice') {
      const d = tileDice(game, c.clue.diceId);
      if (d) openDice(app.live, d);
      else toast('This tile has no dice chosen');
    } else autoTimer();
  }

  // ---------- Tools (dice / wheel / roll-off) ----------
  let lastDice: DicePreset = quickDice(6, 1, 'd6');
  $effect(() => {
    const o = app.live.overlay;
    if (o?.kind === 'dice') lastDice = o.preset;
  });

  /** Roll-offs whose result was already applied (closing one early applies it; the timer then mustn't again). */
  const rollOffsApplied = new Set<string>();

  /** The roll-off's result: who picks first, or (a tiebreaker for tied winners) who wins the game. */
  function rollOffResult(s: typeof session, o: { nonce: string; winner: string; ranking: string[]; purpose?: 'first' | 'tiebreak' | 'buzz'; armId?: number }): void {
    if (rollOffsApplied.has(o.nonce)) return;
    rollOffsApplied.add(o.nonce);
    if (o.purpose === 'buzz') {
      // A buzzer tie: the first in the roll answers, the rest follow in roll order. Only if the host hasn't moved on.
      const b = app.live.buzz;
      if (app.session !== s || !buzzing || !b || b.armId !== o.armId || b.phase !== 'armed' || selected.length) return;
      setBuzz({ ...buzzTake(b, o.winner, true)!, rollOrder: [...o.ranking] });
      selected = [o.winner];
      return;
    }
    if (o.purpose === 'tiebreak') {
      logged(s, `${playerName(s, o.winner)} won the roll-off`, () => {
        s.rollOffWinner = o.winner;
        s.tiebreakClue = undefined;
      });
      // Settled: now there's a winner to cheer.
      if (app.session === s) winnerCue();
    } else setPicker(s, o.winner, ' (roll-off)');
  }

  function rolloff(ids: string[], sides: number, purpose: 'first' | 'tiebreak' = 'first'): void {
    startRollOff(app.live, session, ids, sides, purpose);
    const o = app.live.overlay;
    if (o?.kind !== 'rolloff') return;
    const nonce = o.nonce;
    const result = { nonce: o.nonce, winner: o.winner, ranking: o.ranking, purpose };
    const s = session;
    later(() => {
      // Only in this game, and only if that roll-off is still the one on screen (or was closed after finishing).
      if (app.session !== s) return;
      if (app.live.overlay?.kind !== 'rolloff' || app.live.overlay.nonce === nonce) rollOffResult(s, result);
    }, overlayDoneAt(o) - Date.now() + 200);
  }

  /** Reveal or hide the answer (R / the host button / clicking the slide). */
  function revealToggle(): void {
    // A question pop-up (from an RPG object or a wheel slice) reveals its own answer.
    const o = app.live.overlay;
    if (o?.kind === 'popup' && o.answer) {
      o.revealed = !o.revealed;
      if (o.revealed) playCue(app.live, game, 'reveal');
      return;
    }
    const wasFinalQuestion = session.phase === 'final' && session.finalStep === 'question';
    revealStep(session);
    if (answerShowing(session)) {
      // The countdown has done its job once the answer is up (no "Time's up" over it).
      stopTimer('reveal');
      if (app.live.timer?.expired) app.live.timer = null;
      // The Final's think music stops for the reveal's sound.
      playCue(app.live, game, 'reveal', wasFinalQuestion);
    }
  }

  /**
   * A clue with several question slides: the next one (N, the main button, a click on the slide) or the one before
   * (Shift+N, ◀ Slide). The buzzers stay as they are (the host opens them when they like). Returns whether it moved.
   */
  function slideStep(d: 1 | -1): boolean {
    return stepSlide(session, game, d);
  }

  // Host clicks on the stage. A short guard stops one double-click from both revealing and leaving the clue.
  let lastStageAct = 0;
  function stageAct(a: StageAction): void {
    const now = Date.now();
    if (now - lastStageAct < 450) return;
    lastStageAct = now;
    switch (a) {
      case 'intro':
        intro();
        break;
      case 'reveal':
        // (A clue's next question slide first, then its answer.)
        if (!answerShowing(session) && !slideStep(1)) revealToggle();
        break;
      case 'back':
        if (session.phase === 'clue') back();
        break;
      case 'final-next':
        finalNextStep(session, game);
        finalStep();
        break;
      case 'overlay':
        overlayPrimary();
        break;
    }
  }

  /**
   * Dice, a wheel or a roll-off still going on screen: D, W and O wait for it (its result is already in the log, and
   * a used slice already gone), with a word why.
   */
  function toolBusy(): boolean {
    const o = app.live.overlay;
    if ((o?.kind !== 'dice' && o?.kind !== 'wheel' && o?.kind !== 'rolloff') || Date.now() >= overlayDoneAt(o)) return false;
    toast(`Still ${o.kind === 'wheel' ? 'spinning' : 'rolling'}: wait for it to land`);
    return true;
  }

  /** Clicking a tool overlay: spin/roll if it hasn't happened yet, otherwise close it once it's finished. */
  function overlayPrimary(): void {
    const o = app.live.overlay;
    if (!o) return;
    const busy = Date.now() < overlayDoneAt(o);
    if (busy) return;
    // A shop stays open until 🚪 Leave shop (its wares are clicked to buy).
    if (o.kind === 'shop') return;
    if (o.kind === 'popup' && o.answer && !o.revealed) {
      o.revealed = true;
      playCue(app.live, game, 'reveal');
    }
    else if (o.kind === 'wheel' && !o.spin) {
      if (wheelSpentUp(o, session, game)) toast('Every slice has landed: Restore them to spin again');
      else spinWheel(app.live, session, game);
    } else if (o.kind === 'dice' && !o.roll) rollDice(app.live, session, o.preset);
    else closeOverlay();
  }

  function closeOverlay(): void {
    const o = app.live.overlay;
    // The result was decided up front, so closing early (skipping the animation) still sets the picker.
    if (o?.kind === 'rolloff') rollOffResult(session, o);
    app.live.overlay = null;
    // Only the tile's own wheel or dice: closing the scores or a roll mid-clue leaves the clue and its countdown as they are.
    if (session.phase !== 'clue' || !info || o?.kind !== info.clue.type) return;
    // A wheel/dice tile shows its question once the tool is closed, and its countdown starts. One with nothing to ask
    // is done: no empty slide, no countdown.
    if (toolOnlyClue(info.clue)) back();
    else if (!questionSlides(info.clue).every(blankSlide)) autoTimer();
  }

  function ddShow(playerId: string, wager: number): void {
    ddShowQuestion(session, playerId, wager);
    selected = [playerId];
    amount = wager;
    autoTimer();
  }

  /**
   * Back to the board. The tile is marked used, unless the host cancelled (`keep`) or the Daily Double
   * question never showed.
   */
  function back(keep = false): void {
    const clueId = info?.clue.id;
    // The host panel's status row then offers "↶ Reopen <tile>" (no toast: it would cover the round buttons).
    backToBoard(session, game, { markUsed: !keep && session.dd?.stage !== 'splash' });
    selected = [];
    amount = null;
    app.live.timer = null;
    // The keys go on from the tile that was open (the arrow keys move from it), not from the top of the page.
    if (clueId) void tick().then(() => document.querySelector<HTMLElement>(`.play .stage-box .tile[data-clue="${clueId}"]`)?.focus({ preventScroll: true }));
  }

  /** Back to the board without using up the tile (a misclick), unless points were already given for it. */
  function cancelClue(): void {
    if (session.dd?.stage !== 'splash' && info && clueScored(session, info.clue.id))
      return toast('Points were given for this clue: undo them first (Ctrl+Z), or use ▦ Done ▶ board', 4000);
    back(true);
  }

  /** Put a used tile back on the board, or mark one as played (an undoable step, unlike closing a clue). */
  function toggleTile(clueId: string): void {
    const ref = findClueRef(game, clueId);
    const name = ref ? clueName(game, ref) : 'That tile';
    const text = session.used[clueId] ? `${name} back on the board` : `${name} marked as played`;
    logged(session, text, () => toggleUsed(session, clueId));
    toast(session.used[clueId] ? `${name} marked as played` : `${name} is back on the board`);
  }

  /** Right-click on a tile of the host's board: open it or skip it, or put a used one back (it says who scored it). */
  function tileMenu(e: MouseEvent, ref: ClueRef): void {
    const clue = getClue(game, ref)?.clue;
    if (!clue) return;
    const cover = { label: app.live.cover ? '▶ Uncover the screen' : '⏸ Cover the screen', onclick: () => (app.live.cover = !app.live.cover) };
    if (!session.used[clue.id])
      return showMenu(e, [
        { heading: clueName(game, ref) },
        { label: '▶ Open', onclick: () => pick(ref) },
        { label: '✓ Mark as played (skip it)', onclick: () => toggleTile(clue.id) },
        { sep: true },
        cover,
      ]);
    const scored = session.scoreLog.filter((x) => !x.undone && x.clueId === clue.id);
    showMenu(e, [
      { heading: clueName(game, ref) },
      { heading: scored.length ? scored.map((x) => `${playerName(session, x.playerId)} ${x.delta < 0 ? '' : '+'}${formatPoints(x.delta, sym)}`).join(', ') : 'No points given' },
      { label: '↶ Put it back on the board', onclick: () => toggleTile(clue.id) },
      { sep: true },
      cover,
    ]);
  }

  function nextRound(delta: number): void {
    goToRound(session, game, session.currentRound + delta);
    app.live.timer = null;
    selected = [];
    amount = null;
    if (session.intro?.stage === 'title') playCue(app.live, game, 'roundIntro');
    winnerCue();
    boardFocus();
  }

  /**
   * Another round is up: the button pressed for it is gone (the round buttons are new for each round), so the keys go on
   * from the new board's tile, not from the top of the page.
   */
  function boardFocus(): void {
    void tick().then(() => {
      const at = document.activeElement;
      if (at && at !== document.body && at.isConnected && !(at as HTMLButtonElement).disabled) return;
      document.querySelector<HTMLElement>('.play .stage-box .tile[tabindex="0"]')?.focus({ preventScroll: true });
    });
  }

  // The board becomes pickable (the game starts on it, its intro ends): the keys go on from its first open tile (arrows
  // + Enter), unless the focus is somewhere already.
  $effect(() => {
    if (app.pregame || session.phase !== 'board' || session.intro) return;
    untrack(boardFocus);
  });

  /** N in the Final's wagers with some still to type (or over the max): say whose, and go to the first of them. */
  function wagersWaiting(): void {
    const { missing, over, whole } = finalWagerProblems(session, wagerLimitsOff);
    const names = (ids: string[]) => nameList(ids.map((id) => playerName(session, id)));
    toast(missing.length ? `Waiting on: ${names(missing)}` : whole.length ? `Not a whole number: ${names(whole)}` : `Over the max: ${names(over)}`, 3000);
    const first = session.final?.players.find((id) => missing.includes(id) || whole.includes(id) || over.includes(id));
    if (first) document.querySelector<HTMLElement>(`.play [data-wager="${first}"]`)?.focus();
  }

  /** Final round started by mistake (or a tile was skipped): back to the round before it, wagers kept. */
  function backFromFinal(): void {
    goToRound(session, game, Math.max(0, session.currentRound - 1));
    app.live.timer = null;
    app.live.sound = null;
    boardFocus();
  }

  /** From the end screen: back to the final reveals to fix a judgment, or to the board if there was no Final. */
  function backFromEnd(): void {
    app.live.sound = null;
    app.live.overlay = null;
    backToLastRound(session, game);
  }

  /**
   * The tiebreaker clue: select the winner and ＋ Award. Its Amount starts at 0 (settling the tie adds no points; the
   * host can still type some).
   */
  function tiebreaker(): void {
    startTiebreaker(session);
    selected = [];
    amount = 0;
    app.live.timer = null;
  }

  /** 🏁 Back to results from the tiebreaker clue: the fanfare if it settled the tie. */
  function tiebreakerDone(): void {
    session.phase = 'end';
    app.live.timer = null;
    winnerCue();
  }

  /** Same players (names, colors and pictures) at 0 and a fresh board, via the pre-game screen. */
  function rematch(): void {
    // Until the rematch starts, the finished game stays viewable from the editor ("View results").
    app.resumable = { game: $state.snapshot(game), session: $state.snapshot(session), savedAt: Date.now() };
    const s = newSession(game);
    // (With their pictures: a picture is only taken off with its −🖼.)
    s.players = session.players.map(({ id, name, color, avatar }) => ({ id, name, color, startScore: 0, ...(avatar ? { avatar } : {}) }));
    // The same buzzer room: the phones stay joined.
    s.remote = session.remote;
    selected = [];
    amount = null;
    app.live = newLive();
    app.session = s;
    app.pregame = true;
  }

  function intro(): void {
    introNext(session, game);
  }

  // Auto-advance through category reveals when set to 'auto'.
  $effect(() => {
    const i = session.intro;
    if (!i || app.pregame) return;
    const mode = game.settings.roundIntro.categoryReveal;
    const delay = i.stage === 'title' ? 0 : i.stage === 'fill' ? 1900 : mode === 'auto' ? 1300 : 0;
    if (!delay || (i.stage === 'categories' && mode !== 'auto')) return;
    void i.revealed;
    const t = setTimeout(() => introNext(session, game), delay);
    return () => clearTimeout(t);
  });

  function finalStep(): void {
    app.live.timer = null;
    if (session.phase === 'final' && session.finalStep === 'question') {
      startTimer(app.live, currentFinal(session, game)?.timerSeconds || game.settings.finalTimerSeconds || 30);
      playCue(app.live, game, 'finalThink');
    }
    if (session.phase === 'final' && session.finalStep === 'answer') app.live.sound = null;
    winnerCue();
    // A Final in the middle of the game went on to the next round.
    if (session.phase !== 'final' && session.intro?.stage === 'title') playCue(app.live, game, 'roundIntro');
  }

  /**
   * N in the final reveal: show the wager, then (once they're judged, C or X) the next player still to judge; finishing
   * takes a second N once all are judged.
   */
  function finalRevealNext(): void {
    const f = session.final;
    const cur = f?.current && f.order.includes(f.current) ? f.current : undefined;
    // Their wager is up: they're judged before anyone else is spotlit (N never skips past them).
    // (One with no wager in yet can't be judged: N goes on, as the main button says.)
    if (f && cur && f.shown[cur] && !f.results[cur] && typeof f.wagers[cur] === 'number')
      return toast(`Mark ${playerName(session, cur)} right (C) or wrong (X) first`);
    const r = finalAdvance(session);
    if (r === 'done') {
      // The final controls show "press N again to finish" while armed.
      if (finishArmed) {
        finalNextStep(session, game);
        finalStep();
      } else finishArmed = true;
    } else if (r === 'waiting' && session.final?.current)
      toast(`Mark ${playerName(session, session.final.current)} right (C) or wrong (X) first`);
  }

  /** Judge a player in the final reveal (their wager goes up with it). */
  function judge(id: string, right: boolean): void {
    // No wager typed for them: it's asked for (never taken as 0).
    if (!finalJudge(session, game, id, right)) return toast(`Enter ${playerName(session, id)}’s wager first (in their row)`, 4000);
    finalShow(session, id);
    playCue(app.live, game, right ? 'right' : 'wrong');
  }

  /** C / X in the final reveal: judge the spotlit player. */
  function finalJudgeKey(right: boolean): void {
    const id = session.final?.current;
    if (!id || session.phase !== 'final' || session.finalStep !== 'reveal') return;
    judge(id, right);
  }

  /** The action log goes back into earlier rounds too: Undo and Redo say where, since nobody can see it happen. */
  const inRound = (a: ActionEvent) => (a.round !== undefined && a.round !== session.currentRound ? ` (in ${game.rounds[a.round]?.name ?? 'another round'})` : '');

  /** What ↶ Undo would take back next, and ↷ Redo bring back (their tooltips say it). */
  const undoText = $derived.by(() => {
    const next = nextUndo(session);
    if (next?.log === 'action') {
      const a = session.actionLog!.at(-1)!;
      return `${a.text}${inRound(a)}`;
    }
    const here = (e: ScoreEvent) => !e.undone && stepOf(e) === next?.id && session.players.some((p) => p.id === e.playerId);
    return next ? describeStep(session, session.scoreLog.filter(here), sym) : null;
  });
  const redoText = $derived.by(() => {
    const from = redoFrom(session, [...undone]);
    const a = session.actionRedo?.at(-1);
    if (from === 'action' && a) return `${a.text}${inRound(a)}`;
    const top = session.scoreLog.find((e) => e.id === session.redoStack.at(-1));
    return top ? describeStep(session, session.scoreLog.filter((e) => e.undone && stepOf(e) === stepOf(top) && session.redoStack.includes(e.id)), sym) : null;
  });

  /**
   * One Undo: whichever came last, a score change or a step (an RPG or board-game move, an item, a tile marked played, the
   * picker, a Players or Final change). Returns what it took back, or null with nothing to undo.
   */
  function undoOnce(): string | null {
    const next = nextUndo(session);
    if (next?.log === 'action') {
      const a = undoAction(session, game)!;
      undone.push({ log: 'action', id: a.id });
      return `${a.text}${inRound(a)}`;
    }
    const events = undo(session);
    if (!events.length) return null;
    undone.push({ log: 'score', id: stepOf(events[0]) });
    return describeStep(session, events, sym);
  }

  /** One Redo, back the way the Undos went. Returns what it brought back, or null with nothing to redo. */
  function redoOnce(): string | null {
    if (redoFrom(session, undone) === 'action') {
      const a = redoAction(session, game);
      if (a) return `${a.text}${inRound(a)}`;
    }
    const events = redo(session);
    return events.length ? describeStep(session, events, sym) : null;
  }

  function doUndo(): void {
    const text = undoOnce();
    // No Redo button in the toast: it sits over the host's nav row. ↷ Redo is next to ↶ Undo (or Ctrl+Shift+Z).
    if (text) toast(`Undid ${text}`, 4000);
    else toast('Nothing to undo');
  }

  function doRedo(): void {
    const text = redoOnce();
    if (text) toast(`Redid ${text}`);
  }

  const clock = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  /** 🕘 History's ↶ Back to here: undo every step newer than the row (a roll or a change undone in Scores marks a moment). */
  function undoBackTo(row: TimelineRow): void {
    const moment = row.kind === 'roll' || (row.kind === 'score' && row.state === 'off');
    let n = 0;
    // Undo goes newest first, so the row is reached once everything newer is undone.
    for (let next = nextUndo(session); next && next.id !== row.id && (moment ? next.ts > row.ts : next.ts >= row.ts) && n < 1000; next = nextUndo(session)) {
      if (!undoOnce()) break;
      n++;
    }
    if (n) toast(`Undid ${n} step${n === 1 ? '' : 's'} (back to ${clock(row.ts)})`, 4000);
  }

  /** 🕘 History's ↷ Redo to here: redo until that row is back. */
  function redoUpTo(row: TimelineRow): void {
    let n = 0;
    while (stillUndone(session, row) && n < 1000 && redoOnce()) n++;
    if (n) toast(`Redid ${n} step${n === 1 ? '' : 's'} (up to ${clock(row.ts)})`);
  }

  // ---------- RPG rounds ----------

  const NUMPAD: Record<string, Dir8> = { Numpad8: 'n', Numpad9: 'ne', Numpad6: 'e', Numpad3: 'se', Numpad2: 's', Numpad1: 'sw', Numpad4: 'w', Numpad7: 'nw' };
  const ALTKEY: Record<string, Dir8> = {
    q: 'nw', w: 'n', e: 'ne', a: 'w', d: 'e', z: 'sw', x: 's', c: 'se', arrowup: 'n', arrowdown: 's', arrowleft: 'w', arrowright: 'e',
  };

  function rpgStep(d: Dir8): void {
    const why = stepParty(game, session, d);
    if (why) toast(why);
    rpgObject = null;
  }

  /** Files dropped on the stage in an RPG round become hidden objects on the screen they're dropped on. */
  async function dropOnStage(e: DragEvent): Promise<void> {
    if (session.phase !== 'rpg' || !e.dataTransfer?.files.length) return;
    e.preventDefault();
    const at = stagePoint(e);
    for (const file of Array.from(e.dataTransfer.files)) {
      try {
        const el = await droppedFile(game, file, at);
        if (addLive(game, session, el, `Added ${el.name}`, at.screen)) {
          rpgObject = el.id;
          toast(`Added ${el.name}, hidden: reveal it from its card`, 3000);
        }
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), 4000);
      }
    }
  }

  /** An object on the stage was dragged on its own: it stays there (undoable), and it's what's selected now. */
  function objectMoved(id: string, at: { x: number; y: number }): void {
    const { st } = rpgNow(game, session);
    if (!st) return;
    const name = objectAt(game, session, id)?.el.name || 'object';
    logged(session, `Move ${name}`, () => Object.assign(override(st, id), at));
    if (!rpgSelObjects.includes(id)) [selected, rpgSelObjects] = [[], [id]];
  }

  /** An object on the stage was clicked: its card, or with Shift or Ctrl, in or out of the selection. */
  function objectClicked(id: string, toggle?: boolean): void {
    if (!toggle) return void (rpgObject = id);
    rpgSelObjects = rpgSelObjects.includes(id) ? rpgSelObjects.filter((x) => x !== id) : [...rpgSelObjects, id];
  }

  /** An item or a pile of currency on the stage was dropped on a player: they pick it up. */
  function objectPicked(id: string, playerId: string): void {
    const found = objectAt(game, session, id);
    if (!found) return;
    toast(pickUp(game, session, found.st, found.el, playerId), 3000);
    if (rpgObject === id) rpgObject = null;
  }

  /** Take an object off the stage (the Delete key, its menu): its card closes. */
  function removeObj(id: string): void {
    const said = removeObject(game, session, id);
    if (said) toast(said, 3000);
    if (rpgObject === id) rpgObject = null;
  }

  // ---------- Dragging an inventory item from a player's card onto the stage ----------

  /** The player an item dragged over the stage would go to (their avatar, token or card on the stats strip). */
  const itemTo = (e: DragEvent) => (e.target as HTMLElement).closest<HTMLElement>('[data-player-id]')?.dataset.playerId;

  function itemOver(e: DragEvent): void {
    const d = itemDrag.now;
    if (!d) return;
    const to = itemTo(e);
    // On a player: they get it. On an RPG screen: it's dropped there.
    if ((to && to !== d.from) || (!to && session.phase === 'rpg')) e.preventDefault();
    dropHover.at = to && to !== d.from ? `player:${to}` : null;
  }

  function itemDrop(e: DragEvent): void {
    const d = itemDrag.now;
    const to = itemTo(e);
    dragDone();
    if (!d) return;
    e.preventDefault();
    const said = to ? to !== d.from && giveEntry(game, session, d.from, to, d.entryId, d.n) : dropEntry(game, session, d.from, d.entryId, d.n, stagePoint(e));
    if (said) toast(said, 3000);
  }

  // ---------- Right-click on the stage (host) ----------

  /** Stage coordinates (1920×1080) of a pointer event over the stage: in an RPG round, on the screen under it (split view has several). */
  function stagePoint(e: MouseEvent): StagePoint {
    const pane = (e.target as HTMLElement).closest<HTMLElement>('.pane[data-screen]');
    const box = (pane ?? (e.currentTarget as HTMLElement).querySelector('.stage'))?.getBoundingClientRect();
    if (!box) return { x: SLIDE_W / 2, y: SLIDE_H / 2 };
    const at = { x: ((e.clientX - box.left) / box.width) * SLIDE_W, y: ((e.clientY - box.top) / box.height) * SLIDE_H };
    return pane ? { ...at, screen: { map: pane.dataset.map!, screen: pane.dataset.screen! } } : at;
  }

  const toggleSelect = (id: string) => (selected = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  /** Right-click a player anywhere in the host's window (the stage, the host panel): their menu. */
  function playerMenuAt(e: MouseEvent): void {
    if (e.defaultPrevented) return;
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-player-id]')?.dataset.playerId;
    if (!id || !session.players.some((p) => p.id === id)) return;
    // What it asks of the host panel brings the controls back when they're hidden.
    const [heading, ...rest] = playerMenu(
      {
        game,
        session,
        selected,
        toggle: toggleSelect,
        setScore: (who) => ((hideControls = false), (editingScore = who)),
        sendTo: (players, label) => ((hideControls = false), (rpgMapSend = { players, label }), (rpgMap = true)),
        openCard: (who) => ((hideControls = false), (playerCards.open = true), (playerCards.flash = who)),
      },
      id,
    );
    // The Final reveals: judging them comes first (their score plate on the stage, their chip in the host panel).
    const f = session.final;
    const reveal: MenuEntry[] =
      session.phase === 'final' && session.finalStep === 'reveal' && f?.order.includes(id)
        ? [
            { label: '🔦 Spotlight', disabled: f.current === id, onclick: () => (f.current = id) },
            { label: 'Show wager', disabled: !!f.shown[id], onclick: () => finalShow(session, id) },
            { label: `✔ Right${f.current === id ? ' (C)' : ''}`, onclick: () => judge(id, true) },
            { label: `✘ Wrong${f.current === id ? ' (X)' : ''}`, onclick: () => judge(id, false) },
            { sep: true },
          ]
        : [];
    showMenu(e, heading ? [heading, ...reveal, ...rest] : []);
  }

  function stageMenu(e: MouseEvent): void {
    if (e.defaultPrevented) return;
    const t = e.target as HTMLElement;
    const objId = t.closest<HTMLElement>('[data-object]')?.dataset.object;
    const playerId = t.closest<HTMLElement>('[data-player-id]')?.dataset.playerId;
    const spaceId = t.closest<HTMLElement>('[data-space]')?.dataset.space;
    if (playerId && session.players.some((p) => p.id === playerId)) return playerMenuAt(e);
    if (session.phase === 'rpg') {
      const { st } = rpgNow(game, session);
      if (!st) return;
      if (objId) {
        // Removed: its card closes, as with the Delete key.
        const removed = (text: string) => (toast(text, 3000), rpgObject === objId && (rpgObject = null));
        return showMenu(e, objectMenu(game, session, objId, { open: () => ((hideControls = false), (rpgObject = objId)), removed }));
      }
      const at = stagePoint(e);
      return showMenu(e, [
        // The host panel asks for the text (with the controls hidden, they come back for it).
        { label: '＋ Text here…', onclick: () => ((hideControls = false), (rpgAsk = { what: 'text', at })) },
        { label: '🗺 Full map (jump anywhere)', onclick: () => (rpgMap = true) },
        { label: st.mapShown ? '🗺 Hide the map from viewers' : '🗺 Show the map to viewers', onclick: () => toggleMap(game, session) },
        { label: app.live.cover ? '▶ Uncover the screen' : '⏸ Cover the screen', onclick: () => (app.live.cover = !app.live.cover) },
      ]);
    }
    if (session.phase === 'boardgame') {
      const { round, bs } = boardNow(game, session);
      if (!round || !bs) return;
      const turnId = bs.order[bs.turn];
      if (spaceId) {
        const sp = round.spaces.find((s) => s.id === spaceId);
        if (!sp) return;
        const movers = selected.length ? selected : turnId ? [turnId] : [];
        const them = selected.length ? `the selected (${selected.length})` : playerName(session, turnId);
        return showMenu(e, [
          { heading: sp.name },
          { label: '🗂 Open its card', onclick: () => ((hideControls = false), (bgSpace = sp.id)) },
          {
            label: `📍 Put ${them} here`,
            disabled: !movers.length || movers.every((m) => bs.positions[m]?.space === sp.id),
            onclick: () => sendNow(game, session, movers, { space: sp.id }),
          },
          {
            label: `▶ Run its landing actions for ${them}`,
            disabled: !movers.length || !sp.onLand?.length,
            onclick: () => toast(runSpace(game, session, app.live, sp, movers), 3000),
          },
          {
            label: '👁 Reveal this space',
            disabled: !sp.secret || !!bs.revealed?.includes(sp.id),
            onclick: () => logged(session, `Reveal ${sp.name}`, () => (bs.revealed = [...(bs.revealed ?? []), sp.id])),
          },
        ]);
      }
    }
    // Anywhere else on the host's stage: never the browser's own menu (it may be on stream).
    return showMenu(e, [{ label: app.live.cover ? '▶ Uncover the screen' : '⏸ Cover the screen', onclick: () => (app.live.cover = !app.live.cover) }]);
  }

  /** A score plate on the stage during the Final reveals: spotlight that player (their wager stays hidden until N). */
  function spotlight(id: string): void {
    const f = session.final;
    if (!f || session.finalStep !== 'reveal') return;
    const round = currentFinal(session, game);
    if (f.order.includes(id)) f.current = id;
    else toast(`${playerName(session, id)} isn't playing ${round ? finalName(round) : 'this Final'}`);
  }

  /**
   * An avatar on the stage was clicked (selected), or dragged: to a spot on its screen, to another screen (a map's, a
   * split-view pane, or off an edge with a way out) or onto a party. Selected, the rest of the selection goes with it.
   */
  function avatarAct(id: string, drop?: AvatarDrop): void {
    const { st } = rpgNow(game, session);
    if (!drop || !st?.positions[id]) return void toggleSelect(id);
    // Dragged while not selected: it goes on its own, and it's what's selected now.
    const who = selected.includes(id) ? selected.filter((x) => st.positions[x]) : [id];
    if (!selected.includes(id)) [selected, rpgSelObjects] = [[id], []];
    if ('spot' in drop) return logged(session, `Move ${playerName(session, id)}`, () => Object.assign(st.positions[id], drop.spot));
    const said = 'party' in drop ? joinPartyNow(game, session, who, drop.party) : sendPlayers(game, session, who, drop.to, drop);
    if (said) toast(said, 3000);
  }

  // ---------- Board games: tokens and spaces on the stage ----------

  /** A token was clicked (selected), or dragged onto a space or a zone (sent there, with the rest of the selection). */
  function tokenAct(id: string, to?: { space?: string; zone?: string }): void {
    if (!to) return void toggleSelect(id);
    const said = sendNow(game, session, selected.includes(id) ? selected : [id], to);
    if (said) toast(said, 3000);
  }

  /** A space was clicked: at a fork (or on a one-space board) a way on, the same as its button; otherwise its card. */
  function spaceAct(id: string): void {
    const { round, bs } = boardNow(game, session);
    const w = round && bs ? waysNow(round, bs) : null;
    if (w?.ways.includes(id)) {
      toast(moveNow(game, session, w.steps, id, w.playerId), 3000);
      app.live.overlay = null;
    } else bgSpace = bgSpace === id ? null : id;
  }

  /** Players added by "＋ Add 3 sample players", by id → their sample name. */
  const samples = new Map<string, string>();

  function start(): void {
    if (!session.players.length) return;
    // A name left blank (or only spaces, or invisible characters) would be an empty plate on stream.
    session.players.forEach((p, i) => blankName(p.name) && (p.name = `Player ${i + 1}`));
    // A board short of Daily Doubles (a new one's ⭐ Daily Doubles 1, none placed) would play without them: the rest go
    // in at random now, each board a step as 🎲 Place now is.
    const placed = game.rounds.flatMap((r, ri) => (isBoard(r) && dailyDoublesShort(r) ? [{ n: placeDailyDoubles(ri, false), name: r.name }] : []));
    const n = placed.reduce((a, p) => a + p.n, 0);
    const where = nameList(placed.filter((p) => p.n).map((p) => p.name));
    if (n) toast(`⭐ Placed ${n} Daily Double${n === 1 ? '' : 's'} at random in ${where} (${n === 1 ? 'it wasn’t' : 'they weren’t'} on the board yet)`, 5000);
    // (The players are kept with the game as they're changed here: see keepRoster.)
    // A picture chosen for a player here was stored in the editor's game: the game being played gets it too.
    for (const p of session.players) {
      const m = p.avatar && !game.media.some((x) => x.id === p.avatar) ? app.game.media.find((x) => x.id === p.avatar) : undefined;
      if (m) game.media.push($state.snapshot(m));
    }
    // This game now replaces any older saved one (autosave starts once pre-game is over), its room too.
    app.resumable = null;
    void clearRoom();
    app.pregame = false;
    app.live.soonAt = undefined;
    // A game can open with a Final or an RPG round: those start through goToRound (only a title card).
    if (!isBoard(game.rounds[0])) goToRound(session, game, 0);
    else startIntro(session, game);
    if (session.intro?.stage === 'title') playCue(app.live, game, 'roundIntro');
  }

  // ---------- Pre-game ----------

  /** The display picked (🖥 Display, remembered from the last game): the audience window opens on Start if it isn't yet. */
  const wantAudience = $derived(dual || prefs.display === 'audience');
  function pickDisplay(audienceWindow: boolean): void {
    prefs.display = audienceWindow ? 'audience' : 'single';
    savePrefs();
    if (!audienceWindow && dual) closeAudienceWindow();
    else if (audienceWindow && !dual) void openAudience();
  }

  /** Buzzer mode is on and the room is up: its code, and the players whose phones are in. */
  const roomUp = $derived(phonesOn && !!remote.code && remote.status !== 'off' && remote.status !== 'error');
  const phonesIn = $derived(session.players.filter((p) => remote.phones.some((ph) => ph.seatId === p.id && ph.connected)).length);
  /** Start was pressed with Buzzer mode on but no room: the bar asks (start it first, or play without phones). */
  let askNoRoom = $state(false);
  $effect(() => {
    if (roomUp || !phonesOn) askNoRoom = false;
  });

  /**
   * Start game ▶ (or Ctrl+Enter): with Buzzer mode on and no room yet, it asks first; with the audience window picked,
   * that opens now (from the click: a browser lets only a click open it).
   */
  async function startClicked(): Promise<void> {
    if (!session.players.length) return;
    if (phonesOn && !roomUp && !askNoRoom) return void (askNoRoom = true);
    askNoRoom = false;
    if (wantAudience && !dual && !(await openAudience())) return;
    start();
  }

  /** The room started from the bar's question (or the card): scrolled into view, its code above the Start bar. */
  async function startRoomHere(): Promise<void> {
    askNoRoom = false;
    await startPhoneRoom();
    await tick();
    document.querySelector('[data-place="play:buzzers"]')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  /** ✎ Rename on the pre-game screen: the game's title (on stream), kept in the editor too (undoable there). */
  let renaming = $state(false);
  const untitled = $derived(!game.title.trim() || game.title.trim() === 'Untitled Game');
  function rename(to: string): void {
    renaming = false;
    const title = to.trim();
    if (!title || title === game.title) return;
    game.title = title;
    if (editorHasIt()) step(`Named the game “${title}”`, () => (app.game.title = title), { during: 'play' });
  }

  /** ⚙ Set up phone buzzers… (the 📱 card, when this app has no buzzer server): ⚙ Settings, at the phone buzzers. */
  let showSettings = $state(false);

  /** The pre-game's ▶ Resume: the game kept to resume plays on, in the display picked here (and its room, if open). */
  function resumeKept(withEdits: boolean): void {
    const r = session.remote;
    const room = r && phonesOn && inRoom(r.code) ? $state.snapshot(r) : null;
    // The room goes on with the resumed game: leaving this screen mustn't close it.
    if (room) keepRoomOpen = true;
    onresume?.(withEdits, room);
  }

  /** Things worth fixing before going live (warnings only: Start still works). */
  const checks = $derived.by(() => {
    // (A board short of Daily Doubles gets a button to place them.)
    // (Daily Doubles not placed yet are only a note in the editor, as Start places them: here they're listed with it.)
    return validate(game)
      .map((p) => {
        const r = typeof p.tab === 'number' ? game.rounds[p.tab] : undefined;
        const dd = isBoard(r) && !!dailyDoublesShort(r) && p.text.includes('Daily Double') && p.text.includes(' not placed yet');
        return { text: p.text, level: p.level, ddRound: dd ? (p.tab as number) : undefined };
      })
      .filter((p) => p.level === 'warn' || p.ddRound !== undefined);
  });

  /**
   * Scatter the missing Daily Doubles now (in this game and in the editor's copy, so they're kept).
   * The ones placed by hand stay where they are.
   */
  function placeDailyDoubles(ri: number, tell = true): number {
    const r = game.rounds[ri];
    if (!isBoard(r)) return 0;
    const dds = () => r.categories.flatMap((c) => c.clues.filter((cl) => cl.type === 'dailyDouble').map((cl) => cl.id));
    const before = new Set(dds());
    const n = randomizeDailyDoubles(r, r.dailyDoubleCount ?? 1, Math.random, { keepExisting: true });
    const added = new Set(dds().filter((id) => !before.has(id)));
    // (Placed on the way into the game: nowhere to put one, no step.)
    if (!n && !tell) return 0;
    const edited = app.game.rounds.find((x) => x.id === r.id);
    step(
      `Placed ${n} Daily Double${n === 1 ? '' : 's'} in ${r.name}`,
      () => {
        for (const c of isBoard(edited) ? edited.categories : [])
          for (const cl of c.clues) if (added.has(cl.id) && cl.type === 'standard') cl.type = 'dailyDouble';
      },
      { during: 'play' },
    );
    if (tell) toast(`Placed ${n} Daily Double${n === 1 ? '' : 's'} in ${r.name}`);
    return n;
  }

  /** Daily Doubles the boards want (their ⭐ Daily Doubles box) but haven't got: Start game places them at random. */
  const unplacedDDs = $derived(
    game.rounds.reduce((n, r) => {
      const short = isBoard(r) ? dailyDoublesShort(r) : null;
      return n + (short ? short.want - short.placed : 0);
    }, 0),
  );

  // ---------- The game's players and rules (pre-game) ----------

  /** The editor holds this same game (after resuming an older save it may not; a player-only file has no editor). */
  const editorHasIt = () => !app.playerOnly && app.game.id === game.id;

  /**
   * The pre-game screen is where the game's players are set: each change to the list here (a name, a color, a picture,
   * the order, a player added or deleted) is kept with the game, in the editor's copy too, as an undoable change in its
   * history. Sample players nobody renamed aren't kept. (Start scores are only for this game.)
   */
  function keepRoster(g: Game, list: RosterRow[], before: RosterRow[]): void {
    const next = keptRoster($state.snapshot(g.players), list, before);
    if (JSON.stringify(next) !== JSON.stringify($state.snapshot(g.players))) g.players = next;
  }
  /** The pre-game list as last kept (for its pictures: one taken off there comes off the game's player too). */
  let rosterSeen: { s: unknown; key: string; list: RosterRow[] } = { s: null, key: '', list: [] };
  $effect(() => {
    if (!app.pregame) return;
    const list: RosterRow[] = session.players
      .filter((p) => samples.get(p.id) !== p.name)
      .map(({ id, name, color, avatar }) => ({ id, name, color, ...(avatar ? { avatar } : {}) }));
    const key = JSON.stringify(list);
    // A new pre-game (a rematch) starts from its players as they are.
    if (rosterSeen.s !== session) return void (rosterSeen = { s: session, key, list });
    if (key === rosterSeen.key) return;
    const before = rosterSeen.list;
    rosterSeen = { s: session, key, list };
    untrack(() => {
      keepRoster(game, list, before);
      if (editorHasIt()) keepRoster(app.game, list, before);
    });
  });

  /** The settings ⚖ Game rules sets. */
  const RULES = [
    'allowNegativeScores', 'deductOnWrong', 'pickerFollowsAward', 'currencySymbol', 'maxPlayers', 'defaultTimerSeconds', 'timerAutoStart',
    'roundIntro',
  ] as const satisfies readonly (keyof GameSettings)[];
  // ⚖ Game rules changes the game being played (before it, or mid-game from the host panel); the editor's copy of
  // the game keeps each change (undoable there).
  let rulesSeen = '';
  $effect(() => {
    const rules = JSON.stringify(RULES.map((k) => game.settings[k] ?? null));
    if (!rulesSeen || rules === rulesSeen) return void (rulesSeen = rules);
    rulesSeen = rules;
    untrack(() => {
      if (!editorHasIt()) return;
      const to = app.game.settings as unknown as Record<string, unknown>;
      for (const k of RULES) {
        const v = $state.snapshot(game.settings[k]);
        if (JSON.stringify(v ?? null) === JSON.stringify($state.snapshot(to[k]) ?? null)) continue;
        if (v === undefined) delete to[k];
        else to[k] = v;
      }
    });
  });

  // ---------- On stream (pre-game) ----------

  type StreamSettings = NonNullable<GameSettings['stream']>;
  const stream = $derived(game.settings.stream ?? {});

  /** A stream card's words or a caption, here and in the editor's copy of this game (kept, undoable there). */
  function setStream<K extends keyof StreamSettings>(key: K, value: StreamSettings[K], label: string): void {
    const apply = (g: Game) => (g.settings.stream = { ...g.settings.stream, [key]: value });
    apply(game);
    if (app.game.id === game.id) step(label, () => apply(app.game), { during: 'play' });
  }

  /** A stream card's words changed, as the 🕘 History says it ("Cover card text “Snack break”"). */
  const cardLabel = (card: string, text: string) => (text.trim() ? `${card} card text “${text.trim().slice(0, 40)}”` : `${card} card text back to the default`);

  /** Minutes the "Starting soon" card counts down from. */
  let soonMinutes = $state(5);
  /** Seconds left on the "Starting soon" countdown, for the host (ticks only while there's one). */
  let soonLeft = $state(0);
  $effect(() => {
    const at = app.live.soonAt;
    if (!at) return;
    const tick = () => (soonLeft = Math.max(0, Math.ceil((at - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  });

  function addSamplePlayers(): void {
    for (const name of ['Alex', 'Sam', 'Jordan']) {
      if (session.players.length >= game.settings.maxPlayers) break;
      const id = newId();
      samples.set(id, name);
      session.players.push({ id, name, color: nextFreeColor(session.players.map((p) => p.color)), startScore: 0 });
    }
  }

  /** At the most players (👥 Players, or before the game): one more may join. */
  function raiseMost(): void {
    if (game.settings.maxPlayers < MAX_PLAYERS) game.settings.maxPlayers++;
  }

  // ---------- Undo and redo before the game ----------

  /** The editor's steps when this pre-game opened: Ctrl+Z here takes back only the changes made since. */
  let editorSteps = new Set<string>();
  $effect(() => {
    if (!app.pregame) return;
    void session;
    untrack(() => {
      commit();
      editorSteps = new Set(history.entries.map((e) => e.id));
    });
  });

  // The text field in focus, so Ctrl+Z stays its own while it has typing of its own (as in the editor).
  const fields = createFieldTracker();

  /**
   * Ctrl+Z / Ctrl+Y (Ctrl+Shift+Z) before the game: the editor's history, as in the editor (the same steps 🕘 History
   * shows), for the changes made here (players, rules, buzzers, on stream, Daily Doubles placed). Never the browser's
   * own undo, which would change the last field typed in.
   */
  function pregameKey(e: KeyboardEvent): void {
    // Ctrl+Enter starts the game from wherever the focus is on the page (not in a window over it).
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && !e.repeat && !e.defaultPrevented) {
      const t = e.target instanceof Element ? e.target : null;
      if (showSound || t?.closest('[role="dialog"], [role="menu"]')) return;
      e.preventDefault();
      if (!session.players.length) return void toast('Add players to start');
      // (A field being typed in keeps what's in it: its change lands first.)
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      return void startClicked();
    }
    const key = undoKeyOf(e);
    if (!key || e.defaultPrevented || fields.native(e, key)) return;
    e.preventDefault();
    // A window over the screen (🔊 Sound for Discord / OBS, ⚙ Settings) isn't about the game.
    if (showSound || showSettings) return;
    if (!editorHasIt()) return void toast(app.playerOnly ? 'Nothing to undo here' : 'Undo works for the game open in the editor');
    commit();
    const next = key === 'undo' ? history.entries[history.index - 1] : history.entries[history.index];
    if (!next || editorSteps.has(next.id)) {
      return void toast(key === 'undo' ? 'Nothing more to undo here (earlier changes are undone in the editor)' : 'Nothing to redo');
    }
    const done = key === 'undo' ? undoStep('key') : redoStep('key');
    fields.afterGlobal();
    if (!done) return;
    fromEditor();
    toast(`${key === 'undo' ? '↶ Undid' : '↷ Redid'} ${done.label}`);
  }

  /** The buzzer settings (the 📱 Phone buzzers card). */
  const BUZZ = ['buzzer', 'buzzArm', 'phoneJoin', 'earlyBuzzLock', 'buzzTeams'] as const satisfies readonly (keyof GameSettings)[];

  /** An undo or redo changed the editor's game: the game here, and the players listed, follow it. */
  function fromEditor(): void {
    const src = app.game;
    const to = game.settings as unknown as Record<string, unknown>;
    for (const k of [...RULES, ...BUZZ, 'stream'] as const) {
      const v = $state.snapshot(src.settings[k]);
      if (JSON.stringify(v ?? null) === JSON.stringify($state.snapshot(to[k]) ?? null)) continue;
      if (v === undefined) delete to[k];
      else to[k] = v;
    }
    if (!buzzerOn(game.settings)) closeRoom();
    // Daily Doubles placed here (🎲 Place now).
    for (const r of game.rounds) {
      const e = src.rounds.find((x) => x.id === r.id);
      if (!isBoard(r) || !isBoard(e)) continue;
      for (const c of r.categories)
        for (const cl of c.clues) {
          const t = e.categories.find((x) => x.id === c.id)?.clues.find((x) => x.id === cl.id)?.type;
          if (t && t !== cl.type && (t === 'dailyDouble' || cl.type === 'dailyDouble')) cl.type = t;
        }
    }
    // The players: as the editor's game has them (start scores kept), and the sample players nobody renamed.
    const was = new Map(session.players.map((p) => [p.id, p]));
    const kept = src.players.map((t) => {
      const p = was.get(t.id);
      return { id: t.id, name: t.name, color: t.color, ...(t.avatar ? { avatar: t.avatar } : {}), startScore: p?.startScore ?? 0 };
    });
    const sampled = session.players.filter((p) => samples.get(p.id) === p.name && !kept.some((k) => k.id === p.id));
    const list = [...kept, ...$state.snapshot(sampled)];
    if (JSON.stringify(list) !== JSON.stringify($state.snapshot(session.players))) session.players = list;
    const players = $state.snapshot(src.players);
    if (JSON.stringify(players) !== JSON.stringify($state.snapshot(game.players))) game.players = players;
    // The game's name (✎ Rename here).
    if (src.title !== game.title) game.title = src.title;
  }

  // Before the game, what Tab reaches near the foot of the window scrolls above the sticky Start bar, not under it.
  $effect(() => {
    if (!app.pregame) return;
    const root = document.documentElement;
    root.style.scrollPaddingBottom = '96px';
    return () => void (root.style.scrollPaddingBottom = '');
  });

  // ---------- History's Go there (a pre-game part) ----------

  onMount(() => {
    const part = app.pregameAt;
    app.pregameAt = null;
    if (!part || !app.pregame) return;
    void tick().then(() => {
      const el = document.querySelector<HTMLElement>(`[data-place="play:${part}"]`);
      if (!el) return;
      if (el instanceof HTMLDetailsElement) el.open = true;
      el.scrollIntoView({ block: 'nearest' });
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 1200);
    });
  });

  // ---------- Players mid-game ----------

  /** Player whose ✕ was pressed in the Players dialog: it asks inline (a browser dialog would show on stream). */
  let removing = $state<string | null>(null);
  const removingPlayer = $derived(session.players.find((p) => p.id === removing));

  function removeFromGame(id: string): void {
    removing = null;
    removePlayer(session, id);
    selected = selected.filter((x) => x !== id);
  }

  // Each change in the Players dialog (a name or a color set, a player moved, added, removed or restored) is one
  // undoable step: the step under way ends with the click or the change that made it, and the next one begins.
  let rosterStep: ((text: string) => void) | null = null;
  let rosterBefore: { players: Player[]; removed: Player[] } = { players: [], removed: [] };

  function beginRoster(): void {
    rosterBefore = { players: $state.snapshot(session.players), removed: $state.snapshot(session.removedPlayers ?? []) };
    rosterStep = startStep(session);
  }

  function commitRoster(): void {
    if (!rosterStep) return;
    // The round's party or turn order takes the change in with it, so its Undo puts them back too.
    catchUp();
    rosterStep(rosterChange(rosterBefore, { players: session.players, removed: session.removedPlayers }));
    beginRoster();
  }

  function openPlayers(): void {
    removing = null;
    showPlayers = true;
    beginRoster();
  }

  function closePlayers(): void {
    commitRoster();
    rosterStep = null;
    showPlayers = false;
  }

  /** Esc in the Players dialog: out of a name box first, then away from the "Remove?" question, then the dialog closes. */
  function playersEsc(e: KeyboardEvent): void {
    e.preventDefault();
    if (e.target instanceof HTMLElement && e.target.matches('input, select')) e.target.blur();
    else if (removing) removing = null;
    else closePlayers();
  }

  /**
   * Enter in a board-game round with nobody selected (or no amount typed): move the steps in the host panel's box, or on
   * a board that moves one space at a time, take the only way on. At a fork it says to pick the way. False when there's
   * nothing to move (Enter then awards, as anywhere else).
   */
  function boardEnter(): boolean {
    const { round, bs } = boardNow(game, session);
    if (!round || !bs) return false;
    if (bs.fork) {
      toast(`${playerName(session, bs.fork.playerId)} is at a fork: pick the way first (on the stage, or in the host panel)`);
      return true;
    }
    let steps = bgSteps;
    let way: string | undefined;
    if (round.mover.kind === 'step') {
      const id = currentPlayer(bs);
      const at = id ? bs.positions[id]?.space : undefined;
      const ways = id && at ? waysOn(round, at, bs.prev?.[id]) : [];
      if (ways.length !== 1) return false;
      [steps, way] = [1, ways[0]];
    }
    if (!steps) return false;
    // D then Enter at once: the dice (or the wheel) are still going on screen, and the move would end them early.
    const o = app.live.overlay;
    if ((o?.kind === 'dice' || o?.kind === 'wheel') && Date.now() < overlayDoneAt(o)) {
      toast(`Still ${o.kind === 'dice' ? 'rolling' : 'spinning'}: Enter again once it lands`);
      return true;
    }
    toast(moveNow(game, session, steps, way), 3000);
    app.live.overlay = null;
    bgSteps = null;
    return true;
  }

  /**
   * ✎ Edit board's keys: E starts (and ends) it; while editing, Esc lets go of what's picked (then ends it), Delete
   * deletes the picked space or link, F2 renames, and the round's moves (D, Enter, N) wait. True when the key was used.
   */
  function boardEditKey(e: KeyboardEvent, k: string): boolean {
    if (!boardEdit.on) {
      hideControls = false;
      setEditing(true);
      return true;
    }
    if (k === 'e' && !e.shiftKey) setEditing(false);
    else if (k === 'escape') {
      if (boardEdit.sel || boardEdit.link || boardEdit.adding || boardEdit.connecting) {
        if (boardEdit.adding || boardEdit.connecting) [boardEdit.adding, boardEdit.connecting] = [false, false];
        else editIdle();
      } else setEditing(false);
    } else if (k === 'delete' || k === 'backspace') {
      if (boardEdit.sel) editDelete(game, session, boardEdit.sel);
      else if (boardEdit.link) editDisconnect(game, session, boardEdit.link);
    } else if (k === 'f2') {
      hideControls = false;
      void tick().then(() => document.querySelector<HTMLInputElement>('[data-edit-name]')?.select());
    } else if (k === 'd' || k === 'enter' || k === 'n') toast('Editing the board: press Esc (or ✓ Done editing) to play on');
    else return false;
    return true;
  }

  // What Tab (or Shift+Tab) moved the focus to. (Not :focus-visible: browsers show a clicked button's focus too, once any
  // key is pressed.) A Tab that moved nothing here (out to the browser's address bar) doesn't count for the next click.
  let tabbing = false;
  let tabbedTo: EventTarget | null = null;

  function onkey(e: KeyboardEvent): void {
    // The ? list hears this window's keys itself; Esc or ? from the audience window (no target here) closes it too.
    if (showKeys && !e.target && (e.key === 'Escape' || e.key === '?')) return void (showKeys = false);
    if (showPlayers && e.key === 'Escape' && e.target) return playersEsc(e);
    if (app.pregame) return pregameKey(e);
    // The live screen editor (RPG) has its own keys.
    if (showPlayers || showRules || showKeys || showSound || app.editGame || rpgMap) return;
    // (A key from the audience window has no target here.)
    const t = e.target instanceof HTMLElement ? e.target : null;
    // Typing in a field (a quick-wheel list, a wager…) is never a shortcut, not even '?'. A ticked checkbox isn't a field,
    // but Space still ticks it (not the media), and Enter is its own (the wager boxes' Enter, next to "Ignore the limits").
    if (t?.closest('input:not([type="checkbox"]), textarea, select, [contenteditable]') || ((e.key === ' ' || e.key === 'Enter') && t?.matches('input'))) return;
    // Enter or Space on a button reached with Tab presses it (a tile opens). On a button clicked with the mouse, Enter
    // still awards.
    if ((e.key === ' ' || e.key === 'Enter') && t && t.matches('button, [role="button"]') && (t === tabbedTo || t.matches('.tile[data-clue]:not(.used)'))) return;
    if (e.key === '?') {
      showKeys = true;
      return;
    }
    const k = e.key.toLowerCase();

    if ((e.ctrlKey || e.metaKey) && k === 'z') {
      e.preventDefault();
      if (e.shiftKey) doRedo();
      else doUndo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && k === 'y') {
      e.preventDefault();
      doRedo();
      return;
    }
    if (session.phase === 'rpg' && !e.ctrlKey && !e.metaKey) {
      const d = NUMPAD[e.code] ?? (e.altKey ? ALTKEY[k] : undefined);
      if (d) {
        e.preventDefault();
        rpgStep(d);
        return;
      }
      if (e.code === 'Numpad5') {
        e.preventDefault();
        regroupAll(game, session);
        return;
      }
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    // Board games: E edits the board; while it's edited, its own keys (and none of the round's moves).
    if (session.phase === 'boardgame' && (boardEdit.on || (k === 'e' && !e.shiftKey)) && boardEditKey(e, k)) {
      e.preventDefault();
      return;
    }

    // RPG rounds: the full map (J), regroup (G) and the map on screen for viewers (V; M mutes the media, as anywhere).
    if (session.phase === 'rpg' && !e.shiftKey && ['g', 'v', 'j'].includes(k)) {
      e.preventDefault();
      if (k === 'j') rpgMap = true;
      else if (k === 'g') regroupAll(game, session);
      else toggleMap(game, session);
      return;
    }
    // The toolset's key in RPG and board-game rounds: a player's sheet (I).
    if ((session.phase === 'rpg' || session.phase === 'boardgame') && !e.shiftKey && k === 'i') {
      e.preventDefault();
      if (app.live.overlay?.kind === 'sheet') {
        // I again: the next selected player's sheet, then closed.
        const at = selected.indexOf(app.live.overlay.playerId);
        const next = selected[at + 1];
        app.live.overlay = next ? { kind: 'sheet', nonce: newId(), playerId: next } : null;
      } else {
        const id = selected[0] ?? session.players[0]?.id;
        if (id) app.live.overlay = { kind: 'sheet', nonce: newId(), playerId: id };
      }
      return;
    }

    if (/^[0-9]$/.test(e.key)) {
      const n = +e.key;
      const reveal = session.phase === 'final' && session.finalStep === 'reveal' ? session.final : undefined;
      if (pickerPending) {
        // P then a number with no such player (0 among them) just ends the P.
        const p = session.players[n - 1];
        if (p) setPicker(session, p.id);
      } else if (reveal && n) {
        // The final reveals: spotlight the Nth player in the reveal order (N shows their wager).
        if (!reveal.order[n - 1]) return;
        reveal.current = reveal.order[n - 1];
      } else if (buzzing && !n) {
        // 0: reset the buzzers (nobody locked out, open for everyone). 1–9 pick a player by hand, over any phone's buzz.
        openBuzzers(true);
      } else if (!n) {
        // 0: everyone, or no one (a group award is 0, then Enter).
        selected = selected.length === session.players.length ? [] : session.players.map((p) => p.id);
      } else {
        const p = session.players[n - 1];
        if (!p) return;
        selected = selected.includes(p.id) ? selected.filter((x) => x !== p.id) : [...selected, p.id];
      }
      pickerPending = false;
      return;
    }
    pickerPending = false;

    switch (k) {
      case 'enter':
        // Board games with nobody selected: move (see boardEnter).
        if (session.phase === 'boardgame' && (!selected.length || !amount) && !e.shiftKey && boardEnter()) break;
        // Only where the award row is up (not on the Daily Double splash, the final reveals or the end screen).
        if (awardOpen(session)) award(e.shiftKey ? -1 : 1);
        break;
      case 'r':
        revealToggle();
        break;
      case 'escape':
        if (showLog) showLog = false;
        else if (app.live.overlay) closeOverlay();
        else if (rpgObject) rpgObject = null;
        else if (rpgSelObjects.length) rpgSelObjects = [];
        else if (bgSpace) bgSpace = null;
        // Shift+Esc cancels: back to the board without using up the tile.
        else if (session.phase === 'clue' && e.shiftKey) cancelClue();
        else if (session.phase === 'clue') back();
        else if (selected.length) selected = [];
        break;
      case 'd':
        // Board games: roll (or spin) the round's own mover.
        if (session.phase === 'boardgame') {
          const why = rollMover(game, session, app.live);
          if (why) toast(why);
          break;
        }
        if (!toolBusy()) rollDice(app.live, session, lastDice);
        break;
      case 'w': {
        const o = app.live.overlay;
        if (toolBusy()) break;
        if (o?.kind === 'wheel') {
          if (wheelSpentUp(o, session, game)) toast('Every slice has landed: Restore them to spin again');
          else spinWheel(app.live, session, game);
        } else if (game.wheels[0]) openWheel(app.live, session, game.wheels[0]);
        else toast('No saved wheels: use the 🎡 Wheel button for a quick one');
        break;
      }
      case 'o': {
        if (toolBusy()) break;
        // On a tie for first at the end: the tied leaders roll for the win (not "Who goes first?").
        const ties = session.phase === 'end' && !session.coWinners ? tiedLeaders(session) : [];
        if (ties.length) rolloff(ties.map((p) => p.id), game.settings.rollOffDie || 20, 'tiebreak');
        else rolloff(session.players.map((p) => p.id), game.settings.rollOffDie || 20);
        break;
      }
      case 's':
        toggleScoreboard(app.live);
        break;
      case 'n':
        // Shift+N goes the other way: the turn before, the player before in the reveals, or a clue's slide before.
        if (session.intro) {
          // The round's intro first (its title card, then a board's tiles and categories).
          if (!e.shiftKey) intro();
        } else if (session.phase === 'boardgame') turnNow(game, session, e.shiftKey ? -1 : 1);
        else if (session.phase === 'final' && session.finalStep === 'reveal') {
          if (e.shiftKey) finalBack(session);
          else finalRevealNext();
        } else if (session.phase === 'clue') {
          // Shift+N: a clue's question slide before. N: whatever the host panel's main button shows (the next slide,
          // 🔔 Open the buzzers, 👁 Reveal answer, ▦ Done ▶ board…).
          if (e.shiftKey) slideStep(-1);
          else if (hostNext && !hostNext.disabled) hostNext.run();
          else slideStep(1);
        } else if (e.shiftKey) break;
        else if (session.phase === 'final' && session.finalStep === 'wagers' && !finalWagersOk(session, wagerLimitsOff)) wagersWaiting();
        else if (session.phase === 'final') {
          finalNextStep(session, game);
          finalStep();
        }
        break;
      case 'c':
      case 'x':
        finalJudgeKey(k === 'c');
        break;
      case 't':
        // Shift+T: 10 more seconds on the countdown that's up.
        if (e.shiftKey && app.live.timer) addTime(app.live, 10);
        else if (app.live.timer && !app.live.timer.expired) toggleTimer(app.live);
        else startTimer(app.live, timerSeconds || clueTimer() || game.settings.defaultTimerSeconds || 30);
        break;
      // The cover, in every round (B as well, the key many stream tools use for "be right back").
      case 'k':
      case 'b':
        app.live.cover = !app.live.cover;
        break;
      case 'p':
        pickerPending = true;
        break;
      case 'l':
        showLog = !showLog;
        break;
      case 'h':
        hideAgain = false;
        hideControls = !hideControls;
        break;
      case 'f':
        toggleFullscreen();
        break;
      case 'a':
        // Shift+A: the scores-only window (opens or focuses it).
        if (e.shiftKey) openScores();
        else openAudience();
        break;
      case ' ': {
        const m = firstMedia();
        if (m) mediaCommand({ el: m[0], op: 'toggle' });
        break;
      }
      case 'arrowleft':
      case 'arrowright': {
        const m = firstMedia();
        if (m) mediaCommand({ el: m[0], op: 'seekBy', value: k === 'arrowleft' ? -5 : 5 });
        break;
      }
      case 'm': {
        const m = firstMedia();
        if (m) mediaCommand({ el: m[0], op: 'muted', value: !m[1].muted });
        break;
      }
      case 'u':
        // Buzzer mode: open the buzzers (after reading the clue, when the 📱 Phone buzzers card says the host opens them).
        if (!buzzing) return;
        openBuzzers();
        break;
      case 'y': {
        const m = firstMedia();
        if (m?.[1].openUrl && !openMediaPopup(m[1].openUrl)) toast(POPUP_FAILED, 5000);
        break;
      }
      case 'delete':
      case 'backspace':
        // The RPG object whose card is open comes off the screen (Ctrl+Z brings it back).
        if (session.phase === 'rpg' && rpgObject) removeObj(rpgObject);
        else return;
        break;
      default:
        return;
    }
    e.preventDefault();
  }
</script>

<svelte:window
  onkeydown={onkey}
  onpointermove={pointerMove}
  onkeydowncapture={(e) => (tabbing = e.key === 'Tab')}
  onpointerdowncapture={() => (tabbing = false)}
  onfocusin={(e) => {
    tabbedTo = tabbing ? e.target : null;
    tabbing = false;
    fields.focusin(e);
  }}
  oninput={(e) => fields.input(e as Event & { inputType?: string })}
/>

{#if app.pregame}
  <main class="pregame">
    <div class="pregame-top">
      <!-- ▶ Play lands here (keyboard and screen reader users start at the top of the page, not on <body>). The game's
           name shows on stream: it's renamed right here. -->
      <div class="title-row">
        {#if renaming}
          <input
            class="title-in"
            value={game.title}
            maxlength="120"
            aria-label="Game title"
            use:takeFocus
            onfocus={(e) => e.currentTarget.select()}
            onkeydown={(e) => {
              if (e.key === 'Enter') rename(e.currentTarget.value);
              else if (e.key === 'Escape') {
                e.stopPropagation();
                renaming = false;
              }
            }}
            onblur={(e) => renaming && rename(e.currentTarget.value)}
          />
        {:else}
          <h1 tabindex="-1" use:takeFocus>{game.title}</h1>
          <button class="ghost small" onclick={() => (renaming = true)} title="The game's name shows on stream (the title card, the audience window)">✎ Rename</button>
          {#if untitled}<span class="warn small" data-warn="untitled">Name your game: its title shows on stream.</span>{/if}
        {/if}
      </div>
      {#if app.resumable && app.resumable.session.phase !== 'end'}
        {@const kept = app.resumable}
        <!-- A game kept to resume (Exit › Keep): play on with it here, or set up a fresh one below (Start replaces it). -->
        <div class="resume-card" role="group" aria-label="Game in progress">
          <span>
            ⏸ A game in progress is kept: <b>{kept.game.title}</b>
            <span class="muted small">(saved {new Date(kept.savedAt).toLocaleString()})</span>
          </span>
          <button class="primary" onclick={() => resumeKept(false)}>▶ Resume it</button>
          {#if !app.playerOnly && kept.game.id === app.game.id}
            <button onclick={() => resumeKept(true)} title="Play on with the editor's current version of this game (fixed typos, new slides…). Scores and used tiles are kept.">
              Resume with my edits
            </button>
          {/if}
          <span class="muted small">Or start fresh below: Start game replaces it.</span>
        </div>
      {/if}
    </div>
    <!-- Wide windows: who's playing on the left, how it's played and shown on the right. -->
    <div class="cols">
      <div class="col">
        <section class="part" data-place="play:players" aria-labelledby="pregame-players">
          <h2 id="pregame-players">👥 Players</h2>
          <p class="hint">
            Who's playing{app.playerOnly ? '' : ' (kept with the game for next time)'}. Names and colors can still change during the
            game.
          </p>
          <!-- Deleting is done at once: the note under the list offers Undo. -->
          <PlayerList
            bind:players={session.players}
            max={game.settings.maxPlayers}
            showScores
            avatars={!app.playerOnly}
            rowMenu
            onraise={game.settings.maxPlayers < MAX_PLAYERS ? raiseMost : undefined}
          />
          {#if keyedOut.length && game.theme?.stageBg}
            {@const other = game.theme.stageBg === 'green' ? 'magenta' : 'green'}
            <p class="warn small" data-warn="chroma">
              ⚠ {nameList(keyedOut.map((p) => p.name || 'A player'))}’s color is close to the chroma key ({game.theme.stageBg}, 🎨 Theme ›
              Stage background): OBS would key it out on stream. Pick another color, or a {other} key.
            </p>
          {/if}
          {#if !session.players.length}
            <div class="row">
              <span class="warn">Add players to start: ＋ Add player, or</span>
              <button onclick={addSamplePlayers}>＋ Add 3 sample players</button>
            </div>
          {/if}
        </section>
        <div class="part" data-place="play:buzzers">
          <PhoneRoom
            {session}
            settings={game.settings}
            onset={setBuzzSetting}
            max={game.settings.maxPlayers}
            onstart={startRoomHere}
            onadd={addPhonePlayer}
            onreject={rejectPhone}
            onkick={kickPhone}
            onclose={closePhoneRoom}
            onlock={lockSeats}
            onkickmember={kickTeamMember}
            onmove={moveTeamMember}
            onsetup={app.playerOnly ? undefined : () => (showSettings = true)}
          />
        </div>
        {#if prefs.liveChecklist}
          {@render goingLive()}
        {/if}
      </div>
      <div class="col">
        <GameRules s={game.settings} players={session.players.length} />

        <section class="part" aria-labelledby="pregame-display">
          <h2 id="pregame-display">🖥 Display</h2>
          <ModeCards dual={wantAudience} onsingle={() => pickDisplay(false)} onaudience={() => pickDisplay(true)} />
          {#if wantAudience && !dual}
            <p class="muted small" data-note="audience-on-start">📺 The audience window opens when you press Start (or click its card now).</p>
          {/if}
          {#if !prefs.liveChecklist}
            <button class="ghost small" onclick={() => ((prefs.liveChecklist = true), savePrefs())}>✅ Show the “Going live?” checklist</button>
          {/if}
          {#if !wantAudience}
            <p class="warn small exposed">
              ⚠ In single-window mode viewers see everything on screen: the wagers as you type them, and the answers, host notes
              and hidden objects shown in the controls. To keep those secret, use the audience window.
            </p>
          {/if}
          <SoundWarnings {dual} onhelp={() => (showSound = true)} />
        </section>

        <section class="part" data-place="play:stream" aria-labelledby="pregame-stream">
          <h2 id="pregame-stream">📺 On stream</h2>
          <div class="stream-opts">
            <label class="field">
              “Starting soon” card
              <input
                value={stream.soonText ?? ''}
                placeholder="Starting soon…"
                onchange={(e) => setStream('soonText', e.currentTarget.value.trim() || undefined, cardLabel('Starting soon', e.currentTarget.value))}
              />
            </label>
            <div class="field" role="group" aria-labelledby="pregame-soon">
              <span id="pregame-soon">Countdown on the “Starting soon” card</span>
              <div class="row">
              {#if app.live.soonAt}
                <span class="small soon-left" role="timer">{soonLeft ? `Starting in ${Math.floor(soonLeft / 60)}:${String(soonLeft % 60).padStart(2, '0')}` : 'Starting now!'}</span>
                <button onclick={() => (app.live.soonAt = undefined)} aria-label="Stop countdown">■ Stop</button>
              {:else}
                <label class="check small">
                  <input type="number" min="1" max="120" class="mins" bind:value={soonMinutes} aria-label="Countdown minutes" /> min
                </label>
                <button disabled={!soonMinutes || soonMinutes < 0} onclick={() => (app.live.soonAt = Date.now() + soonMinutes * 60_000)}>
                  ▶ Start countdown
                </button>
              {/if}
              </div>
            </div>
            <label class="field">
              Cover card (K)
              <input
                value={stream.coverText ?? ''}
                placeholder="Be right back"
                onchange={(e) => setStream('coverText', e.currentTarget.value.trim() || undefined, cardLabel('Cover', e.currentTarget.value))}
              />
            </label>
            <span class="hint">The theme's banner picture shows on both cards, when there is one.</span>
            <label class="check small">
              <input
                type="checkbox"
                checked={!!stream.clueCaption}
                onchange={(e) => setStream('clueCaption', e.currentTarget.checked || undefined, `Category and value caption on clues ${e.currentTarget.checked ? 'on' : 'off'}`)}
              />
              Show the category and value on clue screens (“MEMES · $400”)
            </label>
            {#if game.rounds.some(isRpg)}
              <label class="check small">
                <input
                  type="checkbox"
                  checked={!!stream.placeCaption}
                  onchange={(e) => setStream('placeCaption', e.currentTarget.checked || undefined, `Screen name caption in RPG rounds ${e.currentTarget.checked ? 'on' : 'off'}`)}
                />
                Show the screen's name in RPG rounds
              </label>
            {/if}
            {#if phonesOn}
              <label class="check small">
                <input
                  type="checkbox"
                  checked={!stream.hideJoinCode}
                  onchange={(e) => setStream('hideJoinCode', e.currentTarget.checked ? undefined : true, `Join code in a corner of the stream ${e.currentTarget.checked ? 'on' : 'off'}`)}
                />
                Show the phone buzzers' join code in a corner during the game (and on the cover card), while the room is open
              </label>
            {/if}
            <label class="check small" title="The same as ⚙ Settings › Reduce motion on stream (kept on this computer)">
              <input type="checkbox" bind:checked={prefs.reduceMotion} onchange={savePrefs} />
              Reduce motion on stream (no pop-ins, fly-ins or confetti)
            </label>
          </div>

          <div class="row">
            <button class="small" onclick={() => (showSound = true)}>🔊 Sound for Discord / OBS…</button>
            <span class="muted small">Test the sound, pick where it plays, and see how to stream it.</span>
          </div>
        </section>

        {#if checks.length}
          <details class="checks">
            <summary>⚠ {checks.length} thing{checks.length === 1 ? '' : 's'} to check</summary>
            <ul>
              {#each checks as c}
                <li>
                  {c.text}
                  {#if c.ddRound !== undefined}
                    {@const ri = c.ddRound}
                    <button class="small" onclick={() => placeDailyDoubles(ri)}>🎲 Place now</button>
                  {/if}
                </li>
              {/each}
            </ul>
            <div class="row">
              {#if !app.playerOnly}<button class="small" onclick={backToEditor}>◀ Fix in editor</button>{/if}
              <span class="muted small">These are only warnings: you can still start.</span>
            </div>
          </details>
        {/if}
      </div>
    </div>

    <!-- Always in view at the foot of the window, however long the page above gets. -->
    <div class="actions">
      <button class="ghost" onclick={backToEditor}>{app.playerOnly ? '◀ Back' : '◀ Back to editor'}</button>
      <!-- The notes wrap in their own room: Start stays at the right end of the bar, on its line. -->
      <span class="notes">
        {#if askNoRoom}
          <!-- Buzzer mode with no room: Start asks here (not a pop-up), and Back leaves things as they are. -->
          <InlineAsk
            text="Buzzer mode is on, but the buzzer room isn't started: no phone can join."
            alt="📱 Start the room first"
            onalt={startRoomHere}
            ok="Start without phones"
            cancel="Back"
            focusCancel
            onok={() => void startClicked()}
            oncancel={() => (askNoRoom = false)}
          />
        {:else if roomUp}
          <!-- The code stays in sight above the fold, however far the 📱 card is scrolled. -->
          <span class="small room-note" role="status">
            📱 Room <b>{remote.code}</b> · {phonesIn} of {session.players.length} joined
          </span>
        {/if}
        {#if !session.players.length}<span class="muted small">Add players to start</span>{/if}
        {#if unplacedDDs}
          <!-- Said here, not only in the folded checks: Start places them, so the round never plays without one. -->
          <span class="muted small" title="Place them yourself in the editor, or with 🎲 Place now in the checks above">
            ⭐ {unplacedDDs} Daily Double{unplacedDDs === 1 ? '' : 's'} not placed yet: Start puts {unplacedDDs === 1 ? 'it' : 'them'} on the board at random
          </span>
        {/if}
      </span>
      <button
        class="primary big"
        onclick={() => void startClicked()}
        disabled={!session.players.length}
        aria-keyshortcuts="Control+Enter"
        title={session.players.length ? `Start the game${wantAudience && !dual ? ', opening the audience window to capture in OBS' : ''} (Ctrl+Enter)` : 'Add players to start'}
      >
        {wantAudience && !dual ? '📺 Open audience window & start' : 'Start game ▶'}
        {#if session.players.length}<kbd class="start-key" aria-hidden="true">Ctrl+⏎</kbd>{/if}
      </button>
    </div>
  </main>
{:else}
  <!-- Right-clicking a player anywhere here (the stage, the host panel) gives their menu. The page's main part, named
       by the game's title (for screen readers). -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <main class="play" class:hidden={hideControls} class:side class:dual class:roomy={!dual && (showKeys || showPlayers || showRules || showLog)} oncontextmenu={playerMenuAt}>
    <h1 class="sr-only">{game.title}</h1>
    <!-- The stage keeps a floor: the host panel's tall parts (tools, Final, results, RPG and board game rounds) scroll. -->
    <div class="stage-area" class:dual>
      <div
        class="stage-box"
        role="presentation"
        ondragover={(e) => (itemDrag.now ? itemOver(e) : session.phase === 'rpg' && e.dataTransfer?.types.includes('Files') && e.preventDefault())}
        ondrop={(e) => (itemDrag.now ? itemDrop(e) : dropOnStage(e))}
        ondragleave={() => itemDrag.now && (dropHover.at = null)}
        oncontextmenu={stageMenu}
      >
        <Stage>
          <AudienceView
            {game}
            {session}
            live={app.live}
            role={dual ? 'mirror' : 'single'}
            onpick={pick}
            ontilemenu={tileMenu}
            onpicker={(id) => setPicker(session, session.currentPickerId === id ? undefined : id)}
            onspotlight={spotlight}
            onact={stageAct}
            onobject={objectClicked}
            onavatar={avatarAct}
            onobjectmove={objectMoved}
            onpickup={objectPicked}
            ongroupmove={(players, objects) => moveGroup(game, session, players, objects)}
            selectedObjects={rpgSelObjects}
            ontoken={tokenAct}
            onspace={spaceAct}
            {selected}
            onshopbuy={(item) => app.live.overlay?.kind === 'shop' && shopBuy(game, session, app.live.overlay, selected, item)}
          />
        </Stage>
      </div>
      {#if dual}
        <HostInfo {game} {session} />
      {/if}
    </div>
    {#if dragGhost.now}
      <!-- An avatar dragged off the stage (over the host panel), by the pointer. -->
      <div class="drag-ghost" style:left="{dragGhost.now.x}px" style:top="{dragGhost.now.y}px" aria-hidden="true">
        <Avatar player={dragGhost.now.player} size={44} />
      </div>
    {/if}
    {#if hideControls}
      <button class="show-controls" class:shown={pointerMoved} onclick={() => ((hideAgain = false), (hideControls = false))} title="H">Show controls</button>
      {#if hideNote}<div class="toast note-pill" role="status">Press H to bring the controls back</div>{/if}
    {:else}
      <HostPanel
        {game}
        {session}
        bind:selected
        bind:amount
        bind:rpgObject
        bind:rpgSelObjects
        bind:rpgMap
        bind:rpgAsk
        bind:rpgMapSend
        bind:bgSpace
        bind:editingScore
        bind:wagerLimitsOff
        {wagerPhones}
        {wagerNote}
        bind:timerSeconds
        bind:bgSteps
        {undoText}
        {redoText}
        {pickerPending}
        {finishArmed}
        onaward={(s) => award(s)}
        onright={(id) => award(1, [id], session.dd?.wager ?? info?.value ?? 0)}
        onwrong={(id) => award(-1, [id], session.dd?.wager ?? info?.value ?? 0)}
        onreveal={revealToggle}
        onslide={slideStep}
        onback={() => back()}
        oncancelclue={cancelClue}
        onreopen={toggleTile}
        onundo={doUndo}
        onredo={doRedo}
        onnextround={() => nextRound(1)}
        onprevround={() => nextRound(-1)}
        ongotoround={(i) => nextRound(i - session.currentRound)}
        onbackfromfinal={backFromFinal}
        onbackfromend={backFromEnd}
        onrematch={rematch}
        onintronext={intro}
        onskipintro={() => skipIntro(session)}
        onddshow={ddShow}
        onfinalstep={finalStep}
        ontiebreaker={tiebreaker}
        ontiebreakerdone={tiebreakerDone}
        oncowinners={winnerCue}
        onjudge={judge}
        onrevealnext={finalRevealNext}
        onlog={(tab) => {
          if (tab) logTab = tab;
          showLog = !!tab || !showLog;
        }}
        onplayers={openPlayers}
        onrules={() => (showRules = true)}
        {dual}
        {side}
        onaudience={toggleAudience}
        onscores={toggleScores}
        onsound={() => (showSound = true)}
        onkeys={() => (showKeys = true)}
        oncloseoverlay={closeOverlay}
        onopenbuzzers={openBuzzers}
        bind:nextAction={hostNext}
        tieNames={tie.length ? nameList(tie.map((id) => playerName(session, id))) : ''}
        onrolltie={rollTie}
        {phonesDown}
        onrolloff={(ids) => rolloff(ids, game.settings.rollOffDie || 20, 'tiebreak')}
        onhide={hideByButton}
        onexit={exitGame}
      >
        {#snippet buzzExtra()}
          {#if buzzing && buzz.phase === 'answering' && buzz.answering && buzz.by}
            <span class="buzzed-by" role="status">🔔 {whoBuzzed(playerName(session, buzz.answering), buzz.by)} buzzed</span>
          {/if}
          {#if buzzing && buzz.phase === 'answering' && buzz.answering}
            <button onclick={skipAnswering} title="No points taken: they can't buzz again on this clue, and the next in the buzz order answers">
              ⏭ Skip {playerName(session, buzz.answering)}
            </button>
          {/if}
          {#if nextInLine}
            <button onclick={() => takeNext(nextInLine.id, nextInLine.by)} title="They answer now (the buzzers stay open for the others until then)">→ Next in line: {nextInLine.name}</button>
          {/if}
          {#if queueRows.length}
            <ol class="buzz-queue" aria-label="Buzz order">
              {#each queueRows as r (r.id)}
                <li class:out={r.out}>
                  {r.rank}. {r.name}{#if r.rolled}&nbsp;🎲 {ordinal(r.rolled)}{/if}{#if r.after}&nbsp;<span class="muted">{r.after}</span>{/if}
                </li>
              {/each}
            </ol>
          {/if}
        {/snippet}
        {#snippet phoneChip()}
          {#if phonesOn}
            <PhoneChip
              {session}
              settings={game.settings}
              onset={setBuzzSetting}
              max={game.settings.maxPlayers}
              onstart={startPhoneRoom}
              onadd={addPhonePlayer}
              onreject={rejectPhone}
              onkick={kickPhone}
              onlock={lockSeats}
              onkickmember={kickTeamMember}
              onmove={moveTeamMember}
            />
          {/if}
        {/snippet}
        {#snippet tools()}
          <ToolLauncher {game} {session} onrolloff={rolloff} />
        {/snippet}
      </HostPanel>
    {/if}
  </main>
  {#if showKeys}
    <KeysHelp area={panelBox} onclose={() => (showKeys = false)} />
  {/if}
  {#if showLog && (dual || panelBox)}
    <!-- Single window: in the host panel (it grows for it), never over the stage viewers see. -->
    <ScoreLog {game} {session} {sym} bind:tab={logTab} area={panelBox} onreopen={toggleTile} onback={undoBackTo} onredoto={redoUpTo} onclose={() => (showLog = false)} />
  {/if}
  {#if showPlayers}
    <!-- Every click, change or dropped row (a player dragged to a new place) in here ends a step (see commitRoster). -->
    <div
      class="backdrop"
      class:in-panel={!!panelBox}
      style:top={panelBox ? `${panelBox.top}px` : undefined}
      style:left={panelBox ? `${panelBox.left}px` : undefined}
      style:width={panelBox ? `${panelBox.width}px` : undefined}
      style:height={panelBox ? `${panelBox.height}px` : undefined}
      role="presentation"
      onclick={(e) => (e.target === e.currentTarget ? closePlayers() : commitRoster())}
      onchange={commitRoster}
      ondrop={commitRoster}
    >
      <div class="modal" role="dialog" aria-modal="true" aria-label="Players" use:modal>
        <div class="row"><h2 class="modal-title">👥 Players</h2><span class="spacer"></span><button class="ghost modal-x" onclick={closePlayers} aria-label="Close" title="Close (Esc)">✕</button></div>
        <p class="muted">Add, remove, rename or recolor players. To change a score, click it in the host panel.</p>
        <PlayerList
          bind:players={session.players}
          max={game.settings.maxPlayers}
          inGame
          onremove={(id) => (removing = id)}
          onraise={game.settings.maxPlayers < MAX_PLAYERS ? raiseMost : undefined}
        />
        {#if removingPlayer}
          {@const p = removingPlayer}
          <div class="ask" role="alert">
            <span>
              Remove <b>{p.name}</b> ({formatPoints(score(session, p.id), sym)})? Their points leave the scoreboard. You can restore them
              here.
            </span>
            <button class="bad small" onclick={() => removeFromGame(p.id)}>Remove</button>
            <button class="small" onclick={() => (removing = null)} use:takeFocus>Keep</button>
          </div>
        {/if}
        {#if session.removedPlayers?.length}
          <div class="removed">
            <span class="muted small">Removed this game:</span>
            {#each session.removedPlayers as p (p.id)}
              <span class="gone" style:border-color={p.color}>
                {p.name} <span class="muted small">{formatPoints(score(session, p.id), sym)}</span>
                <button
                  class="small"
                  disabled={session.players.length >= game.settings.maxPlayers}
                  onclick={() => restorePlayer(session, p.id)}>↩ Restore</button>
              </span>
            {/each}
          </div>
        {/if}
        <div class="modal-foot"><button class="primary" onclick={closePlayers}>Done</button></div>
      </div>
    </div>
  {/if}
{/if}
{#if showRules && !app.pregame}
  <!-- ⚖ Game rules mid-game: changes count at once, and are kept with the game in the editor (undoable there). -->
  <div
    class="backdrop"
    class:in-panel={!!panelBox}
    style:top={panelBox ? `${panelBox.top}px` : undefined}
    style:left={panelBox ? `${panelBox.left}px` : undefined}
    style:width={panelBox ? `${panelBox.width}px` : undefined}
    style:height={panelBox ? `${panelBox.height}px` : undefined}
    role="presentation"
    onclick={(e) => e.target === e.currentTarget && (showRules = false)}
  >
    <div class="modal rules-modal" role="dialog" aria-label="Game rules" use:modal={{ esc: () => (showRules = false) }}>
      <div class="row">
        <h2 class="modal-title">⚖ Game rules</h2>
        <span class="spacer"></span>
        <button class="ghost modal-x" onclick={() => (showRules = false)} aria-label="Close" title="Close (Esc)">✕</button>
      </div>
      <p class="muted">For this game from now on{editorHasIt() ? ', and kept with it in the editor' : ''}.</p>
      <GameRules s={game.settings} players={session.players.length} folded={false} />
      <div class="modal-foot"><button class="primary" onclick={() => (showRules = false)}>Done</button></div>
    </div>
  </div>
{/if}
<!-- Before the game too (from the display settings) and during it (🔊 Sound in the host panel). -->
<!-- Before going live: the few things worth a look, ticked as they're done. Short, and ✕ hides it (for good, until it's
     shown again from 🖥 Display). -->
{#snippet goingLive()}
  <section class="part live-check" aria-labelledby="pregame-live">
    <div class="row live-head">
      <h2 id="pregame-live">✅ Going live?</h2>
      <button
        class="ghost small"
        onclick={() => ((prefs.liveChecklist = false), savePrefs())}
        aria-label="Hide the Going live checklist"
        title="Hide this checklist (🖥 Display can show it again)">✕</button
      >
    </div>
    <ul>
      <li class:done={dual || !wantAudience}>
        {#if dual}📺 Audience window open: capture it in OBS (Window capture).
        {:else if wantAudience}📺 The audience window opens when you press Start: capture it in OBS.
        {:else}🖥 Single window: viewers see this window. Press H in the game to hide the controls.{/if}
      </li>
      {#if phonesOn}
        <li class:done={roomUp && phonesIn > 0}>
          {#if !roomUp}📱 Buzzer mode is on: <button class="link-btn" onclick={startRoomHere}>start the room</button> so players can join.
          {:else}📱 Room {remote.code} open: {phonesIn} of {session.players.length} joined.{/if}
        </li>
      {/if}
      {#if wantAudience}
        <li class:done={dual && audience.activated} data-check="sound-click">
          {dual && audience.activated ? '🔊 The audience window can play sound.' : '🔊 Sound in the audience window: click it once (browsers keep it quiet until then).'}
        </li>
      {/if}
      <li class="tip">🔊 Streaming on Discord or OBS? <button class="link-btn" onclick={() => (showSound = true)}>Test the sound</button>.</li>
    </ul>
  </section>
{/snippet}

{#if showSettings}
  <SettingsDialog at="buzzer" onclose={() => (showSettings = false)} />
{/if}
{#if showSound}
  <AudioHelp {dual} windowTitle={audienceTitle(game)} onclose={() => (showSound = false)} />
{/if}

<style>
  .pregame {
    max-width: 860px;
    margin: 0 auto;
    padding: 32px 20px 0;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .pregame-top,
  .col,
  .part {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
  }
  .cols {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  /* Wide windows (a 1280 or 1366 laptop too): two columns, players and buzzers on the left; the rules, the display and
     on stream on the right, so the display choice is in view without scrolling. */
  @media (min-width: 1200px) {
    .pregame {
      max-width: 1360px;
    }
    .cols {
      display: grid;
      /* The player rows (name, start score, ▲▼🗑) want a little more room than the rules. */
      grid-template-columns: minmax(0, 7fr) minmax(0, 6fr);
      gap: 28px;
      align-items: start;
    }
  }
  .title-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .title-in {
    font-size: 22px;
    font-weight: 700;
    min-width: min(420px, 100%);
  }
  .resume-card {
    display: flex;
    align-items: center;
    gap: 8px 12px;
    flex-wrap: wrap;
    padding: 8px 12px;
    border: 1px solid var(--warn);
    border-radius: 8px;
  }
  .room-note {
    color: var(--good, var(--text));
  }
  .live-check ul {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 13px;
  }
  .live-check li::before {
    content: '○ ';
    color: var(--muted);
  }
  .live-check li.tip::before {
    content: '• ';
  }
  .live-check li.done::before {
    content: '✓ ';
    color: var(--good, #3ccf6e);
    font-weight: 700;
  }
  .live-head {
    justify-content: space-between;
  }
  .live-head h2 {
    margin: 0;
  }
  .link-btn {
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    text-decoration: underline;
    font: inherit;
    cursor: pointer;
  }
  .pregame h1 {
    margin: 0;
    /* A title that's one long word breaks rather than push the page sideways. */
    overflow-wrap: anywhere;
  }
  .pregame h1:focus {
    outline: none;
  }
  .pregame h2 {
    margin: 0;
    font-size: 16px;
  }
  /* One look for every part of the page: a card with its heading (Players, 📱 Phone buzzers, ⚖ Game rules, Display, On
     stream). */
  .pregame section.part,
  .pregame .part > :global(.card),
  .pregame :global(details.rules) {
    padding: 12px 16px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--panel);
  }
  .pregame section.part {
    gap: 12px;
  }
  .pregame :global(:is(.card, details.rules) h2) {
    font-size: 16px;
  }
  .pregame p {
    margin: 0;
  }
  .warn {
    color: var(--warn);
  }
  .buzz-queue {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 10px;
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 12px;
  }
  .buzzed-by {
    font-weight: 600;
  }
  .buzz-queue .out {
    text-decoration: line-through;
    color: var(--muted);
  }
  .small {
    font-size: 12px;
  }
  .stream-opts {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .stream-opts > .field > input {
    max-width: 360px;
  }
  .stream-opts > div.field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .stream-opts > div.field > span {
    color: var(--muted);
    font-size: 12px;
  }
  .mins {
    width: 70px;
  }
  .checks {
    border: 1px solid var(--warn);
    border-radius: 8px;
    padding: 8px 12px;
  }
  .checks summary {
    cursor: pointer;
    color: var(--warn);
    font-weight: 600;
  }
  .checks ul {
    margin: 8px 0;
    padding-left: 20px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  /* The way out and Start: stuck to the foot of the window, however long the page above (an open ⚖ Game rules). */
  .actions {
    position: sticky;
    bottom: 0;
    z-index: 5;
    display: flex;
    gap: 8px;
    align-items: center;
    margin: 4px -20px 0;
    padding: 10px 20px;
    background: var(--bg);
    border-top: 1px solid var(--border);
    box-shadow: 0 -8px 16px -8px rgba(0, 0, 0, 0.6);
  }
  .big {
    font-size: 16px;
    padding: 10px 22px;
  }
  /* Start game's key, as the host panel's main buttons show theirs. */
  .start-key {
    font: 11px/1 ui-monospace, monospace;
    padding: 2px 4px;
    margin-left: 6px;
    border: 1px solid currentColor;
    border-radius: 4px;
    opacity: 0.75;
    vertical-align: middle;
  }
  .actions > button {
    flex: none;
  }
  /* Between ◀ Back and Start: the notes, right against Start, wrapping onto lines of their own when they're long. */
  .actions .notes {
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    text-align: right;
  }
  .play {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  /* One window: exactly the window's height, never scrolling (that would take the stage out of sight on a short or
     scaled-up screen). The stage keeps its floor; the host panel under it scrolls instead. (Its pop-ups are fixed to
     the window, so its scrolling never cuts them off: see anchored.ts.) */
  .play:not(.dual) {
    overflow: hidden;
  }
  .play:not(.dual):not(.side) > :global(.panel) {
    overflow: auto;
  }
  .stage-area {
    flex: 1;
    min-height: 38vh;
    display: flex;
  }
  .stage-box {
    flex: 1;
    min-width: 0;
  }
  .stage-area.dual > :global(.info) {
    width: min(360px, 35vw);
    flex-shrink: 0;
  }
  /* The host panel beside the stage (see `side`). With an audience window, the host info goes under the stage. */
  .play.side {
    flex-direction: row;
  }
  .side > .stage-area {
    min-width: 0;
    min-height: 0;
  }
  .side > .stage-area.dual {
    flex-direction: column;
  }
  .side > .stage-area.dual > .stage-box {
    flex: none;
    aspect-ratio: 16 / 9;
    max-height: 75%;
  }
  /* Under the stage, the host info reads across in columns (a wide, short strip), not one long empty column. */
  .side > .stage-area.dual > :global(.info) {
    width: auto;
    flex: 1;
    min-height: 0;
    border-left: none;
    border-top: 1px solid var(--border);
    display: block;
    columns: 260px;
    column-fill: auto;
    column-gap: 24px;
    overflow: auto hidden;
  }
  .side > .stage-area.dual > :global(.info > *) {
    break-inside: avoid;
  }
  /* Beside the pointer, like a dragged file: what's under the pointer stays in sight. */
  .drag-ghost {
    position: fixed;
    z-index: 300;
    transform: translate(6px, 6px);
    opacity: 0.9;
    pointer-events: none;
    filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.6));
  }
  /* Out of sight (it would be on stream) until the mouse moves; keyboard focus shows it too. At the top right, clear of
     the score plates along the stage's foot. */
  .show-controls {
    position: fixed;
    right: 8px;
    top: 8px;
    z-index: 5;
    opacity: 0;
    font-size: 12px;
    transition: opacity 0.3s;
  }
  .show-controls.shown {
    opacity: 0.7;
  }
  .show-controls:hover,
  .show-controls:focus-visible {
    opacity: 1;
  }
  /* The host panel beside the stage: messages show over it, not over the stage, at its top (at its foot they'd cover
     the nav buttons: 👥 Players, Exit). */
  :global(body:has(.play.side) .toast) {
    left: auto;
    right: 12px;
    top: 12px;
    bottom: auto;
    transform: none;
    max-width: 400px;
  }
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: grid;
    /* A viewport-sized track so the modal's max-height/height: 100% resolves against the window. */
    grid-template-rows: minmax(0, 1fr);
    grid-template-columns: minmax(0, 1fr);
    place-items: center;
    z-index: 100;
    padding: 16px;
  }
  /* Single window: over the host panel only (it grows for it), never the stage viewers see. */
  .play.roomy:not(.side) > :global(.panel) {
    min-height: min(62vh, 440px);
  }
  .backdrop.in-panel {
    inset: auto;
    padding: 8px;
  }
  .modal {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    width: min(760px, 100%);
    max-height: 100%;
    overflow: auto;
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .modal h2,
  .modal p {
    margin: 0;
  }
  .removed {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .gone {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    border: 2px solid;
    border-radius: 8px;
    padding: 3px 3px 3px 8px;
  }
  .ask {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    padding: 8px 10px;
    border: 1px solid var(--warn);
    border-radius: 8px;
  }
</style>
