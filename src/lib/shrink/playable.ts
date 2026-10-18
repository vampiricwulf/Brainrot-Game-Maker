// Whether a video or sound plays in this browser, from what's inside it (card-files spec §4.12.2): each track's codec
// asked of the browser with its own codec string, and a page element's word where only it can tell (facts.ts). Then
// what would fix one that doesn't: the same picture and sound in a file type this browser opens (quick, nothing
// lost), or a track made again in a codec it plays, or the sound left out. A fix is offered only when what it makes
// plays here. Pure, so it's unit-tested.
import { FILE_TYPES, fileType } from '../buzzproto';
import { isPcm, opensByCodecs, type Box, type MediaFacts } from './facts';
import type { Can, Encoders } from './probe';

/** The file types a fix makes (FLAC is never a fix's: phones don't take it). */
export type FixBox = 'mp4' | 'webm' | 'm4a' | 'ogg' | 'mp3' | 'flac' | 'wav';
/** What's done to a track: copied as it is, made again, or left out. */
export type TrackFix = 'keep' | 'encode' | 'drop';
/**
 * What makes a file that plays here: its picture and sound kept or made again (none: it has none), the file type it
 * goes in, and the codecs it's made again in.
 */
export interface Fix {
  video?: 'keep' | 'encode';
  audio?: TrackFix;
  box: FixBox;
  to?: { video?: 'avc' | 'vp9' | 'vp8'; audio?: 'aac' | 'opus' };
}
/**
 * Why a file doesn't play (all fully): `box`, this browser can't open its file type; `video` and `sound`, the codecs
 * of the tracks it can't play (null: one the app doesn't know); `fine`, those it plays; `cant`, why nothing can fix
 * it here (its picture can't be read, or needs WebCodecs, or an encoder there isn't, or it's ProRes).
 */
export interface Why {
  kind: 'video' | 'audio';
  box?: Box;
  video?: string | null;
  sound?: string | null;
  fine?: { video?: string | null; sound?: string | null };
  cant?: 'undecodable' | 'no-webcodecs' | 'no-encoder' | 'prores';
}
export type Verdict =
  /** mediabunny can't read it: its type alone says (canPlay). */
  | { is: 'unknown' }
  /** It plays. repack: the same picture and sound in a type phones take, when its own type isn't one. */
  | { is: 'plays'; repack: Fix | null }
  /** Its picture plays here, its sound doesn't. */
  | { is: 'silent'; fix: Fix | null; why: Why }
  | { is: 'fails'; fix: Fix | null; why: Why };

/** Nothing is made again: quick, and nothing is lost. */
export const isLossless = (x: Fix): boolean => x.video !== 'encode' && x.audio !== 'encode';

const WEBM_VIDEO = ['vp8', 'vp9', 'av1'];
const WEBM_SOUND = ['opus', 'vorbis'];
/** Sounds an MP4 holds that browsers play in one. */
const MP4_SOUND = ['aac', 'mp3', 'opus', 'flac'];
/** Uncompressed sounds a WAV holds. */
const WAV_SOUND = ['pcm-u8', 'pcm-s16', 'pcm-s24', 'pcm-s32', 'pcm-f32', 'ulaw', 'alaw'];
const NO_ENCODERS: Encoders = { avc: false, vp9: false, vp8: false };

/** The type a fix's file is, for a video or a sound: always of its own kind ('video/mp4' for a video with sound only). */
export const fixMime = (box: FixBox, kind: 'video' | 'audio'): string =>
  ({ mp4: `${kind}/mp4`, webm: 'video/webm', m4a: 'audio/mp4', ogg: 'audio/ogg', mp3: 'audio/mpeg', flac: 'audio/flac', wav: 'audio/wav' })[box];

/**
 * The file type for a picture and a sound (codecs; null: none). A sound file keeps its sound's family (MP3, M4A for
 * AAC, OGG for Opus and Vorbis, FLAC, WAV). A video goes in a WebM when both are WebM's, else an MP4. Null: nothing
 * holds them both.
 */
