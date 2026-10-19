// What a 🗜 copy comes out as (card-files spec §4.6, §4.7): a GIF's name, size, codec, bitrate and when it's refused;
// a video's sizes and their estimates, the part the cards play, and how a video's and a sound's copies are made.
import { describe, expect, it } from 'vitest';
import { SLOW_FILE_BYTES } from '../buzzproto';
import type { MediaFacts, TrackFacts } from './facts';
import { verdict } from './playable';
import {
  avDefault,
  CANT_MAKE_SOUND,
  CANT_READ_FILE,
  CANT_READ_VIDEO,
  cardSpan,
  clockTenths,
  clockText,
  copyName,
  estimateBytes,
  evenBelow,
  formatLine,
  gifBitrate,
  gifSize,
  leftText,
  lengthText,
  madeLabel,
  NO_ENCODER,
  NO_PICTURE,
  NOT_MUCH_SMALLER,
  OPUS_NOTE,
  planGif,
  planSoundCopy,
  planVideoCopy,
  removedLabel,
  smallEnough,
  soundBps,
  SOUND_TOO_LONG,
  spanText,
  TOO_LONG,
  typeWord,
  videoChoices,
  videoOptions,
  type AvRead,
  type CopyPlan,
  planConvert,
  videoBitrate,
  convertLabel,
  CANT_READ_EDIT,
  CANT_SIZE,
  cantReencode,
  cantSound,
  cropPixels,
  editedName,
  editLabel,
  isNoEdit,
  needsKey,
  noEdit,
  NO_REENCODE_HERE,
  outputSize,
  parseClock,
  planEdit,
  quickTrimAt,
  TOO_SHORT,
  VP9_IN_MP4,
  WEBM_EDIT_NOTE,
  WEBM_NOTE,
  type FileEdit,
} from './plan';
import { NO_WEBCODECS, type Can, type Encoders } from './probe';

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
    expect(planGif(info, { avc: false, vp9: false, vp8: false })).toEqual({ refuse: NO_ENCODER });
    // (The window adds the full stop; where WebCodecs is there at all, it doesn't say to open the app another way.)
    expect(NO_ENCODER).toBe('This browser can’t make this copy: try Chrome, Edge, Firefox or the desktop app');
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
    expect(madeLabel('video', false)).toBe('Made a copy of a video that phones can play');
    expect(removedLabel('video')).toBe('Removed a video’s smaller copy for phones');
  });

  it('say about how long is left', () => {
    expect([leftText(3), leftText(41), leftText(54), leftText(170)]).toEqual(['about 5 s left', 'about 40 s left', 'about 55 s left', 'about 3 min left']);
  });
});

// ---------- Videos and sounds ----------

const MiB = 1024 * 1024;
const track = { str: null, decodes: true, bps: null, cpt: true };
/** A video's facts: `w`×`h`, `seconds` long, `size` bytes, with an AAC sound unless told otherwise. */
const video = (w: number, h: number, seconds: number, size: number, more: Partial<MediaFacts> = {}): MediaFacts => ({
  box: 'mp4',
  seconds,
  size,
  video: { ...track, codec: 'avc', width: w, height: h, rotation: 0, hdr: false },
  audio: { ...track, codec: 'aac', bps: 128_000, channels: 2, label: null },
  moreAudio: 0,
  subtitles: false,
  ...more,
});
const sound = (seconds: number, size: number, more: Partial<MediaFacts> = {}): MediaFacts => ({
  box: 'wav',
  seconds,
  size,
  video: null,
  audio: { ...track, codec: 'pcm-s16', channels: 2, label: null },
  moreAudio: 0,
  subtitles: false,
  ...more,
});
const CAN: Can = { ok: true, aac: true, opus: true };
const OPUS: Can = { ok: true, aac: false, opus: true };
const ok = (p: CopyPlan | { refuse: string }): CopyPlan => {
  if ('refuse' in p) throw new Error(`refused: ${p.refuse}`);
  return p;
};

describe('a video’s sizes', () => {
  it('are 720p, 480p and 360p by the long side, even, never bigger than the video', () => {
    expect(videoChoices(1920, 1080).map((c) => [c.name, c.width, c.height, c.bps])).toEqual([
      ['Phones', 1280, 720, 2_500_000],
      ['Small', 854, 480, 1_200_000],
      ['Tiny', 640, 360, 600_000],
    ]);
    // Standing up: by its long side too.
    expect(videoChoices(1080, 1920).map((c) => [c.width, c.height])).toEqual([
      [720, 1280],
      [480, 854],
      [360, 640],
    ]);
  });

  it('keep one at the video’s own size: the smallest of those as big as it or bigger (its bitrate suits it best)', () => {
    expect(videoChoices(854, 480).map((c) => [c.name, c.width, c.height])).toEqual([
      ['Small', 854, 480],
      ['Tiny', 640, 360],
    ]);
    expect(videoChoices(700, 394).map((c) => [c.name, c.width, c.height])).toEqual([
      ['Small', 700, 394],
      ['Tiny', 640, 360],
    ]);
    expect(videoChoices(321, 241).map((c) => [c.name, c.width, c.height])).toEqual([['Tiny', 320, 240]]);
  });

  it('come out about (picture + sound) × length / 8, with 3% for the file', () => {
    expect(estimateBytes(2_628_000, 60)).toBe(Math.round(((2_628_000 * 60) / 8) * 1.03));
    // A sound copied as it is costs its own bitrate; another is made again at 128 kbps (96 for one channel).
    expect(soundBps(video(1, 1, 1, 1))).toBe(128_000);
    expect(soundBps(video(1, 1, 1, 1, { audio: { ...track, codec: 'opus', bps: 64_000, channels: 2, label: null } }))).toBe(64_000);
    expect(soundBps(video(1, 1, 1, 1, { audio: { ...track, codec: 'mp3', bps: 320_000, channels: 2, label: null } }))).toBe(128_000);
    expect(soundBps(video(1, 1, 1, 1, { audio: { ...track, codec: 'ac3', bps: null, channels: 1, label: null } }))).toBe(96_000);
    expect(soundBps(video(1, 1, 1, 1, { audio: null }))).toBe(0);
  });
});

