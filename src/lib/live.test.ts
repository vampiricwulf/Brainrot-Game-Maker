import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addTime, newLive, startTimer, tileToolUp, timerRemaining, timerResumed, toggleTimer, type Overlay } from './live';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
});
afterEach(() => vi.useRealTimers());

describe('the countdown', () => {
  it('remembers the seconds it was started with, for ↺ Restart, whatever +10/−10 did since', () => {
    const live = newLive();
    startTimer(live, 30);
    addTime(live, 10);
    addTime(live, 10);
    expect([live.timer!.total, live.timer!.start]).toEqual([50, 30]);
  });

  it('gets more or less time without restarting, paused or not', () => {
    const live = newLive();
    startTimer(live, 30);
    vi.advanceTimersByTime(12_000);
    addTime(live, 10);
    expect(timerRemaining(live.timer!)).toBe(28);
    toggleTimer(live);
    addTime(live, -10);
    expect([timerRemaining(live.timer!), live.timer!.startedAt]).toEqual([18, null]);
    // Never below nothing left.
    addTime(live, -60);
    expect(timerRemaining(live.timer!)).toBe(0);
  });

  it('runs again when time is added after it ran out', () => {
    const live = newLive();
    startTimer(live, 5);
    // As the host's watcher marks it.
    Object.assign(live.timer!, { elapsed: 5, startedAt: null, expired: true });
    addTime(live, -10);
    expect(live.timer!.expired).toBe(true);
    addTime(live, 10);
    expect([live.timer!.expired, timerRemaining(live.timer!)]).toEqual([false, 10]);
    vi.advanceTimersByTime(4000);
    expect(timerRemaining(live.timer!)).toBe(6);
  });

  it('comes back after an Undo with the time it had left, paused or not', () => {
    const live = newLive();
    startTimer(live, 30);
    vi.advanceTimersByTime(12_000);
    // A right answer took it off here…
    const stopped = { ...live.timer! };
    const at = Date.now();
    vi.advanceTimersByTime(20_000);
    // …and the Undo puts it back: 18 seconds left, running from now.
    const back = timerResumed(stopped, at);
    expect([timerRemaining(back), back.start]).toEqual([18, 30]);
    vi.advanceTimersByTime(3000);
    expect(timerRemaining(back)).toBe(15);
    // Paused when it was taken off: still paused, with what it had left.
    startTimer(live, 30);
    vi.advanceTimersByTime(10_000);
    toggleTimer(live);
    const held = timerResumed({ ...live.timer! }, Date.now());
    vi.advanceTimersByTime(5000);
    expect([timerRemaining(held), held.startedAt]).toEqual([20, null]);
  });
});

describe('a wheel or dice tile', () => {
  const wheel = (nonce: string): Overlay => ({ kind: 'wheel', nonce, name: 'Wheel', segments: [], rotation: 0, spin: null, result: null });
  const clue = { id: 'q1', type: 'wheel' };

  it('waits for its own tool only, under the scores too', () => {
    const live = newLive();
    live.overlay = wheel('a');
    // A wheel opened over another clue's question (W), not the tile's own.
    expect(tileToolUp(live, clue)).toBe(false);
    live.toolTile = 'q1';
    expect(tileToolUp(live, clue)).toBe(true);
    live.overlay = { kind: 'scoreboard', nonce: 's', under: live.overlay };
    expect(tileToolUp(live, clue)).toBe(true);
    // Dice rolled over the wheel: the question no longer waits on a wheel.
    live.overlay = { kind: 'dice', nonce: 'd', name: 'd6', preset: { id: 'd6', name: 'd6', showTotal: false, dice: [] }, roll: null, startedAt: 0, duration: 0 };
    expect(tileToolUp(live, clue)).toBe(false);
    live.overlay = null;
    expect(tileToolUp(live, clue)).toBe(false);
  });
});
