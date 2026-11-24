/**
 * Players mid-game, and a board game's moves from the keys (moved out of Play.svelte, which calls createMidgame once,
 * where this code was): the 👥 Players dialog and its undoable steps, a player taken out of the game, a card's
 * question worth points, Enter's move in a board game, Next turn, and ✎ Edit board's keys. Play's own state comes in
 * through `host`, as getters, setters and functions.
 */
import { app, hint, toast } from '../../lib/app.svelte';
import { blankName } from '../../lib/model';
import { playerName, removePlayer, rosterChange } from '../../lib/session';
import { overlayDoneAt, toolOverlay, type Overlay } from '../../lib/live';
import { startStep } from '../../lib/toolset';
import { regroupAll, rpgNow } from '../rpg/hostops';
import { currentPlayer, waysOn } from '../../lib/boardgame';
import { boardNow, isMover, moveNow, offBoard, runSpace, stepWaysHint, turnNow } from '../boardgame/bgops';
import { boardEdit, editDeleteAll, editDisconnect, editIdle, editPicked, setEditing } from '../boardgame/boardedit.svelte';
import type { Game, Player, Session } from '../../lib/model';
import { tick, untrack } from 'svelte';

/** What this part reads from (and does through) the rest of the host screen: Play's own, live. */
export interface MidgameHost {
  readonly game: Game;
  readonly session: Session;
  readonly partner: Session['partner'] | null;
  readonly dual: boolean;
  readonly pregameTeams: boolean;
  readonly showLog: boolean;
  /** The board game's turn the Amount box is for. */
  readonly bgAmountKey: string;
  /** A board game's mover result that has no number (a slice's words). */
  readonly bgNoNumber: string | null;
  /** Who's selected, the Amount box, the Steps box, the 👥 Players dialog and the hidden controls (Play keeps them). */
  selected: string[];
  amount: number | null;
  bgSteps: number | null;
  showPlayers: boolean;
  hideControls: boolean;
  catchUp(added?: string[]): void;
  dropPartnerWheel(): void;
  stopPairClock(): void;
}

export type Midgame = ReturnType<typeof createMidgame>;

