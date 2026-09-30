// Autosave to IndexedDB (spec §5.8, §6.5): the editor draft and the in-progress play session.
import { del, get, set } from 'idb-keyval';
import type { Game, Session } from './model';

const DRAFT_KEY = 'editorDraft';
const PLAY_KEY = 'playSession';

export interface SavedPlay {
  game: Game;
  session: Session;
  savedAt: number;
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

/** A write to storage (the draft, the game in progress, media): a failure is reported, never thrown. */
export async function write(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    onWrite(null);
  } catch (err) {
    console.warn('Autosave failed:', err);
    onWrite(err);
  }
}

export const loadDraft = () => safe(() => get<Game>(DRAFT_KEY));
export const saveDraft = (game: Game) => write(() => set(DRAFT_KEY, game));

// Exported player-only files keep their own saved game (keyed per game) so they never touch the builder's.
let playKey = PLAY_KEY;
export function usePlayerStorage(gameId: string): void {
  playKey = `${PLAY_KEY}:player:${gameId}`;
}

export const loadPlay = () => safe(() => get<SavedPlay>(playKey));
export const savePlay = (game: Game, session: Session) =>
  write(() => set(playKey, { game, session, savedAt: Date.now() } satisfies SavedPlay));
export const clearPlay = () => safe(() => del(playKey));

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
    return true;
  })) ?? false;
}
