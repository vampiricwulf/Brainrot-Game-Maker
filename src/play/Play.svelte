<script lang="ts">
  import { app, toast } from '../lib/app.svelte';
  import { finalName, formatPoints, getClue, isBoard, newId, PLAYER_WHEEL, type ClueRef } from '../lib/model';
  import {
    applyScore, awardOpen, backToBoard, backToLastRound, currentFinal, clueName, clueReason, clueScored, currentClueInfo, ddShowQuestion, describeStep,
    finalAdvance, finalJudge, finalNext, finalShow, findClueRef, goToRound, introNext, newSession, openClue, playerName, randomizeDailyDoubles,
    redo, removePlayer, restorePlayer, answerShowing, score, skipIntro, startIntro, toggleReveal, toggleUsed, undo,
  } from '../lib/session';
  import { newLive, overlayDoneAt, playSound, startTimer, timerRemaining, toggleTimer, type StageAction } from '../lib/live';
  import { openDice, openPlayerWheel, openWheel, quickDice, rollDice, spinWheel, startRollOff, toggleScoreboard } from '../lib/overlay';
  import type { DicePreset } from '../lib/model';
  import { validate } from '../lib/validate';
  import { nextFreeColor } from '../lib/colors';
  import ToolLauncher from './host/ToolLauncher.svelte';
  import KeysHelp from './KeysHelp.svelte';
  import Stage from '../lib/Stage.svelte';
  import PlayerList from '../editor/PlayerList.svelte';
  import AudienceView from './AudienceView.svelte';
  import HostPanel from './HostPanel.svelte';
  import ScoreLog from './ScoreLog.svelte';
  import HostInfo from './HostInfo.svelte';
  import AudioHelp from './AudioHelp.svelte';
  import SoundWarnings from './host/SoundWarnings.svelte';
  import { watchSinks } from '../lib/audioout.svelte';
  import { lastAction, logged, redoAction, undoAction } from '../lib/toolset';
  import { addLive, droppedFile, liveText, objectAt, regroupAll, rpgNow, stepParty, toggleMap } from './rpg/hostops';
  import { showMenu } from '../lib/contextmenu.svelte';
  import { sendTo } from '../lib/boardgame';
  import { audienceSees, override } from '../lib/rpg';
  import { boardNow, rollMover, turnNow } from './boardgame/bgops';
  import { shopBuy } from './host/shopops';
  import { SLIDE_H, SLIDE_W } from '../lib/model';
  import type { Dir8 } from '../lib/model';
  import {
    audience,
    audienceTitle,
    closeAudienceWindow,
    mediaCommand,
    openAudienceWindow,
    pushGame,
    pushLive,
    pushSession,
  } from '../lib/sync.svelte';
  import { localMedia, openMediaPopup, remoteMedia } from '../lib/mediactl.svelte';
  import { registerGameFonts } from '../lib/fonts';
  import { inTauri, toggleFullscreen } from '../lib/platform';
  import { onMount } from 'svelte';

  let {
    onexit,
    oncancel,
  }: {
    /** Leave the game (it stays saved and resumable). */
    onexit: () => void;
    /** Pre-game "Back to editor": nothing was played, so nothing is saved or cleared. */
    oncancel: () => void;
  } = $props();

  // Play is only mounted when these exist.
  const game = $derived(app.playGame!);
  const session = $derived(app.session!);

  let selected = $state<string[]>([]);
  let amount = $state<number | null>(null);
  let showLog = $state(false);
  let showPlayers = $state(false);
  let hideControls = $state(false);
  let showKeys = $state(false);
  /** The streaming-sound help (Test sound, output device, Discord/OBS steps). */
  let showSound = $state(false);
  /** P was pressed: the next 1–9 sets the picker. */
  let pickerPending = $state(false);
  /** Everyone in the final reveal is judged and N was pressed once: the next N finishes the game. */
  let finishArmed = $state(false);
  /** RPG rounds: the object whose card is open in the host panel. */
  let rpgObject = $state<string | null>(null);
  /** RPG rounds: the host's full map is open (J). */
  let rpgMap = $state(false);
  /** Which log each combined Undo went to, so Redo goes back the same way. */
  let undoneKinds: ('score' | 'action')[] = [];

  const sym = $derived(game.settings.currencySymbol);
  const dual = $derived(audience.open);

  // Timeouts that touch the live state (score pops, roll-off pickers) are cancelled if the game is left.
  const pending = new Set<ReturnType<typeof setTimeout>>();
  function later(fn: () => void, ms: number): void {
    const id = setTimeout(() => {
      pending.delete(id);
      fn();
    }, ms);
    pending.add(id);
  }

  // Mirror state to the audience window whenever it changes.
  $effect(() => {
    const g = $state.snapshot(game);
    if (audience.open) pushGame(g);
  });
  $effect(() => {
    const s = $state.snapshot(session);
    if (audience.open) pushSession(s);
  });
  $effect(() => {
    const l = $state.snapshot(app.live);
    if (audience.open) pushLive(l);
  });
  // "Press N again to finish" only applies right where it was armed.
  $effect(() => {
    void session.phase;
    void session.finalStep;
    finishArmed = false;
  });

  onMount(() => {
    registerGameFonts(game);
    // Game audio output: route every sound this window plays (single-window mode) to the chosen device.
    const offSinks = watchSinks();
    // Time's up watcher (the host is the single source of truth for expiry).
    const id = setInterval(() => {
      const t = app.live.timer;
      if (t && !t.expired && t.startedAt !== null && timerRemaining(t) <= 0) {
        t.elapsed = t.total;
        t.startedAt = null;
        t.expired = true;
        playSound(app.live, game.audio.timesUp);
      }
    }, 150);
    return () => {
      clearInterval(id);
      offSinks();
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

  /** The host panel's audience button: closing mid-game asks first, since it's usually the stream capture. */
  function toggleAudience(): void {
    if (!audience.open) openAudience();
    else if (confirm('Close the audience window? Your stream capture will go black.')) closeAudienceWindow();
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
    for (const e of events) {
      const p = session.players.find((x) => x.id === e.playerId);
      if (p) pop(`${p.name} ${e.delta > 0 ? '+' : '−'}${sym}${Math.abs(e.delta).toLocaleString()}`, p.color);
    }
    // Awarding control of the board follows TV rules: the last correct player picks next.
    if (game.settings.pickerFollowsAward !== false && sign > 0 && ids.length === 1) session.currentPickerId = ids[0];
    selected = [];
  }

  const info = $derived(currentClueInfo(session, game));

  function pick(ref: ClueRef): void {
    openClue(session, ref, game);
    selected = [];
    const c = currentClueInfo(session, game);
    amount = c?.value ?? null;
    app.live.timer = null;
    app.live.overlay = null;
    if (session.dd) playSound(app.live, game.audio.dailyDouble);
    else if (c?.clue.type === 'wheel') {
      const w = game.wheels.find((x) => x.id === c.clue.wheelId);
      if (c.clue.wheelId === PLAYER_WHEEL) openPlayerWheel(app.live, session);
      else if (w) openWheel(app.live, session, w);
      else toast('This tile has no wheel chosen');
    } else if (c?.clue.type === 'dice') {
      const d = game.dice.find((x) => x.id === c.clue.diceId);
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

  /** The roll-off's result: who picks first, or (a tiebreaker for tied winners) who wins the game. */
  /** Roll-offs whose result was already applied (closing one early applies it; the timer then mustn't again). */
  const rollOffsApplied = new Set<string>();

  function rollOffResult(s: typeof session, o: { nonce: string; winner: string; purpose?: 'first' | 'tiebreak' }): void {
    if (rollOffsApplied.has(o.nonce)) return;
    rollOffsApplied.add(o.nonce);
    if (o.purpose === 'tiebreak') s.rollOffWinner = o.winner;
    else s.currentPickerId = o.winner;
  }

  function rolloff(ids: string[], sides: number, purpose: 'first' | 'tiebreak' = 'first'): void {
    startRollOff(app.live, session, ids, sides, purpose);
    const o = app.live.overlay;
    if (o?.kind !== 'rolloff') return;
    const nonce = o.nonce;
    const result = { nonce: o.nonce, winner: o.winner, purpose };
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
    if (o.kind === 'popup' && o.answer && !o.revealed) o.revealed = true;
    else if (o.kind === 'wheel' && !o.spin) spinWheel(app.live, session, game);
    else if (o.kind === 'dice' && !o.roll) rollDice(app.live, session, o.preset);
    else closeOverlay();
  }

  function closeOverlay(): void {
    const o = app.live.overlay;
    // The result was decided up front, so closing early (skipping the animation) still sets the picker.
    if (o?.kind === 'rolloff') rollOffResult(session, o);
    app.live.overlay = null;
    // A wheel/dice tile shows its question (if any) once the tool is closed.
    if (session.phase === 'clue') autoTimer();
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

  /** Put a used tile back on the board, or mark one as played. */
  function toggleTile(clueId: string): void {
    const ref = findClueRef(game, clueId);
    const used = toggleUsed(session, clueId);
    const name = ref ? clueName(game, ref) : 'That tile';
    toast(used ? `${name} marked as played` : `${name} is back on the board`);
  }

  function nextRound(delta: number): void {
    goToRound(session, game, session.currentRound + delta);
    app.live.timer = null;
    selected = [];
    amount = null;
    if (session.intro?.stage === 'title') playSound(app.live, game.audio.roundIntro);
    if (session.phase === 'end') playSound(app.live, game.audio.winner);
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

  /** Same players (names and colors) at 0 and a fresh board, via the pre-game screen. */
  function rematch(): void {
    // Until the rematch starts, the finished game stays viewable from the editor ("View results").
    app.resumable = { game: $state.snapshot(game), session: $state.snapshot(session), savedAt: Date.now() };
    const s = newSession(game);
    s.players = session.players.map(({ id, name, color }) => ({ id, name, color, startScore: 0 }));
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
      playSound(app.live, game.audio.finalThink);
    }
    if (session.phase === 'final' && session.finalStep === 'answer') app.live.sound = null;
    if (session.phase === 'end') playSound(app.live, game.audio.winner);
    // A Final in the middle of the game went on to the next round.
    if (session.phase === 'board' && session.intro?.stage === 'title') playSound(app.live, game.audio.roundIntro);
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

  /** C / X in the final reveal: judge the spotlit player. */
  function finalJudgeKey(right: boolean): void {
    const id = session.final?.current;
    if (!id || session.phase !== 'final' || session.finalStep !== 'reveal') return;
    finalShow(session, id);
    finalJudge(session, game, id, right);
  }

  /** The newest score step not undone (for choosing between the score log and the action log). */
  function lastScoreTs(): number {
    const here = new Set(session.players.map((p) => p.id));
    for (let i = session.scoreLog.length - 1; i >= 0; i--) {
      const e = session.scoreLog[i];
      if (!e.undone && here.has(e.playerId)) return e.ts;
    }
    return -1;
  }

  /** Ctrl+Z undoes whichever came last: a score change or an RPG action (move, stat, item, reveal…). */
  function doUndo(): void {
    const a = lastAction(session);
    if (a && a.ts >= lastScoreTs()) {
      undoAction(session);
      undoneKinds.push('action');
      return toast(`Undid ${a.text}`, 4000);
    }
    const events = undo(session);
    if (!events.length) return toast('Nothing to undo');
    undoneKinds.push('score');
    // No Redo button in the toast: it sits over the host's nav row. ↷ Redo is next to ↶ Undo (or Ctrl+Shift+Z).
    toast(`Undid ${describeStep(session, events, sym)}`, 4000);
  }

  function doRedo(): void {
    const kind = undoneKinds.pop() ?? (session.actionRedo?.length ? 'action' : 'score');
    if (kind === 'action') {
      const a = redoAction(session);
      if (a) return toast(`Redid ${a.text}`);
    }
    const events = redo(session);
    if (events.length) toast(`Redid ${describeStep(session, events, sym)}`);
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

  /** Files dropped on the stage in an RPG round become hidden objects on the screen the audience follows. */
  async function dropOnStage(e: DragEvent): Promise<void> {
    if (session.phase !== 'rpg' || !e.dataTransfer?.files.length) return;
    e.preventDefault();
    const box = (e.currentTarget as HTMLElement).querySelector('.stage')?.getBoundingClientRect();
    const at = box
      ? { x: ((e.clientX - box.left) / box.width) * SLIDE_W, y: ((e.clientY - box.top) / box.height) * SLIDE_H }
      : { x: SLIDE_W / 2, y: SLIDE_H / 2 };
    for (const file of Array.from(e.dataTransfer.files)) {
      try {
        const el = await droppedFile(game, file, at);
        if (addLive(game, session, el, `Added ${el.name}`)) {
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

  // ---------- Right-click on the stage (host) ----------

  /** Stage coordinates (1920×1080) of a pointer event over the stage. */
  function stagePoint(e: MouseEvent): { x: number; y: number } {
    const box = (e.currentTarget as HTMLElement).querySelector('.stage')?.getBoundingClientRect();
    return box ? { x: ((e.clientX - box.left) / box.width) * SLIDE_W, y: ((e.clientY - box.top) / box.height) * SLIDE_H } : { x: SLIDE_W / 2, y: SLIDE_H / 2 };
  }

  const sheet = (id: string) => (app.live.overlay = { kind: 'sheet', nonce: newId(), playerId: id });
  const toggleSelect = (id: string) => (selected = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  function stageMenu(e: MouseEvent): void {
    if (e.defaultPrevented) return;
    const t = e.target as HTMLElement;
    const objId = t.closest<HTMLElement>('[data-object]')?.dataset.object;
    const playerId = t.closest<HTMLElement>('[data-player-id]')?.dataset.playerId;
    const spaceId = t.closest<HTMLElement>('[data-space]')?.dataset.space;
    const who = playerId ? session.players.find((p) => p.id === playerId) : undefined;
    if (session.phase === 'rpg') {
      const { st } = rpgNow(game, session);
      if (!st) return;
      if (objId) {
        const found = objectAt(game, session, objId);
        if (!found) return;
        const name = found.el.name || found.el.role?.class || 'Object';
        const shown = audienceSees(found.el, st.objects[objId]);
        return showMenu(e, [
          { heading: name },
          { label: '🗂 Open its card', onclick: () => (rpgObject = objId) },
          { label: shown ? '🙈 Hide from viewers' : '👁 Reveal to viewers', onclick: () => logged(session, `${shown ? 'Hide' : 'Reveal'} ${name}`, () => (override(st, objId).shown = !shown)) },
          { sep: true },
          { label: '🗑 Remove', danger: true, onclick: () => logged(session, `Remove ${name}`, () => (override(st, objId).taken = true)) },
        ]);
      }
      if (who) {
        const pos = st.positions[who.id];
        return showMenu(e, [
          { heading: who.name },
          { label: selected.includes(who.id) ? 'Deselect' : 'Select', onclick: () => toggleSelect(who.id) },
          { label: '📺 Show their sheet', onclick: () => sheet(who.id) },
          { label: pos?.down ? '💫 Gets up' : '💫 Knocked out', onclick: () => logged(session, `${who.name} ${pos?.down ? 'gets up' : 'is knocked out'}`, () => (st.positions[who.id].down = !pos?.down)) },
          { label: '🫥 Hide their avatar', onclick: () => logged(session, `${who.name} hidden`, () => (st.positions[who.id].hidden = true)) },
        ]);
      }
      const at = stagePoint(e);
      return showMenu(e, [
        {
          label: '＋ Text here…',
          onclick: () => {
            const text = prompt('Text to put here (hidden until you reveal it):')?.trim();
            if (!text) return;
            const el = liveText(text);
            el.x = Math.round(at.x - el.w / 2);
            el.y = Math.round(at.y - el.h / 2);
            if (addLive(game, session, el, `Text: ${text}`)) rpgObject = el.id;
          },
        },
        { label: '🗺 Full map (jump anywhere)', onclick: () => (rpgMap = true) },
        { label: st.mapShown ? '🗺 Hide the map from viewers' : '🗺 Show the map to viewers', onclick: () => toggleMap(game, session) },
        { label: app.live.cover ? '▶ Uncover the screen' : '⏸ Cover the screen', onclick: () => (app.live.cover = !app.live.cover) },
      ]);
    }
    if (session.phase === 'boardgame') {
      const { round, bs } = boardNow(game, session);
      if (!round || !bs) return;
      const turnId = bs.order[bs.turn];
      const turnName = playerName(session, turnId);
      if (who) {
        return showMenu(e, [
          { heading: who.name },
          { label: '🎲 Make it their turn', disabled: turnId === who.id, onclick: () => logged(session, `${who.name}'s turn`, () => ((bs.turn = bs.order.indexOf(who.id)), (bs.fork = undefined))) },
          { label: selected.includes(who.id) ? 'Deselect' : 'Select', onclick: () => toggleSelect(who.id) },
          { label: '📺 Show their sheet', onclick: () => sheet(who.id) },
          { sep: true },
          ...round.zones.map((z) => ({ label: `🌀 Send to ${z.name}`, onclick: () => logged(session, `${who.name} → ${z.name}`, () => sendTo(bs, [who.id], { zone: z.id })) })),
          { label: '🏁 Send to Start', onclick: () => logged(session, `${who.name} → Start`, () => sendTo(bs, [who.id], { space: (round.start ?? round.spaces[0]?.id) })) },
        ]);
      }
      if (spaceId) {
        const sp = round.spaces.find((s) => s.id === spaceId);
        if (!sp) return;
        const movers = selected.length ? selected : turnId ? [turnId] : [];
        return showMenu(e, [
          { heading: sp.name },
          {
            label: `📍 Put ${selected.length ? `the selected (${selected.length})` : turnName} here`,
            disabled: !movers.length,
            onclick: () => logged(session, `${movers.map((m) => playerName(session, m)).join(', ')} → ${sp.name}`, () => sendTo(bs, movers, { space: sp.id })),
          },
          {
            label: '👁 Reveal this space',
            disabled: !sp.secret || !!bs.revealed?.includes(sp.id),
            onclick: () => logged(session, `Reveal ${sp.name}`, () => (bs.revealed = [...(bs.revealed ?? []), sp.id])),
          },
        ]);
      }
    }
  }

  /** An avatar on the stage was dragged (moved on its screen) or clicked (selected). */
  function avatarAct(id: string, at?: { x: number; y: number }): void {
    const { st } = rpgNow(game, session);
    if (!at || !st?.positions[id]) {
      selected = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
      return;
    }
    logged(session, `Move ${playerName(session, id)}`, () => Object.assign(st.positions[id], at));
  }

  /** Players added by "＋ Add 3 sample players", by id → their sample name. */
  const samples = new Map<string, string>();

  function start(): void {
    if (!session.players.length) return;
    // A game without a saved roster keeps these players for next time: only if the editor holds this same game
    // (after resuming an older save it may not), and not the sample players unless they were renamed.
    const roster = session.players.filter((p) => samples.get(p.id) !== p.name);
    if (app.game.id === game.id && !app.game.players.length && roster.length)
      app.game.players = roster.map(({ id, name, color }) => ({ id, name, color }));
    // This game now replaces any older saved one (autosave starts once pre-game is over).
    app.resumable = null;
    app.pregame = false;
    // A game can open with a Final or an RPG round: those start through goToRound (no board intro).
    if (!isBoard(game.rounds[0])) return goToRound(session, game, 0);
    startIntro(session, game);
    if (session.intro?.stage === 'title') playSound(app.live, game.audio.roundIntro);
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
    for (const c of isBoard(edited) ? edited.categories : [])
      for (const cl of c.clues) if (added.has(cl.id) && cl.type === 'standard') cl.type = 'dailyDouble';
    toast(`Placed ${n} Daily Double${n === 1 ? '' : 's'} in ${r.name}`);
  }

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

  function onkey(e: KeyboardEvent): void {
    // The live screen editor (RPG) has its own keys.
    if (app.pregame || showPlayers || showKeys || showSound || app.editGame || rpgMap) return;
    const t = e.target as HTMLElement;
    // Typing in a field (a quick-wheel list, a wager…) is never a shortcut, not even '?'.
    if (t.closest('input, textarea, select, [contenteditable]')) return;
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

    if (session.phase === 'rpg' && !e.shiftKey && ['g', 'm', 'i', 'b', 'j'].includes(k)) {
      e.preventDefault();
      if (k === 'j') rpgMap = true;
      else if (k === 'g') regroupAll(game, session);
      else if (k === 'm') toggleMap(game, session);
      else if (k === 'b') app.live.cover = !app.live.cover;
      else if (app.live.overlay?.kind === 'sheet') {
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

    if (/^[1-9]$/.test(e.key)) {
      const p = session.players[+e.key - 1];
      if (!p) return;
      if (pickerPending) session.currentPickerId = p.id;
      else selected = selected.includes(p.id) ? selected.filter((x) => x !== p.id) : [...selected, p.id];
      pickerPending = false;
      return;
    }
    pickerPending = false;

    switch (k) {
      case 'enter':
        // Only where the award row is up (not on the Daily Double splash, the final reveals or the end screen).
        if (awardOpen(session)) award(e.shiftKey ? -1 : 1);
        break;
      case 'r':
        revealToggle();
        break;
      case 'escape':
      case 'b':
        if (showLog) showLog = false;
        else if (app.live.overlay) closeOverlay();
        else if (rpgObject) rpgObject = null;
        // Shift+Esc cancels: back to the board without using up the tile.
        else if (session.phase === 'clue' && e.shiftKey) cancelClue();
        else if (session.phase === 'clue') back();
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
        if (session.phase === 'boardgame') turnNow(game, session, 1);
        else if (session.phase === 'board' && session.intro) intro();
        else if (session.phase === 'final' && session.finalStep === 'reveal') finalRevealNext();
        else if (session.phase === 'final' && session.finalStep !== 'wagers') {
          finalNext(session, game);
          finalStep();
        }
        break;
      case 'c':
      case 'x':
        finalJudgeKey(k === 'c');
        break;
      case 't':
        if (app.live.timer && !app.live.timer.expired) toggleTimer(app.live);
        else startTimer(app.live, clueTimer() ?? (game.settings.defaultTimerSeconds || 30));
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
        openAudience();
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
      case 'y': {
        const m = firstMedia();
        if (m?.[1].openUrl) openMediaPopup(m[1].openUrl);
        break;
      }
      default:
        return;
    }
    e.preventDefault();
  }
</script>

<svelte:window onkeydown={onkey} />

{#if app.pregame}
  <div class="pregame">
    <h1>{game.title}</h1>
    {#if app.resumable && app.resumable.session.phase !== 'end'}
      <p class="warn">
        ⚠ Starting replaces the saved game in progress ("{app.resumable.game.title}"). To keep playing that one, go back to the editor and
        press Resume game.
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

    <h2>Display</h2>
    <div class="modes">
      <button class="mode" class:on={!dual} onclick={() => dual && closeAudienceWindow()}>
        <b>Single window</b>
        <span class="muted">Viewers see this window. Press H to hide the host controls.</span>
      </button>
      <button class="mode" class:on={dual} onclick={() => !dual && openAudience()}>
        <b>📺 Separate audience window</b>
        <span class="muted">Capture the audience window in OBS. This window shows answers and controls, for your eyes only.</span>
      </button>
    </div>
    <SoundWarnings {dual} onhelp={() => (showSound = true)} />
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
          <button class="small" onclick={oncancel}>◀ Fix in editor</button>
          <span class="muted small">These are only warnings: you can still start.</span>
        </div>
      </details>
    {/if}

    <div class="row actions">
      <button class="ghost" onclick={oncancel}>◀ Back to editor</button>
      <button class="primary big" onclick={start} disabled={!session.players.length} title={session.players.length ? '' : 'Add at least one player first'}>
        Start game ▶
      </button>
    </div>
  </div>
{:else}
  <div class="play" class:hidden={hideControls}>
    <div class="stage-area" class:dual>
      <div
        class="stage-box"
        role="presentation"
        ondragover={(e) => session.phase === 'rpg' && e.dataTransfer?.types.includes('Files') && e.preventDefault()}
        ondrop={dropOnStage}
        oncontextmenu={stageMenu}
      >
        <Stage>
          <AudienceView
            {game}
            {session}
            live={app.live}
            role={dual ? 'mirror' : 'single'}
            onpick={pick}
            onunmark={(ref) => {
              const id = getClue(game, ref)?.clue.id;
              if (id && session.used[id]) toggleTile(id);
            }}
            onpicker={(id) => (session.currentPickerId = session.currentPickerId === id ? undefined : id)}
            onact={stageAct}
            onobject={(id) => (rpgObject = id)}
            onavatar={avatarAct}
            onobjectmove={objectMoved}
            onshopbuy={(item) => app.live.overlay?.kind === 'shop' && shopBuy(game, session, app.live.overlay, selected, item)}
          />
        </Stage>
      </div>
      {#if dual}
        <HostInfo {game} {session} />
      {/if}
    </div>
    {#if hideControls}
      <button class="show-controls" onclick={() => (hideControls = false)} title="H">Show controls</button>
    {:else}
      <HostPanel
        {game}
        {session}
        bind:selected
        bind:amount
        bind:rpgObject
        bind:rpgMap
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
        ontiebreakerdone={() => ((session.phase = 'end'), (app.live.timer = null))}
        onlog={() => (showLog = !showLog)}
        onplayers={() => ((removing = null), (showPlayers = true))}
        {dual}
        onaudience={toggleAudience}
        onsound={() => (showSound = true)}
        oncloseoverlay={closeOverlay}
        onrolloff={(ids) => rolloff(ids, game.settings.rollOffDie || 20, 'tiebreak')}
        onhide={() => (hideControls = true)}
        onexit={() =>
          confirm(
            session.phase === 'end'
              ? 'Leave the results screen? (Copy the results first if you want to keep them.)'
              : 'Leave this game? You can resume it from the editor.',
          ) && onexit()}
      >
        {#snippet tools()}
          <ToolLauncher {game} {session} onrolloff={rolloff} />
          <button class="ghost" onclick={() => (showKeys = true)} title="Keyboard shortcuts (?)">⌨</button>
        {/snippet}
      </HostPanel>
    {/if}
  </div>
  {#if showKeys}
    <KeysHelp onclose={() => (showKeys = false)} />
  {/if}
  {#if showLog}
    <ScoreLog {session} {sym} onreopen={toggleTile} onclose={() => (showLog = false)} />
  {/if}
  {#if showPlayers}
    <div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && (showPlayers = false)}>
      <div class="modal" role="dialog" aria-modal="true" aria-label="Players">
        <h2>Players</h2>
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
            <button class="small" onclick={() => (removing = null)}>Keep</button>
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
        <div class="row"><span class="spacer"></span><button class="primary" onclick={() => (showPlayers = false)}>Done</button></div>
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
  .small {
    font-size: 12px;
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
    min-height: 0;
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
  @media (max-width: 640px) {
    .modes {
      grid-template-columns: 1fr;
    }
  }
  .show-controls {
    position: fixed;
    right: 8px;
    bottom: 8px;
    opacity: 0.15;
    font-size: 11px;
  }
  .show-controls:hover {
    opacity: 1;
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
