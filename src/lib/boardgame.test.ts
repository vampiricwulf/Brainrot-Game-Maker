import { describe, expect, it } from 'vitest';
import { newGame, type BoardGameRound, type Game } from './model';
import { newSession } from './session';
import { waysOn, ensureBoard, movePlayer, newBoardGameRound, newBoardSpace, nextSpaceName, nextTurn, sendTo, shownSpace, HOP_MS, walk, currentPlayer, boardGameProblems } from './boardgame';

/** A loop of 12 plus a fork: space 3 can also go to a shortcut that rejoins at space 6. */
function setup(): { game: Game; round: BoardGameRound; ids: string[] } {
  const game = newGame();
  game.players = [
    { id: 'a', name: 'Ann', color: '#e6194b' },
    { id: 'b', name: 'Bob', color: '#3cb44b' },
  ];
  const round = newBoardGameRound('Board');
  const ids = round.spaces.map((s) => s.id);
  const cut = newBoardSpace(900, 540, 'Shortcut');
  cut.next = [ids[5]];
  round.spaces.push(cut);
  round.spaces[2].next.push(cut.id);
  round.zones.push({ id: 'shadow', name: 'Shadow Realm', slide: { background: {}, elements: [] } });
  game.rounds.push(round);
  return { game, round, ids };
}

describe('board game: moving', () => {
  it('starts everyone on Start, in player order', () => {
    const { game, round, ids } = setup();
    const session = newSession(game);
    const bs = ensureBoard(session, game, round);
    expect(bs.positions).toEqual({ a: { space: ids[0] }, b: { space: ids[0] } });
    expect(bs.order).toEqual(['a', 'b']);
    expect(currentPlayer(bs)).toBe('a');
    nextTurn(bs);
    nextTurn(bs);
    expect(currentPlayer(bs)).toBe('a');
    nextTurn(bs, -1);
    expect(currentPlayer(bs)).toBe('b');
  });

  it('steps along the loop, remembering the spaces passed and the one landed on', () => {
    const { game, round, ids } = setup();
    const session = newSession(game);
    const bs = ensureBoard(session, game, round);
    // Start is the 12th step around: from space 10, 4 steps pass 11, 12 and Start, and land on space 2.
    sendTo(bs, ['a'], { space: ids[9] });
    expect(movePlayer(round, bs, 'a', 4)).toBe('Landed on Space 2');
    expect(bs.last).toEqual({ playerId: 'a', passed: [ids[10], ids[11], ids[0]], landed: ids[1] });
    expect(bs.hop?.path).toEqual([ids[9], ids[10], ids[11], ids[0], ids[1]]);
  });

  it('stops at a fork and goes on the way the host picks', () => {
    const { game, round, ids } = setup();
    const session = newSession(game);
    const bs = ensureBoard(session, game, round);
    const cut = round.spaces.at(-1)!;
    expect(movePlayer(round, bs, 'a', 5)).toBe('At Space 3: which way? (3 to go)');
    expect(bs.fork).toEqual({ playerId: 'a', at: ids[2], stepsLeft: 3 });
    expect(bs.positions.a.space).toBe(ids[2]);
    expect(movePlayer(round, bs, 'a', bs.fork!.stepsLeft, cut.id)).toBe('Landed on Space 7');
    expect(bs.fork).toBeUndefined();
    // Passed on the whole move: Space 2, Space 3 (the fork), the Shortcut, Space 6.
    expect(bs.last).toEqual({ playerId: 'a', passed: [ids[1], ids[2], cut.id, ids[5]], landed: ids[6] });
  });

  it('moves backwards, and shows the move one space at a time', () => {
    const { game, round, ids } = setup();
    const session = newSession(game);
    const bs = ensureBoard(session, game, round);
    movePlayer(round, bs, 'b', -2);
    expect(bs.positions.b.space).toBe(ids[10]);
    const at = bs.hop!.at;
    expect(shownSpace(bs, 'b', at)).toBe(ids[0]);
    expect(shownSpace(bs, 'b', at + HOP_MS)).toBe(ids[11]);
    expect(shownSpace(bs, 'b', at + HOP_MS * 5)).toBe(ids[10]);
    expect(walk(round, ids[0], 0).path).toEqual([]);
  });

  it('sends players to an off-board zone and back', () => {
    const { game, round, ids } = setup();
    const session = newSession(game);
    const bs = ensureBoard(session, game, round);
    sendTo(bs, ['a', 'b'], { zone: 'shadow' });
    expect(bs.positions.a).toEqual({ zone: 'shadow' });
    expect(movePlayer(round, bs, 'a', 3)).toMatch(/aren’t on the board/);
    sendTo(bs, ['a'], { space: ids[4] });
    expect(bs.positions.a).toEqual({ space: ids[4] });
  });

  it('keeps the turn with the same player when players join or leave', () => {
    const { game, round } = setup();
    const session = newSession(game);
    const bs = ensureBoard(session, game, round);
    nextTurn(bs);
    session.players = session.players.filter((p) => p.id !== 'a');
    session.players.push({ id: 'c', name: 'Cat', color: '#4363d8', startScore: 0 });
    ensureBoard(session, game, round);
    expect(bs.order).toEqual(['b', 'c']);
    expect(currentPlayer(bs)).toBe('b');
  });

  it('flags a board that is too small, and paths that end', () => {
    const { game, round } = setup();
    expect(boardGameProblems(game, round, 'Board', 1)).toEqual([]);
    round.spaces.at(-1)!.next = [];
    expect(boardGameProblems(game, round, 'Board', 1)[0].text).toContain('Shortcut lead nowhere');
  });

  it('flags Send to buttons whose space or zone was deleted', () => {
    const { game, round, ids } = setup();
    round.spaces[4].onLand = [
      { id: 'z', do: 'goto', zone: 'shadow', who: 'ask' },
      { id: 's', do: 'goto', space: ids[7], who: 'ask' },
    ];
    expect(boardGameProblems(game, round, 'Board', 1)).toEqual([]);
    round.zones = [];
    round.spaces = round.spaces.filter((s) => s.id !== ids[7]);
    expect(boardGameProblems(game, round, 'Board', 1).map((p) => p.text)).toContain('Board: 2 button(s) on spaces point nowhere');
  });

  it('names new spaces with a number no space has yet', () => {
    const { round } = setup();
    expect(nextSpaceName(round)).toBe('Space 14'); // 12 around the loop, plus the shortcut
    round.spaces = round.spaces.filter((s) => s.name !== 'Space 3' && s.name !== 'Shortcut');
    expect(nextSpaceName(round)).toBe('Space 13');
  });
});

