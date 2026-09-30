import { describe, expect, it } from 'vitest';
import { runAction, type RunContext } from './actions';
import { newBoardGameRound } from './boardgame';
import { newLive } from './live';
import { newGame, type Action } from './model';
import { newWorld } from './rpg';
import { newSession } from './session';
import { newStatField, statValue } from './toolset';

function setup(): RunContext {
  const game = newGame();
  game.players = [{ id: 'a', name: 'Ann', color: '#e6194b' }];
  game.statFields = [{ ...newStatField('Class', 'text'), id: 'class', start: 'Bard' }];
  game.items = [{ id: 'potion', name: 'Potion', stackable: true }];
  return { game, session: newSession(game), live: newLive(), selected: ['a'] };
}

describe('running buttons that point nowhere', () => {
  it('won’t write a number into a stat that isn’t a number', () => {
    const ctx = setup();
    expect(runAction(ctx, { id: '1', do: 'stat', field: 'class', op: 'add', amount: -1, who: 'selected' })).toBe('That stat isn’t a number');
    expect(statValue(ctx.game, ctx.session, 'a', ctx.game.statFields![0])).toBe('Bard');
  });

  it('won’t give an item that was deleted (no “Mystery item”)', () => {
    const ctx = setup();
    const give: Action = { id: '1', do: 'item', item: 'potion', qty: 1, op: 'give', who: 'selected' };
    expect(runAction(ctx, give)).toBe('Give 1 Potion: Ann');
    ctx.game.items = [];
    expect(runAction(ctx, give)).toBe('That item no longer exists');
    expect(ctx.session.inventories?.a).toHaveLength(1);
  });

  it('won’t send players to a deleted space or zone, or move them to a deleted screen', () => {
    const ctx = setup();
    const board = newBoardGameRound();
    ctx.board = board;
    ctx.bs = { positions: { a: { space: board.spaces[0].id } }, order: ['a'], turn: 0 };
    expect(runAction(ctx, { id: '1', do: 'goto', zone: 'gone', who: 'selected' })).toBe('That zone no longer exists');
    expect(runAction(ctx, { id: '2', do: 'goto', space: 'gone', who: 'selected' })).toBe('That space no longer exists');
    expect(ctx.bs.positions.a).toEqual({ space: board.spaces[0].id });
    ctx.world = newWorld();
    ctx.st = { positions: {}, parties: [], active: '', knowledge: {}, objects: {}, added: {}, mapShown: false };
    expect(runAction(ctx, { id: '3', do: 'move', to: { map: ctx.world.maps[0].id, screen: 'gone' } })).toBe('That screen no longer exists');
  });
});
