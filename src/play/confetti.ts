// The winner's confetti: a short burst (an encoder chokes on thousands of small moving pieces), kept off the standings.

/** How long it runs (ms). It fades out over the last FADE_MS, then stops and the canvas is cleared. */
export const CONFETTI_MS = 4500;
export const FADE_MS = 900;
/** Fewer, bigger pieces than before (260 small ones forever): they stay pieces on a compressed stream. */
export const PIECES = 90;

/** How visible the confetti is `t` ms after it started (1 … 0); 0 once it's over. */
export function confettiAlpha(t: number): number {
  if (t >= CONFETTI_MS) return 0;
  return Math.max(0, Math.min(1, (CONFETTI_MS - t) / FADE_MS));
}

/** It's still running (and drawing frames) at `t` ms. Never with reduced motion. */
export function confettiRunning(t: number, calm: boolean): boolean {
  return !calm && t < CONFETTI_MS;
}

/**
 * Where a piece starts across (0 … W), from a random number in [0, 1): only in the strips either side of the standings
 * (`keepOut` left … right), so it never falls over the names and scores.
 */
export function confettiX(r: number, W: number, keepOut?: { left: number; right: number }): number {
  if (!keepOut) return r * W;
  const left = Math.max(0, keepOut.left);
  const right = Math.max(0, W - keepOut.right);
  const x = r * (left + right);
  return x < left ? x : keepOut.right + (x - left);
}
