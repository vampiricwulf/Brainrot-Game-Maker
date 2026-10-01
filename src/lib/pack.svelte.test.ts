import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import { buildPack, readGameFile, storeFiles } from './pack';
import { buildZip } from './zipwrite';
import { getBlob, registerBlob } from './media.svelte';
import { newGame, newRound, type Game, type MediaRef } from './model';

vi.spyOn(console, 'warn').mockImplementation(() => {});

const pic = (id: string): MediaRef => ({ id, name: `${id}.png`, mime: 'image/png', size: 3, kind: 'image' });

async function packFile(game: Game, files: Record<string, string>): Promise<File> {
  const z = new JSZip();
  z.file('game.json', JSON.stringify(game));
  for (const [path, text] of Object.entries(files)) z.file(path, text);
  return new File([await z.generateAsync({ type: 'blob' })], 'Game.brainrot');
}

describe('opening a game file', () => {
  it('holds its files until they are stored, and gives a file that differs from the one here a new id', async () => {
    const g = newGame();
    g.media = [pic('changed'), pic('same'), pic('fresh')];
    const r = newRound('R', 1);
    r.categories[0].image = 'changed';
    g.rounds.push(r);
    // The game in the editor replaced "changed" since this file was saved.
    const mine = new Blob(['newer']);
    registerBlob('changed', mine);
    registerBlob('same', new Blob(['same']));
    const file = await packFile(g, { 'media/changed.png': 'older', 'media/same.png': 'same', 'media/fresh.png': 'fresh' });

    const read = await readGameFile(file);
    // Nothing stored yet: the game open now shows what it showed.
    expect(getBlob('changed')).toBe(mine);
    expect(getBlob('fresh')).toBeUndefined();
    const copy = read.game.media[0].id;
    expect(copy).not.toBe('changed');
    expect([...read.copies]).toEqual([copy]);
    const round = read.game.rounds[0];
    expect('categories' in round && round.categories[0].image).toBe(copy);
    // The same file isn't stored again.
    expect(read.files.map(([id]) => id)).toEqual([copy, 'fresh']);

    await storeFiles(read);
    expect(await getBlob(copy)!.text()).toBe('older');
    expect(await getBlob('fresh')!.text()).toBe('fresh');
    expect(getBlob('changed')).toBe(mine);
  });
});

describe('game packs', () => {
  const game = () => {
    const g = newGame();
    g.title = 'Packed';
    g.rounds.push(newRound('R', 1));
    return g;
  };

  it('writes game.json compact and deflated, and opens it again', async () => {
    const g = game();
    const { blob } = await buildPack(g);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer(), { checkCRC32: true });
    const text = await zip.file('game.json')!.async('string');
    expect(text).toBe(JSON.stringify(g));
    // (Method 8: deflated.)
    expect(new DataView(await blob.arrayBuffer()).getUint16(8, true)).toBe(8);
    const read = await readGameFile(new File([blob], 'Packed.brainrot'));
    expect(read.game.title).toBe('Packed');
    expect(read.game.rounds).toHaveLength(1);
  });

  it('still opens an older pack, its game.json stored and indented', async () => {
    const g = game();
    const { blob } = await buildZip([{ name: 'game.json', data: new Blob([JSON.stringify(g, null, 2)]) }]);
    expect(new DataView(await blob.arrayBuffer()).getUint16(8, true)).toBe(0);
    const read = await readGameFile(new File([blob], 'Old.brainrot'));
    expect(read.game.title).toBe('Packed');
    expect(read.game.rounds).toHaveLength(1);
  });
});
