import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearPlay, debounce, loadPlay, playUnsure, rescuePlay, retryWrites, savePlay, unstored, watchWrites, write } from './persist';
import { newGame, type Session } from './model';

vi.spyOn(console, 'warn').mockImplementation(() => {});

// Storage as IndexedDB holds it, in memory. `io.full`: writes fail as when storage is full; `io.hold`: they wait for it.
const db = vi.hoisted(() => new Map<string, unknown>());
const io = vi.hoisted(() => ({ full: false, hold: null as Promise<void> | null }));
vi.mock('idb-keyval', () => ({
  get: async (k: string) => db.get(k),
  set: async (k: string, v: unknown) => {
    if (io.hold) await io.hold;
    if (io.full) throw new DOMException('Quota exceeded', 'QuotaExceededError');
    db.set(k, v);
  },
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

  it('says what failed to be written', async () => {
    const heard: unknown[] = [];
    watchWrites((err, key) => heard.push(err ? key : null));
    expect(await write('media:b', async () => Promise.reject(new Error('full')))).toBe(false);
    expect(await write('media:b', async () => {})).toBe(true);
    expect(heard).toEqual(['media:b', null]);
    watchWrites(() => {});
  });
});

describe('the game in progress cleared while storage is full', () => {
  const game = newGame();
  const session = { gameId: game.id } as unknown as Session;
  afterEach(() => {
    io.full = false;
    io.hold = null;
    db.clear();
  });

  it('its failed write goes with it: no longer waited for, never written back once there is room', async () => {
    io.full = true;
    expect(await savePlay(game, session)).toBe(false);
    expect(unstored('play') && playUnsure()).toBe(true);
    await clearPlay();
    expect(unstored('play') || playUnsure()).toBe(false);
    io.full = false;
    expect(await retryWrites()).toBe(true);
    expect(db.has('playSession')).toBe(false);
  });

  it('a write of it under way as it is cleared, failing then, is not kept to try again', async () => {
    let release = () => {};
    io.hold = new Promise((r) => (release = r));
    const writing = savePlay(game, session);
    // (Under way: the page going away keeps a copy of it, see rescuePlay.)
    expect(playUnsure()).toBe(true);
    io.full = true;
    const cleared = clearPlay();
    release();
    await Promise.all([writing, cleared]);
    expect(unstored('play') || playUnsure()).toBe(false);
  });
});

describe('debounce', () => {
  it('says when a call waits to run', () => {
    vi.useFakeTimers();
    const ran: number[] = [];
    const soon = debounce((n: number) => void ran.push(n), 300);
    expect(soon.pending()).toBe(false);
    soon(1);
    soon(2);
    expect(soon.pending()).toBe(true);
    vi.advanceTimersByTime(300);
    expect(ran).toEqual([2]);
    expect(soon.pending()).toBe(false);
    soon(3);
    soon.flush();
    expect(ran).toEqual([2, 3]);
    expect(soon.pending()).toBe(false);
    vi.useRealTimers();
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

  it('a copy it can’t use is left out (and dropped), never stopping the start', async () => {
    const local = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => local.get(k) ?? null,
      setItem: (k: string, v: string) => void local.set(k, v),
      removeItem: (k: string) => void local.delete(k),
    };
    rescuePlay(newGame(), { gameId: 'g1' } as unknown as Session);
    const [key] = local.keys();
    // A stored entry with no game, and a copy of the session alone: there's no game to go with it.
    const stored = { session: { gameId: 'g1' }, savedAt: 1 };
    db.set('playSession', stored);
    for (const copy of [{ session: { gameId: 'g1' }, savedAt: 5 }, { session: 'g1', savedAt: 5 }, { game: 7, session: {}, savedAt: 5 }, 12, 'not a copy']) {
      local.set(key, typeof copy === 'string' ? copy : JSON.stringify(copy));
      expect(await loadPlay()).toEqual(stored);
      expect(local.size).toBe(0);
    }
    db.clear();
  });
});
