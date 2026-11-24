/**
 * Phone buzzers, the host screen's part (moved out of Play.svelte, which calls createPhones once, where this code
 * was): the buzzer room's queue and passes, wagers and answers from phones, the room's state sent as it changes, and
 * the room kept open, closed or left. Play's own state comes in through `host`, as getters, setters and functions.
 */
import { app, toast } from '../../lib/app.svelte';
import { step } from '../../lib/history.svelte';
import { clueCardWords, newId } from '../../lib/model';
import { currentFinal, currentClueInfo, nameList, playerName, forgetRedo, finalWagerProblems, finalSetWager, wagerFromPhone } from '../../lib/session';
import { cardId, cardSlides, sentSeats } from '../../lib/partner';
import { phoneCan, syncUploads } from '../../lib/cardfiles.svelte';
import { cardsOut, listedCards, sentCardId } from '../../lib/sentcards';
import { dealHeld, dealtIn } from '../../lib/deals';
import { windowCards } from '../../lib/cardwindow';
import { cardWindow, feedCardWindow } from '../../lib/cardwindow.svelte';
import { overlayDoneAt } from '../../lib/live';
import {
  buzzIdle,
  buzzMissed,
  buzzTake,
  buzzVerdicts,
  phoneTimer,
  everyoneAnswerAsk,
  finalAnswerAsk,
  hostState,
  partnerAnswerAsk,
  passAsk,
  partnerAnswerId,
  hostCards,
  phoneStatus,
  SEAT_NAME_MAX,
  sendOf,
  SETTING_UP,
  teamsOn,
  wagerAsk,
  whoBuzzed,
  type BuzzState,
} from '../../lib/buzz';
import { clip, type HostState, type WagerAsk, type AnswerAsk } from '../../lib/buzzproto';
import {
  acceptPhone,
  buzzerBase,
  buzzerOn,
  closeRoom,
  inRoom,
  kept,
  kickMember,
  kickSeat,
  moveMember,
  remote,
  resendHostState,
  roomClockOffset,
  roomHasAnswers,
  roomHasCards,
  roomHasChoices,
  roomHasWagers,
  roomLink,
  sendHostState,
  startRoom,
} from '../../lib/remote.svelte';
import { usableChoices } from '../../lib/choices';
import { clearRoom, saveRoom, type SavedRoom } from '../../lib/persist';
import { chime } from '../../lib/chime';
import type { RoomBuzz, RoomAnswer, RoomCardSeen, RoomPasses, RoomQueue, RoomWager } from '../../lib/roomlink';
import type { SetBuzzSetting } from '../BuzzerOptions.svelte';
import { startRollOff } from '../../lib/overlay';
import type { Place } from '../../lib/historylabel';
import { isColorTaken, nextFreeColor } from '../../lib/colors';
import { announce } from '../../lib/announce';
import { playCue } from '../cues';
import { logged } from '../../lib/toolset';
import type { Game, Session } from '../../lib/model';
import { untrack } from 'svelte';
import { watchPhonesAway } from './phoneaway.svelte';

/** What the phones' part reads from (and does through) the rest of the host screen: Play's own, live. */
export interface PhonesHost {
  readonly game: Game;
  readonly session: Session;
  readonly buzz: BuzzState;
  readonly buzzing: boolean;
  readonly info: ReturnType<typeof currentClueInfo>;
  readonly everyone: boolean;
  readonly finalRound: ReturnType<typeof currentFinal>;
  readonly finalTyped: boolean;
  readonly toolFirst: boolean;
  readonly markSince: number;
  readonly wagerLimitsOff: boolean;
  readonly partner: Session['partner'] | null;
  readonly phoneCards: boolean;
  readonly pregameTeams: boolean;
  readonly dual: boolean;
  readonly keptRoom: string;
  /** Who's selected (Play keeps it). */
  selected: string[];
  buzzPlayer(id: string, by?: string): boolean;
  setBuzz(b: BuzzState): void;
  later(fn: () => void, ms: number): void;
  catchUp(added?: string[]): void;
  partnerWheelUp(): boolean;
  rollOffResult(s: Session, o: { nonce: string; winner: string; ranking: string[]; purpose?: 'first' | 'tiebreak' | 'buzz'; armId?: number }): void;
  oncancel(fix?: string, at?: Place): void;
  onexit(keep: boolean): void;
  onnextgame?(): void;
}

export type Phones = ReturnType<typeof createPhones>;

