// Board game mode (games-maker spec §7.13): spaces linked in a loop or a path on a board, players taking turns to
// spin or roll and step along them. Pure functions over Game + Session; the host's UI wraps changes in logged().
import {
  isBoardGame,
  type Action,
  newId,
  SLIDE_H,
  SLIDE_W,
  textSlide,
  type BoardGameRound,
  type BoardGameState,
  type BoardSpace,
  type DicePreset,
  type Game,
  type Id,
  type Session,
} from './model';
import { actionProblem, nameList } from './refs';
import type { Problem } from './validate';
import type { Place } from './historylabel';

export const SPACE_COLORS = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#ffe119', '#42d4f4', '#f032e6'];

export function newBoardSpace(x: number, y: number, name = 'Space', color = '#4363d8'): BoardSpace {
  return { id: newId(), name, x: Math.round(x), y: Math.round(y), color, next: [] };
}

/** Viewers see this space's name under it (hidden unless its box is ticked, in older games too). */
export function nameShown(s: Pick<BoardSpace, 'showName'>): boolean {
  return !!s.showName;
}

/** Show or hide a space's name on the board (hidden is the default: no flag stored). */
export function setNameShown(s: BoardSpace, on: boolean): void {
  s.showName = on || undefined;
}

/** The undo step for showing or hiding one space's name: Showed the name of “Bonus”. */
export function nameShownLabel(s: Pick<BoardSpace, 'name'>, on: boolean): string {
  return `${on ? 'Showed' : 'Hid'} the name of “${s.name}”`;
}

/** Show or hide every space's name; how many changed. */
export function setAllNamesShown(round: BoardGameRound, on: boolean): number {
  let n = 0;
  for (const s of round.spaces)
    if (nameShown(s) !== on) {
      setNameShown(s, on);
      n++;
    }
  return n;
}

/** The undo step for the bulk toggle: Showed all space names. */
export function allNamesLabel(on: boolean): string {
  return on ? 'Showed all space names' : 'Hid all space names';
}

/** A name for a new space: "Space N" with a number no space has yet (after a delete, not a second "Space 12"). */
export function nextSpaceName(round: BoardGameRound): string {
  const used = round.spaces.map((s) => Number(/^Space (\d+)$/.exec(s.name)?.[1] ?? 0));
  return `Space ${Math.max(round.spaces.length, ...used) + 1}`;
}

