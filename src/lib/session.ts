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
  /** Skip the no-negative-scores clamp (for deliberate effects like "Bankrupt" or swaps). */
  exact = false,
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
}

/** Close the current clue and mark it used. */
export function backToBoard(session: Session, game: Game): void {
  const found = session.currentClue && getClue(game, session.currentClue);
  if (found) session.used[found.clue.id] = true;
  session.currentClue = null;
  session.revealed = false;
  session.dd = null;
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

/** Start a round's intro sequence according to the game's settings (or skip straight to the board). */
export function startIntro(session: Session, game: Game): void {
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

/** Move to round `index`; past the last round goes to Final Jeopardy (if enabled) or the end screen. */
export function goToRound(session: Session, game: Game, index: number): void {
  session.currentClue = null;
  session.revealed = false;
  session.dd = null;
  if (index >= game.rounds.length) {
    session.intro = null;
    if (game.final.enabled && session.phase !== 'final' && session.phase !== 'end') startFinal(session, game);
    else session.phase = 'end';
  } else {
    const changed = index !== session.currentRound || session.phase !== 'board';
    session.currentRound = Math.max(0, index);
    session.phase = 'board';
    if (changed) startIntro(session, game);
  }
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
 */
export function randomizeDailyDoubles(round: Game['rounds'][number], count: number, rand = Math.random): number {
  for (const c of round.categories) for (const cl of c.clues) if (cl.type === 'dailyDouble') cl.type = 'standard';
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
  const usedCats = new Set<number>();
  while (placed < count) {
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

// ---------- Final Jeopardy ----------

export function startFinal(session: Session, game: Game): void {
  const eligible = session.players.filter((p) => game.settings.finalAllowNonPositive || score(session, p.id) > 0).map((p) => p.id);
  // Reveal in TV order: lowest score first.
  const order = [...eligible].sort((a, b) => score(session, a) - score(session, b));
  session.phase = 'final';
  session.finalStep = 'category';
  session.final = { players: eligible, wagers: {}, order, shown: {}, results: {} };
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
    const e = [...session.scoreLog].reverse().find((x) => x.playerId === playerId && x.reason === 'Final Jeopardy' && !x.undone);
    if (e) e.undone = true;
  }
  const wager = f.wagers[playerId] ?? 0;
  f.results[playerId] = right ? 'right' : 'wrong';
  f.shown[playerId] = true;
  if (wager) applyScore(session, game, [playerId], right ? wager : -wager, 'Final Jeopardy');
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
  return `${f.round.name} · ${f.category.title || 'Category'} ${game.settings.currencySymbol}${clueValue(f.round, ref.row, f.clue)}`;
}

/** Players ranked by score, highest first. */
export function standings(session: Session): { player: Player; score: number }[] {
  return session.players
    .map((player) => ({ player, score: score(session, player.id) }))
    .sort((a, b) => b.score - a.score);
}
