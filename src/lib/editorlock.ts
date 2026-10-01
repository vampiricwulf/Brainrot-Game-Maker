// One editor at a time: every copy of the app opened from disk shares one autosave, so two tabs editing would
// overwrite each other's draft (and clean up each other's undo steps). The copy that edits holds a Web Lock; another
// copy waits with editing paused until it's asked to take over ("Edit here instead"), and then the first one lets go.
const LOCK = 'brainrot-games-editor';
/** How long a copy asking to take over waits for the editing one to let go before taking the lock anyway. */
const WAIT_MS = 4000;
/** How often the editing copy looks for one asking to take over. */
const POLL_MS = 1000;

let holding = false;
let letGo: (() => void) | null = null;
let poll: ReturnType<typeof setInterval> | undefined;
let lost: () => Promise<void> | void = () => {};

/** Ask for the lock; true once it's held (false: not now, or the wait was cut short). */
function hold(options: LockOptions): Promise<boolean> {
  return new Promise((resolve) => {
    navigator.locks
      .request(LOCK, options, (lock) => {
        if (!lock) return resolve(false);
        holding = true;
        resolve(true);
        return new Promise<void>((r) => (letGo = r));
      })
      .catch(() => {
        // Taken by a copy that got no answer (this one was frozen, or asleep in the background).
        if (holding) give(false);
        else resolve(false);
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
 * writing. True when this copy edits (always, where the browser has no Web Locks).
 */
export async function claimEditor(take: boolean, onLost: () => Promise<void> | void): Promise<boolean> {
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
      if (holding && pending.some((l) => l.name === LOCK)) void give(true);
    }, POLL_MS);
  }
  return got;
}
