// Making one file from another (card-files spec §4.13.3), in Node: a WAV's sound copied as it is into an M4A needs no
// encoder, so convertBlob's trimming, progress, Stop and refusals are checked here, and readFacts and checkMade with
// it, and 🔄's repackaging (an MKV into a WebM, an MPEG-TS's MP3 into an MP4: tracks copied as they are). Making
// videos (WebCodecs) is checked in the test browser (tests/e2e/phonecopies.mjs, convert.mjs).
import { BufferTarget } from 'mediabunny';
import { describe, expect, it } from 'vitest';
import { readFacts } from './facts';
import { checkMade, convertBlob, discardReason, RunError, type RunPlan } from './run';
import { mux, muxTs } from './testclip';

/** A WAV of `seconds` of a tone: 16-bit, 8 kHz, `channels` of them. */
function wav(seconds: number, channels = 1): Blob {
  const rate = 8000;
  const n = rate * seconds;
  const b = new DataView(new ArrayBuffer(44 + n * channels * 2));
  const text = (at: number, s: string) => [...s].forEach((c, i) => b.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  b.setUint32(4, 36 + n * channels * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  b.setUint32(16, 16, true);
  b.setUint16(20, 1, true);
  b.setUint16(22, channels, true);
  b.setUint32(24, rate, true);
  b.setUint32(28, rate * channels * 2, true);
  b.setUint16(32, channels * 2, true);
  b.setUint16(34, 16, true);
  text(36, 'data');
  b.setUint32(40, n * channels * 2, true);
  for (let i = 0; i < n; i++) for (let c = 0; c < channels; c++) b.setInt16(44 + (i * channels + c) * 2, Math.round(8000 * Math.sin((i / rate) * 2 * Math.PI * 440)), true);
  return new Blob([b.buffer], { type: 'audio/wav' });
}

const ctl = (signal = new AbortController().signal) => {
  const said: number[] = [];
  return { said, ctl: { signal, progress: (p: number) => said.push(p) } };
};
const COPY: RunPlan = { box: 'm4a', copy: { shiftTolerance: 0.1 } };
const opens = async () => ({ opens: true, picture: false });

describe('readFacts', () => {
  it('reads a file’s type, length and tracks by what’s in it', async () => {
    const f = await readFacts(wav(3, 2));
    expect(f).toMatchObject({ box: 'wav', seconds: 3, video: null, moreAudio: 0, subtitles: false });
    expect(f.audio).toMatchObject({ codec: 'pcm-s16', channels: 2, decodes: true });
    // (Its bitrate from its size over its length, header and all.)
    expect(Math.abs(f.audio!.bps! - 256_000)).toBeLessThan(1000);
  });

  it('says it can’t read one that isn’t a media file', async () => {
    expect(await readFacts(new Blob([new Uint8Array(1000).fill(7)]))).toMatchObject({ box: null, seconds: null, size: 1000, video: null, audio: null });
  });
});

describe('convertBlob', () => {
  it('makes the file as planned, only the part asked for, saying how far it got', async () => {
    const { said, ctl: c } = ctl();
    const made = await convertBlob(wav(4), { ...COPY, trim: { start: 1, end: 3 } }, 'audio/mp4', c);
    expect(made.mime).toBe('audio/mp4');
    expect(made.blob.type).toBe('audio/mp4');
    // (A sound copied as it is is cut at its packets: a little more than asked, never less.)
    expect(made.seconds).toBeGreaterThanOrEqual(2);
    expect(made.seconds).toBeLessThan(2.15);
    expect(said.at(-1)).toBe(1);
    expect(await readFacts(made.blob)).toMatchObject({ box: 'mp4', audio: { codec: 'pcm-s16', channels: 1 } });
    // To the end, when no end is given.
    expect(Math.abs((await convertBlob(wav(4), { ...COPY, trim: { start: 1 } }, 'audio/mp4', ctl().ctl)).seconds! - 3)).toBeLessThan(0.15);
  });

  it('stops when asked, with an AbortError', async () => {
    const stop = new AbortController();
    stop.abort();
    await expect(convertBlob(wav(2), COPY, 'audio/mp4', ctl(stop.signal).ctl)).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('turns down a file it can’t read, and a track it can’t make as planned', async () => {
    await expect(convertBlob(new Blob([new Uint8Array(500)]), COPY, 'audio/mp4', ctl().ctl)).rejects.toMatchObject({ name: 'RunError', reason: 'unreadable' });
    // (Node has no Opus encoder.)
    const e = await convertBlob(wav(1), { box: 'ogg', audio: { codec: 'opus', bitrate: 96_000, forceTranscode: true } }, 'audio/ogg', ctl().ctl).catch((x) => x);
    expect(e).toBeInstanceOf(RunError);
    expect(e.reason).toBe('no-encoder');
  });

  it('a track left out as asked isn’t a failure', () => {
    expect([discardReason({ reason: 'discarded_by_user' }), discardReason({ reason: 'max_track_count_of_type_reached' })]).toEqual([null, null]);
    expect([discardReason({ reason: 'undecodable_source_codec' }), discardReason({ reason: 'cannot_copy' })]).toEqual(['undecodable', 'cannot-copy']);
  });
});

describe('checkMade', () => {
  it('passes a file as long as it should be, with its sound, that opens here', async () => {
    const made = await convertBlob(wav(4), { ...COPY, trim: { start: 1, end: 3 } }, 'audio/mp4', ctl().ctl);
    expect(await checkMade(made, { seconds: 2, sound: true }, opens)).toBeNull();
    // Within a quarter second (or 2% of a long one).
    expect(await checkMade(made, { seconds: 2.2, sound: true }, opens)).toBeNull();
  });

  it('fails one too short or long, missing its picture, or one that doesn’t open here', async () => {
    const made = await convertBlob(wav(2), COPY, 'audio/mp4', ctl().ctl);
    expect(await checkMade(made, { seconds: 3, sound: true }, opens)).toMatch(/lasts 2 s, not 3 s/);
    expect(await checkMade(made, { seconds: 2, width: 640, height: 360, sound: true }, opens)).toMatch(/picture is missing/);
    expect(await checkMade({ blob: new Blob([new Uint8Array(100)]), mime: 'audio/mp4' }, { seconds: null, sound: true }, opens)).toMatch(/can’t be read/);
    expect(await checkMade(made, { seconds: 2, sound: true }, async () => ({ opens: false, picture: false }))).toMatch(/doesn’t open/);
  });

  it('fails a video with no sound it should have, or one whose picture doesn’t show here', async () => {
    // (3 s of a 64×36 video, no sound.)
    const t = new BufferTarget();
    await mux('webm', t);
    const made = { blob: new Blob([t.buffer!], { type: 'video/webm' }), mime: 'video/webm' };
    const shows = async () => ({ opens: true, picture: true });
    expect(await checkMade(made, { seconds: 3, width: 64, height: 36, sound: false }, shows)).toBeNull();
    expect(await checkMade(made, { seconds: 3, width: 64, height: 36, sound: true }, shows)).toMatch(/no sound/);
    expect(await checkMade(made, { seconds: 3, width: 64, height: 36, sound: false }, async () => ({ opens: true, picture: false }))).toMatch(/no picture here/);
  });
});

describe('🔄 repackaging: the tracks copied as they are, nothing decoded', () => {
  const FORCED = { mode: 'forced', shiftTolerance: 0.1 } as const;
  const made = async (fill: (t: BufferTarget) => Promise<void>, type: string) => {
    const t = new BufferTarget();
    await fill(t);
    return new Blob([t.buffer!], { type });
  };

  it('an MKV of VP9 and Opus into a WebM', async () => {
    const mkv = await made((t) => mux('mkv', t, true), 'video/x-matroska');
    expect(await readFacts(mkv)).toMatchObject({ box: 'mkv', video: { codec: 'vp9' }, audio: { codec: 'opus' } });
    const out = await convertBlob(mkv, { box: 'webm', copy: FORCED }, 'video/webm', ctl().ctl);
    expect(out).toMatchObject({ mime: 'video/webm', width: 64, height: 36 });
    expect(await readFacts(out.blob)).toMatchObject({ box: 'webm', video: { codec: 'vp9', width: 64, height: 36 }, audio: { codec: 'opus' } });
    // Without its sound: the picture alone.
    const silent = await convertBlob(mkv, { box: 'webm', audio: { discard: true }, copy: FORCED }, 'video/webm', ctl().ctl);
    expect(await readFacts(silent.blob)).toMatchObject({ box: 'webm', video: { codec: 'vp9' }, audio: null });
  });

  it('the MP3 of an MPEG-TS into an MP4, and into an MP3', async () => {
    const ts = await made((t) => muxTs(t, 2), 'video/mp2t');
    expect(await readFacts(ts)).toMatchObject({ box: 'ts', video: null, audio: { codec: 'mp3' } });
    const mp4 = await convertBlob(ts, { box: 'mp4', copy: FORCED }, 'video/mp4', ctl().ctl);
    expect(await readFacts(mp4.blob)).toMatchObject({ box: 'mp4', audio: { codec: 'mp3' } });
    expect(Math.abs(mp4.seconds! - 2)).toBeLessThan(0.1);
    const mp3 = await convertBlob(ts, { box: 'mp3', copy: FORCED }, 'audio/mpeg', ctl().ctl);
    expect(await readFacts(mp3.blob)).toMatchObject({ box: 'mp3', audio: { codec: 'mp3' } });
  });

  it('a track that can’t go in the file type as it is: “it couldn’t be repackaged” (cannot-copy), never made again', async () => {
    const ts = await made((t) => muxTs(t, 1), 'video/mp2t');
    const e = await convertBlob(ts, { box: 'ogg', copy: FORCED }, 'audio/ogg', ctl().ctl).catch((x) => x);
    expect(e).toBeInstanceOf(RunError);
    expect(e.reason).toBe('cannot-copy');
  });

  it('stops when asked, with an AbortError', async () => {
    const stop = new AbortController();
    stop.abort();
    const mkv = await made((t) => mux('mkv', t, true), 'video/x-matroska');
    await expect(convertBlob(mkv, { box: 'webm', copy: FORCED }, 'video/webm', ctl(stop.signal).ctl)).rejects.toMatchObject({ name: 'AbortError' });
  });
});
