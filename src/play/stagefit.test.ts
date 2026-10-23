import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aboveStrip, choiceStrip, PILL_BAND, slideFit, TIMER_BAND } from './stagefit';
import { CONFETTI_MS, confettiAlpha, confettiRunning, confettiX, PIECES } from './confetti';
import { Announcer, ANNOUNCE_WAIT } from '../lib/announce';

describe('the play area and the stats strip', () => {
  it('scales the screen into the room above a strip at the bottom, centred across', () => {
    const a = aboveStrip(108, 'bottom');
    expect(a.scale).toBeCloseTo(0.9);
    expect(a.y).toBe(0);
    expect(a.x).toBeCloseTo((1920 - 1920 * 0.9) / 2);
    // Its foot is exactly the strip's top: nothing under the strip.
    expect(a.y + 1080 * a.scale).toBeCloseTo(1080 - 108);
  });

  it('goes below a strip at the top', () => {
    const a = aboveStrip(108, 'top');
    expect(a.y).toBeCloseTo(108);
    expect(a.y + 1080 * a.scale).toBeCloseTo(1080);
  });

  it('fills the stage with no strip, and never shrinks below half', () => {
    expect(aboveStrip(0, 'bottom')).toEqual({ scale: 1, x: 0, y: 0 });
    expect(aboveStrip(200, 'hidden').scale).toBe(1);
    expect(aboveStrip(900, 'bottom').scale).toBe(0.5);
  });

  it('keeps the countdown’s band taller than the answering plate’s', () => {
    expect(TIMER_BAND).toBeGreaterThan(PILL_BAND);
  });
});

describe('a slide between a top band and a multiple choice strip (slideFit)', () => {
  /** Where the slide's top and foot land, drawn at that scale toward originY. */
  const edges = (f: { scale: number; originY: number }) => [f.originY * (1 - f.scale), f.originY + (1080 - f.originY) * f.scale];

  it('full size with neither; a band only, as before: smaller toward the bottom', () => {
    expect(slideFit(0, 0)).toBeUndefined();
    expect(slideFit(TIMER_BAND, 0)).toEqual({ scale: (1080 - TIMER_BAND) / 1080, originY: 1080 });
  });

  it('a strip only: smaller toward the top, its foot on the strip', () => {
    const f = slideFit(0, 160)!;
    expect(f.originY).toBe(0);
    expect(edges(f)[1]).toBeCloseTo(1080 - 160);
  });

  it('both: just the room between them (a countdown and 4 choices 0.68, 6 choices 0.55)', () => {
    const four = slideFit(TIMER_BAND, choiceStrip(4).h)!;
    expect(four.scale).toBeCloseTo(0.68, 2);
    expect(edges(four)[0]).toBeCloseTo(TIMER_BAND);
    expect(edges(four)[1]).toBeCloseTo(1080 - 160);
    const six = slideFit(TIMER_BAND, choiceStrip(6).h)!;
    expect(six.scale).toBeCloseTo(0.55, 2);
    expect(edges(six)[1]).toBeCloseTo(1080 - 296);
  });

  it('the strip: 2 to 4 choices in a row (160 tall), 5 or 6 in two rows of 3 (296)', () => {
    expect([2, 3, 4, 5, 6].map((n) => choiceStrip(n))).toEqual([
      { cols: 2, h: 160 },
      { cols: 3, h: 160 },
      { cols: 4, h: 160 },
      { cols: 3, h: 296 },
      { cols: 3, h: 296 },
    ]);
  });
});

describe('the winner’s confetti', () => {
  it('runs about 4.5 s, then stops', () => {
    expect(CONFETTI_MS).toBe(4500);
    expect(confettiRunning(0, false)).toBe(true);
    expect(confettiRunning(4499, false)).toBe(true);
    expect(confettiRunning(4500, false)).toBe(false);
    expect(confettiRunning(60_000, false)).toBe(false);
  });

  it('fades out at the end', () => {
    expect(confettiAlpha(0)).toBe(1);
    expect(confettiAlpha(3000)).toBe(1);
    expect(confettiAlpha(4300)).toBeGreaterThan(0);
    expect(confettiAlpha(4300)).toBeLessThan(1);
    expect(confettiAlpha(4500)).toBe(0);
  });

  it('never runs with reduced motion', () => {
    expect(confettiRunning(0, true)).toBe(false);
  });

  it('is fewer pieces than it was (260)', () => {
    expect(PIECES).toBeLessThanOrEqual(120);
  });

  it('starts only either side of the standings', () => {
    const keepOut = { left: 410, right: 1510 };
    for (let r = 0; r < 1; r += 0.01) {
      const x = confettiX(r, 1920, keepOut);
      expect(x < 410 || x >= 1510).toBe(true);
      expect(x).toBeLessThanOrEqual(1920);
    }
    expect(confettiX(0.5, 1920)).toBe(960);
  });
});

describe('announcements for screen readers', () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  it('says messages close together once, together, after a quiet moment', () => {
    const said: string[] = [];
    const a = new Announcer((t) => said.push(t));
    a.push('Ann +$200, now $1,200');
    a.push('Bo +$200, now $400');
    a.push('Ann +$200, now $1,200');
    vi.advanceTimersByTime(ANNOUNCE_WAIT - 1);
    expect(said).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(said).toEqual(['Ann +$200, now $1,200. Bo +$200, now $400.']);
  });

  it('waits while messages keep coming (no stream of interruptions)', () => {
    const said: string[] = [];
    const a = new Announcer((t) => said.push(t), 400);
    for (let i = 0; i < 5; i++) {
      a.push(`Buzz order: ${i}`);
      vi.advanceTimersByTime(300);
    }
    expect(said).toEqual([]);
    vi.advanceTimersByTime(400);
    expect(said).toHaveLength(1);
  });

  it('says a message with a key only as it ends up (one buzz order, the latest, where it first came)', () => {
    const said: string[] = [];
    const a = new Announcer((t) => said.push(t));
    a.push('Bob −$200, now −$200');
    a.push('Buzz order: 1. Bob (out), 2. Ann', 'buzz-order');
    a.push('Ann is answering');
    a.push('Buzz order: 1. Ann, 2. Bob (out)', 'buzz-order');
    vi.runAllTimers();
    expect(said).toEqual(['Bob −$200, now −$200. Buzz order: 1. Ann, 2. Bob (out). Ann is answering.']);
  });

  it('ignores empty messages and keeps its own full stops', () => {
    const said: string[] = [];
    const a = new Announcer((t) => said.push(t));
    a.push('   ');
    a.push('Saved!');
    vi.runAllTimers();
    expect(said).toEqual(['Saved!']);
  });
});
