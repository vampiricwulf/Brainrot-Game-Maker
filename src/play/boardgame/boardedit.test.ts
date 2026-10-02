import { describe, expect, it } from 'vitest';
import { newGame, type BoardGameRound, type Game } from '../../lib/model';
import { newBoardGameRound } from '../../lib/boardgame';
import { addLiveSpace, connectSpaces, deleteLiveSpace, disconnectSpaces, keepBoard, linkAt, refuge, reverseLink, toggleBothWays } from '../../lib/boardedit';
import { goToRound, newSession } from '../../lib/session';
import { undoAction, redoAction } from '../../lib/toolset';
import { boardEdit, editAdd, editConnect, editDelete, editDisconnect, editSpace, setEditing } from './boardedit.svelte';

/** A game with a 12-space loop (Start, Space 2…Space 12) and two players, playing it. */
function setup() {
  const game = newGame();
  game.players = [
    { id: 'a', name: 'Ann', color: '#e6194b' },
    { id: 'b', name: 'Bob', color: '#3cb44b' },
  ];
  const round = newBoardGameRound('Board');
  game.rounds.push(round);
  const session = newSession(game);
  goToRound(session, game, 0);
  const bs = session.boardgames![round.id];
  const id = (name: string) => round.spaces.find((s) => s.name === name)!.id;
  return { game, round, session, bs, id };
}
const names = (round: BoardGameRound, ids: string[]) => ids.map((i) => round.spaces.find((s) => s.id === i)?.name);

describe('editing a board during play: the operations', () => {
  it('adds a space, after the picked one on the path (taking over where it led)', () => {
    const { round, id } = setup();
    const s = addLiveSpace(round, { x: 5000, y: -20 }, round.spaces[4]);
    expect(s.name).toBe('Space 13');
    expect([s.x, s.y]).toEqual([1880, 40]);
    expect(names(round, round.spaces[4].next)).toEqual(['Space 13']);
    expect(names(round, s.next)).toEqual(['Space 6']);
    // On its own: no links.
    expect(addLiveSpace(round, { x: 900, y: 500 }).next).toEqual([]);
    expect(id('Space 14')).toBeTruthy();
  });

  it('connects and disconnects spaces, both ways or one, and reverses a link', () => {
    const { round, id } = setup();
    expect(connectSpaces(round, id('Space 3'), id('Space 7'))).toBe(true);
    expect(connectSpaces(round, id('Space 3'), id('Space 7'))).toBe(false);
    expect(connectSpaces(round, id('Space 3'), id('Space 3'))).toBe(false);
    expect(names(round, round.spaces[2].next)).toEqual(['Space 4', 'Space 7']);
    toggleBothWays(round, id('Space 3'), id('Space 7'));
    expect(names(round, round.spaces[6].next)).toEqual(['Space 8', 'Space 3']);
    toggleBothWays(round, id('Space 3'), id('Space 7'));
    expect(names(round, round.spaces[6].next)).toEqual(['Space 8']);
    reverseLink(round, id('Space 3'), id('Space 7'));
    expect(names(round, round.spaces[2].next)).toEqual(['Space 4']);
    expect(names(round, round.spaces[6].next)).toEqual(['Space 8', 'Space 3']);
    expect(disconnectSpaces(round, id('Space 3'), id('Space 7'))).toBe(true);
    expect(names(round, round.spaces[6].next)).toEqual(['Space 8']);
    expect(disconnectSpaces(round, id('Space 3'), id('Space 7'))).toBe(false);
  });

  it('deletes a space: the players on it go to the space before it, and the path closes up', () => {
    const { session, round, bs, id } = setup();
    bs.positions.a = { space: id('Space 5') };
    bs.fork = { playerId: 'b', at: id('Space 5'), stepsLeft: 2 };
    expect(refuge(round, id('Space 5'))?.name).toBe('Space 4');
    const d = deleteLiveSpace(session, round, bs, id('Space 5'))!;
    expect(d.text).toBe('Deleted space “Space 5” (Ann moved to Space 4)');
    expect(d.moved).toEqual([{ playerId: 'a', to: id('Space 4') }]);
    expect(bs.positions.a.space).toBe(id('Space 4'));
    expect(names(round, round.spaces.find((s) => s.name === 'Space 4')!.next)).toEqual(['Space 6']);
    expect(bs.fork).toBeUndefined();
    expect(round.spaces).toHaveLength(11);
  });

  it('deleting Start moves Start; a space nobody leads to sends its players on, or to the nearest', () => {
    const { session, round, bs, id } = setup();
    round.start = id('Start');
    // Everyone starts on Start. Space 12 gone, the loop closes up: Space 11 leads to Start, so they go back to it.
    deleteLiveSpace(session, round, bs, id('Space 12'));
    const d = deleteLiveSpace(session, round, bs, id('Start'))!;
    expect(d.text).toBe('Deleted space “Start” (Ann & Bob moved to Space 11)');
    // (The loop closed up over Start: Space 11 → Space 2.) A path now: nobody leads to Space 2, so someone on it goes on.
    disconnectSpaces(round, id('Space 11'), id('Space 2'));
    bs.positions.b = { space: id('Space 2') };
    expect(deleteLiveSpace(session, round, bs, id('Space 2'))!.text).toBe('Deleted space “Space 2” (Bob moved to Space 3)');
    expect(round.start).toBeUndefined();
    // A space on its own: the nearest.
    const lone = addLiveSpace(round, { x: 1000, y: 330 });
    bs.positions.a = { space: lone.id };
    expect(deleteLiveSpace(session, round, bs, lone.id)!.text).toBe('Deleted space “Space 12” (Ann moved to Space 3)');
  });

  it('a button that sent players to a deleted space points nowhere', () => {
    const { session, round, bs, id } = setup();
    round.spaces[0].onLand = [{ id: 'x', do: 'goto', space: id('Space 9'), who: 'party' }];
    deleteLiveSpace(session, round, bs, id('Space 9'));
    expect(round.spaces[0].onLand[0]).toMatchObject({ do: 'goto', space: undefined });
  });

  it('finds the link under a point (not far from it)', () => {
    const { round, id } = setup();
    // Start (360, 300) → Space 2 (660, 300).
    expect(linkAt(round, { x: 510, y: 310 })).toEqual({ from: id('Start'), to: id('Space 2') });
    expect(linkAt(round, { x: 510, y: 400 })).toBeNull();
  });

  it('💾 Keep in game copies the board into the other copy of the game, and only then', () => {
    const { game, round, session, bs, id } = setup();
    const saved: Game = JSON.parse(JSON.stringify(game));
    addLiveSpace(round, { x: 900, y: 500 }, round.spaces[0]);
    deleteLiveSpace(session, round, bs, id('Space 7'));
    const savedRound = saved.rounds[0] as BoardGameRound;
    expect(savedRound.spaces).toHaveLength(12);
    expect(keepBoard(game, saved, round.id)).toBe('Kept the board of “Board” in the game');
    expect(savedRound.spaces.map((s) => s.name)).toEqual(round.spaces.map((s) => s.name));
    // A copy: changing the board in play again leaves the kept one as it is.
    round.spaces[0].name = 'Go';
    expect(savedRound.spaces[0].name).toBe('Start');
    saved.rounds = [];
    expect(keepBoard(game, saved, round.id)).toBe('“Board” isn’t in the game in the editor any more');
  });
});

