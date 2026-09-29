// Svelte action: shrink an element's font until its content fits its box.
// Measured in unscaled layout pixels, so it works inside the scaled Stage.
export function autofit(node: HTMLElement, opts: { size: number; enabled: boolean; text: string }) {
  function fit({ size, enabled }: typeof opts) {
    let s = size;
    node.style.fontSize = `${s}px`;
    if (!enabled) return;
    const inner = node.firstElementChild as HTMLElement | null;
    const over = () =>
      inner ? inner.scrollHeight > node.clientHeight || inner.scrollWidth > node.clientWidth : node.scrollHeight > node.clientHeight;
    while (s > 12 && over()) {
      s = Math.floor(s * 0.92);
      node.style.fontSize = `${s}px`;
    }
  }
  fit(opts);
  // Fonts can load after first layout; refit once they're ready.
  document.fonts?.ready.then(() => fit(opts));
  return { update: (o: typeof opts) => ((opts = o), fit(o)) };
}
