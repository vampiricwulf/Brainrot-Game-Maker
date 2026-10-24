// Room on the 1920×1080 stage: what's kept free for the countdown and the stats strip, so nothing covers the play.

/** The countdown box's corner (top 30, about 150 tall): a question slide moves down under this much. */
export const TIMER_BAND = 190;
/** The countdown box's width (220, a little more as it pulses) and a gap: kept free at the end of the board's score bar. */
export const TIMER_ROOM = 250;
/** The phone buzzers' join code at the end of the board's score bar (at least: AudienceView measures it). */
export const JOIN_ROOM = 230;
/** "Ann is answering" / the Daily Double badge along the top. */
export const PILL_BAND = 130;
/** A multiple choice's box in the strip under a question, and the gap between boxes (and rows). */
export const CHOICE_H = 120;
export const CHOICE_GAP = 16;

/**
 * The strip of a question's multiple choices along the foot of the stage: how many a row (all of 2 to 4 in one, 5 or 6
 * in rows of 3), and the room it takes from the slide (24 below it, 16 above it).
 */
export function choiceStrip(n: number): { cols: number; h: number } {
  const cols = n <= 4 ? n : 3;
  const rows = Math.ceil(n / cols);
  return { cols, h: rows * CHOICE_H + (rows - 1) * CHOICE_GAP + 24 + 16 };
}

/**
 * A slide drawn smaller between a top band (`top`, the countdown's or a badge's) and a bottom strip (`bottom`, the
 * multiple choices): its scale, and where it shrinks toward (stage px from the top), so it fills just the room between
 * them. Neither: undefined (full size). A band only shrinks it toward the bottom, as it always has.
 */
export function slideFit(top: number, bottom: number): { scale: number; originY: number } | undefined {
  if (!top && !bottom) return undefined;
  return { scale: (1080 - top - bottom) / 1080, originY: (top * 1080) / (top + bottom) };
}

/**
 * The play area above (or below) a stats strip `strip` px tall: how much it's scaled, and where it sits, so the whole
 * screen or board shows, none of it under the strip. It keeps its 16:9 shape, centred across.
 */
export function aboveStrip(strip: number, at: 'top' | 'bottom' | 'hidden', W = 1920, H = 1080): { scale: number; x: number; y: number } {
  const room = at === 'hidden' ? H : Math.max(H / 2, H - Math.max(0, strip));
  const scale = room / H;
  return { scale, x: (W - W * scale) / 2, y: at === 'top' ? H - room : 0 };
}
