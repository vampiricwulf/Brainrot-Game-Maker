// Runtime game logic: scores, score log with undo/redo, used tiles, round flow.
// Pure functions over plain objects so they're easy to test and to autosave.
import { categoryLabel, clueValue, finalName, formatPoints, getClue, newId, playableClues, type ClueRef, type Game, type Player, type ScoreEvent, type Session } from './model';

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
    const e: ScoreEvent = { id: newId(), ts: Date.now(), playerId, delta, reason, clueId, batchId };
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
  return events;
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
  return events;
}

/** Undo/restore one specific log entry (from the score log panel). */
export function toggleEvent(session: Session, eventId: string): void {
  const e = session.scoreLog.find((x) => x.id === eventId);
  if (!e) return;
  e.undone = !e.undone;
  session.redoStack = session.redoStack.filter((id) => id !== eventId);
}

/** A player's name, including players removed mid-game. */
export function playerName(session: Session, playerId: string): string {
  return (session.players.find((p) => p.id === playerId) ?? session.removedPlayers?.find((p) => p.id === playerId))?.name ?? '?';
}

/** "+$200 × 3" for one undo step, or "score changes" when its players got different amounts (e.g. a swap). */
export function stepAmount(events: ScoreEvent[], sym: string): string {
  const d = events[0]?.delta ?? 0;
  if (!events.every((e) => e.delta === d)) return 'score changes';
  return `${d > 0 ? '+' : ''}${formatPoints(d, sym)}${events.length > 1 ? ` × ${events.length}` : ''}`;
}

/** "+$200 × 3 (Alex, Sam, Jo) · Jeopardy! · Memes $200": what one undo step changed. */
export function describeStep(session: Session, events: ScoreEvent[], sym: string): string {
  if (!events.length) return '';
  const names = events.map((e) => playerName(session, e.playerId)).join(', ');
  return `${stepAmount(events, sym)} (${names})${events[0].reason ? ` · ${events[0].reason}` : ''}`;
}

/** Undo (or restore, if it's fully undone) a whole step from the score log. */
export function toggleStep(session: Session, step: string): void {
  const events = session.scoreLog.filter((e) => stepOf(e) === step);
  const undoing = events.some((e) => !e.undone);
  for (const e of events) e.undone = undoing;
  const ids = new Set(events.map((e) => e.id));
  session.redoStack = session.redoStack.filter((id) => !ids.has(id));
}

// ---------- Players ----------

export function addPlayer(session: Session, p: Omit<Player, 'startScore'>, startScore = 0): void {
  session.players.push({ ...p, startScore });
}

/**
 * Take a player out mid-game. They move to `removedPlayers` (their log entries stay) so restorePlayer can bring
 * them back with their score, and they drop out of the picker, the Daily Double and the final round.
 */
export function removePlayer(session: Session, playerId: string): void {
  const p = session.players.find((x) => x.id === playerId);
  if (!p) return;
  const f = session.final;
  const inFinal = !!f?.players.includes(playerId);
  session.players = session.players.filter((x) => x.id !== playerId);
  session.removedPlayers = [...(session.removedPlayers ?? []), inFinal ? { ...p, inFinal } : p];
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
  const { inFinal, ...p } = removed;
  session.removedPlayers = session.removedPlayers!.filter((x) => x.id !== playerId);
  session.players = [...session.players, p];
  const f = session.final;
  if (inFinal && f && !f.players.includes(playerId)) {
    f.players = [...f.players, playerId];
    // Reveal order: lowest score first until the reveals start (as startFinal does), then at the end.
    const order = [...f.order, playerId];
    f.order = session.finalStep === 'reveal' ? order : order.sort((x, y) => score(session, x) - score(session, y));
  }
}

// ---------- Flow ----------

