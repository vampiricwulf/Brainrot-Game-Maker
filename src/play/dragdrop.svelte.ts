// Host drags that end on something else in the window: an avatar onto a screen (on a map, or a split-view pane) or a
// party, a token onto a space or a zone, an inventory item onto a player. What's under the pointer lights up while
// dragging. Only the host's window has any of this: the audience window never takes pointer input.

/** What a drag is over now, as '<kind>:<id>' ('screen:…', 'party:…', 'player:…', 'space:…', 'zone:…'), or null. */
export const dropHover = $state<{ at: string | null }>({ at: null });

/**
 * An avatar dragged off the stage (onto the minimap or a party's chip): the stage clips it, so a small copy follows the
 * pointer over the host panel (window coordinates).
 */
export const dragGhost = $state<{ now: { x: number; y: number; player: { name: string; color: string; avatar?: string } } | null }>({ now: null });

/**
 * An inventory item being dragged from a player's card (browser drag and drop, which can't read what's dragged until
 * the drop): whose it is, which entry, and how many go (the card's amount box).
 */
export const itemDrag = $state<{ now: { from: string; entryId: string; n: number } | null }>({ now: null });

/** A drag is over (dropped, or let go anywhere): nothing is lit up any more. */
export function dragDone(): void {
  itemDrag.now = null;
  dropHover.at = null;
}

/**
 * The topmost element under a point that is (or is inside) one matching `selector`, skipping the element being
 * dragged: it follows the pointer, so it's under it too.
 */
export function dropTarget(x: number, y: number, selector: string, dragged?: Element | null): HTMLElement | null {
  for (const el of document.elementsFromPoint(x, y)) {
    if (dragged?.contains(el)) continue;
    const t = el.closest<HTMLElement>(selector);
    if (t) return t;
  }
  return null;
}
