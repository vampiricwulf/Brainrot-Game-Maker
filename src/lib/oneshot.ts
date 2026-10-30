// A double-click counts once on a button that replaces the screen (▶ Play, the first screen's cards, Resume game…):
// `use:oneShot` drops the rest of its press (a double-click's second click, a triple-click's third), wherever it lands
// on the new screen, so it never picks or adds something there. Only the rest of that press: a fresh click always goes
// through. The host panel's click guard (play/host/guard.ts) and a score plate's are the same test.

/** How long after a click the rest of its press can come (about the browser's double-click time). */
export const ONE_SHOT_MS = 500;

/**
 * Is a click at `at` the rest of the press whose click before it came at `before`? (`detail`: the browser's count of
 * clicks in a row, 2 for a double-click's second.) Never a first click.
 */
export function restOfPress(before: number, at: number, detail: number, ms = ONE_SHOT_MS): boolean {
  return detail >= 2 && at - before < ms;
}

/** A double-click's second click (or a triple-click's third): a click that toggles does it once. */
export const secondClick = (e: MouseEvent): boolean => e.detail >= 2;

/**
 * A pointer press this near a click, this soon after it, is the next click of its press; one further off is a fresh
 * press. (Pointer events carry no count, some parts of the app act on them, as the slide editor's items do, and those
 * can cancel the mousedown that would say so.)
 */
export const NEAR_PX = 6;

/** The click whose press is being dropped: when (moved on with each part dropped), and where. */
type Shot = { at: number; x: number; y: number };

/**
 * What to do with an event while a press is being dropped (`shot`): 'drop' it, 'end' the dropping (a fresh press), or
 * 'pass'. Pointer presses go by place and time (a finger's is always a fresh one); the rest by the browser's count.
 */
export function judgePart(shot: Shot, e: { type: string; detail: number; x: number; y: number; mouse: boolean }, at: number): 'drop' | 'end' | 'pass' {
  if (at - shot.at >= ONE_SHOT_MS) return 'end';
  if (e.type === 'pointerdown' || e.type === 'pointerup') {
    if (e.mouse && Math.abs(e.x - shot.x) <= NEAR_PX && Math.abs(e.y - shot.y) <= NEAR_PX) return 'drop';
    return e.type === 'pointerdown' ? 'end' : 'pass';
  }
  if (e.type === 'mousedown' && e.detail <= 1) return 'end';
  return restOfPress(shot.at, at, e.detail) ? 'drop' : 'pass';
}

let shot: Shot | null = null;

function part(e: MouseEvent): void {
  const now = Date.now();
  const v = shot && judgePart(shot, { type: e.type, detail: e.detail, x: e.clientX, y: e.clientY, mouse: !(e instanceof PointerEvent) || e.pointerType === 'mouse' }, now);
  if (v === 'end') shot = null;
  if (!shot || v !== 'drop') return;
  shot.at = now;
  e.stopImmediatePropagation();
  // (A pointer press is only kept from the page: its mousedown, which the browser counts, is the one dropped, so a fresh
  // click it was taken for still takes the focus and goes through.)
  if (!(e instanceof PointerEvent)) e.preventDefault();
}

if (typeof window !== 'undefined') {
  // (Before anything else on the page hears them: the window's capture.)
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'dblclick'] as const) window.addEventListener(type, part, true);
}

/** `use:oneShot` on a button that replaces the screen: the rest of a double-click on it is dropped. */
export function oneShot(node: HTMLElement): { destroy: () => void } {
  // (A click by the keys, detail 0, has no press to drop.)
  const arm = (e: MouseEvent) => {
    if (e.detail === 1) shot = { at: Date.now(), x: e.clientX, y: e.clientY };
  };
  node.addEventListener('click', arm);
  return { destroy: () => node.removeEventListener('click', arm) };
}
