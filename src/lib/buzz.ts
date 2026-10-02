// Buzzer mode's state during a clue: whether the buzzers are open, who is answering, who already missed it. The host
// decides all of it (keys, the host panel, a phone's buzz that the buzzer room let through); it lives in Live, so the
// audience window shows "🔔 Ann is answering", and the phones get it through hostState().
import { clip, type BuzzPhase, type HostState } from './buzzproto';
import { categoryLabel, finalName, formatPoints, roundName, type Game, type Id, type Session, type Slide, type TextEl } from './model';
import { currentClueInfo, currentFinal, score, shownQuestionSlide } from './session';

export interface BuzzState {
  phase: BuzzPhase;
  /** Goes up by one each time the buzzers open (a phone's buzz names the opening it was for). */
  armId: number;
  /** Who is answering (phase 'answering'). */
  answering: Id | null;
  /** Players who already missed this clue: they can't buzz again until 0 opens the buzzers for everyone. */
  lockedOut: Id[];
  /** Phone buzzers: a tie the host rolled for, in roll order (answering first). Dropped by any other change. */
  rollOrder?: Id[];
  /** Answered right: the clue is over (phones say who got it, not "Get ready"). Dropped by any other change. */
  done?: boolean;
  doneBy?: Id | null;
}

export function newBuzz(armId = 0): BuzzState {
  return { phase: 'lobby', armId, answering: null, lockedOut: [] };
}

/** No clue to buzz on (the board, a Daily Double, another round): nothing open, nobody locked out. */
export function buzzIdle(b: BuzzState): BuzzState {
  return { phase: 'lobby', armId: b.armId, answering: null, lockedOut: [] };
}

/** A tile opened: nobody is locked out; the buzzers open now, or (`armNow` false) once the host opens them. */
export function buzzClueOpened(b: BuzzState, armNow: boolean): BuzzState {
  return armNow ? { phase: 'armed', armId: b.armId + 1, answering: null, lockedOut: [] } : { phase: 'closed', armId: b.armId, answering: null, lockedOut: [] };
}

/** Open the buzzers (for everyone not locked out). With everyone locked out they stay closed. */
export function buzzArm(b: BuzzState, players: Id[]): BuzzState {
  const left = players.filter((id) => !b.lockedOut.includes(id));
  if (players.length && !left.length) return { ...b, phase: 'closed', answering: null };
  return { phase: 'armed', armId: b.armId + 1, answering: null, lockedOut: [...b.lockedOut] };
}

/** 0: everyone may buzz again (the locked-out players too). */
export function buzzReset(b: BuzzState): BuzzState {
  return { phase: 'armed', armId: b.armId + 1, answering: null, lockedOut: [] };
}

/**
 * Player `id` buzzed in: they answer. Null when it doesn't count: someone is answering already, or they missed this clue.
 * `force` (the host picked them) skips both checks.
 */
export function buzzTake(b: BuzzState, id: Id, force = false): BuzzState | null {
  if (!force && (b.phase === 'answering' || b.phase === 'lobby' || b.lockedOut.includes(id))) return null;
  return { phase: 'answering', armId: b.armId, answering: id, lockedOut: [...b.lockedOut] };
}

/**
 * The one answering got it wrong: they're locked out. The next in the clue's buzz order (`queue`, fastest first) who
 * hasn't missed it answers now; with nobody left in it, the buzzers open again for the rest (a rebound).
 */
export function buzzMissed(b: BuzzState, id: Id, players: Id[], queue: Id[] = []): BuzzState {
  const lockedOut = b.lockedOut.includes(id) ? [...b.lockedOut] : [...b.lockedOut, id];
  const next = queue.find((q) => !lockedOut.includes(q) && players.includes(q));
  if (next) return { phase: 'answering', armId: b.armId, answering: next, lockedOut };
  return buzzArm({ ...b, answering: null, lockedOut }, players);
}

/** Answered right: the buzzers close for this clue (0 opens them again). */
export function buzzDone(b: BuzzState): BuzzState {
  return { phase: 'closed', armId: b.armId, answering: null, lockedOut: [...b.lockedOut], done: true, doneBy: b.answering };
}

/** The question slide's words, for the phones: text boxes only, top to bottom, none hidden from viewers. */
export function questionText(s: Slide | undefined): string {
  if (!s) return '';
  const texts = s.elements.filter((e): e is TextEl => e.kind === 'text' && !e.secret && !!e.text.trim());
  texts.sort((a, b) => a.y - b.y || a.x - b.x);
  return texts
    .map((t) => t.text.trim())
    .join('\n')
    .slice(0, 500);
}

/** The phones' status line while the host is back in the editor with the room kept open. */
export const SETTING_UP = 'The host is setting up — hang on';

