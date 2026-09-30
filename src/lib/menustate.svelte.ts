// Right-click menus: one open at a time, shown by the app root (ContextMenu.svelte).

export type MenuEntry =
  | { label: string; onclick: () => void; disabled?: boolean; danger?: boolean; hint?: string }
  | { sep: true }
  | { heading: string };

/** `from`: the button a dropped menu came from (see dropMenu). */
export const contextMenu = $state<{ open: { x: number; y: number; items: MenuEntry[]; from?: HTMLElement } | null }>({ open: null });

/** Show a menu at the pointer (instead of the browser's own). Empty menus show nothing. */
export function showMenu(e: MouseEvent, items: MenuEntry[], from?: HTMLElement): void {
  const shown = items.filter((i, n) => !('sep' in i) || (n > 0 && n < items.length - 1));
  if (!shown.some((i) => 'label' in i)) return;
  e.preventDefault();
  e.stopPropagation();
  contextMenu.open = { x: e.clientX, y: e.clientY, items: shown, from };
}

/**
 * A menu dropped from a button (＋ Add action, 📦 Item ▾), from its click: under the button and kept on screen like a
 * right-click menu, for long lists a `dropdown` in a narrow or scrolling panel would cut off. Otherwise it works like
 * a `dropdown`: a second click on the button closes it, as do Esc (the focus goes back to the button) and a click
 * elsewhere.
 */
export function dropMenu(e: MouseEvent, items: MenuEntry[]): void {
  const from = e.currentTarget as HTMLElement;
  if (contextMenu.open?.from === from) return closeMenu();
  const r = from.getBoundingClientRect();
  showMenu(new MouseEvent('click', { clientX: r.left, clientY: r.bottom + 2 }), items, from);
}

export function closeMenu(): void {
  contextMenu.open = null;
}

/**
 * `use:dropdown={close}` on a menu that drops from a button (＋ Add round, Shape ▾), so it keys like a
 * right-click menu: its first item takes focus, ↑/↓ move between items, and Esc closes it (focus goes
 * back to the button). A click outside is the menu's own backdrop, which covers the button too, so a
 * second click on the button closes the menu.
 */
export function dropdown(box: HTMLElement, close: () => void): { destroy: () => void } {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const items = () => [...box.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
  // On the window, as the right-click menu does: Esc closes just the menu wherever the focus is (and never
  // also the dialog it's in).
  function key(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      close();
      opener?.focus();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const list = items();
      const at = list.indexOf(document.activeElement as HTMLButtonElement);
      list[(at + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]?.focus();
    }
  }
  items()[0]?.focus();
  addEventListener('keydown', key, true);
  return { destroy: () => removeEventListener('keydown', key, true) };
}
