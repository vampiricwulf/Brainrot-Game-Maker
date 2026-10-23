// Desktop app (.exe) only: facts the native side hands the host page at startup, and the
// "Discord audio fix" setting (see src-tauri/src/main.rs).
import { inTauri } from './platform';
import { ask, tell } from './ask.svelte';
import { toast } from './app.svelte';

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

/**
 * Close the audience windows (desktop app), or with `scores` the scores-only windows: from the page's side, closing one
 * isn't always possible (after a reload of this page it has no handle on it at all).
 */
export function closeAudienceNative(scores = false): void {
  if (inTauri()) invoke('close_audience', { scores }).catch(() => {});
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
    // Lets the last autosave (half a second behind) be written first, and any save or export being written finish
    // (as the restart into an update does).
    await new Promise((r) => setTimeout(r, 800));
    await saveEverythingNow();
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

/**
 * Where a save went: BrainrotSaves next to the exe, or in Documents (`fallback`) when the app may not write in its own
 * folder; in a browser, where its save picker put it (`picked`: `path` is then only the file's name).
 */
export interface SavedFile {
  path: string;
  fallback: boolean;
  picked?: boolean;
}

type SaveMode = 'new' | 'backup' | 'overwrite';

/**
 * Save a file into BrainrotSaves (desktop app). `new`: never replace a save ("Game (2).brainrot"…); `backup`: replace
 * it, keeping the one replaced as "Game.brainrot.bak" (and the one before as .bak2); `overwrite`: just replace it.
 * `docs`: the name and mode in Documents\BrainrotSaves, if the app may not write in its own folder (the same by
 * default). Throws the app's message when it can't.
 */
export async function saveToSaves(name: string, blob: Blob, mode: SaveMode = 'overwrite', docs?: { name: string; mode: SaveMode }): Promise<SavedFile> {
  const { core } = await import('@tauri-apps/api');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const headers: Record<string, string> = { 'x-name': encodeURIComponent(name), 'x-mode': mode };
  if (docs) Object.assign(headers, { 'x-docs-name': encodeURIComponent(docs.name), 'x-docs-mode': docs.mode });
  try {
    return await core.invoke<SavedFile>('save_file', bytes, { headers });
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
  try {
    const buf = await invoke<ArrayBuffer>('read_save', { name: entry.name, place: entry.place });
    return new File([buf], entry.name);
  } catch (err) {
    // (The app's own message, such as a file moved since the list was made, or locked by another program.)
    throw new Error(typeof err === 'string' ? err : "Couldn't open the save.");
  }
}

/** Delete an autosave past the number kept (the app deletes nothing else). */
export async function deleteSave(entry: SaveEntry): Promise<void> {
  await invoke('delete_save', { name: entry.name, place: entry.place });
}

/** The host window: the one the native side hands its flags to (not the audience window). */
const isHost = () => inTauri() && w?.__JB_AUDIO_FIX !== undefined;

/** The game file the app was opened with ("Open with", or a second launch given one), taken once. */
async function takeOpenedFile(): Promise<File | null> {
  // The name, then the file of that name: another launch can give a new file in between (it's asked again).
  for (let tries = 0; tries < 5; tries++) {
    const name = await invoke<string | null>('opened_file');
    if (!name) return null;
    try {
      return new File([await invoke<ArrayBuffer>('take_opened_file', { name })], name);
    } catch (err) {
      if (err !== 'changed') throw err;
    }
  }
  return null;
}

/**
 * Open the game file the app was started with now, and any a later launch is given (the running app gets it then).
 * Returns the stop function. A file that arrives while nothing listens (a game is being played) waits for the next call.
 */
export function onOpenedFile(open: (file: File) => void): () => void {
  if (!isHost()) return () => {};
  opener = open;
  openWaiting();
  if (!listeningForFiles) {
    listeningForFiles = true;
    import('@tauri-apps/api/event')
      .then(({ listen }) => listen('open-file', openWaiting))
      .catch((err) => console.warn('Not listening for files to open', err));
  }
  return () => {
    if (opener === open) opener = null;
  };
}

let opener: ((file: File) => void) | null = null;
let listeningForFiles = false;

/** The file being taken now: one take at a time, so a file's name and contents always go together. */
let taking: Promise<void> = Promise.resolve();

function openWaiting(): void {
  taking = taking.then(() => {
    const open = opener;
    if (!open) return sayWaiting();
    return takeOpenedFile()
      .then((file) => void (file && open(file)))
      .catch((err) => void tell(err instanceof Error ? err.message : String(err)));
  });
}

/** The game files said to wait, by name (each is said once). */
const waitingSaid = new Set<string>();

/**
 * A game file given while a game is played waits for the editor: the host is told so, once for each file. (Not by its
 * name: in one window, the next show's name would be on stream.)
 */
async function sayWaiting(): Promise<void> {
  const name = await invoke<string | null>('opened_file').catch(() => null);
  if (!name || waitingSaid.has(name)) return;
  waitingSaid.add(name);
  toast('That game file opens when you go back to the editor.', 5000);
}

/** Saves, exports and autosaves being written now (closing the window asks first, see flushOnClose). */
let writes = 0;
let writesDone: (() => void)[] = [];

/** Run a save, export or autosave: closing the app's window meanwhile asks whether to wait for it. */
export async function whileWriting<T>(fn: () => Promise<T>): Promise<T> {
  writes++;
  try {
    return await fn();
  } finally {
    if (--writes === 0) for (const done of writesDone.splice(0)) done();
  }
}

/**
 * Inside whileWriting, a question to the host (Export anyway?): nothing is written while it waits, so closing the window
 * meanwhile doesn't say a save is in progress.
 */
export async function notWritingWhile<T>(fn: () => Promise<T>): Promise<T> {
  if (!writes) return fn();
  if (--writes === 0) for (const done of writesDone.splice(0)) done();
  try {
    return await fn();
  } finally {
    writes++;
  }
}

/** Resolves once no save is being written (at once when none is). */
export function writesFinished(): Promise<void> {
  return writes ? new Promise((r) => writesDone.push(r)) : Promise.resolve();
}

/** A save is being written now. */
export const writing = (): boolean => writes > 0;

/** Asked when the window is closed while a save is written. */
export const CLOSE_ASK = 'A save is in progress. Closing now would cut it off.\n\nThe app closes by itself once it’s done.';

/** What writes the last edits (given to flushOnClose). */
let closeFlush: (() => void) | null = null;

/** Write the last edits and wait for every write under way (before the app restarts for an update). */
export async function saveEverythingNow(): Promise<void> {
  closeFlush?.();
  await new Promise((r) => setTimeout(r));
  await (await import('idb-keyval')).get('__probe');
  if (writing()) await writesFinished();
}

/** This copy of the desktop app can update itself in place (it carries the key releases are signed with). */
export async function canSelfUpdate(): Promise<boolean> {
  return inTauri() && (await invoke<boolean>('can_self_update').catch(() => false));
}

/** Put a release's .exe in place of this one (its signature checked); restartIntoUpdate starts it. */
export async function installUpdate(exeUrl: string, signatureUrl: string): Promise<void> {
  await invoke('install_update', { exeUrl, signatureUrl });
}

/** Save everything and restart into the update put in place by installUpdate. */
export async function restartIntoUpdate(): Promise<void> {
  await saveEverythingNow();
  await invoke('restart_app');
}

/** Resolves once `busy` says nothing is under way (asked twice a second). */
function idle(busy: () => string | null): Promise<void> {
  return new Promise((resolve) => {
    const t = setInterval(() => {
      if (busy()) return;
      clearInterval(t);
      resolve();
    }, 500);
  });
}

/**
 * When the app's window is closed: run `flush` (it writes the last edits), then close once those writes are done (the
 * app closes anyway after a few seconds). Closing right after typing no longer loses the last edits. While a save,
 * export or autosave is being written, it asks first: Wait (the app closes once it's done) or Close anyway. So it does
 * while `busy` says what's under way (a 🗜 copy being made, in a sentence): Wait waits for it to finish, then writes
 * what it made too. While `lost` says autosave isn't working, closing would lose the game in progress ('play') or the
 * changes since the last Save ('edit'): it asks first, as a browser tab does, and Stay keeps the window open.
 */
export function flushOnClose(flush: () => void, busy?: () => string | null, lost?: () => 'play' | 'edit' | null): void {
  if (!isHost()) return;
  closeFlush = flush;
  /** Waiting for a save to finish before closing (the ✕ clicked again changes nothing). */
  let waiting = false;
  import('@tauri-apps/api/event')
    .then(({ listen }) =>
      listen('close-requested', async () => {
        if (waiting) return void invoke('hold_close').catch(() => {});
        let stay = false;
        try {
          flush();
          const job = busy?.();
          if (job) {
            waiting = true;
            await invoke('hold_close');
            const done = idle(busy!);
            const anyway = await ask(`${job} Closing now stops it (nothing is changed).\n\nThe app closes by itself once it’s done.`, { ok: 'Close anyway', cancel: 'Wait', danger: true, until: done });
            if (!anyway) {
              await done;
              // What it made is a step now: written too, before the app closes.
              flush();
            }
          }
          // A read waits for every write started before it (IndexedDB runs them in order).
          await new Promise((r) => setTimeout(r));
          await (await import('idb-keyval')).get('__probe');
          if (writing()) {
            waiting = true;
            // The window stays open for as long as this takes.
            await invoke('hold_close');
            const done = writesFinished();
            const anyway = await ask(CLOSE_ASK, { ok: 'Close anyway', cancel: 'Wait', danger: true, until: done });
            if (!anyway) await done;
          }
          const loses = lost?.();
          if (loses) {
            waiting = true;
            await invoke('hold_close');
            const what = loses === 'play' ? 'the game in progress' : 'your changes since the last Save';
            stay = !(await ask(`Autosave isn't working, so closing now loses ${what}.`, { ok: 'Close anyway', cancel: 'Stay', danger: true }));
          }
        } finally {
          waiting = false;
          // (Stay: the window stays open, and the next ✕ asks again.)
          if (!stay) await invoke('close_app');
        }
      }),
    )
    .then(() => invoke('flush_on_close'))
    .catch((err) => console.warn('Not saving on close', err));
}
