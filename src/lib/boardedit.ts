// Editing a board game's board while it's being played (the host's ✎ Edit board): add, move, delete, connect and
// disconnect spaces on the game being played. Pure functions over a round and its state; the host's UI wraps each in
// logged(…, game), so it's one named undo step. 💾 Keep in game copies the board into the game in the editor.
import { clampToBoard, newBoardSpace, nextSpaceName, previousOf, rehome, SPACE_COLORS, spaceById } from './boardgame';
import type { BoardGameRound, BoardGameState, BoardSpace, Game, Id, Session } from './model';
import { nameList } from './session';

/**
 * A new space at (x, y). With `after`, it goes after that space on the path: it takes over where that one led (so a
 * loop stays a loop), as in the editor. Returns the space.
 */
export function addLiveSpace(round: BoardGameRound, at: { x: number; y: number }, after?: BoardSpace): BoardSpace {
  const p = clampToBoard(at.x, at.y);
  const s = newBoardSpace(p.x, p.y, nextSpaceName(round), SPACE_COLORS[round.spaces.length % SPACE_COLORS.length]);
  if (after && spaceById(round, after.id)) {
    s.next = [...after.next];
    after.next = [s.id];
  }
  round.spaces.push(s);
  return s;
}

/** Link `from` → `to` (one way). False when it already leads there, or it's the same space. */
export function connectSpaces(round: BoardGameRound, from: Id, to: Id): boolean {
  const a = spaceById(round, from);
  if (!a || from === to || !spaceById(round, to) || a.next.includes(to)) return false;
  a.next = [...a.next, to];
  return true;
}

/** Take away the link between two spaces, both ways. False when there was none. */
export function disconnectSpaces(round: BoardGameRound, a: Id, b: Id): boolean {
  const x = spaceById(round, a);
  const y = spaceById(round, b);
  if (!x || !y || (!x.next.includes(b) && !y.next.includes(a))) return false;
  x.next = x.next.filter((n) => n !== b);
  y.next = y.next.filter((n) => n !== a);
  return true;
}

/** A link both ways becomes one way (a → b), or one way becomes both ways. */
export function toggleBothWays(round: BoardGameRound, a: Id, b: Id): void {
  const x = spaceById(round, a);
  const y = spaceById(round, b);
  if (!x || !y) return;
  if (y.next.includes(a)) y.next = y.next.filter((n) => n !== a);
  else {
    if (!x.next.includes(b)) x.next = [...x.next, b];
    y.next = [...y.next, a];
  }
}

/** a → b becomes b → a. */
export function reverseLink(round: BoardGameRound, a: Id, b: Id): void {
  const x = spaceById(round, a);
  const y = spaceById(round, b);
  if (!x || !y || !x.next.includes(b)) return;
  x.next = x.next.filter((n) => n !== b);
  if (!y.next.includes(a)) y.next = [...y.next, a];
}

/**
 * Where players standing on a space about to go should be put: the space before it on the path (one that isn't going
 * too), else the one after it, else the nearest space left. Undefined when no space is left.
 */
export function refuge(round: BoardGameRound, id: Id): BoardSpace | undefined {
  const s = spaceById(round, id);
  if (!s) return undefined;
  const others = round.spaces.filter((x) => x.id !== id);
  return (
    previousOf(round, id).find((p) => p.id !== id) ??
    s.next.map((n) => spaceById(round, n)).find((x): x is BoardSpace => !!x && x.id !== id) ??
    [...others].sort((p, q) => Math.hypot(p.x - s.x, p.y - s.y) - Math.hypot(q.x - s.x, q.y - s.y))[0]
  );
}

export type Deleted = {
  /** The players moved off it, and where to. */
  moved: { playerId: Id; to: Id }[];
  /** Spaces that led to it lead where it led now (one way on), or not at all. */
  bridged: boolean;
  /** For the log: Deleted space “Nap time” (Ann moved to Space 7). */
  text: string;
};

/**
 * Delete a space during play: the path closes up over it when it had one way on (as in the editor), the players on it
 * go to the space before it (see refuge), the round's state forgets it (a fork, the last move's buttons…), Start moves
 * to the first space if it was Start, and buttons that sent players there point nowhere. Null when it isn't there.
 */
export function deleteLiveSpace(session: Session, round: BoardGameRound, bs: BoardGameState | undefined, id: Id): Deleted | null {
  const s = spaceById(round, id);
  if (!s) return null;
  const to = refuge(round, id);
  const moved: Deleted['moved'] = [];
  if (bs && to)
    for (const [pid, p] of Object.entries(bs.positions))
      if (p.space === id) {
        bs.positions[pid] = { space: to.id };
        if (bs.prev) delete bs.prev[pid];
        moved.push({ playerId: pid, to: to.id });
      }
  let bridged = false;
  for (const p of previousOf(round, id)) {
    p.next = p.next.filter((n) => n !== id);
    if (s.next.length === 1 && s.next[0] !== p.id && !p.next.includes(s.next[0])) {
      p.next = [...p.next, s.next[0]];
      bridged = true;
    }
  }
  round.spaces = round.spaces.filter((x) => x.id !== id);
  if (round.start === id) round.start = undefined;
  for (const x of round.spaces)
    for (const a of [...(x.onPass ?? []), ...(x.onLand ?? [])]) if (a.do === 'goto' && a.space === id) a.space = undefined;
  if (bs) rehome(round, bs);
  const who = (pid: Id) => session.players.find((p) => p.id === pid)?.name ?? '?';
  const went = moved.length && to ? ` (${nameList(moved.map((m) => who(m.playerId)))} moved to ${to.name})` : '';
  return { moved, bridged, text: `Deleted space “${s.name}”${went}` };
}

/**
 * 💾 Keep in game: the board as it is now in the game being played (its spaces, their links and buttons, Start) goes
 * into the same round of another copy of the game (the editor's). Returns what it did.
 */
export function keepBoard(from: Game, to: Game, roundId: Id): string {
  const src = from.rounds.find((r) => r.id === roundId);
  const dst = to.rounds.find((r) => r.id === roundId);
  if (!src || src.mode !== 'boardgame') return 'That board is gone';
  if (!dst || dst.mode !== 'boardgame') return `“${src.name}” isn’t in the game in the editor any more`;
  const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
  dst.spaces = clone(src.spaces);
  dst.start = src.start;
  return `Kept the board of “${src.name}” in the game`;
}

/** The distance from a point to the segment a–b (for picking a link on the board). */
export function distToSegment(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** The link nearest a point of the board, within `max` board pixels (and not over a space). */
export function linkAt(round: BoardGameRound, p: { x: number; y: number }, max = 24): { from: Id; to: Id } | null {
  let best: { from: Id; to: Id; d: number } | null = null;
  for (const a of round.spaces)
    for (const n of a.next) {
      const b = spaceById(round, n);
      if (!b) continue;
      const d = distToSegment(p, a, b);
      if (d <= max && (!best || d < best.d)) best = { from: a.id, to: b.id, d };
    }
  return best && { from: best.from, to: best.to };
}
