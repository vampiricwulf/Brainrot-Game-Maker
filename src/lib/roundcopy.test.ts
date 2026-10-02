import { describe, expect, it } from 'vitest';
import { addBundledRound, bundleRound, copiesMessage, copyRound, placeFor, settleFiles, uniqueName } from './roundcopy';
import { clipboard } from './clipboard.svelte';
import { isBoard, isRpg, newFinalRound, newGame, newRound, type Game } from './model';
import { clone } from './ops';
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
    // The sample's board gives Gold for passing Start: Gold comes along (and no world).
    expect(bundle.statFields?.map((f) => f.name)).toEqual(['Gold']);
    expect(bundle.worlds).toEqual([]);
  });

  it('puts a new round before the Final at the end, unless it is a Final', () => {
    const g = newGame();
    g.rounds.push(newRound('A'), newFinalRound());
    expect(placeFor(g, newRound('B'))).toBe(1);
    expect(placeFor(g, newFinalRound())).toBe(2);
  });

  it('a world (and item) with this game’s id but other content comes in as a copy, with references remapped', () => {
    const a = newGame();
    a.rounds.push(dungeonRound(a));
    addSampleGame(a);
    const rpg = a.rounds.find(isRpg)!;
    const world = a.worlds!.find((w) => w.id === rpg.world)!;
    const potion = a.items!.find((i) => i.name === 'Potion')!;
    // The same game, another copy: its world was renamed and its potion changed since.
    const b = clone(a) as Game;
    b.worlds!.find((w) => w.id === world.id)!.name = 'Renamed here';
    b.items!.find((i) => i.id === potion.id)!.price = 99;
    const copied: string[] = [];
    const added = addBundledRound(b, bundleRound(a, rpg), undefined, copied);
    expect(b.worlds).toHaveLength(a.worlds!.length + 1);
    expect(b.worlds!.find((w) => w.id === world.id)!.name).toBe('Renamed here');
    const copy = b.worlds![b.worlds!.length - 1];
    expect(copy.id).not.toBe(world.id);
    expect(copy.name).toBe(world.name);
    expect(isRpg(added) && added.world).toBe(copy.id);
    // The potion came as a copy too, and the copied world's objects point at it.
    expect(b.items).toHaveLength(a.items!.length + 1);
    const potion2 = b.items![b.items!.length - 1];
    expect(potion2.price).toBe(potion.price);
    expect(JSON.stringify(copy)).toContain(potion2.id);
    expect(JSON.stringify(copy)).not.toContain(`"${potion.id}"`);
    expect(copied).toEqual([`“${world.name}” world`, '“Potion” item']);
    expect(copiesMessage(copied, 'the file')).toMatch(/^Brought the file’s “.+” world and “Potion” item as copies/);
  });

  it('the same content is used as it is; pasting the round twice uses the same copies', () => {
    const a = newGame();
    a.rounds.push(dungeonRound(a));
    const rpg = a.rounds.find(isRpg)!;
    const same = clone(a) as Game;
    const copied: string[] = [];
    addBundledRound(same, bundleRound(a, rpg), undefined, copied);
    expect(same.worlds).toHaveLength(1);
    expect(copied).toEqual([]);
    const b = clone(a) as Game;
    b.worlds![0].name = 'Mine';
    copyRound(a, rpg);
    addBundledRound(b, clipboard.round!);
    addBundledRound(b, clipboard.round!);
    expect(b.worlds!.map((w) => w.name)).toEqual(['Mine', a.worlds![0].name]);
  });

  it('numbers names that are taken', () => {
    expect(uniqueName(['A'], 'B')).toBe('B');
    expect(uniqueName(['A', 'A (copy)'], 'A')).toBe('A (copy 2)');
    expect(uniqueName(['Jeopardy!'], 'Jeopardy!', false)).toBe('Jeopardy! (2)');
  });

  it('a file with this game’s id but other bytes comes in under a new id', async () => {
    const into = {
      media: [
        { id: 'f1', name: 'a.png', mime: 'image/png', size: 3, kind: 'image' as const },
        { id: 'f2', name: 'b.png', mime: 'image/png', size: 3, kind: 'image' as const },
      ],
    };
    const other = newGame();
    other.media = [...clone(into.media), { id: 'f3', name: 'c.png', mime: 'image/png', size: 3, kind: 'image' }];
    const r = newRound('R', 1);
    r.categories[0].image = 'f1';
    other.rounds.push(r);
    const held = new Map([['f1', new Blob(['new'])], ['f2', new Blob(['old'])], ['f3', new Blob(['xyz'])]]);
    const mine = (id: string): Blob | undefined => (id === 'f1' || id === 'f2' ? new Blob(['old']) : undefined);
    const { game, store, copies } = await settleFiles(other, held, mine);
    const f1 = game.media[0].id;
    expect(f1).not.toBe('f1');
    expect([...copies]).toEqual([f1]);
    expect(isBoard(game.rounds[0]) && game.rounds[0].categories[0].image).toBe(f1);
    expect(game.media[1].id).toBe('f2');
    expect(store.map(([id]) => id)).toEqual([f1, 'f3']);
  });
});
