import { describe, expect, it } from 'vitest';
import { addBundledRound, bringAlong, bundleRound, copiesMessage, copyRound, mergedMessage, placeFor, settleFiles, uniqueName } from './roundcopy';
import { keepScreen } from './rpg';
import { clipboard } from './clipboard.svelte';
import { isBoard, isRpg, newFinalRound, newGame, newImageEl, newRound, type Game } from './model';
import { clone } from './ops';
import { addSampleGame, dungeonRound, miniQuestRound } from './samples';
import { presetStat } from './rpgpresets';
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

  it('a Final takes its 🤫 cards’ files along, and its copy gets fresh card ids', () => {
    const a = newGame();
    a.media.push({ id: 'm1', name: 'hint.png', mime: 'image/png', size: 1, kind: 'image' }, { id: 'm2', name: 'unused.png', mime: 'image/png', size: 1, kind: 'image' });
    const f = newFinalRound();
    f.cards = [{ id: 'fc1', name: 'Leader hint', background: {}, elements: [{ ...newImageEl('m1'), id: 'e1' }], to: 'playing' }];
    a.rounds.push(f);
    const b = newGame();
    const added = addBundledRound(b, bundleRound(a, f));
    expect(b.media.map((m) => m.id)).toEqual(['m1']);
    if (added.mode !== 'final') throw new Error('not a Final');
    expect(added.cards).toHaveLength(1);
    expect(added.cards![0]).toMatchObject({ name: 'Leader hint', to: 'playing' });
    expect([added.cards![0].id, added.cards![0].elements[0].id]).not.toContain('fc1');
    expect(added.cards![0].elements[0].id).not.toBe('e1');
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

  it('takes along what its things point at, however far: a wheel only an item’s Use button spins', () => {
    const a = newGame();
    const tile = newWheel('Tile');
    const prize = newWheel('Prize');
    a.wheels.push(tile, prize, newWheel('Unused'));
    a.items = [{ id: 'key', name: 'Key', stackable: false, onUse: [{ id: 'u1', do: 'wheel', wheel: prize.id }] }];
    tile.segments[0].actions = [{ id: 's1', do: 'item', item: 'key', qty: 1, op: 'give' }];
    const r = newRound('', 1);
    r.categories[0].clues[0].type = 'wheel';
    r.categories[0].clues[0].wheelId = tile.id;
    a.rounds.push(newRound('First', 1), r);
    const b = bundleRound(a, r);
    expect(b.wheels.map((w) => w.name)).toEqual(['Tile', 'Prize']);
    expect(b.items?.map((i) => i.name)).toEqual(['Key']);
    // Its name as its game showed it, for messages.
    expect(b.label).toBe('Round 2');
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
    // (Named apart from this game's own potion.)
    expect(potion2.name).toBe('Potion (copy)');
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

  it('a stat of a name and type this game has is its own (one HP, one Gold), and so is an item the same but for its ids; another comes in named apart', () => {
    const a = newGame();
    a.rounds.push(dungeonRound(a));
    presetStat(a, 'HP');
    presetStat(a, 'Gold');
    const [hp, coin] = a.statFields!;
    const quest = newGame();
    quest.rounds.push(miniQuestRound(quest));
    const copied: string[] = [];
    const merged: string[] = [];
    const added = addBundledRound(a, bundleRound(quest, quest.rounds[0]), undefined, copied, undefined, merged);
    expect(a.statFields!.map((f) => f.name)).toEqual(['HP', 'Gold', 'Power']);
    expect(a.statFields!.slice(0, 2)).toEqual([hp, coin]);
    expect(merged).toEqual(['HP', 'Gold']);
    expect(mergedMessage(merged)).toBe('Used this game’s “HP” and “Gold”');
    expect(a.shops![0].currency).toBe(coin.id);
    // The quest's Potion heals (the dungeon's doesn't): it comes in named apart, said to be a copy, and the quest uses it.
    expect(a.items!.map((i) => i.name)).toEqual(['Potion', 'Potion (copy)', 'Sword']);
    const copy = a.items![1];
    expect(JSON.stringify(copy.onUse)).toContain(hp.id);
    expect(copied).toEqual(['“Potion” item']);
    expect(isRpg(added) && JSON.stringify(a.worlds!.find((w) => w.id === added.world))).toContain(copy.id);
    // Brought again from the same place, it uses the same copies (one world, one shop, one copy of the Potion).
    addBundledRound(a, bundleRound(quest, quest.rounds[0]));
    expect([a.worlds!.length, a.shops!.length, a.items!.length, a.statFields!.length]).toEqual([2, 1, 3, 3]);
    // Another game's dungeon has the same Potion but for its id: this game's own is used.
    const other = newGame();
    other.rounds.push(dungeonRound(other));
    const more: string[] = [];
    addBundledRound(a, bundleRound(other, other.rounds[0]), undefined, undefined, undefined, more);
    expect(a.items!.length).toBe(3);
    expect(more).toEqual(['Potion']);
  });

  it('Keep in game brings along the items, shops and files a kept screen uses that the editor’s game hasn’t got', () => {
    const editor = newGame();
    editor.rounds.push(miniQuestRound(editor));
    const play = clone(editor) as Game;
    const world = play.worlds![0];
    const village = world.maps[0].screens[0];
    // Made during the show: an item, a shop selling it, and a character with a picture who runs that shop.
    play.items!.push({ id: 'i3', name: 'Item 3', stackable: true });
    play.shops!.push({ id: 'sh2', name: 'Character’s shop', currency: play.shops![0].currency, stock: [{ item: 'i3', qty: null }] });
    play.media.push({ id: 'pic', name: 'pic.png', mime: 'image/png', size: 1, kind: 'image' });
    village.slide.elements.push({ ...newImageEl('pic'), role: { class: 'npc', shop: 'sh2' } });
    const ref = { map: world.maps[0].id, screen: village.id };
    expect(keepScreen(play, editor, world.id, ref, undefined, (kept) => bringAlong(play, editor, kept))).toBe(
      'Kept “Village” in the game, with item “Item 3”, shop “Character’s shop” and 1 file',
    );
    expect([editor.items!.at(-1)!.id, editor.shops!.at(-1)!.id, editor.media.at(-1)!.id]).toEqual(['i3', 'sh2', 'pic']);
    // Kept again: nothing more to bring.
    expect(keepScreen(play, editor, world.id, ref, undefined, (kept) => bringAlong(play, editor, kept))).toBe('Kept “Village” in the game');
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

  it('an uploaded font that comes in under a new id is named by its new family where it’s used', async () => {
    const { uploadedFamily } = await import('./fonts');
    const other = newGame();
    other.media = [{ id: 'font0001abc', name: 'f.ttf', mime: 'font/ttf', size: 3, kind: 'font' }];
    other.theme.boardFont = `'${uploadedFamily('font0001abc')}', sans-serif`;
    const { game } = await settleFiles(other, new Map([['font0001abc', new Blob(['new'])]]), () => new Blob(['old']));
    const id = game.media[0].id;
    expect(id).not.toBe('font0001abc');
    expect(game.theme.boardFont).toBe(`'${uploadedFamily(id)}', sans-serif`);
  });
  it('a round takes the uploaded fonts its text uses (named only by their family)', async () => {
    const { uploadedFamily } = await import('./fonts');
    const a = newGame();
    a.media.push({ id: 'font0002xyz', name: 'Bebas.woff2', mime: 'font/woff2', size: 3, kind: 'font' }, { id: 'font0003unused', name: 'Other.woff2', mime: 'font/woff2', size: 3, kind: 'font' });
    const r = newRound('Board', 1);
    const el = r.categories[0].clues[0].questionSlide.elements[0];
    if (el.kind === 'text') el.font = `'${uploadedFamily('font0002xyz')}', sans-serif`;
    a.rounds.push(r);
    const bundle = bundleRound(a, r);
    expect(bundle.media.map((m) => m.id)).toEqual(['font0002xyz']);
    const b = newGame();
    addBundledRound(b, bundle);
    expect(b.media.map((m) => m.id)).toEqual(['font0002xyz']);
  });
});
