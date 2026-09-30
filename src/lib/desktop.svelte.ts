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

/** What the host is asked before a restart (inline in the page: a browser dialog would show on stream). */
export const RESTART_ASK = 'Restart Brainrot Games Maker now? Everything is saved: a game in progress can be resumed from the editor.';

/**
 * Restart the app (the host was asked first: RESTART_ASK). `retry`: WebView2 crashed with the Discord audio fix, so
 * forget that first and start with the fix again. Resolves to an error message, or null.
 */
export async function restartApp(retry = false): Promise<string | null> {
  desktop.restarting = true;
  try {
    // Lets the last autosave (half a second behind) be written first.
    await new Promise((r) => setTimeout(r, 800));
    await invoke(retry ? 'retry_audio_fix' : 'restart_app');
    return null;
  } catch (err) {
    desktop.restarting = false;
    return typeof err === 'string' ? err : "Couldn't restart. Close Brainrot Games Maker and open it again.";
  }
}

export interface DataFolder {
  path: string | null;
  exists: boolean;
}

/**
 * Where the desktop app keeps things (see data_folders in src-tauri/src/main.rs): `data` holds the autosave and stored
 * media, `settings` the Discord audio fix's files. Null outside the desktop app or if the app can't say.
 */
export interface DataFolders {
  data: DataFolder;
  settings: DataFolder;
  /** The folders the app had as Jeopardy Builder, while they still exist (normally moved on the first start). */
  oldData?: DataFolder;
  oldSettings?: DataFolder;
  /** BrainrotSaves next to the exe (where Save puts games), and in Documents (when the exe's folder can't be written). */
  saves?: DataFolder;
  savesDocuments?: DataFolder;
  /** This start moved the old Jeopardy Builder folders over. */
  moved?: boolean;
}

export type FolderName = 'data' | 'settings' | 'old-data' | 'old-settings' | 'saves' | 'saves-documents';

export async function dataFolders(): Promise<DataFolders | null> {
  if (!inTauri()) return null;
  try {
    const f = await invoke<DataFolders | null>('data_folders');
    return f?.data ? f : null;
  } catch (err) {
    console.warn('Could not get the data folders', err);
    return null;
  }
}

/** Show one of the app's folders in File Explorer. Resolves to an error message, or null. */
export async function openDataFolder(which: FolderName): Promise<string | null> {
  try {
    await invoke('open_data_folder', { which });
    return null;
  } catch (err) {
    return typeof err === 'string' ? err : "Couldn't open the folder.";
  }
}

/** Open one of the project's pages (source, releases, issues) in the default browser. False if the app couldn't. */
export async function openLink(url: string): Promise<boolean> {
  try {
    await invoke('open_link', { url });
    return true;
  } catch (err) {
    console.warn('Could not open the link', err);
    return false;
  }
}

/** Where a save went: BrainrotSaves next to the exe, or in Documents (`fallback`) when that folder couldn't be written. */
export interface SavedFile {
  path: string;
  fallback: boolean;
}

/** Save a file into BrainrotSaves (desktop app). Throws the app's message when it can't. */
export async function saveToSaves(name: string, blob: Blob, mode: 'new' | 'overwrite' = 'overwrite'): Promise<SavedFile> {
  const { core } = await import('@tauri-apps/api');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  try {
    return await core.invoke<SavedFile>('save_file', bytes, { headers: { 'x-name': encodeURIComponent(name), 'x-mode': mode } });
  } catch (err) {
    throw new Error(typeof err === 'string' ? err : "Couldn't save the file.");
  }
}

export interface SaveEntry {
  name: string;
  size: number;
  /** ms since 1970. */
  modified: number;
  place: 'app' | 'documents';
}

/** The saves in BrainrotSaves, newest first (empty outside the desktop app). */
export async function listSaves(): Promise<SaveEntry[]> {
  if (!inTauri()) return [];
  try {
    return await invoke<SaveEntry[]>('list_saves');
  } catch (err) {
    console.warn('Could not list the saves', err);
    return [];
  }
}

/** One save as a File (to open it like a picked file). */
export async function readSave(entry: SaveEntry): Promise<File> {
  const buf = await invoke<ArrayBuffer>('read_save', { name: entry.name, place: entry.place });
  return new File([buf], entry.name);
}
