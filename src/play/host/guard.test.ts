import { describe, expect, it } from 'vitest';
import { CHECK_GUARD_MS, checkHeld, checkPressHeld, clickGuard, DOUBLE_CLICK_MS, judgeClick, justShown, KEY_GUARD_MS, NEW_CONTROLS_MS, SAME_SPOT_MS } from './guard';

/** A guard on a clock the test moves (`at.t`). */
function guarded() {
  const at = { t: 10_000 };
  return { at, guard: clickGuard(() => at.t) };
}

describe('the host panel’s click guard', () => {
  it('keeps today’s timings', () => {
    expect([DOUBLE_CLICK_MS, KEY_GUARD_MS, NEW_CONTROLS_MS]).toEqual([600, 1000, 400]);
  });

  it('drops a slow double-click on a name: what took its place waits a second, on that spot only', () => {
    const { at, guard } = guarded();
    expect(guard.press('partner:pick:p2', 1, { x: 100, y: 500, redraw: true })).toBe('go');
    // A fresh click to the browser (slower than its double-click time), on the wheel's button now there.
    at.t += 900;
    expect(guard.press('step:🎡 Spin for a partner', 1, { step: true, x: 102, y: 501 })).toBe('double');
    // Elsewhere it goes at once.
    expect(guard.press('partner:partner:p3', 1, { x: 400, y: 500 })).toBe('go');
    // And on that spot once the second is over.
    const { at: at2, guard: g2 } = guarded();
    g2.press('partner:pick:p2', 1, { x: 100, y: 500, redraw: true });
    at2.t += SAME_SPOT_MS;
    expect(g2.press('step:🎡 Spin for a partner', 1, { step: true, x: 100, y: 500 })).toBe('go');
    // (Not after a click that leaves the same thing there: the main button, clicked again, goes on.)
    const { at: at3, guard: g3 } = guarded();
    g3.press('main:▶ Show question', 1, { step: true, x: 1200, y: 600 });
    at3.t += 700;
    expect(g3.press('main:⏱ Start the clock', 1, { step: true, x: 1200, y: 600 })).toBe('go');
  });

  it('lets a fresh click through, whatever came just before', () => {
    const last = { control: 'partner:chip:bob', at: 1000, detail: 1 };
    expect(judgeClick(last, -Infinity, { control: 'step:🎡 Spin for a partner', at: 1050, detail: 1 })).toBe('go');
    expect(judgeClick(null, -Infinity, { control: 'main:Spin!', at: 0, detail: 2 })).toBe('go');
  });

  it('drops the rest of a double-click that landed on another control (the first one redrew what was under it)', () => {
    const { at, guard } = guarded();
    expect(guard.press('main:Show question ▶', 1, { step: true })).toBe('go');
    at.t += 150;
    expect(guard.press('main:👁 Reveal answer', 2, { step: true })).toBe('double');
    // (A third click of the same press is dropped too: the first one is still the one it's from.)
    at.t += 150;
    expect(guard.press('main:▦ Done ▶ board', 3, { step: true })).toBe('double');
    // A fresh click goes, at once.
    at.t += 10;
    expect(guard.press('main:👁 Reveal answer', 1, { step: true })).toBe('go');
  });

  it('lets a double-click on the same control do it twice (Next slide ▶, Next slide ▶)', () => {
    const { at, guard } = guarded();
    expect(guard.press('main:Next slide ▶', 1)).toBe('go');
    at.t += 150;
    expect(guard.press('main:Next slide ▶', 2)).toBe('go');
  });

  it('covers the whole box: a double-click on a name never spins the wheel that took its place', () => {
    const { at, guard } = guarded();
    expect(guard.press('partner:chip:p2', 1)).toBe('go');
    at.t += 120;
    expect(guard.press('step:🎡 Spin for a partner', 2, { step: true })).toBe('double');
  });

  it('lets the second click go once the double-click is over (600 ms)', () => {
    const { at, guard } = guarded();
    guard.press('main:Show question ▶', 1, { step: true });
    at.t += DOUBLE_CLICK_MS;
    expect(guard.press('main:👁 Reveal answer', 2)).toBe('go');
  });

  it('holds a step that can’t be undone for a second after the step before, by a click or a key', () => {
    const { at, guard } = guarded();
    guard.press('step:▶ Show question', 1, { step: true });
    at.t += 300;
    expect(guard.press('step:📤 Send and start', 1, { step: true, final: true })).toBe('soon');
    // Held, it isn't a step: the hold still counts from the question.
    at.t += 300;
    expect(guard.press('step:📤 Send and start', 1, { step: true, final: true })).toBe('soon');
    at.t += KEY_GUARD_MS - 600;
    expect(guard.press('step:📤 Send and start', 1, { step: true, final: true })).toBe('go');
    // The step before taken with a key.
    guard.stepped();
    at.t += 999;
    expect(guard.press('step:📤 Send and start', 1, { final: true })).toBe('soon');
  });

  it('doesn’t hold it after a click that isn’t a step (picking who gets a card)', () => {
    const { at, guard } = guarded();
    at.t += 5000;
    guard.press('partner:card:1:p3', 1);
    at.t += 100;
    expect(guard.press('step:📤 Send and start', 1, { step: true, final: true })).toBe('go');
  });

  it('keeps new controls from a click for a moment after they appear', () => {
    expect(justShown(1000, 1399, 1)).toBe(true);
    expect(justShown(1000, 1400, 1)).toBe(false);
    // The fixed bar: only the rest of a double-click.
    expect(justShown(1000, 1100, 1, true)).toBe(false);
    expect(justShown(1000, 1100, 2, true)).toBe(true);
  });

  it('the check before going on takes no click while it’s new, nor the rest of the press that opened it', () => {
    expect(CHECK_GUARD_MS).toBeGreaterThan(NEW_CONTROLS_MS);
    // The second click of the double-click that opened it, a fast click, then one after the hold.
    expect(checkHeld(1000, 1250, 2)).toBe(true);
    expect(checkHeld(1000, 1000 + CHECK_GUARD_MS - 1, 1)).toBe(true);
    expect(checkHeld(1000, 1000 + CHECK_GUARD_MS, 1)).toBe(false);
    // A triple-click's third, a while later, is held back too; a fresh click then isn't.
    expect(checkHeld(1000, 1000 + CHECK_GUARD_MS + 200, 3)).toBe(true);
    expect(checkHeld(1000, 1000 + CHECK_GUARD_MS + 200, 1)).toBe(false);
  });

  it('drops the rest of a double-click on one of its fixes, however old the check: it never does a second thing', () => {
    // Ann's ＋ Award $200 (Ann and Bob picked: it keeps the check open, Bob's ＋ … ▶ board where hers was), 5 s in.
    const ann = { at: 5000, x: 300, y: 600, keep: true };
    expect(checkPressHeld(ann, { at: 5150, detail: 2, x: 300, y: 600 })).toBe(true);
    // A slow double-click on that spot (two fresh clicks to the browser) waits a second: what's there changed meaning.
    expect(checkPressHeld(ann, { at: 5800, detail: 1, x: 302, y: 601 })).toBe(true);
    expect(checkPressHeld(ann, { at: 5000 + SAME_SPOT_MS, detail: 1, x: 300, y: 600 })).toBe(false);
    // Elsewhere, a fresh click goes at once (Bob's − Deduct, a line down).
    expect(checkPressHeld(ann, { at: 5150, detail: 1, x: 300, y: 640 })).toBe(false);
    // A key on a focused button (no place) isn't a click on that spot.
    expect(checkPressHeld(ann, { at: 5150, detail: 0 })).toBe(false);
    // After a fix that didn't redraw in place, only the rest of its press is dropped, for DOUBLE_CLICK_MS.
    const send = { at: 5000, x: 300, y: 600 };
    expect(checkPressHeld(send, { at: 5000 + DOUBLE_CLICK_MS - 1, detail: 2, x: 300, y: 600 })).toBe(true);
    expect(checkPressHeld(send, { at: 5000 + DOUBLE_CLICK_MS, detail: 2, x: 300, y: 600 })).toBe(false);
    expect(checkPressHeld(send, { at: 5300, detail: 1, x: 300, y: 600 })).toBe(false);
    // Nothing pressed yet: nothing held (the check's own first moments are checkHeld's).
    expect(checkPressHeld(null, { at: 5150, detail: 2, x: 300, y: 600 })).toBe(false);
  });
});
