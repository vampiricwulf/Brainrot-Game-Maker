// Is a newer version out? The app asks GitHub for the newest release (every push to main is one, numbered by
// scripts/version.mjs) each time it starts (⚙ Settings can turn that off) and when ℹ About is asked.
// The desktop app can then update itself in place; the HTML file offers the new file to download (a page can't
// replace the file it was opened from).
import { isNewer } from './semver';
import { prefs } from './prefs.svelte';

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
}>({ status: 'idle', latest: null, error: '', skipped: readSkip(), checkedAt: 0 });

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
 * reached, the start-up check stays quiet and goes by what it heard last; the button says so.
 */
export async function checkForUpdate(manual = false): Promise<void> {
  if (update.status === 'checking' || update.status === 'installing') return;
  // Only published releases check on their own (a test can turn it on with the "jb.updateCheck" storage key).
  if (!manual && (!prefs.checkUpdates || !(__RELEASE__ || storedFlag('jb.updateCheck')))) return;
  update.status = 'checking';
  update.error = '';
  try {
    const res = await fetch(API, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
    if (res.status === 404) return settle(null);
    if (!res.ok) throw new Error(res.status === 403 || res.status === 429 ? 'GitHub is busy: try again in a while' : `GitHub answered ${res.status}`);
    const release = releaseFrom(await res.json());
    update.checkedAt = Date.now();
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ at: update.checkedAt, release }));
    } catch {
      // Storage off: nothing kept for an offline start.
    }
    settle(release);
  } catch (err) {
    update.error = err instanceof Error && err.message !== 'Failed to fetch' ? err.message : "Couldn't reach GitHub (offline?)";
    const heard = manual ? null : lastHeard();
    if (heard) {
      update.checkedAt = heard.at;
      settle(heard.release);
    } else update.status = manual ? 'failed' : 'idle';
  }
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
