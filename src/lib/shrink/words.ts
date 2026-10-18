// What the app says about a video or sound that doesn't play in this browser (card-files spec §4.12.7): why, in plain
// words (its file type, its picture's or sound's codec), and what the host can do about it. Pure, so every string is
// tested. 🖼 Media and the editor may name the file around these; these words never do.
import type { Box } from './facts';
import { isPcm } from './facts';
import type { FixBox, Verdict } from './playable';

/** Codecs by mediabunny's names. */
export const CODEC_NAME: Record<string, string> = {
  avc: 'H.264',
  hevc: 'HEVC (H.265)',
  vp8: 'VP8',
  vp9: 'VP9',
  av1: 'AV1',
  prores: 'ProRes',
  aac: 'AAC',
  mp3: 'MP3',
  opus: 'Opus',
  vorbis: 'Vorbis',
  flac: 'FLAC',
  ac3: 'AC-3 (Dolby Digital)',
  eac3: 'E-AC-3 (Dolby Digital Plus)',
  dts: 'DTS',
};

/** "HEVC (H.265)"; null: one the app doesn't know. */
export const codecName = (c: string | null | undefined): string | null => (!c ? null : (CODEC_NAME[c] ?? (isPcm(c) ? 'PCM (uncompressed)' : c.toUpperCase())));

const BOX_NAME: Record<Box, string> = { mp4: 'MP4', mov: 'MOV', mkv: 'MKV', webm: 'WebM', ts: 'MPEG-TS', ogg: 'OGG', mp3: 'MP3', wav: 'WAV', flac: 'FLAC', adts: 'AAC' };
/** A file type by what's in it: "MKV" ("MKA" for a sound; an MP4 sound is an "M4A"). */
export const boxName = (box: Box, kind: 'video' | 'audio' = 'video'): string => (kind === 'audio' && box === 'mkv' ? 'MKA' : kind === 'audio' && box === 'mp4' ? 'M4A' : BOX_NAME[box]);
/** The file type a fix makes: "MP4", "M4A", "WebM". */
export const fixBoxName = (box: FixBox): string => ({ mp4: 'MP4', webm: 'WebM', m4a: 'M4A', ogg: 'OGG', mp3: 'MP3', flac: 'FLAC', wav: 'WAV' })[box];

/** Names said "an …" (as letters, or a vowel first). */
const AN = new Set(['MP4', 'MKV', 'MKA', 'M4A', 'MP3', 'MPEG-TS', 'OGG', 'AAC', 'H.264']);
/** "an MP4", "a WebM". */
export const aOrAn = (name: string): string => `${AN.has(name) ? 'an' : 'a'} ${name}`;

/** "its video is HEVC (H.265), which this browser can't play" (one the app doesn't know: "is in a format this…"). */
const cantPlay = (whose: string, codec: string | null | undefined, or: string): string => {
  const name = codecName(codec);
  return name ? `${whose} ${name}, which this browser can’t play${or}` : `${whose} in a format this browser can’t play${or}`;
};

/**
 * Why a file doesn't play here, in a few words that follow "won't play in this browser: " (none for one that plays,
 * or one the app can't read): its file type, then each track that doesn't play, saying "or convert" when the app
 * can't fix that either.
 */
export function whyText(v: Verdict): string {
  if (v.is !== 'silent' && v.is !== 'fails') return '';
  const { why, fix } = v;
  const parts: string[] = [];
  if (why.box) {
    const opens = `this browser can’t open ${boxName(why.box, why.kind)} files`;
    if (why.video !== undefined || why.sound !== undefined) parts.push(opens);
    else {
      // (Every track is fine: only its file type is the trouble.)
      const fine = [
        ...(why.fine?.video !== undefined ? [`video (${codecName(why.fine.video) ?? 'its format'})`] : []),
        ...(why.fine?.sound !== undefined ? [`sound (${codecName(why.fine.sound) ?? 'its format'})`] : []),
      ];
      parts.push(fine.length ? `${opens}, but its ${fine.join(' and ')} ${fine.length === 1 ? 'is' : 'are'} fine` : opens);
    }
  }
  if (why.video !== undefined) parts.push(cantPlay('its video is', why.video, fix ? '' : ' or convert'));
  if (why.sound !== undefined) parts.push(cantPlay(why.kind === 'audio' ? 'it’s' : 'its sound is', why.sound, !fix || fix.audio === 'drop' ? ' or convert' : ''));
  return parts.join(', and ');
}

export const ADVICE = {
  hevc: ' Convert it to MP4 (H.264) with a video app first (HandBrake is free). On an iPhone, Settings › Camera › Formats › Most Compatible films clips every browser plays.',
  prores: ' It’s an editing format: export it from your video editor as MP4 (H.264).',
  video: ' Convert it to MP4 (H.264) with a video app first (HandBrake is free).',
  sound: ' Convert it to MP3 or M4A with an audio or video app first.',
  dropped: ' To keep its sound, convert it with a video app first (HandBrake is free).',
  silent: ' To hear its sound, convert it with a video app first (HandBrake is free).',
  webcodecs: ' Converting it needs Chrome, Edge, Firefox or the desktop app, with the app opened from a file or an https:// address.',
} as const;

/** What the host can do, after whyText (none when the app can fix it all; it starts with a space). */
export function advice(v: Verdict): string {
  if (v.is !== 'silent' && v.is !== 'fails') return '';
  const { why, fix } = v;
  if (fix && fix.audio !== 'drop') return '';
  if (why.cant === 'no-webcodecs') return ADVICE.webcodecs;
  if (fix) return ADVICE.dropped;
  if (why.video !== undefined) return why.video === 'prores' ? ADVICE.prores : why.video === 'hevc' ? ADVICE.hevc : ADVICE.video;
  // (A sound alone: a sound file, or a video file with no picture in it.)
  if (why.kind === 'audio' || why.fine?.video === undefined) return ADVICE.sound;
  return v.is === 'silent' ? ADVICE.silent : ADVICE.video;
}

/** whyText and advice as sentences, for a title: "Its sound is AC-3 (Dolby Digital), which … first (HandBrake is free)." */
export function whyLine(v: Verdict): string {
  const w = whyText(v);
  return w ? `${w[0].toUpperCase()}${w.slice(1)}.${advice(v)}` : '';
}
