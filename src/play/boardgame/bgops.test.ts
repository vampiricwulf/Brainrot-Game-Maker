import { describe, expect, it } from 'vitest';
import { newGame } from '../../lib/model';
import { newLive } from '../../lib/live';
import { newBoardGameRound } from '../../lib/boardgame';
import { goToRound, newSession } from '../../lib/session';
import { newWheel } from '../../lib/tools';
import { rollMover } from './bgops';

describe('board game: the round’s mover', () => {
  it('opens a movement wheel with D, and spins it with D again', () => {
    const game = newGame();
    game.players = [{ id: 'a', name: 'Ann', color: '#e6194b' }];
    const wheel = newWheel('Move', ['1', '2', '3']);
    game.wheels.push(wheel);
    const round = newBoardGameRound('Board');
    round.mover = { kind: 'wheel', wheel: wheel.id };
    game.rounds.push(round);
    const session = newSession(game);
    goToRound(session, game, 0);
    const live = newLive();
    expect(rollMover(game, session, live)).toBeNull();
    const opened = live.overlay;
    expect(opened?.kind === 'wheel' && !opened.spin).toBe(true);
    rollMover(game, session, live);
    expect(live.overlay).toBe(opened);
    expect(live.overlay?.kind === 'wheel' && !!live.overlay.spin).toBe(true);
    // Once it has landed, D opens it afresh for the next move.
    rollMover(game, session, live);
    expect(live.overlay).not.toBe(opened);
  });
});
