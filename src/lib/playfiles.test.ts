import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newGame } from './model';

// The browser's storage (IndexedDB through idb-keyval), in memory: it outlives the copies of the app loaded below, as
// storage outlives a reload.
const db = vi.hoisted(() => new Map<IDBValidKey, unknown>());
vi.mock('idb-keyval', () => ({
  get: async (k: IDBValidKey) => db.get(k),
  set: async (k: IDBValidKey, v: unknown) => void db.set(k, v),
  del: async (k: IDBValidKey) => void db.delete(k),
  getMany: async (ks: IDBValidKey[]) => ks.map((k) => db.get(k)),
  setMany: async (entries: [IDBValidKey, unknown][]) => entries.forEach(([k, v]) => db.set(k, v)),
  delMany: async (ks: IDBValidKey[]) => ks.forEach((k) => db.delete(k)),
  keys: async () => [...db.keys()],
}));

/** A player-only file opening (or opened again after a reload): its pack's file in memory, then ready to play. */
async function openPlayerFile() {
  vi.resetModules();
  const media = await import('./media.svelte');
  const persist = await import('./persist');
  media.keepInMemory();
  await media.putMedia('pack-file', new Blob(['from the pack']));
  persist.usePlayerStorage('game-1', '2026-10-01T12:00:00Z');
  media.storePlayFiles();
  return { media, persist };
}

describe("an exported player-only file's files", () => {
  beforeEach(() => db.clear());

  it('keeps a file added during play (a drawing) with the saved game, and finds it again after a reload', async () => {
    const { media, persist } = await openPlayerFile();
    const game = newGame();
    const ref = await media.addMediaFile(game, new File(['drawn'], 'drawing.png', { type: 'image/png' }));
    // Never in the builder's store (its cleanup would delete it), and the pack's own file isn't stored at all.
    expect([...db.keys()]).toEqual([persist.playFileKey(ref.id)]);
    expect(persist.playFileKey(ref.id)).toMatch(/^playSession:player:game-1:/);

    const again = await openPlayerFile();
    expect(again.media.getBlob(ref.id)).toBeUndefined();
    expect(await again.media.loadGameMedia(game)).toEqual([]);
    expect(await again.media.getBlob(ref.id)?.text()).toBe('drawn');
  });

  it('deletes them with the saved game, leaving the builder’s files and other games’ alone', async () => {
    const { media, persist } = await openPlayerFile();
    const ref = await media.addMediaFile(newGame(), new File(['drawn'], 'drawing.png', { type: 'image/png' }));
    db.set('media:builder-file', new Blob(['builder']));
    db.set('playSession:player:game-2:file:other', new Blob(['other game']));
    await persist.savePlay(newGame(), {} as never);
    await persist.clearPlay();
    expect(db.has(persist.playFileKey(ref.id))).toBe(false);
    expect([...db.keys()].sort()).toEqual(['media:builder-file', 'playSession:player:game-2:file:other']);
  });
});
