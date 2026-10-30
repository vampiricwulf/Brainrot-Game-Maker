/**
 * The host panel's click guard: one for the whole panel (the main button, the boxes' step buttons and their player
 * buttons), so one double-click is one step. A click can redraw what's under the pointer (a name picked, and the wheel's
 * button where the names were; Show question ▶ turning into 👁 Reveal answer): the rest of that double-click is dropped,
 * never a fresh click. After a box's click that put something else where it was (a name picked), a click on the same
 * spot within a second is dropped too: a slow double-click. A step that can't be undone (cards sent to phones) also
 * waits a moment after the step before it, as the keys do. (Its test for the rest of a double-click is the app's one,
 * oneshot.ts.)
 */

import { NEAR_PX, restOfPress } from '../../lib/oneshot';

/** The rest of a double-click: its next click within this long, on another control than the first. */
export const DOUBLE_CLICK_MS = 600;
/** A key (Enter, N) right after a step doesn't do the next one; a step that can't be undone waits as long for a click. */
export const KEY_GUARD_MS = 1000;
/** Controls that just appeared (a new round's ◀ / ▶, the fixed bar after the screen changed) take no click this long. */
export const NEW_CONTROLS_MS = 400;
/** A click on the spot where a box's click put something else (a name picked: the wheel's button there) waits this long. */
export const SAME_SPOT_MS = 1000;

/**
 * A click on a control: which one (the same id for the same control: a step's words, a box's player), when, and which
 * click of a press it is (the event's detail: 2 for a double-click's second). Where it landed (x, y: the window's), and
 * whether it puts something else in its place (`redraw`: a name picked, the partner row where the names were).
 */
export type Press = { control: string; at: number; detail: number; x?: number; y?: number; redraw?: boolean };

/** Two clicks on one spot. */
const sameSpot = (a: Press, b: Press): boolean =>
  a.x !== undefined && a.y !== undefined && b.x !== undefined && b.y !== undefined && Math.abs(a.x - b.x) <= NEAR_PX && Math.abs(a.y - b.y) <= NEAR_PX;

/** What the guard says of a click: it goes, it's the rest of a double-click, or it's too soon after the step before. */
export type Verdict = 'go' | 'double' | 'soon';

/**
 * Whether a click goes through, from the panel's last click that went (`last`) and its last step (`stepAt`). `final`:
 * a step that can't be undone.
 */
export function judgeClick(last: Press | null, stepAt: number, p: Press, final = false): Verdict {
  if (last && last.control !== p.control && restOfPress(last.at, p.at, p.detail, DOUBLE_CLICK_MS)) return 'double';
  // (A slow double-click, slower than the computer's double-click time: a fresh click to the browser.)
  if (last?.redraw && last.control !== p.control && p.at - last.at < SAME_SPOT_MS && sameSpot(last, p)) return 'double';
  if (final && p.at - stepAt < KEY_GUARD_MS) return 'soon';
  return 'go';
}

/** Controls shown at `shownAt` take no click yet (`doubleOnly`: only the rest of a double-click is dropped). */
export function justShown(shownAt: number, at: number, detail: number, doubleOnly = false): boolean {
  return doubleOnly ? restOfPress(shownAt, at, detail, NEW_CONTROLS_MS) : at - shownAt < NEW_CONTROLS_MS;
}

export type ClickGuard = {
  /**
   * A click on `control` (`detail`: the event's). `step`: it's one of the moment's steps (the main button's, a step
   * button's); `final`: one that can't be undone; `x`, `y`: where it landed; `redraw`: it puts something else there.
   * Says whether it goes, and notes it when it does.
   */
  press(control: string, detail: number, opts?: { step?: boolean; final?: boolean; x?: number; y?: number; redraw?: boolean }): Verdict;
  /** A step taken another way (a key): a step that can't be undone waits after it too. */
  stepped(): void;
};

/** A panel's guard (`now`: the clock, for tests). */
export function clickGuard(now: () => number = Date.now): ClickGuard {
  let last: Press | null = null;
  let stepAt = -Infinity;
  return {
    press(control, detail, { step = false, final = false, x, y, redraw } = {}) {
      const p: Press = { control, at: now(), detail, x, y, ...(redraw ? { redraw } : {}) };
      const v = judgeClick(last, stepAt, p, final);
      // (The rest of a double-click leaves the first click as the one before: a third click is dropped too.)
      if (v === 'double') return v;
      last = p;
      if (v === 'go' && step) stepAt = p.at;
      return v;
    },
    stepped() {
      stepAt = now();
    },
  };
}