export function boxFor(kind: 'video' | 'audio', v: string | null, a: string | null): FixBox | null {
  if (kind === 'audio' || !v) {
    if (kind === 'video') return a && WEBM_SOUND.includes(a) ? 'webm' : a && MP4_SOUND.includes(a) ? 'mp4' : null;
    if (a === 'mp3') return 'mp3';
    if (a === 'aac') return 'm4a';
    if (a === 'opus' || a === 'vorbis') return 'ogg';
    if (a === 'flac') return 'flac';
    return a && WAV_SOUND.includes(a) ? 'wav' : null;
  }
  if (WEBM_VIDEO.includes(v) && (!a || WEBM_SOUND.includes(a))) return 'webm';
  return !a || MP4_SOUND.includes(a) ? 'mp4' : null;
}

/** The type names that agree with a file's own type (its content): another name means its name says something else. */
const BOX_TYPES: Record<Box, string[]> = {
  mp4: ['video/mp4', 'audio/mp4'],
  mov: ['video/quicktime', 'video/mp4'],
  mkv: ['video/x-matroska', 'audio/x-matroska'],
  webm: ['video/webm', 'audio/webm'],
  ts: ['video/mp2t'],
  ogg: ['audio/ogg', 'video/ogg', 'audio/opus'],
  mp3: ['audio/mpeg'],
  wav: ['audio/wav'],
  flac: ['audio/flac'],
  adts: ['audio/aac'],
};

/**
 * The codecs a picture and a sound come out in: each kept (`keep`: its own codec), made again (`encode`: this
 * browser's own encoders, H.264 with AAC in an MP4 first, else VP9 or VP8 with Opus in a WebM) or none (null), with
 * the file type that holds them. Null: no such file can be made here.
 */
function codecsFor(
  kind: 'video' | 'audio',
  v: { keep: string } | 'encode' | null,
  a: { keep: string } | 'encode' | null,
  can: Can,
  enc: Encoders,
): { box: FixBox; video?: 'avc' | 'vp9' | 'vp8'; audio?: 'aac' | 'opus' } | null {
  const vs: (string | null)[] = v === null ? [null] : v === 'encode' ? (['avc', 'vp9', 'vp8'] as const).filter((c) => enc[c]) : [v.keep];
  const sounds = (vc: string | null): (string | null)[] => {
    if (a === null) return [null];
    if (a !== 'encode') return [a.keep];
    const made = (['aac', 'opus'] as const).filter((c) => can[c]);
    // (A WebM's picture: Opus first, so it stays a WebM.)
    return vc && WEBM_VIDEO.includes(vc) ? made.reverse() : made;
  };
  for (const vc of vs)
    for (const ac of sounds(vc)) {
      // (A picture made again in H.264 goes with AAC or MP3 only, as phones play it; else VP9 or VP8 come first.)
      if (v === 'encode' && vc === 'avc' && ac && !['aac', 'mp3'].includes(ac) && vs.length > 1) continue;
      const box = boxFor(kind, vc, ac);
      if (box) return { box, ...(v === 'encode' && vc ? { video: vc as 'avc' | 'vp9' | 'vp8' } : {}), ...(a === 'encode' && ac ? { audio: ac as 'aac' | 'opus' } : {}) };
    }
  return null;
}

/** A fix with its codecs worked out (null: none can be made here). */
function fixOf(
  kind: 'video' | 'audio',
  f: MediaFacts,
  video: 'keep' | 'encode' | undefined,
  audio: TrackFix | undefined,
  can: Can,
  enc: Encoders,
): Fix | null {
  const v = video === undefined ? null : video === 'keep' ? { keep: f.video?.codec ?? '' } : 'encode';
  const a = audio === undefined || audio === 'drop' ? null : audio === 'keep' ? { keep: f.audio?.codec ?? '' } : 'encode';
  if (!v && !a) return null;
  const out = codecsFor(kind, v, a, can, enc);
  if (!out) return null;
  const to = { ...(out.video ? { video: out.video } : {}), ...(out.audio ? { audio: out.audio } : {}) };
  return { ...(video ? { video } : {}), ...(audio ? { audio } : {}), box: out.box, ...(to.video || to.audio ? { to } : {}) };
}

/**
 * Whether file `f` (a 'video' or 'audio' file of type `mime` in the game) plays in this browser, and what would fix
 * it: `can` and `enc` say what this browser can make (probe.ts; `enc` at the picture's size). A sound file's picture,
 * if it has one, doesn't count (an <audio> doesn't show it).
 */