/**
 * A short line for the phones about what's on screen when nobody buzzes: the round starting, who picks, a Daily Double
 * (its player sees "you're up"), a Final, an RPG or board game round, the end. Null during an ordinary clue.
 */
export function phoneStatus(game: Game, session: Session, pregame = false): HostState['status'] {
  if (pregame) return { text: 'The game starts soon' };
  const nameOf = (id?: Id | null) => (id ? session.players.find((p) => p.id === id)?.name : undefined);
  const round = game.rounds[session.currentRound];
  if (session.phase === 'clue' && session.dd) {
    const id = session.dd.playerId;
    const who = nameOf(id);
    return who && id ? { text: `Daily Double: ${who}`, seats: [id], seatsText: 'Daily Double — you’re up!' } : { text: 'Daily Double!' };
  }
  if (session.intro?.stage === 'title' && round) return { text: `${roundName(round, session.currentRound)} is starting` };
  switch (session.phase) {
    case 'board': {
      const id = session.currentPickerId;
      const who = nameOf(id);
      return who && id ? { text: `${who} picks the next clue`, seats: [id], seatsText: 'Your pick! Tell the host which clue' } : null;
    }
    case 'final': {
      const f = currentFinal(session, game);
      const n = f ? finalName(f) : 'Final';
      return { text: session.finalStep === 'wagers' ? `${n}: time to wager` : n };
    }
    case 'rpg':
    case 'boardgame':
      return round ? { text: roundName(round, session.currentRound) } : null;
    case 'tiebreaker':
      return { text: 'Tiebreaker!' };
    case 'end':
      return { text: 'Game over: thanks for playing!' };
  }
  return null;
}

/** A player's name as the phones get it (the room takes 40 characters at most). */
export const SEAT_NAME_MAX = 40;

/**
 * What the buzzer room gets: the players, scores and the buzzers' state, and while a clue is open its question's words
 * and caption (the question slide on screen). Built here only, from a whitelist: never answers, host notes, media or the game's other content.
 * `extra`: the phones' status line (phoneStatus) and 🔒 locked seats.
 */
export function hostState(
  game: Game,
  session: Session,
  b: BuzzState,
  earlyLockMs: number,
  extra: { status?: HostState['status']; locked?: boolean } = {},
): HostState {
  const info = b.phase !== 'lobby' && session.phase === 'clue' ? currentClueInfo(session, game) : null;
  const seats = session.players.map((p) => ({ id: p.id, name: clip(p.name.trim(), SEAT_NAME_MAX), color: p.color }));
  return {
    title: clip(game.title, 200),
    seats,
    allowNew: !!game.settings.phoneJoin,
    phase: b.phase,
    armId: b.armId,
    clue: info ? { text: questionText(shownQuestionSlide(session, info.clue)), caption: `${categoryLabel(info.category)} · ${formatPoints(info.value, game.settings.currencySymbol)}` } : null,
    answering: b.phase === 'answering' ? b.answering : null,
    ...(b.phase === 'answering' && b.rollOrder?.length ? { rollOrder: b.rollOrder.filter((id) => seats.some((s) => s.id === id)) } : {}),
    lockedOut: b.phase === 'lobby' ? [] : b.lockedOut.filter((id) => seats.some((s) => s.id === id)),
    earlyLockMs,
    scores: Object.fromEntries(session.players.map((p) => [p.id, score(session, p.id)])),
    // Added later (an older room drops them).
    ...(b.phase === 'closed' && b.done ? { done: { by: b.doneBy && seats.some((s) => s.id === b.doneBy) ? b.doneBy : null } } : {}),
    ...(extra.status?.text ? { status: extra.status } : {}),
    ...(game.settings.currencySymbol ? { currency: game.settings.currencySymbol } : {}),
    ...(extra.locked ? { locked: true } : {}),
  };
}

/**
 * The room's state while the host is back in the editor with the room left open (after a reload there, when there's no
 * game on to build it from): the pre-game players in the lobby, and "The host is setting up — hang on".
 */
export function setupState(game: Game, players: Session['players'], armId: number, earlyLockMs: number, locked = false): HostState {
  return {
    title: clip(game.title, 200),
    seats: players.map((p) => ({ id: p.id, name: clip(p.name.trim(), SEAT_NAME_MAX), color: p.color })),
    allowNew: !!game.settings.phoneJoin,
    phase: 'lobby',
    armId,
    clue: null,
    answering: null,
    lockedOut: [],
    earlyLockMs,
    scores: Object.fromEntries(players.map((p) => [p.id, p.startScore ?? 0])),
    status: { text: SETTING_UP },
    ...(game.settings.currencySymbol ? { currency: game.settings.currencySymbol } : {}),
    ...(locked ? { locked: true } : {}),
  };
}
