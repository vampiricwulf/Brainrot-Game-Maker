import { describe, expect, it } from 'vitest';
import { newGame, newShapeEl, newTextEl, type Game, type RpgRound, type Session, type World } from './model';
import {
  addScreenBeside,
  audienceSees,
  keepScreen,
  newVariant,
  screenSlide,
  ensureWorld,
  exitOf,
  focusRef,
  freshObjectIds,
  mapState,
  moveTo,
  newRpgRound,
  newScreen,
  newWorld,
  occupiedScreens,
  regroup,
  rpgProblems,
  screenAt,
  screenElements,
  splitParty,
  step,
} from './rpg';
import { newSession } from './session';

/** A 3×2 overworld (A1 B1 C1 / A2 B2 —) plus a one-screen shop map, and two players. */
function setup(): { game: Game; session: Session; world: World; round: RpgRound } {
  const game = newGame();
  game.players = [
    { id: 'a', name: 'Ann', color: '#e6194b' },
    { id: 'b', name: 'Bob', color: '#3cb44b' },
  ];
  const world = newWorld('Land');
  const over = world.maps[0];
  over.screens = [newScreen(0, 0, 'A1'), newScreen(1, 0, 'B1'), newScreen(2, 0, 'C1'), newScreen(0, 1, 'A2'), newScreen(1, 1, 'B2')];
  over.cols = 3;
  over.rows = 2;
  const shop = { ...world.maps[0], id: 'shopmap', name: 'Shop', screens: [newScreen(0, 0, 'Counter')], cols: 1, rows: 1, visibility: 'hidden' as const };
  world.maps.push(shop);
  game.worlds = [world];
  const round = newRpgRound(game, 'Quest');
  game.rounds.push(round);
  const session = newSession(game);
  return { game, session, world, round };
}
const at = (world: World, name: string) => {
  for (const m of world.maps) for (const s of m.screens) if (s.name === name) return { map: m.id, screen: s.id };
  throw new Error(name);
};
const nameOf = (world: World, ref: { screen: string } | null) => world.maps.flatMap((m) => m.screens).find((s) => s.id === ref?.screen)?.name;

describe('RPG: exits', () => {
  it('finds neighbors on the grid in 8 directions', () => {
    const { world } = setup();
    const m = world.maps[0];
    const a1 = screenAt(m, 0, 0)!;
    const e = exitOf(m, a1, 'e');
    expect(e.kind === 'open' && nameOf(world, e.to)).toBe('B1');
    const se = exitOf(m, a1, 'se');
    expect(se.kind === 'open' && nameOf(world, se.to)).toBe('B2');
    expect(exitOf(m, a1, 'n').kind).toBe('none');
    expect(exitOf(m, screenAt(m, 2, 0)!, 's').kind).toBe('none'); // C2 is empty
  });

  it('respects blocked sides, warps, no diagonals and wrapping', () => {
    const { world } = setup();
    const m = world.maps[0];
    const a1 = screenAt(m, 0, 0)!;
    a1.exits = { e: { kind: 'blocked', note: 'A wall' }, s: { kind: 'warp', to: at(world, 'Counter') } };
    expect(exitOf(m, a1, 'e')).toEqual({ kind: 'blocked', note: 'A wall' });
    const s = exitOf(m, a1, 's');
    expect(s.kind === 'warp' && nameOf(world, s.to)).toBe('Counter');
    m.diagonals = false;
    expect(exitOf(m, a1, 'se').kind).toBe('none');
    m.wrap = true;
    const w = exitOf(m, a1, 'w');
    expect(w.kind === 'open' && nameOf(world, w.to)).toBe('C1');
  });
});

