import { describe, expect, it } from 'vitest';
import { cardTargets, describeAction, runAction, targets, typedSteps, type CardOffer, type RunContext } from './actions';
import { ensureBoard, movePlayer, newBoardGameRound, nextTurn } from './boardgame';
import { newLive } from './live';
import { newGame, newImageEl, newShapeEl, textSlide, type Action, type CardWho } from './model';
import { copyActions } from './listedit';
import { cardsOut } from './sentcards';
import { mediaUsage } from './usage';
import { logged } from './toolset';
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

describe('stat buttons that change nothing', () => {
  it('store nothing, log nothing and play no Damage sound (so an item used for nothing is kept)', () => {
    const ctx = setup();
    const hp = { ...newStatField('HP'), id: 'hp', start: 10, min: 0, max: 10 };
    ctx.game.statFields = [hp];
    // Never touched (10/10): HP = 10, or 99 (kept to the max), leaves it as it was, with no value stored.
    runAction(ctx, { id: '1', do: 'stat', field: 'hp', op: 'set', amount: 10, who: 'selected' });
    runAction(ctx, { id: '2', do: 'stat', field: 'hp', op: 'set', amount: 99, who: 'selected' });
    expect(ctx.session.stats?.a?.hp).toBeUndefined();
    expect(ctx.session.actionLog ?? []).toHaveLength(0);
    runAction(ctx, { id: '3', do: 'stat', field: 'hp', op: 'set', amount: 0, who: 'selected' });
    expect(statValue(ctx.game, ctx.session, 'a', hp)).toBe(0);
    expect(ctx.session.actionLog).toHaveLength(1);
    // Poison at 0 HP takes nothing: no Damage sound, no step. With HP left, it hurts.
    runAction(ctx, { id: '4', do: 'stat', field: 'hp', op: 'add', amount: -3, who: 'selected' });
    expect(ctx.live.blip).toBeFalsy();
    expect(ctx.session.actionLog).toHaveLength(1);
    runAction(ctx, { id: '5', do: 'stat', field: 'hp', op: 'set', amount: 2, who: 'selected' });
    runAction(ctx, { id: '6', do: 'stat', field: 'hp', op: 'add', amount: -3, who: 'selected' });
    expect(statValue(ctx.game, ctx.session, 'a', hp)).toBe(0);
    expect(ctx.live.blip?.key).toBe('hurt');
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

  it('a “Back 3” pressed where the move landed keeps the Start bonus it passed on the way (not on a later turn)', () => {
    const { round, bs, ctx } = board();
    const [start, s2, , , , , , , , , s11, s12] = round.spaces;
    start.onPass = [{ id: 'bonus', do: 'score', amount: 200, who: 'party' }];
    // Ann, on the last space, moves 2: past Start, onto Space 2 (a "Back 3" space).
    bs.positions.a = { space: s12.id };
    movePlayer(round, bs, 'a', 2);
    expect(bs.last).toMatchObject({ passed: [start.id], landed: s2.id });
    runAction({ ...ctx, chosen: ['a'] }, { id: 'b3', do: 'steps', steps: -3, who: 'party' });
    expect(bs.positions.a.space).toBe(s11.id);
    expect(bs.last?.landed).toBe(s11.id);
    expect(bs.last?.passed).toContain(start.id);
    // The next turn's "Back 3" (Bob's, then Ann's turn again): her last move's buttons aren't brought back.
    nextTurn(bs);
    nextTurn(bs);
    runAction({ ...ctx, chosen: ['a'] }, { id: 'b3', do: 'steps', steps: -3, who: 'party' });
    expect(bs.last?.passed).toEqual([]);
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
    // An unnamed one is named as the Layers list names it, not just "object".
    const ellipse = newShapeEl('ellipse');
    road.slide.elements.push(ellipse);
    expect(describeAction(game, { id: '4', do: 'reveal', object: ellipse.id })).toBe('Reveal Ellipse (Road)');
  });
});

describe('🤫 a card button (partner-clues spec §12.2)', () => {
  function party() {
    const game = newGame();
    game.players = ['Ann', 'Bob', 'Cy'].map((name, i) => ({ id: 'abc'[i], name, color: '#e6194b' }));
    const session = newSession(game);
    const offers: CardOffer[] = [];
    const ctx: RunContext = { game, session, live: newLive(), selected: [], offerCard: (o) => offers.push(o) };
    const card: Extract<Action, { do: 'card' }> = { id: 'c1', do: 'card', slide: textSlide('You’re the spy'), to: 'trigger' };
    return { game, session, ctx, offers, card };
  }

  it('only offers its card when it runs: nothing is sent, the room gets nothing, until the host presses 📤 Send', () => {
    const { game, session, ctx, offers, card } = party();
    const said = runAction({ ...ctx, chosen: ['b'] }, card, `Goblin: ${describeAction(game, card)}`);
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({ from: 'Goblin: 🤫 Card for whoever set it off', to: ['b'], until: 'round' });
    // Nothing went out: no card in the session (what the buzzer room and the cards-out list are built from).
    expect(session.cards).toBeUndefined();
    expect(cardsOut(game, session)).toEqual([]);
    // What the host is told is short (the offer in the panel says who, and a long toast would sit over it), and never
    // what's on the card (the panel may be on stream).
    expect(said).toBe('Goblin: 🤫 Card for whoever set it off');
    expect(said).not.toContain('spy');
  });

  it('offers a copy: editing the button afterwards leaves the card offered as it was', () => {
    const { ctx, offers, card } = party();
    runAction({ ...ctx, chosen: ['a'] }, card);
    const t = card.slide.elements[0];
    if (t.kind === 'text') t.text = 'Changed';
    const o = offers[0].slide.elements[0];
    expect(o.kind === 'text' && o.text).toBe('You’re the spy');
    // Lasting until taken back, when the button says so.
    runAction({ ...ctx, chosen: ['a'] }, { ...card, until: 'host' });
    expect(offers[1].until).toBe('host');
  });

  it('starts with whoever set it off, the party, nobody (the host picks) or everyone else', () => {
    const { ctx } = party();
    const pick = (to: CardWho) => cardTargets({ ...ctx, chosen: ['b'] }, to);
    expect(pick('trigger')).toEqual(['b']);
    expect(pick('ask')).toEqual([]);
    expect(pick('others')).toEqual(['a', 'c']);
    // Outside an RPG or a board, "the party" is the selected players, else everyone.
    expect(pick('party')).toEqual(['a', 'b', 'c']);
    expect(cardTargets({ ...ctx, selected: ['c'] }, 'party')).toEqual(['c']);
    // Unset: whoever set it off (with nobody chosen, the selected players).
    expect(cardTargets({ ...ctx, selected: ['c'] }, undefined)).toEqual(['c']);
  });

  it('with nobody known to have set it off (a spin or roll nobody was tagged for), everyone else starts with nobody: the host picks', () => {
    const { game, session, ctx, offers, card } = party();
    expect(cardTargets({ ...ctx, selected: [] }, 'others')).toEqual([]);
    runAction(ctx, { ...card, to: 'others' });
    expect(offers[0].to).toEqual([]);
    expect(session.cards).toBeUndefined();
    expect(cardsOut(game, session)).toEqual([]);
  });

  it('says who it’s for in the editor’s words: on a board space, whoever landed there (or passes it) and whoever’s turn it is; an item’s, whoever uses it', () => {
    const { game, card } = party();
    expect(describeAction(game, card)).toBe('🤫 Card for whoever set it off');
    expect(describeAction(game, card, 'land')).toBe('🤫 Card for whoever landed there');
    expect(describeAction(game, card, 'pass')).toBe('🤫 Card for whoever passes it');
    expect(describeAction(game, card, 'use')).toBe('🤫 Card for whoever uses it');
    expect(describeAction(game, { ...card, to: 'party' })).toBe('🤫 Card for the party');
    expect(describeAction(game, { ...card, to: 'party' }, 'land')).toBe('🤫 Card for whoever’s turn it is');
  });

  it('on a board, the party is whoever landed (else whoever’s turn it is), and everyone else is the rest', () => {
    const game = newGame();
    game.players = ['Ann', 'Bob', 'Cy'].map((name, i) => ({ id: 'abc'[i], name, color: '#e6194b' }));
    const round = newBoardGameRound();
    game.rounds = [round];
    const session = newSession(game);
    const bs = ensureBoard(session, game, round);
    const ctx: RunContext = { game, session, live: newLive(), board: round, bs, selected: [] };
    expect(cardTargets({ ...ctx, chosen: ['c'] }, 'party')).toEqual(['c']);
    expect(cardTargets(ctx, 'party')).toEqual(['a']);
    expect(cardTargets({ ...ctx, chosen: ['c'] }, 'others')).toEqual(['a', 'b']);
  });

  it('does nothing where no offer can be made, and needs no players picked first', () => {
    const { session, ctx, card } = party();
    const { offerCard: _, ...bare } = ctx;
    expect(runAction(bare, card)).toBe('Cards can’t be sent from here');
    expect(session.cards).toBeUndefined();
  });

  it('is never in the undo step it runs in, and its label never says what’s on the card', () => {
    const { game, session, ctx, offers, card } = party();
    logged(session, 'Goblin', () => runAction({ ...ctx, chosen: ['a'] }, card));
    expect(offers).toHaveLength(1);
    expect(session.actionLog ?? []).toHaveLength(0);
    for (const to of ['trigger', 'party', 'ask', 'others'] as const) expect(describeAction(game, { ...card, to })).not.toContain('spy');
    expect(describeAction(game, { ...card, to: 'others' })).toBe('🤫 Card for everyone else');
  });

  it('is copied with its own card, and its pictures count as used (Remove unused keeps them)', () => {
    const { game, card } = party();
    const pic = newImageEl('m1');
    card.slide.elements.push(pic);
    game.items = [{ id: 'scroll', name: 'Scroll', stackable: false, onUse: [card] }];
    expect(mediaUsage(game).get('m1')).toBe(1);
    const [copy] = copyActions([card]);
    expect(copy.do === 'card' && copy.slide.elements.map((e) => e.id)).not.toContain(pic.id);
    expect(copy.do === 'card' && copy.slide.elements).toHaveLength(2);
  });
});
