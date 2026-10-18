import { describe, expect, it } from 'vitest';
import type { ElementResult, MediaFacts, TrackFacts } from './facts';
import { needsElementTest } from './facts';
import { boxFor, isLossless, verdict } from './playable';
import type { Can, Encoders } from './probe';

/** A track this browser plays and decodes, unless told otherwise. */
const track = (codec: string | null, o: Partial<TrackFacts> = {}): TrackFacts => ({ codec, str: codec, decodes: true, bps: 1_000_000, cpt: true, ...o });
const pic = (codec: string, o: Partial<TrackFacts> = {}) => ({ ...track(codec, o), width: 160, height: 90, rotation: 0 as const, hdr: false });
const snd = (codec: string, o: Partial<TrackFacts> = {}) => ({ ...track(codec, o), channels: 2, label: null });
const facts = (box: MediaFacts['box'], video: MediaFacts['video'], audio: MediaFacts['audio'], element?: ElementResult): MediaFacts => ({
  box,
  seconds: 4,
  size: 100_000,
  video,
  audio,
  moreAudio: 0,
  subtitles: false,
  ...(element ? { element } : {}),
});
const played = (o: Partial<ElementResult> = {}): ElementResult => ({ opens: 'yes', picture: true, sound: 'yes', ...o });
const refused: ElementResult = { opens: 'no', picture: null, sound: 'unsure' };

// The test Chromium: WebCodecs, VP8 and VP9 (no H.264), Opus (no AAC); it plays no H.264, HEVC, AAC or AC-3.
const CHROMIUM: Can = { ok: true, aac: false, opus: true };
const CHROMIUM_ENC: Encoders = { avc: false, vp9: true, vp8: true };
// Chrome or Edge on Windows or Mac.
const CHROME: Can = { ok: true, aac: true, opus: true };
const CHROME_ENC: Encoders = { avc: true, vp9: true, vp8: true };
// An http:// page: no WebCodecs.
const PLAIN: Can = { ok: false, aac: false, opus: false };

