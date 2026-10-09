import { describe, expect, it } from 'vitest';
import { newGame, newShapeEl, type Game, type Session, type SlideElement, type WorldState } from '../../lib/model';
import { addScreenBeside, ensureWorld, newRpgRound, splitParty } from '../../lib/rpg';
import { goToRound, newSession, score } from '../../lib/session';
import { currencyFields, inventory, newStatField, statNumber, undoAction } from '../../lib/toolset';
import {
  addLive, avatarRange, avatarSpot, centredOn, droppedObject, dropEntry, giveEntry, groupDelta, joinPartyNow, liveText, moveChoices, moveGroup, objectMenu,
  objectRange, partyOn, pickUp, regroupAll, removeObject, sendPlayers, splitOff, stepParty, wayOffEdge,
} from './hostops';

/** An RPG round with three players standing on its start screen. */
function setup(): { game: Game; session: Session; st: WorldState } {
  const game = newGame();
  game.players = ['Ann', 'Bob', 'Cat'].map((name, i) => ({ id: `p${i}`, name, color: '#e6194b' }));
  const round = newRpgRound(game);
  game.rounds = [round];
  const session = newSession(game);
  goToRound(session, game, 0);
  const st = ensureWorld(session, game, round)!;
  return { game, session, st };
}

/** The avatars' boxes (token and nameplate) on a screen. */
const avatars = (st: WorldState) => Object.values(st.positions).map((p) => ({ x: p.x - 60, y: p.y - 60, w: 120, h: 150 }));
const covers = (el: SlideElement, b: { x: number; y: number; w: number; h: number }) => el.x < b.x + b.w && b.x < el.x + el.w && el.y < b.y + b.h && b.y < el.y + el.h;

describe('improvising on the RPG stage', () => {
  it('puts typed text where no avatar stands', () => {
    const { game, session, st } = setup();
    const text = liveText(game, session, 'Toll situation');
    expect(avatars(st).some((b) => covers(text, b))).toBe(false);
    // The party near the top: the text goes lower down.
    for (const p of Object.values(st.positions)) p.y = 150;
    const low = liveText(game, session, 'Toll situation');
    expect(low.y).toBeGreaterThan(text.y);
    expect(avatars(st).some((b) => covers(low, b))).toBe(false);
  });

  it('drops an item next to the player, clear of everyone’s avatar', () => {
    const { game, st } = setup();
    const bob = st.positions.p1;
    const el = droppedObject(game, { id: 'e', item: null, name: 'Sword of a Thousand Truths', qty: 1 }, st, bob);
    expect(avatars(st).some((b) => covers(el, b))).toBe(false);
    expect(Math.abs(el.x + el.w / 2 - bob.x)).toBeLessThan(10);
    // Standing in a column (they came in from the side): not onto the player below either.
    Object.values(st.positions).forEach((p, i) => Object.assign(p, { x: 150, y: 370 + i * 170 }));
    const side = droppedObject(game, { id: 'e', item: null, name: 'Rock', qty: 1 }, st, st.positions.p1);
    expect(avatars(st).some((b) => covers(side, b))).toBe(false);
    expect(side.x + side.w <= 1920 && side.y + side.h <= 1080 && side.x >= 0).toBe(true);
  });

  it('keeps what is put where the host clicked on the stage, on the screen clicked (split view has several)', () => {
    const { game, session, st } = setup();
    expect(centredOn({ x: 960, y: 540 }, 1200, 200)).toEqual({ x: 360, y: 440 });
    expect(centredOn({ x: 154, y: 1060 }, 1200, 200)).toEqual({ x: 0, y: 880 });
    const map = game.worlds![0].maps[0];
    const beach = addScreenBeside(map, map.screens[0], 'e', 'Beach')!;
    const text = liveText(game, session, 'Beware of the goose');
    expect(addLive(game, session, text, 'Text', { map: map.id, screen: beach.id })).toBe(true);
    expect(st.added[beach.id]).toEqual([text]);
    // By default: the screen the audience follows.
    const other = liveText(game, session, 'Hello');
    addLive(game, session, other, 'Text');
    expect(st.added[map.screens[0].id]).toEqual([other]);
  });
});

/** The setup plus a screen to the east of the start screen ("Beach"). */
function withBeach() {
  const s = setup();
  const map = s.game.worlds![0].maps[0];
  const beach = addScreenBeside(map, map.screens[0], 'e', 'Beach')!;
  return { ...s, map, start: { map: map.id, screen: map.screens[0].id }, beach: { map: map.id, screen: beach.id } };
}

