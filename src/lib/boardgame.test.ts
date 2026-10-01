import { describe, expect, it } from 'vitest';
import { newGame, type BoardGameRound, type Game } from './model';
import { newSession } from './session';
import {
  waysOn, ensureBoard, movePlayer, moveInOrder, newBoardGameRound, newBoardSpace, nextSpaceName, nextTurn, sendTo, shownSpace, HOP_MS, walk, waysNow, currentPlayer,
  boardGameProblems, rimSpots,
} from './boardgame';

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

  it('going back into a space two ways lead to, asks which way back and goes that way', () => {
    const { game, round, ids } = setup();
    const session = newSession(game);
    const bs = ensureBoard(session, game, round);
    const cut = round.spaces.at(-1)!;
    sendTo(bs, ['a'], { space: ids[5] });
    expect(movePlayer(round, bs, 'a', -1)).toBe('At Space 6: which way? (1 to go)');
    expect(bs.fork).toEqual({ playerId: 'a', at: ids[5], stepsLeft: -1 });
    // The host panel offers the ways the move saw: back to Space 5, or back along the Shortcut.
    expect(waysOn(round, ids[5], bs.prev?.a, bs.fork!.stepsLeft < 0)).toEqual([ids[4], cut.id]);
    expect(movePlayer(round, bs, 'a', bs.fork!.stepsLeft, cut.id)).toBe('Landed on Shortcut');
    expect(bs.fork).toBeUndefined();
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

  it('passes the turn on when the player whose turn it is leaves', () => {
    const { game, round } = setup();
    game.players.push({ id: 'c', name: 'Cat', color: '#4363d8' });
    const session = newSession(game);
    const bs = ensureBoard(session, game, round);
    nextTurn(bs);
    session.players = session.players.filter((p) => p.id !== 'b');
    ensureBoard(session, game, round);
    expect(currentPlayer(bs)).toBe('c');
    // The last in the order: the turn goes round to the first.
    session.players.push({ id: 'd', name: 'Dee', color: '#f58231', startScore: 0 });
    ensureBoard(session, game, round);
    nextTurn(bs);
    expect(currentPlayer(bs)).toBe('d');
    session.players = session.players.filter((p) => p.id !== 'd');
    ensureBoard(session, game, round);
    expect(currentPlayer(bs)).toBe('a');
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

  it('knows which spaces the host can click to move on: a one-space board’s ways, or a fork’s', () => {
    const { round, bs, A, B, C } = line();
    // One space a turn, from A: only B.
    expect(waysNow(round, bs)).toEqual({ playerId: 'a', steps: 1, ways: [B.id] });
    movePlayer(round, bs, 'a', 1, B.id);
    expect(waysNow(round, bs)?.ways).toEqual([C.id]);
    // A dice board has none, until a move stops at a fork.
    round.mover = { kind: 'dice', dice: 'd6' };
    expect(waysNow(round, bs)).toBeNull();
    sendTo(bs, ['a'], { space: B.id });
    movePlayer(round, bs, 'a', 3);
    expect(waysNow(round, bs)).toEqual({ playerId: 'a', steps: 3, ways: [A.id, C.id] });
  });
});

describe('board game: turn order', () => {
  it('moves a player to another place in the order, and whoever’s turn it is keeps it', () => {
    const { game, round } = setup();
    game.players.push({ id: 'c', name: 'Cat', color: '#4363d8' }, { id: 'd', name: 'Dan', color: '#f58231' });
    const bs = ensureBoard(newSession(game), game, round);
    nextTurn(bs);
    expect(currentPlayer(bs)).toBe('b');
    moveInOrder(bs, 3, 0);
    expect(bs.order).toEqual(['d', 'a', 'b', 'c']);
    expect(currentPlayer(bs)).toBe('b');
    moveInOrder(bs, 2, 3);
    expect(bs.order).toEqual(['d', 'a', 'c', 'b']);
    expect(currentPlayer(bs)).toBe('b');
    // Out of range: nothing moves.
    moveInOrder(bs, 0, 4);
    expect(bs.order).toEqual(['d', 'a', 'c', 'b']);
  });
});


describe('board game: tokens on a space', () => {
  it('sit along the top of its rim, clear of its number and name, and apart from each other', () => {
    for (const [n, r] of [[1, 42], [2, 42], [3, 42], [4, 32], [6, 32], [8, 32]]) {
      const spots = rimSpots(n, r);
      expect(spots).toHaveLength(n);
      for (const s of spots) {
        // Out past the space's middle (its number), and never below its sides (its name is under it).
        expect(Math.hypot(s.dx, s.dy)).toBeGreaterThanOrEqual(58 + r - 13);
        expect(s.dy).toBeLessThanOrEqual(r);
      }
      for (let i = 1; i < n; i++) expect(Math.hypot(spots[i].dx - spots[i - 1].dx, spots[i].dy - spots[i - 1].dy)).toBeGreaterThanOrEqual(2 * r - 1);
    }
    expect(rimSpots(1, 42)[0]).toEqual({ dx: 0, dy: -88 });
  });
});
