// Is a newer version out? The app asks GitHub for the newest release (every push to main is one, numbered by
// scripts/version.mjs) each time it starts and then every hour while it's open (⚙ Settings can turn both off), and
// when ℹ About is asked.
// The desktop app can then update itself in place; the HTML file offers the new file to download (a page can't
// replace the file it was opened from).
import { isNewer } from './semver';
import { prefs } from './prefs.svelte';
import { announce } from './announce';

export const REPO = 'vampiricwulf/Brainrot-Game-Maker';
export const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;
const API = `https://api.github.com/repos/${REPO}/releases/latest`;
/** The release's files, by name (.github/workflows/build.yml). */
export const ASSETS = { html: 'brainrot-game-maker.html', exe: 'brainrot-game-maker-portable.exe', sig: 'brainrot-game-maker-portable.exe.sig' };

const CACHE_KEY = 'jb.update';
const SKIP_KEY = 'jb.updateSkip';

export interface Release {
  version: string;
  /** The release's page (its notes). */
  page: string;
  notes: string;
  /** Download links of its files, by name. */
  files: Record<string, string>;
}

export const update = $state<{
  status: 'idle' | 'checking' | 'current' | 'available' | 'failed' | 'installing';
  latest: Release | null;
  error: string;
  /** The notice in the editor was put away for this version. */
  skipped: string;
  /** When GitHub last answered (ms; 0: not yet), shown in ℹ About. */
  checkedAt: number;
  /** The version whose .exe the desktop app already put in place (only the restart into it is left). */
  installed: string;
  /** Why ⬆ Update failed during a game: said back in the editor (nothing pops up over the stage). */
  failed: string;
  /** The HTML file: the version whose ⬇ Download was just opened in a new tab (the notice and ℹ About say what's next). */
  downloading: string;
  /**
   * A newer version the hourly check found while the editor was in use: ℹ About shows it, the editor's notice waits for
   * a pause (see holdForAPause).
   */
  held: Release | null;
}>({ status: 'idle', latest: null, error: '', skipped: readSkip(), checkedAt: 0, installed: '', failed: '', downloading: '', held: null });

function storedFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === 'on';
  } catch {
    return false;
  }
}

function readSkip(): string {
  try {
    return localStorage.getItem(SKIP_KEY) ?? '';
  } catch {
    return '';
  }
}

/** The release GitHub's answer describes (null when it isn't one). */
export function releaseFrom(json: unknown): Release | null {
  const r = json as { tag_name?: unknown; html_url?: unknown; body?: unknown; assets?: unknown; draft?: unknown; prerelease?: unknown };
  if (!r || typeof r.tag_name !== 'string' || r.draft || r.prerelease) return null;
  const files: Record<string, string> = {};
  if (Array.isArray(r.assets))
    for (const a of r.assets as { name?: unknown; browser_download_url?: unknown }[])
      if (typeof a?.name === 'string' && typeof a.browser_download_url === 'string') files[a.name] = a.browser_download_url;
  return {
    version: r.tag_name.replace(/^v/, ''),
    page: typeof r.html_url === 'string' ? r.html_url : RELEASES_PAGE,
    notes: typeof r.body === 'string' ? r.body : '',
    files,
  };
}

function settle(latest: Release | null): void {
  update.latest = latest;
  update.status = latest && isNewer(latest.version, __APP_VERSION__) ? 'available' : 'current';
}

/** What GitHub said last time (kept for when it can't be reached). */
function lastHeard(): { at: number; release: Release | null } | null {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as { at?: unknown; release?: unknown } | null;
    if (!cached || typeof cached.at !== 'number') return null;
    return { at: cached.at, release: cached.release ? releaseFrom(toApi(cached.release as Release)) : null };
  } catch {
    return null;
  }
}

/** A kept release, in GitHub's shape again (so it's checked the same way as a fresh answer). */
function toApi(r: Release): unknown {
  return { tag_name: typeof r?.version === 'string' ? r.version : undefined, html_url: r?.page, body: r?.notes, assets: Object.entries(r?.files ?? {}).map(([name, url]) => ({ name, browser_download_url: url })) };
}