export function verdict(f: MediaFacts, can: Can, kind: 'video' | 'audio', mime: string, enc: Encoders = NO_ENCODERS): Verdict {
  const vid = kind === 'video' ? f.video : null;
  const aud = f.audio;
  // (Nothing in it the app can judge: its type alone says.)
  if (!f.box || (!vid && !aud)) return { is: 'unknown' };
  const el = f.element;
  const opens = el?.opens ?? 'yes';
  let vPlays = vid ? (el?.picture ?? vid.cpt) : null;
  let aPlays = aud ? el?.sound === 'yes' || (el?.sound !== 'no' && aud.cpt) : null;
  // A type browsers open by its codecs that didn't open: the codec it was tested for is why.
  const boxFault = opens === 'no' && !opensByCodecs(f.box);
  if (opens === 'no' && !boxFault) {
    if (vid && (vid.codec === 'hevc' || vid.codec === 'av1' || !isPcm(aud?.codec))) vPlays = false;
    else aPlays = false;
  }
  const fine = { ...(vid && vPlays ? { video: vid.codec } : {}), ...(aud && aPlays ? { sound: aud.codec } : {}) };
  const why: Why = {
    kind,
    // (Its file type is why when what matters most in it plays: its picture, or its sound when it has none.)
    ...(boxFault && (vid ? vPlays : aPlays) ? { box: f.box } : {}),
    ...(vid && !vPlays ? { video: vid.codec } : {}),
    ...(aud && aPlays === false ? { sound: aud.codec } : {}),
    ...(Object.keys(fine).length ? { fine } : {}),
  };
  /** Why a track can't be made again here (null: it can). */
  const cantMake = (t: { decodes: boolean; codec: string | null }, encoders: boolean): Why['cant'] | null =>
    t.codec === 'prores' ? 'prores' : !can.ok ? 'no-webcodecs' : !t.decodes ? 'undecodable' : !encoders ? 'no-encoder' : null;
  const soundEncoders = can.aac || can.opus;

  if (opens !== 'no' && vPlays !== false && aPlays !== false) {
    // Its own type isn't one phones take for its kind, or isn't what it really is: the same tracks in one that is.
    const own = (fileType(mime) ?? mime.split(';')[0].trim().toLowerCase()) as string;
    const odd = !fileType(mime)?.startsWith(`${kind}/`) || !BOX_TYPES[f.box].includes(own);
    const fix = odd ? fixOf(kind, f, vid ? 'keep' : undefined, aud ? 'keep' : undefined, can, enc) : null;
    const phones = fix && (FILE_TYPES as readonly string[]).includes(fixMime(fix.box, kind));
    return { is: 'plays', repack: fix && phones ? fix : null };
  }

  if (opens !== 'no' && vPlays === true && aPlays === false && vid && aud) {
    const make = cantMake(aud, soundEncoders);
    let fix = make ? null : fixOf(kind, f, 'keep', 'encode', can, enc);
    // (Left out, the picture still gains a type phones and Safari open; an MP4 or WebM that plays silently gains nothing.)
    if (!fix && f.box !== 'mp4' && f.box !== 'webm') fix = fixOf(kind, f, 'keep', 'drop', can, enc);
    return { is: 'silent', fix, why: make === 'no-webcodecs' || (!fix && make) ? { ...why, cant: make ?? undefined } : why };
  }

  // It doesn't play: each track kept when it plays, else made again when it can be, else (a sound beside a picture) left out.
  let cant: Why['cant'] | undefined;
  let video: 'keep' | 'encode' | undefined;
  if (vid) {
    const make = vPlays ? null : cantMake(vid, enc.avc || enc.vp9 || enc.vp8);
    if (make) return { is: 'fails', fix: null, why: { ...why, cant: make } };
    video = vPlays ? 'keep' : 'encode';
  }
  let audio: TrackFix | undefined;
  if (aud) {
    const make = aPlays ? null : cantMake(aud, soundEncoders);
    if (make && !vid) return { is: 'fails', fix: null, why: { ...why, cant: make } };
    if (make === 'no-webcodecs') cant = make;
    audio = aPlays ? 'keep' : make ? 'drop' : 'encode';
  }
  const fix = fixOf(kind, f, video, audio, can, enc);
  return { is: 'fails', fix, why: { ...why, ...(cant || !fix ? { cant: cant ?? 'no-encoder' } : {}) } };
}
