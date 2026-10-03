import { describe, expect, it } from 'vitest';
import { newGame, newShapeEl, newTextEl, type Game, type RpgRound, type Session, type World } from './model';
import {
  addScreenBeside,
  audienceSees,
  keepScreen,
  newVariant,
  adoptAdded,
  override,
  copyLook,
  carryObjects,
  screenSlide,
  ensureWorld,
  exitOf,
  focusRef,
  freshObjectIds,
  joinParty,
  mapCrop,
  place,
  standArea,
  mapState,
  moveTo,
  nameParty,
  newRpgRound,
  newScreen,
  newWorld,
  occupiedScreens,
  regroup,
  rpgProblems,
  screenAt,
  screenElements,
  screenGrid,
  splitParty,
  step,
} from './rpg';
import { newSession, rebaseSession } from './session';

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

  it('looks cells up through a grid index the same way', () => {
    const { world } = setup();
    const m = world.maps[0];
    const grid = screenGrid(m);
    for (let c = -1; c <= m.cols; c++) for (let r = -1; r <= m.rows; r++) expect(screenAt(m, c, r, grid)).toBe(screenAt(m, c, r));
    expect(screenAt(m, 1, 1, grid)?.name).toBe('B2');
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

  it('drops a party whose players all left: viewers follow the one left, and split view is off', () => {
    const { game, session, world, round } = setup();
    const st = ensureWorld(session, game, round)!;
    splitParty(st, ['b']);
    step(game, st, world, 'e'); // Bob's party, followed by viewers
    st.split = true;
    session.players = session.players.filter((p) => p.id !== 'b');
    ensureWorld(session, game, round);
    expect(st.parties.map((p) => p.members)).toEqual([['a']]);
    expect(st.parties[0].name).toBe('Party');
    expect(nameOf(world, focusRef(st))).toBe('A1');
    expect(st.split).toBe(false);
    // Put back, Bob joins the party viewers follow, where it stands.
    session.players.push({ id: 'b', name: 'Bob', color: '#3cb44b', startScore: 0 });
    ensureWorld(session, game, round);
    expect(st.parties.map((p) => p.members)).toEqual([['a', 'b']]);
    expect(nameOf(world, st.positions.b)).toBe('A1');
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

  it('a look made during play starts its objects as they are by now (a key already picked up stays picked up)', () => {
    const { game, session, world, round } = setup();
    const st = ensureWorld(session, game, round)!;
    const a1 = world.maps[0].screens[0];
    const key = newTextEl('Key');
    a1.slide.elements.push(key);
    override(st, key.id).taken = true;
    const { look, ids } = copyLook(st, a1, 'On fire');
    carryObjects(st, ids);
    const copy = look.slide.elements[0];
    expect(copy.id).not.toBe(key.id);
    expect(st.objects[copy.id]).toEqual({ taken: true });
    // Its own copy: taking it back on the new look doesn't change the original's.
    st.objects[copy.id].taken = false;
    expect(st.objects[key.id].taken).toBe(true);
  });

  it('editing a look live keeps objects dropped in play on every look (not only the one being edited)', () => {
    const { game, session, world, round } = setup();
    const st = ensureWorld(session, game, round)!;
    const a1 = world.maps[0].screens[0];
    const fire = newVariant(st, a1, 'On fire');
    a1.variants = [fire];
    st.variant = { [a1.id]: fire.id };
    const sword = newTextEl('Sword');
    st.added[a1.id] = [sword];
    adoptAdded(st, a1, fire.slide);
    expect(fire.slide.elements.some((e) => e.id === sword.id)).toBe(true);
    st.variant = {};
    expect(screenElements(st, a1, true).some((e) => e.id === sword.id)).toBe(true);
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

describe('RPG: screens moved in the editor while the game is on', () => {
  it('keeps a screen where the editor has it now (another cell, or another map)', () => {
    const { game, session, world, round } = setup();
    const st = ensureWorld(session, game, round)!;
    const editor = JSON.parse(JSON.stringify(game)) as Game;
    const [over, shop] = editor.worlds![0].maps;
    const b1 = over.screens.find((s) => s.name === 'B1')!;
    const c1 = over.screens.find((s) => s.name === 'C1')!;
    // Swapped B1 and C1 in the editor.
    [b1.col, c1.col] = [c1.col, b1.col];
    expect(keepScreen(game, editor, world.id, at(world, 'B1'), st)).toBe('Kept “B1” in the game');
    expect([screenAt(over, 2, 0)?.name, screenAt(over, 1, 0)?.name]).toEqual(['B1', 'C1']);
    // Moved to the shop map: kept there, not added to the overworld again.
    over.screens = over.screens.filter((s) => s.id !== b1.id);
    shop.screens.push({ ...b1, col: 0, row: 1 });
    keepScreen(game, editor, world.id, at(world, 'B1'), st);
    expect(over.screens.some((s) => s.name === 'B1')).toBe(false);
    expect(shop.screens.filter((s) => s.name === 'B1').map((s) => [s.col, s.row])).toEqual([[0, 1]]);
  });

  it('resumes with the party on its screen wherever it went, or at the start when it was deleted', () => {
    const { game, session, world, round } = setup();
    const st = ensureWorld(session, game, round)!;
    moveTo(game, st, world, at(world, 'B1'));
    const edited = JSON.parse(JSON.stringify(game)) as Game;
    const [over, shop] = edited.worlds![0].maps;
    const b1 = over.screens.find((s) => s.name === 'B1')!;
    over.screens = over.screens.filter((s) => s !== b1);
    shop.screens.push({ ...b1, col: 1, row: 0 });
    rebaseSession(session, game, edited);
    expect(Object.values(st.positions).map((p) => [p.map, p.screen])).toEqual([
      [shop.id, b1.id],
      [shop.id, b1.id],
    ]);
    const gone = JSON.parse(JSON.stringify(edited)) as Game;
    gone.worlds![0].maps[1].screens.pop();
    rebaseSession(session, edited, gone);
    expect(nameOf(gone.worlds![0], Object.values(st.positions)[0])).toBe('A1');
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
    expect(rpgProblems(game, round, 'Quest', 0)).toContainEqual({
      text: 'Quest: a way out of “A1” leads nowhere',
      tab: 0,
      level: 'warn',
      place: { tab: 'world', world: world.id, map: world.maps[0].id, screen: a1.id },
    });
    world.maps[0].screens[1].exits = { e: { kind: 'warp', to: at(world, 'A1') }, w: { kind: 'warp', to: { map: world.maps[1].id, screen: 'gone' } } };
    world.maps[0].screens[2].exits = { s: { kind: 'warp', to: { map: world.maps[1].id, screen: 'gone' } } };
    const [b1, c1] = [world.maps[0].screens[1].name, world.maps[0].screens[2].name];
    expect(rpgProblems(game, round, "Quest", 0).map((p) => p.text)).toContain(`Quest: 3 ways out lead nowhere (from “A1”, “${b1}” and 1 more)`);
    expect(c1).toBe("C1");
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
    const a1 = world.maps[0].screens[0];
    expect(rpgProblems(game, round, 'Quest', 0)).toEqual([
      {
        text: `Quest: 2 objects have a button or setting that points nowhere (on “${a1.name}”)`,
        tab: 0,
        level: 'warn',
        place: { tab: 'world', world: world.id, map: world.maps[0].id, screen: a1.id, look: undefined, inSlide: true, element: pile.id },
      },
    ]);
    a1.slide.elements = a1.slide.elements.filter((e) => e !== pile);
    sign.name = 'Sign';
    expect(rpgProblems(game, round, 'Quest', 0).map((p) => p.text)).toEqual([`Quest: “Sign” on “${a1.name}” has a button or setting that points nowhere`]);
  });

  it('names the screen a doorway that leads nowhere is on, in any look, and goes to it', () => {
    const { game, world, round } = setup();
    const b1 = world.maps[0].screens.find((s) => s.name === 'B1')!;
    const night = newVariant(undefined, b1, 'Night');
    b1.variants = [night];
    const door = newTextEl('🚪');
    door.role = { class: 'doorway' };
    night.slide.elements.push(door);
    expect(rpgProblems(game, round, 'Quest', 0)).toEqual([
      {
        text: 'Quest: the doorway on “B1” leads nowhere',
        tab: 0,
        level: 'warn',
        place: { tab: 'world', world: world.id, map: world.maps[0].id, screen: b1.id, look: night.id, inSlide: true, element: door.id },
      },
    ]);
    const other = newTextEl('🚪');
    other.role = { class: 'doorway', to: { map: 'gone', screen: 'gone' } };
    world.maps[0].screens[0].slide.elements.push(other);
    expect(rpgProblems(game, round, 'Quest', 0).map((p) => p.text)).toEqual([`Quest: 2 doorways lead nowhere (on “${world.maps[0].screens[0].name}” and “B1”)`]);
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

describe('RPG: joining a party, and naming one', () => {
  it('takes players into a party where it stands, leaving their own party behind (it goes once empty)', () => {
    const { game, session, world, round } = setup();
    session.players.push({ id: 'c', name: 'Cat', color: '#4363d8', startScore: 0 });
    const st = ensureWorld(session, game, round)!;
    moveTo(game, st, world, at(world, 'Counter'), { players: ['a'] });
    const [rest, ann] = st.parties;
    st.active = rest.id;
    // Bob joins Ann's party: he goes to the shop, and viewers follow them.
    joinParty(game, st, world, ['b'], ann.id);
    expect(st.parties.map((p) => p.members)).toEqual([['c'], ['a', 'b']]);
    expect(nameOf(world, st.positions.b)).toBe('Counter');
    // Beside her, not on top of her.
    expect(Math.abs(st.positions.b.x - st.positions.a.x)).toBeGreaterThanOrEqual(150);
    expect(st.active).toBe(ann.id);
    // Cat too: her party (now empty) goes, and with one party left there's no split view.
    st.split = true;
    joinParty(game, st, world, ['c'], ann.id);
    expect(st.parties.map((p) => p.members)).toEqual([['a', 'b', 'c']]);
    expect(st.parties[0].name).toBe('Party');
    expect(st.split).toBe(false);
    // Joining a party they're already in changes nothing.
    joinParty(game, st, world, ['a'], ann.id);
    expect(st.parties.map((p) => p.members)).toEqual([['a', 'b', 'c']]);
  });

  it('keeps a name the host gave a party when parties split, merge and regroup', () => {
    const { game, session, world, round } = setup();
    session.players.push({ id: 'c', name: 'Cat', color: '#4363d8', startScore: 0 });
    const st = ensureWorld(session, game, round)!;
    nameParty(st, st.parties[0].id, 'Heroes');
    splitParty(st, ['c']);
    expect(st.parties.map((p) => p.name)).toEqual(['Heroes', 'Party 2']);
    moveTo(game, st, world, at(world, 'Counter'), { players: ['b'] });
    expect(st.parties.map((p) => p.name)).toEqual(['Heroes', 'Party 2', 'Party 3']);
    st.active = st.parties[0].id;
    regroup(game, st, world, ['a', 'b', 'c']);
    expect(st.parties.map((p) => p.name)).toEqual(['Heroes']);
  });
});

describe('RPG: where arriving players stand', () => {
  /** Four players on a 3×3 map, all in the middle screen. */
  function four() {
    const s = setup();
    s.game.players.push({ id: 'c', name: 'Cy', color: '#4363d8' }, { id: 'd', name: 'Dee', color: '#f58231' });
    const over = s.world.maps[0];
    over.screens = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) over.screens.push(newScreen(c, r, `${c},${r}`));
    over.cols = over.rows = 3;
    const session = newSession(s.game);
    const st = ensureWorld(session, s.game, s.round)!;
    moveTo(s.game, st, s.world, at(s.world, '1,1'), {});
    return { ...s, session, st };
  }
  const spots = (st: ReturnType<typeof four>['st']) => ['a', 'b', 'c', 'd'].map((id) => ({ x: st.positions[id].x, y: st.positions[id].y }));
  const apart = (ps: { x: number; y: number }[]) => ps.every((p, i) => ps.every((q, j) => i === j || Math.abs(p.x - q.x) >= 150 || Math.abs(p.y - q.y) >= 150));

  it('walking north, they stand clear of the stats strip along the bottom', () => {
    const { game, world, st } = four();
    expect(step(game, st, world, 'n')).toBeNull();
    const area = standArea(game);
    expect(spots(st).every((p) => p.y <= area.bottom && p.y <= 1080 - 150 - 80)).toBe(true);
    expect(apart(spots(st))).toBe(true);
  });

  it('going into a corner, they stand side by side (not pushed onto each other at the edge)', () => {
    const { game, world, st } = four();
    expect(step(game, st, world, 'nw')).toBeNull();
    const ps = spots(st);
    expect(new Set(ps.map((p) => p.x)).size).toBe(4);
    expect(apart(ps)).toBe(true);
    expect(ps.every((p) => p.x >= 75 && p.x <= 1845 && p.y >= standArea(game).top)).toBe(true);
  });

  it('a column too long for the screen goes on in a second one, further in', () => {
    const { game, world, st } = four();
    const many = Array.from({ length: 6 }, (_, i) => `x${i}`);
    place(game, st, world, many, at(world, '0,1'), 'e');
    const ps = many.map((id) => st.positions[id]);
    expect(new Set(ps.map((p) => p.x)).size).toBe(2);
    expect(apart(ps)).toBe(true);
    expect(ps.every((p) => p.y >= standArea(game).top && p.y <= standArea(game).bottom)).toBe(true);
  });
});

describe('RPG: the viewers’ map of a big world', () => {
  it('shows the screens they know, with one cell around them', () => {
    const { world, game, session, round } = setup();
    const over = world.maps[0];
    over.screens = [];
    for (let r = 0; r < 20; r++) for (let c = 0; c < 20; c++) over.screens.push(newScreen(c, r, `${c},${r}`));
    over.cols = over.rows = 20;
    const st = ensureWorld(session, game, round)!;
    // Only the start (0,0) known.
    expect(mapCrop(st, over)).toEqual({ col: 0, row: 0, cols: 2, rows: 2 });
    st.knowledge[over.screens[5 * 20 + 7].id] = 'discovered';
    expect(mapCrop(st, over)).toEqual({ col: 0, row: 0, cols: 9, rows: 7 });
    over.visibility = 'full';
    expect(mapCrop(st, over)).toEqual({ col: 0, row: 0, cols: 20, rows: 20 });
    over.visibility = 'hidden';
    expect(mapCrop(st, over)).toBeNull();
  });
});