describe('RPG: moving', () => {
  it('starts everyone together on the first screen, which counts as visited', () => {
    const { game, session, world, round } = setup();
    const st = ensureWorld(session, game, round)!;
    expect(nameOf(world, focusRef(st))).toBe('A1');
    expect(st.parties).toHaveLength(1);
    expect(st.parties[0].members).toEqual(['a', 'b']);
    expect(st.knowledge[at(world, 'A1').screen]).toBe('visited');
  });

  it('steps the party, entering from the opposite edge side by side', () => {
    const { game, session, world, round } = setup();
    const st = ensureWorld(session, game, round)!;
    expect(step(game, st, world, 'e')).toBeNull();
    expect(nameOf(world, focusRef(st))).toBe('B1');
    const [pa, pb] = [st.positions.a, st.positions.b];
    expect(pa.x).toBeLessThan(300); // came in on the west edge
    expect(pa.x).toBe(pb.x);
    expect(Math.abs(pa.y - pb.y)).toBeGreaterThanOrEqual(150);
    expect(step(game, st, world, 'n')).toMatch(/Nothing to the north/);
    world.maps[0].screens[1].exits = { e: { kind: 'blocked', note: 'Lava' } };
    expect(step(game, st, world, 'e')).toBe('Blocked: Lava');
  });

  it('arrives at a doorway’s spawn point on another map', () => {
    const { game, session, world, round } = setup();
    const st = ensureWorld(session, game, round)!;
    const counter = world.maps[1].screens[0];
    const spawn = { ...newShapeEl('rect'), x: 100, y: 200, w: 40, h: 40, role: { class: 'spawn' as const } };
    counter.slide.elements.push(spawn);
    moveTo(game, st, world, at(world, 'Counter'), { arriveAt: spawn.id });
    expect(nameOf(world, focusRef(st))).toBe('Counter');
    expect(Math.abs(st.positions.a.y - 220)).toBeLessThan(2);
  });

  it('splits a player off, follows either party, and regroups', () => {
    const { game, session, world, round } = setup();
    const st = ensureWorld(session, game, round)!;
    splitParty(st, ['b']);
    expect(st.parties.map((p) => p.members)).toEqual([['a'], ['b']]);
    step(game, st, world, 'e'); // moves the active party: Bob
    expect(nameOf(world, st.positions.b)).toBe('B1');
    expect(nameOf(world, st.positions.a)).toBe('A1');
    expect(occupiedScreens(st).map((r) => nameOf(world, r))).toEqual(['B1', 'A1']);
    regroup(game, st, world, ['a', 'b']);
    expect(st.parties).toHaveLength(1);
    expect(nameOf(world, st.positions.a)).toBe('B1');
  });

  it('adds players who join mid-game to the active party where it stands', () => {
    const { game, session, world, round } = setup();
    const st = ensureWorld(session, game, round)!;
    step(game, st, world, 'e');
    session.players.push({ id: 'c', name: 'Cat', color: '#4363d8', startScore: 0 });
    ensureWorld(session, game, round);
    expect(nameOf(world, st.positions.c)).toBe('B1');
    expect(st.parties[0].members).toContain('c');
  });
});

describe('RPG: what the audience sees', () => {
  it('never shows secret objects, hotspots or spawn points until revealed', () => {
    const { game, session, round, world } = setup();
    const st = ensureWorld(session, game, round)!;
    const scr = world.maps[0].screens[0];
    const coin = { ...newTextEl('🪙'), secret: true };
    const door = { ...newShapeEl('rect'), hotspot: true, role: { class: 'doorway' as const } };
    const sign = newTextEl('Welcome');
    scr.slide.elements.push(coin, door, sign);
    expect(screenElements(st, scr, true).map((e) => e.id)).toEqual([sign.id]);
    // The host sees everything, hidden things marked secret (drawn faded).
    expect(screenElements(st, scr, false).filter((e) => e.secret).map((e) => e.id)).toEqual([coin.id, door.id]);
    st.objects[coin.id] = { shown: true };
    expect(audienceSees(coin, st.objects[coin.id])).toBe(true);
    st.objects[coin.id] = { taken: true };
    expect(screenElements(st, scr, false).some((e) => e.id === coin.id)).toBe(false);
  });

  it('shows the map per its setting: everything, discovered screens only, or nothing', () => {
    const { game, session, round, world } = setup();
    const st = ensureWorld(session, game, round)!;
    const m = world.maps[0];
    const [a1, b1] = [m.screens[0], m.screens[1]];
    m.visibility = 'discovered';
    expect([mapState(st, m, a1), mapState(st, m, b1)]).toEqual(['visited', null]);
    m.visibility = 'full';
    expect(mapState(st, m, b1)).toBe('discovered');
    m.visibility = 'hidden';
    expect(mapState(st, m, a1)).toBeNull();
    m.visibility = 'discovered';
    m.revealNeighbors = true;
    moveTo(game, st, world, { map: m.id, screen: a1.id });
    expect(mapState(st, m, b1)).toBe('discovered');
  });
});