/**
 * Ask GitHub for the newest release, at start-up and when ℹ About's button is pressed (`manual`). It always asks
 * (one small request; releases come often, so an answer kept from earlier would hide a newer one). When GitHub can't be
 * reached, the start-up check stays quiet and goes by what it heard last; ℹ About says so.
 */
export async function checkForUpdate(manual = false): Promise<void> {
  if (update.status === 'checking' || update.status === 'installing') return;
  if (!manual && !checksOnItsOwn()) return;
  // (A version held for a pause is known: this check goes on from it, and has the last word.)
  if (update.held) settle(takeHeld());
  update.status = 'checking';
  update.error = '';
  lastAsked = Date.now();
  try {
    settle(await askGitHub());
  } catch (err) {
    // fetch's own failures (offline, blocked) are TypeErrors, worded differently in each browser.
    update.error = err instanceof Error && !(err instanceof TypeError) ? err.message : "Couldn't reach GitHub (offline?)";
    const heard = manual ? null : lastHeard();
    if (heard) {
      update.checkedAt = heard.at;
      settle(heard.release);
    } else if (update.latest && isNewer(update.latest.version, __APP_VERSION__)) {
      // A newer version is still known from before: its notice and Update button stay (ℹ About says the check failed).
      update.status = 'available';
    } else update.status = 'failed';
  }
}

/** Only published releases check on their own (a test can turn it on with the "jb.updateCheck" storage key). */
function checksOnItsOwn(): boolean {
  return prefs.checkUpdates && (__RELEASE__ || storedFlag('jb.updateCheck'));
}

/** GitHub's newest release (null: none), kept for an offline start. Throws, worded for ℹ About, when it can't say. */
async function askGitHub(): Promise<Release | null> {
  const res = await fetch(API, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(res.status === 403 || res.status === 429 ? 'GitHub is busy: try again in a while' : `GitHub answered ${res.status}`);
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new Error("GitHub's answer couldn't be read: try again in a while");
  }
  const release = releaseFrom(json);
  update.checkedAt = Date.now();
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: update.checkedAt, release }));
  } catch {
    // Storage off: nothing kept for an offline start.
  }
  return release;
}

/** How often an open copy asks again. */
export const RECHECK_MS = 60 * 60 * 1000;
/** When GitHub was last asked (ms; 0: not yet), by any check. */
let lastAsked = 0;
let rechecking = false;

/**
 * While the app is open, ask GitHub again every hour, quietly: nothing on screen changes while it asks, and a check
 * that fails changes nothing either (what's shown stays as it was). Only a newer version than the one it knew of brings
 * up the editor's notice, and not at once: it waits for a pause (holdForAPause), so the notice never moves the editor
 * under someone's hands. An update already under way is left alone. It looks every minute whether an hour has gone by
 * since the last check (any check: ℹ About's too), so a computer coming back from sleep asks within a minute rather than
 * up to an hour later. Started once.
 */
export function recheckHourly(): void {
  if (rechecking) return;
  rechecking = true;
  watchHands();
  setInterval(() => {
    if (Date.now() - lastAsked < RECHECK_MS || update.status === 'checking' || update.status === 'installing' || !checksOnItsOwn()) return;
    lastAsked = Date.now();
    askGitHub().then(
      (release) => {
        // (An ⬆ Update or a check from ℹ About started meanwhile has the last word.)
        if (update.status === 'checking' || update.status === 'installing') return;
        // GitHub answered: a failure said before no longer holds.
        update.error = '';
        const shown = update.status === 'available' ? update.latest : null;
        // An update under way (its file downloading, or the desktop app's new version in place, waiting for the
        // restart) stays as it is.
        if (shown && underWay(shown)) return;
        // A version already known (shown, or waiting to be) is only ever replaced by a newer one.
        const known = update.held ?? shown;
        if (known) {
          if (release && isNewer(release.version, known.version)) holdForAPause(release);
        } else if (release && isNewer(release.version, __APP_VERSION__)) holdForAPause(release);
        // (Nothing newer: nothing on screen changes, ℹ About says it's the newest.)
        else settle(release);
      },
      () => {},
    );
  }, 60 * 1000);
}

