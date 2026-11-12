// A slides round's slide fitted to the window's height (SlideEditor's `fitheight`).

/** The pasteboard (14px each side) and border (1px each side) around the 16:9 slide in the editor's canvas. */
const FRAME = 30;
/** Left free under the slide, so its edge doesn't sit on the window's. */
const GAP = 16;
/** Never narrower than this, however little room is left (a phone, a tiny window): it scrolls instead. */
export const MIN_SLIDE_WIDTH = 320;

/**
 * The slide's widest, in px, for the whole of it (and its frame) to show between `top`, where its canvas starts with
 * the page scrolled to the top, and `bottom`, the foot of the scrolling area.
 */
export function fitSlideWidth(top: number, bottom: number): number {
  return Math.max(MIN_SLIDE_WIDTH, Math.floor(((bottom - top - GAP - FRAME) * 16) / 9));
}
