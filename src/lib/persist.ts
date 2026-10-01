// Autosave to IndexedDB (spec §5.8, §6.5): the editor draft with its undo history, and the in-progress play session.
import { del, delMany, get, getMany, keys, set, setMany } from 'idb-keyval';
import type { SavedHistory, StoredStep } from './history.svelte';
import type { Game, Session } from './model';

const DRAFT_KEY = 'editorDraft';
/** New with every draft written: the undo history written with it says which draft it goes with. */
const DRAFT_REV_KEY = 'editorDraftRev';
const HISTORY_KEY = 'editorHistory';
/** Each step of the undo history is stored once, on its own. */
const stepKey = (id: string) => `${HISTORY_KEY}:${id}`;
const PLAY_KEY = 'playSession';

export interface SavedPlay {
  game: Game;
  session: Session;
  savedAt: number;
  /** The screen was covered (⏸ Cover): resuming covers it again. */
  cover?: boolean;
}

async function safe<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    // Private windows or blocked storage: the app still works, just without autosave.
    console.warn('Autosave unavailable:', err);
    return undefined;
  }
}

/** Told how each write went (null: it worked), so the app can say when autosave stops working (e.g. storage is full). */
let onWrite: (err: unknown) => void = () => {};
export function watchWrites(fn: (err: unknown) => void): void {
  onWrite = fn;
}

/**
 * Writes that failed (storage full…), by what they write: each is tried again once writes work again (the newest write
 * of a thing replaces an older one that failed). Autosave counts as working again only once they've all gone through.
 */
const failed = new Map<string, () => Promise<void>>();
let retrying: Promise<boolean> | null = null;

/** A write of this failed and waits to be tried again (what's in memory is the only copy). */
export const unstored = (key: string): boolean => failed.has(key);

/**
 * A write to storage (the draft, the game in progress, a file), named by what it writes (`key`): a failure is
 * reported, never thrown, and the write is tried again later. True when it (and every earlier failed write) went
 * through.
 */
export async function write(key: string, fn: () => Promise<void>): Promise<boolean> {
  try {
    await fn();
    failed.delete(key);
  } catch (err) {
    console.warn('Autosave failed:', err);
    failed.set(key, fn);
    onWrite(err);
    return false;
  }
  if (failed.size) return retryWrites();
  onWrite(null);
  return true;
}

/** Try the failed writes again, oldest first. True when none are left; watchWrites hears how it went. */
export function retryWrites(): Promise<boolean> {
  if (!failed.size) return Promise.resolve(true);
  retrying ??= (async () => {
    try {
      for (const [key, fn] of [...failed]) {
        // (Replaced by a newer write of the same thing meanwhile.)
        if (failed.get(key) !== fn) continue;
        try {
          await fn();
          if (failed.get(key) === fn) failed.delete(key);
        } catch (err) {
          onWrite(err);
          return false;
        }
      }
      if (failed.size) return false;
      onWrite(null);
      return true;
    } finally {
      retrying = null;
    }
  })();
  return retrying;
}

/** The draft and its undo history: which steps, where it is, and the steps new or changed since the last write. */
export interface EditorSave {
  draft: Game;
  history: SavedHistory;
  steps: StoredStep[];
  /** Steps no longer in the history. */
  dropped: string[];
}

/**
 * The draft and its history are written together (one transaction), so they always match. `make` is called for each
 * try, so one tried again after a failure writes the game as it is by then; `failed` hands back the steps it held, to
 * be written next time.
 */
export const saveEditor = (make: () => (EditorSave & { failed?: () => void }) | null) =>
  write('editor', async () => {
    const s = make();
    if (!s) return;
    try {
      const steps = s.steps.map((e): [string, StoredStep] => [stepKey(e.id), e]);
      await setMany([[DRAFT_KEY, s.draft], [DRAFT_REV_KEY, s.history.rev], [HISTORY_KEY, s.history], ...steps]);
      if (s.dropped.length) await delMany(s.dropped.map(stepKey));
    } catch (err) {
      s.failed?.();
      throw err;
    }
  });

/**
 * The draft, and its undo history when that was written with this very draft (another copy of the app, or a version
 * from before the history, may have written the draft since) and all its steps are there.
 */