function underWay(r: Release): boolean {
  return update.downloading === r.version || update.installed === r.version;
}

/** How long without a key or a click counts as a pause. */
export const PAUSE_MS = 4000;
let pauseTimer: ReturnType<typeof setTimeout> | undefined;
/** A pointer is down (a held button), or something is being dragged: not a pause however long it lasts. */
let pointerDown = false;
let dragging = false;

/**
 * Keep a newer version the hourly check found until the next pause: a place change in the editor (another page or
 * round, back from a game, a reload: see atAPause) or a few seconds without a key or a click. Its notice coming up
 * pushes the editor down, so it mustn't while someone is clicking or typing in it. (The start-up check's notice shows
 * at once: nothing's under anyone's hands yet.)
 */
function holdForAPause(release: Release): void {
  const first = !update.held;
  update.held = release;
  if (first) waitAgain();
}

/**
 * Follows the keys, the pointer and drags from the start (a drag begun before a version is held still counts). A
 * native drag (a tile, a slide) cancels its pointer as it starts, so dragstart and dragend say when it's over.
 */
function watchHands(): void {
  const down = (): void => {
    pointerDown = true;
    clearTimeout(pauseTimer);
  };
  const up = (): void => {
    pointerDown = false;
    waitAgain();
  };
  // A release that never reaches the page (a native right-click menu takes it, or the window loses focus while a
  // button is held) is over once the page can tell: the menu, the window's blur, or a move with no button down.
  const lost = (): void => {
    pointerDown = dragging = false;
    waitAgain();
  };
  addEventListener('pointerdown', down, true);
  addEventListener('pointerup', up, true);
  addEventListener('pointercancel', up, true);
  addEventListener('pointermove', (e) => e.buttons === 0 && (pointerDown || dragging) && lost(), true);
  addEventListener('contextmenu', lost, true);
  // (Not on capture: an element's blur would come too.)
  addEventListener('blur', lost);
  addEventListener('dragstart', () => ((dragging = true), clearTimeout(pauseTimer)), true);
  addEventListener('dragend', () => ((dragging = false), waitAgain()), true);
  addEventListener('keydown', waitAgain, true);
}

/** (While a version is held: the pause starts again from now.) */
function waitAgain(): void {
  clearTimeout(pauseTimer);
  if (update.held && !pointerDown && !dragging) pauseTimer = setTimeout(atAPause, PAUSE_MS);
}

function takeHeld(): Release | null {
  const release = update.held;
  update.held = null;
  clearTimeout(pauseTimer);
  return release;
}

/**
 * A pause (the editor opened, another page or round shown, or a few seconds without a key or a click): a version held
 * for one now shows in the editor's notice. It waits on while an update is under way (an ⬆ Update installing, or the
 * shown version's download open) until the pause after that.
 */
export function atAPause(): void {
  // (Not mid-drag either, a drag over a round's tab opening it: its end starts the pause again.)
  if (!update.held || pointerDown || dragging || update.status === 'checking' || update.status === 'installing') return;
  const shown = update.status === 'available' ? update.latest : null;
  if (shown && underWay(shown)) return;
  settle(takeHeld());
}

/**
 * ℹ About acts on the version held for a pause (⬆ Update, ⬇ Download, ⟳ Reload): it's the one known from now on, so
 * the editor's notice names it, and nothing goes on offering the older one.
 */
export function settleHeld(release: Release): void {
  if (update.held?.version === release.version) settle(takeHeld());
}

let said = '';

/**
 * The editor's notice for this version is showing: screen readers hear it from the page's live region (a notice that
 * appears with its words isn't always read), once, not again each time the editor comes back.
 */
export function sayUpdateOut(version: string): void {
  if (said === version) return;
  said = version;
  announce(`Brainrot Games Maker ${version} is out. The notice under the header says how to get it.`);
}

/** Put the editor's notice away until a newer version than this one is out. */
export function skipVersion(version: string): void {
  update.skipped = version;
  try {
    localStorage.setItem(SKIP_KEY, version);
  } catch {
    // Storage off: it's put away until the app closes.
  }
}
