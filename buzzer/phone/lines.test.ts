import { describe, expect, it } from 'vitest';
import { hostAwayLine, money } from './lines';

describe('money', () => {
  it('puts $ or an emoji in front, a word after, and a minus sign before', () => {
    expect(money(1200, '$')).toBe('$1,200');
    expect(money(-2000, '$')).toBe('−$2,000');
    expect(money(300, 'pts')).toBe('300 pts');
    expect(money(0, '')).toBe('0');
  });
});

describe('hostAwayLine: the note while the host is gone', () => {
  it('says it dropped for the first minute, without promising they’ll be back', () => {
    for (const ms of [0, 5_000, 59_999]) expect(hostAwayLine(ms)).toBe('The host’s connection dropped: waiting for them…');
  });

  it('then how long, in whole minutes (hours past one), and that the seat is kept', () => {
    expect(hostAwayLine(60_000)).toBe('The host has been away 1 min. Your seat is kept: this page picks up by itself when they’re back.');
    expect(hostAwayLine(2 * 60_000 + 59_000)).toContain('away 2 min.');
    expect(hostAwayLine(60 * 60_000)).toContain('away 1 h.');
    expect(hostAwayLine(125 * 60_000)).toContain('away 2 h 5 min.');
  });
});
