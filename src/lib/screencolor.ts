// The 💧 beside a color box (ColorBox.svelte) in the desktop app: pick a color from anywhere on the screen (see
// src-tauri/src/screencolor.rs). The color popup's own eyedropper does nothing in the app on some PCs. In a browser
// (Chrome, Edge) it works, so there's no 💧 there.
import { inTauri } from './platform';
import { toast } from './app.svelte';

/** Color boxes get a 💧: only in the desktop app. */
export function canPickFromScreen(): boolean {
  return inTauri();
}

/** The 💧's name: which color it picks, when the box has a name ("Tile glow color", "Color for Ann"). */
export function pickLabel(boxLabel?: string | null): string {
  const what = boxLabel?.trim().replace(/^Color\b/, 'color');
  return what ? `Pick the ${what} from the screen` : 'Pick a color from the screen';
}

/**
 * The words of the <label> around a color box, as its name, leaving out `skip` (the box with its 💧): the text, and
 * what has a name of its own (a ↺ button) by that name, as browsers read a label.
 */
export function labelWords(label: Node, skip: Node): string {
  const words = (node: Node): string => {
    if (node === skip) return '';
    // (Node.TEXT_NODE, Node.ELEMENT_NODE.)
    if (node.nodeType === 3) return node.textContent ?? '';
    if (node.nodeType !== 1) return '';
    const el = node as Element;
    if (el.getAttribute('aria-hidden') === 'true') return '';
    return el.getAttribute('aria-label') ?? [...el.childNodes].map(words).join(' ');
  };
  return words(label).replace(/\s+/g, ' ').trim();
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