describe('dragging avatars on the RPG stage', () => {
  it('keeps a dropped avatar wholly on its screen, and clear of the stats strip', () => {
    expect(avatarSpot(960, 540)).toEqual({ x: 960, y: 540 });
    expect(avatarSpot(1920, -40)).toEqual({ x: 1845, y: 75 });
    // The strip along the bottom from y 930; along the top down to 150.
    expect(avatarSpot(400, 1000, 0, 930)).toEqual({ x: 400, y: 855 });
    expect(avatarSpot(400, 100, 150)).toEqual({ x: 400, y: 225 });
  });

  it('walks one off an edge only where the screen has a way out that side', () => {
    const { game, start, beach } = withBeach();
    const world = game.worlds![0];
    expect(wayOffEdge(world, start, 1990, 500)).toEqual({ to: beach, via: 'e' });
    // Nothing to the west or south, and still on the screen: no way.
    expect(wayOffEdge(world, start, -30, 500)).toBeNull();
    expect(wayOffEdge(world, start, 900, 1200)).toBeNull();
    expect(wayOffEdge(world, start, 1900, 500)).toBeNull();
    // A side sent somewhere else (a warp) goes there, without a side to come in from.
    world.maps[0].screens[0].exits = { s: { kind: 'warp', to: beach } };
    expect(wayOffEdge(world, start, 900, 1200)).toEqual({ to: beach, via: null });
  });

  it('sends players to another screen as one step (side by side where dropped), and undo brings them back', () => {
    const { game, session, st, beach, start } = withBeach();
    expect(sendPlayers(game, session, ['p0', 'p1'], beach, { at: { x: 900, y: 500 } })).toBe('Ann & Bob → Beach');
    expect([st.positions.p0.screen, st.positions.p1.screen, st.positions.p2.screen]).toEqual([beach.screen, beach.screen, start.screen]);
    expect([st.positions.p0.x, st.positions.p1.x, st.positions.p0.y]).toEqual([815, 985, 500]);
    // They're a party of their own, and viewers follow them.
    expect(st.parties.map((p) => p.members)).toEqual([['p2'], ['p0', 'p1']]);
    expect(st.active).toBe(st.parties[1].id);
    expect(session.actionLog?.at(-1)?.text).toBe('Ann & Bob → Beach');
    undoAction(session, game);
    expect(Object.values(session.worlds!)[0].positions.p0.screen).toBe(start.screen);
  });

  it('joins players to a party (where it stands), and finds the party on a screen', () => {
    const { game, session, st, beach } = withBeach();
    sendPlayers(game, session, ['p0'], beach);
    const [rest, ann] = st.parties;
    expect(partyOn(st, beach.screen)).toBe(ann);
    st.active = rest.id;
    expect(partyOn(st, beach.screen)).toBe(ann);
    expect(joinPartyNow(game, session, ['p1'], ann.id)).toBe('Bob joins Party 2');
    expect(st.positions.p1.screen).toBe(beach.screen);
    expect(joinPartyNow(game, session, ['p0'], ann.id)).toBeNull();
    // Regrouping with a party gathers everyone where it is.
    regroupAll(game, session, ann.id);
    expect(Object.values(st.positions).every((p) => p.screen === beach.screen)).toBe(true);
    expect(session.actionLog?.at(-1)?.text).toBe('Regroup with Party 2');
  });

  it('says which party moved once there are several', () => {
    const { game, session } = withBeach();
    expect(stepParty(game, session, 'e')).toBeNull();
    expect(session.actionLog?.at(-1)?.text).toBe('Party east');
    splitOff(game, session, ['p2']);
    expect(stepParty(game, session, 'w')).toBeNull();
    expect(session.actionLog?.at(-1)?.text).toBe('Party 2 west');
  });

  it('offers a map screen to the followed party, the selected, each other party and everyone', () => {
    const { session, st } = withBeach();
    splitParty(st, ['p2']);
    const moves: (string | undefined)[] = [];
    const items = moveChoices(session, st, ['p0'], (players, label) => moves.push(label ?? players?.join()));
    expect(items.map((i) => ('label' in i ? i.label : ''))).toEqual(['▶ Move Party 2 here', 'Only the selected (1)', 'Move Party 1 here', 'Everyone here']);
    for (const i of items) if ('onclick' in i) i.onclick();
    expect(moves).toEqual([undefined, '1 selected', 'Party 1', 'Everyone']);
  });
});

