// 💧 Pick from the screen, in the app's color picker (ColorPicker.svelte). The desktop app has its own (see
// src-tauri/src/screencolor.rs), as WebView2's eyedropper does nothing there on some PCs; a browser with an eyedropper
// (Chrome, Edge) uses that one, and the others (Firefox, Safari) have no 💧.
import { inTauri } from './platform';
import { toast } from './app.svelte';
import { toHex } from './colors';

interface EyeDropperLike {
  open(): Promise<{ sRGBHex: string }>;
}
const browserDropper = (): (new () => EyeDropperLike) | undefined =>
  typeof window === 'undefined' ? undefined : (window as unknown as { EyeDropper?: new () => EyeDropperLike }).EyeDropper;

/** The color picker has a 💧: in the desktop app, and in a browser with an eyedropper. */
export function canPickFromScreen(): boolean {
  return inTauri() || !!browserDropper();
}

let picking = false;

/**
 * Pick a color from the screen: "#rrggbb", or null when the host cancelled. If the picker can't open, a toast says
 * why (and it's null too).
 */
export async function pickScreenColor(): Promise<string | null> {
  // (A second click while it opens.)
  if (picking) return null;
  picking = true;
  try {
    if (!inTauri()) {
      const Dropper = browserDropper();
      // (Esc there turns it down: nothing picked.)
      const picked = Dropper ? await new Dropper().open().catch(() => null) : null;
      return toHex(picked?.sRGBHex);
    }
    const { invoke } = await import('@tauri-apps/api/core');
    const color = await invoke<string | null>('pick_screen_color');
    return typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : null;
  } catch (err) {
    toast(typeof err === 'string' ? err : "Couldn't pick a color from the screen.");
    return null;
  } finally {
    picking = false;
  }
}
