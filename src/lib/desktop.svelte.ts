// Desktop app (.exe) only: facts the native side hands the host page at startup, and the
// "Discord audio fix" setting (see src-tauri/src/main.rs).
import { inTauri } from './platform';

declare global {
  interface Window {
    /** The WebView2 switches the app started with, when they aren't the defaults (it runs with the Discord audio fix). */
    __JB_BROWSER_ARGS?: string;
    /** The Discord audio fix is switched on (the default; changes apply from the next start). */
    __JB_AUDIO_FIX?: boolean;
    /**
     * The fix is switched on, but WebView2 wouldn't start with it this time (usually the previous copy's WebView2
     * processes were still closing), so this run is without it. A restart normally brings it back.
     */
    __JB_AUDIO_FIX_FAILED?: boolean;
    /** The fix is switched on, but WebView2 crashed with it, so the app runs without it until the host tries again. */
    __JB_AUDIO_FIX_CRASHED?: boolean;
    /** Set when the app runs as administrator or in compatibility mode (Discord/OBS may then miss its sound). */
    __JB_CAPTURE?: { elevated?: boolean; compat?: string | null };
  }
}

const w = typeof window === 'undefined' ? undefined : window;

export const desktop = $state({
  /** The Discord audio fix is switched on (saved). */
  fixSaved: !!w?.__JB_AUDIO_FIX,
  /** The app is running with it (it only changes with a restart). */
  fixActive: !!w?.__JB_BROWSER_ARGS,
  /** It's switched on but didn't start this time: a restart normally fixes that. */
  fixFailed: !!w?.__JB_AUDIO_FIX_FAILED,
  /** It's switched on, but off for this run because WebView2 crashed with it (restartApp(true) tries again). */
  fixCrashed: !!w?.__JB_AUDIO_FIX_CRASHED,
  /** A restart is under way. */
  restarting: false,
});

/**
 * The app was opened again with --no-audio-fix, which saves the fix as off (see src-tauri/src/main.rs). `restart`: the
 * app runs with the fix, so it restarts without it in a moment.
 */
function fixSwitchedOff(restart: boolean): void {
  desktop.fixSaved = false;
  if (restart) desktop.restarting = true;
}

// Only the host window gets the native side's flags, and only it is told when the fix is switched off from outside.
if (inTauri() && w?.__JB_AUDIO_FIX !== undefined) {
  import('@tauri-apps/api/event')
    .then(({ listen }) => listen<boolean>('audio-fix-off', (e) => fixSwitchedOff(!!e.payload)))
    .catch((err) => console.warn('Not listening for the Discord audio fix being switched off', err));
}

/** The switches every new app window must be created with (undefined: the defaults). */
export function browserArgs(): string | undefined {
  return w?.__JB_BROWSER_ARGS || undefined;
}

/** Running as administrator or in compatibility mode: why Discord and OBS may stream no game sound. */
export function captureProblem(): { elevated?: boolean; compat?: string | null } | null {
  return (inTauri() && w?.__JB_CAPTURE) || null;
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const core = await import('@tauri-apps/api/core');
  return core.invoke<T>(cmd, args);
}

/** Switch the Discord audio fix on or off (from the next start). Resolves to an error message, or null. */
export async function setAudioFix(on: boolean): Promise<string | null> {
  try {
    await invoke('set_audio_fix', { on });
    desktop.fixSaved = on;
    return null;
  } catch (err) {
    return typeof err === 'string' ? err : "Couldn't save the setting.";
  }
}

/**
 * Ask, then restart the app. `retry`: WebView2 crashed with the Discord audio fix, so forget that first and start with
 * the fix again. Resolves to an error message, or null (also when the host says no).
 */
export async function restartApp(retry = false): Promise<string | null> {
  if (!confirm('Restart Jeopardy Builder now? Everything is saved: a game in progress can be resumed from the editor.')) return null;
  desktop.restarting = true;
  try {
    // Lets the last autosave (half a second behind) be written first.
    await new Promise((r) => setTimeout(r, 800));
    await invoke(retry ? 'retry_audio_fix' : 'restart_app');
    return null;
  } catch (err) {
    desktop.restarting = false;
    return typeof err === 'string' ? err : "Couldn't restart. Close Jeopardy Builder and open it again.";
  }
}
