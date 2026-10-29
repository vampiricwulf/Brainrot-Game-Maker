// The app's color picker: one open at a time, for the color box that opened it (ColorBox.svelte), shown by the app
// root (ColorPicker.svelte). It works as the browser's own picker does: the box takes each change at once (an input
// event), and once it closes with another color than it had, a change event, so each box's own handlers (and undo
// steps) run as they always have. All it changes while it's open is one undo step; Esc puts back what it was.
import { begin } from './history.svelte';

export interface PickerSession {
  box: HTMLInputElement;
  /** The box's color when it opened, and its name (the picker's heading). */
  start: string;
  name: string;
  /** Goes up with each one opened. */
  id: number;
}

export const colorPicker = $state<{ open: PickerSession | null }>({ open: null });

let opened = 0;
/** Ends the undo step the open picker makes. */
let endStep: ((how?: 'put back') => void) | null = null;

/** What a color box is called: its aria-label, else the words of its <label> (not its buttons or hints). */
export function boxName(box: HTMLInputElement): string {
  const own = box.getAttribute('aria-label')?.trim();
  if (own) return own;
  const by = box
    .getAttribute('aria-labelledby')
    ?.split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ');
  const words = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
    if (!(node instanceof Element) || node.matches('button, input, select, textarea, .hint, [aria-hidden="true"]')) return '';
    return [...node.childNodes].map(words).join(' ');
  };
  const label = by || [...(box.labels ?? [])].map(words).join(' ');
  return label.replace(/\s+/g, ' ').replace(/:$/, '').trim() || box.title || 'Color';
}

/** Open the picker for this box (closing one open for another). */
export function openColorPicker(box: HTMLInputElement): void {
  if (colorPicker.open) closeColorPicker();
  endStep = begin();
  colorPicker.open = { box, start: box.value, name: boxName(box), id: ++opened };
}

/** The open picker's color goes in its box, as if picked there (an input event, when it's another color). */
export function pickColor(hex: string): void {
  const box = colorPicker.open?.box;
  if (!box || box.disabled || box.value === hex) return;
  box.value = hex;
  box.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Close the picker. 'keep' (✓ Done, Enter, a click elsewhere): a change event when the color is another than it had.
 * 'back' (Esc): the color it had goes back in the box, and nothing it changed stays. 'gone': its box was taken away.
 * The keys go back to the box (unless `focus` is false).
 */
export function closeColorPicker(how: 'keep' | 'back' | 'gone' = 'keep', focus = true): void {
  const s = colorPicker.open;
  if (!s) return;
  const { box, start } = s;
  // The keys leave it first (for its box), so a box in it that was typed in has its say now, not as it's taken away.
  const active = document.activeElement;
  if (active instanceof HTMLElement && active.closest('[data-color-picker]')) {
    if (focus && how !== 'gone' && box.isConnected) box.focus({ preventScroll: true });
    else active.blur();
  }
  if (colorPicker.open !== s) return;
  colorPicker.open = null;
  const end = endStep;
  endStep = null;
  try {
    if (how === 'back' && box.value !== start) {
      box.value = start;
      box.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (how === 'keep' && box.value !== start && box.isConnected) box.dispatchEvent(new Event('change', { bubbles: true }));
  } finally {
    // Back where it started (Esc, or the same color kept): no step, not even for a color the box showed but the game
    // didn't hold.
    end?.(how === 'back' || (how === 'keep' && box.value === start) ? 'put back' : undefined);
  }
  if (focus && how !== 'gone' && box.isConnected) box.focus({ preventScroll: true });
}