describe('objects and items on the RPG stage', () => {
  /** A Potion lying on the start screen, and a pile of 5 gold. */
  function withLoot() {
    const s = setup();
    const screen = s.game.worlds![0].maps[0].screens[0];
    s.game.items = [{ id: 'potion', name: 'Potion', stackable: true }];
    s.game.statFields = [{ ...newStatField('Gold'), currency: true }];
    const potion = { ...newShapeEl('rect'), name: 'Potion', role: { class: 'item' as const, item: 'potion', qty: 1 } };
    const gold = { ...newShapeEl('rect'), name: 'Gold', role: { class: 'currency' as const, field: s.game.statFields[0].id, amount: 5 } };
    screen.slide.elements.push(potion, gold);
    return { ...s, potion, gold };
  }

  it('removes an object as one step (its menu, the Delete key), and says how to bring it back', () => {
    const { game, session, st, potion } = withLoot();
    const said: string[] = [];
    const items = objectMenu(game, session, potion.id, { open: () => said.push('open'), removed: (t) => said.push(t) });
    expect(items.map((i) => ('label' in i ? i.label : 'heading' in i ? i.heading : '—'))).toEqual(['Potion', '🗂 Open its card', '🙈 Hide from viewers', '—', '🗑 Remove']);
    for (const i of items) if ('onclick' in i) i.onclick();
    expect(said).toEqual(['open', 'Removed Potion · Ctrl+Z brings it back']);
    expect(st.objects[potion.id]).toEqual({ shown: false, taken: true });
    undoAction(session, game);
    expect(Object.values(session.worlds!)[0].objects[potion.id]).toEqual({ shown: false });
    expect(removeObject(game, session, 'nothing')).toBeNull();
  });

  it('lets a player pick up an item or a pile of currency dropped on them', () => {
    const { game, session, st, potion, gold } = withLoot();
    expect(pickUp(game, session, st, potion, 'p1')).toBe('Bob picks up Potion');
    expect(inventory(session, 'p1').map((e) => [e.item, e.qty])).toEqual([['potion', 1]]);
    pickUp(game, session, st, gold, 'p1');
    expect(statNumber(game, session, 'p1', currencyFields(game)[0])).toBe(5);
    expect(st.objects[gold.id].taken).toBe(true);
    undoAction(session, game);
    expect(statNumber(game, session, 'p1', currencyFields(game)[0])).toBe(0);
  });

  it('picks up only the currency that fits under the max, and leaves the rest', () => {
    const { game, session, st, gold } = withLoot();
    const f = currencyFields(game)[0];
    f.max = 3;
    expect(pickUp(game, session, st, gold, 'p1')).toContain('the most they can carry');
    expect(statNumber(game, session, 'p1', f)).toBe(3);
    expect(st.objects[gold.id]).toEqual({ amount: 2 });
    expect(pickUp(game, session, st, gold, 'p1')).toContain('can’t carry any more');
    expect(st.objects[gold.id]).toEqual({ amount: 2 });
    pickUp(game, session, st, gold, 'p0');
    expect(statNumber(game, session, 'p0', f)).toBe(2);
    expect(st.objects[gold.id].taken).toBe(true);
  });

  it('leaves a pile of currency where it is when the game has no currency to give', () => {
    const { game, session, st, gold } = withLoot();
    game.statFields = [];
    gold.role.field = undefined as never;
    expect(pickUp(game, session, st, gold, 'p1')).toBe('Gold gives no currency: add one in 📊 Stats & Items');
    expect(st.objects[gold.id]).toBeUndefined();
  });

  it('gives an item to another player, or drops it where it was dragged on the stage', () => {
    const { game, session, st, potion } = withLoot();
    pickUp(game, session, st, potion, 'p0');
    pickUp(game, session, st, { ...potion, id: 'potion2' }, 'p0');
    const entry = inventory(session, 'p0')[0];
    expect(entry.qty).toBe(2);
    expect(giveEntry(game, session, 'p0', 'p1', entry.id, 1)).toBe('Ann gives Potion to Bob');
    expect(giveEntry(game, session, 'p0', 'p0', entry.id, 1)).toBeNull();
    expect(dropEntry(game, session, 'p0', entry.id, 1, { x: 200, y: 200 })).toBe('Ann drops Potion');
    expect(inventory(session, 'p0')).toEqual([]);
    const dropped = st.added[st.positions.p0.screen].at(-1)!;
    // Centred where it was dropped, as an item that can be picked up again.
    expect([dropped.x + dropped.w / 2, dropped.y + dropped.h / 2]).toEqual([200, 200]);
    expect(dropped.role).toEqual({ class: 'item', item: 'potion', qty: 1 });
    expect(score(session, 'p0')).toBe(0);
  });
});

