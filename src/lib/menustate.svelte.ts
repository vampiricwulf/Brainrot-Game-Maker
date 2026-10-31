// Right-click menus: one open at a time, shown by the app root (ContextMenu.svelte). A thing's menu (a tile, a round, a
// list's row…) is built by menuOf, so every editor menu has the same order and words.
import { isTextField } from './undokeys';

export type MenuEntry =
  /**
   * `hint`: a tooltip; `detail`: what it does, as a muted second line under it (a template's, an export's), instead;
   * `keys`: the item's keyboard shortcut, shown beside it ("Ctrl+D", "Delete").
   */
  | { label: string; onclick: () => void; disabled?: boolean; danger?: boolean; hint?: string; detail?: string; keys?: string }
  | { sep: true }
  | { heading: string };

/** One item of a menu. */
export type MenuItem = Extract<MenuEntry, { label: string }>;

/** A row's or a column's own group in a thing's menu: headed by it ("Row 2 · $400"), its red delete at its end. */
export interface MenuLine {
  heading: string;
  move?: MenuItem[];
  insert?: MenuItem[];
  delete?: MenuItem;
}

/**
 * A thing's menu, in its parts (see menuOf). An item that can't be used now is there greyed (`disabled`), so the menu
 * keeps its places; a part with nothing in it for this thing is left out.
 */
export interface MenuParts {
  /** The thing's name. */
  heading?: string;
  /** During play: what this moment asks of it (an object's card buttons), before everything else. */
  now?: MenuItem[];
  /** ✎ Edit… / ▶ Open (Enter): what a click on it does. */
  open?: MenuItem[];
  /** What it can do or be set to now… */
  verbs?: MenuItem[];
  /** …then its kinds, under their heading ("Make it a…"). */
  kinds?: { heading: string; items: MenuItem[] };
  rename?: MenuItem;
  duplicate?: MenuItem;
  cut?: MenuItem;
  copy?: MenuItem;
  paste?: MenuItem;
  /** ▲ ▼ in a list, ◀ ▶ for tabs and columns, then moves elsewhere ("→ Move to Map 2"). */
  move?: MenuItem[];
  /** ＋ Insert… beside it. */
  insert?: MenuItem[];
  /** The thing's own extras. */
  extras?: MenuItem[];
  /** Its row's and column's own groups. */
  lines?: MenuLine[];
  clear?: MenuItem;
  delete?: MenuItem;
}

/**
 * The one order of a thing's menu (the editors', and a thing's in play): its name, then
 * 1. ✎ Edit / ▶ Open (Enter), the same as a click on it (during play, what this moment asks first);
 * 2. what it can do now, and its kinds ("Make it a…");
 * 3. ✎ Rename F2 · ⧉ Duplicate Ctrl+D · ✂ Cut · 📋 Copy · 📋 Paste;
 * 4. ▲ ▼ / ◀ ▶ (Alt+arrows), then ＋ Insert…;
 * 5. its own extras;
 * then each row's or column's own group, headed, with its red delete at its end;
 * 6. ⌫ Clear · 🗑 Delete, red, always last.
 * A line between the parts; a part with nothing in it is left out.
 */
export function menuOf(m: MenuParts): MenuEntry[] {
  const red = (i: MenuItem): MenuItem => ({ ...i, danger: true });
  const some = <T>(...xs: (T | undefined)[]): T[] => xs.filter((x): x is T => x !== undefined);
  const groups: MenuEntry[][] = [
    m.now ?? [],
    m.open ?? [],
    [...(m.verbs ?? []), ...(m.kinds?.items.length ? [{ heading: m.kinds.heading }, ...m.kinds.items] : [])],
    some(m.rename, m.duplicate, m.cut, m.copy, m.paste),
    [...(m.move ?? []), ...(m.insert ?? [])],
    m.extras ?? [],
    ...(m.lines ?? []).map((l): MenuEntry[] => [{ heading: l.heading }, ...(l.move ?? []), ...(l.insert ?? []), ...some(l.delete).map(red)]),
    some(m.clear, m.delete).map(red),
  ];
  const out: MenuEntry[] = m.heading ? [{ heading: m.heading }] : [];
  for (const g of groups) {
    if (!g.some((i) => 'label' in i)) continue;
    if (out.length > (m.heading ? 1 : 0)) out.push({ sep: true });
    out.push(...g);
  }
  return out;
}