describe('board game: two-way links and one space at a time', () => {
  /** A line A ↔ B ↔ C, with C also leading on to D. */
  function line() {
    const game = newGame();
    game.players = [{ id: 'a', name: 'Ann', color: '#e6194b' }];
    const round = newBoardGameRound('Line');
    const [A, B, C, D] = ['A', 'B', 'C', 'D'].map((n, i) => newBoardSpace(200 + i * 300, 500, n));
    A.next = [B.id];
    B.next = [A.id, C.id];
    C.next = [B.id, D.id];
    round.spaces = [A, B, C, D];
    round.mover = { kind: 'step' };
    game.rounds.push(round);
    const session = newSession(game);
    return { round, bs: ensureBoard(session, game, round), A, B, C, D };
  }

  it('never walks straight back along a two-way link unless it is the only way', () => {
    const { round, bs, A, B, C, D } = line();
    expect(movePlayer(round, bs, 'a', 2)).toBe('Landed on C');
    expect(waysOn(round, C.id, bs.prev?.a)).toEqual([D.id]);
    // From D (a dead end) nothing; sent back to B from A's side, the only onward way is C.
    expect(waysOn(round, B.id, A.id)).toEqual([C.id]);
    // Teleported: every way is open again.
    sendTo(bs, ['a'], { space: B.id });
    expect(waysOn(round, B.id, bs.prev?.a)).toEqual([A.id, C.id]);
    // One space, picking the way.
    expect(movePlayer(round, bs, 'a', 1, A.id)).toBe('Landed on A');
    // At A the only link is back to B, so it may turn around.
    expect(waysOn(round, A.id, bs.prev?.a)).toEqual([B.id]);
  });
});

