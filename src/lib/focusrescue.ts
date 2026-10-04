// Svelte action: when the control that has the keys goes away (a strip's Cancel that closes it, a row that turns into
// another, a button that turns disabled), they land on the nearest control still there, not on the page itself, so
// someone on the keyboard carries on from where they were instead of Tabbing from the top.

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

const usable = (el: HTMLElement) =>
  !el.matches(':disabled') && !el.closest('[inert]') && el.getClientRects().length > 0 && el.getAttribute('aria-hidden') !== 'true';

export function focusRescue(root: HTMLElement) {
  /** What had the keys last, and the elements around it (nearest first). */
  let last: HTMLElement | null = null;
  let around: HTMLElement[] = [];
  const onin = (e: FocusEvent) => {
    last = e.target as HTMLElement;
    around = [];
    for (let p = last.parentElement; p && p !== root.parentElement; p = p.parentElement) around.push(p);
  };
  let queued = false;
  const check = () => {
    queued = false;
    const el = last;
    if (!el || (document.activeElement && document.activeElement !== document.body)) return;
    // Still there and usable: the keys were let go on purpose (a click on nothing).
    if (el.isConnected && usable(el)) return;
    for (const p of around) {
      if (!p.isConnected) continue;
      // A button first: in a text box, keys mean something else (Esc there closes the clue being edited).
      const to = [...p.querySelectorAll<HTMLElement>('button')].find(usable) ?? [...p.querySelectorAll<HTMLElement>(FOCUSABLE)].find(usable);
      if (to) return void to.focus();
    }
  };
  const later = () => {
    if (queued) return;
    queued = true;
    setTimeout(check);
  };
  const mo = new MutationObserver(later);
  mo.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
  root.addEventListener('focusin', onin);
  root.addEventListener('focusout', later);
  return {
    destroy() {
      mo.disconnect();
      root.removeEventListener('focusin', onin);
      root.removeEventListener('focusout', later);
    },
  };
}