describe('splitting off', () => {
  it('won’t make one party of everyone, or of players standing in different places', () => {
    const { game, session, beach } = withBeach();
    expect(splitOff(game, session, ['p0', 'p1', 'p2'])).toBe('That’s everyone: select only the ones who split off');
    sendPlayers(game, session, ['p0'], beach);
    const st = Object.values(session.worlds!)[0];
    expect(st.parties).toHaveLength(2);
    expect(splitOff(game, session, ['p0', 'p1', 'p2'])).toBe('That’s everyone: 🤝 Regroup (G) brings everyone together');
    expect(splitOff(game, session, ['p0', 'p1'])).toBe('They aren’t all in one place: split off players standing together (or move them together first)');
    expect(st.parties).toHaveLength(2);
    expect(splitOff(game, session, ['p1'])).toBeNull();
    expect(st.parties.map((p) => p.members)).toEqual([['p2'], ['p0'], ['p1']]);
  });
});

describe('dragging a selection together on the RPG stage', () => {
  it('moves everything by the same amount, no further than keeps all of it on the screen', () => {
    const ann = avatarRange(300, 500);
    const chest = objectRange(1500, 600, 200, 150);
    expect(groupDelta([ann, chest], 100, -50)).toEqual({ dx: 100, dy: -50 });
    // Right: the chest reaches the edge first (1920 − 200 − 1500 = 220), and Ann stops with it.
    expect(groupDelta([ann, chest], 400, 0)).toEqual({ dx: 220, dy: 0 });
    // Left and up: Ann reaches the edge first (75 from it).
    expect(groupDelta([ann, chest], -1000, -1000)).toEqual({ dx: -225, dy: -425 });
    // Down, with the stats strip from y 900: Ann stays clear of it (900 − 75 − 500 = 325), the chest could go 330.
    expect(groupDelta([avatarRange(300, 500, 0, 900), chest], 0, 600)).toEqual({ dx: 0, dy: 325 });
    // One already past an edge isn't pulled back, and only can't go further out.
    const off = objectRange(-50, 100, 200, 100);
    expect(groupDelta([off, ann], -30, 0)).toEqual({ dx: 0, dy: 0 });
    expect(groupDelta([off, ann], 40, 0)).toEqual({ dx: 40, dy: 0 });
  });

  it('moves players and objects as one step, named after them all', () => {
    const { game, session, st } = setup();
    const chest = { ...newShapeEl('rect'), name: 'Chest', x: 800, y: 300 };
    addLive(game, session, chest, 'Chest');
    const before = { ann: { ...st.positions.p0 }, bob: { ...st.positions.p1 } };
    const steps = session.actionLog?.length ?? 0;
    expect(moveGroup(game, session, { p0: { x: 400, y: 600 }, p1: { x: 500, y: 650 } }, { [chest.id]: { x: 900, y: 350 } })).toBe('Move Ann, Bob & Chest');
    expect(session.actionLog).toHaveLength(steps + 1);
    expect(session.actionLog?.at(-1)?.text).toBe('Move Ann, Bob & Chest');
    expect([st.positions.p0.x, st.positions.p0.y, st.positions.p1.x, st.positions.p1.y]).toEqual([400, 600, 500, 650]);
    expect([st.objects[chest.id].x, st.objects[chest.id].y]).toEqual([900, 350]);
    undoAction(session, game);
    const back = Object.values(session.worlds!)[0];
    expect([back.positions.p0.x, back.positions.p0.y, back.positions.p1.x, back.positions.p1.y]).toEqual([before.ann.x, before.ann.y, before.bob.x, before.bob.y]);
    expect(back.objects[chest.id]?.x).toBeUndefined();
    // Nothing that's there: no step.
    expect(moveGroup(game, session, { nobody: { x: 1, y: 1 } }, {})).toBeNull();
  });
});
