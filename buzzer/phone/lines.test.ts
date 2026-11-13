import { describe, expect, it } from 'vitest';
import { hadGoLine, hostAwayLine, money, passButton, passedLines, verdictLine as line } from './lines';

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

describe('verdictLine: the Final’s verdict on a phone', () => {
  it('right with the points won, wrong with the points lost, no amount for none', () => {
    // (The sign kept on the amount's line by a word joiner.)
    const verdictLine = (v: { right: boolean; delta: number }, sym: string) => line(v, sym).replace(/\u2060/g, '');
    expect(line({ right: false, delta: -2000 }, '$')).toBe('✘ Wrong −\u2060$2,000');
    expect(verdictLine({ right: true, delta: 1200 }, '$')).toBe('✔ Right! +$1,200');
    expect(verdictLine({ right: false, delta: -2000 }, '$')).toBe('✘ Wrong −$2,000');
    expect(verdictLine({ right: true, delta: 0 }, '$')).toBe('✔ Right!');
    expect(verdictLine({ right: false, delta: 0 }, 'pts')).toBe('✘ Wrong');
    expect(verdictLine({ right: true, delta: 50 }, 'pts')).toBe('✔ Right! +50 pts');
  });
});

describe('passing on a clue', () => {
  it('the button passes, then takes the pass back; teams say so', () => {
    expect(passButton({}, false)).toBe('Pass: I won’t buzz on this one');
    expect(passButton({}, true)).toBe('Pass: our team won’t buzz on this one');
    expect(passButton({ passed: true }, false)).toBe('Take back my pass');
    expect(passButton({ passed: true, by: 'Ann', byYou: false }, true)).toBe('Take back the pass');
  });

  it('the buzzer says who passed, then who is answering or how to buzz after all', () => {
    expect(passedLines({ passed: true }, false, null)).toEqual({ big: 'You passed', small: 'Take the pass back to buzz' });
    expect(passedLines({ passed: true }, false, 'Bob is answering')).toEqual({ big: 'You passed', small: 'Bob is answering' });
    expect(passedLines({ passed: true, by: 'Ann', byYou: true }, true, null).big).toBe('Your team passed');
    expect(passedLines({ passed: true, by: 'Ann', byYou: false }, true, null).big).toBe('Ann passed for your team');
    // (A team passed without a name from an older room: plain.)
    expect(passedLines({ passed: true }, true, null).big).toBe('Your team passed');
  });

  it('everyone passed: says so (and that the pass can still be taken back), never what comes next', () => {
    expect(passedLines({ passed: true, all: true, can: true }, false, null)).toEqual({ big: 'You passed', small: 'Everyone passed · take the pass back to buzz' });
    expect(passedLines({ passed: true, all: true }, false, null).small).toBe('Everyone passed');
    expect(passedLines({ passed: true, all: true, can: true }, true, null).big).toBe('Your team passed');
    for (const all of [true, false]) expect(passedLines({ passed: true, all, can: true }, false, null).small).not.toMatch(/answer|next|reveal/i);
  });

  it('a seat that had its go hears that everyone else passed', () => {
    expect(hadGoLine(false, false, false)).toBe('You’ve had your go on this one');
    expect(hadGoLine(false, false, true)).toBe('You’ve had your go on this one · everyone else passed');
    expect(hadGoLine(true, false, true)).toBe('Your team already answered this one · everyone else passed');
    expect(hadGoLine(true, true, false)).toBe('You were on another team for this one');
  });
});
