import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addTime, newLive, startTimer, timerRemaining, toggleTimer } from './live';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
});
afterEach(() => vi.useRealTimers());

describe('the countdown', () => {
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
});
