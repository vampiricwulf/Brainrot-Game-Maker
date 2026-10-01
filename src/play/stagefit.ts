// Room on the 1920×1080 stage: what's kept free for the countdown and the stats strip, so nothing covers the play.

/** The countdown box's corner (top 30, about 150 tall): a question slide moves down under this much. */
export const TIMER_BAND = 190;
/** The countdown box's width (220, a little more as it pulses) and a gap: kept free at the end of the board's score bar. */
export const TIMER_ROOM = 250;
/** The phone buzzers' join code at the end of the board's score bar. */
export const JOIN_ROOM = 230;
/** "Ann is answering" / the Daily Double badge along the top. */
export const PILL_BAND = 130;

/**
 * The play area above (or below) a stats strip `strip` px tall: how much it's scaled, and where it sits, so the whole
 * screen or board shows, none of it under the strip. It keeps its 16:9 shape, centred across.
 */
export function aboveStrip(strip: number, at: 'top' | 'bottom' | 'hidden', W = 1920, H = 1080): { scale: number; x: number; y: number } {
  const room = at === 'hidden' ? H : Math.max(H / 2, H - Math.max(0, strip));
  const scale = room / H;
  return { scale, x: (W - W * scale) / 2, y: at === 'top' ? H - room : 0 };
}
