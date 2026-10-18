// Which files the 🗜 dialog is open for (Editor.svelte shows it): opened from 🖼 Media, the 📱 preview and the checklist,
// so none of them hands it down. One file, or several at once (🖼 Media's "files big for phones").
import type { Id } from '../model';

export const shrinkDialog = $state<{ open: Id[] | null }>({ open: null });

/** Open 🗜 Make a smaller copy for phones, for file `id` (or for several: one copy each). */
export function openShrinkDialog(id: Id | Id[]): void {
  const ids = Array.isArray(id) ? id : [id];
  shrinkDialog.open = ids.length ? ids : null;
}
