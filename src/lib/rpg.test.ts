import { describe, expect, it } from 'vitest';
import { newGame, newShapeEl, newTextEl, type Game, type RpgRound, type Session, type World } from './model';
import {
  audienceSees,
  ensureWorld,
  exitOf,
  focusRef,
  mapState,
  moveTo,
  newRpgRound,
  newScreen,
  newWorld,
  occupiedScreens,
  regroup,
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
