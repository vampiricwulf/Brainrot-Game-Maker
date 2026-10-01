// What every modal window does, as an action on its role="dialog" box (use:modal): it takes the focus when it opens
// (its [data-autofocus] field, or the box itself), keeps Tab and Shift+Tab inside, makes the rest of the page inert,
// and gives the focus back to what opened it when it closes. Optional: Esc closes it (`esc`) when nothing inside
// used the key first. Windows open on top of one another (a picker in a clue editor): only the top one acts.

export interface ModalOptions {
  /** Esc closes the window (leave it out when the window handles Esc itself). */
  esc?: () => void;
}

const stack: HTMLElement[] = [];

const TABBABLE =
  'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

/** What Tab can reach inside a box, in order (skips hidden and inert parts). */
export function tabbables(box: HTMLElement): HTMLElement[] {
  return [...box.querySelectorAll<HTMLElement>(TABBABLE)].filter(
    (el) => !el.closest('[inert]') && (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0),
  );
}

/** Marks everything outside `box` inert (walking up to <body>), returning what it changed. Overlays that stay usable
 * over a window (the Undo note, toasts, menus) carry [data-over-modal]. */
function inertOutside(box: HTMLElement): HTMLElement[] {
  const changed: HTMLElement[] = [];
  for (let el: HTMLElement | null = box; el && el !== document.body; el = el.parentElement) {
    for (const sib of el.parentElement?.children ?? []) {
      if (sib === el || !(sib instanceof HTMLElement) || sib.inert || sib.hasAttribute('data-over-modal')) continue;
      if (sib.tagName === 'SCRIPT' || sib.tagName === 'STYLE') continue;
      sib.inert = true;
      changed.push(sib);
    }
  }
  return changed;
}

export function modal(node: HTMLElement, opts: ModalOptions = {}) {
  let options = opts;
  const opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
  node.setAttribute('aria-modal', 'true');
  if (!node.hasAttribute('tabindex')) node.tabIndex = -1;
  stack.push(node);
  const changed = inertOutside(node);

  // Focus in, unless the window's own code (or a field it opened with) already took it.
  queueMicrotask(() => {
    if (!node.isConnected || node.contains(document.activeElement)) return;
    (node.querySelector<HTMLElement>('[data-autofocus]') ?? node).focus({ preventScroll: true });
  });

  function onkey(e: KeyboardEvent): void {
    if (stack.at(-1) !== node || e.defaultPrevented) return;
    if (e.key === 'Escape' && options.esc) {
      e.preventDefault();
      options.esc();
      return;
    }
    if (e.key !== 'Tab') return;
    const list = tabbables(node);
    if (!list.length) return void e.preventDefault();
    const at = list.indexOf(document.activeElement as HTMLElement);
    const outside = !node.contains(document.activeElement);
    if (e.shiftKey && (at <= 0 || outside)) {
      e.preventDefault();
      list.at(-1)!.focus();
    } else if (!e.shiftKey && (at === list.length - 1 || outside)) {
      e.preventDefault();
      list[0].focus();
    }
  }
  // On the window, so a press with the focus lost to <body> (a button that just disappeared) still stays inside.
  window.addEventListener('keydown', onkey);

  return {
    update(o: ModalOptions = {}) {
      options = o;
    },
    destroy() {
      window.removeEventListener('keydown', onkey);
      const i = stack.lastIndexOf(node);
      if (i >= 0) stack.splice(i, 1);
      for (const el of changed) el.inert = false;
      const lost = !document.activeElement || document.activeElement === document.body || node.contains(document.activeElement);
      if (lost && opener?.isConnected && !opener.closest('[inert]')) opener.focus({ preventScroll: true });
    },
  };
}
