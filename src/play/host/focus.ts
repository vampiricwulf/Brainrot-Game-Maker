/**
 * Focus the app moves itself (the keys back to the main button after a step): it never counts as reached with the
 * keyboard (Play's tabbedTo), so Enter on it still goes through the host screen's own checks (a second Enter right after
 * a step doesn't judge anyone) instead of pressing that button.
 */
let quietly: Element | null = null;

/** Focus `el` (if any) without scrolling to it, as the app's own move. */
export function focusQuiet(el: HTMLElement | null | undefined): void {
  if (!el) return;
  quietly = el;
  try {
    el.focus({ preventScroll: true });
  } finally {
    quietly = null;
  }
}

/** The focus coming to `el` now is the app's own (see focusQuiet). */
export const focusedQuietly = (el: EventTarget | null): boolean => !!el && el === quietly;

/** The keys back to the host panel's main button, when there is one to press. */
export function focusMain(): void {
  focusQuiet(document.querySelector<HTMLElement>('.panel [data-next]:not(:disabled)'));
}
