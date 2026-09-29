// Runtime game logic: scores, score log with undo/redo, used tiles, round flow.
// Pure functions over plain objects so they're easy to test and to autosave.
import { clueValue, getClue, newId, playableClues, type ClueRef, type Game, type Player, type ScoreEvent, type Session } from './model';

export function newSession(game: Game): Session {
  return {
    gameId: game.id,
    players: game.players.map((p) => ({ id: p.id, name: p.name, color: p.color, startScore: 0 })),
    used: {},
    currentRound: 0,
    phase: 'board',
    currentClue: null,
    revealed: false,
    scoreLog: [],
    redoStack: [],
  };
}

export function score(session: Session, playerId: string): number {
  const p = session.players.find((x) => x.id === playerId);
  let total = p?.startScore ?? 0;
  for (const e of session.scoreLog) if (!e.undone && e.playerId === playerId) total += e.delta;
  return total;
}

export function scores(session: Session): Record<string, number> {
  return Object.fromEntries(session.players.map((p) => [p.id, score(session, p.id)]));
}

/**
 * Add `amount` (negative to deduct) to each selected player. Returns the logged events.
 * With negative scores disallowed, a deduction stops at 0.
 */
export function applyScore(
  session: Session,
  game: Game,
  playerIds: string[],
  amount: number,
  reason: string,
  clueId?: string,
): ScoreEvent[] {
  if (!Number.isFinite(amount) || amount === 0) return [];
  const events: ScoreEvent[] = [];
  for (const playerId of playerIds) {
    if (!session.players.some((p) => p.id === playerId)) continue;
    let delta = amount;
    if (!game.settings.allowNegativeScores && delta < 0) {
      delta = Math.max(delta, -Math.max(0, score(session, playerId)));
      if (delta === 0) continue;
    }
    const e: ScoreEvent = { id: newId(), ts: Date.now(), playerId, delta, reason, clueId };
    session.scoreLog.push(e);
    events.push(e);
  }
  if (events.length) session.redoStack = [];
  return events;
}

/** Set a player's score to an exact number (logged as a manual adjustment). */
export function setScore(session: Session, playerId: string, value: number): void {
  const delta = value - score(session, playerId);
  if (!delta) return;
  // Manual edits bypass the no-negative clamp: the host typed the number on purpose.
  session.scoreLog.push({ id: newId(), ts: Date.now(), playerId, delta, reason: 'Manual edit' });
  session.redoStack = [];
}

export function undo(session: Session): ScoreEvent | null {
  for (let i = session.scoreLog.length - 1; i >= 0; i--) {
    const e = session.scoreLog[i];
    if (!e.undone) {
      e.undone = true;
      session.redoStack.push(e.id);
      return e;
    }
  }
  return null;
}

export function redo(session: Session): ScoreEvent | null {
  const id = session.redoStack.pop();
  const e = id ? session.scoreLog.find((x) => x.id === id) : undefined;
  if (!e) return null;
  e.undone = false;
  return e;
}

/** Undo/restore one specific log entry (from the score log panel). */
export function toggleEvent(session: Session, eventId: string): void {
  const e = session.scoreLog.find((x) => x.id === eventId);
  if (!e) return;
  e.undone = !e.undone;
  session.redoStack = session.redoStack.filter((id) => id !== eventId);
}

// ---------- Players ----------

export function addPlayer(session: Session, p: Omit<Player, 'startScore'>, startScore = 0): void {
  session.players.push({ ...p, startScore });
}

export function removePlayer(session: Session, playerId: string): void {
  session.players = session.players.filter((p) => p.id !== playerId);
  if (session.currentPickerId === playerId) session.currentPickerId = undefined;
  // Their log entries stay for the record but no longer count toward anyone.
}

// ---------- Flow ----------

export function openClue(session: Session, ref: ClueRef): void {
  session.currentClue = ref;
  session.revealed = false;
  session.phase = 'clue';
}

export function reveal(session: Session): void {
  if (session.phase === 'clue') session.revealed = true;
}

/** Close the current clue and mark it used. */
export function backToBoard(session: Session, game: Game): void {
  const found = session.currentClue && getClue(game, session.currentClue);
  if (found) session.used[found.clue.id] = true;
  session.currentClue = null;
  session.revealed = false;
  session.phase = 'board';
}

export function toggleUsed(session: Session, clueId: string): void {
  if (session.used[clueId]) delete session.used[clueId];
  else session.used[clueId] = true;
}

export function roundComplete(session: Session, game: Game, roundIndex = session.currentRound): boolean {
  const round = game.rounds[roundIndex];
  return !!round && playableClues(round).every((c) => session.used[c.id]);
}

/** Move to round `index`; past the last round goes to Final Jeopardy (if enabled) or the end screen. */
export function goToRound(session: Session, game: Game, index: number): void {
  if (index >= game.rounds.length) {
    if (game.final.enabled && session.phase !== 'final') {
      session.phase = 'final';
      session.finalStep = 'category';
    } else {
      session.phase = 'end';
    }
  } else {
    session.currentRound = Math.max(0, index);
    session.phase = 'board';
  }
  session.currentClue = null;
  session.revealed = false;
}

export function finalNext(session: Session): void {
  if (session.finalStep === 'category') session.finalStep = 'question';
  else if (session.finalStep === 'question') session.finalStep = 'answer';
  else session.phase = 'end';
}

export function currentClueInfo(session: Session, game: Game) {
  if (!session.currentClue) return null;
  const found = getClue(game, session.currentClue);
  if (!found) return null;
  return { ...found, value: clueValue(found.round, session.currentClue.row, found.clue) };
}

export function clueReason(game: Game, ref: ClueRef): string {
  const f = getClue(game, ref);
  if (!f) return '';
  return `${f.round.name} · ${f.category.title || 'Category'} ${game.settings.currencySymbol}${clueValue(f.round, ref.row, f.clue)}`;
}

/** Players ranked by score, highest first. */
export function standings(session: Session): { player: Player; score: number }[] {
  return session.players
    .map((player) => ({ player, score: score(session, player.id) }))
    .sort((a, b) => b.score - a.score);
}