describe('videoOptions: which size is picked', () => {
  const opts = { fileBytes: 90 * MiB, playable: true };

  it('the biggest under 0.9 × 16 MB; else the biggest under 0.9 × what the server takes; else the smallest, still too big', () => {
    // 1 minute: 720p is about 20 MB, 480p about 10.
    const minute = video(1920, 1080, 60, 400 * MiB);
    const a = videoOptions(minute, 60, opts);
    if ('refuse' in a) throw new Error('refused');
    expect(a.choices[a.pick].name).toBe('Small');
    expect(a.tooBig).toBe(false);
    // 10 minutes: none under 14.4 MB; 720p is under 0.9 × 900 MB.
    const b = videoOptions(video(1920, 1080, 600, 4000 * MiB), 600, { ...opts, fileBytes: 900 * MiB });
    if ('refuse' in b) throw new Error('refused');
    expect([b.choices[b.pick].name, b.tooBig]).toEqual(['Phones', false]);
    // A server that takes 16 MB, and an hour: even 360p is over.
    const c = videoOptions(video(1920, 1080, 3600, 8000 * MiB), 3600, { ...opts, fileBytes: 16 * MiB });
    if ('refuse' in c) throw new Error('refused');
    expect([c.choices[c.pick].name, c.tooBig]).toEqual(['Tiny', true]);
    expect(c.choices.every((x) => x.estimate > 0.9 * SLOW_FILE_BYTES)).toBe(true);
  });

  it('leaves out sizes not much smaller than the file (under 0.8 of it), unless phones can’t play it as it is', () => {
    // 60 s at 3 Mbps is 22.5 MB: 720p (about 20 MB) is left out.
    const lean = video(1280, 720, 60, 22.5 * MiB);
    const a = videoOptions(lean, 60, opts);
    if ('refuse' in a) throw new Error('refused');
    expect(a.choices.map((x) => x.name)).toEqual(['Small', 'Tiny']);
    const all = videoOptions(lean, 60, { ...opts, playable: false });
    if ('refuse' in all) throw new Error('refused');
    expect(all.choices.map((x) => x.name)).toEqual(['Phones', 'Small', 'Tiny']);
    // None smaller enough: nothing to make.
    expect(videoOptions(video(640, 360, 60, 4 * MiB), 60, opts)).toEqual({ refuse: NOT_MUCH_SMALLER });
  });

  it('the part the cards play counts: its estimates are for that part', () => {
    const a = videoOptions(video(1280, 720, 100, 100 * MiB), 10, opts);
    if ('refuse' in a) throw new Error('refused');
    expect(a.choices[0].estimate).toBe(estimateBytes(2_500_000 + 128_000, 10));
  });

  it('refuses a file it can’t read, one with no picture, or one this browser can’t decode', () => {
    expect(videoOptions({ ...video(1, 1, 1, 1), box: null }, 1, opts)).toEqual({ refuse: CANT_READ_FILE });
    expect(videoOptions(video(1, 1, 1, 1, { video: null }), 1, opts)).toEqual({ refuse: NO_PICTURE });
    const hevc = video(1920, 1080, 60, 400 * MiB);
    hevc.video = { ...hevc.video!, codec: 'hevc', decodes: false };
    expect(videoOptions(hevc, 60, opts)).toEqual({ refuse: CANT_READ_VIDEO });
  });
});

describe('cardSpan: the part of a file its cards play', () => {
  it('runs from the earliest start to the latest stop of every use', () => {
    expect(cardSpan([{ start: 12, end: 20 }, { start: 30, end: 45 }], 92)).toEqual({ span: { from: 12, to: 45 }, ticked: true });
    expect(cardSpan([{ start: 1, end: 3 }], 4)).toEqual({ span: { from: 1, to: 3 }, ticked: true });
    expect(cardSpan([{ end: 30 }], 100)).toEqual({ span: { from: 0, to: 30 }, ticked: true });
  });

  it('runs to the end when one plays to the end (or its Stop at isn’t after its Start at), and isn’t ticked then', () => {
    expect(cardSpan([{ start: 12, end: 20 }, { start: 30 }], 92)).toEqual({ span: { from: 12, to: null }, ticked: false });
    expect(cardSpan([{ start: 12, end: 5 }], 92)).toEqual({ span: { from: 12, to: null }, ticked: false });
    // Stopping at the very end is to the end.
    expect(cardSpan([{ start: 12, end: 91.98 }], 92)).toEqual({ span: { from: 12, to: null }, ticked: false });
  });

  it('is ticked only when the part is under 80% of the file, and when the file’s length is known', () => {
    expect(cardSpan([{ start: 5, end: 84.9 }], 100)?.ticked).toBe(true);
    expect(cardSpan([{ start: 5, end: 85 }], 100)?.ticked).toBe(false);
    expect(cardSpan([{ start: 5, end: 30 }], null)).toEqual({ span: { from: 5, to: 30 }, ticked: false });
  });

  it('is nothing when the cards play all of it, or there are none', () => {
    expect(cardSpan([], 100)).toBeNull();
    expect(cardSpan([{}], 100)).toBeNull();
    expect(cardSpan([{ start: 0.04 }], 100)).toBeNull();
    expect(cardSpan([{ start: 5, end: 30 }, {}], 100)).toBeNull();
  });

  it('is said in minutes and seconds', () => {
    expect([clockText(12), clockText(92), clockText(3723), clockText(59.6)]).toEqual(['0:12', '1:32', '1:02:03', '1:00']);
    expect([clockTenths(12.4), clockTenths(12), clockTenths(1.25)]).toEqual(['0:12.4', '0:12', '0:01.3']);
    expect([lengthText(2.4), lengthText(33), lengthText(92)]).toEqual(['2.4 s', '33 s', '1:32']);
    expect(spanText({ from: 12, to: 45 }, 92)).toBe('0:12 → 0:45 (33 s)');
    expect(spanText({ from: 12, to: null }, 80)).toBe('0:12 → the end (1:08)');
    expect(spanText({ from: 1.5, to: 3 }, null)).toBe('0:01.5 → 0:03 (1.5 s)');
  });
});

