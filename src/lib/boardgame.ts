// Board game mode (games-maker spec §7.13): spaces linked in a loop or a path on a board, players taking turns to
// spin or roll and step along them. Pure functions over Game + Session; the host's UI wraps changes in logged().
import {
  newId,
  SLIDE_H,
  SLIDE_W,
  textSlide,
  type BoardGameRound,
  type BoardGameState,
  type BoardSpace,
  type Game,
  type Id,
  type Session,
} from './model';
import { actionProblem } from './refs';

export const SPACE_COLORS = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#ffe119', '#42d4f4', '#f032e6'];

export function newBoardSpace(x: number, y: number, name = 'Space', color = '#4363d8'): BoardSpace {
  return { id: newId(), name, x: Math.round(x), y: Math.round(y), color, next: [] };
}

/** A name for a new space: "Space N" with a number no space has yet (after a delete, not a second "Space 12"). */
export function nextSpaceName(round: BoardGameRound): string {
  const used = round.spaces.map((s) => Number(/^Space (\d+)$/.exec(s.name)?.[1] ?? 0));
  return `Space ${Math.max(round.spaces.length, ...used) + 1}`;
}

/** A new board: a loop of 12 spaces around the edge, starting at Start. */
export function newBoardGameRound(name = 'Board game'): BoardGameRound {
  const slide = textSlide('');
  slide.elements = [];
  slide.background = { color: '#1d5e3a' };
  const spaces: BoardSpace[] = [];
  // 5 across the top, 1 down each side, 5 back along the bottom… as a rounded loop, clear of the turn banner along
  // the top and the stats strip along the bottom.
  const pts: [number, number][] = [];
  for (let i = 0; i < 5; i++) pts.push([360 + i * 300, 300]);
  pts.push([1620, 540]);
  for (let i = 4; i >= 0; i--) pts.push([360 + i * 300, 780]);
  pts.push([300, 540]);
  pts.forEach(([x, y], i) => spaces.push(newBoardSpace(x, y, i === 0 ? 'Start' : `Space ${i + 1}`, i === 0 ? '#ffcc00' : SPACE_COLORS[i % SPACE_COLORS.length])));
  spaces.forEach((s, i) => (s.next = [spaces[(i + 1) % spaces.length].id]));
  return { id: newId(), name, mode: 'boardgame', slide, spaces, mover: { kind: 'dice', dice: 'd6' }, zones: [] };
}

export function spaceById(round: BoardGameRound, id: Id | undefined): BoardSpace | undefined {
  return id ? round.spaces.find((s) => s.id === id) : undefined;
}

export function startSpace(round: BoardGameRound): BoardSpace | undefined {
  return spaceById(round, round.start) ?? round.spaces[0];
}

/** Spaces that lead into this one (for moving backwards). */
export function previousOf(round: BoardGameRound, id: Id): BoardSpace[] {
  return round.spaces.filter((s) => s.next.includes(id));
}

/** The state for a round, created on first use: everyone on the start space, turns in player order. */
export function ensureBoard(session: Session, game: Game, round: BoardGameRound): BoardGameState {
  session.boardgames ??= {};
  if (!session.boardgames[round.id]) session.boardgames[round.id] = { positions: {}, order: [], turn: 0 };
  const bs = session.boardgames[round.id];
  syncPlayers(session, round, bs);
  return bs;
}

/** Players added or removed mid-game: newcomers start on the start space and take their turn last. */
function syncPlayers(session: Session, round: BoardGameRound, bs: BoardGameState): void {
  const ids = session.players.map((p) => p.id);
  const cur = bs.order[bs.turn];
  bs.order = bs.order.filter((id) => ids.includes(id));
  for (const id of ids) if (!bs.order.includes(id)) bs.order.push(id);
  const start = startSpace(round);
  for (const id of ids) if (!bs.positions[id]) bs.positions[id] = { space: start?.id };
  // The same player keeps the turn when someone before them left.
  const at = cur ? bs.order.indexOf(cur) : -1;
  bs.turn = at >= 0 ? at : Math.min(bs.turn, Math.max(0, bs.order.length - 1));
}

export function currentPlayer(bs: BoardGameState): Id | undefined {
  return bs.order[bs.turn];
}

export function nextTurn(bs: BoardGameState, delta = 1): void {
  if (!bs.order.length) return;
  bs.turn = (((bs.turn + delta) % bs.order.length) + bs.order.length) % bs.order.length;
  bs.fork = undefined;
}

export interface Walk {
  /** Every space stepped onto, in order (the last one is where it stops). */
  path: Id[];
  /** Stopped at a fork with steps left: the host picks the way. */
  fork?: { at: Id; stepsLeft: number };
}

/** The ways on from a space: its links, not back where the player came from (a two-way link) unless that's the only way. */
export function waysOn(round: BoardGameRound, at: Id, came?: Id, back = false): Id[] {
  const here = spaceById(round, at);
  if (!here) return [];
  const all = back ? previousOf(round, at).map((s) => s.id) : here.next.filter((id) => spaceById(round, id));
  const onward = all.filter((id) => id !== came);
  return onward.length ? onward : all;
}

/**
 * Step `steps` spaces from `from` (negative: backwards). At a fork the walk stops and asks, unless `choose` says
 * which way to go first (resuming from that fork). A path's dead end stops the walk there. `came`: the space the
 * player arrived from, so a two-way link isn't walked straight back.
 */