export async function loadEditor(): Promise<{ draft?: Game; history?: { saved: SavedHistory; steps: StoredStep[] } }> {
  const [draft, rev, saved] = (await safe(() => getMany([DRAFT_KEY, DRAFT_REV_KEY, HISTORY_KEY]))) ?? [];
  if (!draft) return {};
  const game = draft as Game;
  const index = saved as SavedHistory | undefined;
  if (index?.v !== 1 || index.rev !== rev || index.gameId !== game.id) return { draft: game };
  const steps = await safe(() => getMany<StoredStep>(index.ids.map(stepKey)));
  if (!steps || steps.some((x) => !x)) return { draft: game };
  return { draft: game, history: { saved: index, steps: steps as StoredStep[] } };
}

/** Delete stored steps that aren't in the history kept (left from a history not restored, or a crash mid-write). */
export async function dropStraySteps(keep: readonly string[]): Promise<void> {
  const kept = new Set(keep.map(stepKey));
  await safe(async () => {
    const all = await keys();
    await delMany(all.filter((k) => typeof k === 'string' && k.startsWith(`${HISTORY_KEY}:`) && !kept.has(k)));
  });
}

// Exported player-only files keep their own saved game (keyed per game, and per export when the file says when it was
// exported) so they never touch the builder's, and a newer export of the game doesn't pick up an older one's game.
let playKey = PLAY_KEY;
export function usePlayerStorage(gameId: string, exported?: string | null): void {
  playKey = `${PLAY_KEY}:player:${gameId}${exported ? `:${exported}` : ''}`;
}

export const loadPlay = () => safe(() => get<SavedPlay>(playKey));
export const savePlay = (game: Game, session: Session, cover = false) =>
  write('play', () => set(playKey, { game, session, savedAt: Date.now(), ...(cover ? { cover } : {}) } satisfies SavedPlay));
export const clearPlay = () => safe(() => del(playKey));

/**
 * Phone buzzers: the room the pre-game screen opened, kept on its own (nothing else is saved before Start game), so a
 * reload on the pre-game screen gets back into the same room with the same players, and a room left open while the
 * host went back to the editor is picked up again by ▶ Play.
 */
export interface SavedRoom {
  gameId: string;
  remote: NonNullable<Session['remote']>;
  /** The pre-game screen's players (sample players too) with their start scores. */
  players: Session['players'];
  /** Where the host was: on the pre-game screen, or back in the editor with the room left open. */
  screen: 'pregame' | 'editor';
  savedAt: number;
}
const roomKey = () => `${playKey}:room`;
export const loadRoom = () => safe(() => get<SavedRoom>(roomKey()));
export const saveRoom = (r: SavedRoom) => write('room', () => set(roomKey(), r));
export const clearRoom = () => safe(() => del(roomKey()));

/** Runs `fn` with the latest arguments once calls stop for `ms`. `flush()` runs a pending call now. */
export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  let pending: A | null = null;
  const run = () => {
    clearTimeout(t);
    if (pending) {
      const a = pending;
      pending = null;
      fn(...a);
    }
  };
  const call = (...a: A) => {
    pending = a;
    clearTimeout(t);
    t = setTimeout(run, ms);
  };
  call.flush = run;
  return call;
}

/** Can we write to IndexedDB here? (Some browsers block it for files opened from disk or in private windows.) */
export async function testStorage(): Promise<boolean> {
  return (await safe(async () => {
    await set('__probe', Date.now());
    await del('__probe');
    return true;
  })) ?? false;
}

let keepAsked = false;
/**
 * Ask the browser to keep this file's storage even when the disk runs low (otherwise it may clear it): once, when the
 * game gets its first file or is saved. ℹ About shows the answer.
 */
export function askToKeepStorage(): void {
  if (keepAsked) return;
  keepAsked = true;
  void navigator.storage?.persist?.().catch(() => false);
}

/** Whether the browser keeps this file's storage for good (null: it can't say). */
export async function storageKept(): Promise<boolean | null> {
  try {
    return (await navigator.storage?.persisted?.()) ?? null;
  } catch {
    return null;
  }
}
