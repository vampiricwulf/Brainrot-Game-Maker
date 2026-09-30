import { describe, expect, it, vi } from 'vitest';
import { addMediaFile, getBlob, mediaUrls, pruneMedia, registerBlob, restoreStash, stashMedia } from './media.svelte';
import { newGame } from './model';
import { saveEditor, watchWrites } from './persist';
import type { SavedHistory } from './history.svelte';

// There's no IndexedDB here, so every write to storage fails (as when a browser's storage is full or blocked).
vi.spyOn(console, 'warn').mockImplementation(() => {});

describe('adding files', () => {
  it('refuses HEIC photos, which never show', async () => {
    const game = newGame();
    await expect(addMediaFile(game, new File(['x'], 'IMG_4821.HEIC', { type: 'image/heic' }))).rejects.toThrow(
      '"IMG_4821.HEIC" is a HEIC photo',
    );
    await expect(addMediaFile(game, new File(['x'], 'photo.heif'))).rejects.toThrow('Convert it to JPG or PNG first.');
    expect(game.media).toEqual([]);
  });

  it('keeps a file in memory when storage fails, and says the write failed', async () => {
    const failed: unknown[] = [];
    watchWrites((err) => err && failed.push(err));
    const game = newGame();
    const ref = await addMediaFile(game, new File(['png'], 'pic.png', { type: 'image/png' }));
    expect(game.media).toEqual([ref]);
    const history: SavedHistory = { v: 1, gameId: game.id, rev: 'r', origin: { kind: 'new', label: 'New game', ts: 0 }, ids: [], index: 0, trimmed: 0, marks: [] };
    await saveEditor({ draft: game, history, steps: [], dropped: [] });
    expect(failed).toHaveLength(2);
    watchWrites(() => {});
  });
});

describe('files the undo history can bring back', () => {
  it('keeps held files (and stashed copies) when unused ones are pruned', async () => {
    const game = newGame();
    for (const id of ['used', 'removed', 'gone']) registerBlob(id, new Blob([id]));
    game.media.push({ id: 'used', name: 'used.png', mime: 'image/png', size: 4, kind: 'image' });
    await pruneMedia([game], new Set(['removed']));
    expect(getBlob('used')).toBeDefined();
    expect(getBlob('removed')).toBeDefined();
    expect(getBlob('gone')).toBeUndefined();
    expect(mediaUrls.gone).toBeUndefined();
    // Once nothing holds it, the next prune drops it.
    await pruneMedia([game]);
    expect(getBlob('removed')).toBeUndefined();
  });

  it('stashes a file\'s bytes and puts them back', async () => {
    const before = new Blob(['old']);
    const after = new Blob(['new']);
    registerBlob('pic', before);
    const stash = await stashMedia('pic');
    expect(stash).toMatch(/^stash-/);
    registerBlob('pic', after);
    await restoreStash('pic', stash);
    expect(getBlob('pic')).toBe(before);
    // A file that had no bytes (a link) has none again.
    await restoreStash('pic', null);
    expect(getBlob('pic')).toBeUndefined();
    expect(mediaUrls.pic).toBeUndefined();
    expect(await stashMedia('nothing')).toBeNull();
  });
});
