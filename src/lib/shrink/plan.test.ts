// What a GIF's 🗜 copy comes out as (card-files spec §4.6): its name, size, codec, bitrate and when it's refused.
import { describe, expect, it } from 'vitest';
import { copyName, evenBelow, formatLine, gifBitrate, gifSize, leftText, madeLabel, planGif, removedLabel, smallEnough, TOO_LONG, typeWord } from './plan';
import { NO_WEBCODECS } from './probe';

const ALL = { avc: true, vp9: true, vp8: true };
const WEBM = { avc: false, vp9: true, vp8: true };

describe('copyName', () => {
  it('is the file’s name with (phones) and the copy’s own extension', () => {
    expect(copyName('Dance.gif', 'mp4')).toBe('Dance (phones).mp4');
    expect(copyName('my.cool.GIF', 'webm')).toBe('my.cool (phones).webm');
    expect(copyName('Dance', 'mp4')).toBe('Dance (phones).mp4');
    expect(copyName('.gif', 'mp4')).toBe('File (phones).mp4');
  });
});

describe('sizes', () => {
  it('are even and never more than asked', () => {
    expect([evenBelow(101), evenBelow(100), evenBelow(1), evenBelow(3.9)]).toEqual([100, 100, 2, 2]);
  });

  it('keep a GIF’s long side to 720 at most, never bigger than the GIF, even both ways', () => {
    expect(gifSize(1440, 810)).toEqual({ width: 720, height: 404 });
    expect(gifSize(300, 1000)).toEqual({ width: 216, height: 720 });
    expect(gifSize(481, 271)).toEqual({ width: 480, height: 270 });
  });

  it('give a bitrate of 0.1 bit a pixel a frame (30 fps at most), 200 kbps to 2.5 Mbps', () => {
    expect(gifBitrate(480, 270, 10)).toBe(200_000);
    expect(gifBitrate(720, 404, 25)).toBe(727_200);
    expect(gifBitrate(720, 404, 60)).toBe(gifBitrate(720, 404, 30));
    expect(gifBitrate(4000, 4000, 30)).toBe(2_500_000);
  });
});

describe('planGif', () => {
  const info = { width: 960, height: 540, frames: 50, seconds: 5 };

  it('makes an MP4 (H.264) where it can, else a WebM (VP9, else VP8)', () => {
    expect(planGif(info, ALL)).toMatchObject({ codec: 'avc', box: 'mp4', mime: 'video/mp4', ext: 'mp4', width: 720, height: 404, loops: 1, seconds: 5 });
    expect(planGif(info, WEBM)).toMatchObject({ codec: 'vp9', box: 'webm', mime: 'video/webm', ext: 'webm' });
    expect(planGif(info, { avc: false, vp9: false, vp8: true })).toMatchObject({ codec: 'vp8', box: 'webm' });
    expect(planGif(info, { avc: false, vp9: false, vp8: false })).toEqual({ refuse: NO_WEBCODECS });
  });

  it('goes round a short GIF until the copy lasts 2 s, and says about how big it comes out', () => {
    const p = planGif({ ...info, seconds: 0.5, frames: 5 }, WEBM);
    expect(p).toMatchObject({ loops: 4, seconds: 2 });
    if ('refuse' in p) throw new Error('refused');
    expect(p.estimate).toBe(Math.round(((p.bitrate * 2) / 8) * 1.03));
  });

  it('refuses a GIF over 2,000 frames or 60 s', () => {
    expect(planGif({ ...info, frames: 2001 }, ALL)).toEqual({ refuse: TOO_LONG });
    expect(planGif({ ...info, seconds: 61 }, ALL)).toEqual({ refuse: TOO_LONG });
    expect(planGif({ ...info, frames: 2000, seconds: 60 }, ALL)).not.toHaveProperty('refuse');
  });

  it('keeps a copy only under half its file', () => {
    expect(smallEnough(49, 100)).toBe(true);
    expect(smallEnough(50, 100)).toBe(false);
  });
});

describe('words', () => {
  it('say what it’s made as, and that some iPhones may not play a WebM', () => {
    expect(formatLine({ codec: 'avc' })).toBe('Made as an MP4 (H.264), which every phone plays.');
    expect(formatLine({ codec: 'vp9' })).toMatch(/^Made as a WebM \(VP9\)\. This browser makes WebM videos: some iPhones may not play them\./);
    expect([typeWord('video/mp4'), typeWord('video/webm')]).toEqual(['MP4', 'WebM']);
  });

  it('never name the file in History', () => {
    expect(madeLabel('GIF')).toBe('Made a smaller copy of a GIF for phones');
    expect(removedLabel('video')).toBe('Removed a video’s smaller copy for phones');
  });

  it('say about how long is left', () => {
    expect([leftText(3), leftText(41), leftText(54), leftText(170)]).toEqual(['about 5 s left', 'about 40 s left', 'about 55 s left', 'about 3 min left']);
  });
});