describe('planVideoCopy', () => {
  const big = video(1920, 1080, 60, 400 * MiB);
  const [phones, small] = videoChoices(1920, 1080);
  const ALL = { avc: true, vp9: true, vp8: true };

  it('makes an MP4 (H.264) with the AAC sound copied as it is, a key frame every 2 s', () => {
    const p = ok(planVideoCopy(big, CAN, ALL, small, null, true));
    expect(p.run).toEqual({
      box: 'mp4',
      video: { width: 854, height: 480, fit: 'fill', codec: 'avc', bitrate: 1_200_000, keyFrameInterval: 2, forceTranscode: true },
      audio: {},
      copy: { shiftTolerance: 0.1 },
    });
    expect([p.mime, p.ext, p.range]).toEqual(['video/mp4', 'mp4', null]);
    expect(p.out).toEqual({ seconds: 60, width: 854, height: 480, sound: true });
    expect(p.estimate).toBe(estimateBytes(1_200_000 + 128_000, 60));
    expect(p.format).toBe('Made as an MP4 (H.264, AAC), which every phone plays.');
  });

  it('makes another sound AAC for an MP4, at 128 kbps (96 for one channel), 2 channels at most', () => {
    const opus = video(1920, 1080, 60, 400 * MiB, { audio: { ...track, codec: 'opus', bps: null, channels: 6, label: null } });
    expect(ok(planVideoCopy(opus, CAN, ALL, small, null, true)).run.audio).toEqual({ codec: 'aac', bitrate: 128_000, forceTranscode: true, numberOfChannels: 2 });
    const mono = video(1920, 1080, 60, 400 * MiB, { audio: { ...track, codec: 'mp3', bps: null, channels: 1, label: null } });
    expect(ok(planVideoCopy(mono, CAN, ALL, small, null, true)).run.audio).toEqual({ codec: 'aac', bitrate: 96_000, forceTranscode: true });
    expect(ok(planVideoCopy(video(1920, 1080, 60, 1, { audio: null }), CAN, ALL, small, null, true))).toMatchObject({ format: 'Made as an MP4 (H.264), which every phone plays.', out: { sound: false } });
  });

  it('without H.264 (or AAC for its sound): a WebM, VP9 else VP8, its Opus or Vorbis sound copied, else made Opus', () => {
    // (Its AAC sound would be copied into an MP4: H.264 needs no AAC encoder then.)
    expect(ok(planVideoCopy(big, OPUS, ALL, phones, null, true)).run).toMatchObject({ box: 'mp4', video: { codec: 'avc' }, audio: {} });
    const p = ok(planVideoCopy(big, OPUS, { avc: false, vp9: true, vp8: true }, phones, null, true));
    expect(p.run).toMatchObject({ box: 'webm', video: { codec: 'vp9', width: 1280, height: 720 }, audio: { codec: 'opus', bitrate: 128_000 } });
    expect([p.mime, p.ext]).toEqual(['video/webm', 'webm']);
    expect(p.format).toMatch(/^Made as a WebM \(VP9, Opus\)\. This browser makes WebM videos: some iPhones may not play them\./);
    const vorbis = video(1920, 1080, 60, 1, { audio: { ...track, codec: 'vorbis', bps: null, channels: 2, label: null } });
    expect(ok(planVideoCopy(vorbis, OPUS, { avc: false, vp9: false, vp8: true }, phones, null, true)).run).toMatchObject({ video: { codec: 'vp8' }, audio: {} });
    // A sound it can't make Opus of, or no video encoder at all.
    expect(planVideoCopy(big, { ok: true, aac: true, opus: false }, { avc: false, vp9: true, vp8: true }, phones, null, true)).toEqual({ refuse: CANT_MAKE_SOUND });
    expect(planVideoCopy(big, CAN, { avc: false, vp9: false, vp8: false }, phones, null, true)).toEqual({ refuse: NO_ENCODER });
    // A sound no browser here reads (an MKV's Dolby Digital): the copy goes without it, not not at all.
    const ac3 = video(1280, 720, 10, 1, { box: 'mkv', video: { ...track, codec: 'vp9', width: 1280, height: 720, rotation: 0, hdr: false }, audio: { ...track, codec: 'ac3', decodes: false, cpt: false, bps: 448_000, channels: 6, label: null } });
    const silent = ok(planVideoCopy(ac3, OPUS, { avc: false, vp9: true, vp8: true }, phones, null, false));
    expect(silent.run).toMatchObject({ box: 'webm', video: { codec: 'vp9' }, audio: { discard: true } });
    expect(silent.out.sound).toBe(false);
    expect(silent.format).toBe(`Made as a WebM (VP9). ${WEBM_NOTE} It goes without its sound: AC-3 (Dolby Digital), which this browser can’t read.`);
    // (Its sound isn't in the size either.)
    expect(silent.estimate).toBe(ok(planVideoCopy({ ...ac3, audio: null }, OPUS, { avc: false, vp9: true, vp8: true }, phones, null, false)).estimate);
    // Where H.264 is made, an MP4 without it: every phone plays that.
    expect(ok(planVideoCopy(ac3, OPUS, ALL, phones, null, false)).run).toMatchObject({ box: 'mp4', video: { codec: 'avc' }, audio: { discard: true } });
    // An AAC this browser can't decode is still copied into the MP4, as before.
    const aacHere = video(1280, 720, 10, 1, { audio: { ...track, codec: 'aac', decodes: false, bps: 128_000, channels: 2, label: null } });
    expect(ok(planVideoCopy(aacHere, OPUS, ALL, phones, null, true)).run).toMatchObject({ box: 'mp4', audio: {} });
    expect(planVideoCopy(big, { ok: false, aac: false, opus: false, why: NO_WEBCODECS }, ALL, phones, null, true)).toEqual({ refuse: NO_WEBCODECS });
  });

  it('holds only the part the cards play when asked: trimmed there, as long as that part', () => {
    const p = ok(planVideoCopy(big, CAN, ALL, small, { from: 12, to: 45 }, true));
    expect(p.run.trim).toEqual({ start: 12, end: 45 });
    expect([p.out.seconds, p.range]).toEqual([33, { from: 12, to: 45 }]);
    expect(p.estimate).toBe(estimateBytes(1_200_000 + 128_000, 33));
    const end = ok(planVideoCopy(big, CAN, ALL, small, { from: 12, to: null }, true));
    expect([end.run.trim, end.out.seconds]).toEqual([{ start: 12 }, 48]);
  });

  it('at most 30 frames a second', () => {
    const fast = { ...big, video: { ...big.video!, fps: 60 } };
    expect(ok(planVideoCopy(fast, CAN, ALL, small, null, true)).run.video?.frameRate).toBe(30);
    const film = { ...big, video: { ...big.video!, fps: 24 } };
    expect(ok(planVideoCopy(film, CAN, ALL, small, null, true)).run.video).not.toHaveProperty('frameRate');
  });
});

describe('planSoundCopy', () => {
  it('makes AAC in an M4A where it can, else Opus in an OGG, at 128 kbps (96 for one channel)', () => {
    const p = ok(planSoundCopy(sound(60, 10 * MiB), CAN, null, true));
    expect(p.run).toEqual({ box: 'm4a', audio: { codec: 'aac', bitrate: 128_000, forceTranscode: true } });
    expect([p.mime, p.ext, p.estimate, p.format]).toEqual(['audio/mp4', 'm4a', estimateBytes(128_000, 60), 'Made as an M4A (AAC), which every phone plays.']);
    const o = ok(planSoundCopy(sound(60, 10 * MiB, { audio: { ...track, codec: 'flac', channels: 1, label: null } }), OPUS, null, false));
    expect(o.run).toEqual({ box: 'ogg', audio: { codec: 'opus', bitrate: 96_000, forceTranscode: true } });
    expect([o.mime, o.ext, o.format]).toEqual(['audio/ogg', 'ogg', `Made as an OGG (Opus). ${OPUS_NOTE}`]);
    expect(planSoundCopy(sound(60, 10 * MiB), { ok: true, aac: false, opus: false }, null, true)).toEqual({ refuse: NO_ENCODER });
  });

  it('leaves a picture out, keeps 2 channels at most, and holds only the part the cards play when asked', () => {
    const withArt = sound(60, 10 * MiB, { video: { ...track, codec: 'avc', width: 300, height: 300, rotation: 0, hdr: false }, audio: { ...track, codec: 'flac', channels: 6, label: null } });
    const p = ok(planSoundCopy(withArt, CAN, { from: 3, to: 20 }, true));
    expect(p.run).toEqual({ box: 'm4a', video: { discard: true }, audio: { codec: 'aac', bitrate: 128_000, forceTranscode: true, numberOfChannels: 2 }, trim: { start: 3, end: 20 } });
    expect(p.out).toEqual({ seconds: 17, sound: true });
  });

  it('is offered over 1 MB when it comes out under 0.75 of the sound, or whenever phones can’t play the sound', () => {
    // An MP3 of 128 kbps would come out as big.
    const mp3 = sound(120, 120 * 16_000, { box: 'mp3', audio: { ...track, codec: 'mp3', channels: 2, label: null } });
    expect(planSoundCopy(mp3, CAN, null, true)).toEqual({ refuse: NOT_MUCH_SMALLER });
    expect(planSoundCopy(sound(5, 900_000), CAN, null, true)).toEqual({ refuse: NOT_MUCH_SMALLER });
    expect(planSoundCopy(sound(5, 900_000), CAN, null, false)).not.toHaveProperty('refuse');
    // Only part of it: that part's size counts.
    expect(planSoundCopy(mp3, CAN, { from: 0, to: 20 }, true)).not.toHaveProperty('refuse');
  });

  it('a sound the app can’t decode is decoded by the browser instead, 15 minutes at most', () => {
    const odd = sound(60, 10 * MiB, { audio: { ...track, codec: 'ac3', decodes: false, channels: 2, label: null } });
    expect(ok(planSoundCopy(odd, CAN, null, false)).here).toEqual({ codec: 'aac', bitrate: 128_000 });
    expect(ok(planSoundCopy({ ...odd, box: null, audio: null, seconds: null }, CAN, null, false))).toMatchObject({ here: { codec: 'aac' }, estimate: 0, out: { seconds: null } });
    expect(planSoundCopy({ ...odd, seconds: 16 * 60 }, CAN, null, false)).toEqual({ refuse: SOUND_TOO_LONG });
    expect(ok(planSoundCopy(sound(60, 10 * MiB), CAN, null, true))).not.toHaveProperty('here');
  });
});