describe('whether a file plays here, and what would fix it', () => {
  it('in the test Chromium: an MKV of VP9 and Opus plays, and a WebM of the same would do for phones', () => {
    const f = facts('mkv', pic('vp9'), snd('opus'), played());
    expect(verdict(f, CHROMIUM, 'video', 'video/x-matroska', CHROMIUM_ENC)).toEqual({ is: 'plays', repack: { video: 'keep', audio: 'keep', box: 'webm' } });
  });

  it('in the test Chromium: an MKV of VP9 and AC-3 plays silently; without its sound it goes in a WebM', () => {
    const f = facts('mkv', pic('vp9'), snd('ac3', { decodes: false, cpt: false }), played({ sound: 'no' }));
    const v = verdict(f, CHROMIUM, 'video', 'video/x-matroska', CHROMIUM_ENC);
    expect(v).toEqual({ is: 'silent', fix: { video: 'keep', audio: 'drop', box: 'webm' }, why: { kind: 'video', sound: 'ac3', fine: { video: 'vp9' } } });
    expect(v.is === 'silent' && v.fix && isLossless(v.fix)).toBe(true);
  });

  it('in the test Chromium: MP3 in an MPEG-TS doesn’t open; the same sound goes in an MP4 (a video) or an MP3 (a sound)', () => {
    const f = facts('ts', null, snd('mp3'), refused);
    const why = { box: 'ts', fine: { sound: 'mp3' } };
    expect(verdict(f, CHROMIUM, 'video', 'video/mp2t', CHROMIUM_ENC)).toEqual({ is: 'fails', fix: { audio: 'keep', box: 'mp4' }, why: { kind: 'video', ...why } });
    expect(verdict(f, CHROMIUM, 'audio', 'video/mp2t', CHROMIUM_ENC)).toEqual({ is: 'fails', fix: { audio: 'keep', box: 'mp3' }, why: { kind: 'audio', ...why } });
  });

  it('in the test Chromium: an AC-3 sound alone can’t be fixed', () => {
    const f = facts('mkv', null, snd('ac3', { decodes: false, cpt: false }), refused);
    expect(verdict(f, CHROMIUM, 'audio', 'audio/x-matroska', CHROMIUM_ENC)).toEqual({ is: 'fails', fix: null, why: { kind: 'audio', sound: 'ac3', cant: 'undecodable' } });
  });

  it('in the test Chromium: an MKV of H.264 and AAC can’t be fixed (no file made of it would play here either)', () => {
    const f = facts('mkv', pic('avc', { decodes: false, cpt: false }), snd('aac', { decodes: false, cpt: false }), refused);
    expect(verdict(f, CHROMIUM, 'video', 'video/x-matroska', CHROMIUM_ENC)).toEqual({ is: 'fails', fix: null, why: { kind: 'video', video: 'avc', sound: 'aac', cant: 'undecodable' } });
  });

  it('bytes the app can’t read: unknown (their type alone says), and so is a file with nothing in it to judge', () => {
    expect(verdict(facts(null, null, null), CHROMIUM, 'video', 'video/quicktime')).toEqual({ is: 'unknown' });
    expect(verdict(facts('mp4', null, null), CHROMIUM, 'video', 'video/mp4')).toEqual({ is: 'unknown' });
  });

  it('plays: an element that said nothing (8 s) never nags when every track plays; the tracks decide', () => {
    const quiet: ElementResult = { opens: 'unknown', picture: null, sound: 'unsure' };
    expect(verdict(facts('mkv', pic('vp9'), snd('opus'), quiet), CHROMIUM, 'video', 'video/x-matroska').is).toBe('plays');
    // (No element asked: an MP4 or WebM goes by its tracks.)
    expect(verdict(facts('webm', pic('vp9'), snd('opus')), CHROMIUM, 'video', 'video/webm')).toEqual({ is: 'plays', repack: null });
    // The element's word beats canPlayType: an HEVC picture that plays here (its hardware does) plays.
    expect(verdict(facts('mp4', pic('hevc', { cpt: false }), snd('aac'), played()), CHROME, 'video', 'video/mp4', CHROME_ENC)).toEqual({ is: 'plays', repack: null });
    // A sound whose bytes it decoded plays, whatever canPlayType said.
    expect(verdict(facts('mov', pic('avc'), snd('pcm-s16', { cpt: false }), played()), CHROME, 'video', 'video/quicktime', CHROME_ENC)).toEqual({ is: 'plays', repack: null });
  });

  it('repack: only when its own type isn’t one phones take for its kind, or isn’t what it really is; never into FLAC', () => {
    const plays = (box: MediaFacts['box'], v: MediaFacts['video'], a: MediaFacts['audio'], kind: 'video' | 'audio', mime: string) => {
      const r = verdict(facts(box, v, a, played()), CHROME, kind, mime, CHROME_ENC);
      return r.is === 'plays' ? r.repack : r;
    };
    expect(plays('mp4', pic('avc'), snd('aac'), 'video', 'video/mp4')).toBeNull();
    expect(plays('mov', pic('avc'), snd('aac'), 'video', 'video/quicktime')).toEqual({ video: 'keep', audio: 'keep', box: 'mp4' });
    // (A WebM named .mp4: phones would be told the wrong type.)
    expect(plays('webm', pic('vp9'), snd('opus'), 'video', 'video/mp4')).toEqual({ video: 'keep', audio: 'keep', box: 'webm' });
    // A .weba (Opus) becomes an OGG; an .aac an M4A; an .opus file (an OGG named so) an OGG phones take.
    expect(plays('webm', null, snd('opus'), 'audio', 'audio/webm')).toEqual({ audio: 'keep', box: 'ogg' });
    expect(plays('adts', null, snd('aac'), 'audio', 'audio/aac')).toEqual({ audio: 'keep', box: 'm4a' });
    expect(plays('ogg', null, snd('opus'), 'audio', 'audio/opus')).toEqual({ audio: 'keep', box: 'ogg' });
    expect(plays('ogg', null, snd('vorbis'), 'audio', 'audio/ogg')).toBeNull();
    expect(plays('mp3', null, snd('mp3'), 'audio', 'audio/mpeg')).toBeNull();
    expect(plays('wav', null, snd('pcm-s16'), 'audio', 'audio/x-wav')).toBeNull();
    // FLAC: phones take no FLAC, and a FLAC is all it could go in (🗜 makes them a copy).
    expect(plays('flac', null, snd('flac'), 'audio', 'audio/flac')).toBeNull();
    // An M4A added as a video stays a video: its type is a video's.
    expect(plays('mp4', null, snd('aac'), 'video', 'video/mp4')).toBeNull();
  });

  it('silent: its sound made again when it decodes and this browser makes AAC or Opus, in a type that holds both', () => {
    // (PCM in a MOV whose sound didn't play here: Opus, so it stays a WebM with its VP9.)
    const f = facts('mov', pic('vp9'), snd('pcm-s16'), played({ sound: 'no' }));
    expect(verdict(f, CHROMIUM, 'video', 'video/quicktime', CHROMIUM_ENC)).toEqual({
      is: 'silent',
      fix: { video: 'keep', audio: 'encode', box: 'webm', to: { audio: 'opus' } },
      why: { kind: 'video', sound: 'pcm-s16', fine: { video: 'vp9' } },
    });
    // H.264 beside it: AAC, in an MP4.
    const g = facts('mov', pic('avc'), snd('pcm-s16'), played({ sound: 'no' }));
    expect(verdict(g, CHROME, 'video', 'video/quicktime', CHROME_ENC)).toMatchObject({ is: 'silent', fix: { video: 'keep', audio: 'encode', box: 'mp4', to: { audio: 'aac' } } });
  });

  it('silent: an MP4 or WebM that plays silently gains nothing by leaving its sound out', () => {
    const f = facts('webm', pic('vp9'), snd('ac3', { decodes: false, cpt: false }));
    expect(verdict(f, CHROMIUM, 'video', 'video/webm', CHROMIUM_ENC)).toEqual({ is: 'silent', fix: null, why: { kind: 'video', sound: 'ac3', fine: { video: 'vp9' }, cant: 'undecodable' } });
    expect(verdict({ ...f, box: 'mp4' }, CHROMIUM, 'video', 'video/mp4', CHROMIUM_ENC)).toMatchObject({ is: 'silent', fix: null });
  });

  it('fails: PCM in a MOV that its element didn’t play, a sound alone: made again (Opus in an OGG here)', () => {
    const f = facts('mov', null, snd('pcm-s16'), played({ picture: null, sound: 'no' }));
    expect(verdict(f, CHROMIUM, 'audio', 'video/quicktime', CHROMIUM_ENC)).toEqual({
      is: 'fails',
      fix: { audio: 'encode', box: 'ogg', to: { audio: 'opus' } },
      why: { kind: 'audio', sound: 'pcm-s16' },
    });
    // With AAC (Chrome on Windows or Mac): an M4A.
    expect(verdict(f, CHROME, 'audio', 'video/quicktime', CHROME_ENC)).toMatchObject({ fix: { audio: 'encode', box: 'm4a', to: { audio: 'aac' } } });
  });

  it('fails: a picture it decodes but doesn’t play is made again, H.264 with AAC first, else VP9 with Opus', () => {
    const hevc = facts('mp4', pic('hevc', { cpt: false }), snd('aac', { cpt: true }), played({ picture: false }));
    expect(verdict(hevc, CHROME, 'video', 'video/mp4', CHROME_ENC)).toEqual({
      is: 'fails',
      fix: { video: 'encode', audio: 'keep', box: 'mp4', to: { video: 'avc' } },
      why: { kind: 'video', video: 'hevc', fine: { sound: 'aac' } },
    });
    // Opus beside it: VP9 in a WebM (an H.264 picture goes with AAC or MP3 only).
    const opus = facts('mp4', pic('hevc', { cpt: false }), snd('opus'), played({ picture: false }));
    expect(verdict(opus, CHROME, 'video', 'video/mp4', CHROME_ENC)).toMatchObject({ fix: { video: 'encode', audio: 'keep', box: 'webm', to: { video: 'vp9' } } });
    // Both made again, with no H.264 here: VP9 and Opus.
    const both = facts('mp4', pic('hevc', { cpt: false }), snd('pcm-s16', { cpt: false }), played({ picture: false, sound: 'no' }));
    expect(verdict(both, CHROMIUM, 'video', 'video/mp4', CHROMIUM_ENC)).toMatchObject({ fix: { video: 'encode', audio: 'encode', box: 'webm', to: { video: 'vp9', audio: 'opus' } } });
    // An HEVC MP4 that didn't open: its picture is why (MP4s open here).
    expect(verdict(facts('mp4', pic('hevc'), snd('aac'), refused), CHROME, 'video', 'video/mp4', CHROME_ENC)).toMatchObject({ is: 'fails', fix: { video: 'encode', audio: 'keep' }, why: { video: 'hevc' } });
  });

  it('fails: its sound left out beside a picture when it can’t be made again; a TS that doesn’t open says so', () => {
    // (H.264 and AC-3 in a camcorder's .mts, in Chrome on Windows: the picture plays, the file doesn't open.)
    const mts = facts('ts', pic('avc'), snd('ac3', { decodes: false, cpt: false }), refused);
    expect(verdict(mts, CHROME, 'video', 'video/mp2t', CHROME_ENC)).toEqual({
      is: 'fails',
      fix: { video: 'keep', audio: 'drop', box: 'mp4' },
      why: { kind: 'video', box: 'ts', sound: 'ac3', fine: { video: 'avc' } },
    });
  });

  it('fails with no fix: ProRes, no WebCodecs, no encoder', () => {
    const prores = facts('mov', pic('prores', { decodes: false, cpt: false }), snd('aac'), refused);
    expect(verdict(prores, CHROME, 'video', 'video/quicktime', CHROME_ENC)).toEqual({ is: 'fails', fix: null, why: { kind: 'video', video: 'prores', fine: { sound: 'aac' }, cant: 'prores' } });
    const hevc = facts('mp4', pic('hevc', { cpt: false }), snd('aac'), played({ picture: false }));
    expect(verdict(hevc, PLAIN, 'video', 'video/mp4')).toMatchObject({ is: 'fails', fix: null, why: { video: 'hevc', cant: 'no-webcodecs' } });
    expect(verdict(hevc, CHROME, 'video', 'video/mp4', { avc: false, vp9: false, vp8: false })).toMatchObject({ is: 'fails', fix: null, why: { cant: 'no-encoder' } });
    expect(verdict({ ...hevc, video: pic('hevc', { cpt: false, decodes: false }) }, CHROME, 'video', 'video/mp4', CHROME_ENC)).toMatchObject({ fix: null, why: { cant: 'undecodable' } });
  });

  it('with no WebCodecs (an http:// page), copies still fix: a repackage, or a sound left out', () => {
    expect(verdict(facts('ts', null, snd('mp3'), refused), PLAIN, 'audio', 'video/mp2t')).toMatchObject({ is: 'fails', fix: { audio: 'keep', box: 'mp3' } });
    const silent = facts('mkv', pic('vp9'), snd('pcm-s16'), played({ sound: 'no' }));
    // (Its sound could be made again where there's WebCodecs: it says so.)
    expect(verdict(silent, PLAIN, 'video', 'video/x-matroska')).toEqual({
      is: 'silent',
      fix: { video: 'keep', audio: 'drop', box: 'webm' },
      why: { kind: 'video', sound: 'pcm-s16', fine: { video: 'vp9' }, cant: 'no-webcodecs' },
    });
  });

  it('a sound file’s picture (an <audio> shows none) doesn’t count', () => {
    const f = facts('mp4', pic('hevc', { cpt: false, decodes: false }), snd('aac'));
    expect(verdict(f, CHROME, 'audio', 'audio/mp4', CHROME_ENC)).toEqual({ is: 'plays', repack: null });
  });
});

