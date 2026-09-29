// Small helpers for running inside the Tauri desktop app vs a normal browser.

/** True inside the desktop (.exe) app. */
export function inTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
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
