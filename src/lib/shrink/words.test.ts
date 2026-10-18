import { describe, expect, it } from 'vitest';
import type { Verdict, Why } from './playable';
import { ADVICE, advice, aOrAn, boxName, codecName, fixBoxName, rowText, shortWhy, tracksOf, whyLine, whyText } from './words';

const fails = (why: Omit<Why, 'kind'> & { kind?: Why['kind'] }, fix: Extract<Verdict, { is: 'fails' }>['fix'] = null): Verdict => ({ is: 'fails', fix, why: { kind: 'video', ...why } });
const silent = (why: Omit<Why, 'kind'>, fix: Extract<Verdict, { is: 'silent' }>['fix'] = null): Verdict => ({ is: 'silent', fix, why: { kind: 'video', ...why } });

describe('why a file doesn’t play here, in words', () => {
  it('its file type, when every track is fine', () => {
    expect(whyText(fails({ box: 'ts', fine: { sound: 'mp3' } }, { audio: 'keep', box: 'mp4' }))).toBe('this browser can’t open MPEG-TS files, but its sound (MP3) is fine');
    expect(whyText(fails({ box: 'ts', fine: { video: 'avc', sound: 'aac' } }, { video: 'keep', audio: 'keep', box: 'mp4' }))).toBe(
      'this browser can’t open MPEG-TS files, but its video (H.264) and sound (AAC) are fine',
    );
    expect(whyText(fails({ box: 'mkv', kind: 'audio', fine: { sound: 'opus' } }, { audio: 'keep', box: 'ogg' }))).toBe('this browser can’t open MKA files, but its sound (Opus) is fine');
  });

  it('its picture, saying “or convert” when the app can’t fix it either', () => {
    expect(whyText(fails({ video: 'hevc', fine: { sound: 'aac' } }, { video: 'encode', audio: 'keep', box: 'mp4', to: { video: 'avc' } }))).toBe('its video is HEVC (H.265), which this browser can’t play');
    expect(whyText(fails({ video: 'hevc', cant: 'undecodable' }))).toBe('its video is HEVC (H.265), which this browser can’t play or convert');
    expect(whyText(fails({ video: null, cant: 'undecodable' }))).toBe('its video is in a format this browser can’t play or convert');
  });

  it('its sound, saying “or convert” when it’s left out or nothing fixes it; a sound file’s is “it’s”', () => {
    expect(whyText(silent({ sound: 'ac3', fine: { video: 'vp9' } }, { video: 'keep', audio: 'drop', box: 'webm' }))).toBe('its sound is AC-3 (Dolby Digital), which this browser can’t play or convert');
    expect(whyText(silent({ sound: 'pcm-s16' }, { video: 'keep', audio: 'encode', box: 'webm', to: { audio: 'opus' } }))).toBe('its sound is PCM (uncompressed), which this browser can’t play');
    expect(whyText(fails({ kind: 'audio', sound: 'ac3', cant: 'undecodable' }))).toBe('it’s AC-3 (Dolby Digital), which this browser can’t play or convert');
    expect(whyText(fails({ kind: 'audio', sound: 'eac3', cant: 'undecodable' }))).toBe('it’s E-AC-3 (Dolby Digital Plus), which this browser can’t play or convert');
    expect(whyText(fails({ kind: 'audio', sound: 'pcm-s16' }, { audio: 'encode', box: 'ogg', to: { audio: 'opus' } }))).toBe('it’s PCM (uncompressed), which this browser can’t play');
  });

  it('several, joined with “, and ”', () => {
    expect(whyText(fails({ box: 'ts', sound: 'ac3', fine: { video: 'avc' } }, { video: 'keep', audio: 'drop', box: 'mp4' }))).toBe(
      'this browser can’t open MPEG-TS files, and its sound is AC-3 (Dolby Digital), which this browser can’t play or convert',
    );
    expect(whyText(fails({ video: 'avc', sound: 'aac', cant: 'undecodable' }))).toBe('its video is H.264, which this browser can’t play or convert, and its sound is AAC, which this browser can’t play or convert');
  });

  it('nothing for a file that plays, or one the app can’t read', () => {
    expect(whyText({ is: 'plays', repack: null })).toBe('');
    expect(whyText({ is: 'unknown' })).toBe('');
    expect(advice({ is: 'unknown' })).toBe('');
    expect(whyLine({ is: 'plays', repack: { video: 'keep', audio: 'keep', box: 'webm' } })).toBe('');
  });
});