export function walk(round: BoardGameRound, from: Id, steps: number, choose?: Id, came?: Id): Walk {
  const path: Id[] = [];
  let at = from;
  let prev = came;
  const back = steps < 0;
  for (let left = Math.abs(steps); left > 0; left--) {
    const here = spaceById(round, at);
    if (!here) break;
    const options = waysOn(round, at, prev, back);
    let to: Id | undefined;
    if (choose && options.includes(choose) && path.length === 0) to = choose;
    else if (options.length === 1) to = options[0];
    else if (options.length > 1) return { path, fork: { at, stepsLeft: left } };
    if (!to) break;
    path.push(to);
    prev = at;
    at = to;
  }
  return { path };
}

/** How long each step of a move takes on screen. */
export const HOP_MS = 380;

/**
 * Move a player: step along the spaces, then remember which spaces were passed and where they landed (their
 * actions become buttons for the host). Stops at forks. Returns a line for the host.
 */
export function movePlayer(round: BoardGameRound, bs: BoardGameState, playerId: Id, steps: number, choose?: Id): string {
  const from = bs.positions[playerId]?.space;
  if (!from) return 'They aren’t on the board (send them to a space first)';
  const w = walk(round, from, steps, choose, bs.prev?.[playerId]);
  const prevPassed = bs.fork?.playerId === playerId && bs.last?.playerId === playerId ? bs.last.passed : [];
  bs.fork = w.fork ? { playerId, at: w.fork.at, stepsLeft: w.fork.stepsLeft } : undefined;
  if (w.path.length) {
    bs.positions[playerId] = { space: w.path[w.path.length - 1] };
    bs.hop = { playerId, path: [from, ...w.path], at: Date.now() };
    const full = [from, ...w.path];
    bs.prev ??= {};
    bs.prev[playerId] = full[full.length - 2];
  }
  // A fork's space counts as passed, since the walk goes on from it.
  const passed = [...prevPassed, ...(w.fork ? w.path : w.path.slice(0, -1))];
  bs.last = { playerId, passed, landed: w.fork ? undefined : w.path.at(-1) };
  const name = (id?: Id) => spaceById(round, id)?.name ?? '?';
  if (w.fork) return `At ${name(w.fork.at)}: which way? (${w.fork.stepsLeft} to go)`;
  if (!w.path.length) return 'Nowhere to go from here';
  return `Landed on ${name(w.path.at(-1))}`;
}

/** Put players on a space or in a zone (teleport, "go to the Shadow Realm", "escape"). */
export function sendTo(bs: BoardGameState, players: Id[], to: { space?: Id; zone?: Id }): void {
  for (const id of players) {
    bs.positions[id] = to.zone ? { zone: to.zone } : { space: to.space };
    // Teleported: any way on is fine.
    if (bs.prev) delete bs.prev[id];
  }
  if (bs.fork && players.includes(bs.fork.playerId)) bs.fork = undefined;
}

/** Where to draw a player right now: along their move while it animates, else where they are. */
export function shownSpace(bs: BoardGameState, playerId: Id, now: number): Id | undefined {
  const h = bs.hop;
  if (h && h.playerId === playerId) {
    const i = Math.floor((now - h.at) / HOP_MS);
    if (i < h.path.length - 1) return h.path[Math.max(0, i)];
  }
  return bs.positions[playerId]?.space;
}

/** Spots around a space's center for the players on it, so tokens don't cover each other. */
export function fanOut(n: number, radius = 70): { dx: number; dy: number }[] {
  if (n <= 1) return [{ dx: 0, dy: 0 }];
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return { dx: Math.round(Math.cos(a) * radius), dy: Math.round(Math.sin(a) * radius) };
  });
}

/** Checklist items for a board-game round. */
export function boardGameProblems(game: Game, round: BoardGameRound, name: string, tab: number): { text: string; tab: number; level: 'warn' | 'info' }[] {
  const out: { text: string; tab: number; level: 'warn' | 'info' }[] = [];
  if (round.spaces.length < 2) out.push({ text: `${name}: the board needs at least 2 spaces`, tab, level: 'warn' });
  const ends = round.spaces.filter((s) => !s.next.some((id) => spaceById(round, id)));
  if (ends.length && round.spaces.length > 1) out.push({ text: `${name}: ${ends.map((s) => s.name).join(', ')} lead nowhere (the path ends there)`, tab, level: 'info' });
  if (round.mover.kind === 'wheel' && !game.wheels.some((w) => w.id === (round.mover as { wheel: Id }).wheel))
    out.push({ text: `${name}: the movement wheel no longer exists`, tab, level: 'warn' });
  // A deleted space, zone, item… (or nothing chosen).
  const nowhere = round.spaces.flatMap((s) => [...(s.onPass ?? []), ...(s.onLand ?? [])]).filter((a) => actionProblem(game, a, { board: round })).length;
  if (nowhere) out.push({ text: `${name}: ${nowhere} button(s) on spaces point nowhere`, tab, level: 'warn' });
  return out;
}

/** Keep a space's center on the board. */
export function clampToBoard(x: number, y: number): { x: number; y: number } {
  return { x: Math.round(Math.max(40, Math.min(SLIDE_W - 40, x))), y: Math.round(Math.max(40, Math.min(SLIDE_H - 40, y))) };
}