/** What a standard item says over its own words and key (`keys: false`: its key doesn't work where this menu is). */
export type ItemOpts = Partial<Omit<MenuItem, 'onclick' | 'keys'>> & { keys?: string | false };

function std(label: string, keys: string, onclick: () => void, o: ItemOpts = {}): MenuItem {
  const { keys: k, ...rest } = o;
  const key = k === false ? undefined : (k ?? keys);
  return { label, onclick, ...rest, ...(key ? { keys: key } : {}) };
}

/** The standard items, with one name and one key each wherever they're offered ("📋 Copy clue": `label`). */
export const menuItem = {
  edit: (onclick: () => void, o?: ItemOpts) => std('✎ Edit', 'Enter', onclick, o),
  rename: (onclick: () => void, o?: ItemOpts) => std('✎ Rename', 'F2', onclick, o),
  duplicate: (onclick: () => void, o?: ItemOpts) => std('⧉ Duplicate', 'Ctrl+D', onclick, o),
  cut: (onclick: () => void, o?: ItemOpts) => std('✂ Cut', 'Ctrl+X', onclick, o),
  copy: (onclick: () => void, o?: ItemOpts) => std('📋 Copy', 'Ctrl+C', onclick, o),
  paste: (onclick: () => void, o?: ItemOpts) => std('📋 Paste', 'Ctrl+V', onclick, o),
  up: (onclick: () => void, o?: ItemOpts) => std('▲ Move up', 'Alt+↑', onclick, o),
  down: (onclick: () => void, o?: ItemOpts) => std('▼ Move down', 'Alt+↓', onclick, o),
  left: (onclick: () => void, o?: ItemOpts) => std('◀ Move left', 'Alt+←', onclick, o),
  right: (onclick: () => void, o?: ItemOpts) => std('▶ Move right', 'Alt+→', onclick, o),
  clear: (onclick: () => void, o?: ItemOpts) => std('⌫ Clear', 'Delete', onclick, o),
  /** "🗑 Delete slice" (with "…" in `label` when it asks first). */
  delete: (thing: string, onclick: () => void, o?: ItemOpts) => std(`🗑 Delete ${thing}`, 'Delete', onclick, o),
};

/** A menu's keys as this computer writes them: on a Mac, Ctrl+ is ⌘, Alt+ is ⌥ and Shift+ is ⇧. */
export const menuKeys = (k: string, mac: boolean): string => (mac ? k.replaceAll('Ctrl+', '⌘').replaceAll('Alt+', '⌥').replaceAll('Shift+', '⇧') : k);

/** What had the keys when the last press began (the press may have moved them into a name box). */
let focusAtPress: Element | null = null;
if (typeof addEventListener !== 'undefined') addEventListener('pointerdown', () => (focusAtPress = document.activeElement), true);

/**
 * A right-click in a name box (a category's, a row's value) keeps the browser's own menu, for cut, copy and paste, while
 * the box is being typed in (it had the keys before the click) or has words selected; otherwise it opens the thing's
 * menu. `picked`: a selection the box made itself when it got the keys (a made-up name, selected to type over), which
 * doesn't count. Shift+F10 in it always opens the thing's menu.
 */
export function typingIn(e: MouseEvent, picked = false, before: Element | null = focusAtPress): boolean {
  const t = e.target;
  if (!isTextField(t)) return false;
  if (t === before) return true;
  let from: number | null = null;
  let to: number | null = null;
  try {
    ({ selectionStart: from, selectionEnd: to } = t);
  } catch {
    // (A number box has no selection to read.)
  }
  return !picked && from !== null && from !== to;
}

