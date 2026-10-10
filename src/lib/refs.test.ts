import { describe, expect, it } from 'vitest';
import { newGame, type World } from './model';
import { actionProblem, objectPointsNowhere } from './refs';
import { newBoardGameRound, moverDiceUnknown } from './boardgame';

function withWorld() {
  const game = newGame();
  const world = { id: 'w', name: 'W', maps: [{ id: 'm', name: 'M', cols: 2, rows: 2, screens: [{ id: 's', name: 'Cave', col: 0, row: 0, slide: { background: {}, elements: [] } }] }] } as unknown as World;
  game.worlds = [world];
  return { game, world };
}

describe('what points nowhere', () => {
  it('a Go to a screen button outside the round (an item’s Use) is checked against the world with that map', () => {
    const { game, world } = withWorld();
    const go = { id: 'a', do: 'move' as const, to: { map: 'm', screen: 's' } };
    expect(actionProblem(game, go)).toBeNull();
    world.maps[0].screens = [];
    expect(actionProblem(game, go)).toBe('That screen no longer exists');
  });

  it('a screen picked from another world is named as such in a round on this one, not as deleted', () => {
    const { game, world } = withWorld();
    const other = { id: 'w2', name: 'Shadow Realm', maps: [] } as unknown as World;
    game.worlds!.push(other);
    const go = { id: 'a', do: 'move' as const, to: { map: 'm', screen: 's' } };
    expect(actionProblem(game, go, { world })).toBeNull();
    expect(actionProblem(game, go, { world: other })).toBe('That screen is in “W”, not this round’s world');
  });

  it('Reveal / Hide a deleted object; a Shop with no shop chosen', () => {
    const { game } = withWorld();
    expect(actionProblem(game, { id: 'a', do: 'reveal', object: 'gone' })).toBe('That object no longer exists');
    const { world } = withWorld();
    expect(objectPointsNowhere(game, { id: 'o', kind: 'shape', role: { class: 'shop' } } as never, world)).toBe(true);
  });

  it('a pile of currency with no currency in the game (none chosen, none to fall back on)', () => {
    const { game, world } = withWorld();
    const pile = { id: 'o', kind: 'shape', role: { class: 'currency', amount: 10 } } as never;
    expect(objectPointsNowhere(game, pile, world)).toBe(true);
    game.statFields = [{ id: 'hp', name: 'HP', type: 'number', start: 0, audience: 'hud', display: 'counter' }];
    expect(objectPointsNowhere(game, pile, world)).toBe(true);
    game.statFields.push({ id: 'gold', name: 'Gold', type: 'number', start: 0, audience: 'hud', display: 'counter', currency: true });
    expect(objectPointsNowhere(game, pile, world)).toBe(false);
  });

  it('Move by dice the app can’t read', () => {
    const r = newBoardGameRound('B');
    r.mover = { kind: 'dice', dice: '2d6+1' };
    expect(moverDiceUnknown(r)).toBe(true);
    r.mover = { kind: 'dice', dice: '2d6' };
    expect(moverDiceUnknown(r)).toBe(false);
  });
});