describe('the file type a fix makes', () => {
  it('a sound keeps its family; a video is a WebM when both tracks are WebM’s, else an MP4', () => {
    expect([boxFor('audio', null, 'mp3'), boxFor('audio', null, 'aac'), boxFor('audio', null, 'vorbis'), boxFor('audio', null, 'flac'), boxFor('audio', null, 'pcm-s24')]).toEqual(['mp3', 'm4a', 'ogg', 'flac', 'wav']);
    expect(boxFor('audio', null, 'ac3')).toBeNull();
    expect([boxFor('video', 'vp9', 'opus'), boxFor('video', 'av1', null), boxFor('video', 'vp9', 'aac'), boxFor('video', 'avc', 'opus'), boxFor('video', null, 'mp3')]).toEqual(['webm', 'webm', 'mp4', 'mp4', 'mp4']);
    // (Nothing that plays holds VP9 with PCM, or Vorbis in an MP4.)
    expect(boxFor('video', 'vp9', 'pcm-s16')).toBeNull();
    expect(boxFor('video', 'avc', 'vorbis')).toBeNull();
  });
});

describe('which files only a page element can tell about', () => {
  it('an MKV, MOV or MPEG-TS; an HEVC or AV1 picture; PCM outside a WAV; never a file the app can’t read', () => {
    expect(needsElementTest(facts('mkv', pic('vp9'), snd('opus')))).toBe(true);
    expect(needsElementTest(facts('mov', pic('avc'), snd('aac')))).toBe(true);
    expect(needsElementTest(facts('ts', null, snd('mp3')))).toBe(true);
    expect(needsElementTest(facts('mp4', pic('hevc'), snd('aac')))).toBe(true);
    expect(needsElementTest(facts('webm', pic('av1'), snd('opus')))).toBe(true);
    expect(needsElementTest(facts('mp4', null, snd('pcm-s16')))).toBe(true);
    expect(needsElementTest(facts('mp4', pic('avc'), snd('aac')))).toBe(false);
    expect(needsElementTest(facts('webm', pic('vp9'), snd('opus')))).toBe(false);
    expect(needsElementTest(facts('wav', null, snd('pcm-s16')))).toBe(false);
    expect(needsElementTest(facts('flac', null, snd('flac')))).toBe(false);
    expect(needsElementTest(facts(null, null, null))).toBe(false);
  });
});