describe('what the host can do about it', () => {
  it('nothing to add when the app fixes it all', () => {
    expect(advice(fails({ box: 'ts', fine: { sound: 'mp3' } }, { audio: 'keep', box: 'mp4' }))).toBe('');
    expect(advice(fails({ video: 'hevc' }, { video: 'encode', box: 'mp4' }))).toBe('');
  });

  it('a picture nothing here fixes: HEVC, ProRes, another', () => {
    expect(advice(fails({ video: 'hevc', cant: 'undecodable' }))).toBe(
      ' Convert it to MP4 (H.264) with a video app first (HandBrake is free). On an iPhone, Settings › Camera › Formats › Most Compatible films clips every browser plays.',
    );
    expect(advice(fails({ video: 'prores', cant: 'prores' }))).toBe(' It’s an editing format: export it from your video editor as MP4 (H.264).');
    expect(advice(fails({ video: 'avc', sound: 'aac', cant: 'undecodable' }))).toBe(' Convert it to MP4 (H.264) with a video app first (HandBrake is free).');
  });

  it('a sound alone, a sound left out, a silent one nothing fixes, no WebCodecs', () => {
    expect(advice(fails({ kind: 'audio', sound: 'ac3', cant: 'undecodable' }))).toBe(' Convert it to MP3 or M4A with an audio or video app first.');
    // (A video file with no picture in it is a sound alone too.)
    expect(advice(fails({ sound: 'dts', cant: 'undecodable' }))).toBe(ADVICE.sound);
    expect(advice(silent({ sound: 'ac3', fine: { video: 'vp9' } }, { video: 'keep', audio: 'drop', box: 'webm' }))).toBe(' To keep its sound, convert it with a video app first (HandBrake is free).');
    expect(advice(silent({ sound: 'ac3', fine: { video: 'vp9' }, cant: 'undecodable' }))).toBe(' To hear its sound, convert it with a video app first (HandBrake is free).');
    expect(advice(fails({ video: 'hevc', cant: 'no-webcodecs' }))).toBe(' Converting it needs Chrome, Edge, Firefox or the desktop app, with the app opened from a file or an https:// address.');
    expect(advice(silent({ sound: 'pcm-s16', cant: 'no-webcodecs' }, { video: 'keep', audio: 'drop', box: 'webm' }))).toBe(ADVICE.webcodecs);
  });

  it('as sentences, for a title', () => {
    expect(whyLine(silent({ sound: 'ac3', fine: { video: 'vp9' } }, { video: 'keep', audio: 'drop', box: 'webm' }))).toBe(
      'Its sound is AC-3 (Dolby Digital), which this browser can’t play or convert. To keep its sound, convert it with a video app first (HandBrake is free).',
    );
    expect(whyLine(fails({ box: 'ts', fine: { sound: 'mp3' } }, { audio: 'keep', box: 'mp4' }))).toBe('This browser can’t open MPEG-TS files, but its sound (MP3) is fine.');
  });
});

describe('names', () => {
  it('codecs, file types and their articles', () => {
    expect(['avc', 'hevc', 'vp8', 'vp9', 'av1', 'prores', 'aac', 'mp3', 'opus', 'vorbis', 'flac', 'ac3', 'eac3', 'dts', 'pcm-f32', 'ulaw'].map(codecName)).toEqual([
      'H.264',
      'HEVC (H.265)',
      'VP8',
      'VP9',
      'AV1',
      'ProRes',
      'AAC',
      'MP3',
      'Opus',
      'Vorbis',
      'FLAC',
      'AC-3 (Dolby Digital)',
      'E-AC-3 (Dolby Digital Plus)',
      'DTS',
      'PCM (uncompressed)',
      'PCM (uncompressed)',
    ]);
    expect(codecName(null)).toBeNull();
    expect([boxName('mkv'), boxName('mkv', 'audio'), boxName('mp4', 'audio'), boxName('mov'), boxName('ts'), boxName('adts'), boxName('webm')]).toEqual(['MKV', 'MKA', 'M4A', 'MOV', 'MPEG-TS', 'AAC', 'WebM']);
    expect(['mp4', 'webm', 'm4a', 'ogg', 'mp3', 'wav'].map((b) => aOrAn(fixBoxName(b as Parameters<typeof fixBoxName>[0])))).toEqual(['an MP4', 'a WebM', 'an M4A', 'an OGG', 'an MP3', 'a WAV']);
    expect([aOrAn('MKV'), aOrAn('MOV'), aOrAn('MPEG-TS'), aOrAn('FLAC')]).toEqual(['an MKV', 'a MOV', 'an MPEG-TS', 'a FLAC']);
  });
});