describe('RPG: improvising', () => {
  it('switches a screen to another look, copied with fresh object ids', () => {
    const { game, session, world, round } = setup();
    const st = ensureWorld(session, game, round)!;
    const a1 = world.maps[0].screens[0];
    a1.slide.elements.push(newTextEl('Village'));
    const fire = newVariant(st, a1, 'On fire');
    a1.variants = [fire];
    expect(fire.slide.elements[0].id).not.toBe(a1.slide.elements[0].id);
    expect(screenSlide(st, a1)).toBe(a1.slide);
    st.variant = { [a1.id]: fire.id };
    expect(screenSlide(st, a1)).toBe(fire.slide);
    expect(screenElements(st, a1, true)[0].id).toBe(fire.slide.elements[0].id);
  });

  it('points a copied look’s Reveal and Hide buttons at its own copies', () => {
    const { world } = setup();
    const a1 = world.maps[0].screens[0];
    const potion = newTextEl('Potion');
    const chest = newShapeEl('rect');
    chest.role = { class: 'interactable', actions: [{ id: 'r', do: 'reveal', object: potion.id }] };
    a1.slide.elements.push(potion, chest);
    const look = newVariant(undefined, a1, 'Look 2');
    const [p2, c2] = look.slide.elements;
    expect(p2.id).not.toBe(potion.id);
    expect(c2.role?.actions?.[0]).toMatchObject({ do: 'reveal', object: p2.id });
    // A duplicated screen: its own slide and every look, sharing one set of new ids.
    a1.variants = [look];
    const copy = JSON.parse(JSON.stringify(a1)) as typeof a1;
    freshObjectIds([copy.slide, ...copy.variants!.map((v) => v.slide)]);
    const [cp, cc] = copy.slide.elements;
    expect([cp.id, cc.id]).not.toContain(potion.id);
    expect(cc.role?.actions?.[0]).toMatchObject({ object: cp.id });
    expect(copy.variants![0].slide.elements[1].role?.actions?.[0]).toMatchObject({ object: copy.variants![0].slide.elements[0].id });
    // A look from an older save shares the screen's own objects: in the copy, they share the new ones.
    const own = JSON.parse(JSON.stringify(a1.slide)) as typeof a1.slide;
    const old = JSON.parse(JSON.stringify(a1.slide)) as typeof a1.slide;
    freshObjectIds([own, old]);
    expect(old.elements.map((e) => e.id)).toEqual(own.elements.map((e) => e.id));
    expect(own.elements[1].role?.actions?.[0]).toMatchObject({ object: own.elements[0].id });
  });

  it('adds a screen beside the current one, growing the map past its edge', () => {
    const { world } = setup();
    const m = world.maps[0];
    const c1 = screenAt(m, 2, 0)!;
    expect(addScreenBeside(m, c1, 'w')).toBeNull(); // B1 is there
    const d1 = addScreenBeside(m, c1, 'e', 'D1')!;
    expect([d1.col, d1.row, m.cols]).toEqual([3, 0, 4]);
    expect(exitOf(m, c1, 'e').kind).toBe('open');
    expect(addScreenBeside(m, screenAt(m, 0, 0)!, 'n')).toBeNull(); // off the top
  });

  it('keeps a screen from the game being played in the editor’s copy, with the objects added in play', () => {
    const { game, session, world, round } = setup();
    const st = ensureWorld(session, game, round)!;
    const editor = JSON.parse(JSON.stringify(game)) as Game;
    const m = world.maps[0];
    const d1 = addScreenBeside(m, screenAt(m, 2, 0)!, 'e', 'D1')!;
    const sign = newTextEl('Improvised');
    st.added[d1.id] = [sign];
    expect(keepScreen(game, editor, world.id, { map: m.id, screen: d1.id }, st)).toBe('Kept “D1” in the game');
    const kept = editor.worlds![0].maps[0].screens.find((s) => s.id === d1.id)!;
    expect(kept.slide.elements.map((e) => e.id)).toEqual([sign.id]);
    expect(editor.worlds![0].maps[0].cols).toBe(4);
    // Revealed and dragged in play: kept that way.
    st.objects[sign.id] = { shown: true, x: 50, y: 60 };
    keepScreen(game, editor, world.id, { map: m.id, screen: d1.id }, st);
    const again = editor.worlds![0].maps[0].screens.find((s) => s.id === d1.id)!.slide.elements[0];
    expect([again.x, again.y, again.secret]).toEqual([50, 60, undefined]);
    // Kept again: replaced, not duplicated.
    keepScreen(game, editor, world.id, { map: m.id, screen: d1.id }, st);
    expect(editor.worlds![0].maps[0].screens.filter((s) => s.id === d1.id)).toHaveLength(1);
  });
});

