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

export const loadDraft = () => safe(() => get<Game>(DRAFT_KEY));
export const saveDraft = (game: Game) => safe(() => set(DRAFT_KEY, game));

export const loadPlay = () => safe(() => get<SavedPlay>(PLAY_KEY));
export const savePlay = (game: Game, session: Session) =>
  safe(() => set(PLAY_KEY, { game, session, savedAt: Date.now() } satisfies SavedPlay));
export const clearPlay = () => safe(() => del(PLAY_KEY));

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
