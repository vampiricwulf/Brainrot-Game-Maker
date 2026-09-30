import { describe, expect, it } from 'vitest';
import { newGame, newShapeEl, type Game, type RpgRound, type World, type WorldMap } from './model';
import { exitOf, newRpgRound, newScreen, newWorld, screenAt, startRef } from './rpg';
import {
  copyScreen,
  deleteLine,
  duplicateLook,
  duplicateMap,
  freeCells,
  insertLine,
  makeMainLook,
  moveLook,
  moveScreens,
  moveToMap,
  refsText,
  refsTo,
  toggleSeam,
} from './worldedit';

/** A 3×2 overworld (A1 B1 C1 / A2 B2 —) plus a one-screen cave map. */
function setup(): { game: Game; world: World; over: WorldMap; cave: WorldMap; round: RpgRound } {
  const game = newGame();
  const world = newWorld('Land');
  const over = world.maps[0];
  over.screens = [newScreen(0, 0, 'A1'), newScreen(1, 0, 'B1'), newScreen(2, 0, 'C1'), newScreen(0, 1, 'A2'), newScreen(1, 1, 'B2')];
  over.cols = 3;
  over.rows = 2;
  const cave = { ...over, id: 'cave', name: 'Cave', screens: [newScreen(0, 0, 'Mouth')], cols: 2, rows: 1 };
  world.maps.push(cave);
  game.worlds = [world];
  const round = newRpgRound(game, 'Quest');
  game.rounds.push(round);
  return { game, world, over, cave, round };
}
const named = (m: WorldMap, name: string) => m.screens.find((s) => s.name === name)!;
/** The map as rows of names ('·' for an empty cell). */
const layout = (m: WorldMap) =>
  Array.from({ length: m.rows }, (_, r) => Array.from({ length: m.cols }, (_, c) => screenAt(m, c, r)?.name ?? '·').join(' '));

describe('world editor: moving screens on the grid', () => {
  it('moves a screen to an empty cell, and swaps it with a screen in the way', () => {
    const { over } = setup();
    const b1 = named(over, 'B1');
    expect(moveScreens(over, [b1.id], 1, 1)).toBe(true);
    expect(layout(over)).toEqual(['A1 · C1', 'A2 B2 B1']);
    expect(moveScreens(over, [b1.id], -2, 0)).toBe(true);
    expect(layout(over)).toEqual(['A1 · C1', 'B1 B2 A2']);
    // Its id stays, so what points at it still does.
    expect(named(over, 'B1')).toBe(b1);
  });

  it('refuses a move off the grid unless the map may grow (past the left edge, everything shifts along)', () => {
    const { over } = setup();
    const c1 = named(over, 'C1');
    expect(moveScreens(over, [c1.id], 1, 0)).toBe(false);
    expect(moveScreens(over, [c1.id], 1, 0, true)).toBe(true);
    expect(layout(over)).toEqual(['A1 B1 · C1', 'A2 B2 · ·']);
    expect(moveScreens(over, [named(over, 'A2').id], -1, 0, true)).toBe(true);
    expect(layout(over)).toEqual(['· A1 B1 · C1', 'A2 · B2 · ·']);
    // Never past the largest map.
    over.cols = 16;
    expect(moveScreens(over, [c1.id], 16 - c1.col, 0, true)).toBe(false);
  });

  it('moves several screens as a block, keeping their shape; screens in the way take the cells they left', () => {
    const { over } = setup();
    const ids = [named(over, 'A1').id, named(over, 'A2').id];
    expect(moveScreens(over, ids, 1, 0)).toBe(true);
    expect(layout(over)).toEqual(['B1 A1 C1', 'B2 A2 ·']);
    // A row moved one along: the screen at its end goes round to the front.
    expect(moveScreens(over, [named(over, 'B1').id, named(over, 'A1').id], 1, 0)).toBe(true);
    expect(layout(over)).toEqual(['C1 B1 A1', 'B2 A2 ·']);
    expect(moveScreens(over, ids, 0, 1)).toBe(false); // A2 would be off the bottom
  });

  it('finds free cells in reading order, growing a full map', () => {
    const { over } = setup();
    expect(freeCells(over, 1)).toEqual([[2, 1]]);
    expect(freeCells(over, 2, 2, 1)).toEqual([[2, 1], [0, 2]]);
    expect(over.rows).toBe(3);
  });

  it('inserts and deletes rows and columns, moving the screens after them', () => {
    const { over } = setup();
    expect(insertLine(over, 'col', 0)).toBe(true);
    expect(layout(over)).toEqual(['· A1 B1 C1', '· A2 B2 ·']);
    expect(insertLine(over, 'row', 1)).toBe(true);
    expect(layout(over)).toEqual(['· A1 B1 C1', '· · · ·', '· A2 B2 ·']);
    expect(deleteLine(over, 'col', 2).map((s) => s.name)).toEqual(['B1', 'B2']);
    expect(layout(over)).toEqual(['· A1 C1', '· · ·', '· A2 ·']);
    expect(deleteLine(over, 'row', 1)).toEqual([]);
    expect(layout(over)).toEqual(['· A1 C1', '· A2 ·']);
  });
});

