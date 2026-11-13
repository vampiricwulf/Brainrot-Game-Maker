// A box that scrolls (a window in the one-window host panel: 👥 Players, ⚖ Rules, the keys): `data-more` on it while
// there's more below what shows, so a fade over its foot says it scrolls (see app.css, .in-panel).

/** Whether a box scrolled to `top` (`height` showing of `full`) has more below (a pixel's rounding left out). */
export function moreBelow(top: number, height: number, full: number): boolean {
  return top + height < full - 1;
}

/** Keeps `data-more` on the box up to date: as it scrolls, resizes, or what's in it changes (a fold opened, a filter). */
export function scrollMore(node: HTMLElement): { destroy(): void } {
  const set = () => node.toggleAttribute('data-more', moreBelow(node.scrollTop, node.clientHeight, node.scrollHeight));
  const ro = new ResizeObserver(set);
  const watch = () => {
    ro.disconnect();
    ro.observe(node);
    for (const c of node.children) ro.observe(c);
    set();
  };
  const mo = new MutationObserver(watch);
  mo.observe(node, { childList: true, subtree: true, attributes: true, attributeFilter: ['open', 'class', 'hidden'] });
  node.addEventListener('scroll', set, { passive: true });
  watch();
  return {
    destroy() {
      ro.disconnect();
      mo.disconnect();
      node.removeEventListener('scroll', set);
    },
  };
}