export function openClue(session: Session, ref: ClueRef, game?: Game): void {
  session.currentClue = ref;
  session.revealed = false;
  session.phase = 'clue';
  const clue = game && getClue(game, ref)?.clue;
  session.dd = clue?.type === 'dailyDouble' ? { stage: 'splash', playerId: session.currentPickerId } : null;
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

/** The host panel's award row is up: not on a Daily Double splash, the final reveals or the end screen. */
export function awardOpen(session: Session): boolean {
  if (session.phase === 'clue') return session.dd?.stage !== 'splash';
  return session.phase === 'board' || session.phase === 'tiebreaker' || (session.phase === 'final' && session.finalStep !== 'reveal');
}

/** Points were given (and not undone) for this clue. */
export function clueScored(session: Session, clueId: string): boolean {
  return session.scoreLog.some((e) => !e.undone && e.clueId === clueId);
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
  const cats = game.rounds[session.currentRound]?.categories.length ?? 0;
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

/** Move to round `index`; past the last round goes to the final round (if enabled) or the end screen. */
export function goToRound(session: Session, game: Game, index: number): void {
  session.currentClue = null;
  session.revealed = false;
  session.dd = null;
  if (index >= game.rounds.length) {
    session.intro = null;
    if (game.final.enabled && session.phase !== 'final' && session.phase !== 'end') startFinal(session, game);
    else session.phase = 'end';
  } else {
    const target = Math.max(0, index);
    const changed = target !== session.currentRound || session.phase !== 'board';
    const backwards = target < session.currentRound;
    session.currentRound = target;
    session.phase = 'board';
    // Only the first visit to a round plays its intro: going back (or returning) shows the board straight away.
    if (changed) {
      if (backwards || session.introducedRounds?.includes(target)) session.intro = null;
      else startIntro(session, game);
    }
  }
}

/** Back to the last round's board from the final round or the end screen (no intro; Final wagers are kept). */
export function backToLastRound(session: Session, game: Game): void {
  session.phase = 'board';
  session.currentRound = Math.max(0, game.rounds.length - 1);
  session.intro = null;
  session.currentClue = null;
  session.revealed = false;
  session.dd = null;
}

// ---------- Daily Double ----------

/** Highest value on the current round's board (TV cap for a Daily Double wager). */
export function roundMaxValue(game: Game, roundIndex: number): number {
  const round = game.rounds[roundIndex];
  if (!round) return 0;
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
  round: Game['rounds'][number],
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
  const candidates: { cat: number; row: number; w: number }[] = [];
  round.categories.forEach((c, ci) =>
    c.clues.forEach((cl, row) => {
      if (cl.empty || cl.type !== 'standard') return;
      const t = rows > 1 ? row / (rows - 1) : 1;
      candidates.push({ cat: ci, row, w: 0.3 + t * t * 3 });
    }),
  );
  let placed = 0;
  while (have + placed < count) {
    const pool = candidates.filter((c) => !usedCats.has(c.cat));
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

/** clueId used to tag the final round's score events (so re-judging finds the earlier one). */
export const FINAL_CLUE_ID = 'final';

export function startFinal(session: Session, game: Game): void {
  const eligible = session.players.filter((p) => game.settings.finalAllowNonPositive || score(session, p.id) > 0).map((p) => p.id);
  // Reveal in TV order: lowest score first.
  const order = [...eligible].sort((a, b) => score(session, a) - score(session, b));
  session.phase = 'final';
  session.finalStep = 'category';
  // Back again after a trip to the board: scores may have changed, so eligibility is checked again, but
  // anything already entered for a player who's still in is kept.
  const prev = session.final;
  const keep = <T>(r: Record<string, T> | undefined) => Object.fromEntries(Object.entries(r ?? {}).filter(([id]) => eligible.includes(id)));
  session.final = { players: eligible, wagers: keep(prev?.wagers), order, shown: keep(prev?.shown), results: keep(prev?.results) };
}

export function finalWagerCap(session: Session, playerId: string): number {
  return Math.max(0, score(session, playerId));
}

export function finalNext(session: Session): void {
  const f = session.final;
  switch (session.finalStep) {
    case 'category':
      session.finalStep = 'wagers';
      break;
    case 'wagers':
      session.finalStep = 'question';
      break;
    case 'question':
      session.finalStep = 'answer';
      break;
    case 'answer':
      session.finalStep = 'reveal';
      if (f) f.current = f.order.find((id) => !f.results[id]);
      break;
    default:
      session.phase = 'end';
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

/** Players in the final reveal who haven't been marked right or wrong yet. */
export function finalUnjudged(session: Session): string[] {
  const f = session.final;
  return f ? f.order.filter((id) => !f.results[id]) : [];
}

/** From the end screen back to the final round's reveals (e.g. to fix a judgment). */
export function backToFinalReveal(session: Session): void {
  if (!session.final) return;
  session.phase = 'final';
  session.finalStep = 'reveal';
}

/** Spotlight a player in the reveal and show their wager on screen. */
export function finalShow(session: Session, playerId: string): void {
  if (!session.final) return;
  session.final.current = playerId;
  session.final.shown[playerId] = true;
}

/** Mark a Final response right/wrong and apply ± their wager. Re-judging replaces the earlier result. */
export function finalJudge(session: Session, game: Game, playerId: string, right: boolean): void {
  const f = session.final;
  if (!f) return;
  const prev = f.results[playerId];
  if (prev) {
    // Undo the earlier judgment's score change.
    const e = [...session.scoreLog].reverse().find((x) => x.playerId === playerId && x.clueId === FINAL_CLUE_ID && !x.undone);
    if (e) e.undone = true;
  }
  const wager = f.wagers[playerId] ?? 0;
  f.results[playerId] = right ? 'right' : 'wrong';
  f.shown[playerId] = true;
  if (wager) applyScore(session, game, [playerId], right ? wager : -wager, finalName(game), FINAL_CLUE_ID);
}

// ---------- End of game ----------

/** Players tied for the lead (empty if there's a single leader). */
export function tiedLeaders(session: Session): Player[] {
  const ranked = standings(session);
  if (ranked.length < 2 || ranked[0].score !== ranked[1].score) return [];
  return ranked.filter((r) => r.score === ranked[0].score).map((r) => r.player);
}

export function startTiebreaker(session: Session): void {
  session.phase = 'tiebreaker';
  session.tiebreakerRevealed = false;
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

/** "Memes $400": a tile's category and value. */
export function clueName(game: Game, ref: ClueRef): string {
  const f = getClue(game, ref);
  if (!f) return '';
  return `${categoryLabel(f.category)} ${game.settings.currencySymbol}${clueValue(f.round, ref.row, f.clue)}`;
}

/** Where a clue sits on the board, by id. */
export function findClueRef(game: Game, clueId: string): ClueRef | null {
  for (let round = 0; round < game.rounds.length; round++) {
    const cats = game.rounds[round].categories;
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
  game.rounds[round]?.categories.forEach((c, cat) =>
    c.clues.forEach((cl, row) => {
      if (!cl.empty && session.used[cl.id]) out.push({ id: cl.id, ref: { round, cat, row } });
    }),
  );
  return out;
}

/**
 * Point a saved session at an edited copy of its game ("Resume with my edits"). Used tiles and the score log
 * are keyed by clue id, so they carry over; the open clue is found again by id, or dropped if it was deleted.
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
  session.currentRound = ref?.round ?? roundAt(session.currentRound) ?? Math.min(session.currentRound, Math.max(0, to.rounds.length - 1));
  if (session.introducedRounds)
    session.introducedRounds = session.introducedRounds.map(roundAt).filter((i): i is number => i !== null);
  if (session.phase === 'tiebreaker' && !to.tiebreaker) session.phase = 'end';
  session.gameId = to.id;
}

/** Players ranked by score, highest first. */
export function standings(session: Session): { player: Player; score: number }[] {
  return session.players
    .map((player) => ({ player, score: score(session, player.id) }))
    .sort((a, b) => b.score - a.score);
}

/** Standings with each player's place, equal scores sharing one ("1, 1, 3"). */
export function places(session: Session): { player: Player; score: number; place: number }[] {
  const ranked = standings(session);
  return ranked.map((r) => ({ ...r, place: ranked.findIndex((x) => x.score === r.score) + 1 }));
}
