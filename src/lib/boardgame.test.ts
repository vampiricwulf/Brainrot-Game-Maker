import { describe, expect, it } from 'vitest';
import { linkMoverDice, newGame, type BoardGameRound, type BoardGameState, type Game } from './model';
import { newSession } from './session';
import {
  waysOn, ensureBoard, movePlayer, moveInOrder, newBoardGameRound, newBoardSpace, nextSpaceName, nextTurn, skipTurns, sendTo, shownSpace, HOP_MS, walk, waysNow, currentPlayer,
  boardGameProblems, moverPreset, rimSpots, spaceNumber, spaceToward,
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
    // One end is the finish (a race to it): fine.
    round.spaces.at(-1)!.next = [];
    expect(boardGameProblems(game, round, 'Board', 1)).toEqual([]);
    // Two, and players get stuck at one: the line names them and goes to the first.
    round.spaces[8].next = [];
    expect(boardGameProblems(game, round, 'Board', 1)).toEqual([
      { text: 'Board: the path ends at “Space 9” and “Shortcut” (players stop there)', tab: 1, level: 'info', place: { tab: 'round', round: round.id, part: { kind: 'space', space: round.spaces[8].id } } },
    ]);
  });

  it('links the movement dice by id: a rename keeps them, a delete is on the checklist', () => {
    const { game, round } = setup();
    game.dice.push({ id: 'big', name: 'Big dice', showTotal: true, dice: [{ id: 'd', sides: 6, count: 2 }] });
    // A game saved before: the dice by name. Opening it links them, once.
    round.mover = { kind: 'dice', dice: 'Big dice' };
    linkMoverDice(game);
    expect(round.mover).toEqual({ kind: 'dice', dice: 'Big dice', diceId: 'big' });
    game.dice[0].name = 'Huge dice';
    expect(moverPreset(game, round)?.name).toBe('Huge dice');
    linkMoverDice(game);
    expect(round.mover).toEqual({ kind: 'dice', dice: 'Big dice', diceId: 'big' });
    expect(boardGameProblems(game, round, 'Board', 1)).toEqual([]);
    game.dice = [];
    expect(moverPreset(game, round)).toBeUndefined();
    expect(boardGameProblems(game, round, 'Board', 1).map((p) => p.text)).toEqual(['Board: the movement dice no longer exist (pick others in Move by)']);
    // Standard dice typed in aren't linked to anything.
    round.mover = { kind: 'dice', dice: '2d6' };
    linkMoverDice(game);
    expect(round.mover).toEqual({ kind: 'dice', dice: '2d6' });
    expect(boardGameProblems(game, round, 'Board', 1)).toEqual([]);
    // Old games that named the dice by id link them too.
    game.dice.push({ id: 'old', name: 'Old', showTotal: false, dice: [{ id: 'd', sides: 4, count: 1 }] });
    round.mover = { kind: 'dice', dice: 'old' };
    linkMoverDice(game);
    expect(round.mover).toEqual({ kind: 'dice', dice: 'Old', diceId: 'old' });
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
    expect(boardGameProblems(game, round, 'Board', 1).map((p) => p.text)).toContain('Board: 2 buttons on spaces point nowhere (on “Space 5”)');
    round.spaces[4].onLand!.pop();
    expect(boardGameProblems(game, round, 'Board', 1).find((p) => p.text.includes('button'))).toEqual({
      text: 'Board: a button on “Space 5” points nowhere',
      tab: 1,
      level: 'warn',
      place: { tab: 'round', round: round.id, part: { kind: 'space', space: ids[4] } },
    });
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

describe('board game: skipped turns and rolling again', () => {
  const state = () => ({ positions: {}, order: ['a', 'b', 'c'], turn: 0 }) as BoardGameState;

  it('passes over players who skip, one turn each time', () => {
    const bs = state();
    skipTurns(bs, ['b'], 2);
    expect(nextTurn(bs)).toEqual(['b']);
    expect(bs.turn).toBe(2);
    expect(bs.skips).toEqual({ b: 1 });
    nextTurn(bs);
    expect(nextTurn(bs)).toEqual(['b']);
    expect(bs.turn).toBe(2);
    expect(bs.skips).toBeUndefined();
    // Going back doesn't count as a turn missed.
    skipTurns(bs, ['b']);
    nextTurn(bs, -1);
    expect([bs.turn, bs.skips]).toEqual([1, { b: 1 }]);
  });

  it('never loops forever when everyone skips', () => {
    const bs = state();
    skipTurns(bs, ['a', 'b', 'c']);
    nextTurn(bs);
    expect(bs.skips).toBeUndefined();
  });

  it('gives the turn back to a player who rolls again, before any skips', () => {
    const bs = state();
    bs.again = 'a';
    skipTurns(bs, ['b']);
    expect(nextTurn(bs)).toEqual([]);
    expect([bs.turn, bs.again]).toEqual([0, undefined]);
    expect(nextTurn(bs)).toEqual(['b']);
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

describe('board game: moving back where ways split or meet', () => {
  it('goes back the way the player came, not along the other way into the space', () => {
    const { game, round, ids } = setup();
    const session = newSession(game);
    const bs = ensureBoard(session, game, round);
    const cut = round.spaces.at(-1)!;
    // Start → Space 3 (the fork), then along the Shortcut to Space 6, where it meets the main way.
    movePlayer(round, bs, 'a', 2);
    expect(movePlayer(round, bs, 'a', 2, cut.id)).toBe('Landed on Space 6');
    expect(movePlayer(round, bs, 'a', -1)).toBe('Landed on Shortcut');
    // Two back from Space 6 the other time, after coming along the main way.
    sendTo(bs, ['b'], { space: ids[2] });
    movePlayer(round, bs, 'b', 3, ids[3]);
    expect(bs.positions.b.space).toBe(ids[5]);
    expect(movePlayer(round, bs, 'b', -2)).toBe('Landed on Space 4');
  });

  it('after a move back onto a fork, the next move forward asks which way again', () => {
    const { game, round, ids } = setup();
    const session = newSession(game);
    const bs = ensureBoard(session, game, round);
    sendTo(bs, ['a'], { space: ids[2] });
    expect(movePlayer(round, bs, 'a', 1, ids[3])).toBe('Landed on Space 4');
    expect(movePlayer(round, bs, 'a', -1)).toBe('Landed on Space 3');
    expect(movePlayer(round, bs, 'a', 2)).toBe('At Space 3: which way? (2 to go)');
    expect(waysNow(round, bs)?.ways).toEqual([ids[3], round.spaces.at(-1)!.id]);
  });
});

describe('board game: what spaces show', () => {
  it('numbers only spaces named “Space N”', () => {
    expect(spaceNumber('Space 12')).toBe('12');
    expect(spaceNumber('Move +3')).toBeUndefined();
    expect(spaceNumber('Back 4')).toBeUndefined();
    expect(spaceNumber('Start')).toBeUndefined();
  });

  it('warns about spaces under the stats strip', () => {
    const { game, round } = setup();
    expect(boardGameProblems(game, round, 'Board', 1).some((p) => p.text.includes('stats strip'))).toBe(false);
    round.spaces[3].y = 910;
    round.spaces[3].name = 'Finish';
    expect(boardGameProblems(game, round, 'Board', 1)).toContainEqual({
      text: 'Board: Finish is under the stats strip (move it up)',
      tab: 1,
      level: 'warn',
      place: { tab: 'round', round: round.id, part: { kind: 'space', space: round.spaces[3].id } },
    });
    game.theme = { ...game.theme, scoreBar: 'hidden' };
    expect(boardGameProblems(game, round, 'Board', 1).some((p) => p.text.includes('stats strip'))).toBe(false);
  });
});

describe('board game editor: the arrow keys', () => {
  it('go to the nearest space that way', () => {
    const round = newBoardGameRound('Board');
    const sp = (name: string, x: number, y: number) => ({ ...newBoardSpace(x, y, name) });
    const mid = sp('Mid', 500, 500);
    const right = sp('Right', 700, 520);
    const farRight = sp('Far right', 1200, 500);
    const upRight = sp('Up right', 560, 200);
    const down = sp('Down', 480, 800);
    round.spaces = [mid, right, farRight, upRight, down];
    const go = (from: typeof mid, dx: number, dy: number) => spaceToward(round, from, dx, dy)?.name;
    expect(go(mid, 1, 0)).toBe('Right');
    expect(go(right, 1, 0)).toBe('Far right');
    expect(go(farRight, 1, 0)).toBeUndefined();
    expect(go(mid, 0, -1)).toBe('Up right');
    expect(go(mid, 0, 1)).toBe('Down');
    expect(go(right, -1, 0)).toBe('Mid');
    // Something straight ahead comes before something nearer but well off to the side.
    round.spaces.push(sp('Off to the side', 560, 700));
    expect(go(mid, 1, 0)).toBe('Right');
  });
});
