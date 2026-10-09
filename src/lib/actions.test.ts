import { describe, expect, it } from 'vitest';
import { describeAction, runAction, targets, typedSteps, type RunContext } from './actions';
import { ensureBoard, newBoardGameRound } from './boardgame';
import { newLive } from './live';
import { newGame, newShapeEl, type Action } from './model';
import { addScreenBeside, ensureWorld, moveTo, newRpgRound, newWorld } from './rpg';
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

describe('typed steps', () => {
  it('a negative number turns a move round; never 0', () => {
    expect(typedSteps(1, 3)).toBe(3);
    expect(typedSteps(-1, 3)).toBe(-3);
    expect(typedSteps(1, -4)).toBe(-4);
    expect(typedSteps(-2, -4)).toBe(4);
    expect(typedSteps(-2, 0)).toBe(-1);
    expect(typedSteps(1, NaN)).toBe(1);
    expect(typedSteps(1, 2.6)).toBe(3);
  });
});

describe('who “the party” is', () => {
  function board() {
    const game = newGame();
    game.players = ['Ann', 'Bob'].map((name, i) => ({ id: 'ab'[i], name, color: '#e6194b' }));
    const round = newBoardGameRound();
    game.rounds = [round];
    const session = newSession(game);
    const bs = ensureBoard(session, game, round);
    return { game, session, round, bs, ctx: { game, session, live: newLive(), board: round, bs, selected: [] } as RunContext };
  }

  it('on a board, is the player the button is for (not whoever’s turn it is)', () => {
    const { round, bs, ctx } = board();
    // Ann's turn; the button is Bob's (he landed there, or was picked on the space's card).
    expect(targets({ ...ctx, chosen: ['b'] }, 'party')).toEqual(['b']);
    expect(runAction({ ...ctx, chosen: ['b'] }, { id: '1', do: 'steps', steps: 3, who: 'party' })).toBe('Forward 3 spaces: Bob · Landed on Space 4');
    expect(bs.positions.b.space).toBe(round.spaces[3].id);
    expect(bs.positions.a.space).toBe(round.spaces[0].id);
    // Unset means the same; with nobody chosen it's whoever's turn it is.
    runAction({ ...ctx, chosen: ['b'] }, { id: '2', do: 'skip' });
    expect(bs.skips).toEqual({ b: 1 });
    expect(targets(ctx, 'party')).toEqual(['a']);
  });

  it('moving everyone keeps the mover’s last move (their landing buttons) and the board otherwise as it was', () => {
    const { round, bs, ctx } = board();
    // Ann moved and landed; then one of her landing buttons moves everyone 2 spaces.
    bs.last = { playerId: 'a', passed: [], landed: round.spaces[0].id, turn: bs.turns ?? 0 };
    runAction(ctx, { id: '3', do: 'steps', steps: 2, who: 'all' });
    expect([bs.positions.a.space, bs.positions.b.space]).toEqual([round.spaces[2].id, round.spaces[2].id]);
    expect(bs.last?.playerId).toBe('a');
  });

  it('in an RPG, is the party standing where the object is (not the one viewers follow)', () => {
    const game = newGame();
    game.players = ['Ann', 'Bob', 'Cy'].map((name, i) => ({ id: 'abc'[i], name, color: '#e6194b' }));
    const hp = { ...newStatField('HP'), id: 'hp', start: 10 };
    game.statFields = [hp];
    const round = newRpgRound(game);
    game.rounds = [round];
    const world = game.worlds![0];
    const map = world.maps[0];
    const village = addScreenBeside(map, map.screens[0], 'e', 'Village')!;
    const cave = addScreenBeside(map, village, 'e', 'Cave')!;
    const session = newSession(game);
    const st = ensureWorld(session, game, round)!;
    // Cy goes to the Village on his own (viewers follow him), Ann & Bob stay at the start.
    moveTo(game, st, world, { map: map.id, screen: village.id }, { players: ['c'] });
    const [ab, c] = st.parties;
    st.active = c.id;
    const ctx: RunContext = { game, session, live: newLive(), world, st, selected: [] };
    // A trap at the start hurts Ann & Bob, not Cy.
    runAction({ ...ctx, at: map.screens[0].id }, { id: '1', do: 'stat', field: 'hp', op: 'add', amount: -3, who: 'party' });
    expect(['a', 'b', 'c'].map((id) => statValue(game, session, id, hp))).toEqual([7, 7, 10]);
    // With the Damage sound (on the audience side).
    expect(ctx.live.blip?.key).toBe('hurt');
    // On a screen nobody stands on (or with no object), it's the followed party.
    expect(targets({ ...ctx, at: cave.id }, 'party')).toEqual(['c']);
    expect(targets(ctx, 'party')).toEqual(['c']);
    // A move from the start's object moves Ann & Bob there, as they are.
    runAction({ ...ctx, at: map.screens[0].id }, { id: '2', do: 'move', to: { map: map.id, screen: cave.id }, who: 'party' });
    expect([st.positions.a.screen, st.positions.b.screen, st.positions.c.screen]).toEqual([cave.id, cave.id, village.id]);
    expect(st.parties.map((p) => p.members)).toEqual([ab.members, ['c']]);
  });
});

describe('button labels', () => {
  it('say where a move goes, and what a reveal or hide shows and on which screen', () => {
    const game = newGame();
    game.players = [{ id: 'a', name: 'Ann', color: '#e6194b' }];
    const round = newRpgRound(game);
    game.rounds = [round];
    const map = game.worlds![0].maps[0];
    const road = addScreenBeside(map, map.screens[0], 'e', 'Road')!;
    const lake = addScreenBeside(map, road, 'e', 'Lake')!;
    const chest = { ...newShapeEl('rect'), name: 'Hidden chest', secret: true };
    road.slide.elements.push(chest);
    const reveal: Action = { id: '1', do: 'reveal', object: chest.id };
    expect(describeAction(game, { id: '2', do: 'move', to: { map: map.id, screen: lake.id } })).toBe('Go to Lake');
    expect(describeAction(game, reveal)).toBe('Reveal Hidden chest (Road)');
    expect(describeAction(game, { id: '3', do: 'hide', object: chest.id })).toBe('Hide Hidden chest (Road)');
    // The log says the same (the card puts the object's name first).
    const session = newSession(game);
    const st = ensureWorld(session, game, round)!;
    runAction({ game, session, live: newLive(), world: game.worlds![0], st, selected: [] }, reveal, `Elder: ${describeAction(game, reveal)}`);
    expect(session.actionLog?.at(-1)?.text).toBe('Elder: Reveal Hidden chest (Road)');
    expect(st.objects[chest.id].shown).toBe(true);
  });
});
