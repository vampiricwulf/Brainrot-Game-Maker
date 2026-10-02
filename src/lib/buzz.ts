// Buzzer mode's state during a clue: whether the buzzers are open, who is answering, who already missed it. The host
// decides all of it (keys, the host panel, a phone's buzz that the buzzer room let through); it lives in Live, so the
// audience window shows "🔔 Ann is answering", and the phones get it through hostState().
import { clip, WAGER_MAX, type BuzzPhase, type HostState, type WagerAsk } from './buzzproto';
import { categoryLabel, finalName, formatPoints, roundName, type Game, type Id, type Session, type Slide, type TextEl } from './model';
import { currentClueInfo, currentFinal, ddCap, finalWagerCap, score, shownQuestionSlide, wagerFromPhone } from './session';

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
  /**
   * Teams (⚙ Teams on the 📱 card): who on the answering team buzzed (their own name, from their phone), so the host and
   * viewers see "Ann (Red team)". Left out when nobody did (the host picked the team) or teams are off.
   */
  by?: string;
}

/** A place in the buzz order: a player (team) id, or (teams) with the name of the team member who buzzed. */
export type QueuedId = Id | { id: Id; by?: string };

/** Teams are on: each player is a team that any number of phones join (the 📱 card's Teams). */
export const teamsOn = (settings: { buzzTeams?: boolean }): boolean => !!settings.buzzTeams;

/** Who buzzed, as the host and viewers see it: "Ann (Red team)" for a team member, else the player's name. */
export const whoBuzzed = (name: string, by?: string | null): string => (by ? `${by} (${name})` : name);

/**
 * The buzz order with each player (team) once, fastest first: a teammate's later buzz never counts as another place.
 * (The buzzer room already sends it so; this keeps the host's side right whatever it is given.)
 */
export function buzzOrder(queue: QueuedId[]): { id: Id; by?: string }[] {
  const seen = new Set<Id>();
  const out: { id: Id; by?: string }[] = [];
  for (const q of queue) {
    const e = typeof q === 'string' ? { id: q } : q;
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e.by ? { id: e.id, by: e.by } : { id: e.id });
  }
  return out;
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
  if (players.length && !left.length) {
    const { by: _by, ...rest } = b;
    return { ...rest, phase: 'closed', answering: null };
  }
  return { phase: 'armed', armId: b.armId + 1, answering: null, lockedOut: [...b.lockedOut] };
}

/** 0: everyone may buzz again (the locked-out players too). */
export function buzzReset(b: BuzzState): BuzzState {
  return { phase: 'armed', armId: b.armId + 1, answering: null, lockedOut: [] };
}

/**
 * Player `id` buzzed in: they answer. Null when it doesn't count: someone is answering already, or they missed this clue.
 * `force` (the host picked them) skips both checks. `by` (teams): the team member who buzzed for team `id`.
 */
export function buzzTake(b: BuzzState, id: Id, force = false, by?: string): BuzzState | null {
  if (!force && (b.phase === 'answering' || b.phase === 'lobby' || b.lockedOut.includes(id))) return null;
  return { phase: 'answering', armId: b.armId, answering: id, lockedOut: [...b.lockedOut], ...(by ? { by } : {}) };
}

/**
 * The one answering got it wrong: they're locked out (teams: the whole team, whoever on it buzzed). The next in the
 * clue's buzz order (`queue`, fastest first) who hasn't missed it answers now; with nobody left in it, the buzzers open
 * again for the rest (a rebound).
 */
export function buzzMissed(b: BuzzState, id: Id, players: Id[], queue: QueuedId[] = []): BuzzState {
  const lockedOut = b.lockedOut.includes(id) ? [...b.lockedOut] : [...b.lockedOut, id];
  const next = buzzOrder(queue).find((q) => !lockedOut.includes(q.id) && players.includes(q.id));
  if (next) return { phase: 'answering', armId: b.armId, answering: next.id, lockedOut, ...(next.by ? { by: next.by } : {}) };
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

/**
 * The wagers phones may send now (HostState.wager), or null: a Daily Double's player before the question shows (locked
 * once it's up), the Final's players on its wager screen (locked through the question and the answer). Each with their
 * max (held to it only when the host turned the limits on: `limitsOff` false), the wager the host has for them, and
 * `got`: the last phone wager the host took for each (Session.remote.wagerGot).
 */
export function wagerAsk(game: Game, session: Session, limitsOff: boolean, got: Record<Id, number> = {}): WagerAsk | null {
  const here = (id: Id | undefined): id is Id => !!id && session.players.some((p) => p.id === id);
  const cap = (n: number) => Math.max(0, Math.min(WAGER_MAX, Math.floor(n)));
  const seat = (id: Id, max: number, amount: number | undefined, fromHost: boolean) => ({
    id,
    max: cap(max),
    ...(typeof amount === 'number' && Number.isSafeInteger(amount) && amount >= 0 && amount <= WAGER_MAX ? { amount, ...(fromHost ? { fromHost: true } : {}) } : {}),
    ...(got[id] ? { got: got[id] } : {}),
  });
  const limit = limitsOff ? {} : { limit: true };
  if (session.phase === 'clue' && session.dd) {
    const dd = session.dd;
    const clue = currentClueInfo(session, game)?.clue.id;
    if (!clue || !here(dd.playerId)) return null;
    const open = dd.stage === 'splash';
    const amount = open ? dd.draft : dd.wager;
    return { id: `dd:${clue}:${dd.playerId}`, kind: 'dd', open, ...limit, seats: [seat(dd.playerId, ddCap(session, game, dd.playerId), amount, dd.draftFrom !== 'phone')] };
  }
  const f = session.final;
  const r = currentFinal(session, game);
  if (session.phase === 'final' && f && r && f.roundId === r.id && session.intro?.stage !== 'title') {
    const step = session.finalStep ?? 'wagers';
    if (step !== 'wagers' && step !== 'question' && step !== 'answer') return null;
    const ids = f.players.filter(here);
    return { id: `final:${r.id}`, kind: 'final', open: step === 'wagers', ...limit, seats: ids.map((id) => seat(id, finalWagerCap(session, id), f.wagers[id], !wagerFromPhone(f, id))) };
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
  extra: { status?: HostState['status']; locked?: boolean; wager?: WagerAsk | null } = {},
): HostState {
  const info = b.phase !== 'lobby' && session.phase === 'clue' ? currentClueInfo(session, game) : null;
  const seats = session.players.map((p) => ({ id: p.id, name: clip(p.name.trim(), SEAT_NAME_MAX), color: p.color }));
  return {
    title: clip(game.title, 200),
    seats,
    // Teams: phones join a team the host made (no new players from phones).
    allowNew: !!game.settings.phoneJoin && !teamsOn(game.settings),
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
    ...(teamsOn(game.settings) ? { teams: true } : {}),
    ...(extra.wager ? { wager: extra.wager } : {}),
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
    allowNew: !!game.settings.phoneJoin && !teamsOn(game.settings),
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
    ...(teamsOn(game.settings) ? { teams: true } : {}),
  };
}
