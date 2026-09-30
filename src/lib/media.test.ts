import { describe, expect, it, vi } from 'vitest';
import { addMediaFile } from './media.svelte';
import { newGame } from './model';
import { saveDraft, watchWrites } from './persist';

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
    await saveDraft(game);
    expect(failed).toHaveLength(2);
    watchWrites(() => {});
  });
});
