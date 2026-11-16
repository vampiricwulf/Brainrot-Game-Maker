// Small helpers for running inside the Tauri desktop app vs a normal browser.

/** True inside the desktop (.exe) app. */
export function inTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** Where the app keeps games by itself (autosave, Recent games): "on this PC" in the desktop app. */
export function keptHere(): string {
  return inTauri() ? 'on this PC' : 'in this browser';
}

/**
 * True for the copy online (GitHub Pages, or any web address): not the downloaded file, not the desktop app. There's no
 * file to speak of there, and its games are kept apart from the file's.
 */
export function onlineCopy(): boolean {
  return !inTauri() && typeof location !== 'undefined' && (location.protocol === 'https:' || location.protocol === 'http:');
}

/** What the browser allows popups for: "this site" online, else "this file". */
export function popupsFor(): string {
  return onlineCopy() ? 'this site' : 'this file';
}

/** Said when a window (a 🪟 card window, the scores or audience window) didn't open. */
export function popupBlocked(): string {
  return inTauri() ? "Couldn't open the window. Try again." : `The browser blocked the popup. Allow popups for ${popupsFor()} and try again.`;
}

/**
 * Toggle full-screen for this window. In the desktop app the webview can't take over the monitor by
 * itself (HTML full-screen only fills the window), so the native window is made full-screen instead.
 */
export async function toggleFullscreen(): Promise<void> {
  if (inTauri()) {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const w = getCurrentWindow();
      await w.setFullscreen(!(await w.isFullscreen()));
      return;
    } catch (err) {
      console.warn('Native full-screen failed, falling back to HTML full-screen', err);
    }
  }
  if (document.fullscreenElement) await document.exitFullscreen();
  else await document.documentElement.requestFullscreen?.();
}
