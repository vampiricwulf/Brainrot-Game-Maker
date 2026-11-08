import { describe, expect, it } from 'vitest';
import { newEmbedEl, newAudioEl } from './model';
import { isSoundOnly, rangeProgress, soundShows, timeText } from './soundonly';

describe('Sound only YouTube items', () => {
  it('is a YouTube item with Sound only on (missing, as in older games: off)', () => {
    const yt = newEmbedEl('https://youtu.be/dQw4w9WgXcQ', 'youtube');
    expect(isSoundOnly(yt)).toBe(false);
    expect(isSoundOnly({ ...yt, soundOnly: true })).toBe(true);
    // (Another site's player, or a sound, never is.)
    expect(isSoundOnly({ ...newEmbedEl('https://streamable.com/abc', 'streamable'), soundOnly: true })).toBe(false);
    expect(isSoundOnly(newAudioEl('m1'))).toBe(false);
  });

  it('shows the speaker unless told otherwise', () => {
    expect(soundShows({})).toBe('speaker');
    expect(soundShows({ soundShows: 'nothing' })).toBe('nothing');
    expect(soundShows({ soundShows: 'time' })).toBe('time');
    expect(soundShows({ soundShows: 'odd' as never })).toBe('speaker');
  });
});

describe('rangeProgress', () => {
  it('is nothing until the length is known, with no Plays to', () => {
    expect(rangeProgress(0, 0, 0)).toBeNull();
    expect(rangeProgress(40, NaN, 30)).toBeNull();
  });

  it('knows a part with a Plays to before the video’s length is known', () => {
    expect(rangeProgress(0, 0, 30, 60)).toEqual({ at: 0, length: 30, frac: 0 });
    expect(rangeProgress(5, NaN, 0, 30)).toMatchObject({ at: 5, length: 30 });
  });

  it('runs over the whole video with no part set', () => {
    expect(rangeProgress(12, 210, 0)).toEqual({ at: 12, length: 210, frac: 12 / 210 });
  });

  it('runs over the part it plays, from its Plays from to its Plays to', () => {
    expect(rangeProgress(40, 210, 30, 60)).toEqual({ at: 10, length: 30, frac: 1 / 3 });
    // Before the start (just sought there) and past the end: held at the ends.
    expect(rangeProgress(10, 210, 30, 60)).toMatchObject({ at: 0, frac: 0 });
    expect(rangeProgress(70, 210, 30, 60)).toMatchObject({ at: 30, frac: 1 });
  });

  it('counts a Plays to past the video’s end to its end, and an empty part as none', () => {
    expect(rangeProgress(0, 100, 30, 500)).toMatchObject({ length: 70 });
    expect(rangeProgress(0, 100, 120)).toBeNull();
  });
});

describe('timeText', () => {
  it('says how far in and how long the part is', () => {
    expect(timeText({ at: 12.7, length: 210 })).toBe('0:12 / 3:30');
    expect(timeText({ at: 0, length: 30 })).toBe('0:00 / 0:30');
    expect(timeText(rangeProgress(95, 3600, 60, 3700)!)).toBe('0:35 / 59:00');
  });
});
