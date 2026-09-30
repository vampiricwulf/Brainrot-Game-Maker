// The play history (the 📜 Log's 🕘 History tab): score changes, steps (RPG and board-game moves, items, tiles marked
// played, the picker, Players and Final changes) and rolls in one list, newest first, and the order Undo goes through
// them. Pure functions over the session, like session.ts.
import { describeStep, findClueRef, stepOf } from './session';
import type { Game, ScoreEvent, Session } from './model';

/** done: counts now · redo: undone, Redo brings it back · off: undone in the Scores tab (only its Restore brings it back). */
export type TimelineState = 'done' | 'redo' | 'off';

type Row = { id: string; ts: number; text: string; round?: number } & (
  | { kind: 'score'; events: ScoreEvent[]; state: TimelineState; clueId?: string }
  | { kind: 'action'; state: 'done' | 'redo' }
  | { kind: 'roll'; source: 'wheel' | 'dice' | 'rolloff' }
);

/**
 * A row, and `steps`: how many Undos its "Back to here" takes (every Undo newer than it), or for an undone row how
 * many Redos its "Redo to here" takes.
 */
export type TimelineRow = Row & { steps: number };

/** One Undo's worth: a score step (by stepOf) or an action-log step (by id). */
export interface UndoStep {
  log: 'score' | 'action';
  id: string;
  ts: number;
}

/** The newest score change Undo can take back: a present player's, not undone (removed players' changes stay). */
function lastScore(session: Session): ScoreEvent | undefined {
  const here = new Set(session.players.map((p) => p.id));
  for (let i = session.scoreLog.length - 1; i >= 0; i--) {
    const e = session.scoreLog[i];
    if (!e.undone && here.has(e.playerId)) return e;
  }
  return undefined;
}

/** What the next Undo takes back: the newest of a score change and a step (the step when they're as old). */
export function nextUndo(session: Session): UndoStep | null {
  const a = session.actionLog?.at(-1);
  const s = lastScore(session);
  if (a && (!s || a.ts >= s.ts)) return { log: 'action', id: a.id, ts: a.ts };
  return s ? { log: 'score', id: stepOf(s), ts: s.ts } : null;
}

/** Points spent or earned inside a step (a shop that charges points): its Undo takes them back, never one of their own. */
function inSteps(session: Session): Set<string> {
  return new Set((session.actionLog ?? []).flatMap((a) => a.score?.map((e) => e.id) ?? []));
}

/** Every Undo there is, in the order pressing Ctrl+Z again and again would take them (newest first). */
export function undoOrder(session: Session): UndoStep[] {
  const here = new Set(session.players.map((p) => p.id));
  const folded = inSteps(session);
  const scores: UndoStep[] = [];
  const seen = new Set<string>();
  for (let i = session.scoreLog.length - 1; i >= 0; i--) {
    const e = session.scoreLog[i];
    const id = stepOf(e);
    if (e.undone || !here.has(e.playerId) || folded.has(e.id) || seen.has(id)) continue;
    seen.add(id);
    scores.push({ log: 'score', id, ts: e.ts });
  }
  const actions = [...(session.actionLog ?? [])].reverse().map((a): UndoStep => ({ log: 'action', id: a.id, ts: a.ts }));
  const out: UndoStep[] = [];
  while (actions.length || scores.length) out.push((actions[0] && (!scores[0] || actions[0].ts >= scores[0].ts) ? actions : scores).shift()!);
  return out;
}

/** A Final judgment says which it was, as the Scores tab does ("$0 (Ann) · Final Jeopardy! ✔"). */
const judged = (e: ScoreEvent) => (e.right === undefined ? '' : e.right ? ' ✔' : ' ✘');

/** The round a score change was given in (older saves: its clue's round, or its Final's). */
function roundOf(game: Game, e: ScoreEvent): number | undefined {
  if (e.round !== undefined) return e.round;
  if (!e.clueId) return undefined;
  if (e.clueId.startsWith('final:')) {
    const i = game.rounds.findIndex((r) => r.id === e.clueId!.slice(6));
    return i >= 0 ? i : undefined;
  }
  return findClueRef(game, e.clueId)?.round;
}

/**
 * Every score step, step and roll, newest first, with the steps that were undone (and can be redone) on top: Undo
 * always takes the newest, so they are the newest there are. `sym` is the game's currency symbol.
 */
export function timelineRows(session: Session, game: Game, sym: string): TimelineRow[] {
  const folded = inSteps(session);
  const redoIds = new Set(session.redoStack);
  const byStep = new Map<string, ScoreEvent[]>();
  for (const e of session.scoreLog) {
    if (folded.has(e.id)) continue;
    const list = byStep.get(stepOf(e)) ?? [];
    list.push(e);
    byStep.set(stepOf(e), list);
  }
  const rows: Row[] = [];
  for (const [id, events] of byStep) {
    const state: TimelineState = events.some((e) => !e.undone) ? 'done' : events.some((e) => redoIds.has(e.id)) ? 'redo' : 'off';
    const ts = Math.max(...events.map((e) => e.ts));
    rows.push({ kind: 'score', id, ts, text: describeStep(session, events, sym) + judged(events[0]), events, state, clueId: events[0].clueId, round: roundOf(game, events[0]) });
  }
  for (const a of session.actionLog ?? []) rows.push({ kind: 'action', id: a.id, ts: a.ts, text: a.text, round: a.round, state: 'done' });
  for (const a of session.actionRedo ?? []) rows.push({ kind: 'action', id: a.id, ts: a.ts, text: a.text, round: a.round, state: 'redo' });
  for (const r of session.rollLog ?? []) rows.push({ kind: 'roll', id: r.id, ts: r.ts, text: `${r.name}: ${r.result}`, source: r.source });
  const redo = rows.filter((r) => r.kind !== 'roll' && r.state === 'redo').sort((a, b) => b.ts - a.ts);
  const rest = rows.filter((r) => !redo.includes(r)).sort((a, b) => b.ts - a.ts);
  // Back to here: every Undo newer than the row (a roll, or a change undone in the Scores tab, marks a moment).
  const order = undoOrder(session);
  const at = new Map(order.map((u, i) => [u.id, i]));
  const back = (r: Row) => at.get(r.id) ?? order.filter((u) => u.ts > r.ts).length;
  return [...redo.map((r, i): TimelineRow => ({ ...r, steps: redo.length - i })), ...rest.map((r): TimelineRow => ({ ...r, steps: back(r) }))];
}

/** The row is still undone, so "Redo to here" goes on. */
export function stillUndone(session: Session, row: TimelineRow): boolean {
  if (row.kind === 'action') return !!session.actionRedo?.some((a) => a.id === row.id);
  if (row.kind !== 'score') return false;
  const ids = new Set(row.events.map((e) => e.id));
  return session.redoStack.some((id) => ids.has(id));
}
