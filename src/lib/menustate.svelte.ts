// Right-click menus: one open at a time, shown by the app root (ContextMenu.svelte).

export type MenuEntry =
  | { label: string; onclick: () => void; disabled?: boolean; danger?: boolean; hint?: string }
  | { sep: true }
  | { heading: string };

export const contextMenu = $state<{ open: { x: number; y: number; items: MenuEntry[] } | null }>({ open: null });

/** Show a menu at the pointer (instead of the browser's own). Empty menus show nothing. */
export function showMenu(e: MouseEvent, items: MenuEntry[]): void {
  const shown = items.filter((i, n) => !('sep' in i) || (n > 0 && n < items.length - 1));
  if (!shown.some((i) => 'label' in i)) return;
  e.preventDefault();
  e.stopPropagation();
  contextMenu.open = { x: e.clientX, y: e.clientY, items: shown };
}

export function closeMenu(): void {
  contextMenu.open = null;
}
