// Which files the 🗜 dialog is open for (Editor.svelte shows it): opened from 🖼 Media, the 📱 preview and the checklist,
// so none of them hands it down. One file, or several at once (🖼 Media's "files big for phones"). Likewise 🔄 Convert's
// window (card-files spec §4.11.2), opened from the note at the top, 🖼 Media, a slide item's panel and the checklist,
// and ✎ Edit's, opened from 🖼 Media, a slide item's panel and its right-click menu.
import type { AudioEl, Id, VideoEl } from '../model';

export const shrinkDialog = $state<{ open: Id[] | null }>({ open: null });

/** Open 🗜 Make a smaller copy for phones, for file `id` (or for several: one copy each). */
export function openShrinkDialog(id: Id | Id[]): void {
  const ids = Array.isArray(id) ? id : [id];
  shrinkDialog.open = ids.length ? ids : null;
}

/** ✎ Edit a file (`item`: opened from that slide item), or 🔄 Convert some files (a row each). */
export type DialogReq = { mode: 'edit'; id: Id; item?: VideoEl | AudioEl } | { mode: 'convert'; ids: Id[] };

export const mediaDialog = $state<{ open: DialogReq | null }>({ open: null });

/** Open the window for `req` (✎ Edit a file, or 🔄 Convert some). */
export function openMediaDialog(req: DialogReq): void {
  mediaDialog.open = req.mode === 'edit' || req.ids.length ? req : null;
}

/** The files the window is open for. */
export const dialogIds = (req: DialogReq): Id[] => (req.mode === 'edit' ? [req.id] : req.ids);
