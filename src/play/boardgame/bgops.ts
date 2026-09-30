// The board-game host's moves, shared by the host panel and the keyboard shortcuts. Every change is one undoable step.
import { currentPlayer, movePlayer, nextTurn } from '../../lib/boardgame';
import { isBoardGame, type Game, type Session } from '../../lib/model';
import { logged } from '../../lib/toolset';
import { openWheel, quickDice, rollDice } from '../../lib/overlay';
import { parseDice } from '../../lib/tools';
import type { Live } from '../../lib/live';

/** The board-game round being played and its state (undefined outside one). */
export function boardNow(game: Game, session: Session) {
  const round = game.rounds[session.currentRound];
  if (session.phase !== 'boardgame' || !isBoardGame(round)) return {};
  // goToRound set the state up (reading only: this runs inside derived values).
  return { round, bs: session.boardgames?.[round.id] };
}

export const playerName = (session: Session, id: string | undefined) => session.players.find((p) => p.id === id)?.name ?? '?';

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

export function turnNow(game: Game, session: Session, delta = 1): void {
  const { bs } = boardNow(game, session);
  if (!bs) return;
  logged(session, delta > 0 ? 'Next turn' : 'Previous turn', () => {
    nextTurn(bs, delta);
    bs.last = undefined;
  });
}

/** Roll the round's dice or open its wheel for a move. Returns why it couldn't, or null. */
export function rollMover(game: Game, session: Session, live: Live): string | null {
  const { round } = boardNow(game, session);
  if (!round) return 'No board';
  const m = round.mover;
  if (m.kind === 'wheel') {
    const w = game.wheels.find((x) => x.id === m.wheel);
    if (!w) return 'The movement wheel no longer exists: pick one in the editor';
    openWheel(live, session, w);
    return null;
  }
  const preset = game.dice.find((d) => d.name === m.dice || d.id === m.dice);
  if (preset) rollDice(live, session, preset);
  else {
    const d = parseDice(m.dice) ?? { sides: 6, count: 1 };
    rollDice(live, session, quickDice(d.sides, d.count, m.dice || 'd6'));
  }
  return null;
}
