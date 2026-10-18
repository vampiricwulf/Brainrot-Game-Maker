// Which file the 🗜 dialog is open for (Editor.svelte shows it): opened from 🖼 Media, the 📱 preview and the checklist,
// so none of them hands it down.
import type { Id } from '../model';

export const shrinkDialog = $state<{ open: Id | null }>({ open: null });

/** Open 🗜 Make a smaller copy for phones, for file `id`. */
export function openShrinkDialog(id: Id): void {
  shrinkDialog.open = id;
}
