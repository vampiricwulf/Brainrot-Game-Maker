// The board-game host's moves, shared by the host panel, the stage and the keyboard shortcuts. Every change is one
// undoable step.
import { describeAction, runAction } from '../../lib/actions';
import { clampSteps, currentPlayer, moveInOrder, movePlayer, moverPreset, nextTurn, sendTo, spaceById } from '../../lib/boardgame';
import { isBoardGame, type Action, type BoardGameRound, type BoardGameState, type BoardSpace, type BoardZone, type Game, type Session } from '../../lib/model';
import { nameList } from '../../lib/session';
import { logged } from '../../lib/toolset';
import { openWheel, quickDice, rollDice, spinWheel, wheelSpentUp } from '../../lib/overlay';
import { parseDice } from '../../lib/tools';
import { overlayDoneAt, type Live } from '../../lib/live';

/** The board-game round being played and its state (undefined outside one). */
export function boardNow(game: Game, session: Session) {
  const round = game.rounds[session.currentRound];
  if (session.phase !== 'boardgame' || !isBoardGame(round)) return {};
  // goToRound set the state up (reading only: this runs inside derived values).
  return { round, bs: session.boardgames?.[round.id] };
}

export const playerName = (session: Session, id: string | undefined) => session.players.find((p) => p.id === id)?.name ?? '?';

/** The turn order for the log: "Cy → Ann → Bob". */
export const turnOrder = (session: Session, order: string[]) => order.map((id) => playerName(session, id)).join(' → ');

/** The zones on screen or with players in them. */
export function busyZones(round: BoardGameRound, bs: BoardGameState): BoardZone[] {
  return round.zones.filter((z) => bs.zoneShown === z.id || bs.order.some((id) => bs.positions[id]?.zone === z.id));
}

/** Move whoever's turn it is (or `playerId`) `steps` spaces; `choose` picks the way at a fork. */
export function moveNow(game: Game, session: Session, steps: number, choose?: string, playerId?: string): string {
  const { round, bs } = boardNow(game, session);
  if (!round || !bs) return 'No board';
  const who = playerId ?? bs.fork?.playerId ?? currentPlayer(bs);
  if (!who) return 'No players';
  steps = clampSteps(steps);
  if (!steps) return 'How many spaces? Roll first, or type a number';
  let msg = '';
  logged(session, `${playerName(session, who)} moves ${steps}`, () => (msg = movePlayer(round, bs, who, steps, choose)));
  return `${playerName(session, who)}: ${msg}`;
}

/** Teleport players to a space or a zone (the ones not there already). Returns the log line. */
export function sendNow(game: Game, session: Session, who: string[], to: { space?: string; zone?: string }): string | null {
  const { round, bs } = boardNow(game, session);
  const where = to.zone ? round?.zones.find((z) => z.id === to.zone)?.name : round && spaceById(round, to.space)?.name;
  const moving = who.filter((id) => (to.zone ? bs?.positions[id]?.zone !== to.zone : bs?.positions[id]?.space !== to.space));
  if (!bs || !where || !moving.length) return null;
  const text = `${nameList(moving.map((w) => playerName(session, w)))} → ${where}`;
  logged(session, text, () => sendTo(bs, moving, to));
  return text;
}

/** Make it a player's turn (a way to pick at a fork, and a pending Roll again, are dropped). */
export function setTurn(game: Game, session: Session, playerId: string): void {
  const { bs } = boardNow(game, session);
  const i = bs?.order.indexOf(playerId) ?? -1;
  if (!bs || i < 0 || i === bs.turn) return;
  logged(session, `${playerName(session, playerId)}’s turn`, () => {
    bs.turn = i;
    bs.fork = undefined;
    // The turn given away: the one before doesn't roll again after it, and their landing buttons go.
    bs.again = undefined;
    bs.last = undefined;
    delete bs.before;
  });
}

/** Move a player to another place in the turn order; whoever's turn it is keeps it. */
export function reorderTurns(game: Game, session: Session, from: number, to: number): void {
  const { bs } = boardNow(game, session);
  if (!bs || from === to || to < 0 || to >= bs.order.length) return;
  const order = [...bs.order];
  order.splice(to, 0, ...order.splice(from, 1));
  logged(session, `Turn order: ${turnOrder(session, order)}`, () => moveInOrder(bs, from, to));
}

/**
 * Run a space's landing (or passing) actions for some players, as one step, as if they'd just landed there. Returns
 * what to tell the host.
 */
export function runSpace(game: Game, session: Session, live: Live, space: BoardSpace, who: string[], which: 'onLand' | 'onPass' = 'onLand'): string {
  const { round, bs } = boardNow(game, session);
  const list = space[which] ?? [];
  if (!round || !bs || !list.length) return `${space.name} has no actions`;
  // A roll, a spin or a question decides what comes next (a fight: win or lose): only that runs, and the host presses
  // the outcome it came to (running them all would win and lose at once).
  const decides = list.find(decidingAction);
  const run = decides ? [decides] : list;
  let said: string[] = [];
  const ctx = { game, session, live, board: round, bs, selected: who, chosen: who };
  logged(session, `${space.name}: ${run.map((a) => describeAction(game, a)).join(', ')}`, () => {
    said = run.map((a) => runAction(ctx, a, `${space.name}: ${describeAction(game, a)}`));
  });
  return decides ? `${said.join(' · ')}: then press the outcome` : said.join(' · ');
}

