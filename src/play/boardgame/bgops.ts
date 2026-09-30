// The board-game host's moves, shared by the host panel, the stage and the keyboard shortcuts. Every change is one
// undoable step.
import { describeAction, runAction } from '../../lib/actions';
import { currentPlayer, moveInOrder, movePlayer, nextTurn, sendTo, spaceById } from '../../lib/boardgame';
import { isBoardGame, type BoardGameRound, type BoardGameState, type BoardSpace, type BoardZone, type Game, type Session } from '../../lib/model';
import { logged } from '../../lib/toolset';
import { openWheel, quickDice, rollDice, spinWheel } from '../../lib/overlay';
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
  const text = `${moving.map((w) => playerName(session, w)).join(', ')} → ${where}`;
  logged(session, text, () => sendTo(bs, moving, to));
  return text;
}

/** Make it a player's turn (a way to pick at a fork is dropped). */
export function setTurn(game: Game, session: Session, playerId: string): void {
  const { bs } = boardNow(game, session);
  const i = bs?.order.indexOf(playerId) ?? -1;
  if (!bs || i < 0 || i === bs.turn) return;
  logged(session, `${playerName(session, playerId)}'s turn`, () => {
    bs.turn = i;
    bs.fork = undefined;
  });
}

/** Move a player to another place in the turn order; whoever's turn it is keeps it. */
export function reorderTurns(game: Game, session: Session, from: number, to: number): void {
  const { bs } = boardNow(game, session);
  if (!bs || from === to || to < 0 || to >= bs.order.length) return;
  logged(session, 'Turn order', () => moveInOrder(bs, from, to));
}

/**
 * Run a space's landing (or passing) actions for some players, as one step, as if they'd just landed there. Returns
 * what to tell the host.
 */
export function runSpace(game: Game, session: Session, live: Live, space: BoardSpace, who: string[], which: 'onLand' | 'onPass' = 'onLand'): string {
  const { round, bs } = boardNow(game, session);
  const list = space[which] ?? [];
  if (!round || !bs || !list.length) return `${space.name} has no actions`;
  let said: string[] = [];
  const ctx = { game, session, live, board: round, bs, selected: who, chosen: who };
  logged(session, `${space.name}: ${list.map((a) => describeAction(game, a)).join(', ')}`, () => {
    said = list.map((a) => runAction(ctx, a, `${space.name}: ${describeAction(game, a)}`));
  });
  return said.join(' · ');
}

export function turnNow(game: Game, session: Session, delta = 1): void {
  const { bs } = boardNow(game, session);
  if (!bs) return;
  logged(session, delta > 0 ? 'Next turn' : 'Previous turn', () => {
    nextTurn(bs, delta);
    bs.last = undefined;
  });
}

/** Roll the round's dice, or open its wheel (then spin it) for a move. Returns why it couldn't, or null. */
export function rollMover(game: Game, session: Session, live: Live): string | null {
  const { round } = boardNow(game, session);
  if (!round) return 'No board';
  // Still rolling or spinning: D again waits for it, like Roll again.
  const o = live.overlay;
  if ((o?.kind === 'dice' || o?.kind === 'wheel') && Date.now() < overlayDoneAt(o)) return null;
  const m = round.mover;
  if (m.kind === 'wheel') {
    const w = game.wheels.find((x) => x.id === m.wheel);
    if (!w) return 'The movement wheel no longer exists: pick one in the editor';
    // D again (or 🎡 Spin to move again) spins the wheel it opened.
    if (o?.kind === 'wheel' && o.wheelId === w.id && !o.spin) spinWheel(live, session, game);
    else openWheel(live, session, w);
    return null;
  }
  if (m.kind === 'step') return 'This board moves one space at a time: pick the way in the host panel';
  const preset = game.dice.find((d) => d.name === m.dice || d.id === m.dice);
  if (preset) rollDice(live, session, preset);
  else {
    const d = parseDice(m.dice) ?? { sides: 6, count: 1 };
    rollDice(live, session, quickDice(d.sides, d.count, m.dice || 'd6'));
  }
  return null;
}
