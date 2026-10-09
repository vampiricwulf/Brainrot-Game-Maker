// Autosave to IndexedDB (spec §5.8, §6.5): the editor draft with its undo history, and the in-progress play session.
import { del, delMany, get, getMany, keys, set, setMany } from 'idb-keyval';
import type { SavedHistory, StoredStep } from './history.svelte';
import type { Game, GameSettings, Session } from './model';

const DRAFT_KEY = 'editorDraft';
/** New with every draft written: the undo history written with it says which draft it goes with. */
const DRAFT_REV_KEY = 'editorDraftRev';
const HISTORY_KEY = 'editorHistory';
/** When the draft was written (Date.now()), to tell whether a rescue copy is newer. */
const DRAFT_AT_KEY = 'editorDraftAt';
/**
 * A copy of the draft written to localStorage as the page goes away: unlike IndexedDB, that write is done before the
 * page is. The IndexedDB write started then may not finish (a reload a moment after an edit), so the next start uses
 * this copy when it's newer than the stored draft.
 */
const RESCUE_KEY = 'jb.editorRescue';
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

/**
 * Told how each write went (null: it worked), so the app can say when autosave stops working (e.g. storage is full).
 * A failure comes with what failed to be written (see write).
 */
let onWrite: (err: unknown, key?: string) => void = () => {};
export function watchWrites(fn: (err: unknown, key?: string) => void): void {
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
    onWrite(err, key);
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
          onWrite(err, key);
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
export const saveEditor = (make: () => (EditorSave & { failed?: () => void; done?: () => void }) | null) =>
  write('editor', async () => {
    const s = make();
    if (!s) return;
    const at = Date.now();
    try {
      const steps = s.steps.map((e): [string, StoredStep] => [stepKey(e.id), e]);
      await setMany([[DRAFT_KEY, s.draft], [DRAFT_REV_KEY, s.history.rev], [HISTORY_KEY, s.history], [DRAFT_AT_KEY, at], ...steps]);
      if (s.dropped.length) await delMany(s.dropped.map(stepKey));
    } catch (err) {
      s.failed?.();
      throw err;
    }
    s.done?.();
    // Written: a rescue copy from before this write is out of date.
    const r = readRescue();
    if (r && r.at <= at) dropRescue();
  });

interface Rescue {
  at: number;
  draft: Game;
  /** The undo history as it stood, with the steps storage may not have had yet. */
  history?: { saved: SavedHistory; steps: StoredStep[] };
}
function readRescue(): Rescue | null {
  try {
    const r = JSON.parse(localStorage.getItem(RESCUE_KEY) ?? 'null') as Rescue | null;
    return r && typeof r.at === 'number' && r.draft && typeof r.draft === 'object' ? r : null;
  } catch {
    return null;
  }
}
function dropRescue(): void {
  try {
    localStorage.removeItem(RESCUE_KEY);
  } catch {
    // Storage off: there's no copy either.
  }
}
/**
 * The page is going away: a copy of the draft that's written at once (call it before starting the last IndexedDB
 * write, so that write, if it finishes, is newer and drops it). Too big for localStorage: nothing (the IndexedDB
 * write is all there is).
 */
export function rescueDraft(draft: Game, history?: Rescue['history']): void {
  try {
    localStorage.setItem(RESCUE_KEY, JSON.stringify({ at: Date.now(), draft, history } satisfies Rescue));
  } catch {
    // Too big with its history: the draft alone (the history starts again from it).
    try {
      localStorage.setItem(RESCUE_KEY, JSON.stringify({ at: Date.now(), draft } satisfies Rescue));
    } catch {
      dropRescue();
    }
  }
}

/**
 * The draft, and its undo history when that was written with this very draft (another copy of the app, or a version
 * from before the history, may have written the draft since) and all its steps are there.
 */
export async function loadEditor(): Promise<{
  draft?: Game;
  history?: { saved: SavedHistory; steps: StoredStep[] };
  /** The copy written as the page went away: with `history`, its steps are to be stored again (some may not be). */
  rescued?: boolean;
}> {
  const [draft, rev, saved, at] = (await safe(() => getMany([DRAFT_KEY, DRAFT_REV_KEY, HISTORY_KEY, DRAFT_AT_KEY]))) ?? [];
  // The last changes before the page went away, when their IndexedDB write didn't finish (the same as the stored
  // draft: that write did finish). Its history comes with it when every step is there: in the copy, or stored.
  const rescue = readRescue();
  if (rescue && !(typeof at === 'number' && at >= rescue.at) && JSON.stringify(rescue.draft) !== JSON.stringify(draft)) {
    const h = rescue.history;
    if (h?.saved?.v !== 1 || h.saved.gameId !== rescue.draft.id || !Array.isArray(h.steps)) return { draft: rescue.draft, rescued: true };
    const fresh = new Map(h.steps.map((s) => [s.id, s]));
    const rest = h.saved.ids.filter((id) => !fresh.has(id));
    const found = rest.length ? await safe(() => getMany<StoredStep>(rest.map(stepKey))) : [];
    if (!found || found.some((x) => !x)) return { draft: rescue.draft, rescued: true };
    const got = new Map(rest.map((id, i) => [id, found[i]]));
    const steps = h.saved.ids.map((id) => fresh.get(id) ?? got.get(id)!);
    return { draft: rescue.draft, history: { saved: h.saved, steps }, rescued: true };
  }
  if (rescue) dropRescue();
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

/**
 * The game in progress written to localStorage as the page goes away, as RESCUE_KEY is for the draft: its IndexedDB
 * write waits a moment for more host clicks, and a reload right after one would lose it. One for each playKey.
 */
const playRescueKey = () => `jb.playRescue:${playKey}`;
/** When this page last wrote that copy (0: never, so a copy an earlier page left is older than any write now). */
let playRescuedAt = 0;
function dropPlayRescue(): void {
  try {
    localStorage.removeItem(playRescueKey());
  } catch {
    // Storage off: there's no copy either.
  }
}
/**
 * The page is going away: a copy of the game in progress that's written at once (call it before starting the last
 * IndexedDB write, see rescueDraft). Too big for localStorage with its game: the session alone (the stored game is used).
 */
export function rescuePlay(game: Game, session: Session, cover = false): void {
  const base = { session, savedAt: (playRescuedAt = Date.now()), ...(cover ? { cover } : {}) };
  try {
    localStorage.setItem(playRescueKey(), JSON.stringify({ ...base, game } satisfies SavedPlay));
  } catch {
    try {
      localStorage.setItem(playRescueKey(), JSON.stringify(base));
    } catch {
      dropPlayRescue();
    }
  }
}

/** The game in progress: the stored one, or the copy written as the page went away when it's newer (see rescuePlay). */
export async function loadPlay(): Promise<SavedPlay | undefined> {
  const stored = await safe(() => get<SavedPlay>(playKey));
  try {
    const r = JSON.parse(localStorage.getItem(playRescueKey()) ?? 'null') as Partial<SavedPlay> | null;
    const session = r?.session && typeof r.session === 'object' ? r.session : null;
    if (r && session && typeof r.savedAt === 'number' && !(stored && stored.savedAt >= r.savedAt)) {
      // (Only its session fitted: its game is the stored one, when that's the same game.)
      const game = r.game && typeof r.game === 'object' ? r.game : stored?.game?.id === session.gameId ? stored.game : undefined;
      if (game) return { game, session, savedAt: r.savedAt, ...(r.cover ? { cover: true } : {}) };
    }
    // (Out of date: it would only take room the draft's rescue copy may need.)
    if (r) dropPlayRescue();
  } catch {
    // None, or not readable (a copy that isn't one is dropped).
    dropPlayRescue();
  }
  return stored;
}
/** Goes up when the game in progress is cleared: a write of it from before then (tried again, say) writes nothing. */
let playGen = 0;
/** Writes of the game in progress under way (one started as the page goes away may not finish). */
let playWrites = 0;
/** The game in progress may not be stored as it stands: a write of it is under way, or failed and waits to be tried again. */
export const playUnsure = (): boolean => playWrites > 0 || failed.has('play');
export const savePlay = (game: Game, session: Session, cover = false) => {
  const gen = playGen;
  return write('play', async () => {
    // (Discarded or over since: it isn't written back.)
    if (gen !== playGen) return;
    const savedAt = Date.now();
    playWrites++;
    try {
      await set(playKey, { game, session, savedAt, ...(cover ? { cover } : {}) } satisfies SavedPlay);
    } catch (err) {
      // (Failed once it was cleared: there's nothing left to keep, so nothing to try again.)
      if (gen === playGen) throw err;
      return;
    } finally {
      playWrites--;
    }
    // Written: a rescue copy from before this write is out of date.
    if (playRescuedAt <= savedAt) dropPlayRescue();
  });
};
/**
 * A player-only file's file added during its game (a drawing, a file dropped on the stage): kept with its saved game,
 * each one written once (see storePlayFiles), and deleted with it.
 */
export const playFileKey = (id: string) => `${playKey}:file:${id}`;
export const clearPlay = () => {
  dropPlayRescue();
  // A write of it that failed isn't tried again (that would bring it back), and is no longer waited for.
  playGen++;
  failed.delete('play');
  return safe(async () => {
    await del(playKey);
    const files = playFileKey('');
    await delMany((await keys()).filter((k) => typeof k === 'string' && k.startsWith(files)));
  });
};

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
  /**
   * The pre-game screen's settings (buzzers, ⚖ Game rules): a reload right after changing one can come back before the
   * editor's copy of it is written. (Only a reload back onto the pre-game screen uses them: in the editor, its own copy
   * is the one to keep.)
   */
  settings?: GameSettings;
}
/** Back onto the pre-game screen after a reload: its settings, with Buzzer mode on (the room says so). */
export function applyRoomSettings(s: GameSettings, r: SavedRoom): void {
  if (r.settings && typeof r.settings === 'object') Object.assign(s, r.settings);
  s.buzzer = true;
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
  /** A call waits to run. */
  call.pending = () => pending !== null;
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