/** A roll, a spin or a question: what follows depends on how it comes out. */
export function decidingAction(a: Action): boolean {
  return a.do === 'dice' || a.do === 'wheel' || a.do === 'question';
}

export function turnNow(game: Game, session: Session, delta = 1): void {
  const { bs } = boardNow(game, session);
  if (!bs) return;
  // The log says whose turn it is now (“Ann’s turn”), as Make it their turn does.
  const after = { ...bs };
  const skipped = nextTurn(after, delta);
  const again = delta > 0 && bs.again && currentPlayer(after) === bs.again ? ' again' : '';
  const skips = skipped.length ? ` (${nameList(skipped.map((id) => playerName(session, id)))} ${skipped.length === 1 ? 'skips' : 'skip'} a turn)` : '';
  logged(session, `${playerName(session, currentPlayer(after))}’s turn${again}${skips}`, () => {
    const back = delta < 0 && !!bs.before;
    nextTurn(bs, delta);
    // (Back to the turn before: its move and landing buttons come back with it.)
    if (!back) bs.last = undefined;
  });
}

/** The name the round's movement dice roll under (a saved preset's, else what the round says: "2d6"). */
export function moverDiceName(game: Game, round: BoardGameRound): string | undefined {
  const m = round.mover;
  if (m.kind !== 'dice') return undefined;
  return moverPreset(game, round)?.name ?? (parseDice(m.dice) ? m.dice.trim() : 'd6');
}

/**
 * The number of spaces the round's own dice or movement wheel just gave (a wheel slice labeled "3" or "Move 3"), or
 * null. Other dice and wheels on screen (a space's "Roll d20", the Pick-a-player wheel, the 🎲 tool) don't count.
 */
export function moverResult(game: Game, round: BoardGameRound, o: Live['overlay']): number | null {
  const m = round.mover;
  if (o?.kind === 'dice' && o.roll && o.mover && m.kind === 'dice') return o.roll.total;
  if (o?.kind === 'wheel' && o.spin && o.result !== null && m.kind === 'wheel' && o.wheelId === m.wheel) {
    const label = o.segments[o.result]?.label ?? '';
    const n = parseInt(label.match(/-?\d+/)?.[0] ?? '', 10);
    // "Back 2" (or "← 2") moves back.
    return Number.isFinite(n) ? (/^\W*(back|←)/i.test(label.trim()) ? -Math.abs(n) : n) : null;
  }
  return null;
}

/** Roll the round's dice, or spin its wheel, for a move. Returns why it couldn't, or null. */
export function rollMover(game: Game, session: Session, live: Live): string | null {
  const { round } = boardNow(game, session);
  if (!round) return 'No board';
  // Still rolling or spinning: D again waits for it, like Roll again.
  const o = live.overlay;
  if ((o?.kind === 'dice' || o?.kind === 'wheel') && Date.now() < overlayDoneAt(o)) return null;
  const m = round.mover;
  if (m.kind === 'step') return 'This board moves one space at a time: pick the way in the host panel';
  // At a fork: the way first (a roll now would do nothing). This turn's move made: a roll now would be moved again by
  // Enter (an extra move: type the number of spaces). The same for a wheel as for dice.
  const { bs } = boardNow(game, session);
  if (bs?.fork) return `${playerName(session, bs.fork.playerId)} is at a fork: pick which way first (${Math.abs(bs.fork.stepsLeft)} to go)`;
  const last = bs?.last;
  if (bs && last && last.playerId === currentPlayer(bs) && (last.turn ?? 0) === (bs.turns ?? 0))
    return `${playerName(session, last.playerId)} already moved this turn: N for the next turn (or type a number to move again)`;
  if (m.kind === 'wheel') {
    const w = game.wheels.find((x) => x.id === m.wheel);
    if (!w) return 'The movement wheel no longer exists: pick one in the editor';
    // One press spins it (opened afresh, unless it's on screen waiting for a spin).
    if (!(o?.kind === 'wheel' && o.wheelId === w.id && !o.spin)) openWheel(live, session, w);
    const on = live.overlay;
    if (on?.kind === 'wheel' && wheelSpentUp(on, session, game)) return 'Every slice of the movement wheel has landed: Restore them to spin again';
    spinWheel(live, session, game);
    return null;
  }
  const preset = moverPreset(game, round);
  if (preset) rollDice(live, session, preset, true);
  else {
    const d = parseDice(m.dice) ?? { sides: 6, count: 1 };
    rollDice(live, session, quickDice(d.sides, d.count, moverDiceName(game, round)), true);
  }
  return null;
}