describe('avDefault: a file’s copy as made unasked (several at once)', () => {
  it('holds the part the cards play when that’s ticked, at the size picked', () => {
    const r: AvRead = {
      kind: 'video',
      facts: video(1920, 1080, 60, 400 * MiB),
      can: CAN,
      playable: true,
      span: { span: { from: 10, to: 20 }, ticked: true },
      enc: { '1280×720': { avc: true, vp9: true, vp8: true }, '854×480': { avc: true, vp9: true, vp8: true }, '640×360': { avc: true, vp9: true, vp8: true } },
    };
    expect(ok(avDefault(r, 90 * MiB))).toMatchObject({ range: { from: 10, to: 20 }, out: { seconds: 10, width: 1280, height: 720 } });
    expect(ok(avDefault({ ...r, span: { ...r.span!, ticked: false } }, 90 * MiB))).toMatchObject({ range: null, out: { width: 854 } });
    expect(ok(avDefault({ ...r, kind: 'audio', facts: sound(60, 10 * MiB) }, 90 * MiB))).toMatchObject({ mime: 'audio/mp4', range: { from: 10, to: 20 } });
  });
});

// ---------- 🔄 Convert (card-files spec §4.12.6) ----------
describe('how 🔄 Convert makes a file that plays here', () => {
  const t = (codec: string, o: Partial<TrackFacts> = {}): TrackFacts => ({ codec, str: codec, decodes: true, bps: 200_000, cpt: true, ...o });
  const pic = (codec: string, o: Partial<TrackFacts> = {}) => ({ ...t(codec, o), width: 1280, height: 720, rotation: 0 as const, hdr: false });
  const snd = (codec: string, o: Partial<TrackFacts> & { channels?: number } = {}) => ({ ...t(codec, o), channels: o.channels ?? 2, label: null });
  const facts = (box: MediaFacts['box'], video: MediaFacts['video'], audio: MediaFacts['audio'], o: Partial<MediaFacts> = {}): MediaFacts => ({
    box,
    seconds: 10,
    size: 1_000_000,
    video,
    audio,
    moreAudio: 0,
    subtitles: false,
    ...o,
  });
  const CHROMIUM: Can = { ok: true, aac: false, opus: true };
  const ENC: Encoders = { avc: false, vp9: true, vp8: true };
  const refused = { opens: 'no' as const, picture: null, sound: 'unsure' as const };
  /** The fix verdict() finds for a file (playable.ts), then its plan. */
  const planFor = (f: MediaFacts, kind: 'video' | 'audio', mime: string, can = CHROMIUM, enc = ENC) => {
    const v = verdict(f, can, kind, mime, enc);
    const fix = v.is === 'plays' ? v.repack : v.is === 'unknown' ? null : v.fix;
    if (!fix) throw new Error(`no fix: ${JSON.stringify(v)}`);
    return planConvert(f, fix, can, kind);
  };

  it('a quick fix copies every track as it is, forced: never re-encoded behind the host’s back', () => {
    const p = planFor(facts('mkv', pic('vp9'), snd('opus'), { element: { opens: 'yes', picture: true, sound: 'yes' } }), 'video', 'video/x-matroska');
    expect(p).toMatchObject({ run: { box: 'webm', copy: { mode: 'forced', shiftTolerance: 0.1 } }, mime: 'video/webm', copied: true, cut: null, label: 'Repackaged a video as WebM (nothing lost)' });
    expect(p.run.video).toBeUndefined();
    expect(p.run.audio).toBeUndefined();
    expect(p.out).toEqual({ seconds: 10, width: 1280, height: 720, sound: true });
    expect(p.format).toBe('WebM (VP9, Opus)');
  });

  it('a MOV goes in an MP4, a VP9 MKV in a WebM, and MP3 in an MPEG-TS in an MP4 (a video) or an MP3 (a sound)', () => {
    const mov = facts('mov', pic('vp9'), snd('aac', { cpt: false, decodes: false }), { element: { opens: 'yes', picture: true, sound: 'yes' } });
    expect(planFor(mov, 'video', 'video/quicktime').run.box).toBe('mp4');
    const mkv = facts('mkv', pic('vp9'), snd('vorbis'), { element: { opens: 'yes', picture: true, sound: 'yes' } });
    expect(planFor(mkv, 'video', 'video/x-matroska').run.box).toBe('webm');
    const ts = facts('ts', null, snd('mp3'), { element: refused });
    expect([planFor(ts, 'video', 'video/mp2t'), planFor(ts, 'audio', 'video/mp2t')].map((p) => [p.run.box, p.mime, p.format, p.label])).toEqual([
      ['mp4', 'video/mp4', 'MP4 (MP3)', 'Repackaged a video as MP4 (nothing lost)'],
      ['mp3', 'audio/mpeg', 'MP3 (MP3)', 'Repackaged a sound as MP3 (nothing lost)'],
    ]);
    expect(planFor(ts, 'video', 'video/mp2t').out).toEqual({ seconds: 10, sound: true });
  });

  it('a sound it can’t play is left out (discarded), and its share comes off the size', () => {
    const f = facts('mkv', pic('vp9', { bps: 600_000 }), snd('ac3', { bps: 400_000, decodes: false, cpt: false }), { element: { opens: 'yes', picture: true, sound: 'no' } });
    const p = planFor(f, 'video', 'video/x-matroska');
    expect(p).toMatchObject({ run: { box: 'webm', audio: { discard: true }, copy: { mode: 'forced' } }, copied: true, label: 'Repackaged a video as WebM without its sound', format: 'WebM (VP9, no sound)' });
    expect(p.out.sound).toBe(false);
    // 1 MB, less 10 s at 400 kbps (500 KB).
    expect(p.estimate).toBe(Math.round(1_000_000 * 1.01 - 500_000));
    // A sound whose own rate the file doesn't say: the file's 800 kbps less the picture's 600 (250 KB for 10 s).
    const unsaid = facts('mkv', pic('vp9', { bps: 600_000 }), snd('ac3', { bps: null, decodes: false, cpt: false }), { element: { opens: 'yes', picture: true, sound: 'no' } });
    expect(planFor(unsaid, 'video', 'video/x-matroska').estimate).toBe(Math.round(1_000_000 * 1.01 - 250_000));
  });

  it('a sound file with a picture in it (an MP3’s cover) leaves the picture out', () => {
    const f = facts('ts', pic('vp9'), snd('mp3'), { element: refused });
    expect(planFor(f, 'audio', 'video/mp2t').run.video).toEqual({ discard: true });
  });

  it('a track made again: this browser’s codec, at the picture’s own size, a key frame every 2 s; the sound at 128 or 96 kbps', () => {
    // (HEVC this browser decodes but doesn't play: VP9, in a WebM since the sound is Opus.)
    const f = facts('mp4', pic('hevc', { cpt: false, bps: 4_000_000 }), snd('opus'), { element: { opens: 'yes', picture: false, sound: 'yes' } });
    const p = planFor(f, 'video', 'video/mp4');
    expect(p.run).toEqual({
      box: 'webm',
      video: { codec: 'vp9', bitrate: videoBitrate(1280, 720, 'vp9', { bps: 4_000_000, w: 1280, h: 720, codec: 'hevc' }), keyFrameInterval: 2, forceTranscode: true },
      copy: {},
    });
    expect([p.copied, p.label, p.format]).toEqual([false, 'Converted a video to WebM', 'WebM (VP9, Opus)']);
    // Its size, about: the picture at its new rate and the sound at its own, 10 s.
    expect(p.estimate).toBe(estimateBytes(p.run.video!.bitrate! + 200_000, 10));
    // Uncompressed sound in a MOV that doesn't play: Opus (96 kbps for one channel), the picture kept.
    const pcm = facts('mov', pic('vp9'), snd('pcm-s16', { cpt: false, channels: 1 }), { element: { opens: 'yes', picture: true, sound: 'no' } });
    const q = planFor(pcm, 'video', 'video/quicktime');
    expect([q.run.box, q.run.video, q.run.audio, q.label]).toEqual(['webm', undefined, { codec: 'opus', bitrate: 96_000, forceTranscode: true }, 'Converted a video to WebM']);
  });

  it('says what else to know: another sound track, subtitles, an HDR picture made again', () => {
    const f = facts('mp4', { ...pic('hevc', { cpt: false }), hdr: true }, { ...snd('opus'), label: 'English' }, { moreAudio: 1, subtitles: true, element: { opens: 'yes', picture: false, sound: 'yes' } });
    expect(planFor(f, 'video', 'video/mp4').notes).toEqual([
      'It has 2 sound tracks: the converted file keeps “English” only.',
      'Its subtitles aren’t kept.',
      'It’s an HDR video (iPhones film in HDR): converting it may make its colors look a little dull.',
    ]);
  });

  it('a picture’s bitrate for the show: 8 Mbps at 1080p, 5 at 720p, by its pixels, a fifth less for VP9, never past what the source has', () => {
    expect([videoBitrate(1920, 1080, 'avc'), videoBitrate(1280, 720, 'avc'), videoBitrate(854, 480, 'avc'), videoBitrate(640, 360, 'avc')]).toEqual([8_000_000, 5_000_000, 2_223_958, 1_250_000]);
    expect(videoBitrate(1280, 720, 'vp9')).toBe(4_000_000);
    expect(videoBitrate(320, 180, 'avc')).toBe(1_200_000);
    // A 2 Mbps source: 2.2 Mbps at most (3 Mbps from HEVC to H.264); never under 300 kbps.
    expect(videoBitrate(1280, 720, 'vp9', { bps: 2_000_000, w: 1280, h: 720, codec: 'vp9' })).toBe(2_200_000);
    expect(videoBitrate(1280, 720, 'avc', { bps: 2_000_000, w: 1280, h: 720, codec: 'hevc' })).toBe(3_000_000);
    expect(videoBitrate(1280, 720, 'avc', { bps: 50_000, w: 1280, h: 720, codec: 'avc' })).toBe(300_000);
  });

  it('History’s words: what it is and what it became, never its name', () => {
    expect(convertLabel('video', { video: 'keep', audio: 'keep', box: 'mp4' })).toBe('Repackaged a video as MP4 (nothing lost)');
    expect(convertLabel('video', { video: 'keep', audio: 'drop', box: 'webm' })).toBe('Repackaged a video as WebM without its sound');
    expect(convertLabel('video', { video: 'encode', audio: 'drop', box: 'webm' })).toBe('Converted a video to WebM without its sound');
    expect(convertLabel('audio', { audio: 'encode', box: 'ogg' })).toBe('Converted a sound to OGG');
    expect(convertLabel('audio', { audio: 'keep', box: 'm4a' })).toBe('Repackaged a sound as M4A (nothing lost)');
  });
});