describe('world editor: between maps', () => {
  it('moves a screen to another map; the start, ways out, doorways and move buttons follow it', () => {
    const { game, world, over, cave, round } = setup();
    const b2 = named(over, 'B2');
    round.start = { map: over.id, screen: b2.id };
    named(over, 'A1').exits = { e: { kind: 'warp', to: { map: over.id, screen: b2.id } } };
    const door = newShapeEl('rect');
    door.role = { class: 'doorway', to: { map: over.id, screen: b2.id }, actions: [{ id: 'm', do: 'move', to: { map: over.id, screen: b2.id } }] };
    named(cave, 'Mouth').slide.elements.push(door);
    expect(refsText(refsTo(game, world, new Set([b2.id])))).toBe('1 doorway, 1 way out and 1 button');
    expect(moveToMap(game, world, b2, over, cave)).toBe(true);
    expect(layout(cave)).toEqual(['Mouth B2']);
    expect(over.screens).not.toContain(b2);
    const there = { map: cave.id, screen: b2.id };
    expect(startRef(world, round)).toEqual(there);
    expect(named(over, 'A1').exits?.e).toEqual({ kind: 'warp', to: there });
    expect([door.role.to, door.role.actions![0]]).toMatchObject([there, { to: there }]);
    // A taken cell refuses.
    expect(moveToMap(game, world, named(over, 'A1'), over, cave, [0, 0])).toBe(false);
  });

  it('copies a screen with fresh ids and the grid’s ways out', () => {
    const { over } = setup();
    const a1 = named(over, 'A1');
    a1.exits = { e: { kind: 'blocked' } };
    a1.variants = [{ id: 'v', name: 'Night', slide: { background: {}, elements: [newShapeEl('rect')] } }];
    const copy = copyScreen(a1);
    expect([copy.name, copy.exits]).toEqual(['A1 (copy)', undefined]);
    expect(copy.id).not.toBe(a1.id);
    expect(copy.variants![0].id).not.toBe('v');
    expect(copy.variants![0].slide.elements[0].id).not.toBe(a1.variants[0].slide.elements[0].id);
  });

  it('duplicates a map: its own ways out, doorways and arrival points point at the copies', () => {
    const { world, over, cave } = setup();
    const a1 = named(over, 'A1');
    const b1 = named(over, 'B1');
    const spawn = newShapeEl('ellipse');
    spawn.role = { class: 'spawn' };
    b1.slide.elements.push(spawn);
    const door = newShapeEl('rect');
    door.role = { class: 'doorway', to: { map: over.id, screen: b1.id }, arrive: spawn.id };
    const out = newShapeEl('rect');
    out.role = { class: 'doorway', to: { map: cave.id, screen: cave.screens[0].id } };
    a1.slide.elements.push(door, out);
    a1.exits = { s: { kind: 'warp', to: { map: over.id, screen: b1.id } } };
    const copy = duplicateMap(world, over);
    expect(world.maps.map((m) => m.name)).toEqual(['Overworld', 'Overworld (copy)', 'Cave']);
    const ca1 = named(copy, 'A1');
    const cb1 = named(copy, 'B1');
    expect(ca1.id).not.toBe(a1.id);
    const [cdoor, cout] = ca1.slide.elements;
    expect(cdoor.role).toMatchObject({ to: { map: copy.id, screen: cb1.id }, arrive: cb1.slide.elements[0].id });
    expect(cb1.slide.elements[0].id).not.toBe(spawn.id);
    expect(cout.role?.to).toEqual({ map: cave.id, screen: cave.screens[0].id });
    expect(ca1.exits?.s).toEqual({ kind: 'warp', to: { map: copy.id, screen: cb1.id } });
    // The original is untouched.
    expect(door.role.to).toEqual({ map: over.id, screen: b1.id });
  });
});

describe('world editor: walls and looks', () => {
  it('blocks the passage between two screens on both sides, and opens it again', () => {
    const { over } = setup();
    const a1 = named(over, 'A1');
    const b1 = named(over, 'B1');
    b1.exits = { w: { kind: 'blocked', note: 'A river' } };
    // Blocked from one side counts: the toggle opens both.
    expect(toggleSeam(over, a1, 'e')).toBe(false);
    expect([a1.exits, b1.exits]).toEqual([undefined, undefined]);
    expect(toggleSeam(over, a1, 'e')).toBe(true);
    expect(exitOf(over, a1, 'e').kind).toBe('blocked');
    expect(exitOf(over, b1, 'w').kind).toBe('blocked');
    expect(toggleSeam(over, a1, 'n')).toBeNull();
    // A side that leads somewhere else stays that way.
    const a2 = named(over, 'A2');
    a2.exits = { n: { kind: 'warp', to: { map: 'cave', screen: 'x' } } };
    toggleSeam(over, a1, 's');
    expect([a1.exits?.s, a2.exits?.n?.kind]).toEqual([{ kind: 'blocked' }, 'warp']);
  });

  it('duplicates a look, makes a look the main one, and reorders looks', () => {
    const { over } = setup();
    const a1 = named(over, 'A1');
    const own = a1.slide;
    const night = { id: 'n', name: 'Night', slide: { background: { color: '#000' }, elements: [newShapeEl('rect')] } };
    a1.variants = [night, { id: 'f', name: 'Fire', slide: { background: {}, elements: [] } }];
    const copy = duplicateLook(a1, a1.variants[0]);
    expect(a1.variants.map((v) => v.name)).toEqual(['Night', 'Night (copy)', 'Fire']);
    expect(copy.slide.elements[0].id).not.toBe(night.slide.elements[0].id);
    moveLook(a1, 2, 0);
    expect(a1.variants.map((v) => v.name)).toEqual(['Fire', 'Night', 'Night (copy)']);
    makeMainLook(a1, night);
    expect(a1.slide.background.color).toBe('#000');
    expect([night.slide, night.name]).toEqual([own, 'Old main look']);
  });
});