/**
 * `from`: the button a dropped menu came from (see dropMenu). `back`: where the focus goes when it closes (what had it,
 * or the tile, card… right-clicked), so the keys go on working there.
 */
export const contextMenu = $state<{ open: { x: number; y: number; items: MenuEntry[]; from?: HTMLElement; back?: HTMLElement } | null }>({ open: null });

const FOCUSABLE = 'button, [tabindex]:not([tabindex="-1"]), a[href], input, textarea, select';

/** Show a menu at the pointer (instead of the browser's own). Empty menus show nothing. */
export function showMenu(e: MouseEvent, items: MenuEntry[], from?: HTMLElement): void {
  const shown = items.filter((i, n) => !('sep' in i) || (n > 0 && n < items.length - 1));
  if (!shown.some((i) => 'label' in i)) return;
  e.preventDefault();
  e.stopPropagation();
  // (Where there's a page: not in a unit test.)
  const page = typeof document !== 'undefined';
  const active = page ? document.activeElement : null;
  const focused = page && active instanceof HTMLElement && active !== document.body ? active : null;
  const clicked = page && e.target instanceof Element ? e.target.closest<HTMLElement>(FOCUSABLE) : null;
  contextMenu.open = { x: e.clientX, y: e.clientY, items: shown, from, back: from ?? clicked ?? focused ?? undefined };
}

/**
 * A menu dropped from a button (＋ Add round, ＋ Add button, 📦 Item ▾), from its click: under the button and kept on
 * screen like a right-click menu, for long lists a `dropdown` in a narrow or scrolling panel would cut off. Otherwise it
 * works like a `dropdown`: a second click on the button closes it, as do Esc (the focus goes back to the button) and a
 * click elsewhere.
 */
export function dropMenu(e: MouseEvent, items: MenuEntry[]): void {
  const from = e.currentTarget as HTMLElement;
  if (contextMenu.open?.from === from) return closeMenu();
  const r = from.getBoundingClientRect();
  showMenu(new MouseEvent('click', { clientX: r.left, clientY: r.bottom + 2 }), items, from);
}

/** Is this the keyboard's way to open a right-click menu (Shift+F10, or the menu key)? */
export const isMenuKey = (e: KeyboardEvent): boolean =>
  e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey);

/**
 * Shift+F10 or the menu key on a focused item (a theme card…): its right-click menu, under it, and Esc gives it the
 * focus back. True when it was that key (handled). `from`: what it drops from (the element the key was pressed on).
 */
export function keyMenu(e: KeyboardEvent, items: MenuEntry[], from = e.currentTarget as HTMLElement): boolean {
  if (!isMenuKey(e)) return false;
  const r = from.getBoundingClientRect();
  showMenu(new MouseEvent('contextmenu', { clientX: r.left + 8, clientY: r.bottom + 2 }), items, from);
  e.preventDefault();
  return true;
}

export function closeMenu(): void {
  contextMenu.open = null;
}

/**
 * `use:dropdown={close}` on a menu that drops from a button (Shape ▾) or the slide's right-click menu, so it keys like
 * a menu: its first item takes focus, ↑/↓ move between items (Home/End: the first and last), and Esc or Tab closes it
 * (focus goes back to the button, or wherever it was when the menu opened). A click outside is the menu's own
 * backdrop, which covers the button too, so a second click on the button closes the menu.
 */
export function dropdown(box: HTMLElement, close: () => void): { destroy: () => void } {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const items = () => [...box.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
  // On the window, as the right-click menu does: Esc closes just the menu wherever the focus is (and never
  // also the dialog it's in).
  function key(e: KeyboardEvent): void {
    if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      e.stopImmediatePropagation();
      close();
      opener?.focus();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const list = items();
      const at = list.indexOf(document.activeElement as HTMLButtonElement);
      list[(at + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]?.focus();
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      const list = items();
      list[e.key === 'Home' ? 0 : list.length - 1]?.focus();
    }
  }
  items()[0]?.focus();
  addEventListener('keydown', key, true);
  return { destroy: () => removeEventListener('keydown', key, true) };
}
