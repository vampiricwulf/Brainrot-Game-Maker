// Is a newer version out? The app asks GitHub for the newest release (every push to main is one, numbered by
// scripts/version.mjs) when it starts (at most every few hours, ⚙ Settings can turn it off) and when ℹ About is asked.
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
/** How often the start-up check asks GitHub (in between, it uses what it heard last). */
const EVERY_MS = 6 * 60 * 60 * 1000;

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
}>({ status: 'idle', latest: null, error: '', skipped: readSkip() });

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

/**
 * Ask GitHub for the newest release. `manual` (ℹ About's button): always asks, and says so when it can't; the start-up
 * check uses what it heard in the last few hours, and stays quiet when offline.
 */
export async function checkForUpdate(manual = false): Promise<void> {
  if (update.status === 'checking' || update.status === 'installing') return;
  if (!manual) {
    // Only published releases check on their own (a test can turn it on with the "jb.updateCheck" storage key).
    if (!prefs.checkUpdates || !(__RELEASE__ || storedFlag('jb.updateCheck'))) return;
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as { at: number; release: Release | null } | null;
      if (cached && Date.now() - cached.at < EVERY_MS) return settle(cached.release);
    } catch {
      // Nothing usable kept: ask.
    }
  }
  update.status = 'checking';
  update.error = '';
  try {
    const res = await fetch(API, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
    if (res.status === 404) return settle(null);
    if (!res.ok) throw new Error(res.status === 403 || res.status === 429 ? 'GitHub is busy: try again in a while' : `GitHub answered ${res.status}`);
    const release = releaseFrom(await res.json());
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), release }));
    } catch {
      // Storage off: it asks again next time.
    }
    settle(release);
  } catch (err) {
    update.status = manual ? 'failed' : 'idle';
    update.error = err instanceof Error && err.message !== 'Failed to fetch' ? err.message : "Couldn't reach GitHub (offline?)";
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
