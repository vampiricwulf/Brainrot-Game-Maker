// Runtime game logic: scores, score log with undo/redo, used tiles, round flow.
// Pure functions over plain objects so they're easy to test and to autosave.
import { ensureWorld, refindPositions } from './rpg';
import { ensureBoard, refindSpaces } from './boardgame';
import { categoryLabel, clueValue, FINAL_V1_ROUND_ID, finalName, formatPoints, getClue, isBoard, isBoardGame, isFinal, isRpg, isSlides, MAX_POINTS, newId, playableClues, questionSlides, type BoardRound, type Clue, type ClueRef, type FinalRound, type FinalState, type Game, type Player, type Round, type ScoreEvent, type Session, type Slide, type SlidesRound, type WagerSource } from './model';

export function newSession(game: Game): Session {
  return {
    gameId: game.id,
    players: game.players.map((p) => ({ id: p.id, name: p.name, color: p.color, avatar: p.avatar, startScore: 0 })),
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
  const p = session.players.find((x) => x.id === playerId) ?? session.removedPlayers?.find((x) => x.id === playerId);
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
  /** Skip the no-negative-scores clamp (for deliberate effects like "Bankrupt" or swaps). */
  exact = false,
  /** Groups the events into one undo step; pass the same id to several calls to extend a step. */
  batchId = newId(),
): ScoreEvent[] {
  if (!Number.isFinite(amount) || amount === 0) return [];
  const events: ScoreEvent[] = [];
  for (const playerId of playerIds) {
    if (!session.players.some((p) => p.id === playerId)) continue;
    let delta = amount;
    if (!exact && !game.settings.allowNegativeScores && delta < 0) {
      delta = Math.max(delta, -Math.max(0, score(session, playerId)));
      if (delta === 0) continue;
    }
    const e: ScoreEvent = { id: newId(), ts: Date.now(), playerId, delta, reason, clueId, batchId, round: session.currentRound };
    session.scoreLog.push(e);
    events.push(e);
  }
  if (events.length) clearRedo(session);
  return events;
}

/** A new score change: nothing undone before it can be redone any more (a score or an RPG/board-game step). */
function clearRedo(session: Session): void {
  session.redoStack = [];
  session.actionRedo = [];
}

/** Set a player's score to an exact number (logged as a manual adjustment). */
export function setScore(session: Session, playerId: string, value: number): void {
  const delta = value - score(session, playerId);
  if (!delta) return;
  // Manual edits bypass the no-negative clamp: the host typed the number on purpose.
  session.scoreLog.push({ id: newId(), ts: Date.now(), playerId, delta, reason: 'Manual edit', round: session.currentRound });
  clearRedo(session);
}

/** One undo step: every event of a multi-player award shares it. */
export const stepOf = (e: ScoreEvent): string => e.batchId ?? e.id;

/**
 * Undo the latest score change as one step: a multi-player award is reverted for everyone it touched.
 * Events of removed players are skipped. Returns the events undone (empty if there was nothing to undo).
 */
export function undo(session: Session): ScoreEvent[] {
  const here = new Set(session.players.map((p) => p.id));
  let step: string | undefined;
  for (let i = session.scoreLog.length - 1; i >= 0 && step === undefined; i--) {
    const e = session.scoreLog[i];
    if (!e.undone && here.has(e.playerId)) step = stepOf(e);
  }
  if (step === undefined) return [];
  const events = session.scoreLog.filter((e) => !e.undone && here.has(e.playerId) && stepOf(e) === step);
  for (const e of events) {
    e.undone = true;
    session.redoStack.push(e.id);
  }
  followFinals(session, events);
  followPicker(session, events);
  return events;
}

/**
 * An award that made its player the picker: undone, the picker goes back; redone, again. Either way only while it's
 * still as the award left it (an old award put back in 📜 Log › Scores doesn't take the board from whoever has it now).
 */
function followPicker(session: Session, events: ScoreEvent[]): void {
  for (const e of events) {
    if (!e.picker) continue;
    if (e.undone) {
      if (session.currentPickerId === e.picker.now) session.currentPickerId = e.picker.was;
    } else if (session.currentPickerId === e.picker.was) session.currentPickerId = e.picker.now;
  }
}

/** Redo the last undone step (all of its events). */
export function redo(session: Session): ScoreEvent[] {
  const events: ScoreEvent[] = [];
  while (session.redoStack.length) {
    const e = session.scoreLog.find((x) => x.id === session.redoStack[session.redoStack.length - 1]);
    // Undo pushes a step's ids together, so stop at the first id from another step.
    if (e && events.length && stepOf(e) !== stepOf(events[0])) break;
    session.redoStack.pop();
    if (!e) continue;
    e.undone = false;
    events.push(e);
  }
  // In the order they happened (the stack gives them back last first), so "Redid …" names them as "Undid …" did.
  events.reverse();
  followFinals(session, events);
  followPicker(session, events);
  return events;
}

/** Undo/restore one specific log entry (from the score log panel). */
export function toggleEvent(session: Session, eventId: string): void {
  const e = session.scoreLog.find((x) => x.id === eventId);
  if (!e) return;
  e.undone = !e.undone;
  session.redoStack = session.redoStack.filter((id) => id !== eventId);
  followFinals(session, [e]);
  followPicker(session, [e]);
}

/**
 * Final judgments follow their score changes being undone or restored. Only one judgment per player counts: undoing a
 * re-judge brings back the one it replaced, and the RIGHT / WRONG on screen is the judgment still counted (or none).
 */
function followFinals(session: Session, changed: ScoreEvent[]): void {
  for (const e of changed) {
    const f = finalOf(session, e.clueId);
    if (!f) continue;
    const judgments = session.scoreLog.filter((x) => x.playerId === e.playerId && x.clueId === e.clueId);
    // Counted again: the player's other judgments stop counting. Undone: the one it replaced counts again.
    if (!e.undone) for (const x of judgments) x.undone = x !== e;
    else if (e.replaces) {
      const was = judgments.find((x) => x.id === e.replaces);
      if (was) was.undone = false;
    }
    const counted = judgments.filter((x) => !x.undone).at(-1);
    if (counted) f.results[e.playerId] = (counted.right ?? counted.delta > 0) ? 'right' : 'wrong';
    else delete f.results[e.playerId];
  }
}

/** A player's name, including players removed mid-game. */
export function playerName(session: Session, playerId: string): string {
  return (session.players.find((p) => p.id === playerId) ?? session.removedPlayers?.find((p) => p.id === playerId))?.name ?? '?';
}

/** Players' names as one says them: "Ann", "Ann & Bob", "Ann, Bob & Cy". */
export function nameList(names: string[]): string {
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}` : (names[0] ?? '');
}

/** "+$200 × 3" for one undo step, or "score changes" when its players got different amounts (e.g. a swap). */
export function stepAmount(events: ScoreEvent[], sym: string): string {
  const d = events[0]?.delta ?? 0;
  if (!events.every((e) => e.delta === d)) return 'score changes';
  return `${d > 0 ? '+' : ''}${formatPoints(d, sym)}${events.length > 1 ? ` × ${events.length}` : ''}`;
}

/** "+$200 × 3 (Alex, Sam & Jo) · Jeopardy! · Memes $200": what one undo step changed. */
export function describeStep(session: Session, events: ScoreEvent[], sym: string): string {
  if (!events.length) return '';
  const names = nameList(events.map((e) => playerName(session, e.playerId)));
  return `${stepAmount(events, sym)} (${names})${events[0].reason ? ` · ${events[0].reason}` : ''}`;
}

/** Undo (or restore, if it's fully undone) a whole step from the score log. */
export function toggleStep(session: Session, step: string): void {
  const events = session.scoreLog.filter((e) => stepOf(e) === step);
  const undoing = events.some((e) => !e.undone);
  for (const e of events) e.undone = undoing;
  const ids = new Set(events.map((e) => e.id));
  session.redoStack = session.redoStack.filter((id) => !ids.has(id));
  followFinals(session, events);
}

// ---------- Players ----------

/**
 * Take a player out mid-game. They move to `removedPlayers` (their log entries stay) so restorePlayer can bring
 * them back with their score, and they drop out of the picker, the Daily Double and the final round.
 */
export function removePlayer(session: Session, playerId: string): void {
  const p = session.players.find((x) => x.id === playerId);
  if (!p) return;
  // (Only the Final being played: one played earlier in the game keeps its reveals as they were.)
  const f = session.phase === 'final' ? session.final : null;
  const inFinal = !!f?.players.includes(playerId);
  session.players = session.players.filter((x) => x.id !== playerId);
  session.removedPlayers = [...(session.removedPlayers ?? []), inFinal ? { ...p, inFinal, ...(f?.roundId ? { finalRound: f.roundId } : {}) } : p];
  if (session.currentPickerId === playerId) session.currentPickerId = undefined;
  if (session.dd?.playerId === playerId) session.dd.playerId = undefined;
  if (f) {
    // Their wager and result stay (nothing reads them while they're out), so a restore brings them back.
    f.players = f.players.filter((x) => x !== playerId);
    f.order = f.order.filter((x) => x !== playerId);
    if (f.current === playerId) f.current = f.order.find((id) => !f.results[id]);
  }
}

/** Bring a removed player back (at the end of the list), score and all, and into the final round if they were in it. */
export function restorePlayer(session: Session, playerId: string): void {
  const removed = session.removedPlayers?.find((x) => x.id === playerId);
  if (!removed) return;
  const { inFinal, finalRound, ...p } = removed;
  session.removedPlayers = session.removedPlayers!.filter((x) => x.id !== playerId);
  session.players = [...session.players, p];
  // Back into the Final they were taken out of, while it's the one being played.
  const f = session.phase === 'final' ? session.final : null;
  if (inFinal && f && (!finalRound || finalRound === f.roundId) && !f.players.includes(playerId)) {
    f.players = [...f.players, playerId];
    // Reveal order: lowest score first until the reveals start (as startFinal does), then at the end.
    const order = [...f.order, playerId];
    f.order = session.finalStep === 'reveal' ? order : order.sort((x, y) => score(session, x) - score(session, y));
  }
}

/**
 * What one change in the in-game Players dialog did, for the undo history: "Renamed Player 1 to Alice", "Added Sam",
 * "Swapped Alice and Sam"… `before` and `after` are the players and the removed players around it.
 */
export function rosterChange(
  before: { players: Player[]; removed?: Player[] },
  after: { players: Player[]; removed?: Player[] },
): string {
  const was = new Map([...(before.removed ?? []), ...before.players].map((p) => [p.id, p]));
  const inBefore = new Set(before.players.map((p) => p.id));
  const inAfter = new Set(after.players.map((p) => p.id));
  const name = (p: Player) => p.name.trim() || 'a player';
  const gone = before.players.find((p) => !inAfter.has(p.id));
  if (gone) return `Removed ${name(gone)}`;
  const back = after.players.find((p) => !inBefore.has(p.id));
  if (back) return `${was.has(back.id) ? 'Restored' : 'Added'} ${name(back)}`;
  for (const p of after.players) {
    const old = was.get(p.id);
    if (old && old.name !== p.name) return `Renamed ${name(old)} to ${name(p)}`;
    if (old && old.color !== p.color) return `New color for ${name(p)}`;
  }
  const moved = after.players.filter((p, i) => before.players[i]?.id !== p.id);
  if (moved.length === 2) return `Swapped ${name(moved[0])} and ${name(moved[1])}`;
  return moved.length ? 'Reordered the players' : 'Changed the players';
}

// ---------- Flow ----------

export function openClue(session: Session, ref: ClueRef, game?: Game): void {
  session.currentClue = ref;
  delete session.slide;
  session.revealed = false;
  session.phase = 'clue';
  const clue = game && getClue(game, ref)?.clue;
  session.dd = clue?.type === 'dailyDouble' ? { stage: 'splash', playerId: session.currentPickerId } : null;
}

// ---------- A clue's question slides ----------
// A clue can have several question slides (a lead-in, then more…): the host steps through them, then reveals the answer.
// The audience window shows the one the session is on. Buzzers aren't touched: the host opens them when they like.

/** Which of the clue's question slides is on screen (kept within the ones it has, should the clue have changed). */
export function clueSlideIndex(session: Session, clue: Pick<Clue, 'questionSlide' | 'extraSlides'>): number {
  const n = questionSlides(clue).length;
  const i = session.slide ?? 0;
  return Number.isInteger(i) ? Math.min(Math.max(0, i), n - 1) : 0;
}

/** The question slide on screen for the open clue. */
export function shownQuestionSlide(session: Session, clue: Pick<Clue, 'questionSlide' | 'extraSlides'>): Slide {
  return questionSlides(clue)[clueSlideIndex(session, clue)];
}

/** The clue whose question slides are being stepped through: the open clue, the Final's question, or the tiebreaker. */
function slidesOnShow(session: Session, game: Game): Pick<Clue, 'questionSlide' | 'extraSlides'> | undefined {
  if (session.phase === 'tiebreaker') return game.tiebreaker;
  if (session.phase === 'slides') return slidesRound(session, game);
  if (session.phase === 'final') return session.finalStep === 'question' ? (currentFinal(session, game) ?? undefined) : undefined;
  return session.phase === 'clue' && session.currentClue ? getClue(game, session.currentClue)?.clue : undefined;
}

/** The open clue's (or the tiebreaker's) question slide position, for the host ("Slide 2 of 3"), or null with one slide. */
export function slidePosition(session: Session, game: Game): { at: number; of: number } | null {
  const clue = slidesOnShow(session, game);
  if (!clue) return null;
  const of = questionSlides(clue).length;
  return of > 1 ? { at: clueSlideIndex(session, clue) + 1, of } : null;
}

/**
 * The next question slide of the open clue (`d` 1), or the one before (-1). Only while its question is up (not on a Daily
 * Double's wager, nor with the answer showing). Returns whether it moved.
 */
export function stepSlide(session: Session, game: Game, d: 1 | -1): boolean {
  if (session.phase === 'slides') {
    // (A slides round: no answer, nothing in the way.)
  } else if (session.phase === 'tiebreaker' ? session.tiebreakerRevealed : session.phase === 'final' ? session.finalStep !== 'question' : session.phase !== 'clue' || session.revealed || session.dd?.stage === 'splash') return false;
  const clue = slidesOnShow(session, game);
  if (!clue) return false;
  const to = clueSlideIndex(session, clue) + d;
  if (to < 0 || to >= questionSlides(clue).length) return false;
  if (to) session.slide = to;
  else delete session.slide;
  return true;
}

export function reveal(session: Session): void {
  if (session.phase === 'clue' && session.dd?.stage !== 'splash') session.revealed = true;
  if (session.phase === 'tiebreaker') session.tiebreakerRevealed = true;
  if (session.phase === 'final' && session.finalStep === 'question') session.finalStep = 'answer';
}

/** Take the answer off screen again (e.g. it was revealed by accident). */
export function unreveal(session: Session): void {
  if (session.phase === 'clue') session.revealed = false;
  if (session.phase === 'tiebreaker') session.tiebreakerRevealed = false;
  if (session.phase === 'final' && session.finalStep === 'answer') session.finalStep = 'question';
}

/** Is an answer currently on screen? */
export function answerShowing(session: Session): boolean {
  return (
    (session.phase === 'clue' && session.revealed) ||
    (session.phase === 'tiebreaker' && !!session.tiebreakerRevealed) ||
    (session.phase === 'final' && session.finalStep === 'answer')
  );
}

export function toggleReveal(session: Session): void {
  if (answerShowing(session)) unreveal(session);
  else reveal(session);
}

/**
 * The host panel's award row is up: not on a Daily Double splash, in a Final (its wagers and reveals score it) or on the
 * end screen.
 */
export function awardOpen(session: Session): boolean {
  if (session.phase === 'clue') return session.dd?.stage !== 'splash';
  return session.phase === 'board' || session.phase === 'rpg' || session.phase === 'boardgame' || session.phase === 'tiebreaker';
}

/**
 * A 0 result for these players, logged all the same (a Daily Double wagered at 0, like a Final's 0 wager), so the log
 * says what happened and Undo takes it back. Returns the events.
 */
export function logZero(session: Session, playerIds: string[], reason: string, clueId: string | undefined, right: boolean, batchId = newId()): ScoreEvent[] {
  const events: ScoreEvent[] = [];
  for (const playerId of playerIds) {
    if (!session.players.some((p) => p.id === playerId)) continue;
    const e: ScoreEvent = { id: newId(), ts: Date.now(), playerId, delta: 0, reason, clueId, batchId, round: session.currentRound, right };
    session.scoreLog.push(e);
    events.push(e);
  }
  if (events.length) clearRedo(session);
  return events;
}

/** Nothing on the slide but empty text. */
export function blankSlide(slide: Slide): boolean {
  return !slide.background.image && slide.elements.every((e) => e.kind === 'text' && !e.text.trim());
}

/** A wheel or dice tile with nothing to ask (no question or answer): the spin or roll is all there is to it. */
export function toolOnlyClue(clue: Clue): boolean {
  return (clue.type === 'wheel' || clue.type === 'dice') && questionSlides(clue).every(blankSlide) && blankSlide(clue.answerSlide);
}

/** Points were given (and not undone) for this clue. */
export function clueScored(session: Session, clueId: string): boolean {
  return session.scoreLog.some((e) => !e.undone && e.clueId === clueId);
}

/**
 * How each player was marked on a clue (since `since`, when it was opened: a reopened tile starts afresh): right or
 * wrong by their last mark, with the points it came to. The host panel shows it on their chip, and a second ✔ or ✘
 * the same way isn't taken again.
 */
export function clueMarks(session: Session, clueId: string, since = 0): Record<string, { right: boolean; delta: number }> {
  const marks: Record<string, { right: boolean; delta: number }> = {};
  for (const e of session.scoreLog) {
    if (e.undone || e.clueId !== clueId || e.ts < since) continue;
    const right = e.right ?? e.delta > 0;
    marks[e.playerId] = { right, delta: (marks[e.playerId]?.delta ?? 0) + e.delta };
  }
  return marks;
}

/**
 * Close the current clue and mark it used, unless `markUsed` is false (cancelled, or the question never showed).
 * Returns the id of the clue that was marked used.
 */
export function backToBoard(session: Session, game: Game, { markUsed = true }: { markUsed?: boolean } = {}): string | null {
  const found = session.currentClue && getClue(game, session.currentClue);
  const closed = found && markUsed ? found.clue.id : null;
  if (closed) {
    session.used[closed] = true;
    session.lastClosed = closed;
  }
  session.currentClue = null;
  delete session.slide;
  session.revealed = false;
  session.dd = null;
  session.phase = 'board';
  return closed;
}

/** Mark a tile used, or put a used tile back on the board. Returns whether it's used now. */
export function toggleUsed(session: Session, clueId: string): boolean {
  if (session.used[clueId]) {
    delete session.used[clueId];
    if (session.lastClosed === clueId) session.lastClosed = null;
    return false;
  }
  session.used[clueId] = true;
  return true;
}

export function roundComplete(session: Session, game: Game, roundIndex = session.currentRound): boolean {
  const round = game.rounds[roundIndex];
  return !!round && playableClues(round).every((c) => session.used[c.id]);
}

/** Start a round's intro sequence according to the game's settings (or skip straight to the board). */
export function startIntro(session: Session, game: Game): void {
  // Remember the round so coming back to it later goes straight to the board.
  const seen = session.introducedRounds ?? [];
  if (!seen.includes(session.currentRound)) session.introducedRounds = [...seen, session.currentRound];
  const ri = game.settings.roundIntro;
  if (ri.titleCard) session.intro = { stage: 'title', revealed: 0 };
  else if (ri.tileFill) session.intro = { stage: 'fill', revealed: 0 };
  else if (ri.categoryReveal !== 'off') session.intro = { stage: 'categories', revealed: 0 };
  else session.intro = null;
}

/** Advance the intro one step (title → tile fill → categories one by one → done). */
export function introNext(session: Session, game: Game): void {
  const intro = session.intro;
  if (!intro) return;
  const ri = game.settings.roundIntro;
  const r = game.rounds[session.currentRound];
  // An RPG, board-game or Final round only has its title card.
  if (!isBoard(r)) return void (session.intro = null);
  const cats = isBoard(r) ? r.categories.length : 0;
  if (intro.stage === 'title') {
    if (ri.tileFill) intro.stage = 'fill';
    else if (ri.categoryReveal !== 'off') intro.stage = 'categories';
    else session.intro = null;
  } else if (intro.stage === 'fill') {
    if (ri.categoryReveal !== 'off') intro.stage = 'categories';
    else session.intro = null;
  } else {
    intro.revealed++;
    if (intro.revealed >= cats) session.intro = null;
  }
}

export function skipIntro(session: Session): void {
  session.intro = null;
}

/** The round being played (undefined on the end screen or with no rounds). */
export function currentRound(session: Session, game: Game): Round | undefined {
  return session.phase === 'end' ? undefined : game.rounds[session.currentRound];
}

/** Put the current Final round's state away (to pick up again when coming back to it). */
function stashFinal(session: Session): void {
  const f = session.final;
  if (!f?.roundId) return;
  session.finals = { ...(session.finals ?? {}), [f.roundId]: { state: f, step: session.finalStep ?? 'wagers' } };
}

/**
 * Move to round `index` (any mode); past the last round is the end screen. Only the first visit to a board
 * round plays its intro. A Final round picks up where it was left (wagers kept).
 */
export function goToRound(session: Session, game: Game, index: number): void {
  session.currentClue = null;
  delete session.slide;
  session.revealed = false;
  session.dd = null;
  if (session.phase === 'final') stashFinal(session);
  if (index >= game.rounds.length) {
    session.intro = null;
    session.phase = 'end';
    return;
  }
  const target = Math.max(0, index);
  const round = game.rounds[target];
  const changed = target !== session.currentRound || session.phase !== 'board';
  const backwards = target < session.currentRound;
  session.currentRound = target;
  if (isFinal(round) || isRpg(round) || isBoardGame(round)) {
    // The first visit shows the round's title card (going back to it doesn't).
    const seen = session.introducedRounds ?? [];
    const first = !backwards && !seen.includes(target);
    if (first) session.introducedRounds = [...seen, target];
    session.intro = first && game.settings.roundIntro.titleCard ? { stage: 'title', revealed: 0 } : null;
  }
  if (isFinal(round)) {
    startFinal(session, game, round);
    return;
  }
  if (isRpg(round)) {
    session.phase = 'rpg';
    ensureWorld(session, game, round);
    return;
  }
  if (isBoardGame(round)) {
    session.phase = 'boardgame';
    ensureBoard(session, game, round);
    return;
  }
  if (isSlides(round)) {
    // Its slides are the introduction: no title card. Coming back to it from the round after: its last slide.
    session.phase = 'slides';
    session.intro = null;
    const last = questionSlides(round).length - 1;
    if (backwards && last > 0) session.slide = last;
    return;
  }
  session.phase = 'board';
  // Only the first visit to a round plays its intro: going back (or returning) shows the board straight away.
  if (changed) {
    if (backwards || session.introducedRounds?.includes(target)) session.intro = null;
    else startIntro(session, game);
  }
}

/** From the end screen back to the last round (a Final round goes back to its reveals; no board intro). */
export function backToLastRound(session: Session, game: Game): void {
  const last = Math.max(0, game.rounds.length - 1);
  const round = game.rounds[last];
  session.currentRound = last;
  session.intro = null;
  session.currentClue = null;
  delete session.slide;
  session.revealed = false;
  session.dd = null;
  if (isFinal(round)) {
    startFinal(session, game, round);
    if (session.final && Object.keys(session.final.results).length) session.finalStep = 'reveal';
  } else if (isRpg(round)) {
    session.phase = 'rpg';
    ensureWorld(session, game, round);
  } else if (isBoardGame(round)) {
    session.phase = 'boardgame';
    ensureBoard(session, game, round);
  } else if (isSlides(round)) {
    session.phase = 'slides';
    const last = questionSlides(round).length - 1;
    if (last > 0) session.slide = last;
  } else session.phase = 'board';
}

/** The slides round on screen. */
export function slidesRound(session: Session, game: Game): SlidesRound | undefined {
  const r = session.phase === 'slides' ? game.rounds[session.currentRound] : undefined;
  return isSlides(r) ? r : undefined;
}

// ---------- Daily Double ----------

/** Highest value on the current round's board (TV cap for a Daily Double wager). */
export function roundMaxValue(game: Game, roundIndex: number): number {
  const round = game.rounds[roundIndex];
  if (!isBoard(round)) return 0;
  let max = 0;
  round.categories.forEach((c) => c.clues.forEach((cl, row) => !cl.empty && (max = Math.max(max, clueValue(round, row, cl)))));
  return max;
}

/** TV rule: wager up to your score, or the round's top value if that's more. */
export function ddCap(session: Session, game: Game, playerId: string): number {
  return Math.max(score(session, playerId), roundMaxValue(game, session.currentRound));
}

export function ddShowQuestion(session: Session, playerId: string, wager: number): void {
  if (!session.dd) return;
  session.dd.playerId = playerId;
  session.dd.wager = wager;
  session.dd.stage = 'question';
}

/**
 * Scatter `count` Daily Doubles over a round, weighted toward the lower (higher-value) rows like on TV,
 * at most one per category. Empty tiles and wheel/dice tiles are never picked. Returns how many were placed.
 * `keepExisting` leaves the Daily Doubles already on the board alone and only adds the missing ones.
 */
export function randomizeDailyDoubles(
  round: BoardRound,
  count: number,
  rand = Math.random,
  { keepExisting = false }: { keepExisting?: boolean } = {},
): number {
  const usedCats = new Set<number>();
  let have = 0;
  round.categories.forEach((c, ci) =>
    c.clues.forEach((cl) => {
      if (cl.type !== 'dailyDouble') return;
      if (!keepExisting) cl.type = 'standard';
      else if (!cl.empty) {
        usedCats.add(ci);
        have++;
      }
    }),
  );
  const rows = round.values.length;
  const candidates: { cat: number; row: number; w: number; written: boolean }[] = [];
  round.categories.forEach((c, ci) =>
    c.clues.forEach((cl, row) => {
      // (Nor a ✍ clue: everyone answers it, a Daily Double has one player.)
      if (cl.empty || cl.type !== 'standard' || cl.everyone) return;
      const t = rows > 1 ? row / (rows - 1) : 1;
      candidates.push({ cat: ci, row, w: 0.3 + t * t * 3, written: !!cl.questionSlide?.elements.length });
    }),
  );
  let placed = 0;
  while (have + placed < count) {
    // A clue with something on it first: a half-built game tried out doesn't get its Daily Double on a blank one.
    const open = candidates.filter((c) => !usedCats.has(c.cat));
    const pool = open.some((c) => c.written) ? open.filter((c) => c.written) : open;
    if (!pool.length) break;
    const total = pool.reduce((a, c) => a + c.w, 0);
    let x = rand() * total;
    const pick = pool.find((c) => (x -= c.w) <= 0) ?? pool[pool.length - 1];
    round.categories[pick.cat].clues[pick.row].type = 'dailyDouble';
    usedCats.add(pick.cat);
    placed++;
  }
  return placed;
}

// ---------- Final round ----------

/** clueId that tags a Final round's score events (so re-judging finds the earlier one). */
export function finalTag(roundId: string): string {
  return `final:${roundId}`;
}

/** The Final round state that score events tagged `tag` belong to (the one being played, or one put away). */
function finalOf(session: Session, tag: string | undefined): FinalState | undefined {
  if (!tag?.startsWith('final:')) return undefined;
  const states = [session.final, ...Object.values(session.finals ?? {}).map((s) => s.state)];
  return states.find((f) => f?.roundId && finalTag(f.roundId) === tag);
}

/** The Final round being played. */
export function currentFinal(session: Session, game: Game): FinalRound | undefined {
  const r = game.rounds[session.currentRound];
  return isFinal(r) ? r : undefined;
}

/**
 * Enter a Final round: its category goes on screen and the wagers are taken at once (the host picks who plays on the
 * same screen). Coming back to one (after a trip elsewhere) picks up its wagers and results; eligibility is checked
 * again because scores may have changed, keeping what was entered for players who are still in.
 */
export function startFinal(session: Session, game: Game, round: FinalRound): void {
  const saved = session.final?.roundId === round.id ? { state: session.final, step: session.finalStep } : session.finals?.[round.id];
  // A game saved before Final became a round kept its state without a round id.
  const prev = saved?.state ?? (session.final && !session.final.roundId ? session.final : undefined);
  session.phase = 'final';
  session.finalStep = 'wagers';
  // Once the reveals have started the players are settled (their scores now include this Final): someone it took to
  // $0 can still be judged again.
  if (prev && saved?.step === 'reveal') {
    session.final = prev;
    // Back at the reveals, not the wagers (whose caps now count this Final's results).
    session.finalStep = 'reveal';
    return;
  }
  // Players the host ticked in or sat out stay that way; the others play if their score lets them (newcomers too).
  const chosen = prev?.chosen;
  const eligible = session.players
    .filter((p) => chosen?.[p.id] ?? (round.allowNonPositive || score(session, p.id) > 0))
    .map((p) => p.id);
  // Reveal in TV order: lowest score first.
  const order = [...eligible].sort((a, b) => score(session, a) - score(session, b));
  const keep = <T>(r: Record<string, T> | undefined) => Object.fromEntries(Object.entries(r ?? {}).filter(([id]) => eligible.includes(id)));
  const current = prev?.current && eligible.includes(prev.current) ? prev.current : undefined;
  session.final = {
    roundId: round.id,
    players: eligible,
    wagers: keep(prev?.wagers),
    ...(prev?.wagerFrom ? { wagerFrom: keep(prev.wagerFrom) } : {}),
    ...(prev?.wagerBy ? { wagerBy: keep(prev.wagerBy) } : {}),
    order,
    shown: keep(prev?.shown),
    results: keep(prev?.results),
    current,
    ...(chosen ? { chosen } : {}),
    // The question was seen: phones stay locked out after a trip to another round too.
    ...(prev?.phonesLocked ? { phonesLocked: true } : {}),
  };
  // A 0 filled in for nothing to wager goes when there's something to wager now (points given since, in a round before).
  const f = session.final;
  for (const id of eligible)
    if (f.wagerFrom?.[id] === 'auto' && finalWagerCap(session, id) > 0) {
      delete f.wagers[id];
      const { [id]: _, ...rest } = f.wagerFrom;
      f.wagerFrom = rest;
    }
  fillNothingToWager(session);
}

/**
 * A player with nothing to wager (a score of 0 or less, playing as the round allows) gets a wager of 0 filled in (the
 * host can still type more: the limits are off unless the host turns them on).
 */
function fillNothingToWager(session: Session): void {
  const f = session.final;
  if (f)
    for (const id of f.players)
      if (typeof f.wagers[id] !== 'number' && finalWagerCap(session, id) === 0) {
        f.wagers[id] = 0;
        f.wagerFrom = { ...f.wagerFrom, [id]: 'auto' };
      }
}

/**
 * A session saved (or a step undone) from before the category and the wagers were one screen: its 'category' step
 * is the wager screen now.
 */
export function finalStepFix(session: Session): void {
  if ((session.finalStep as string) !== 'category') return;
  session.finalStep = 'wagers';
  fillNothingToWager(session);
}

/** Tick a player in or out of the Final (on the wager screen): the reveal order stays lowest score first. */
export function finalChoose(session: Session, playerId: string, plays: boolean): void {
  const f = session.final;
  if (!f) return;
  f.chosen = { ...f.chosen, [playerId]: plays };
  if (!plays) {
    f.players = f.players.filter((x) => x !== playerId);
    f.order = f.order.filter((x) => x !== playerId);
  } else if (!f.players.includes(playerId)) {
    f.players = [...f.players, playerId];
    f.order = [...f.order, playerId].sort((x, y) => score(session, x) - score(session, y));
    fillNothingToWager(session);
  }
}

/**
 * Players who came in on the wager screen (👥 Players, a phone joining): in if their score lets them play, as startFinal
 * does on coming back to the Final; never anyone the host ticked in or out.
 */
export function finalTakeNewcomers(session: Session, round: FinalRound): void {
  const f = session.final;
  if (!f || session.phase !== 'final' || session.finalStep !== 'wagers' || f.roundId !== round.id) return;
  const add = session.players
    .filter((p) => !f.players.includes(p.id) && f.chosen?.[p.id] === undefined && (round.allowNonPositive || score(session, p.id) > 0))
    .map((p) => p.id);
  if (!add.length) return;
  f.players = [...f.players, ...add];
  f.order = [...f.order, ...add].sort((x, y) => score(session, x) - score(session, y));
  fillNothingToWager(session);
}

/**
 * Set a player's Final wager (undefined: none yet), saying where it came from. The host's own (a new one, or a change
 * to one a phone sent) is the host's; a phone's is marked so the host's field shows it.
 */
export function finalSetWager(session: Session, playerId: string, wager: number | undefined, from: WagerSource = 'host', by?: string): void {
  const f = session.final;
  if (!f) return;
  if (wager === undefined) delete f.wagers[playerId];
  // (At most what reads on screen. A fraction is kept, to be refused as not a whole number.)
  else f.wagers[playerId] = Math.min(MAX_POINTS, wager);
  if (from === 'phone' && wager !== undefined) f.wagerFrom = { ...f.wagerFrom, [playerId]: 'phone' };
  else if (f.wagerFrom?.[playerId]) {
    const { [playerId]: _, ...rest } = f.wagerFrom;
    f.wagerFrom = rest;
  }
  // Teams: who on the team sent it (only for one from a phone).
  if (from === 'phone' && wager !== undefined && by) f.wagerBy = { ...f.wagerBy, [playerId]: by };
  else if (f.wagerBy?.[playerId]) {
    const { [playerId]: _, ...rest } = f.wagerBy;
    f.wagerBy = rest;
  }
}

/** Teams: who on the team sent this wager from their phone ('' when the host typed it, or nobody said). */
export function wagerSentBy(f: FinalState | null | undefined, playerId: string): string {
  return (wagerFromPhone(f, playerId) && f?.wagerBy?.[playerId]) || '';
}

/**
 * The session as viewers' windows get it: no wager that isn't on screen yet. A Final's wagers not shown (nor judged)
 * read 0 (so a ✔ for "wager in" still shows), and where they came from goes; a Daily Double's wager goes until it's
 * shown, and the one in the host's box before the question with it. (The host's undo log is left out by the caller.)
 */
export function forViewers<S extends Pick<Session, 'final' | 'finals' | 'dd'>>(s: S): S {
  const hide = (f: FinalState): FinalState => {
    const { wagerFrom: _f, wagerBy: _b, ...rest } = f;
    const wagers = Object.fromEntries(Object.entries(f.wagers).map(([id, v]) => [id, f.shown[id] || f.results[id] ? v : 0]));
    return { ...rest, wagers };
  };
  const out = { ...s };
  if (s.final) out.final = hide(s.final);
  if (s.finals) out.finals = Object.fromEntries(Object.entries(s.finals).map(([id, x]) => [id, { ...x, state: hide(x.state) }]));
  if (s.dd) {
    const { draft: _d, draftFrom: _f, draftBy: _b, wager, ...dd } = s.dd;
    out.dd = { ...dd, ...(dd.shown && wager !== undefined ? { wager } : {}) };
  }
  return out;
}

/** The wager came from the player's phone (and the host hasn't changed it since). */
export function wagerFromPhone(f: FinalState | null | undefined, playerId: string): boolean {
  return f?.wagerFrom?.[playerId] === 'phone';
}

/**
 * The host can still change this player's wager: on the wager screen, and in the reveals until their wager is shown or
 * they're judged (after that, a fix is a score correction).
 */
export function finalWagerEditable(session: Session, playerId: string): boolean {
  const f = session.final;
  if (!f || !f.players.includes(playerId)) return false;
  if (session.finalStep === 'wagers') return true;
  // (A player put back in during the reveals has no wager yet: it can be typed even once their spot is shown, or they
  // could never be judged.)
  return session.finalStep === 'reveal' && !f.results[playerId] && (!f.shown[playerId] || typeof f.wagers[playerId] !== 'number');
}

export function finalWagerCap(session: Session, playerId: string): number {
  return Math.max(0, score(session, playerId));
}

/**
 * Players in the Final still without a wager (0 or more), those whose wager isn't a whole number, and those over their
 * cap (unless the limits are ignored).
 */
export function finalWagerProblems(session: Session, ignoreLimits = false): { missing: string[]; over: string[]; whole: string[] } {
  const wagers = session.final?.wagers ?? {};
  const ids = session.final?.players ?? [];
  const missing = ids.filter((id) => !(typeof wagers[id] === 'number' && wagers[id] >= 0));
  const whole = ids.filter((id) => !missing.includes(id) && !Number.isInteger(wagers[id]));
  const over = ids.filter((id) => !ignoreLimits && !missing.includes(id) && wagers[id] > finalWagerCap(session, id));
  return { missing, over, whole };
}

/**
 * A wager typed in for a player during the reveals: why it can't be taken ('' when it can). Whole numbers, 0 or more,
 * up to their cap unless the limits are ignored.
 */
export function finalWagerRefused(session: Session, playerId: string, v: number, ignoreLimits = false): '' | 'whole' | 'over' {
  if (!Number.isInteger(v) || v < 0) return 'whole';
  return !ignoreLimits && v > finalWagerCap(session, playerId) ? 'over' : '';
}

/** Every wager is in (and within its cap, unless the limits are ignored): the question can be shown. */
export function finalWagersOk(session: Session, ignoreLimits = false): boolean {
  const { missing, over, whole } = finalWagerProblems(session, ignoreLimits);
  return !!session.final && !missing.length && !over.length && !whole.length;
}

/** The Final's next step. After the reveals: the next round, or the end screen if this Final was the last round. */
export function finalNext(session: Session, game: Game): void {
  const f = session.final;
  finalStepFix(session);
  switch (session.finalStep) {
    case 'wagers':
      // Everyone sat out: nothing to wager or reveal, so on to the next round (or the end).
      if (f && !f.players.length) return goToRound(session, game, session.currentRound + 1);
      session.finalStep = 'question';
      if (f) f.phonesLocked = true;
      // (From its first question slide.)
      delete session.slide;
      break;
    case 'question':
      session.finalStep = 'answer';
      break;
    case 'answer':
      session.finalStep = 'reveal';
      if (f) f.current = f.order.find((id) => !f.results[id]);
      break;
    default:
      goToRound(session, game, session.currentRound + 1);
  }
}

/**
 * N during the reveal: show the spotlit player's wager if it isn't up yet, otherwise spotlight the next player
 * without a result. 'waiting' means only the spotlit player is left to judge; 'done' means everyone has a
 * result. It never ends the game by itself.
 */
export function finalAdvance(session: Session): 'shown' | 'next' | 'waiting' | 'done' {
  const f = session.final;
  if (!f) return 'done';
  const cur = f.current && f.order.includes(f.current) ? f.current : undefined;
  if (cur && !f.shown[cur] && !f.results[cur]) {
    finalShow(session, cur);
    return 'shown';
  }
  if (f.order.every((id) => f.results[id])) return 'done';
  // The next player without a result after the spotlit one, wrapping around.
  const i = cur ? f.order.indexOf(cur) : -1;
  const next = [...f.order.slice(i + 1), ...f.order.slice(0, i + 1)].find((id) => id !== cur && !f.results[id]);
  if (!next) return 'waiting';
  f.current = next;
  return 'next';
}

/** Shift+N during the reveal: spotlight the player before the spotlit one (their wager stays as it is). */
export function finalBack(session: Session): boolean {
  const f = session.final;
  const i = f?.current ? f.order.indexOf(f.current) : -1;
  if (!f || i <= 0) return false;
  f.current = f.order[i - 1];
  return true;
}

/** Players in the final reveal who haven't been marked right or wrong yet. */
export function finalUnjudged(session: Session): string[] {
  const f = session.final;
  return f ? f.order.filter((id) => !f.results[id]) : [];
}

/** Spotlight a player in the reveal and show their wager on screen. */
export function finalShow(session: Session, playerId: string): void {
  if (!session.final) return;
  session.final.current = playerId;
  session.final.shown[playerId] = true;
}

/** The player's Final wager is in (0 counts; nothing typed doesn't: it's never taken as 0). */
export function hasWager(f: FinalState | null | undefined, playerId: string): boolean {
  return typeof f?.wagers[playerId] === 'number' && f.wagers[playerId] >= 0;
}

/**
 * Mark a Final response right/wrong and apply ± their wager. Re-judging replaces the earlier result. A player with no
 * wager isn't judged (false): the host enters it first.
 */
export function finalJudge(session: Session, game: Game, playerId: string, right: boolean): boolean {
  const f = session.final;
  const round = currentFinal(session, game);
  if (!f || !round || !hasWager(f, playerId)) return false;
  const tag = finalTag(round.id);
  // Undo the earlier judgment's score change (Undo brings it back).
  const earlier = f.results[playerId] ? [...session.scoreLog].reverse().find((x) => x.playerId === playerId && x.clueId === tag && !x.undone) : undefined;
  if (earlier) earlier.undone = true;
  const wager = f.wagers[playerId] ?? 0;
  f.results[playerId] = right ? 'right' : 'wrong';
  f.shown[playerId] = true;
  let [e] = applyScore(session, game, [playerId], right ? wager : -wager, finalName(round), tag);
  // Nothing to add or take (a 0 wager, or no points left to lose): logged all the same, so Undo takes it back too.
  if (!e) {
    e = { id: newId(), ts: Date.now(), playerId, delta: 0, reason: finalName(round), clueId: tag, round: session.currentRound };
    session.scoreLog.push(e);
    clearRedo(session);
  }
  e.right = right;
  if (earlier) e.replaces = earlier.id;
  return true;
}

// ---------- End of game ----------

/** Players tied for the lead (empty if there's a single leader). */
export function tiedLeaders(session: Session): Player[] {
  const tied = tiedForFirst(session);
  // Settled by the tiebreaker roll-off or clue (only while its winner is still one of the tied leaders).
  return tied.some((p) => p.id === session.rollOffWinner) ? [] : tied;
}

/** The players level on the top score (none when one player is ahead), settled or not. */
export function tiedForFirst(session: Session): Player[] {
  const ranked = standings(session);
  if (ranked.length < 2 || ranked[0].score !== ranked[1].score) return [];
  return ranked.filter((r) => r.score === ranked[0].score).map((r) => r.player);
}

/**
 * The end screen has its winner (or winners): nobody is tied for first, or the tie was settled (a roll-off, the
 * tiebreaker clue, co-winners). The winner fanfare plays only then.
 */
export function winnerKnown(session: Session): boolean {
  return !tiedLeaders(session).length || coWinnersHold(session);
}

/**
 * Co-winners were declared for this tie: everyone level on the top score now was one of them (a score fixed since into a
 * different tie leaves it open). Older saves kept no names: any tie.
 */
export function coWinnersHold(session: Session): boolean {
  const co = session.coWinners;
  if (!Array.isArray(co)) return !!co;
  const tied = tiedForFirst(session);
  return tied.length > 0 && tied.every((p) => co.includes(p.id));
}

export function startTiebreaker(session: Session): void {
  session.phase = 'tiebreaker';
  session.tiebreakerRevealed = false;
  // (From its first question slide.)
  delete session.slide;
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
  return `${f.round.name} · ${clueName(game, ref)}`;
}

/** "Memes $1,000": a tile's category and value. */
export function clueName(game: Game, ref: ClueRef): string {
  const f = getClue(game, ref);
  if (!f) return '';
  return `${categoryLabel(f.category)} ${formatPoints(clueValue(f.round, ref.row, f.clue), game.settings.currencySymbol)}`;
}

/** Where a clue sits on the board, by id. */
export function findClueRef(game: Game, clueId: string): ClueRef | null {
  for (let round = 0; round < game.rounds.length; round++) {
    const r = game.rounds[round];
    if (!isBoard(r)) continue;
    const cats = r.categories;
    for (let cat = 0; cat < cats.length; cat++) {
      const row = cats[cat].clues.findIndex((c) => c.id === clueId);
      if (row >= 0) return { round, cat, row };
    }
  }
  return null;
}

/** Used tiles of a round, in board order (for the host's "Reopen a tile" list). */
export function usedTiles(session: Session, game: Game, round = session.currentRound): { id: string; ref: ClueRef }[] {
  const out: { id: string; ref: ClueRef }[] = [];
  const r = game.rounds[round];
  if (!isBoard(r)) return out;
  r.categories.forEach((c, cat) =>
    c.clues.forEach((cl, row) => {
      if (!cl.empty && session.used[cl.id]) out.push({ id: cl.id, ref: { round, cat, row } });
    }),
  );
  return out;
}

/**
 * Point a saved session at an edited copy of its game ("Resume with my edits"). Used tiles and the score log
 * are keyed by clue id, so they carry over; the open clue is found again by id, or dropped if it was deleted. RPG
 * parties stay on their screens wherever they were moved; board-game players on a deleted space go back to Start.
 */
export function rebaseSession(session: Session, from: Game, to: Game): void {
  const openId = session.currentClue ? getClue(from, session.currentClue)?.clue.id : undefined;
  const ref = openId ? findClueRef(to, openId) : null;
  if (ref) session.currentClue = ref;
  else if (session.currentClue) {
    session.currentClue = null;
    session.revealed = false;
    session.dd = null;
    if (session.phase === 'clue') session.phase = 'board';
  }
  // Rounds are matched by id, so deleting or reordering rounds in the editor keeps the host on the same one.
  const roundAt = (i: number) => {
    const j = to.rounds.findIndex((r) => r.id === from.rounds[i]?.id);
    return j >= 0 ? j : null;
  };
  const found = ref?.round ?? roundAt(session.currentRound);
  session.currentRound = found ?? Math.min(session.currentRound, Math.max(0, to.rounds.length - 1));
  if (session.introducedRounds)
    session.introducedRounds = session.introducedRounds.map(roundAt).filter((i): i is number => i !== null);
  if (session.phase === 'tiebreaker' && !to.tiebreaker) session.phase = 'end';
  session.gameId = to.id;
  refindPositions(session, to);
  refindSpaces(session, to);
  if (session.phase === 'end' || session.phase === 'tiebreaker') return;
  // The round being played was deleted (or the one now in its place is another mode): enter that one properly,
  // without its intro. With no rounds left, the game is over.
  if (!to.rounds.length) {
    session.phase = 'end';
    return;
  }
  const r = to.rounds[session.currentRound];
  const fits = session.phase === 'final' ? isFinal(r) : session.phase === 'rpg' ? isRpg(r) : session.phase === 'boardgame' ? isBoardGame(r) : session.phase === 'slides' ? isSlides(r) : isBoard(r);
  if (found !== null && fits) return;
  const seen = session.introducedRounds ?? [];
  if (!seen.includes(session.currentRound)) session.introducedRounds = [...seen, session.currentRound];
  session.intro = null;
  goToRound(session, to, session.currentRound);
}

/**
 * Bring a session saved before round modes (Jeopardy Builder) up to date with its converted game (migrateGame):
 * the Final is now a round (id FINAL_V1_ROUND_ID), so a session in the Final points at that round, its state
 * and score events are tagged with it. Newer sessions are returned as they are.
 */
export function migrateSession(session: Session, game: Game): Session {
  finalStepFix(session);
  const finalIndex = game.rounds.findIndex((r) => r.id === FINAL_V1_ROUND_ID);
  if (finalIndex < 0) return session;
  for (const e of session.scoreLog ?? []) if (e.clueId === 'final') e.clueId = finalTag(FINAL_V1_ROUND_ID);
  if (session.final && !session.final.roundId) session.final.roundId = FINAL_V1_ROUND_ID;
  if (session.phase === 'final') session.currentRound = finalIndex;
  return session;
}

/** Players ranked by score, highest first. */
export function standings(session: Session): { player: Player; score: number }[] {
  const ranked = session.players.map((player) => ({ player, score: score(session, player.id) }));
  const won = tieWinner(session, ranked);
  return ranked.sort((a, b) => b.score - a.score || (b.player.id === won ? 1 : 0) - (a.player.id === won ? 1 : 0));
}

/**
 * The tiebreaker's winner, while it still settles a tie for first (their score is the top one). A score fixed later
 * that takes them out of first leaves them sharing their place like anyone else.
 */
function tieWinner(session: Session, ranked: { player: Player; score: number }[]): string | undefined {
  const won = ranked.find((r) => r.player.id === session.rollOffWinner);
  return won && ranked.every((r) => r.score <= won.score) ? won.player.id : undefined;
}

/** Standings with each player's place, equal scores sharing one ("1, 1, 3"). */
export function places(session: Session): { player: Player; score: number; place: number }[] {
  const ranked = standings(session);
  // The tiebreaker roll-off's winner has first place alone; the players they were tied with share the next one.
  const winner = tieWinner(session, ranked);
  const won = (id: string) => id === winner;
  return ranked.map((r) => ({ ...r, place: ranked.findIndex((x) => x.score === r.score && won(x.player.id) === won(r.player.id)) + 1 }));
}
