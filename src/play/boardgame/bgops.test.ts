import { describe, expect, it, vi } from 'vitest';
import { announce } from '../../lib/announce';
import { newGame } from '../../lib/model';
import { newLive } from '../../lib/live';
import { ensureBoard, movePlayer, newBoardGameRound } from '../../lib/boardgame';
import { goToRound, newSession } from '../../lib/session';
import { newWheel } from '../../lib/tools';
import { forgetGameParts, redoAction, undoAction } from '../../lib/toolset';
import { runAction } from '../../lib/actions';
import type { Action } from '../../lib/model';
import { moverResult, reorderTurns, rollMover, runSpace, sendNow, setTurn, turnNow } from './bgops';
import { openPlayerWheel, quickDice, rollDice, toggleScoreboard } from '../../lib/overlay';

// (What screen readers are told.)
vi.mock('../../lib/announce', async (real) => ({ ...(await real<typeof import('../../lib/announce')>()), announce: vi.fn() }));

describe('board game: the round’s mover', () => {
  it('a wheel move is one per turn, as a dice one is; a slice saying “Back 2” moves back', () => {
    const game = newGame();
    game.players = [{ id: 'a', name: 'Ann', color: '#e6194b' }];
    const wheel = newWheel('Move', ['Back 2']);
    game.wheels.push(wheel);
    const round = newBoardGameRound('Board');
    round.mover = { kind: 'wheel', wheel: wheel.id };
    game.rounds.push(round);
    const session = newSession(game);
    goToRound(session, game, 0);
    const live = newLive();
    rollMover(game, session, live);
    expect(moverResult(game, round, live.overlay)).toBe(-2);
    const bs = session.boardgames![round.id];
    movePlayer(round, bs, 'a', 3);
    const o = live.overlay;
    if (o?.kind === 'wheel' && o.spin) o.spin.startedAt -= o.spin.duration;
    expect(rollMover(game, session, live)).toMatch(/already moved this turn/);
  });

  it('spins the movement wheel with one press of D', () => {
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
    expect(opened?.kind === 'wheel' && !!opened.spin).toBe(true);
    // Its slice is the count to move.
    expect(moverResult(game, round, live.overlay)).toBe(opened?.kind === 'wheel' ? Number(opened.segments[opened.result!].label) : null);
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
    // The scores put up over them (S): they're still rolling under there, and come back with S.
    toggleScoreboard(live);
    expect(rollMover(game, session, live)).toMatch(/Still rolling/);
    expect(session.rollLog).toHaveLength(1);
    toggleScoreboard(live);
    expect(live.overlay).toBe(rolled);
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
    expect(sendNow(game, session, ['a', 'b'], { space: s5.id })).toBe('Ann & Bob → Space 5');
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
    expect(session.actionLog?.at(-1)?.text).toBe('Cat’s turn');
    reorderTurns(game, session, 2, 0);
    expect(bs().order).toEqual(['c', 'a', 'b']);
    expect(bs().order[bs().turn]).toBe('c');
    expect(session.actionLog?.at(-1)?.text).toBe('Turn order: Cat → Ann → Bob');
    undoAction(session, game);
    expect(bs().order).toEqual(['a', 'b', 'c']);
  });

  it('says whose turn it is in the history, going on or back', () => {
    const { game, session, bs } = playing();
    turnNow(game, session);
    expect([bs().order[bs().turn], session.actionLog?.at(-1)?.text]).toEqual(['b', 'Bob’s turn']);
    turnNow(game, session, -1);
    turnNow(game, session, -1);
    // Back from the first player: the last one's turn.
    expect([bs().order[bs().turn], session.actionLog?.at(-1)?.text]).toEqual(['c', 'Cat’s turn']);
  });

  it('Start (or Run all) on a space with a roll in it runs just the roll: the host presses the outcome', () => {
    const { game, session, round } = playing();
    const sp = round.spaces[2];
    sp.onLand = [
      { id: 'd', do: 'dice', dice: '1d6' },
      { id: 'w', do: 'score', amount: 200, who: 'ask' },
      { id: 'l', do: 'score', amount: -100, who: 'ask' },
    ];
    const live = newLive();
    expect(runSpace(game, session, live, sp, ['a'])).toMatch(/then press the outcome$/);
    expect(live.overlay?.kind).toBe('dice');
    expect(session.scoreLog).toEqual([]);
  });

  it('going back past Start is no pass of it; a player who left takes their last move’s buttons with them', () => {
    const { game, session, round, bs } = playing();
    const start = round.spaces[0];
    start.onPass = [{ id: 'p', do: 'score', amount: 200, who: 'ask' }];
    bs().positions.a = { space: round.spaces[1].id };
    movePlayer(round, bs(), 'a', -3);
    expect(bs().last?.passed ?? []).not.toContain(start.id);
    session.players = session.players.filter((p) => p.id !== 'a');
    ensureBoard(session, game, round);
    expect(bs().last).toBeUndefined();
  });

  it('after “Resume with my edits”, the steps forget the boards and screens they kept (Undo leaves the edits alone)', () => {
    const { session } = playing();
    session.actionLog = [{ id: 's', ts: 0, text: 'x', before: JSON.stringify({ 'board:r': { spaces: [] }, 'screen:w/m/s': {}, 'map:w/m': {}, stats: { a: 1 } }), after: JSON.stringify({ 'board:r': { spaces: [1] }, stats: { a: 2 } }) }];
    forgetGameParts(session);
    expect(JSON.parse(session.actionLog[0].before)).toEqual({ stats: { a: 1 } });
    expect(JSON.parse(session.actionLog[0].after!)).toEqual({ stats: { a: 2 } });
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

  it('moves players by some spaces, makes them miss turns and lets them roll again, each undoable', () => {
    const { game, session, round, bs } = playing();
    const run = (a: Action, chosen: string[] = []) =>
      runAction({ game, session, live: newLive(), board: round, bs: bs(), selected: [], chosen }, a);
    // Ann is on Start; forward 3 then back 1 (unset who: whoever's turn it is).
    expect(run({ id: '1', do: 'steps', steps: 3 })).toBe('Forward 3 spaces: Ann · Landed on Space 4');
    expect(bs().positions.a).toEqual({ space: round.spaces[3].id });
    run({ id: '2', do: 'steps', steps: -1, who: 'party' });
    expect(bs().positions.a).toEqual({ space: round.spaces[2].id });
    // Back past Start goes round the loop.
    run({ id: '3', do: 'steps', steps: -2, who: 'ask' }, ['b']);
    expect(bs().positions.b).toEqual({ space: round.spaces[10].id });
    undoAction(session, game);
    expect(bs().positions.b).toEqual({ space: round.spaces[0].id });
    redoAction(session, game);
    expect(bs().positions.b).toEqual({ space: round.spaces[10].id });

    // Bob misses his next turn: Ann's ends, and it's Cat's.
    expect(run({ id: '4', do: 'skip', who: 'ask' }, ['b'])).toBe('Skip next turn: Bob');
    // (What the host is told: it isn't simply the next player's turn.)
    expect(turnNow(game, session)).toBe('Cat’s turn (Bob skips a turn)');
    expect(bs().order[bs().turn]).toBe('c');
    expect(session.actionLog?.at(-1)?.text).toBe('Cat’s turn (Bob skips a turn)');
    expect(bs().skips).toBeUndefined();
    // Undoing the turn puts the skip back.
    undoAction(session, game);
    expect([bs().order[bs().turn], bs().skips]).toEqual(['a', { b: 1 }]);
    turnNow(game, session);

    // Cat rolls again: Next turn stays with her, once.
    expect(run({ id: '5', do: 'again' })).toBe('Roll again: Cat');
    expect(turnNow(game, session)).toBe('Cat’s turn again');
    expect([bs().order[bs().turn], session.actionLog?.at(-1)?.text]).toEqual(['c', 'Cat’s turn again']);
    // An ordinary next turn: nothing to say (screen readers are still told whose turn it is).
    expect(turnNow(game, session)).toBeNull();
    expect(bs().order[bs().turn]).toBe('a');
    expect(announce).toHaveBeenLastCalledWith('Ann’s turn');
  });

  it('only runs the board-game actions in a board-game round', () => {
    const { game, session } = playing();
    expect(runAction({ game, session, live: newLive(), selected: ['a'] }, { id: 'x', do: 'skip' })).toBe('This works only in board-game rounds');
  });
});

describe('board game: what fills the Steps box', () => {
  it('only the round’s own dice or movement wheel', () => {
    const game = newGame();
    game.players = [{ id: 'a', name: 'Ann', color: '#e6194b' }];
    const round = newBoardGameRound('Board');
    round.mover = { kind: 'dice', dice: '2d6' };
    game.rounds.push(round);
    const session = newSession(game);
    goToRound(session, game, 0);
    const live = newLive();
    rollMover(game, session, live);
    const o = live.overlay;
    expect(moverResult(game, round, o)).toBe(o?.kind === 'dice' ? o.roll!.total : -1);
    // A space's "Roll d20", or the Pick-a-player wheel landing on "Player 3": not a move.
    rollDice(live, session, quickDice(20, 1, 'd20'));
    expect(moverResult(game, round, live.overlay)).toBeNull();
    // Nor a space's "Roll 2d6" with the same dice as the movement roll.
    rollDice(live, session, quickDice(6, 2, '2d6'));
    expect(moverResult(game, round, live.overlay)).toBeNull();
    game.players.push({ id: 'b', name: 'Player 3', color: '#000' });
    openPlayerWheel(live, session);
    if (live.overlay?.kind === 'wheel') Object.assign(live.overlay, { spin: { from: 0, to: 1, startedAt: 0, duration: 1 }, result: 1 });
    expect(moverResult(game, round, live.overlay)).toBeNull();
  });
});