describe('editing a board during play: each edit is a named undo step', () => {
  it('adds, connects, disconnects, renames and deletes, and Undo puts the board (and the players) back', () => {
    const { game, round, session, bs, id } = setup();
    setEditing(true);
    const log = () => session.actionLog?.at(-1)?.text;
    boardEdit.sel = id('Space 5');
    editAdd(game, session, { x: 900, y: 600 });
    expect(log()).toBe('Added space “Space 13” after “Space 5”');
    expect(boardEdit.sel).toBe(id('Space 13'));
    editConnect(game, session, id('Space 13'), id('Space 9'));
    expect(log()).toBe('Connected Space 13 → Space 9');
    editDisconnect(game, session, { from: id('Space 13'), to: id('Space 9') });
    expect(log()).toBe('Disconnected Space 13 → Space 9');
    editSpace(game, session, id('Space 13'), 'Renamed space “Space 13” to “Nap time”', (s) => (s.name = 'Nap time'));
    bs.positions.a = { space: id('Nap time') };
    editDelete(game, session, id('Nap time'));
    expect(log()).toBe('Deleted space “Nap time” (Ann moved to Space 5)');
    expect(round.spaces).toHaveLength(12);
    expect(bs.positions.a.space).toBe(id('Space 5'));

    undoAction(session, game);
    expect(round.spaces.map((s) => s.name)).toContain('Nap time');
    expect(session.boardgames![round.id].positions.a.space).toBe(id('Nap time'));
    undoAction(session, game);
    expect(round.spaces.map((s) => s.name)).toContain('Space 13');
    redoAction(session, game);
    expect(round.spaces.map((s) => s.name)).toContain('Nap time');
    for (let i = 0; i < 4; i++) undoAction(session, game);
    expect(round.spaces).toHaveLength(12);
    expect(names(round, round.spaces[4].next)).toEqual(['Space 6']);
    setEditing(false);
    expect(boardEdit.on).toBe(false);
  });
});