/** Call once, from Play's script (its effects belong to Play). */
export function createPhones(host: PhonesHost) {
  const game = $derived(host.game);
  const session = $derived(host.session);
  const buzz = $derived(host.buzz);
  const buzzing = $derived(host.buzzing);
  const info = $derived(host.info);
  const everyone = $derived(host.everyone);
  const finalRound = $derived(host.finalRound);
  const finalTyped = $derived(host.finalTyped);
  const toolFirst = $derived(host.toolFirst);
  const markSince = $derived(host.markSince);
  const wagerLimitsOff = $derived(host.wagerLimitsOff);
  const partner = $derived(host.partner);
  const phoneCards = $derived(host.phoneCards);
  const pregameTeams = $derived(host.pregameTeams);
  const dual = $derived(host.dual);
  const keptRoom = $derived(host.keptRoom);
  const selected = $derived(host.selected);
  const { buzzPlayer, setBuzz, later, catchUp, partnerWheelUp, rollOffResult } = host;
  const oncancel = (fix?: string, at?: Place) => host.oncancel(fix, at);
  const onexit = (keep: boolean) => host.onexit(keep);
  const onnextgame = () => host.onnextgame?.();

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
    // (Not a seat taken out since: its row goes, the ranks close up. An Undo bringing it back brings its row back.)
    (roomQueue?.queue ?? [])
      .filter((q) => session.players.some((p) => p.id === q.seatId))
      .map((q, i) => ({
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
  /**
   * Pass: the open clue takes passes from phones (an ordinary buzz-in clue, its buzzers out: passAsk), and who passed in
   * its round of passes, as the room last said (a new round, ↺ Reset or the clue opened again, starts with nobody).
   */
  const passNow = $derived(phonesOn && buzzing && !toolFirst ? passAsk(game, session, buzz) : null);
  let roomPasses = $state.raw<RoomPasses | null>(null);
  const passed = $derived(passNow && roomPasses?.id === passNow.id ? roomPasses.seats.filter((x) => session.players.some((p) => p.id === x.seatId)) : []);
  /** "Passed: Ann, Bob" in the buzzers' row (teams: "Red team (Zoe)"), in the players' order. */
  const passNames = $derived(
    session.players
      .filter((p) => passed.some((x) => x.seatId === p.id))
      .map((p) => whoBuzzed(p.name, passed.find((x) => x.seatId === p.id)?.by))
      .join(', '),
  );
  $effect(() => {
    if (passNames) announce(`Passed: ${passNames}`, 'buzz-passed');
  });
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
  // Screen readers hear the buzz order, a tie, and who answers as they change (said after a moment's quiet: the order
  // and the tie only as they end up, never one out of date beside it).
  const buzzOrderSaid = $derived(queueRows.map((r) => `${r.rank}. ${r.name}${r.out ? ' (out)' : ''}`).join(', '));
  $effect(() => {
    if (buzzOrderSaid) announce(`Buzz order: ${buzzOrderSaid}`, 'buzz-order');
  });
  $effect(() => {
    if (tie.length) announce(`Tie: ${nameList(tie.map((id) => playerName(session, id)))}`, 'buzz-tie');
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
    // (With the answer on screen nobody else gets a turn: it's no question any more.)
    const queue = !session.revealed && roomQueue && roomQueue.armId > clueArmFloor ? roomQueue.queue.map((q) => ({ id: q.seatId, by: q.by })) : [];
    const after = buzzMissed(
      b,
      id,
      session.players.map((p) => p.id),
      queue,
    );
    setBuzz(after);
    return after.phase === 'answering' ? after.answering : null;
  }

  /**
   * A buzzer tie's 🎲 roll goes off the stage once the host acts on who answers (judged, ⏭ Skip, → Next in line): its
   * order is applied, and it would cover the question and who's answering now.
   */
  function dropBuzzRoll(armId: number): void {
    const o = app.live.overlay;
    const roll = (x: typeof o | undefined) => x?.kind === 'rolloff' && x.purpose === 'buzz' && x.armId === armId;
    if (roll(o)) app.live.overlay = null;
    else if (o?.kind === 'scoreboard' && roll(o.under)) o.under = undefined;
  }

  /** ⏭ Skip: the one answering passes, with no points taken (they can't buzz again on this clue). Not an undo step. */
  function skipAnswering(): void {
    const b = app.live.buzz;
    if (!buzzing || !b?.answering) return;
    dropBuzzRoll(b.armId);
    const who = playerName(session, b.answering);
    const next = passOn(b, b.answering);
    host.selected = next ? [next] : [];
    toast(next ? `Skipped ${who}: ${playerName(session, next)} answers` : `Skipped ${who}: the buzzers are open for the rest`);
  }

  /** → Next in line: they answer now, no new opening. Not an undo step (like a buzz). */
  function takeNext(id: string, by?: string): void {
    const b = app.live.buzz;
    if (!buzzing || !b) return;
    dropBuzzRoll(b.armId);
    setBuzz(buzzTake(b, id, true, by)!);
    host.selected = [id];
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
    later(
      () => {
        if (app.session !== s) return;
        const now = app.live.overlay;
        if (now?.kind !== 'rolloff' || now.nonce === nonce) rollOffResult(s, o);
      },
      overlayDoneAt(o) - Date.now() + 200,
    );
  }

  async function startPhoneRoom(): Promise<void> {
    if (!buzzerBase()) return toast("Phone buzzers aren't set up in this copy", 4000);
    const s = session;
    const room = await startRoom();
    if (!room) return toast(remote.error || "Couldn't start the buzzer room", 5000);
    // Left the game while the room was being made.
    if (app.session !== s) return void closeRoom();
    s.remote = { ...room, armId: buzz.armId };
  }

  /**
   * What the buzzer room gets now: the game's state for the phones, their status line, 🔒, the wagers and answers they
   * may send, and the 🤫 cards the host sent (a partner clue's, and those sent with 🤫 Send a card… or from a tile's
   * panel), only to a room that takes them: an older one gets no card content.
   */
  function roomState(): HostState {
    const cards = roomHasCards();
    return hostState(game, session, buzz, earlyMs, {
      status: phoneStatus(game, session, app.pregame, { cards, partnerWheel: partnerWheelUp() }),
      locked: !!session.remote?.locked,
      wager: phoneWagerAsk(),
      answers: phoneAnswerAsk(),
      cards: cards ? hostCards(game, session, phoneCan(session)) : null,
      pass: passNow,
      verdicts: phonesOn ? buzzVerdicts(game, session, markSince) : null,
      timer: phoneTimer(app.live.timer, roomClockOffset()),
    });
  }

  /**
   * A ✍ clue's answers phones may send now (until its answer is on screen), with the ones already taken. A partner clue
   * whose guesser types their guess: the guesser's, from the question on. The Final's, from its question on.
   */
  function phoneAnswerAsk(): AnswerAsk | null {
    if (partner && info && phonesOn && roomHasAnswers()) {
      // (This play's guesses: a tile played again starts with none.)
      const mine = session.remote?.answers?.id === partnerAnswerId(partner) ? session.remote.answers : undefined;
      return partnerAnswerAsk(game, session, mine?.seats);
    }
    if (everyone) return everyoneAnswerAsk(game, session, { choices: roomHasChoices() });
    return finalTyped ? finalAnswerAsk(game, session, { choices: roomHasChoices() }) : null;
  }

  /** A player sent their answer to the ✍ clue from their phone: the host sees it (nobody else). One already taken is skipped. */
  function roomAnswer(a: RoomAnswer): void {
    const r = session.remote;
    const ask = phonesOn && r ? phoneAnswerAsk() : null;
    // (The room decides what's in time: one it took just before the answer showed still counts.)
    const seat = ask?.id === a.id ? ask.seats.find((x) => x.id === a.seatId) : undefined;
    if (!r || !ask || !seat || a.n <= (seat.got ?? 0)) return;
    const by = a.by && game.settings.buzzTeams ? { by: a.by } : {};
    // (A multiple choice's pick, while it's still one of the choices.)
    const f = session.final;
    const list = finalTyped && f ? finalRound?.choices : info?.clue.choices;
    const pick = a.pick && usableChoices(list).some((c) => c.id === a.pick) ? { pick: a.pick } : {};
    // The Final's: kept with the Final (no toast, no step, nothing in the 📜 Log: only the host panel shows it).
    if (finalTyped && f) {
      f.answers = { ...f.answers, [a.seatId]: { text: a.text, n: a.n, ...by, ...pick } };
      return;
    }
    const was = r.answers?.id === ask.id ? r.answers : undefined;
    r.answers = { id: ask.id, seats: { ...was?.seats, [a.seatId]: { text: a.text, n: a.n, ...by, ...pick } }, ...(was?.locked ? { locked: true } : {}) };
    // (A ✔ / ✘ on their answer that Ctrl+Z took back isn't brought back by ↷ Redo beside this one.)
    if (everyone && info) forgetRedo(session, info.clue.id, a.seatId);
  }

  /**
   * A phone showed a 🤫 card the host sent it ("✓ seen" on its row). Only for a send that's still out: the room passes
   * them on again when the host comes back.
   */
  function roomCardSeen(c: RoomCardSeen): void {
    const r = session.remote;
    const s = session.partner;
    // (The partner clue's sends, and the cards out with 🤫 Send a card… or from a tile's panel.)
    const live = new Set([...(s?.sent ?? []).map((x) => cardId(s!.clue, x)), ...cardsOut(game, session).map(sentCardId)]);
    if (!phonesOn || !r || !live.size) return;
    // (One card per part of a send counts as the send; the team's line with the describer's card isn't the card.)
    const id = sendOf(c.id);
    if (!live.has(id) || c.id.endsWith('~t')) return;
    const who = c.member ? `${c.seatId}/${c.member}` : c.seatId;
    const was = Object.fromEntries(Object.entries(r.cardsSeen ?? {}).filter(([k, v]) => live.has(k) && Array.isArray(v)));
    if (was[id]?.includes(who)) return;
    r.cardsSeen = { ...was, [id]: [...(was[id] ?? []), who] };
  }

  /** The wagers phones may send now (none before the game starts), with the ones already taken from them. */
  function phoneWagerAsk(): WagerAsk | null {
    if (app.pregame) return null;
    const first = wagerAsk(game, session, wagerLimitsOff);
    const took = first && session.remote?.wagerGot?.id === first.id ? session.remote.wagerGot : undefined;
    return took && Object.keys(took.seats).length ? wagerAsk(game, session, wagerLimitsOff, took.seats, took.amounts) : first;
  }

  /**
   * A player picked another colour on their phone: theirs if it's one of the players' colours (they read on stream) and
   * no other player has it. Before the game it's simply their colour; during it, a step like any other.
   */
  function roomColor({ seatId, color }: { seatId: string; color: string }): void {
    if (!phonesOn || game.settings.phoneColorsOff || teamsOn(game.settings)) return;
    const p = session.players.find((x) => x.id === seatId);
    // (Any color: a palette one, or any other, from the phone's ＋ Pick any color.)
    if (!p || p.color.toLowerCase() === color || !/^#[0-9a-f]{6}$/.test(color)) return;
    if (
      isColorTaken(
        color,
        session.players.filter((x) => x.id !== seatId).map((x) => x.color),
      )
    )
      return;
    // (Not an undo step: Ctrl+Z is the host's, for what they did.)
    p.color = color;
  }

  /**
   * A player sent their wager from their phone (the room checked it). It goes in their box, marked 📱 (the host can
   * still type over it): a Daily Double's before its question shows; a Final's on its wager screen, as a step ("Ann’s
   * wager (from their phone)"). One already taken (a room passing it on again after a reconnect) is skipped.
   */
  function roomWager(w: RoomWager): void {
    const r = session.remote;
    const ask = phonesOn && r ? phoneWagerAsk() : null;
    const seat = ask?.open && ask.id === w.id ? ask.seats.find((x) => x.id === w.seatId) : undefined;
    if (!r || !ask || !seat || w.n <= (seat.got ?? 0)) return;
    if (ask.limit && w.amount > seat.max) return;
    const same = r.wagerGot?.id === ask.id ? r.wagerGot : undefined;
    r.wagerGot = { id: ask.id, seats: { ...same?.seats, [w.seatId]: w.n }, amounts: { ...same?.amounts, [w.seatId]: w.amount } };
    const name = playerName(session, w.seatId);
    const by = w.by && game.settings.buzzTeams ? w.by : '';
    const from = by ? `from ${by}’s phone` : 'from their phone';
    // (A screen reader is told it's in, never how much.)
    if (ask.kind === 'dd' && session.dd) {
      session.dd.draft = w.amount;
      session.dd.draftFrom = 'phone';
      if (by) session.dd.draftBy = by;
      else delete session.dd.draftBy;
      announce(`${name}’s wager is in (${from})`);
      return;
    }
    const f = session.final;
    if (ask.kind !== 'final' || !f) return;
    const was = f.wagers[w.seatId];
    if (was === w.amount && wagerFromPhone(f, w.seatId) && (f.wagerBy?.[w.seatId] ?? '') === by) return;
    // (The amount stays out of the step's name, as it stays out of the wager box in one window, where viewers see ↶ Undo's
    // toast and the 📜 Log too. A step keeps its name, so it stays out with the audience window open as well: closed, or
    // after a reload in one window, the steps taken before would show it.)
    const waiting = finalWagerProblems(session, game).missing.length;
    logged(session, `${name}’s wager (${from})`, () => finalSetWager(session, w.seatId, w.amount, 'phone', by || undefined));
    announce(`${name}’s wager is in (${from})`);
    if (waiting && !finalWagerProblems(session, game).missing.length) announce('All wagers are in');
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
  /** A ✍ clue's (or a typed Final's) multiple choices with a buzzer server too old to show them: phones type, and a letter counts. */
  const choicesNote = $derived(
    usableChoices(everyone ? info?.clue.choices : finalTyped ? finalRound?.choices : undefined).length > 0 && remote.status === 'online' && !roomHasChoices()
      ? 'This buzzer server can’t show the choices on phones (it’s an older one): players type the letter or the words, and they count as that choice.'
      : '',
  );
  /** An older buzzer server with phones in it, in a Final they'd type their answers in: they answer out loud. */
  const answersNote = $derived(
    phonesOn &&
      session.phase === 'final' &&
      !!finalRound &&
      !finalRound.phoneAnswersOff &&
      remote.status === 'online' &&
      !roomHasAnswers() &&
      remote.phones.some((p) => p.seatId)
      ? 'This buzzer server can’t take answers from phones (it’s an older one): players answer out loud.'
      : '',
  );

  /** A buzz the room let through: the first one answers (unless the host picked someone already). */
  function roomBuzz(b: RoomBuzz): void {
    if (!phonesOn) return;
    // The room moved on to "answering" by itself: if that's not what happened here, it hears the host's state again.
    if (b.rank === 1 && (b.armId !== buzz.armId || !buzzPlayer(b.seatId, b.by))) resendHostState();
  }

  /** What the phones list's buttons say when the room can't be told (its connection is down): nothing was done. */
  const roomOffline = () => toast('The buzzer room isn’t reachable right now: try again once it’s back', 4000);

  /** Someone asked to join from their phone: a new player (an undoable step mid-game), then their phone gets the seat. */
  function addPhonePlayer(conn: string, name: string): void {
    // (Not added at all: their phone would never hear it, and wait to be let in for good.)
    if (remote.status !== 'online') return roomOffline();
    if (session.players.length >= game.settings.maxPlayers)
      return toast(
        `The game is full: ${game.settings.maxPlayers} ${pregameTeams ? 'teams' : 'players'} at most (⚖ Game rules › Most ${pregameTeams ? 'teams' : 'players'})`,
      );
    let who = clip(name.trim(), SEAT_NAME_MAX) || `Player ${session.players.length + 1}`;
    // Never a second "Ann": the new one is "Ann 2".
    const taken = (n: string) => session.players.some((x) => x.name.trim().toLowerCase() === n.toLowerCase());
    if (taken(who)) {
      let i = 2;
      while (taken(`${who} ${i}`)) i++;
      who = `${who} ${i}`;
    }
    const p = { id: newId(), name: who, color: nextFreeColor(session.players.map((x) => x.color)), startScore: 0 };
    // (Mid-game the round takes them in with it, as the Players dialog does: the step's Undo takes them out of both.)
    if (app.pregame) session.players.push(p);
    else
      logged(session, `Added ${who} (from their phone)`, () => {
        session.players.push(p);
        catchUp([p.id]);
      });
    // The room has to know the seat before the phone takes it.
    sendHostState(roomState(), true);
    acceptPhone(conn, p.id);
    toast(`${who} joined from their phone`);
  }

  function kickPhone(seatId: string, free = false): void {
    // ↩ Let back: the phone kicked off this seat a moment ago may take it again.
    const letBack = free && seatId in remote.kicked && !remote.phones.some((p) => p.seatId === seatId);
    if (!kickSeat(seatId, free)) return roomOffline();
    if (letBack) return toast(`${playerName(session, seatId)}'s phone can take the seat again`, 4000);
    // 🔒 Locked seats take no tap on a name, a freed one's too: the lock has to come off for them to get back in.
    if (free && session.remote?.locked)
      toast(
        `${playerName(session, seatId)}'s seat is free, but 🔒 seats are locked: untick Lock seats so they can tap their name on their new phone (lock them again once they're in)`,
        6000,
      );
    else if (free) {
      // A 🤫 card out to that seat: the new phone is late for it (the room never gives it to a new phone by itself).
      const s = partner;
      const out =
        s && info && phoneCards ? cardSlides(info.clue).flatMap((c, i) => (sentSeats(session, s, c.id).includes(seatId) ? [clueCardWords(c, i)] : [])) : [];
      // (And the cards out with 🤫 Send a card… or from a tile's panel, by their labels: "Card 3".)
      if (phoneCards) out.push(...listedCards(game, session).flatMap((c) => (c.to.some((t) => t.seat === seatId) ? [c.label] : [])));
      // (A 🎭 deal's: for everyone dealt in, a part or not, the same words, while any of its cards is held, whoever was
      // taken out. Only those with a part have a card, so naming it only for them would say who got one.)
      if (phoneCards && dealHeld(game, session).length && dealtIn(session.deal!).some((t) => t.seat === seatId)) out.push('🎭 the deal (in 🎭 Deal…)');
      if (out.length) toast(`${playerName(session, seatId)}'s seat is free: once they're on the new phone, ↻ Send again ${nameList(out)}`, 6000);
      else toast(`${playerName(session, seatId)}'s seat is free: they can tap their name on their new phone`, 4000);
    } else if (game.settings.buzzTeams) toast(`Everyone's phone is off ${playerName(session, seatId)} (they can't join it again for 2 minutes)`, 4000);
    else toast(`Took ${playerName(session, seatId)}'s seat back from their phone (it can't take it again for 2 minutes)`, 4000);
  }

  /** Teams: one person off their team (their phone can't join it again for 2 minutes; another team it can). */
  function kickTeamMember(seatId: string, member: string, name: string): void {
    if (!kickMember(seatId, member)) return roomOffline();
    toast(`${name} is off ${playerName(session, seatId)} (that phone can't join it again for 2 minutes)`, 4000);
  }

  /** Teams: put one person on another team. */
  function moveTeamMember(member: string, seatId: string, name: string): void {
    if (!moveMember(member, seatId)) return roomOffline();
    toast(`${name} moved to ${playerName(session, seatId)}`);
  }

  // Whatever the phones need to know (the players, scores, the buzzers, the clue's words) goes to the room as it changes.
  let sentPhase = '';
  $effect(() => {
    if (!phonesOn || remote.status === 'off' || remote.status === 'error') return;
    // Not before the room has said what it can do (a reload connects afresh): a state worked out before would leave out
    // the 🤫 cards it takes, and the room would take them off the phones and count their late rule again from then.
    if (!remote.welcomed) return;
    const st = roomState();
    // The buzzers opening goes at once (players are racing).
    const now = st.phase !== sentPhase && st.phase === 'armed';
    sentPhase = st.phase;
    untrack(() => !keepRoomOpen && sendHostState(st, now));
  });
  // 🤫 Card files go up for the cards the host sent or got ready (⇡), and only those (a reload finishes what a press
  // started; nothing goes up by itself). A card taken back, or the tile closing, drops what was still waiting.
  $effect(() => {
    if (phonesOn) syncUploads(game, session, partner ? info?.clue : undefined);
  });
  // Who saw which card is forgotten with the cards (the tile closed, or they were all taken back).
  $effect(() => {
    if (session.remote?.cardsSeen && !session.partner?.sent?.length && !session.cards?.length) untrack(() => session.remote && delete session.remote.cardsSeen);
  });
  // 🪟 The card window shows its player's cards as they are now (to it alone: never through the viewers' windows).
  $effect(() => {
    const seat = cardWindow.open ? cardWindow.seat : null;
    if (!seat) return;
    const name = playerName(session, seat);
    const cards = windowCards(game, session, seat);
    untrack(() => feedCardWindow(name, $state.snapshot(cards) as typeof cards));
  });
  // The pre-game screen's room is saved on its own (nothing else is before Start game): a reload gets back into it.
  $effect(() => {
    if (!app.pregame || !session.remote || !phonesOn) return;
    const r: SavedRoom = {
      gameId: game.id,
      remote: $state.snapshot(session.remote),
      players: $state.snapshot(session.players),
      screen: 'pregame',
      savedAt: Date.now(),
      settings: $state.snapshot(game.settings),
    };
    untrack(() => !keepRoomOpen && void saveRoom(r));
  });

  /** Set by ◀ Back to editor: the room stays open while the host is in the editor. */
  let keepRoomOpen = false;
  /**
   * ◀ Back to editor (pre-game): the room stays open, its phones told the host is setting up; ▶ Play goes back into it.
   * Only Exit / End game, ⏹ Close the room… or turning Buzzer mode off close it.
   */
  function backToEditor(fix?: string, at?: Place): void {
    // (A room started here that no phone is in, while the kept game's phones wait in its own: it closes, as with
    // ▶ Resume it, so Resume game goes back to theirs. Nobody is in it to be told.)
    if (app.pregame && keptRoom && session.remote) {
      const code = session.remote.code;
      closeRoom();
      session.remote = null;
      void clearRoom();
      toast(`📱 Room ${code} closed (no phone had joined it): Resume game goes back to room ${keptRoom}`, 5000);
    } else if (app.pregame) keepRoomInEditor();
    oncancel(fix, at);
  }

  /**
   * Back to the editor with the buzzer room left open (◀ Back to editor, Exit › Keep & leave, ▶ Next game…): its phones
   * are told the host is setting up, and it's saved (a reload keeps it); ▶ Play (or Resume) goes back into it. The
   * players go with it, at their start scores (a game played since starts them at 0). `resumable`: the game is kept to
   * resume (Exit › Keep & leave), so the 🤫 cards out stay out until Resume: a room state without them would make the
   * room forget their ids, and a phone seated while the host is in the editor would get them on Resume as if new.
   */
  function keepRoomInEditor(resumable = false): boolean {
    const r = session.remote;
    if (app.test || !phonesOn || !r || !inRoom(r.code)) return false;
    const players = $state.snapshot(session.players).map((p) => (app.pregame ? p : { ...p, startScore: 0 }));
    const cards = resumable && roomHasCards() ? ($state.snapshot(hostCards(game, session, phoneCan(session))) ?? undefined) : undefined;
    const saved: SavedRoom = {
      gameId: game.id,
      remote: $state.snapshot(r),
      players,
      screen: 'editor',
      savedAt: Date.now(),
      settings: $state.snapshot(game.settings),
      ...(cards ? { cards } : {}),
    };
    // (Not the last game's places: after ▶ Next game… the phones wait for the next one.)
    const { over: _over, ...st } = hostState(game, session, buzzIdle(buzz), earlyMs, { status: { text: SETTING_UP }, locked: !!r.locked, cards });
    sendHostState(st, true);
    keepRoomOpen = true;
    kept.room = saved;
    void saveRoom(saved);
    return true;
  }

  /** ⏹ Close the room… (the 📱 card): the phones are told the game is over; Start the room makes a new one. */
  function closePhoneRoom(): void {
    const told = closeRoom();
    session.remote = null;
    void clearRoom();
    toast(
      told ? 'Buzzer room closed: the phones were told' : 'Buzzer room closed: it’s out of reach right now; the phones are told if it answers within a minute',
    );
  }

  /** 🔒 Lock seats: no new phone takes a seat or asks to join; players already in (teams: people on one) come back. */
  function lockSeats(on: boolean): void {
    if (!session.remote) return;
    session.remote.locked = on || undefined;
    toast(on ? `🔒 Seats locked: only ${pregameTeams ? 'people already on a team' : 'players already in'} can come back` : 'Seats open again');
  }

  /** Buzzer mode with the room out of reach: the host panel says the phones can't buzz (not "Buzzers open"). */
  const phonesDown = $derived(
    !phonesOn
      ? ''
      : remote.status === 'off'
        ? 'No buzzer room is running: phones can’t buzz (📱 chip › Start the room). 1–9 still pick.'
        : remote.status === 'online'
          ? ''
          : remote.status === 'error'
            ? `⚠ Phones not connected: ${remote.error || 'the buzzer room was lost'} (📱 chip). 1–9 still pick.`
            : '⚠ Phones not connected: the buzzer room can’t be reached right now, so phones can’t buzz. 1–9 still pick.',
  );
  // The room turned this game away for good mid-game (it ended, or another window took it): the host is told why, once
  // (the panel line and the 📱 chip keep saying it).
  let lostSaid = '';
  $effect(() => {
    const lost =
      phonesOn && !app.pregame && remote.status === 'error' && remote.closedCode && session.remote?.code === remote.code
        ? `${remote.code}:${remote.closedCode}`
        : '';
    untrack(() => {
      if (lost && lost !== lostSaid) toast(`📱 ${remote.error}`, 6000);
      lostSaid = lost;
    });
  });

  // Someone asks to join from their phone: the host hears it (a toast, and a soft chime when the stream is the other
  // window), not only a number on the 📱 chip.
  let askSeen = new Set<string>();
  $effect(() => {
    const asking = phonesOn ? remote.phones.filter((p) => !p.seatId && p.pendingName && p.connected && !remote.answered.includes(p.conn)) : [];
    untrack(() => {
      const fresh = asking.filter((p) => !askSeen.has(p.conn));
      askSeen = new Set(asking.map((p) => p.conn));
      if (!fresh.length) return;
      if (dual) chime();
      // (Before the game the Start bar's room line says it, with ✔ Add and ✕ No: a toast would sit over it.)
      if (app.pregame) return;
      const names = nameList(fresh.map((p) => p.pendingName ?? ''));
      toast(`📱 ${names} ${fresh.length === 1 ? 'wants' : 'want'} to join: click the 📱 chip`, 5000);
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
      !!room &&
      (!!session.remote?.locked || (!teamsOn(game.settings) && seated && (!game.settings.phoneJoin || session.players.length >= game.settings.maxPlayers)));
    untrack(() => {
      if (live.room?.code !== room?.code || live.room?.link !== room?.link || !!live.room?.closed !== closed)
        live.room = room && (closed ? { ...room, closed } : room);
    });
  });

  /**
   * Exit › Keep & leave: the buzzer room stays open with the kept game (its phones are told the host is setting up), and
   * Resume goes back into it. Discard & leave, or leaving the results, closes it (phones are told the game is over) and
   * the saved game forgets it. (A test never had one: a room kept open in the editor stays open.)
   */
  function exitGame(keep: boolean): void {
    // (Only this game's own room: one kept in the editor that it didn't take, as with results viewed, stays open.)
    if (!app.test && session.remote && !(keep && session.phase !== 'end' && keepRoomInEditor(true))) {
      closeRoom();
      session.remote = null;
      void clearRoom();
    }
    onexit(keep);
  }

  // Whose phone dropped, and since when: kept up to date on the pre-game screen too (its phones list shows it).
  watchPhonesAway();

  /** Game over › ▶ Next game…: the room (and its players) stays open for the stream's next game. */
  function nextGame(): void {
    keepRoomInEditor();
    onnextgame?.();
  }

  return {
    get phonesOn() {
      return phonesOn;
    },
    get roomQueue() {
      return roomQueue;
    },
    set roomQueue(q: RoomQueue | null) {
      roomQueue = q;
    },
    get clueArmFloor() {
      return clueArmFloor;
    },
    set clueArmFloor(n: number) {
      clueArmFloor = n;
    },
    get roomPasses() {
      return roomPasses;
    },
    set roomPasses(p: RoomPasses | null) {
      roomPasses = p;
    },
    get keepRoomOpen() {
      return keepRoomOpen;
    },
    set keepRoomOpen(on: boolean) {
      keepRoomOpen = on;
    },
    get queueRows() {
      return queueRows;
    },
    get passNow() {
      return passNow;
    },
    get passed() {
      return passed;
    },
    get passNames() {
      return passNames;
    },
    get tie() {
      return tie;
    },
    get nextInLine() {
      return nextInLine;
    },
    get wagerPhones() {
      return wagerPhones;
    },
    get wagerNote() {
      return wagerNote;
    },
    get choicesNote() {
      return choicesNote;
    },
    get answersNote() {
      return answersNote;
    },
    get phonesDown() {
      return phonesDown;
    },
    setBuzzSetting,
    ordinal,
    roomQueueIn,
    passOn,
    dropBuzzRoll,
    skipAnswering,
    takeNext,
    rollTie,
    startPhoneRoom,
    roomState,
    roomAnswer,
    roomCardSeen,
    roomColor,
    roomWager,
    roomBuzz,
    addPhonePlayer,
    kickPhone,
    kickTeamMember,
    moveTeamMember,
    backToEditor,
    keepRoomInEditor,
    closePhoneRoom,
    lockSeats,
    exitGame,
    nextGame,
  };
}
