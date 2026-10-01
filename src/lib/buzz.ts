// Buzzer mode's state during a clue: whether the buzzers are open, who is answering, who already missed it. The host
// decides all of it (keys, the host panel, a phone's buzz that the buzzer room let through); it lives in Live, so the
// audience window shows "🔔 Ann is answering", and the phones get it through hostState().
import type { BuzzPhase, HostState } from './buzzproto';
import { categoryLabel, formatPoints, type Game, type Id, type Session, type Slide, type TextEl } from './model';
import { currentClueInfo, score } from './session';

export interface BuzzState {
  phase: BuzzPhase;
  /** Goes up by one each time the buzzers open (a phone's buzz names the opening it was for). */
  armId: number;
  /** Who is answering (phase 'answering'). */
  answering: Id | null;
  /** Players who already missed this clue: they can't buzz again until 0 opens the buzzers for everyone. */
  lockedOut: Id[];
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

/** The one answering got it wrong: they're locked out, and the buzzers open again for the rest (a rebound). */
export function buzzMissed(b: BuzzState, id: Id, players: Id[]): BuzzState {
  const lockedOut = b.lockedOut.includes(id) ? [...b.lockedOut] : [...b.lockedOut, id];
  return buzzArm({ ...b, answering: null, lockedOut }, players);
}

/** Answered right: the buzzers close for this clue (0 opens them again). */
export function buzzDone(b: BuzzState): BuzzState {
  return { phase: 'closed', armId: b.armId, answering: null, lockedOut: [...b.lockedOut] };
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

/**
 * What the buzzer room gets: the players, scores and the buzzers' state, and while a clue is open its question's words
 * and caption. Built here only, from a whitelist: never answers, host notes, media or the game's other content.
 */
export function hostState(game: Game, session: Session, b: BuzzState, earlyLockMs: number): HostState {
  const info = b.phase !== 'lobby' && session.phase === 'clue' ? currentClueInfo(session, game) : null;
  const seats = session.players.map((p) => ({ id: p.id, name: p.name, color: p.color }));
  return {
    title: game.title,
    seats,
    allowNew: !!game.settings.phoneJoin,
    phase: b.phase,
    armId: b.armId,
    clue: info ? { text: questionText(info.clue.questionSlide), caption: `${categoryLabel(info.category)} · ${formatPoints(info.value, game.settings.currencySymbol)}` } : null,
    answering: b.phase === 'answering' ? b.answering : null,
    lockedOut: b.phase === 'lobby' ? [] : b.lockedOut.filter((id) => seats.some((s) => s.id === id)),
    earlyLockMs,
    scores: Object.fromEntries(session.players.map((p) => [p.id, score(session, p.id)])),
  };
}
