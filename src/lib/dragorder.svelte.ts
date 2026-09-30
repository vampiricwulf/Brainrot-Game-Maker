// Drag to reorder a list (rows or chips), the way the layers panel restacks: a line shows where the dragged one will
// go, before or after the one under the pointer. The list's own ▲▼ (or ◀▶) buttons and Alt+arrows stay.

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
