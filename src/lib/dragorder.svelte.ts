// Drag to reorder a list (rows or chips), the way the layers panel restacks: a line shows where the dragged one will
// go, before or after the one under the pointer. The list's own ▲▼ (or ◀▶) buttons and Alt+arrows stay.
import { tick } from 'svelte';

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
  /** Alt+↑/↓: one place up (−1) or down. */
  move?: (d: -1 | 1) => void;
  /** Ctrl+D (⌘+D). */
  duplicate?: () => void;
}

/**
 * `use:rowKeys={{ move, duplicate }}` on a list's row: Alt+↑/↓ from any field in it moves the row (the field keeps
 * the focus, so they repeat), Ctrl+D duplicates it. A row inside another row (a button in an item's Use list) keeps
 * the keys for itself.
 */
export function rowKeys(node: HTMLElement, keys: RowKeys): { update: (k: RowKeys) => void; destroy: () => void } {
  let k = keys;
  function key(e: KeyboardEvent): void {
    if (e.defaultPrevented) return;
    const mod = e.ctrlKey || e.metaKey;
    if (k.move && e.altKey && !mod && !e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      e.stopPropagation();
      // (Moving a row takes it out of the page and back, which drops the focus.)
      const had = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      k.move(e.key === 'ArrowUp' ? -1 : 1);
      void tick().then(() => {
        // A ▼ (or ▲) that is off now the row is at the end can't keep it: the other one next to it takes it.
        const to = had?.matches(':disabled')
          ? [had.previousElementSibling, had.nextElementSibling].find((b): b is HTMLElement => b instanceof HTMLElement && b.matches('button:not(:disabled)'))
          : had;
        if (to?.isConnected && to !== document.activeElement) to.focus();
      });
    } else if (k.duplicate && mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      e.stopPropagation();
      k.duplicate();
    }
  }
  node.addEventListener('keydown', key);
  return {
    update: (next) => (k = next),
    destroy: () => node.removeEventListener('keydown', key),
  };
}