describe('🔄 Convert’s rows, and a slide item’s note', () => {
  it('a repackage: nothing lost, in seconds', () => {
    expect(rowText(fails({ box: 'mkv', fine: { video: 'avc', sound: 'aac' } }, { video: 'keep', audio: 'keep', box: 'mp4' }))).toBe(
      'This browser can’t open MKV files, but its video (H.264) and sound (AAC) are fine: it can be repackaged as an MP4 in seconds, with nothing lost.',
    );
    expect(rowText({ is: 'plays', repack: { video: 'keep', audio: 'keep', box: 'webm' } }, 'MKV')).toBe(
      'It plays in this browser, but the phones’ 🤫 cards can’t open MKV files: it can be repackaged as a WebM in seconds, with nothing lost.',
    );
  });

  it('without its sound: the picture loses nothing, and how to keep the sound', () => {
    expect(rowText(silent({ sound: 'ac3', fine: { video: 'vp9' } }, { video: 'keep', audio: 'drop', box: 'webm' }))).toBe(
      'Its sound is AC-3 (Dolby Digital), which this browser can’t play or convert, so it plays without sound. It can be repackaged as a WebM without its sound in seconds: the picture loses nothing. To keep its sound, convert it with a video app first (HandBrake is free).',
    );
    expect(rowText(fails({ box: 'ts', sound: 'ac3', fine: { video: 'avc' } }, { video: 'keep', audio: 'drop', box: 'mp4' }))).toBe(
      'This browser can’t open MPEG-TS files, and its sound is AC-3 (Dolby Digital), which this browser can’t play or convert. It can be repackaged as an MP4 without its sound in seconds: the picture loses nothing. To keep its sound, convert it with a video app first (HandBrake is free).',
    );
  });

  it('made again: what it becomes, and what happens to its sound', () => {
    expect(rowText(fails({ video: 'hevc', fine: { sound: 'aac' } }, { video: 'encode', audio: 'keep', box: 'mp4', to: { video: 'avc' } }))).toBe(
      'Its video is HEVC (H.265), which this browser can’t play. It can be converted to an MP4 (H.264): that takes a while, at a little less quality. Its sound is kept as it is.',
    );
    expect(rowText(fails({ video: 'hevc', sound: 'pcm-s16' }, { video: 'encode', audio: 'encode', box: 'mp4', to: { video: 'avc', audio: 'aac' } }))).toMatch(/Its sound becomes AAC\.$/);
    expect(rowText(silent({ sound: 'pcm-s16', fine: { video: 'vp9' } }, { video: 'keep', audio: 'encode', box: 'webm', to: { audio: 'opus' } }))).toBe(
      'Its sound is PCM (uncompressed), which this browser can’t play: it can be converted to Opus, keeping the picture as it is.',
    );
    expect(rowText(fails({ kind: 'audio', sound: 'ac3' }, { audio: 'encode', box: 'm4a', to: { audio: 'aac' } }))).toBe(
      'It’s AC-3 (Dolby Digital), which this browser can’t play: it can be converted to an M4A (AAC).',
    );
  });

  it('nothing to do: why, and what to do', () => {
    expect(rowText(fails({ kind: 'audio', sound: 'ac3', cant: 'undecodable' }))).toBe('It’s AC-3 (Dolby Digital), which this browser can’t play or convert. Convert it to MP3 or M4A with an audio or video app first.');
    expect(rowText({ is: 'plays', repack: null })).toBe('');
  });

  it('a slide item’s note: why in a few words', () => {
    expect(shortWhy(fails({ video: 'hevc', cant: 'undecodable' }))).toBe('its video is HEVC (H.265)');
    expect(shortWhy(fails({ kind: 'audio', sound: 'ac3', cant: 'undecodable' }))).toBe('it’s AC-3 (Dolby Digital)');
    expect(shortWhy(fails({ box: 'ts', fine: { sound: 'mp3' } }, { audio: 'keep', box: 'mp4' }))).toBe('it’s an MPEG-TS file');
    expect(shortWhy(silent({ sound: 'ac3' }))).toBe('AC-3 (Dolby Digital)');
  });

  it('what a fix keeps', () => {
    expect([tracksOf({ video: 'keep', audio: 'keep', box: 'mp4' }), tracksOf({ video: 'keep', audio: 'drop', box: 'webm' }), tracksOf({ video: 'keep', box: 'webm' }), tracksOf({ audio: 'keep', box: 'mp3' })]).toEqual([
      'video and sound',
      'video',
      'video',
      'sound',
    ]);
  });
});