describe('✎ Edit: what an edit makes', () => {
  const t = (codec: string, o: Partial<TrackFacts> = {}): TrackFacts => ({ codec, str: codec, decodes: true, bps: 1_000_000, cpt: true, ...o });
  const pic = (codec: string, o: Partial<TrackFacts> & { width?: number; height?: number; fps?: number } = {}) => ({
    ...t(codec, { bps: 20_000_000, ...o }),
    width: o.width ?? 1920,
    height: o.height ?? 1080,
    rotation: 0 as const,
    hdr: false,
    ...(o.fps ? { fps: o.fps } : {}),
  });
  const snd = (codec: string, o: Partial<TrackFacts> & { channels?: number } = {}) => ({ ...t(codec, { bps: 128_000, ...o }), channels: o.channels ?? 2, label: null });
  const facts = (box: MediaFacts['box'], video: MediaFacts['video'], audio: MediaFacts['audio'], o: Partial<MediaFacts> = {}): MediaFacts => ({
    box,
    seconds: 10,
    size: 10_000_000,
    video,
    audio,
    moreAudio: 0,
    subtitles: false,
    ...o,
  });
  const CHROMIUM: Can = { ok: true, aac: false, opus: true };
  const WINDOWS: Can = { ok: true, aac: true, opus: true };
  const VP: Encoders = { avc: false, vp9: true, vp8: true };
  const AVC: Encoders = { avc: true, vp9: true, vp8: true };
  const edit = (f: MediaFacts, o: Partial<FileEdit> = {}): FileEdit => ({ ...noEdit(f), ...o });
  const plan = (f: MediaFacts, e: Partial<FileEdit>, o: { can?: Can; enc?: Encoders; key?: number | null; kind?: 'video' | 'audio' } = {}) => {
    const p = planEdit(f, edit(f, e), o.can ?? CHROMIUM, o.enc ?? VP, o.key ?? null, o.kind ?? 'video');
    if ('refuse' in p) throw new Error(`refused: ${p.refuse}`);
    return p;
  };
  const refusal = (f: MediaFacts, e: Partial<FileEdit>, o: { can?: Can; enc?: Encoders; key?: number | null; kind?: 'video' | 'audio' } = {}) => {
    const p = planEdit(f, edit(f, e), o.can ?? CHROMIUM, o.enc ?? VP, o.key ?? null, o.kind ?? 'video');
    return 'refuse' in p ? p.refuse : null;
  };
  const mp4 = facts('mp4', pic('avc'), snd('aac'));
  const webm = facts('webm', pic('vp9'), snd('opus'));

  it('a trim alone copies every track: no picture or sound options, a tenth of a second’s shift allowed', () => {
    const p = plan(mp4, { start: 1.2, end: 3 });
    expect(p.run).toEqual({ box: 'mp4', trim: { start: 1.2, end: 3 }, copy: { shiftTolerance: 0.1 } });
    expect([p.copied, p.cut, p.mime, p.format]).toEqual([true, { from: 1.2, to: 3, length: 10 }, 'video/mp4', 'MP4 (H.264, AAC)']);
    expect(p.out).toEqual({ seconds: 1.8, width: 1920, height: 1080, sound: true });
    // (Cut only at the end: no end in the trim when it's kept to the end.)
    expect(plan(mp4, { start: 2 }).run.trim).toEqual({ start: 2 });
    // A MOV's trim copies too, into an MP4.
    expect(plan(facts('mov', pic('hevc'), snd('aac')), { start: 1, end: 4 }).run).toEqual({ box: 'mp4', trim: { start: 1, end: 4 }, copy: { shiftTolerance: 0.1 } });
  });

  it('a WebM cut within a tenth of a second of a key frame copies; else the picture is made again, or a quick trim starts at the key frame', () => {
    expect(plan(webm, { start: 1.05 }, { key: 1 }).copied).toBe(true);
    const exact = plan(webm, { start: 1.3, end: 2.5 }, { key: 1 });
    expect(exact).toMatchObject({ copied: false, cut: { from: 1.3, to: 2.5 }, run: { box: 'webm', trim: { start: 1.3, end: 2.5 }, video: { codec: 'vp9', width: 1920, height: 1080, forceTranscode: true, bitrateMode: 'variable' } } });
    expect(exact.run.audio).toBeUndefined();
    const quick = plan(webm, { start: 1.3, end: 2.5, quick: true }, { key: 1 });
    expect(quick).toMatchObject({ copied: true, cut: { from: 1, to: 2.5, length: 10 }, run: { trim: { start: 1, end: 2.5 } }, out: { seconds: 1.5 } });
    expect(quick.run.video).toBeUndefined();
    // (Where the quick trim would start, and when the window waits for the key frame.)
    expect(quickTrimAt(webm, edit(webm, { start: 1.3 }), 1, 'video', CHROMIUM)).toBe(1);
    expect(quickTrimAt(webm, edit(webm, { start: 1.05 }), 1, 'video', CHROMIUM)).toBeNull();
    expect(quickTrimAt(mp4, edit(mp4, { start: 1.3 }), 1, 'video', CHROMIUM)).toBeNull();
    expect([needsKey(webm, edit(webm, { start: 1.3 }), 'video', CHROMIUM), needsKey(webm, edit(webm, { end: 5 }), 'video', CHROMIUM), needsKey(mp4, edit(mp4, { start: 1 }), 'video', CHROMIUM)]).toEqual([true, false, false]);
    // An MKV of WebM's codecs goes in a WebM, and is cut the same way.
    expect(plan(facts('mkv', pic('vp9'), snd('opus')), { start: 1.3 }, { key: 1 }).run.box).toBe('webm');
  });

  it('a crop is in even pixels of the picture as shown, inside it, 16 px at least; all of it is no crop', () => {
    expect(cropPixels(mp4, { crop: { x: 0.25, y: 0.1, w: 0.5, h: 0.5 } })).toEqual({ left: 480, top: 108, width: 960, height: 540 });
    expect(cropPixels(mp4, { crop: { x: 0.1001, y: 0, w: 0.3333, h: 1 } })).toEqual({ left: 192, top: 0, width: 640, height: 1080 });
    expect(cropPixels(mp4, { crop: { x: 0.999, y: 0.999, w: 0.001, h: 0.001 } })).toEqual({ left: 1904, top: 1064, width: 16, height: 16 });
    expect(cropPixels(mp4, { crop: { x: 0, y: 0, w: 1, h: 1 } })).toBeNull();
    expect(cropPixels(mp4, { crop: null })).toBeNull();
  });

  it('sizes never make it bigger, and go by the cropped picture’s short side', () => {
    expect(outputSize(mp4, edit(mp4, { short: 720 }))).toEqual({ w: 1280, h: 720 });
    expect(outputSize(mp4, edit(mp4, { short: 360 }))).toEqual({ w: 640, h: 360 });
    const small = facts('webm', pic('vp9', { width: 854, height: 480 }), null);
    expect(outputSize(small, edit(small, { short: 720 }))).toEqual({ w: 854, h: 480 });
    // A square crop of 854×480 is 480×480; at 360p, 360×360.
    const square = { crop: { x: 187 / 854, y: 0, w: 480 / 854, h: 1 } };
    expect(outputSize(small, edit(small, square))).toEqual({ w: 480, h: 480 });
    expect(outputSize(small, edit(small, { ...square, short: 360 }))).toEqual({ w: 360, h: 360 });
    expect(isNoEdit(edit(small, { short: 1080 }), small)).toBe(true);
    expect(isNoEdit(edit(small, { short: 360 }), small)).toBe(false);
  });

  it('a size in percent goes by the cropped picture whatever its shape, even both ways, never bigger nor under 16 px', () => {
    expect(outputSize(mp4, edit(mp4, { scale: 50 }))).toEqual({ w: 960, h: 540 });
    // (A phone's upright video, and an odd shape a preset's short side wouldn't suit.)
    const upright = facts('mp4', pic('avc', { width: 1080, height: 1920 }), null);
    expect(outputSize(upright, edit(upright, { scale: 50 }))).toEqual({ w: 540, h: 960 });
    const small = facts('webm', pic('vp9', { width: 854, height: 480 }), null);
    expect(outputSize(small, edit(small, { scale: 33 }))).toEqual({ w: 282, h: 158 });
    const square = { crop: { x: 187 / 854, y: 0, w: 480 / 854, h: 1 } };
    expect(outputSize(small, edit(small, { ...square, scale: 50 }))).toEqual({ w: 240, h: 240 });
    // A percent wins over a short side; 100 or more, or none, is the picture as it is.
    expect(outputSize(mp4, edit(mp4, { short: 360, scale: 50 }))).toEqual({ w: 960, h: 540 });
    expect(outputSize(mp4, edit(mp4, { scale: 100 }))).toEqual({ w: 1920, h: 1080 });
    expect(outputSize(mp4, edit(mp4, { scale: 150 }))).toEqual({ w: 1920, h: 1080 });
    expect(outputSize(mp4, edit(mp4, { scale: 1 }))).toEqual({ w: 20, h: 16 });
    expect(isNoEdit(edit(small, { scale: 50 }), small)).toBe(false);
    expect(isNoEdit(edit(small, { scale: 99.9 }), small)).toBe(true);
    expect(isNoEdit(edit(small, { scale: 100 }), small)).toBe(true);
    // Made at that size, and History says so.
    expect(plan(mp4, { scale: 50 }).run.video).toMatchObject({ width: 960, height: 540 });
    expect(editLabel('video', edit(mp4, { scale: 50 }), mp4, 'all')).toBe('Edited a video (scaled to 50%)');
  });

  it('a crop or a size makes the picture again: H.264 with AAC in an MP4 where it can, else VP9 in a WebM, or in an MP4 beside a sound it copies', () => {
    const avc = plan(mp4, { short: 720 }, { can: WINDOWS, enc: AVC });
    expect(avc.run).toMatchObject({ box: 'mp4', video: { codec: 'avc', width: 1280, height: 720, fit: 'fill', keyFrameInterval: 2, bitrate: 5_000_000 } });
    // (Never more a pixel than the file itself has: 1 Mbps at 1080p is 0.49 Mbps at 720p.)
    expect(plan(facts('mp4', pic('avc', { bps: 1_000_000 }), snd('aac')), { short: 720 }, { can: WINDOWS, enc: AVC }).run.video?.bitrate).toBe(488_889);
    expect([avc.run.audio, avc.format, avc.notes]).toEqual([undefined, 'MP4 (H.264, AAC)', []]);
    // No H.264 here, an AAC sound it can't make again: VP9 in an MP4, the AAC copied.
    const vp9mp4 = plan(mp4, { short: 720 });
    expect([vp9mp4.run.box, vp9mp4.run.video?.codec, vp9mp4.run.audio, vp9mp4.format]).toEqual(['mp4', 'vp9', undefined, 'MP4 (VP9, AAC)']);
    expect(vp9mp4.notes).toContain(VP9_IN_MP4);
    // Silent: a WebM, saying some iPhones may not play it.
    const silent = plan(mp4, { short: 720, sound: false });
    expect([silent.run.box, silent.run.audio, silent.mime, silent.format]).toEqual(['webm', { discard: true }, 'video/webm', 'WebM (VP9, no sound)']);
    expect(silent.notes).toContain(WEBM_EDIT_NOTE);
    // A WebM stays one, with no note; the crop goes in as pixels.
    const crop = plan(webm, { crop: { x: 0.25, y: 0, w: 0.5, h: 1 } });
    expect(crop.run).toMatchObject({ box: 'webm', video: { crop: { left: 480, top: 0, width: 960, height: 1080 }, width: 960, height: 1080 } });
    expect([crop.notes, crop.aspect]).toEqual([[], { was: 16 / 9, now: 960 / 1080 }]);
    // H.264 goes with AAC: an Opus sound becomes AAC where it can be made.
    expect(plan(webm, { short: 720 }, { can: WINDOWS, enc: AVC }).run).toMatchObject({ box: 'mp4', video: { codec: 'avc' }, audio: { codec: 'aac', bitrate: 128_000 } });
    // Where it can't (an H.264 encoder but no AAC one, as Chrome on Linux): VP9 in a WebM, the Opus copied as it is.
    const noAac = plan(webm, { short: 720 }, { can: CHROMIUM, enc: AVC });
    expect([noAac.run.box, noAac.run.video?.codec, noAac.run.audio, noAac.format]).toEqual(['webm', 'vp9', undefined, 'WebM (VP9, Opus)']);
    // Over 61 frames a second: 60.
    expect(plan(facts('mp4', pic('avc', { fps: 120 }), null), { short: 720 }).run.video?.frameRate).toBe(60);
    expect(plan(mp4, { short: 720 }).run.video?.frameRate).toBeUndefined();
  });

  it('says when the picture can’t be made again here', () => {
    expect(refusal(mp4, { short: 720 }, { can: { ok: false, aac: false, opus: false } })).toBe(NO_REENCODE_HERE);
    expect(refusal(facts('mp4', pic('hevc', { decodes: false }), snd('aac')), { short: 720 })).toBe(cantReencode('hevc'));
    expect(refusal(mp4, { short: 720 }, { enc: { avc: false, vp9: false, vp8: false } })).toBe(CANT_SIZE);
    expect(refusal(mp4, { start: 2, end: 2.05 })).toBe(TOO_SHORT);
    expect(refusal(facts(null, null, null), {})).toBe(CANT_READ_EDIT);
    // (A trim needs nothing made: it works without WebCodecs.)
    expect(refusal(mp4, { start: 2 }, { can: { ok: false, aac: false, opus: false } })).toBeNull();
  });

  it('a sound is copied when its file type holds it, made again when it can be, else refused; left out when unticked', () => {
    // PCM in a MOV: Opus in a WebM (beside VP9 made again).
    const pcm = facts('mov', pic('vp9'), snd('pcm-s16', { channels: 1 }));
    expect(plan(pcm, { short: 720 }).run).toMatchObject({ box: 'webm', audio: { codec: 'opus', bitrate: 96_000, forceTranscode: true } });
    // H.264 + Vorbis in an MKV, trimmed: an MP4, the Vorbis made again (Opus here, AAC where there's AAC).
    const vorbis = facts('mkv', pic('avc'), snd('vorbis'));
    expect(plan(vorbis, { start: 1 }).run).toMatchObject({ box: 'mp4', audio: { codec: 'opus' } });
    expect(plan(vorbis, { start: 1 }, { can: WINDOWS }).run).toMatchObject({ box: 'mp4', audio: { codec: 'aac' } });
    expect(plan(vorbis, { start: 1 }).copied).toBe(false);
    // One it can't decode: refused, saying what to do.
    expect(refusal(facts('mkv', pic('avc'), snd('vorbis', { decodes: false })), { start: 1 })).toBe(cantSound('vorbis', 'mp4'));
    expect(cantSound('aac', 'webm')).toBe('This browser can’t re-encode its sound (AAC) for a WebM: untick Keep its sound, or edit it in Chrome or Edge on Windows or Mac.');
    expect(plan(mp4, { start: 1, sound: false }).run.audio).toEqual({ discard: true });
  });

  it('a sound file keeps its own type, its trim always copied (moved by two of its pieces at most); a picture in it is left out', () => {
    const mp3 = facts('mp3', null, snd('mp3'), { size: 1_000_000 });
    // (An MP3 can't start partway into a piece, nor before its start: it starts at the first piece in the part kept.)
    expect(plan(mp3, { start: 3, end: 8 }, { kind: 'audio' })).toMatchObject({
      run: { box: 'mp3', video: { discard: true }, trim: { start: 3, end: 8 }, copy: { shiftTolerance: 0.2, boundaryPolicy: 'shrink' } },
      mime: 'audio/mpeg',
      copied: true,
      format: 'MP3 (MP3)',
      out: { seconds: 5, sound: true },
    });
    const boxes = [facts('wav', null, snd('pcm-s16')), facts('ogg', null, snd('opus')), facts('webm', null, snd('opus')), facts('adts', null, snd('aac')), facts('flac', null, snd('flac'))].map(
      (f) => [plan(f, { start: 1 }, { kind: 'audio' }).run.box, plan(f, { start: 1 }, { kind: 'audio' }).mime],
    );
    expect(boxes).toEqual([
      ['wav', 'audio/wav'],
      ['ogg', 'audio/ogg'],
      ['ogg', 'audio/ogg'],
      ['m4a', 'audio/mp4'],
      ['flac', 'audio/flac'],
    ]);
    // A video file with no picture stays a video file (its sound alone, moved by two pieces at most).
    expect(plan(facts('mp4', null, snd('aac')), { start: 1 }).mime).toBe('video/mp4');
    expect(plan(facts('mp4', null, snd('aac')), { start: 1 }).run.copy).toEqual({ shiftTolerance: 0.2 });
    expect(plan(facts('flac', null, snd('flac')), { start: 1 }, { kind: 'audio' }).run.copy).toEqual({ shiftTolerance: 0.2 });
    // A sound file with a picture (an MP3's cover) too: the picture is left out.
    expect(plan(facts('mp4', pic('avc'), snd('aac')), { start: 1 }, { kind: 'audio' }).run.copy).toEqual({ shiftTolerance: 0.2 });
    // Uncompressed sound is made again as it was: cut to the sample, nothing lost.
    const pcm = plan(facts('wav', null, snd('pcm-s16')), { start: 1, end: 3 }, { kind: 'audio' });
    expect([pcm.run.audio, pcm.copied, pcm.format]).toEqual([{ codec: 'pcm-s16', forceTranscode: true }, true, 'WAV (PCM (uncompressed))']);
  });

  it('its size, about: the part kept of the file as it is, less a sound left out; else the rates it’s made at', () => {
    expect(plan(mp4, { start: 2, end: 7 }).estimate).toBe(Math.round(10_000_000 * 0.5 * 1.01));
    // Without its 128 kbps sound: 5 s less 80 KB.
    expect(plan(mp4, { start: 2, end: 7, sound: false }).estimate).toBe(Math.round(10_000_000 * 0.5 * 1.01 - (128_000 * 5) / 8));
    // Made again: the picture's new rate and the sound's own, for the 5 s.
    const p = plan(mp4, { start: 2, end: 7, short: 720 }, { can: WINDOWS, enc: AVC });
    expect(p.estimate).toBe(estimateBytes(p.run.video!.bitrate! + 128_000, 5));
    // A WebM that says neither track's rate (most don't), trimmed to 0–7 of 9 s without its sound: about the 7 s of
    // the file less 128 kbps of sound, not a twentieth of it.
    const unsaid = facts('webm', pic('vp9', { bps: null }), snd('opus', { bps: null }), { seconds: 9, size: 25_900_000 });
    const silent = plan(unsaid, { end: 7, sound: false });
    const near = (25_900_000 * 7) / 9 - (128_000 * 7) / 8;
    expect(Math.abs(silent.estimate - near) / near).toBeLessThan(0.1);
    // (Kept, the sound beside a picture made again is charged about 128 kbps, not the whole file's rate.)
    const crop = plan(unsaid, { end: 7, short: 360 });
    expect(crop.estimate).toBe(estimateBytes(crop.run.video!.bitrate! + 128_000, 7));
    // (A sound left out of a file whose picture's rate is said: the file's rate less the picture's.)
    const said = facts('webm', pic('vp9', { bps: 20_000_000 }), snd('opus', { bps: null }), { seconds: 10, size: 25_200_000 });
    expect(plan(said, { end: 5, sound: false }).estimate).toBe(Math.round(25_200_000 * 0.5 * 1.01 - (160_000 * 5) / 8));
    // Over 2 GB: a pack can't hold it.
    const big = facts('mp4', pic('avc'), snd('aac'), { size: 3 * 1024 ** 3 });
    expect(plan(big, { start: 1 }).notes.at(-1)).toMatch(/^About 2\.\d GB: a \.brainrot pack this big can’t be opened again \(2 GB at most\)\.$/);
  });

  it('says what else to know: another sound track, subtitles, an HDR picture made again', () => {
    const f = facts('mp4', { ...pic('avc'), hdr: true }, { ...snd('aac'), label: 'English' }, { moreAudio: 1, subtitles: true });
    expect(plan(f, { short: 720 }, { can: WINDOWS, enc: AVC }).notes).toEqual([
      'It has 2 sound tracks: the edited file keeps “English” only.',
      'Its subtitles aren’t kept.',
      'It’s an HDR video (iPhones film in HDR): re-encoding may make its colors look a little dull.',
    ]);
    // (Trimmed only, the picture isn't made again.)
    expect(plan(f, { start: 1 }).notes).not.toContain('It’s an HDR video (iPhones film in HDR): re-encoding may make its colors look a little dull.');
  });

  it('History’s words: what was done and to what, never a name', () => {
    expect(plan(mp4, { start: 1.2, end: 3 }).labels).toEqual({
      all: 'Trimmed a video to 0:01–0:03',
      item: 'Edited a video for one slide item (trimmed to 0:01–0:03)',
      new: 'Saved an edited copy of a video (trimmed to 0:01–0:03)',
    });
    expect(editLabel('video', edit(mp4, { start: 1, end: 3, crop: { x: 0.25, y: 0, w: 0.5, h: 1 }, short: 720, sound: false }), mp4, 'all')).toBe(
      'Edited a video (trimmed to 0:01–0:03, cropped, 720p, without its sound)',
    );
    expect(editLabel('video', edit(mp4, { short: 480 }), mp4, 'all')).toBe('Edited a video (480p)');
    const wav = facts('wav', null, snd('pcm-s16'), { seconds: 30 });
    expect(editLabel('audio', edit(wav, { start: 3, end: 20 }), wav, 'all')).toBe('Trimmed a sound to 0:03–0:20');
    // (Less than 0.05 s off either end isn't a trim.)
    expect(editLabel('video', edit(mp4, { start: 0.04, short: 480 }), mp4, 'all')).toBe('Edited a video (480p)');
    // A quick trim names where it really starts.
    expect(plan(webm, { start: 1.3, end: 2.5, quick: true }, { key: 1 }).label).toBe('Trimmed a video to 0:01–0:03');
  });

  it('nothing changed is no edit (a sound that won’t play here left out is none)', () => {
    expect(isNoEdit(noEdit(mp4), mp4)).toBe(true);
    expect(isNoEdit(edit(mp4, { start: 0.03, end: 9.98 }), mp4)).toBe(true);
    expect(isNoEdit(edit(mp4, { end: 9 }), mp4)).toBe(false);
    expect(isNoEdit(edit(mp4, { sound: false }), mp4)).toBe(false);
    expect(noEdit(mp4, true).sound).toBe(false);
    expect(isNoEdit(noEdit(mp4, true), mp4, true)).toBe(true);
  });

  it('times: typed, and shown', () => {
    expect(['12', '12.4', '1:02', '1:02.5', '0:5', '1:02:03', ' 3,5 ', '1:75', 'abc', '', '-1'].map(parseClock)).toEqual([12, 12.4, 62, 62.5, 5, 3723, 3.5, null, null, null, null]);
    expect([clockTenths(12.44, true), clockTenths(1, true), clockTenths(61.25), clockTenths(61)]).toEqual(['0:12.4', '0:01.0', '1:01.3', '1:01']);
    expect([clockText(12.4), clockText(92), clockText(3723)]).toEqual(['0:12', '1:32', '1:02:03']);
  });

  it('an edited copy’s name: “(edited)” and its own type’s extension', () => {
    expect([editedName('Clip.mkv', 'video/webm'), editedName('Intro', 'audio/mpeg'), editedName('a.b.mp4', 'video/mp4')]).toEqual(['Clip (edited).webm', 'Intro (edited).mp3', 'a.b (edited).mp4']);
  });
});
