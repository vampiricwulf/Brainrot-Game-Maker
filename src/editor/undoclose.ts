// Ctrl+Z in a media job's window (✎ Edit, 🗜, 🔄) once what it made is in: the window says Ctrl+Z takes it back, but
// the editor's own Ctrl+Z can't reach under a window that keeps the key (data-undo="off"). So the window closes, and
// the last step is taken back, as Close then Ctrl+Z would.
import { undo } from '../lib/history.svelte';
import { isTextField, undoKeyOf } from '../lib/undokeys';

/** Ctrl+Z (not in a box that's typed in): closes the window and undoes. True when it did. */
export function undoClosing(e: KeyboardEvent, close: () => void): boolean {
  if (undoKeyOf(e) !== 'undo' || isTextField(e.target)) return false;
  e.preventDefault();
  e.stopImmediatePropagation();
  close();
  undo('key');
  return true;
}
