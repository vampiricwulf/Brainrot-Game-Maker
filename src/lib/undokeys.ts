// Which keys undo and redo, and when they stay with a text field: while the field has typing of its own, Ctrl+Z is
// the field's (word by word, as in any text box); once it's back to how it was, Ctrl+Z goes on through the game's
// history (history.svelte.ts). The field's undo changes the same value its typing did, so it joins, or cancels, the
// step that typing made instead of starting a new one. Unit-tested in undokeys.test.ts.

export type UndoKey = 'undo' | 'redo' | null;

/** Ctrl/⌘+Z → undo; Ctrl/⌘+Shift+Z and Ctrl/⌘+Y → redo. */
export function undoKeyOf(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>): UndoKey {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
  const k = e.key.toLowerCase();
  if (k === 'z') return e.shiftKey ? 'redo' : 'undo';
  return k === 'y' ? 'redo' : null;
}

const TEXT_TYPES = new Set(['text', 'search', 'url', 'email', 'number', 'tel']);

/** A box that's typed in (a text input or a textarea), with an undo of its own. */
export function isTextField(el: unknown): el is HTMLInputElement | HTMLTextAreaElement {
  const x = el as { tagName?: string; type?: string } | null | undefined;
  return x?.tagName === 'TEXTAREA' || (x?.tagName === 'INPUT' && TEXT_TYPES.has(x.type ?? 'text'));
}

/** What copyIsTheBrowsers needs of a selection (window.getSelection()). */
export interface SelectionLike {
  isCollapsed: boolean;
  anchorNode: unknown;
  focusNode: unknown;
  toString(): string;
}

/**
 * Ctrl+C on something the editor copies itself (a tile, a screen, board spaces): whether the browser should copy
 * instead. It should when the focus is in a text field, or when text is selected inside the focused thing. Text
 * selected anywhere else doesn't count: a round's name the editor selected when the round was added stays selected
 * after the focus leaves it, and used to take every Ctrl+C.
 */
export function copyIsTheBrowsers(focused: unknown, sel: SelectionLike | null | undefined): boolean {
  const el = focused as { contains?: (n: unknown) => boolean; isContentEditable?: boolean; tagName?: string } | null | undefined;
  if (isTextField(focused) || el?.isContentEditable) return true;
  if (!sel || sel.isCollapsed || !sel.toString()) return false;
  // Nothing in focus (text selected with the mouse leaves it on the page): the selected text is what's copied.
  if (!el || el.tagName === 'BODY') return true;
  if (!el.contains) return false;
  return (!!sel.anchorNode && el.contains(sel.anchorNode)) || (!!sel.focusNode && el.contains(sel.focusNode));
}

/** Follows the focused text field, to tell when Ctrl+Z / Ctrl+Y should stay native there. */
export function createFieldTracker() {
  let field: HTMLInputElement | HTMLTextAreaElement | null = null;
  /** Its value when focused (or when the history last changed it): typing of its own = a different value. */
  let start = '';
  /** Its own undos that its own redo can take back. */
  let redos = 0;
  return {
    focusin(e: Pick<FocusEvent, 'target'>): void {
      field = isTextField(e.target) ? e.target : null;
      start = field?.value ?? '';
      redos = 0;
    },
    input(e: Pick<Event, 'target'> & { inputType?: string }): void {
      if (e.target !== field) return;
      if (e.inputType === 'historyUndo') redos++;
      else if (e.inputType === 'historyRedo') redos = Math.max(0, redos - 1);
      else redos = 0;
    },
    /** The history undid or redid a step (maybe changing the field): the field's own undo has nothing left. */
    afterGlobal(): void {
      start = field?.value ?? '';
      redos = 0;
    },
    /** Should this key stay with the browser (the field's own undo or redo) rather than go to the history? */
    native(e: Pick<KeyboardEvent, 'target'>, key: 'undo' | 'redo'): boolean {
      if (!field || e.target !== field) return false;
      return key === 'undo' ? field.value !== start : redos > 0;
    },
  };
}
