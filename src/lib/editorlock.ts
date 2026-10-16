// One editor at a time: every copy of the app opened from disk shares one autosave, so two tabs editing would
// overwrite each other's draft (and clean up each other's undo steps). The copy that edits holds a Web Lock; another
// copy waits with editing paused until it's asked to take over ("Edit here instead"), and then the first one lets go.
// An exported player-only file does the same for its saved game in progress (the file opened twice). The copy that edits
// also says when it's playing a game or showing its audience window (shared locks): taking over stops those, so a paused
// copy warns first.
const LOCK = 'brainrot-games-editor';
/** How long a copy asking to take over waits for the editing one to let go before taking the lock anyway. */
const WAIT_MS = 4000;
/** How often the editing copy looks for one asking to take over. */
const POLL_MS = 1000;

/** The lock this copy holds or waits for: the editor's, or a player-only file's saved game's (see claimEditor). */
let lockName = LOCK;
let holding = false;
let letGo: (() => void) | null = null;
let poll: ReturnType<typeof setInterval> | undefined;
let lost: () => Promise<void> | void = () => {};

/** Ask for the lock; true once it's held (false: not now, or the wait was cut short). */
function hold(options: LockOptions): Promise<boolean> {
  return new Promise((resolve) => {
    navigator.locks
      .request(lockName, options, (lock) => {
        if (!lock) return resolve(false);
        holding = true;
        resolve(true);
        return new Promise<void>((r) => (letGo = r));
      })
      .catch((e) => {
        // Taken by a copy that got no answer (this one was frozen, or asleep in the background).
        if (holding) give(false);
        // Refused, not busy (site data blocked, or a sandboxed frame): as with no Web Locks, this copy edits. Its storage
        // is refused too then, so two copies have nothing to overwrite. (The take-over wait cut short is no.)
        else resolve(e instanceof DOMException && e.name === 'SecurityError');
      });
  });
}

/** Stop editing here (`flush`: write the last changes first, when the lock is still held). */
async function give(flush: boolean): Promise<void> {
  holding = false;
  clearInterval(poll);
  await Promise.resolve(lost()).catch(() => {});
  if (flush) letGo?.();
  letGo = null;
}

/**
 * Become the copy that edits. `take`: ask the one editing now to stop (it writes its last changes, then lets go),
 * otherwise only when no copy edits. `onLost` runs when another copy takes over later: write the last changes and stop
 * writing. True when this copy edits (always, where the browser has no Web Locks). `name`: another lock than the
 * editor's (a player-only file's tabs share one per saved game: the same file opened twice).
 */
export async function claimEditor(take: boolean, onLost: () => Promise<void> | void, name = LOCK): Promise<boolean> {
  lockName = name;
  lost = onLost;
  if (!navigator.locks) return true;
  let got: boolean;
  if (!take) got = await hold({ ifAvailable: true });
  else {
    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), WAIT_MS);
    got = (await hold({ signal: stop.signal })) || (await hold({ steal: true }));
    clearTimeout(timer);
  }
  if (got) {
    // A copy asking to take over waits for the lock: let go when one does.
    poll = setInterval(async () => {
      const pending = (await navigator.locks.query().catch(() => null))?.pending ?? [];
      if (holding && pending.some((l) => l.name === lockName)) void give(true);
    }, POLL_MS);
  }
  return got;
}

/**
 * What the copy that edits is doing that taking over would stop: playing a game (not the pre-game screen, nor a ▶ Test),
 * and showing its audience window (which a stream may be capturing).
 */
export type Busy = { playing: boolean; audience: boolean };
const BUSY = ['playing', 'audience'] as const;
/** Each is a lock this copy holds (shared) meanwhile, named after the editor's. */
const busyLock = (k: keyof Busy) => `${lockName}:${k}`;
/** What lets go of each one held. */
const letBusyGo: Record<keyof Busy, (() => void) | null> = { playing: null, audience: null };

/** Say what this copy is doing that taking over would stop: a paused copy warns before it takes over (watchEditor). */
export function markBusy(busy: Busy): void {
  if (!navigator.locks) return;
  for (const k of BUSY) {
    if (busy[k] === !!letBusyGo[k]) continue;
    letBusyGo[k]?.();
    letBusyGo[k] = null;
    if (!busy[k]) continue;
    // (Made here, so it can be let go of before the lock is granted.)
    const held = new Promise<void>((r) => (letBusyGo[k] = r));
    void navigator.locks.request(busyLock(k), { mode: 'shared' }, () => held).catch(() => {});
  }
}

/**
 * While this copy is paused: hears whether any copy edits (false once the one editing has closed, so this one can offer to
 * edit here), and what it's doing that taking over would stop (markBusy), checking every second. Returns a function that
 * stops listening.
 */
export function watchEditor(onChange: (taken: boolean, busy: Busy) => void): () => void {
  if (!navigator.locks) return () => {};
  let last = '';
  const check = async () => {
    const state = await navigator.locks.query().catch(() => null);
    if (!state) return;
    const taken = [...(state.held ?? []), ...(state.pending ?? [])].some((l) => l.name === lockName);
    const held = new Set((state.held ?? []).map((l) => l.name));
    const busy = { playing: held.has(busyLock('playing')), audience: held.has(busyLock('audience')) };
    const now = JSON.stringify([taken, busy]);
    if (now === last) return;
    last = now;
    onChange(taken, busy);
  };
  void check();
  const id = setInterval(check, POLL_MS);
  return () => clearInterval(id);
}
