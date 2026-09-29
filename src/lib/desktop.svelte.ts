// Desktop app (.exe) only: facts the native side hands the host page at startup, and the
// "Discord audio fix" setting (see src-tauri/src/main.rs).
import { inTauri } from './platform';

declare global {
  interface Window {
    /** The WebView2 switches the app started with, when they aren't the defaults (the Discord audio fix is on). */
    __JB_BROWSER_ARGS?: string;
    /** The Discord audio fix is switched on (it applies from the next start). */
    __JB_AUDIO_FIX?: boolean;
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
});

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

/** Restart the app. Waits a moment first so the last autosave (half a second behind) is written. */
export async function restartApp(): Promise<void> {
  await new Promise((r) => setTimeout(r, 800));
  await invoke('restart_app');
}
