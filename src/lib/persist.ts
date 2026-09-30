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

/** The draft and its undo history: which steps, where it is, and the steps new or changed since the last write. */
export interface EditorSave {
  draft: Game;
  history: SavedHistory;
  steps: StoredStep[];
  /** Steps no longer in the history. */
  dropped: string[];
}

/** The draft and its history are written together (one transaction), so they always match. */
export const saveEditor = (s: EditorSave) =>
  write(async () => {
    const steps = s.steps.map((e): [string, StoredStep] => [stepKey(e.id), e]);
    await setMany([[DRAFT_KEY, s.draft], [DRAFT_REV_KEY, s.history.rev], [HISTORY_KEY, s.history], ...steps]);
    if (s.dropped.length) await delMany(s.dropped.map(stepKey));
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
