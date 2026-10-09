import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearPlay, loadPlay, rescuePlay, retryWrites, savePlay, unstored, watchWrites, write } from './persist';
import { newGame, type Session } from './model';

vi.spyOn(console, 'warn').mockImplementation(() => {});

// Storage as IndexedDB holds it, in memory.
const db = vi.hoisted(() => new Map<string, unknown>());
vi.mock('idb-keyval', () => ({
  get: async (k: string) => db.get(k),
  set: async (k: string, v: unknown) => void db.set(k, v),
  del: async (k: string) => void db.delete(k),
  delMany: async (ks: string[]) => ks.forEach((k) => db.delete(k)),
  getMany: async (ks: string[]) => ks.map((k) => db.get(k)),
  setMany: async (es: [string, unknown][]) => es.forEach(([k, v]) => db.set(k, v)),
  keys: async () => [...db.keys()],
}));

describe('writes while storage is full', () => {
  it('tries failed writes again, and says autosave works only once they all went through', async () => {
    const heard: (string | null)[] = [];
    watchWrites((err) => heard.push(err ? 'failed' : null));
    let full = true;
    const stored: string[] = [];
    const put = (what: string) => async () => {
      if (full) throw new DOMException('Quota exceeded', 'QuotaExceededError');
      stored.push(what);
    };
    expect(await write('media:a', put('a'))).toBe(false);
    expect(await write('editor', put('draft 1'))).toBe(false);
    expect(unstored('media:a') && unstored('editor')).toBe(true);
    // Still full: trying again changes nothing.
    expect(await retryWrites()).toBe(false);
    full = false;
    // A newer write of the draft replaces the failed one; the file is written again too, then all is well.
    expect(await write('editor', put('draft 2'))).toBe(true);
    expect(stored).toEqual(['draft 2', 'a']);
    expect(unstored('media:a') || unstored('editor')).toBe(false);
    expect(heard).toEqual(['failed', 'failed', 'failed', null]);
    // Nothing left to try: nothing to say.
    expect(await retryWrites()).toBe(true);
    expect(heard).toHaveLength(4);
    watchWrites(() => {});
  });
});

describe('the game in progress as the page goes away', () => {
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('a copy written at once comes back when its stored write never finished, and goes once a newer one is stored', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const local = new Map<string, string>();
    /** How long a value localStorage takes (a big game doesn't fit). */
    let room = Infinity;
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => local.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (v.length > room) throw new DOMException('Quota exceeded', 'QuotaExceededError');
        local.set(k, v);
      },
      removeItem: (k: string) => void local.delete(k),
    };
    const game = newGame();
    const at = (scores: number[]) => ({ gameId: game.id, scoreLog: scores }) as unknown as Session;
    vi.setSystemTime(1000);
    await savePlay(game, at([300]));
    // A host click, then the page went away before its write: the copy is newer.
    vi.setSystemTime(2000);
    rescuePlay(game, at([300, 500]), true);
    expect(await loadPlay()).toEqual({ game, session: at([300, 500]), savedAt: 2000, cover: true });
    // Too big with its game: the session alone, with the stored game.
    room = 200;
    vi.setSystemTime(3000);
    rescuePlay(game, at([300, 500, 200]));
    expect(await loadPlay()).toEqual({ game, session: at([300, 500, 200]), savedAt: 3000 });
    // Stored since: the copy is gone.
    vi.setSystemTime(4000);
    await savePlay(game, at([300, 500, 200]));
    expect(local.size).toBe(0);
    expect((await loadPlay())?.savedAt).toBe(4000);
    // Discarding the game in progress discards its copy too.
    rescuePlay(game, at([100]));
    await clearPlay();
    expect(await loadPlay()).toBeUndefined();
  });
});
