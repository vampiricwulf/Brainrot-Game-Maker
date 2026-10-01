<script lang="ts">
  import { modal, takeFocus } from '../lib/modal';
  import { app, toast } from '../lib/app.svelte';
  import { step } from '../lib/history.svelte';
  import { finalName, formatPoints, getClue, isBoard, isBoardGame, isRpg, newId, PLAYER_WHEEL, type ClueRef } from '../lib/model';
  import {
    applyScore, awardOpen, backToBoard, backToLastRound, currentFinal, clueName, clueReason, clueScored, currentClueInfo, ddShowQuestion, describeStep,
    finalAdvance, finalBack, finalJudge, finalNext, finalShow, finalUnjudged, findClueRef, goToRound, introNext, nameList, newSession, openClue, playerName,
    randomizeDailyDoubles, redo, removePlayer, restorePlayer, answerShowing, rosterChange, score, skipIntro, startIntro, toggleReveal, toggleUsed, undo,
    blankSlide, toolOnlyClue, finalWagersOk, startTiebreaker, roundMaxValue, stepOf,
  } from '../lib/session';
  import { addTime, newLive, overlayDoneAt, startTimer, timerRemaining, toggleTimer, type StageAction } from '../lib/live';
  import { buzzArm, buzzClueOpened, buzzDone, buzzIdle, buzzMissed, buzzReset, buzzTake, hostState, newBuzz, type BuzzState } from '../lib/buzz';
  import {
    acceptPhone, buzzerBase, closeRoom, kickSeat, onRoomBuzz, onRoomQueue, rejectPhone, rejoinRoom, remote, resendHostState, roomLink, sendHostState,
    startRoom,
  } from '../lib/remote.svelte';
  import type { RoomBuzz, RoomQueue } from '../lib/roomlink';
  import PhoneRoom from './PhoneRoom.svelte';
  import PhoneChip from './host/PhoneChip.svelte';
  import { openDice, openPlayerWheel, openWheel, quickDice, rollDice, spinWheel, startRollOff, toggleScoreboard } from '../lib/overlay';
  import type { DicePreset } from '../lib/model';
  import { tileDice } from '../lib/tools';
  import { validate } from '../lib/validate';
  import { nextFreeColor } from '../lib/colors';
  import ToolLauncher from './host/ToolLauncher.svelte';
  import KeysHelp from './KeysHelp.svelte';
  import Stage from '../lib/Stage.svelte';
  import PlayerList from '../editor/PlayerList.svelte';
  import AudienceView from './AudienceView.svelte';
  import HostPanel from './HostPanel.svelte';
  import ScoreLog, { type LogTab } from './ScoreLog.svelte';
  import HostInfo from './HostInfo.svelte';
  import AudioHelp from './AudioHelp.svelte';
  import SoundWarnings from './host/SoundWarnings.svelte';
  import { playCue } from './cues';
  import { watchSinks } from '../lib/audioout.svelte';
  import { logged, redoAction, redoFrom, setPicker, startStep, undoAction, type Undone } from '../lib/toolset';
  import { nextUndo, stillUndone, type TimelineRow } from '../lib/timeline';
  import {
    addLive, droppedFile, dropEntry, giveEntry, joinPartyNow, objectAt, objectMenu, pickUp, regroupAll, removeObject, rpgNow, sendPlayers, stepParty, toggleMap,
    type AvatarDrop, type RpgAsk, type StagePoint,
  } from './rpg/hostops';
  import { showMenu, type MenuEntry } from '../lib/menustate.svelte';
  import { currentPlayer, ensureBoard, waysNow, waysOn } from '../lib/boardgame';
  import { ensureWorld, override } from '../lib/rpg';
  import { boardNow, moveNow, rollMover, runSpace, sendNow, turnNow } from './boardgame/bgops';
  import { playerMenu } from './playermenu';
  import { playerCards } from './rpg/PlayerCard.svelte';
  import { dragDone, dragGhost, dropHover, itemDrag } from './dragdrop.svelte';
  import Avatar from '../lib/rpg/Avatar.svelte';
  import { shopBuy } from './host/shopops';
  import { SLIDE_H, SLIDE_W } from '../lib/model';
  import type { ActionEvent, Dir8, Game, GameSettings, Player, ScoreEvent } from '../lib/model';
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
  import { onMount, untrack } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';

  let {
    onexit,
    oncancel,
  }: {
    /** Leave the game (it stays saved and resumable). */
    onexit: () => void;
    /** Pre-game "Back to editor" ("Back" to the start screen in a player-only file): nothing was played, so nothing is saved or cleared. */
    oncancel: () => void;
  } = $props();

  // Play is only mounted when these exist.
  const game = $derived(app.playGame!);
  const session = $derived(app.session!);

  // Resuming into an open clue starts with its Amount (a Daily Double's wager, and who's playing it), as picking it did.
  const ddUp = untrack(() => (session.dd?.stage === 'question' ? session.dd : null));
  let selected = $state<string[]>(ddUp?.playerId ? [ddUp.playerId] : []);
  let amount = $state<number | null>(ddUp ? (ddUp.wager ?? null) : untrack(() => currentClueInfo(session, game)?.value ?? null));
  let showLog = $state(false);
  /** The 📜 Log's tab (L opens the one used last, 🕘 History to begin with). */
  let logTab = $state<LogTab>('history');
  let showPlayers = $state(false);
  let hideControls = $state(false);
  let showKeys = $state(false);
  /** The streaming-sound help (Test sound, output device, Discord/OBS steps). */
  let showSound = $state(false);
  /** P was pressed: the next 1–9 sets the picker. */
  let pickerPending = $state(false);
  /** Everyone in the final reveal is judged and N was pressed once: the next N finishes the game. */
  let finishArmed = $state(false);
  /** Final wagers: "Ignore the limits" is ticked, so a wager over its cap doesn't hold up N / Show question. */
  let wagerLimitsOff = $state(false);
  /** Seconds typed in the host panel's timer box: T starts that countdown, like its Start button. */
  let timerSeconds = $state<number | null>(null);
  /** RPG rounds: the object whose card is open in the host panel. */
  let rpgObject = $state<string | null>(null);
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
  // RPG, board-game and Final rounds have a tall host panel (the Final's wagers and reveal rows): on a wide window it goes
  // beside the stage instead of under it, so the stage keeps a good share, the same size all through the Final.
  const side = $derived(wide.current && (session.phase === 'rpg' || session.phase === 'boardgame' || session.phase === 'final'));

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
  $effect(() => {
    const g = $state.snapshot(game);
    if (audience.open || scoresWindow.open) pushGame(g);
  });
  $effect(() => {
    // The action log (the host's undo history) and the buzzer room's key stay here: viewers never need them.
    const { actionLog, actionRedo, remote, ...s } = session;
    if ((audience.open || scoresWindow.open) && !app.pregame) pushSession($state.snapshot(s));
  });
  $effect(() => {
    const l = $state.snapshot(app.live);
    if (audience.open || scoresWindow.open) pushLive(app.pregame ? { ...l, pregame: true } : l);
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
  $effect(() => {
    if (dual || !(showKeys || showPlayers)) return void (panelBox = null);
    // The list needs the controls (H hid them).
    hideControls = false;
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
  // "Ignore the limits" is for the wagers being entered now, not the next Final's.
  $effect(() => {
    void session.phase;
    wagerLimitsOff = false;
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
  // only, and so are a shop, a player's sheet or an object's pop-up on the stage: they don't follow into the next round.
  $effect(() => {
    void session.currentRound;
    rpgAsk = null;
    rpgObject = null;
    bgSpace = null;
    untrack(() => {
      const k = app.live.overlay?.kind;
      if (k === 'shop' || k === 'sheet' || k === 'popup') app.live.overlay = null;
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

  onMount(() => {
    registerGameFonts(game);
    // Game audio output: route every sound this window plays (single-window mode) to the chosen device.
    const offSinks = watchSinks();
    // Keys pressed in the audience window work as if pressed here (the host clicked it to allow sound).
    const offKeys = onAudienceKey((k) => onkey(new KeyboardEvent('keydown', k)));
    // Phone buzzers: a resumed game (after a reload or a crash) gets back into its room.
    const offBuzz = onRoomBuzz(roomBuzz);
    const offQueue = onRoomQueue(roomQueueIn);
    if (session.remote && phonesOn) rejoinRoom(session.remote);
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
      // Leaving the game (Exit, or back from the pre-game screen): the phones are told it's over.
      closeRoom();
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
  async function openAudience(): Promise<void> {
    if (!(await openAudienceWindow(audienceTitle(game))))
      toast(
        inTauri()
          ? "Couldn't open the audience window. Try again, or use single-window mode."
          : 'The browser blocked the popup. Allow popups for this file and try again.',
        5000,
      );
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

  function pop(text: string, color: string): void {
    const p = { id: newId(), text, color };
    app.live.pops.push(p);
    const live = app.live;
    later(() => (live.pops = live.pops.filter((x) => x.id !== p.id)), 2200);
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
    if (!amt) return toast('Enter an amount first');
    const events = applyScore(session, game, ids, sign * Math.abs(amt), reasonNow(), info?.clue.id);
    if (events.length) playCue(app.live, game, sign > 0 ? 'right' : 'wrong');
    // Buzzer mode: a right answer closes the buzzers; a wrong one locks that player out and opens them for the rest.
    const b = app.live.buzz;
    if (buzzing && b?.answering && events.length && ids.includes(b.answering))
      setBuzz(sign > 0 ? buzzDone(b) : buzzMissed(b, b.answering, session.players.map((p) => p.id)));
    for (const e of events) {
      const p = session.players.find((x) => x.id === e.playerId);
      if (p) pop(`${p.name} ${e.delta > 0 ? '+' : '−'}${sym}${Math.abs(e.delta).toLocaleString()}`, p.color);
    }
    // Awarding control of the board follows TV rules: the last correct player picks next.
    if (game.settings.pickerFollowsAward !== false && sign > 0 && ids.length === 1) session.currentPickerId = ids[0];
    selected = [];
  }

  const info = $derived(currentClueInfo(session, game));

  /** Buzzer mode, while a clue is open (a Daily Double has its one player): players buzz in. */
  const buzzing = $derived(!!game.settings.buzzer && session.phase === 'clue' && !session.dd);
  /** The buzzers' state (see buzz.ts). */
  const buzz = $derived(app.live.buzz ?? newBuzz(session.remote?.armId ?? 0));
  const playerIds = () => session.players.map((p) => p.id);

  function setBuzz(b: BuzzState): void {
    app.live.buzz = b;
    // The room's openings only go up, also after a reload (see Session.remote).
    if (session.remote && (session.remote.armId ?? 0) < b.armId) session.remote.armId = b.armId;
  }

  // The buzzers follow the clue: a tile opening (or a resumed game opening on one) starts them afresh, open at once or
  // closed until the host opens them (Setup); leaving it (back to the board, a Daily Double) puts them away.
  let buzzClue: string | null = null;
  $effect(() => {
    const c = session.currentClue;
    const key = buzzing && c ? `${c.round}.${c.cat}.${c.row}` : null;
    untrack(() => {
      if (key === buzzClue && app.live.buzz) return;
      buzzClue = key;
      setBuzz(key ? buzzClueOpened(buzz, game.settings.buzzArm !== 'host') : buzzIdle(buzz));
      // The phones' queue starts afresh: only openings after this one belong to this clue.
      roomQueue = null;
      clueArmFloor = buzz.phase === 'armed' ? buzz.armId - 1 : buzz.armId;
    });
  });
  // Outside buzzer mode viewers see who's answering too: the one player selected during a clue. In buzzer mode a player
  // picked (or let go) by a click in the host panel answers (or the buzzers open again for the others).
  $effect(() => {
    const one = session.phase === 'clue' && !session.dd && selected.length === 1 ? selected[0] : null;
    const on = buzzing;
    untrack(() => {
      const b = app.live.buzz;
      if (!on) {
        if (!game.settings.buzzer && (b?.answering ?? null) !== one) app.live.buzz = { ...buzzIdle(buzz), answering: one };
        return;
      }
      if (!b) return;
      if (one && one !== b.answering) setBuzz(buzzTake(b, one, true)!);
      else if (!one && b.answering) setBuzz(buzzArm({ ...b, answering: null }, playerIds()));
    });
  });

  /**
   * A player buzzed in (their number key, their key in the audience window, or their phone): the first one answers, the
   * others are locked out until a wrong answer or 0 opens the buzzers again. Never an undo step: a stray buzz must not
   * cost the host their redo.
   */
  function buzzPlayer(id: string, from: 'key' | 'phone' = 'key'): boolean {
    const b = app.live.buzz;
    const p = session.players.find((x) => x.id === id);
    // Someone picked already (by a key or a click): the host's choice stands.
    if (!buzzing || !b || !p || selected.length) return false;
    // A phone only counts while the buzzers are open (the room never lets one through otherwise, but a late one could).
    if (from === 'phone' && b.phase !== 'armed') return false;
    const next = buzzTake(b, id);
    if (!next) {
      if (from === 'key' && b.lockedOut.includes(id) && b.phase !== 'answering') toast(`${p.name} already missed this one (0 lets everyone buzz again)`);
      return false;
    }
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

  /** Setup › Rules: players buzz from their phones too. */
  const phonesOn = $derived(!!game.settings.buzzer && game.settings.buzzFrom === 'phones');
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
      name: session.players.find((p) => p.id === q.seatId)?.name ?? '?',
      after: q.afterMs ? `+${(q.afterMs / 1000).toFixed(2)} s` : '',
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
  /** After a wrong answer: the next player in the queue who hasn't missed this clue (the default stays the rebound). */
  const nextInLine = $derived(
    buzzing && buzz.phase !== 'answering' && !selected.length && buzz.lockedOut.length && !tie.length
      ? queueRows.find((r) => !r.out && r.id !== buzz.answering)
      : undefined,
  );
  const ordinal = (n: number) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'));

  function roomQueueIn(q: RoomQueue): void {
    if (!phonesOn || !buzzing || q.armId <= clueArmFloor || q.armId > buzz.armId) return;
    // An older opening's queue doesn't replace a newer one's.
    if (roomQueue && q.armId < roomQueue.armId) return;
    roomQueue = q;
  }

  /** → Next in line: they answer now, no new opening. Not an undo step (like a buzz). */
  function takeNext(id: string): void {
    const b = app.live.buzz;
    if (!buzzing || !b) return;
    setBuzz(buzzTake(b, id, true)!);
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

  /** A buzz the room let through: the first one answers (unless the host picked someone already). */
  function roomBuzz(b: RoomBuzz): void {
    if (!phonesOn) return;
    // The room moved on to "answering" by itself: if that's not what happened here, it hears the host's state again.
    if (b.rank === 1 && (b.armId !== buzz.armId || !buzzPlayer(b.seatId, 'phone'))) resendHostState();
  }

  /** Someone asked to join from their phone: a new player (an undoable step mid-game), then their phone gets the seat. */
  function addPhonePlayer(conn: string, name: string): void {
    if (session.players.length >= game.settings.maxPlayers) return toast(`The game is full: ${game.settings.maxPlayers} players at most (Setup)`);
    const who = name.trim().slice(0, 40) || `Player ${session.players.length + 1}`;
    const p = { id: newId(), name: who, color: nextFreeColor(session.players.map((x) => x.color)), startScore: 0 };
    if (app.pregame) session.players.push(p);
    else logged(session, `Added ${who} (from their phone)`, () => session.players.push(p));
    // The room has to know the seat before the phone takes it.
    sendHostState(hostState(game, session, buzz, earlyMs), true);
    acceptPhone(conn, p.id);
    toast(`${who} joined from their phone`);
  }

  function kickPhone(seatId: string): void {
    if (kickSeat(seatId)) toast(`${playerName(session, seatId)}'s phone let go of the seat`);
  }

  // Whatever the phones need to know (the players, scores, the buzzers, the clue's words) goes to the room as it changes.
  let sentPhase = '';
  $effect(() => {
    if (!phonesOn || remote.status === 'off' || remote.status === 'error') return;
    const st = hostState(game, session, buzz, earlyMs);
    // The buzzers opening goes at once (players are racing).
    const now = st.phase !== sentPhase && st.phase === 'armed';
    sentPhase = st.phase;
    untrack(() => sendHostState(st, now));
  });
  // Viewers' "Starting soon" card shows the room's code, link and QR code.
  $effect(() => {
    const live = app.live;
    const room = phonesOn && remote.code && remote.status !== 'off' && remote.status !== 'error' ? { code: remote.code, link: roomLink(remote.code) } : null;
    untrack(() => {
      if (live.room?.code !== room?.code || live.room?.link !== room?.link) live.room = room;
    });
  });

  /** Exit: the room closes (phones are told) and the saved game forgets it. */
  function exitGame(): void {
    closeRoom();
    session.remote = null;
    onexit();
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
    if (o.purpose === 'tiebreak') logged(s, `${playerName(s, o.winner)} won the roll-off`, () => (s.rollOffWinner = o.winner));
    else setPicker(s, o.winner, ' (roll-off)');
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
    toggleReveal(session);
    if (answerShowing(session)) {
      // A finished countdown has done its job once the answer is up.
      if (app.live.timer?.expired) app.live.timer = null;
      if (wasFinalQuestion) {
        app.live.timer = null;
        app.live.sound = null;
      }
      playCue(app.live, game, 'reveal');
    }
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
        if (!answerShowing(session)) revealToggle();
        break;
      case 'back':
        if (session.phase === 'clue') back();
        break;
      case 'final-next':
        finalNext(session, game);
        finalStep();
        break;
      case 'overlay':
        overlayPrimary();
        break;
    }
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
    else if (o.kind === 'wheel' && !o.spin) spinWheel(app.live, session, game);
    else if (o.kind === 'dice' && !o.roll) rollDice(app.live, session, o.preset);
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
    else if (!blankSlide(info.clue.questionSlide)) autoTimer();
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
    // The host panel's status row then offers "↶ Reopen <tile>" (no toast: it would cover the round buttons).
    backToBoard(session, game, { markUsed: !keep && session.dd?.stage !== 'splash' });
    selected = [];
    amount = null;
    app.live.timer = null;
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
    if (session.phase === 'end') playCue(app.live, game, 'winner');
  }

  /** Final round started by mistake (or a tile was skipped): back to the round before it, wagers kept. */
  function backFromFinal(): void {
    goToRound(session, game, Math.max(0, session.currentRound - 1));
    app.live.timer = null;
    app.live.sound = null;
  }

  /** From the end screen: back to the final reveals to fix a judgment, or to the board if there was no Final. */
  function backFromEnd(): void {
    app.live.sound = null;
    app.live.overlay = null;
    backToLastRound(session, game);
  }

  /** The tiebreaker clue, with the Amount ready (the last board's top value): select the winner and ＋ Award. */
  function tiebreaker(): void {
    startTiebreaker(session);
    selected = [];
    amount = game.rounds.map((_, i) => roundMaxValue(game, i)).filter(Boolean).at(-1) ?? null;
  }

  /** Same players (names and colors) at 0 and a fresh board, via the pre-game screen. */
  function rematch(): void {
    // Until the rematch starts, the finished game stays viewable from the editor ("View results").
    app.resumable = { game: $state.snapshot(game), session: $state.snapshot(session), savedAt: Date.now() };
    const s = newSession(game);
    s.players = session.players.map(({ id, name, color }) => ({ id, name, color, startScore: 0 }));
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
    if (session.phase === 'end') playCue(app.live, game, 'winner');
    // A Final in the middle of the game went on to the next round.
    if (session.phase !== 'final' && session.intro?.stage === 'title') playCue(app.live, game, 'roundIntro');
  }

  /** N in the final reveal: show the wager, then the next player; finishing takes a second N once all are judged. */
  function finalRevealNext(): void {
    const r = finalAdvance(session);
    if (r === 'done') {
      // The final controls show "press N again to finish" while armed.
      if (finishArmed) {
        finalNext(session, game);
        finalStep();
      } else finishArmed = true;
    } else if (r === 'waiting' && session.final?.current)
      toast(`Mark ${playerName(session, session.final.current)} right (C) or wrong (X) first`);
  }

  /** Judge a player in the final reveal (their wager goes up with it). */
  function judge(id: string, right: boolean): void {
    finalShow(session, id);
    finalJudge(session, game, id, right);
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

  /** An object on the stage was dragged: it stays there (undoable). */
  function objectMoved(id: string, at: { x: number; y: number }): void {
    const { st } = rpgNow(game, session);
    if (!st) return;
    const name = objectAt(game, session, id)?.el.name || 'object';
    logged(session, `Move ${name}`, () => Object.assign(override(st, id), at));
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
    if ('spot' in drop) return logged(session, `Move ${playerName(session, id)}`, () => Object.assign(st.positions[id], drop.spot));
    const who = selected.includes(id) ? selected.filter((x) => st.positions[x]) : [id];
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
    // A game without a saved roster keeps these players for next time: only if the editor holds this same game
    // (after resuming an older save it may not), and not the sample players unless they were renamed.
    const roster = session.players.filter((p) => samples.get(p.id) !== p.name);
    if (!app.playerOnly && app.game.id === game.id && !app.game.players.length && roster.length)
      step('Saved the players from the show', () => (app.game.players = roster.map(({ id, name, color }) => ({ id, name, color }))), { during: 'play' });
    // This game now replaces any older saved one (autosave starts once pre-game is over).
    app.resumable = null;
    app.pregame = false;
    app.live.soonAt = undefined;
    // A game can open with a Final or an RPG round: those start through goToRound (only a title card).
    if (!isBoard(game.rounds[0])) goToRound(session, game, 0);
    else startIntro(session, game);
    if (session.intro?.stage === 'title') playCue(app.live, game, 'roundIntro');
  }

  // ---------- Pre-game ----------

  /** Things worth fixing before going live (warnings only: Start still works). */
  const checks = $derived.by(() => {
    const out: { text: string; ddRound?: number }[] = validate(game)
      .filter((p) => p.level === 'warn')
      .map((p) => ({ text: p.text }));
    game.rounds.forEach((r, i) => {
      if (!isBoard(r)) return;
      const want = r.dailyDoubleCount ?? 1;
      const placed = r.categories.reduce((n, c) => n + c.clues.filter((cl) => cl.type === 'dailyDouble' && !cl.empty).length, 0);
      const listed = out.some((p) => p.text.startsWith(`${r.name}:`) && p.text.includes('Daily Double'));
      if (placed < want && !listed) out.push({ text: `${r.name}: ${want} Daily Double${want === 1 ? '' : 's'} wanted, ${placed} placed`, ddRound: i });
    });
    return out;
  });

  /**
   * Scatter the missing Daily Doubles now (in this game and in the editor's copy, so they're kept).
   * The ones placed by hand stay where they are.
   */
  function placeDailyDoubles(ri: number): void {
    const r = game.rounds[ri];
    if (!isBoard(r)) return;
    const dds = () => r.categories.flatMap((c) => c.clues.filter((cl) => cl.type === 'dailyDouble').map((cl) => cl.id));
    const before = new Set(dds());
    const n = randomizeDailyDoubles(r, r.dailyDoubleCount ?? 1, Math.random, { keepExisting: true });
    const added = new Set(dds().filter((id) => !before.has(id)));
    const edited = app.game.rounds.find((x) => x.id === r.id);
    step(
      `Placed ${n} Daily Double${n === 1 ? '' : 's'} in ${r.name}`,
      () => {
        for (const c of isBoard(edited) ? edited.categories : [])
          for (const cl of c.clues) if (added.has(cl.id) && cl.type === 'standard') cl.type = 'dailyDouble';
      },
      { during: 'play' },
    );
    toast(`Placed ${n} Daily Double${n === 1 ? '' : 's'} in ${r.name}`);
  }

  // ---------- On stream (pre-game) ----------

  type StreamSettings = NonNullable<GameSettings['stream']>;
  const stream = $derived(game.settings.stream ?? {});

  /** A stream card's words or a caption, here and in the editor's copy of this game (kept, undoable there). */
  function setStream<K extends keyof StreamSettings>(key: K, value: StreamSettings[K], label: string): void {
    const apply = (g: Game) => (g.settings.stream = { ...g.settings.stream, [key]: value });
    apply(game);
    if (app.game.id === game.id) step(label, () => apply(app.game), { during: 'play' });
  }

  /** Minutes the "Starting soon" card counts down from. */
  let soonMinutes = $state(5);

  function addSamplePlayers(): void {
    for (const name of ['Alex', 'Sam', 'Jordan']) {
      if (session.players.length >= game.settings.maxPlayers) break;
      const id = newId();
      samples.set(id, name);
      session.players.push({ id, name, color: nextFreeColor(session.players.map((p) => p.color)), startScore: 0 });
    }
  }

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
   * Enter in a board-game round with nobody selected: move the steps in the host panel's box, or on a board that moves one
   * space at a time, take the only way on. False when there's nothing to move (Enter then awards, as anywhere else).
   */
  function boardEnter(): boolean {
    const { round, bs } = boardNow(game, session);
    if (!round || !bs || bs.fork) return false;
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

  // What Tab (or Shift+Tab) moved the focus to. (Not :focus-visible: browsers show a clicked button's focus too, once any
  // key is pressed.) A Tab that moved nothing here (out to the browser's address bar) doesn't count for the next click.
  let tabbing = false;
  let tabbedTo: EventTarget | null = null;

  function onkey(e: KeyboardEvent): void {
    if (showPlayers && e.key === 'Escape' && e.target) return playersEsc(e);
    // The live screen editor (RPG) has its own keys.
    if (app.pregame || showPlayers || showKeys || showSound || app.editGame || rpgMap) return;
    // (A key from the audience window has no target here.)
    const t = e.target instanceof HTMLElement ? e.target : null;
    // Typing in a field (a quick-wheel list, a wager…) is never a shortcut, not even '?'. A ticked checkbox isn't a field,
    // but Space still ticks it (not the media), and Enter is its own (the wager boxes' Enter, next to "Ignore the limits").
    if (t?.closest('input:not([type="checkbox"]), textarea, select, [contenteditable]') || ((e.key === ' ' || e.key === 'Enter') && t?.matches('input'))) return;
    // Enter or Space on a button reached with Tab presses it (a tile opens). On a button clicked with the mouse, Enter
    // still awards.
    if ((e.key === ' ' || e.key === 'Enter') && t && t === tabbedTo && t.matches('button, [role="button"]')) return;
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
      } else if (buzzing) {
        // 0: the buzzers open for everyone again; 1–9: that player buzzes in.
        if (!n) openBuzzers(true);
        else if (session.players[n - 1]) buzzPlayer(session.players[n - 1].id);
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
        if (session.phase === 'boardgame' && !selected.length && !e.shiftKey && boardEnter()) break;
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
        if (app.live.overlay?.kind !== 'dice' || Date.now() >= overlayDoneAt(app.live.overlay)) rollDice(app.live, session, lastDice);
        break;
      case 'w': {
        const o = app.live.overlay;
        if (o?.kind === 'wheel') {
          if (Date.now() >= overlayDoneAt(o)) spinWheel(app.live, session, game);
        } else if (game.wheels[0]) openWheel(app.live, session, game.wheels[0]);
        else toast('No saved wheels: use the 🎡 Wheel button for a quick one');
        break;
      }
      case 'o':
        rolloff(session.players.map((p) => p.id), game.settings.rollOffDie || 20);
        break;
      case 's':
        toggleScoreboard(app.live);
        break;
      case 'n':
        // Shift+N goes the other way: the turn before, or the player before in the reveals.
        if (session.intro) {
          // The round's intro first (its title card, then a board's tiles and categories).
          if (!e.shiftKey) intro();
        } else if (session.phase === 'boardgame') turnNow(game, session, e.shiftKey ? -1 : 1);
        else if (session.phase === 'final' && session.finalStep === 'reveal') {
          if (e.shiftKey) finalBack(session);
          else finalRevealNext();
        } else if (e.shiftKey) break;
        else if (session.phase === 'final' && (session.finalStep !== 'wagers' || finalWagersOk(session, wagerLimitsOff))) {
          finalNext(session, game);
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
        // Buzzer mode: open the buzzers (after reading the clue, when Setup says the host opens them).
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
  }}
/>

{#if app.pregame}
  <div class="pregame">
    <!-- ▶ Play lands here (keyboard and screen reader users start at the top of the page, not on <body>). -->
    <h1 tabindex="-1" use:takeFocus>{game.title}</h1>
    {#if app.resumable && app.resumable.session.phase !== 'end'}
      <p class="warn">
        ⚠ Starting replaces the saved game in progress ("{app.resumable.game.title}"). To keep playing that one, go back to the
        {app.playerOnly ? 'start screen' : 'editor'} and press Resume game.
      </p>
    {/if}
    <p class="muted">Confirm who's playing. Names, colors, and starting scores can be changed here or during the game.</p>
    <PlayerList bind:players={session.players} max={game.settings.maxPlayers} showScores />
    {#if !session.players.length}
      <div class="row">
        <span class="warn">Add at least one player to start.</span>
        <button onclick={addSamplePlayers}>＋ Add 3 sample players</button>
      </div>
    {/if}
    {#if phonesOn}
      <PhoneRoom {session} max={game.settings.maxPlayers} onstart={startPhoneRoom} onadd={addPhonePlayer} onreject={rejectPhone} onkick={kickPhone} />
    {/if}

    <h2>Display</h2>
    <div class="modes">
      <button class="mode" class:on={!dual} aria-pressed={!dual} onclick={() => dual && closeAudienceWindow()}>
        <b>Single window</b>
        <span class="muted">Viewers see this window, everything on it. Press H to hide the host controls.</span>
      </button>
      <button class="mode" class:on={dual} aria-pressed={!!dual} onclick={() => !dual && openAudience()}>
        <b>📺 Separate audience window <span class="tag">Recommended</span></b>
        <span class="muted">Capture the audience window in OBS. This window shows answers and controls, for your eyes only.</span>
      </button>
    </div>
    {#if !dual}
      <p class="warn small exposed">
        ⚠ In single-window mode viewers see everything on screen: the wagers as you type them, and the answers, host notes
        and hidden objects shown in the controls. To keep those secret, use the audience window.
      </p>
    {/if}
    <SoundWarnings {dual} onhelp={() => (showSound = true)} />

    <h2>On stream</h2>
    <div class="stream-opts">
      <label>
        <span>“Starting soon” card</span>
        <input
          value={stream.soonText ?? ''}
          placeholder="Starting soon…"
          onchange={(e) => setStream('soonText', e.currentTarget.value.trim() || undefined, 'Starting soon card text')}
        />
      </label>
      <div class="row">
        <span class="muted small">Countdown on it:</span>
        {#if app.live.soonAt}
          <button class="small" onclick={() => (app.live.soonAt = undefined)}>■ Stop countdown</button>
        {:else}
          <label class="check small">
            <input type="number" min="1" max="120" class="mins" bind:value={soonMinutes} aria-label="Countdown minutes" /> min
          </label>
          <button class="small" disabled={!soonMinutes || soonMinutes < 0} onclick={() => (app.live.soonAt = Date.now() + soonMinutes * 60_000)}>
            ▶ Start countdown
          </button>
        {/if}
      </div>
      <label>
        <span>Cover card (K)</span>
        <input
          value={stream.coverText ?? ''}
          placeholder="Be right back"
          onchange={(e) => setStream('coverText', e.currentTarget.value.trim() || undefined, 'Cover card text')}
        />
      </label>
      <span class="muted small">The theme's banner picture shows on both cards, when there is one.</span>
      <label class="check small">
        <input
          type="checkbox"
          checked={!!stream.clueCaption}
          onchange={(e) => setStream('clueCaption', e.currentTarget.checked || undefined, 'Category and value caption on clues')}
        />
        Show the category and value on clue screens (“MEMES · $400”)
      </label>
      <label class="check small">
        <input
          type="checkbox"
          checked={!!stream.placeCaption}
          onchange={(e) => setStream('placeCaption', e.currentTarget.checked || undefined, 'Screen name caption in RPG rounds')}
        />
        Show the screen's name in RPG rounds
      </label>
    </div>

    <div class="row">
      <button class="small" onclick={() => (showSound = true)}>🔊 Sound for Discord / OBS…</button>
      <span class="muted small">Test the sound, pick where it plays, and see how to stream it.</span>
    </div>

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
          {#if !app.playerOnly}<button class="small" onclick={oncancel}>◀ Fix in editor</button>{/if}
          <span class="muted small">These are only warnings: you can still start.</span>
        </div>
      </details>
    {/if}

    <div class="row actions">
      <button class="ghost" onclick={oncancel}>{app.playerOnly ? '◀ Back' : '◀ Back to editor'}</button>
      <button class="primary big" onclick={start} disabled={!session.players.length} title={session.players.length ? '' : 'Add at least one player first'}>
        Start game ▶
      </button>
    </div>
  </div>
{:else}
  <!-- Right-clicking a player anywhere here (the stage, the host panel) gives their menu. -->
  <div class="play" class:hidden={hideControls} class:side class:roomy={!dual && (showKeys || showPlayers)} oncontextmenu={playerMenuAt} role="presentation">
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
            onobject={(id) => (rpgObject = id)}
            onavatar={avatarAct}
            onobjectmove={objectMoved}
            onpickup={objectPicked}
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
      <button class="show-controls" class:shown={pointerMoved} onclick={() => (hideControls = false)} title="H">Show controls</button>
    {:else}
      <HostPanel
        {game}
        {session}
        bind:selected
        bind:amount
        bind:rpgObject
        bind:rpgMap
        bind:rpgAsk
        bind:rpgMapSend
        bind:bgSpace
        bind:editingScore
        bind:wagerLimitsOff
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
        ontiebreakerdone={() => ((session.phase = 'end'), (app.live.timer = null))}
        onlog={(tab) => {
          if (tab) logTab = tab;
          showLog = !!tab || !showLog;
        }}
        onplayers={openPlayers}
        {dual}
        {side}
        onaudience={toggleAudience}
        onscores={toggleScores}
        onsound={() => (showSound = true)}
        oncloseoverlay={closeOverlay}
        onopenbuzzers={openBuzzers}
        onrolloff={(ids) => rolloff(ids, game.settings.rollOffDie || 20, 'tiebreak')}
        onhide={() => (hideControls = true)}
        onexit={exitGame}
      >
        {#snippet buzzExtra()}
          {#if tie.length}
            <span class="tie" role="status">Tie: {nameList(tie.map((id) => playerName(session, id)))}</span>
            <button class="primary" onclick={rollTie}>🎲 Roll for it</button>
            <span class="muted later-buzz">or pick one (click or 1–9)</span>
          {/if}
          {#if nextInLine}
            <button onclick={() => takeNext(nextInLine.id)} title="They answer now (the buzzers stay open for the others until then)">→ Next in line: {nextInLine.name}</button>
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
            <PhoneChip {session} max={game.settings.maxPlayers} onstart={startPhoneRoom} onadd={addPhonePlayer} onreject={rejectPhone} onkick={kickPhone} />
          {/if}
        {/snippet}
        {#snippet tools()}
          <ToolLauncher {game} {session} onrolloff={rolloff} />
          <button class="ghost" onclick={() => (showKeys = true)} title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">⌨</button>
        {/snippet}
      </HostPanel>
    {/if}
  </div>
  {#if showKeys}
    <KeysHelp area={panelBox} onclose={() => (showKeys = false)} />
  {/if}
  {#if showLog}
    <ScoreLog {game} {session} {sym} bind:tab={logTab} onreopen={toggleTile} onback={undoBackTo} onredoto={redoUpTo} onclose={() => (showLog = false)} />
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
        <PlayerList bind:players={session.players} max={game.settings.maxPlayers} inGame onremove={(id) => (removing = id)} />
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
<!-- Before the game too (from the display settings) and during it (🔊 Sound in the host panel). -->
{#if showSound}
  <AudioHelp {dual} windowTitle={audienceTitle(game)} onclose={() => (showSound = false)} />
{/if}

<style>
  .pregame {
    max-width: 860px;
    margin: 0 auto;
    padding: 32px 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .pregame h1 {
    margin: 0;
  }
  .pregame h1:focus {
    outline: none;
  }
  .pregame h2 {
    margin: 8px 0 0;
    font-size: 15px;
  }
  .pregame p {
    margin: 0;
  }
  .warn {
    color: var(--warn);
  }
  .later-buzz {
    font-size: 12px;
    color: var(--muted);
  }
  .tie {
    font-weight: 700;
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
    gap: 6px;
  }
  .stream-opts > label:not(.check) {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .stream-opts > label:not(.check) > span {
    width: 150px;
    flex: none;
  }
  .stream-opts > label:not(.check) > input {
    flex: 1;
    max-width: 360px;
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
  .actions {
    margin-top: 12px;
  }
  .big {
    font-size: 16px;
    padding: 10px 22px;
  }
  .play {
    display: flex;
    flex-direction: column;
    height: 100%;
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
  .modes {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .mode {
    display: flex;
    flex-direction: column;
    gap: 4px;
    text-align: left;
    white-space: normal;
    padding: 12px;
  }
  .mode.on {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }
  .tag {
    margin-left: 4px;
    padding: 1px 6px;
    border-radius: 6px;
    background: var(--panel-2);
    font-size: 12px;
    font-weight: 600;
  }
  @media (max-width: 640px) {
    .modes {
      grid-template-columns: 1fr;
    }
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
  /* Out of sight (it would be on stream) until the mouse moves; keyboard focus shows it too. */
  .show-controls {
    position: fixed;
    right: 8px;
    bottom: 8px;
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
  /* The host panel beside the stage: messages show at its foot, not over the stage. */
  :global(body:has(.play.side) .toast) {
    left: auto;
    right: 12px;
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
