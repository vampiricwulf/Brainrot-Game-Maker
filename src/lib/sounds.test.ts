import { describe, expect, it } from 'vitest';
import { BUILTIN, CUES, cueMedia, cueName, cueSamples, cueWav, hasBuiltin, tickTimes } from './sounds';
import { easeOut, sliceAt } from './tools';

describe('cueMedia', () => {
  it('plays the built-in sound by default, a file when one is chosen, nothing when switched off', () => {
    expect(cueMedia({ audio: {} }, 'right')).toBe(BUILTIN + 'right');
    expect(cueMedia({ audio: { right: 'm1' } }, 'right')).toBe('m1');
    expect(cueMedia({ audio: { right: '' } }, 'right')).toBeUndefined();
    // Switched off with its own file: nothing plays, and the file is kept for when it's back on.
    expect(cueMedia({ audio: { right: 'm1' }, soundsOff: { right: true } }, 'right')).toBeUndefined();
    expect(cueMedia({ audio: { right: 'm1' }, soundsOff: { wrong: true } }, 'right')).toBe('m1');
  });

  it('has no built-in think music', () => {
    expect(hasBuiltin('finalThink')).toBe(false);
    expect(cueMedia({ audio: {} }, 'finalThink')).toBeUndefined();
    expect(cueMedia({ audio: { finalThink: 'm2' } }, 'finalThink')).toBe('m2');
  });

  it('names cues for the history', () => {
    expect(cueName('timesUp')).toBe("time's up");
    expect(cueName('dailyDouble')).toBe('Daily Double');
    expect(cueName('finalThink')).toBe('think music');
    expect(cueName('nope')).toBeUndefined();
  });
});

describe('built-in sounds', () => {
  const builtins = CUES.map(([k]) => k).filter(hasBuiltin);

  it('every cue but the think music has one', () => {
    expect(builtins.length).toBe(CUES.length - 1);
  });

  it.each(builtins)('%s is short, audible, unclipped and starts and ends silent', (key) => {
    const s = cueSamples(key);
    const seconds = s.length / 22050;
    expect(seconds).toBeGreaterThan(0.01);
    expect(seconds).toBeLessThan(1.6);
    const peak = Math.max(...Array.from(s, Math.abs));
    expect(peak).toBeGreaterThan(0.1);
    expect(peak).toBeLessThanOrEqual(1);
    expect(Math.abs(s[0])).toBeLessThan(0.02);
    expect(Math.abs(s[s.length - 1])).toBeLessThan(0.02);
  });

  it('is a WAV file, the same every time', () => {
    const a = cueWav('dice');
    expect(String.fromCharCode(...a.slice(0, 4))).toBe('RIFF');
    expect(cueWav('dice')).toEqual(a);
  });

  it('wheel ticks are tiny', () => {
    expect(cueSamples('wheelTick').length / 22050).toBeLessThan(0.03);
  });
});

describe('tickTimes', () => {
  const segs = [{ weight: 1 }, { weight: 1 }, { weight: 2 }];

  it('ticks each time a slice boundary passes the pointer, slowing down as the wheel does', () => {
    const spin = { from: 10, to: 10 + 6 * 360 + 100, duration: 5000 };
    const t = tickTimes(segs, spin);
    expect(t.length).toBeGreaterThan(8);
    expect(t.every((x) => x > 0 && x <= spin.duration)).toBe(true);
    // Gaps grow toward the end.
    const gaps = t.slice(1).map((x, i) => x - t[i]);
    expect(gaps.at(-1)!).toBeGreaterThan(gaps[0]);
    // At each tick, the pointer is on a boundary: just before it one slice, just after it the next.
    const rot = (ms: number) => spin.from + (spin.to - spin.from) * easeOut(ms / spin.duration);
    for (const x of t.slice(-4)) expect(sliceAt(segs, rot(x - 2))).not.toBe(sliceAt(segs, rot(x + 2)));
  });

  it('leaves out ticks too close together', () => {
    const many = Array.from({ length: 40 }, () => ({ weight: 1 }));
    const t = tickTimes(many, { from: 0, to: 6 * 360, duration: 3000 });
    expect(t.slice(1).every((x, i) => x - t[i] >= 45)).toBe(true);
  });

  it('has nothing to tick for no wheel or no spin', () => {
    expect(tickTimes([], { from: 0, to: 720, duration: 1000 })).toEqual([]);
    expect(tickTimes(segs, { from: 90, to: 90, duration: 1000 })).toEqual([]);
  });
});
