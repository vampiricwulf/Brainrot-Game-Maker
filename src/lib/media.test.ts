import { describe, expect, it, vi } from 'vitest';
import { addMediaFile, dropPhoneCopies, getBlob, identicalMedia, keepLinkCopy, mediaUrls, missingMedia, pruneMedia, registerBlob, relinkMissing, replaceMediaFile, restoreStash, stashMedia } from './media.svelte';
import { libraryMedia, withCopies } from './phonecopies';
import { mediaUsage } from './usage';
import { bundleRound } from './roundcopy';
import { newGame, newImageEl } from './model';
import { uploadedFamily } from './fonts';
import { app } from './app.svelte';
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

  it('stores the same bytes once: a second drop of the same picture reuses the file', async () => {
    const game = newGame();
    const a = await addMediaFile(game, new File(['same bytes'], 'meme.png', { type: 'image/png' }));
    const b = await addMediaFile(game, new File(['same bytes'], 'copy of meme.png', { type: 'image/png' }));
    expect(b).toBe(a);
    expect(game.media).toHaveLength(1);
    expect(app.toast).toContain('already in 🖼 Media');
    // Other bytes of the same size are another file.
    const c = await addMediaFile(game, new File(['other byte'], 'meme.png', { type: 'image/png' }));
    expect(c.id).not.toBe(a.id);
    expect(game.media).toHaveLength(2);
    // Quiet (a quick 🤫 card's file, in a window viewers may see): the same file, and no toast naming it.
    app.toast = '';
    const d = await addMediaFile(game, new File(['same bytes'], 'again.png', { type: 'image/png' }), 'again.png', {}, { quiet: true });
    expect(d).toBe(a);
    expect(app.toast).toBe('');
  });

  it('keeps a file in memory when storage fails, and says the write failed', async () => {
    const failed: unknown[] = [];
    watchWrites((err) => err && failed.push(err));
    const game = newGame();
    const ref = await addMediaFile(game, new File(['png'], 'pic.png', { type: 'image/png' }));
    expect(game.media).toEqual([ref]);
    const history: SavedHistory = { v: 1, gameId: game.id, rev: 'r', origin: { kind: 'new', label: 'New game', ts: 0 }, ids: [], index: 0, trimmed: 0, marks: [] };
    await saveEditor(() => ({ draft: game, history, steps: [], dropped: [] }));
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

describe('missing files found again, and copies of links saved', () => {
  it('reconnects a missing file under its own name, telling of its bytes put back (none before)', async () => {
    const game = newGame();
    game.media.push({ id: 'lost', name: 'Intro.MP3', mime: 'audio/mpeg', size: 3, kind: 'audio' });
    const swaps: { id: string; before: string | null; after: string | null }[] = [];
    const r = await relinkMissing(game, [new File(['abc'], 'intro.mp3', { type: 'audio/mpeg' })], (s) => swaps.push(s));
    expect(r).toEqual({ fixed: 1, stillMissing: [], errors: [] });
    expect(game.media[0].name).toBe('Intro.MP3');
    expect(getBlob('lost')).toBeDefined();
    expect(swaps).toEqual([{ id: 'lost', before: null, after: expect.stringMatching(/^stash-/) }]);
    // Undo: the file is missing again.
    await restoreStash('lost', swaps[0].before);
    expect(getBlob('lost')).toBeUndefined();
  });

  it('finds a renamed file by its own name, and keeps the name it was given', async () => {
    const game = newGame();
    game.media.push({ id: 'ren', name: 'Theme song.mp3', file: 'track01.mp3', mime: 'audio/mpeg', size: 3, kind: 'audio' });
    const r = await relinkMissing(game, [new File(['abc'], 'TRACK01.mp3', { type: 'audio/mpeg' })]);
    expect(r.fixed).toBe(1);
    expect(game.media[0].name).toBe('Theme song.mp3');
    // Replace…: the new file's name is its own name now; the name given stays.
    await replaceMediaFile(game, 'ren', new File(['abcd'], 'other.mp3', { type: 'audio/mpeg' }));
    expect([game.media[0].name, game.media[0].file]).toEqual(['Theme song.mp3', 'other.mp3']);
  });

  it('Replace… with `copy` (a kept game shares the file): the new file gets an id of its own, and this game moves to it', async () => {
    const game = newGame();
    const old = new Blob(['old'], { type: 'image/png' });
    registerBlob('logo', old);
    registerBlob('fontfile1', new Blob(['ttf']));
    game.media.push({ id: 'logo', name: 'logo.png', mime: 'image/png', size: 3, kind: 'image' });
    game.media.push({ id: 'fontfile1', name: 'Fun.ttf', mime: 'font/ttf', size: 3, kind: 'font' });
    game.theme.banner = 'logo';
    game.theme.clueFont = `'${uploadedFamily('fontfile1')}', sans-serif`;
    const ref = await replaceMediaFile(game, 'logo', new File(['newer'], 'wide.png', { type: 'image/png' }), false, true);
    expect(ref.id).not.toBe('logo');
    expect([game.media[0], game.theme.banner]).toEqual([ref, ref.id]);
    expect(ref).toMatchObject({ name: 'wide.png', size: 5 });
    expect(await getBlob(ref.id)!.text()).toBe('newer');
    // The kept game's file is as it was.
    expect(getBlob('logo')).toBe(old);
    // An uploaded font is named by its family in the font lists too.
    const font = await replaceMediaFile(game, 'fontfile1', new File(['otf2'], 'Fun.otf', { type: 'font/otf' }), false, true);
    expect(game.theme.clueFont).toBe(`'${uploadedFamily(font.id)}', sans-serif`);
  });

  it('a copy of a link becomes the file (same id); nothing happens once it is no longer a link', async () => {
    const game = newGame();
    game.media.push({ id: 'web', name: 'cat.png', mime: '', size: 0, kind: 'image', url: 'https://example.com/cat.png', expiresAt: 1 });
    const blob = new Blob(['cat'], { type: 'image/png' });
    expect(await keepLinkCopy(game, 'web', { blob, mime: 'image/png' })).toBe(true);
    expect(game.media[0]).toEqual({ id: 'web', name: 'cat.png', mime: 'image/png', size: 3, kind: 'image' });
    expect(getBlob('web')).toBe(blob);
    expect(await keepLinkCopy(game, 'web', { blob, mime: 'image/png' })).toBe(false);
  });
});

describe('🗜 copies for phones', () => {
  const gif = { id: 'g1', name: 'dance.gif', mime: 'image/gif', size: 4, kind: 'image' as const };
  const copy = { id: 'g1c', name: 'dance (phones).webm', mime: 'video/webm', size: 4, kind: 'video' as const, phoneCopy: { of: 'g1' } };

  it('aren’t one of the game’s files to a person: no list shows them, nor is one the same file again, nor missing', async () => {
    const game = newGame();
    game.media.push(gif, copy);
    expect(libraryMedia(game).map((m) => m.id)).toEqual(['g1']);
    // (Its bytes aren't here: phones get its file.)
    registerBlob('g1', new Blob(['GIF8']));
    expect(missingMedia(game)).toEqual([]);
    registerBlob('g1c', new Blob(['webm']));
    expect(await identicalMedia(game, new Blob(['webm']), 'video')).toBeUndefined();
    expect(await identicalMedia(game, new Blob(['GIF8']), 'image')).toBe(game.media[0]);
  });

  it('are used where their file is, go with it, and come along with a round that uses it', () => {
    const game = newGame();
    game.media.push(gif, copy, { ...gif, id: 'g2', name: 'other.gif' });
    game.cards = [{ id: 'sc1', name: 'Tip', background: {}, elements: [newImageEl('g1')] }];
    expect([mediaUsage(game).get('g1'), mediaUsage(game).get('g1c'), mediaUsage(game).get('g2')]).toEqual([1, 1, undefined]);
    expect(withCopies(game, ['g1', 'g2'])).toEqual(['g1', 'g2', 'g1c']);
    expect(withCopies(game, ['g2'])).toEqual(['g2']);
    expect(dropPhoneCopies(game, 'g1')).toBe(1);
    expect(game.media.map((m) => m.id)).toEqual(['g1', 'g2']);
  });

  it('come with their file when a round is copied', () => {
    const game = newGame();
    game.media.push(gif, copy);
    game.rounds.push({ id: 'r', mode: 'slides', name: 'Intro', questionSlide: { background: { image: 'g1' }, elements: [] } });
    expect(bundleRound(game, game.rounds[0]).media.map((m) => m.id)).toEqual(['g1', 'g1c']);
  });
});