/** The number a space named "Space N" has (drawn in it), else undefined: "Move +3" or "Back 4" aren't numbered. */
export function spaceNumber(name: string): string | undefined {
  return /^Space (\d+)$/.exec(name.trim())?.[1];
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

/**
 * A link as menus and undo steps say it, as ✎ Edit board in play does: "Space 3 → Space 4", or "Space 3 ↔ Space 4"
 * when it goes both ways.
 */
export function linkName(round: BoardGameRound, from: Id, to: Id): string {
  const a = spaceById(round, from);
  const b = spaceById(round, to);
  return `${a?.name ?? '?'} ${b?.next.includes(from) ? '↔' : '→'} ${b?.name ?? '?'}`;
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
  // The same player keeps the turn when someone before them left; when they left, it goes to the next one still in.
  const keep = [...bs.order.slice(bs.turn), ...bs.order.slice(0, bs.turn)].find((id) => ids.includes(id));
  bs.order = bs.order.filter((id) => ids.includes(id));
  for (const id of ids) if (!bs.order.includes(id)) bs.order.push(id);
  const start = startSpace(round);
  for (const id of ids) if (!bs.positions[id]) bs.positions[id] = { space: start?.id };
  bs.turn = keep ? bs.order.indexOf(keep) : 0;
  // A way to pick for someone who left isn't asked any more.
  if (bs.fork && !ids.includes(bs.fork.playerId)) bs.fork = undefined;
  rehome(round, bs);
}

/**
 * Spaces or zones deleted in the editor since ("Resume with my edits"): players on them go back to the start space,
 * and a fork, the last move's buttons, the move being shown and the way each player came forget them.
 */
export function rehome(round: BoardGameRound, bs: BoardGameState): void {
  const has = (id: Id | undefined) => !!spaceById(round, id);
  const start = startSpace(round)?.id;
  for (const [id, p] of Object.entries(bs.positions)) {
    const ok = p.zone ? round.zones.some((z) => z.id === p.zone) : has(p.space);
    if (!ok && start) bs.positions[id] = { space: start };
  }
  if (bs.fork && !has(bs.fork.at)) bs.fork = undefined;
  if (bs.last && (!bs.last.passed.every(has) || (bs.last.landed && !has(bs.last.landed)))) {
    const passed = bs.last.passed.filter(has);
    bs.last = { ...bs.last, passed, landed: has(bs.last.landed) ? bs.last.landed : undefined };
  }
  if (bs.hop && !bs.hop.path.every(has)) bs.hop = undefined;
  if (bs.prev) for (const [id, s] of Object.entries(bs.prev)) if (!has(s)) delete bs.prev[id];
  if (bs.revealed?.some((s) => !has(s))) bs.revealed = bs.revealed.filter(has);
  if (bs.zoneShown && !round.zones.some((z) => z.id === bs.zoneShown)) bs.zoneShown = null;
}

/** After the game was edited ("Resume with my edits"): every board-game round's state forgets deleted spaces. */
export function refindSpaces(session: Session, game: Game): void {
  for (const [id, bs] of Object.entries(session.boardgames ?? {})) {
    const round = game.rounds.find((r) => r.id === id);
    if (isBoardGame(round)) rehome(round, bs);
  }
}

export function currentPlayer(bs: BoardGameState): Id | undefined {
  return bs.order[bs.turn];
}

/**
 * Pass the turn on (`delta` -1: back to the one before). Going on, a player who rolls again keeps it, and players who
 * skip a turn are passed over (one fewer to skip each time). Returns the players passed over.
 */
export function nextTurn(bs: BoardGameState, delta = 1): Id[] {
  const n = bs.order.length;
  bs.fork = undefined;
  // A new turn, even for the same player (one player, 🔁 Roll again): its move is still to make.
  bs.turns = (bs.turns ?? 0) + 1;
  if (!n) return [];
  const at = (i: number) => ((i % n) + n) % n;
  if (delta <= 0) {
    bs.turn = at(bs.turn + delta);
    return [];
  }
  const again = bs.again;
  bs.again = undefined;
  if (again && bs.order.includes(again)) {
    bs.turn = bs.order.indexOf(again);
    return [];
  }
  const skipped: Id[] = [];
  // (New objects, not changed in place: a copy of the state can try a turn out first.)
  let skips = { ...bs.skips };
  let turn = at(bs.turn + delta);
  for (let tries = 0; tries < n && (skips[bs.order[turn]] ?? 0) > 0; tries++) {
    const id = bs.order[turn];
    skips = { ...skips, [id]: skips[id] - 1 };
    if (!skips[id]) delete skips[id];
    skipped.push(id);
    turn = at(turn + 1);
  }
  bs.turn = turn;
  if (Object.keys(skips).length) bs.skips = skips;
  else delete bs.skips;
  return skipped;
}

/** Players miss their next `turns` turns (on top of any they already miss). */
export function skipTurns(bs: BoardGameState, players: Id[], turns = 1): void {
  const skips = { ...bs.skips };
  for (const id of players) skips[id] = (skips[id] ?? 0) + Math.max(1, Math.round(turns));
  bs.skips = skips;
}

export interface Walk {
  /** Every space stepped onto, in order (the last one is where it stops). */
  path: Id[];
  /** Stopped at a fork with steps left (negative: going back): the host picks the way. */
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
 * player's last move forward arrived from, so a two-way link isn't walked straight back, and a move back retraces it
 * (where two ways lead in, back the way they came, not the other one).
 */
export function walk(round: BoardGameRound, from: Id, steps: number, choose?: Id, came?: Id): Walk {
  const path: Id[] = [];
  let at = from;
  let prev = came;
  const back = steps < 0;
  for (let left = Math.abs(steps); left > 0; left--) {
    const here = spaceById(round, at);
    if (!here) break;
    const retrace = back && !path.length && !choose && !!came && !!spaceById(round, came)?.next.includes(at);
    const options = retrace ? [came!] : waysOn(round, at, prev, back);
    let to: Id | undefined;
    if (choose && options.includes(choose) && path.length === 0) to = choose;
    else if (options.length === 1) to = options[0];
    else if (options.length > 1) return { path, fork: { at, stepsLeft: back ? -left : left } };
    if (!to) break;
    path.push(to);
    prev = at;
    at = to;
  }
  return { path };
}

/**
 * The spaces the host can pick to move on to now, and for whom: the ways on from a fork (with the steps left), or on a
 * one-space-a-turn board the ways on from where the player whose turn it is stands. Null when there's nothing to pick.
 */
export function waysNow(round: BoardGameRound, bs: BoardGameState): { playerId: Id; steps: number; ways: Id[] } | null {
  const f = bs.fork;
  if (f) return { playerId: f.playerId, steps: f.stepsLeft, ways: waysOn(round, f.at, bs.prev?.[f.playerId], f.stepsLeft < 0) };
  const turn = currentPlayer(bs);
  const at = turn ? bs.positions[turn]?.space : undefined;
  if (round.mover.kind !== 'step' || !turn || !at) return null;
  const ways = waysOn(round, at, bs.prev?.[turn]);
  return ways.length ? { playerId: turn, steps: 1, ways } : null;
}

/** Move one player in the turn order to position `to` (the others close up); whoever's turn it is keeps it. */
export function moveInOrder(bs: BoardGameState, from: number, to: number): void {
  if (from === to || from < 0 || to < 0 || from >= bs.order.length || to >= bs.order.length) return;
  const cur = bs.order[bs.turn];
  const order = [...bs.order];
  const [id] = order.splice(from, 1);
  order.splice(to, 0, id);
  bs.order = order;
  bs.turn = order.indexOf(cur);
}

/** How long each step of a move takes on screen. */
export const HOP_MS = 380;
/** The most spaces one move goes, either way (a typed 100000 would take ages to walk, and to show). */
export const MAX_STEPS = 99;
/** A longer move than this many spaces jumps straight to where it ends on screen, rather than stepping for a minute. */
export const MAX_HOPS = 20;

/** A count of steps as a move takes it: a whole number, at most MAX_STEPS either way (0 for nonsense). */
export function clampSteps(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(-MAX_STEPS, Math.min(MAX_STEPS, Math.round(n)));
}

/**
 * Move a player: step along the spaces, then remember which spaces were passed and where they landed (their
 * actions become buttons for the host). Stops at forks. Returns a line for the host.
 */
export function movePlayer(round: BoardGameRound, bs: BoardGameState, playerId: Id, steps: number, choose?: Id): string {
  const from = bs.positions[playerId]?.space;
  if (!from) return 'They aren’t on the board (send them to a space first)';
  steps = clampSteps(steps);
  if (!steps) return 'No steps to move';
  const w = walk(round, from, steps, choose, bs.prev?.[playerId]);
  const prevPassed = bs.fork?.playerId === playerId && bs.last?.playerId === playerId ? bs.last.passed : [];
  bs.fork = w.fork ? { playerId, at: w.fork.at, stepsLeft: w.fork.stepsLeft } : undefined;
  if (w.path.length) {
    bs.positions[playerId] = { space: w.path[w.path.length - 1] };
    const full = [from, ...w.path];
    bs.hop = { playerId, path: w.path.length > MAX_HOPS ? [from, full[full.length - 1]] : full, at: Date.now() };
    bs.prev ??= {};
    // Where a move forward came from. After a move back that's unknown: any way on is open again (a fork asks).
    if (steps > 0) bs.prev[playerId] = full[full.length - 2];
    else delete bs.prev[playerId];
  }
  // A fork's space counts as passed, since the walk goes on from it. A space passed twice (round a small loop) gets
  // its buttons once.
  const passed = [...new Set([...prevPassed, ...(w.fork ? w.path : w.path.slice(0, -1))])];
  bs.last = { playerId, passed, landed: w.fork ? undefined : w.path.at(-1), turn: bs.turns ?? 0 };
  const name = (id?: Id) => spaceById(round, id)?.name ?? '?';
  if (w.fork) return `At ${name(w.fork.at)}: which way? (${Math.abs(w.fork.stepsLeft)} to go)`;
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

/** A board space's radius (BoardSpaces draws them 116px across), and how far a token may tuck in over its rim. */
const SPACE_R = 58;
const TUCK = 12;

/** How big a token is (its radius) with `n` on one space: smaller as the crowd grows. */
export function tokenRadius(n: number): number {
  return n > 8 ? 24 : n > 3 ? 32 : 42;
}

/** Above this many tokens on one space, they stand in rows over it instead of along its rim. */
const RIM_MAX = 8;

/**
 * Where `n` tokens of radius `r` sit on a space: side by side along the top of its rim, never over its number or its
 * name below it. A crowd moves out a little so the tokens don't cover each other, and goes no lower than the sides.
 * More than RIM_MAX stand in rows, centered a little above the space, about as wide as the gap to the next space.
 */
export function rimSpots(n: number, r: number): { dx: number; dy: number }[] {
  if (n > RIM_MAX) {
    const gap = 2 * r + 4;
    const cols = Math.min(n, Math.ceil(Math.sqrt(n * 1.6)));
    const rows = Math.ceil(n / cols);
    return Array.from({ length: n }, (_, i) => {
      const row = Math.floor(i / cols);
      const inRow = row === rows - 1 ? n - row * cols : cols;
      return { dx: Math.round((i - row * cols - (inRow - 1) / 2) * gap), dy: Math.round((row - (rows - 1) / 2) * gap - r) };
    });
  }
  let ring = SPACE_R + r - TUCK;
  // The angle between two neighbours' centers at that distance; together they reach a little past the sides at most.
  const stepAt = (d: number) => 2 * Math.asin(Math.min(1, (r + 3) / d));
  while ((n - 1) * stepAt(ring) > Math.PI * 1.1 && ring < 400) ring += 8;
  const step = stepAt(ring);
  return Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (i - (n - 1) / 2) * step;
    return { dx: Math.round(Math.cos(a) * ring), dy: Math.round(Math.sin(a) * ring) };
  });
}

/**
 * Where to draw `n` tokens on a space at (x, y), on the board, with `top` and `bottom` the room the labels and the
 * stats strip leave: rows of a crowd move together (so they stay rows); along the rim, a token that would slip under
 * the turn banner or the strip comes down (or up) just enough. Nothing goes off the sides.
 */
export function placeTokens(x: number, y: number, n: number, top: number, bottom: number): { r: number; spots: { x: number; y: number }[] } {
  const r = tokenRadius(n);
  const spots = rimSpots(n, r).map((s) => ({ x: x + s.dx, y: y + s.dy }));
  // (Too big for the room, the group keeps to the left, or the top.)
  const shift = (lo: number, hi: number, min: number, max: number) => (min < lo ? lo - min : max > hi ? Math.max(hi - max, lo - min) : 0);
  const xs = spots.map((s) => s.x);
  const dx = shift(8 + r, SLIDE_W - 8 - r, Math.min(...xs), Math.max(...xs));
  const lowest = top + r;
  const highest = Math.max(lowest, bottom - r);
  const ys = spots.map((s) => s.y);
  const dy = n > RIM_MAX ? shift(lowest, highest, Math.min(...ys), Math.max(...ys)) : 0;
  return { r, spots: spots.map((s) => ({ x: s.x + dx, y: Math.min(highest, Math.max(lowest, s.y + dy)) })) };
}

/**
 * The saved dice a board's move rolls, if it rolls some: by their id (renaming them keeps the link). Undefined for
 * standard dice ("2d6", typed in) and for dice deleted since (see moverDiceGone).
 */
export function moverPreset(game: Pick<Game, 'dice'>, round: BoardGameRound): DicePreset | undefined {
  const m = round.mover;
  return m.kind === 'dice' && m.diceId ? game.dice.find((d) => d.id === m.diceId) : undefined;
}

/** The board rolls saved dice that were deleted since (its move then rolls what it says, or a d6). */
export function moverDiceGone(game: Pick<Game, 'dice'>, round: BoardGameRound): boolean {
  const m = round.mover;
  return m.kind === 'dice' && !!m.diceId && !game.dice.some((d) => d.id === m.diceId);
}

/** Checklist items for a board-game round. */
export function boardGameProblems(game: Game, round: BoardGameRound, name: string, tab: number): Problem[] {
  const out: Problem[] = [];
  const at = (s?: BoardSpace): Place => (s ? { tab: 'round', round: round.id, part: { kind: 'space', space: s.id } } : { tab: 'round', round: round.id });
  if (round.spaces.length < 2) out.push({ text: `${name}: the board needs at least 2 spaces`, tab, level: 'warn', place: at() });
  // One end is the finish (a race); more than one, and players get stuck at the others.
  const ends = round.spaces.filter((s) => !s.next.some((id) => spaceById(round, id)));
  if (ends.length > 1)
    out.push({ text: `${name}: the path ends at ${nameList(ends.map((s) => s.name), 3)} (players stop there)`, tab, level: 'info', place: at(ends[0]) });
  if (round.mover.kind === 'wheel' && !game.wheels.some((w) => w.id === (round.mover as { wheel: Id }).wheel))
    out.push({ text: `${name}: the movement wheel no longer exists`, tab, level: 'warn', place: at() });
  if (moverDiceGone(game, round)) out.push({ text: `${name}: the movement dice no longer exist (pick others in Move by)`, tab, level: 'warn', place: at() });
  // (No space is ever under the stats strip: in play the board is scaled into the room the strip leaves.)
  // A deleted space, zone, item… (or nothing chosen).
  const nowhere = round.spaces.flatMap((s) => [...(s.onPass ?? []), ...(s.onLand ?? [])].filter((a) => actionProblem(game, a, { board: round })).map(() => s));
  if (nowhere.length) {
    const on = nameList(nowhere.map((s) => s.name));
    const text = nowhere.length === 1 ? `a button on ${on} points nowhere` : `${nowhere.length} buttons on spaces point nowhere (on ${on})`;
    out.push({ text: `${name}: ${text}`, tab, level: 'warn', place: at(nowhere[0]) });
  }
  return out;
}

/**
 * The nearest space from `from` in a direction (dx, dy: one of the four arrows), for the editor's arrow keys: the
 * spaces ahead within about 60° of it come first, the closest (sideways distance counting double) wins.
 */
export function spaceToward(round: BoardGameRound, from: BoardSpace, dx: number, dy: number): BoardSpace | undefined {
  let best: { s: BoardSpace; score: number; inCone: boolean } | undefined;
  for (const s of round.spaces) {
    if (s.id === from.id) continue;
    const ahead = (s.x - from.x) * dx + (s.y - from.y) * dy;
    if (ahead <= 0) continue;
    const side = Math.abs((s.x - from.x) * dy - (s.y - from.y) * dx);
    const inCone = side <= ahead * 1.8;
    const score = ahead + 2 * side;
    if (!best || (inCone && !best.inCone) || (inCone === best.inCone && score < best.score)) best = { s, score, inCone };
  }
  return best?.s;
}

// ---------- Kinds of space ("Make it a…") ----------

export type SpaceKind = 'shop' | 'boss' | 'question' | 'skip' | 'back' | 'star';

/** What a space kind needs from the game: the shop it opens, the HP stat a fight takes from. */
export interface SpaceKindContext {
  shop?: Id;
  hp?: Id;
}

/** The kinds of space a space can be made, for the editor's "Make it a…": label, hint, what it fills in. */
export const SPACE_KINDS: { kind: SpaceKind; label: string; hint: string; name: string; mark: string; color: string; onLand: (c: SpaceKindContext) => Omit<Action, 'id'>[] }[] = [
  { kind: 'shop', label: '🛒 Shop', hint: 'Landing opens a shop', name: 'Shop', mark: '🛒', color: '#3cb44b', onLand: (c) => [{ do: 'shop', shop: c.shop ?? '' }] },
  {
    kind: 'boss',
    label: '👹 Boss / fight',
    hint: 'Roll to fight: a win scores 200, a loss sends them back 2',
    name: 'Boss',
    mark: '👹',
    color: '#e6194b',
    onLand: (c) => [
      { do: 'dice', dice: 'd6' },
      { do: 'score', amount: 200, who: 'party' },
      ...(c.hp ? [{ do: 'stat' as const, field: c.hp, op: 'add' as const, amount: -1, who: 'party' as const }] : []),
      { do: 'steps', steps: -2, who: 'party' },
    ],
  },
  {
    kind: 'question',
    label: '❓ Question / clue',
    hint: 'Landing asks a question worth 100 (write it in its button)',
    name: 'Question',
    mark: '❓',
    color: '#4363d8',
    onLand: () => [{ do: 'question', question: textSlide('Write the question here'), answer: textSlide('The answer'), value: 100 }],
  },
  { kind: 'skip', label: '⏭ Skip a turn', hint: 'Landing misses the next turn', name: 'Skip a turn', mark: '⏭', color: '#911eb4', onLand: () => [{ do: 'skip', turns: 1, who: 'party' }] },
  { kind: 'back', label: '↩ Back 3 spaces', hint: 'Landing moves them back 3 (change the number in its button)', name: 'Back 3', mark: '↩', color: '#f58231', onLand: () => [{ do: 'steps', steps: -3, who: 'party' }] },
  { kind: 'star', label: '⭐ Star (bonus points)', hint: 'Landing scores 100', name: 'Star', mark: '⭐', color: '#ffcc00', onLand: () => [{ do: 'score', amount: 100, who: 'party' }] },
];

/**
 * Make a space a shop, a boss, a question…: its "When landed on" buttons (they replace the ones it had), its color and
 * the emoji drawn in it. A space still called "Space N" takes the kind's name, and viewers see its name on the board
 * (a special space with no name looks like any other).
 */
export function applySpaceKind(s: BoardSpace, kind: SpaceKind, c: SpaceKindContext = {}): void {
  const k = SPACE_KINDS.find((x) => x.kind === kind);
  if (!k) return;
  s.onLand = k.onLand(c).map((a) => ({ id: newId(), ...a }) as Action);
  s.color = k.color;
  s.mark = k.mark;
  if (!s.name.trim() || spaceNumber(s.name)) s.name = k.name;
  setNameShown(s, true);
}

/**
 * The kind of space its landing buttons make it (a space made by hand or by a template counts too), or null: none, or
 * buttons no kind has (a "Roll again"). A fight rolls dice; a star only scores.
 */
export function spaceKindOf(s: Pick<BoardSpace, 'onLand'>): SpaceKind | null {
  const acts = s.onLand ?? [];
  const has = (d: Action['do']) => acts.some((a) => a.do === d);
  if (has('shop')) return 'shop';
  if (has('question')) return 'question';
  if (has('dice')) return 'boss';
  if (has('skip')) return 'skip';
  if (acts.some((a) => a.do === 'steps' && a.steps < 0)) return 'back';
  if (acts.length && acts.every((a) => a.do === 'score' && a.amount > 0)) return 'star';
  return null;
}

/**
 * ⑂ Add a fork here: a new space beside the way on from `from`, as a second way on. It leads where `from`'s first way
 * leads to (so the two ways meet again there), or nowhere at the end of a path. Returns the new space.
 */
export function addFork(round: BoardGameRound, from: BoardSpace): BoardSpace {
  const on = spaceById(round, from.next[0]);
  const after = on ? spaceById(round, on.next[0]) : undefined;
  // Halfway along the way on, pushed out to one side (at the end of a path: on past it).
  const tx = on ? (from.x + on.x) / 2 : from.x + 200;
  const ty = on ? (from.y + on.y) / 2 : from.y;
  const dx = on ? on.x - from.x : 1;
  const dy = on ? on.y - from.y : 0;
  const d = Math.hypot(dx, dy) || 1;
  let nx = on ? -dy / d : 0;
  let ny = on ? dx / d : 0;
  // Toward the middle of the board, so a loop's fork goes inside it.
  if ((SLIDE_W / 2 - tx) * nx + (SLIDE_H / 2 - ty) * ny < 0) [nx, ny] = [-nx, -ny];
  const p = clampToBoard(tx + nx * 200, ty + ny * 200);
  const s = newBoardSpace(p.x, p.y, nextSpaceName(round), SPACE_COLORS[round.spaces.length % SPACE_COLORS.length]);
  s.next = on ? [(after && after.id !== from.id ? after : on).id] : [];
  from.next = [...from.next, s.id];
  round.spaces.push(s);
  return s;
}

/** Keep a space's center on the board. */
export function clampToBoard(x: number, y: number): { x: number; y: number } {
  return { x: Math.round(Math.max(40, Math.min(SLIDE_W - 40, x))), y: Math.round(Math.max(40, Math.min(SLIDE_H - 40, y))) };
}
