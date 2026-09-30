import { describe, expect, it } from 'vitest';
import { newGame } from '../../lib/model';
import { newLive } from '../../lib/live';
import { newBoardGameRound } from '../../lib/boardgame';
import { goToRound, newSession } from '../../lib/session';
import { newWheel } from '../../lib/tools';
import { undoAction } from '../../lib/toolset';
import { reorderTurns, rollMover, runSpace, sendNow, setTurn } from './bgops';

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
    const spin = live.overlay?.kind === 'wheel' ? live.overlay.spin : undefined;
    expect(spin).toBeTruthy();
    // Mid-spin, D again waits for it.
    rollMover(game, session, live);
    expect(live.overlay).toBe(opened);
    expect(live.overlay?.kind === 'wheel' && live.overlay.spin).toBe(spin);
    // Once it has landed, D opens it afresh for the next move.
    spin!.startedAt -= spin!.duration;
    rollMover(game, session, live);
    expect(live.overlay).not.toBe(opened);
  });

  it('waits for the dice to land before D rolls again', () => {
    const game = newGame();
    game.players = [{ id: 'a', name: 'Ann', color: '#e6194b' }];
    game.rounds.push(newBoardGameRound('Board'));
    const session = newSession(game);
    goToRound(session, game, 0);
    const live = newLive();
    rollMover(game, session, live);
    const rolled = live.overlay;
    expect(rolled?.kind === 'dice' && !!rolled.roll).toBe(true);
    rollMover(game, session, live);
    expect(live.overlay).toBe(rolled);
    expect(session.rollLog).toHaveLength(1);
    if (rolled?.kind === 'dice') rolled.startedAt -= rolled.duration;
    rollMover(game, session, live);
    expect(session.rollLog).toHaveLength(2);
  });
});

describe('board game: the host’s moves on the stage', () => {
  /** A board with three players and a Shadow Realm, being played. */
  function playing() {
    const game = newGame();
    game.players = ['Ann', 'Bob', 'Cat'].map((name, i) => ({ id: 'abc'[i], name, color: '#e6194b' }));
    const round = newBoardGameRound('Board');
    round.zones.push({ id: 'shadow', name: 'Shadow Realm', slide: { background: {}, elements: [] } });
    game.rounds.push(round);
    const session = newSession(game);
    goToRound(session, game, 0);
    const bs = () => session.boardgames![round.id];
    return { game, session, round, bs };
  }

  it('sends players dropped on a space or a zone there, as one step', () => {
    const { game, session, round, bs } = playing();
    const s5 = round.spaces[4];
    expect(sendNow(game, session, ['a', 'b'], { space: s5.id })).toBe('Ann, Bob → Space 5');
    expect([bs().positions.a, bs().positions.b]).toEqual([{ space: s5.id }, { space: s5.id }]);
    expect(sendNow(game, session, ['c'], { zone: 'shadow' })).toBe('Cat → Shadow Realm');
    expect(bs().positions.c).toEqual({ zone: 'shadow' });
    expect(sendNow(game, session, ['c'], { space: 'gone' })).toBeNull();
    // Already there: nothing to do (dropped back on their own space).
    expect(sendNow(game, session, ['a'], { space: s5.id })).toBeNull();
    expect(sendNow(game, session, ['a', 'c'], { zone: 'shadow' })).toBe('Ann → Shadow Realm');
    undoAction(session, game);
    undoAction(session, game);
    expect(bs().positions.c).toEqual({ space: round.spaces[0].id });
  });

  it('makes it someone’s turn, and reorders the turns keeping whose turn it is', () => {
    const { game, session, bs } = playing();
    setTurn(game, session, 'c');
    expect(bs().order[bs().turn]).toBe('c');
    expect(session.actionLog?.at(-1)?.text).toBe("Cat's turn");
    reorderTurns(game, session, 2, 0);
    expect(bs().order).toEqual(['c', 'a', 'b']);
    expect(bs().order[bs().turn]).toBe('c');
    undoAction(session, game);
    expect(bs().order).toEqual(['a', 'b', 'c']);
  });

  it('runs a space’s landing actions for some players as one step', () => {
    const { game, session, round } = playing();
    const sp = round.spaces[2];
    expect(runSpace(game, session, newLive(), sp, ['a'])).toBe('Space 3 has no actions');
    sp.onLand = [
      { id: 'x', do: 'score', amount: 100, who: 'ask' },
      { id: 'y', do: 'score', amount: 50, who: 'ask' },
    ];
    runSpace(game, session, newLive(), sp, ['a', 'b']);
    expect(session.scoreLog.map((e) => [e.playerId, e.delta])).toEqual([['a', 100], ['b', 100], ['a', 50], ['b', 50]]);
    expect(session.actionLog?.at(-1)?.text).toBe('Space 3: +$100, +$50');
    // One Undo takes the lot back.
    undoAction(session, game);
    expect(session.scoreLog).toEqual([]);
  });
});