/** Call once, from Play's script (its effects belong to Play). */
export function createMidgame(host: MidgameHost) {
  const game = $derived(host.game);
  const session = $derived(host.session);
  const partner = $derived(host.partner);
  const dual = $derived(host.dual);
  const pregameTeams = $derived(host.pregameTeams);
  const showLog = $derived(host.showLog);
  const bgAmountKey = $derived(host.bgAmountKey);
  const bgNoNumber = $derived(host.bgNoNumber);
  const selected = $derived(host.selected);
  const bgSteps = $derived(host.bgSteps);
  const { catchUp, dropPartnerWheel, stopPairClock } = host;
  // ---------- Players mid-game ----------

  /** Player whose ✕ was pressed in the Players dialog: it asks inline (a browser dialog would show on stream). */
  let removing = $state<string | null>(null);
  const removingPlayer = $derived(session.players.find((p) => p.id === removing));
  /** The Players dialog (for the keys after a removal, a Keep or a Restore). */
  let playersBox = $state<HTMLElement>();

  // A question from a card's action ("worth 100"): its value goes in the Amount box, as a tile's does when it opens.
  let popupNonce = '';
  /** The board-game turn the question came up on (Enter judges it on that turn only: see boardEnter). */
  let popupTurn = '';
  /** A board game: the question worth points that came up this turn (a space's, a slice's), for the check before Next turn ▶. */
  let bgQuestion = $state<{ value: number; at: number; turn: string } | null>(null);
  $effect(() => {
    const o = app.live.overlay;
    if (o?.kind !== 'popup' || o.nonce === popupNonce) return;
    popupNonce = o.nonce;
    popupTurn = untrack(() => bgAmountKey);
    if (typeof o.value === 'number') untrack(() => (host.amount = o.value!));
    if (session.phase === 'boardgame' && typeof o.value === 'number' && o.value > 0 && o.answer)
      bgQuestion = { value: o.value, at: o.at ?? Date.now(), turn: popupTurn };
  });

  /** G / Numpad 5: everyone back together (with one party there's nothing to do: it says so). */
  function regroupKey(): void {
    if ((rpgNow(game, session).st?.parties.length ?? 0) < 2) return void toast('Everyone is already together');
    regroupAll(game, session);
  }

  function removeFromGame(id: string): void {
    removing = null;
    const at = session.players.findIndex((p) => p.id === id);
    // (A running game keeps at least one: its turns, parties and scoreboard need someone. 👥 Players and the player's
    // menu grey it; this is for any other way here.)
    if (at >= 0 && session.players.length <= 1) return void toast(`The game needs at least one ${pregameTeams ? 'team' : 'player'}: add another first`);
    // Their sheet on stage: it goes too (viewers were left with a dimmed, empty stage). Under the scores too: S or Esc
    // would bring it back empty.
    const o = app.live.overlay;
    if (o?.kind === 'sheet' && o.playerId === id) app.live.overlay = null;
    else if (o?.kind === 'scoreboard' && o.under?.kind === 'sheet' && o.under.playerId === id) o.under = undefined;
    // The partner clue's picker or partner: it goes back to choosing (PARTNER UP! on stream again, its countdown gone).
    const pt =
      partner && (partner.pickerId === id || partner.partnerId === id)
        ? { picker: partner.pickerId === id, name: playerName(session, id), stage: partner.stage }
        : null;
    if (pt) dropPartnerWheel();
    removePlayer(session, id);
    host.selected = selected.filter((x) => x !== id);
    if (pt) {
      if (pt.stage !== 'pick') stopPairClock();
      const now = session.partner;
      toast(
        pt.picker
          ? `${pt.name} left: who picked it? (press their number)`
          : now?.partnerId
            ? `${pt.name} left: ${playerName(session, now.partnerId)} is the only partner now`
            : `${pt.name} left: choose another partner`,
        5000,
      );
    }
    // The keys go on from the next row's − (or ＋ Add player: the last one left can't be removed), as a removal before the
    // game does, not from the page.
    void tick().then(() => {
      const dels = playersBox?.querySelectorAll<HTMLButtonElement>('.rows button.del:not(:disabled)');
      (dels?.[Math.min(at, dels.length - 1)] ?? playersBox?.querySelector<HTMLButtonElement>('button.add'))?.focus();
    });
  }

  /** Keep (or Esc) on "Remove …?": the keys go back to that player's −, where they were. */
  function keepPlayer(): void {
    const id = removing;
    removing = null;
    void tick().then(() => playersBox?.querySelector<HTMLElement>(`[data-place="player:${id}"] button.del`)?.focus());
  }

  // Each change in the Players dialog (a name or a color set, a player moved, added, removed or restored) is one
  // undoable step: the step under way ends with the click or the change that made it, and the next one begins.
  let rosterStep: ((text: string) => void) | null = null;
  let rosterBefore: { players: Player[]; removed: Player[] } = { players: [], removed: [] };

  function beginRoster(): void {
    rosterBefore = { players: $state.snapshot(session.players), removed: $state.snapshot(session.removedPlayers ?? []) };
    rosterStep = startStep(session);
  }

  /** `clicked`: what was clicked, when a click ends the step (see fillNames). */
  function commitRoster(clicked?: EventTarget | null): void {
    if (!rosterStep) return;
    // (A click in a name box cleared to retype it: the step goes on until the box is left.)
    if (!fillNames(clicked)) return;
    // The round's party or turn order takes the change in with it, so its Undo puts them back too (a Final: the players
    // added or restored by this change).
    const had = new Set(rosterBefore.players.map((p) => p.id));
    catchUp(session.players.filter((p) => !had.has(p.id)).map((p) => p.id));
    rosterStep(rosterChange(rosterBefore, { players: session.players, removed: session.removedPlayers }));
    beginRoster();
  }

  /**
   * A name left blank goes back to the one it had (a new row: "Player N", as at Start game), so viewers never see a
   * nameless player. Not the box clicked in: it's being retyped (leaving it, Done or Esc fills it). False while that one
   * is still blank.
   */
  function fillNames(clicked?: EventTarget | null): boolean {
    const typing = clicked instanceof HTMLInputElement && clicked.matches('input.name') ? clicked.closest('[data-place]')?.getAttribute('data-place') : null;
    const had = new Map([...rosterBefore.players, ...rosterBefore.removed].map((p) => [p.id, p.name]));
    let filled = true;
    session.players.forEach((p, i) => {
      if (!blankName(p.name)) return;
      if (typing === `player:${p.id}`) return void (filled = false);
      const was = had.get(p.id);
      p.name = was && !blankName(was) ? was : `${pregameTeams ? 'Team' : 'Player'} ${i + 1}`;
    });
    return filled;
  }

  function openPlayers(): void {
    removing = null;
    host.showPlayers = true;
    beginRoster();
  }

  function closePlayers(): void {
    commitRoster();
    rosterStep = null;
    host.showPlayers = false;
  }

  /** Esc in the Players dialog: out of a name box first, then away from the "Remove?" question, then the dialog closes. */
  function playersEsc(e: KeyboardEvent): void {
    e.preventDefault();
    if (e.target instanceof HTMLElement && e.target.matches('input, select')) e.target.blur();
    else if (removing) keepPlayer();
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
    // A space's question up (worth points, or with an answer): Enter judges whoever answered, as on a clue. (Not one
    // left up from an earlier turn: Enter moves the next player, as the main button says.)
    const q = toolOverlay(app.live);
    if (q?.kind === 'popup' && (typeof q.value === 'number' || !!q.answer) && popupTurn === bgAmountKey) return false;
    if (bs.fork) {
      hint(`${playerName(session, bs.fork.playerId)} is at a fork: pick the way first (on the stage, or in the host panel)`);
      return true;
    }
    // D then Enter at once: the dice (or the wheel) are still going on screen, and the move would end them early (the
    // count isn't in the Steps box until they've landed). Under the scores too.
    const o = toolOverlay(app.live);
    if (round.mover.kind !== 'step' && (o?.kind === 'dice' || o?.kind === 'wheel') && Date.now() < overlayDoneAt(o)) {
      toast(`Still ${o.kind === 'dice' ? 'rolling' : 'spinning'}: Enter again once it lands`);
      return true;
    }
    let steps = bgSteps;
    let way: string | undefined;
    if (round.mover.kind === 'step') {
      const id = currentPlayer(bs);
      // One space a turn: once they've moved, Enter doesn't move them on (the panel's → buttons still can, on purpose).
      if (id && bs.last?.playerId === id && (bs.last.turn ?? 0) === (bs.turns ?? 0)) {
        // (A player picked: Enter is their award.)
        if (selected.length) return false;
        hint('Moved this turn: N for the next turn');
        return true;
      }
      const at = id ? bs.positions[id]?.space : undefined;
      const ways = id && at ? waysOn(round, at, bs.prev?.[id]) : [];
      if (ways.length !== 1) {
        // (A player picked: Enter is their award.)
        if (selected.length) return false;
        hint(
          ways.length
            ? stepWaysHint(round, bs, ways, dual)
            : at
              ? 'No way on from here: N for the next turn'
              : `${playerName(session, id ?? '')} isn’t on the board: N for the next turn`,
        );
        return true;
      }
      [steps, way] = [1, ways[0]];
    }
    if (!steps) {
      // (A player picked: Enter is their award.)
      if (selected.length) return false;
      // Nothing to move (it used to fall through to the award, which asked for a player).
      const id = currentPlayer(bs);
      const moved = !!id && bs.last?.playerId === id && (bs.last.turn ?? 0) === (bs.turns ?? 0);
      hint(
        moved
          ? 'Moved this turn: N for the next turn'
          : bgNoNumber !== null
            ? `No number on “${bgNoNumber}”: N for the next turn, or type the steps`
            : `${round.mover.kind === 'wheel' ? 'Spin' : 'Roll'} first (D), or type the steps`,
      );
      return true;
    }
    // Not on a space (in a zone): the roll stays on screen and in the Steps box (for the zone's escape, say).
    const who = currentPlayer(bs);
    const off = who ? offBoard(session, round, bs, who) : null;
    if (off) {
      hint(off);
      return true;
    }
    toast(moveNow(game, session, steps, way, undefined, !dual), 3000);
    app.live.overlay = null;
    host.bgSteps = null;
    return true;
  }

  /** The round's own dice or movement wheel (on stream, over the board). */
  function boardMover(o: Overlay | null): boolean {
    const { round } = boardNow(game, session);
    return !!round && isMover(round, o);
  }

  /** Next turn ▶ (◀ Previous turn: -1): a skip or a Roll again is said, it isn't simply the next player's turn. */
  function boardTurn(delta: 1 | -1): void {
    const t = turnNow(game, session, delta);
    if (t) toast(t, 4000);
  }

  /** The check's ▶ Move (or a way): whoever's turn it is (the one at a fork) `steps` spaces, the way `way` first. */
  function boardMoveBy(steps: number, way?: string): void {
    const { round, bs } = boardNow(game, session);
    if (!round || !bs) return;
    // (As Enter: the dice still going on screen, and a player in a zone, wait.)
    const o = toolOverlay(app.live);
    if ((o?.kind === 'dice' || o?.kind === 'wheel') && Date.now() < overlayDoneAt(o))
      return hint(`Still ${o.kind === 'dice' ? 'rolling' : 'spinning'}: wait for it to land`);
    const who = bs.fork?.playerId ?? currentPlayer(bs);
    const off = who ? offBoard(session, round, bs, who) : null;
    if (off) return hint(off);
    toast(moveNow(game, session, steps, way, undefined, !dual), 3000);
    app.live.overlay = null;
    host.bgSteps = null;
  }

  /**
   * The check's ▶ Run (or ▶ Start): the turn's landing actions, for whoever landed, as the space's ▶ Run all does; an
   * action for the players picked goes to those picked, as the landing box's own button does (the check waits for a pick).
   */
  function boardLanding(): void {
    const { round, bs } = boardNow(game, session);
    const last = bs?.last;
    const sp = round && last?.landed ? round.spaces.find((x) => x.id === last.landed) : undefined;
    if (sp && last) toast(runSpace(game, session, app.live, sp, [last.playerId], 'onLand', !dual, selected), 3000);
  }

  /**
   * ✎ Edit board's keys: E starts (and ends) it; while editing, Esc lets go of what's picked (then ends it), Delete
   * deletes the picked space or link, F2 renames, and the round's moves (D, Enter, N) wait. True when the key was used.
   */
  function boardEditKey(e: KeyboardEvent, k: string): boolean {
    if (!boardEdit.on) {
      host.hideControls = false;
      setEditing(true);
      return true;
    }
    if (k === 'e' && !e.shiftKey) setEditing(false);
    // Esc closes the 📜 Log or a dice/wheel overlay first, as anywhere (the board stays in edit mode).
    else if (k === 'escape' && (showLog || app.live.overlay)) return false;
    else if (k === 'escape') {
      if (boardEdit.sel || boardEdit.link || boardEdit.adding || boardEdit.connecting) {
        if (boardEdit.adding || boardEdit.connecting) [boardEdit.adding, boardEdit.connecting] = [false, false];
        else editIdle();
      } else setEditing(false);
    } else if (k === 'delete' || k === 'backspace') {
      if (boardEdit.sel) editDeleteAll(game, session, editPicked(), !dual);
      else if (boardEdit.link) editDisconnect(game, session, boardEdit.link);
    } else if (k === 'f2') {
      host.hideControls = false;
      void tick().then(() => document.querySelector<HTMLInputElement>('[data-edit-name]')?.select());
    } else if (k === 'd' || k === 'enter' || k === 'n') toast('Editing the board: press Esc (or ✓ Done editing) to play on');
    else return false;
    return true;
  }

  return {
    get removing() {
      return removing;
    },
    set removing(id: string | null) {
      removing = id;
    },
    get removingPlayer() {
      return removingPlayer;
    },
    get playersBox() {
      return playersBox;
    },
    set playersBox(el: HTMLElement | undefined) {
      playersBox = el;
    },
    get bgQuestion() {
      return bgQuestion;
    },
    regroupKey,
    removeFromGame,
    keepPlayer,
    commitRoster,
    openPlayers,
    closePlayers,
    playersEsc,
    boardEnter,
    boardMover,
    boardTurn,
    boardMoveBy,
    boardLanding,
    boardEditKey,
  };
}
