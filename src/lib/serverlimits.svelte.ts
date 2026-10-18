// How big a 🤫 card file the buzzer server takes (card-files spec §2.3): the room's welcome says it once a room is open;
// before that (the editor's 📱 preview and checklist, the pre-game screen) GET /api/health does, asked once per server
// address while this page is open and kept in memory. A server that doesn't say is an older one (OLD_FILE_LIMITS: 16 MB a
// file); one not heard from yet is taken to have the defaults.
import { DEFAULT_FILE_LIMITS, OLD_FILE_LIMITS, parseFileLimits, type FileLimits } from './buzzproto';
import { serverAddress } from './prefs.svelte';
import { buzzerBase, remote } from './remote.svelte';

/** What a server said about card files: its limits, that it takes none ('off'), or nothing (an older one: 'old'). */
export type Said = { files: FileLimits } | 'off' | 'old';

/** A failed ask (no answer, or not a buzzer server's) may be asked again this long after. */
export const ASK_AGAIN_MS = 60_000;

/** What each server address said, as last heard. */
const said = $state<Record<string, Said>>({});
/** When each address was last asked and got no answer (Infinity: being asked now). */
const asked = new Map<string, number>();

/** What a /api/health answer says about card files, or null when it isn't a buzzer server's answer. */
export function healthFiles(x: unknown): Said | null {
  if (typeof x !== 'object' || !x || (x as { ok?: unknown }).ok !== true) return null;
  const files = (x as { files?: unknown }).files;
  if (files === null) return 'off';
  // (Limits that don't add up: taken as an older server's.)
  const limits = parseFileLimits(files);
  return limits ? { files: limits } : 'old';
}

/** Note what server `base` said (its welcome, its health answer, ⚙ Settings › Test). */
export function noteServerFiles(base: string, s: Said): void {
  const url = serverAddress(base);
  if (!url || JSON.stringify(said[url]) === JSON.stringify(s)) return;
  said[url] = s;
}

/**
 * Ask server `base` what card files it takes, unless it said already this page: once, quietly (no answer is no
 * matter: it can be asked again after ASK_AGAIN_MS).
 */
export function askServerFiles(base: string): void {
  const url = serverAddress(base);
  if (!/^https?:\/\//.test(url) || url in said) return;
  const last = asked.get(url);
  if (last !== undefined && Date.now() - last < ASK_AGAIN_MS) return;
  asked.set(url, Infinity);
  void (async () => {
    try {
      const res = await fetch(`${url}/api/health`);
      const s = res.ok ? healthFiles(await res.json()) : null;
      if (s) {
        asked.delete(url);
        return noteServerFiles(url, s);
      }
    } catch {
      // (No answer: the next ask may get one.)
    }
    asked.set(url, Date.now());
  })();
}

/**
 * The card file limits to go by now: this window's room's (its welcome), when it's open on the buzzer server in use;
 * else what that server said (askServerFiles); else the defaults (`known` false). `off`: it takes no files. `old`: an
 * older server, which didn't say (OLD_FILE_LIMITS). `gifs`: phones show a GIF's 🗜 copy like a GIF (only an open room
 * says otherwise: an older one).
 */
export function fileLimitsNow(): { limits: FileLimits; known: boolean; off: boolean; old: boolean; gifs: boolean } {
  const base = buzzerBase();
  if (base && remote.welcomed && remote.status === 'online' && serverAddress(remote.base) === base)
    return {
      limits: remote.limits ?? OLD_FILE_LIMITS,
      known: true,
      off: remote.features.includes('cards') && !remote.features.includes('files'),
      old: !remote.limits,
      gifs: remote.features.includes('gifs'),
    };
  const s = base ? said[base] : undefined;
  if (s === 'old') return { limits: OLD_FILE_LIMITS, known: true, off: false, old: true, gifs: true };
  if (s === 'off') return { limits: DEFAULT_FILE_LIMITS, known: true, off: true, old: false, gifs: true };
  if (s) return { limits: s.files, known: true, off: false, old: false, gifs: true };
  return { limits: DEFAULT_FILE_LIMITS, known: false, off: false, old: false, gifs: true };
}

/** For tests: forget what every server said. */
export function forgetServerFiles(): void {
  for (const k of Object.keys(said)) delete said[k];
  asked.clear();
}