describe('RPG: things pointing at deleted screens, items and shops', () => {
  it('won’t step through a way out whose screen was deleted, and the checklist lists it', () => {
    const { game, session, world, round } = setup();
    const st = ensureWorld(session, game, round)!;
    const a1 = world.maps[0].screens[0];
    a1.exits = { n: { kind: 'warp', to: at(world, 'Counter') } };
    world.maps[1].screens = [];
    expect(step(game, st, world, 'n')).toContain('leads nowhere');
    expect(nameOf(world, focusRef(st))).toBe('A1');
    expect(rpgProblems(game, round, 'Quest', 0).map((p) => p.text)).toContain('Quest: 1 way(s) out lead nowhere');
  });

  it('lists objects whose item or buttons point nowhere', () => {
    const { game, world, round } = setup();
    game.items = [{ id: 'potion', name: 'Potion', stackable: true }];
    const pile = newTextEl('Potion');
    pile.role = { class: 'item', item: 'potion' };
    const sign = newShapeEl('rect');
    sign.role = { class: 'interactable', actions: [{ id: 'm', do: 'move', to: at(world, 'B2') }] };
    world.maps[0].screens[0].slide.elements.push(pile, sign);
    expect(rpgProblems(game, round, 'Quest', 0)).toEqual([]);
    game.items = [];
    world.maps[0].screens = world.maps[0].screens.filter((s) => s.name !== 'B2');
    expect(rpgProblems(game, round, 'Quest', 0).map((p) => p.text)).toEqual(['Quest: 2 object(s) with a button or setting that points nowhere']);
  });
});

describe('RPG: some players moving on their own', () => {
  it('splits them off into their own party, and merges them into a party already there', () => {
    const { game, session, world, round } = setup();
    session.players.push({ id: 'c', name: 'Cat', color: '#4363d8', startScore: 0 });
    const st = ensureWorld(session, game, round)!;
    // Ann alone through a doorway to the shop: she's a party of her own, and the audience follows her.
    moveTo(game, st, world, at(world, 'Counter'), { players: ['a'] });
    expect(st.parties.map((p) => p.members)).toEqual([['b', 'c'], ['a']]);
    expect(st.parties.map((p) => p.name)).toEqual(['Party 1', 'Party 2']);
    expect(nameOf(world, focusRef(st))).toBe('Counter');
    // Bob follows her: he joins her party.
    moveTo(game, st, world, at(world, 'Counter'), { players: ['b'] });
    expect(st.parties.map((p) => p.members)).toEqual([['c'], ['a', 'b']]);
    // Cat, the whole of her party, goes elsewhere: her party stays hers.
    const cats = st.parties[0].id;
    moveTo(game, st, world, at(world, 'B2'), { players: ['c'] });
    expect(st.parties.find((p) => p.members.includes('c'))?.id).toBe(cats);
    // …and then to the shop too: everyone is one party again.
    moveTo(game, st, world, at(world, 'Counter'), { players: ['c'] });
    expect(st.parties.map((p) => p.members)).toEqual([['a', 'b', 'c']]);
    expect(st.parties[0].name).toBe('Party');
    expect(st.split).toBe(false);
  });
});

