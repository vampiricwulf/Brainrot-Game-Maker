import { describe, expect, it } from 'vitest';
import { addBundledRound, bundleRound, copyRound, placeFor } from './roundcopy';
import { clipboard } from './clipboard.svelte';
import { isBoard, isRpg, newFinalRound, newGame, newRound } from './model';
import { addSampleGame, dungeonRound } from './samples';
import { newWheel } from './tools';

describe('rounds between games', () => {
  it('a board round takes its wheel (and the wheel’s picture) and its tile images along', () => {
    const a = newGame();
    const w = newWheel('Spin');
    w.segments[0].media = 'm1';
    a.wheels.push(w, newWheel('Unused'));
    a.media.push({ id: 'm1', name: 'a.png', mime: 'image/png', size: 1, kind: 'image' }, { id: 'm2', name: 'b.png', mime: 'image/png', size: 1, kind: 'image' });
    a.media.push({ id: 'm3', name: 'x.png', mime: 'image/png', size: 1, kind: 'image' });
    const r = newRound('Board', 2);
    r.categories[0].clues[0].type = 'wheel';
    r.categories[0].clues[0].wheelId = w.id;
    r.categories[1].image = 'm2';
    a.rounds.push(r);
    const b = newGame();
    b.media.push({ id: 'other', name: 'a.png', mime: 'image/png', size: 1, kind: 'image' });
    const added = addBundledRound(b, bundleRound(a, r));
    expect(b.wheels.map((x) => x.name)).toEqual(['Spin']);
    expect(b.media.map((m) => m.id)).toEqual(['other', 'm1', 'm2']);
    // (A name already taken here gets another.)
    expect(b.media[1].name).not.toBe('a.png');
    // Fresh ids: it never mixes with the original.
    expect(added.id).not.toBe(r.id);
    expect(isBoard(added) && added.categories[0].id).not.toBe(r.categories[0].id);
  });

  it('an RPG round takes its world and the items and stats on it; pasting twice adds them once', () => {
    const a = newGame();
    a.rounds.push(dungeonRound(a));
    addSampleGame(a);
    const rpg = a.rounds.find(isRpg)!;
    const b = newGame();
    copyRound(a, rpg);
    const first = addBundledRound(b, clipboard.round!);
    addBundledRound(b, clipboard.round!);
    expect(b.worlds).toHaveLength(1);
    expect(isRpg(first) && first.world).toBe(rpg.world);
    expect(b.items?.map((i) => i.name)).toEqual(['Potion']);
    expect(b.rounds.map((r) => r.name)).toEqual(['Dungeon', 'Dungeon (copy)']);
  });

  it('a board-game round takes the stats its spaces change', () => {
    const a = newGame();
    addSampleGame(a);
    const bg = a.rounds.find((r) => r.mode === 'boardgame')!;
    const bundle = bundleRound(a, bg);
    // The sample's board only changes the score: no stats.
    expect(bundle.statFields).toEqual([]);
    expect(bundle.worlds).toEqual([]);
  });

  it('puts a new round before the Final at the end, unless it is a Final', () => {
    const g = newGame();
    g.rounds.push(newRound('A'), newFinalRound());
    expect(placeFor(g, newRound('B'))).toBe(1);
    expect(placeFor(g, newFinalRound())).toBe(2);
  });
});
