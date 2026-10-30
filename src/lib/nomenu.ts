// The browser's own right-click menu never shows where the app has none of its own: in one window it would be on
// stream, and in the desktop app it offers Back and Reload (one slip reloads the page mid-show). Fields, links and
// copyable words selected keep it, for cut, copy, paste and open link.

/** A box to type in (a checkbox or a color box isn't one). */
const FIELD =
  'input:not([type="checkbox"], [type="radio"], [type="range"], [type="color"], [type="file"], [type="button"], [type="submit"], [type="reset"]), textarea, [contenteditable]:not([contenteditable="false"])';

/** Whether a right-click on `target` gets the browser's menu: on a field, a link, or copyable words selected there. */
export function browserMenuFits(target: EventTarget | null, sel: Selection | null): boolean {
  const el = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
  if (!el) return false;
  if (el.closest(FIELD) || el.closest('a[href]')) return true;
  const copyable = el.closest('.selectable');
  return !!copyable && !!sel && !sel.isCollapsed && !!String(sel).trim() && !!sel.anchorNode && copyable.contains(sel.anchorNode);
}

/**
 * Every window (the editor and the host screen, the audience and scores windows, a card window): a right-click the app
 * has no menu for shows nothing. (On the window, after the app's own menus: one of those has taken it by then.)
 */
export function noBrowserMenu(win: Window = window): void {
  win.addEventListener('contextmenu', (e) => {
    if (!e.defaultPrevented && !browserMenuFits(e.target, win.getSelection())) e.preventDefault();
  });
}
