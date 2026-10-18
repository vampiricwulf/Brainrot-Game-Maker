// Which files the 🗜 dialog is open for (Editor.svelte shows it): opened from 🖼 Media, the 📱 preview and the checklist,
// so none of them hands it down. One file, or several at once (🖼 Media's "files big for phones"). Likewise 🔄 Convert's
// window (card-files spec §4.11.2), opened from the note at the top, 🖼 Media, a slide item's panel and the checklist.
import type { Id } from '../model';

export const shrinkDialog = $state<{ open: Id[] | null }>({ open: null });

/** Open 🗜 Make a smaller copy for phones, for file `id` (or for several: one copy each). */
export function openShrinkDialog(id: Id | Id[]): void {
  const ids = Array.isArray(id) ? id : [id];
  shrinkDialog.open = ids.length ? ids : null;
}

/** 🔄 Convert, for these files (a row each). */
export type DialogReq = { mode: 'convert'; ids: Id[] };

export const mediaDialog = $state<{ open: DialogReq | null }>({ open: null });

/** Open the window for `req` (🔄 Convert for some files). */
export function openMediaDialog(req: DialogReq): void {
  mediaDialog.open = req.ids.length ? req : null;
}
