// Drag to reorder a list (rows or chips), the way the layers panel restacks: a line shows where the dragged one will
// go, before or after the one under the pointer. The list's own ▲▼ (or ◀▶) buttons and Alt+arrows stay.
import { tick } from 'svelte';
import { isMenuKey, keyMenu, type MenuEntry } from './menustate.svelte';

/** Where a dragged item goes when dropped before or after another: its index now and its new index (null: no move). */
export function dropMove(ids: string[], dragged: string, target: string, after: boolean): { from: number; to: number } | null {
  const from = ids.indexOf(dragged);
  let to = ids.indexOf(target);
  if (from < 0 || to < 0 || dragged === target) return null;
  if (after) to++;
  // Taking it out first shifts the ones after it up by one.
  if (from < to) to--;
  return from === to ? null : { from, to };
}

/** One list's drag: which item is dragged, and where the drop line is. `across`: a row of chips (left / right). */
export class DragOrder {
  dragging = $state<string | null>(null);
  line = $state<{ id: string; after: boolean } | null>(null);
  across: boolean;

  constructor(across = false) {
    this.across = across;
  }

  /** `row`: the whole row to show under the pointer, when only its grip is dragged (rows with text boxes in them). */
  start(e: DragEvent, id: string, row?: Element | null): void {
    this.dragging = id;
    e.dataTransfer?.setData('text/x-order', id);
    if (!e.dataTransfer) return;
    e.dataTransfer.effectAllowed = 'move';
    if (row) e.dataTransfer.setDragImage(row, 12, 12);
  }

  over(e: DragEvent, id: string): void {
    if (!this.dragging) return;
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    this.line = { id, after: this.across ? e.clientX > r.left + r.width / 2 : e.clientY > r.top + r.height / 2 };
  }

  /** Dropped: where the dragged item goes in `ids` (null: nowhere new). */
  drop(e: DragEvent, ids: string[]): { from: number; to: number } | null {
    e.preventDefault();
    const move = this.dragging && this.line ? dropMove(ids, this.dragging, this.line.id, this.line.after) : null;
    this.end();
    return move;
  }

  end(): void {
    this.dragging = null;
    this.line = null;
  }

  /** The drop line's side on this item, for its class. */
  lineAt(id: string): 'before' | 'after' | null {
    return this.line?.id === id && this.dragging !== id ? (this.line.after ? 'after' : 'before') : null;
  }
}

/** What a row's keys do (see rowKeys). */
export interface RowKeys {
  /** Alt+↑/↓: one place up (−1) or down (Alt+←/→ in a row of chips, `across`). */
  move?: (d: -1 | 1) => void;
  across?: boolean;
  /** Ctrl+D (⌘+D). */
  duplicate?: () => void;
  /** Shift+F10 or the menu key: the row's menu (its ⋯'s), in a name box too. */
  menu?: () => MenuEntry[];
}

/**
 * `use:rowKeys={{ move, duplicate, menu }}` on a list's row: Alt+↑/↓ from any field in it moves the row (the field
 * keeps the focus, so they repeat), Ctrl+D duplicates it, Shift+F10 opens its menu under what has the keys. A row
 * inside another row (a button in an item's Use list, what a shop sells) keeps the keys for itself, even those it has
 * no use for: Ctrl+D in a row a shop sells duplicates nothing, never the shop.
 */
export function rowKeys(node: HTMLElement, keys: RowKeys): { update: (k: RowKeys) => void; destroy: () => void } {
  let k = keys;
  node.dataset.rowkeys = '';
  function key(e: KeyboardEvent): void {
    if (e.defaultPrevented) return;
    // (From a row inside this one: that row's.)
    if (e.target instanceof Element && e.target.closest('[data-rowkeys]') !== node) return;
    const inner = !!node.parentElement?.closest('[data-rowkeys]');
    const mod = e.ctrlKey || e.metaKey;
    const [back, on] = k.across ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
    // (Not ←/→ in a text box on a Mac, where Option+arrows move the caret by word.)
    const words = k.across && /Mac|iPhone|iPad/.test(navigator.platform) && e.target instanceof HTMLInputElement;
    if (k.move && e.altKey && !mod && !e.shiftKey && !words && (e.key === back || e.key === on)) {
      e.preventDefault();
      e.stopPropagation();
      // (Moving a row takes it out of the page and back, which drops the focus.)
      const had = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      k.move(e.key === back ? -1 : 1);
      void tick().then(() => {
        // A ▼ (or ▲) that is off now the row is at the end can't keep it: the other one next to it takes it.
        const to = had?.matches(':disabled')
          ? [had.previousElementSibling, had.nextElementSibling].find((b): b is HTMLElement => b instanceof HTMLElement && b.matches('button:not(:disabled)'))
          : had;
        if (to?.isConnected && to !== document.activeElement) to.focus();
      });
    } else if ((k.duplicate || inner) && mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'd') {
      // (An inner row with no duplicate of its own: nothing, not the browser's Bookmark this page either.)
      e.preventDefault();
      e.stopPropagation();
      k.duplicate?.();
    } else if (k.menu && isMenuKey(e)) {
      e.stopPropagation();
      keyMenu(e, k.menu(), e.target instanceof HTMLElement ? e.target : node);
    }
  }
  node.addEventListener('keydown', key);
  return {
    update: (next) => (k = next),
    destroy: () => node.removeEventListener('keydown', key),
  };
}
