// What's inside a video or sound file (card-files spec §4.12.1): its file type by its content (not its name), how long
// it is, and its picture and sound tracks: their codecs, size and bitrate, and whether this browser can decode them.
// Read with mediabunny, a few small pieces of the file at a time (never the whole of it). 🗜's dialog shows it, what
// 🗜 made is checked with it before it's put in, and checks.svelte.ts tells from it whether a file plays here: with
// a page element nobody sees, for the file types and codecs where the facts alone can't tell (elementTest).
import type { Input, InputAudioTrack, InputFormat, InputVideoTrack } from 'mediabunny';

const MiB = 1024 * 1024;

/** A file's type, by what's in it. */
export type Box = 'mp4' | 'mov' | 'mkv' | 'webm' | 'ts' | 'ogg' | 'mp3' | 'wav' | 'flac' | 'adts';

/**
 * A track: its codec (mediabunny's name: 'avc', 'vp9', 'aac'…), its full codec string ('avc1.64001f'), whether this
 * browser decodes it, its bitrate (bits a second) and whether an element here says it plays it (canPlayType).
 */
export interface TrackFacts {
  codec: string | null;
  str: string | null;
  decodes: boolean;
  bps: number | null;
  cpt: boolean;
}

export interface MediaFacts {
  /** null: mediabunny can't read it. */
  box: Box | null;
  /** Seconds (null: not known). */
  seconds: number | null;
  size: number;
  /** The main picture: its size as shown (after any rotation), its rotation, HDR or not, and its frames a second when asked. */
  video: (TrackFacts & { width: number; height: number; rotation: 0 | 90 | 180 | 270; hdr: boolean; fps?: number | null }) | null;
  /** The main sound: its channels, and its name or language when it says. */
  audio: (TrackFacts & { channels: number; label: string | null }) | null;
  /** Sound tracks besides the main one. */
  moreAudio: number;
  subtitles: boolean;
  /** What a page element made of it (elementTest), when it was asked. */
  element?: ElementResult;
}

/**
 * What a page element nobody sees made of a file: it opened it (or said it can't, or said nothing in 8 s), showed its
 * picture (null: not asked, or it couldn't tell), and decoded its sound ('unsure': it couldn't tell).
 */
export interface ElementResult {
  opens: 'yes' | 'no' | 'unknown';
  picture: boolean | null;
  sound: 'yes' | 'no' | 'unsure';
}

/** Uncompressed sound (PCM, and its μ-law and A-law kin). */
export const isPcm = (codec: string | null | undefined): boolean => !!codec && (codec.startsWith('pcm') || codec === 'ulaw' || codec === 'alaw');

/** File types every browser that plays their codecs opens: the facts tell for these. */
const OPENS_BY_CODECS = new Set<Box>(['mp4', 'webm', 'ogg', 'mp3', 'wav', 'flac', 'adts']);
export const opensByCodecs = (box: Box): boolean => OPENS_BY_CODECS.has(box);

/**
 * Whether only a page element can tell if a file plays here: an MKV, MOV or MPEG-TS (canPlayType says no to an MKV
 * that plays, and a browser may not open one whose codecs it plays), an HEVC or AV1 picture (that depends on the
 * computer's hardware), or uncompressed sound outside a WAV.
 */
export function needsElementTest(f: MediaFacts): boolean {
  if (!f.box) return false;
  return !opensByCodecs(f.box) || f.video?.codec === 'hevc' || f.video?.codec === 'av1' || (isPcm(f.audio?.codec) && f.box !== 'wav');
}

/**
 * Whether a page element nobody sees (muted) opens a file and plays it: a picture (when `picture`: the file has one)
 * whose frames it decodes, and a sound whose bytes it decodes. It plays a moment of it, 0.3 s or 1.5 s at most.
 */
export function elementTest(blob: Blob, kind: 'video' | 'audio', picture: boolean): Promise<ElementResult> {
  return new Promise((resolve) => {
    const el = document.createElement(kind);
    const url = URL.createObjectURL(blob);
    let done = false;
    let timer: ReturnType<typeof setTimeout>;
    const end = (r: ElementResult) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      el.ontimeupdate = el.onerror = el.onloadedmetadata = null;
      el.pause();
      el.removeAttribute('src');
      el.load();
      URL.revokeObjectURL(url);
      resolve(r);
    };
    // (Nothing at all within 8 s: it can't tell, and the facts decide.)
    timer = setTimeout(() => end({ opens: 'unknown', picture: null, sound: 'unsure' }), 8000);
    el.muted = true;
    if (el instanceof HTMLVideoElement) el.playsInline = true;
    el.preload = 'auto';
    el.onerror = () => end({ opens: 'no', picture: null, sound: 'unsure' });
    el.onloadedmetadata = () => {
      el.onloadedmetadata = null;
      const video = el instanceof HTMLVideoElement && picture ? el : null;
      const shows = video ? video.videoWidth > 0 : null;
      const look = () => {
        const played = el.currentTime >= 0.3;
        let seen = shows;
        const frames = video?.getVideoPlaybackQuality?.().totalVideoFrames;
        // (Frames decoded say for sure; none, when it hardly played (a hidden tab, a slow computer), say nothing.)
        if (seen && frames !== undefined) seen = frames > 0 ? true : played ? false : null;
        const bytes = (el as HTMLMediaElement & { webkitAudioDecodedByteCount?: number }).webkitAudioDecodedByteCount;
        const sound = typeof bytes !== 'number' ? 'unsure' : bytes > 0 ? 'yes' : played ? 'no' : 'unsure';
        end({ opens: 'yes', picture: seen, sound });
      };
      clearTimeout(timer);
      timer = setTimeout(look, 1500);
      el.ontimeupdate = () => el.currentTime >= 0.3 && look();
      el.play().catch(() => end({ opens: 'yes', picture: shows, sound: 'unsure' }));
    };
    el.src = url;
  });
}

/** An element's types for a codec family, to ask canPlayType with the track's own codec string. */
const PLAY_TYPES: Record<string, string[]> = {
  avc: ['video/mp4'],
  hevc: ['video/mp4'],
  av1: ['video/mp4'],
  vp8: ['video/webm', 'video/mp4'],
  vp9: ['video/webm', 'video/mp4'],
  aac: ['audio/mp4'],
  ac3: ['audio/mp4'],
  eac3: ['audio/mp4'],
  dts: ['audio/mp4'],
  mp3: ['audio/mpeg', 'audio/mp4'],
  opus: ['audio/ogg', 'audio/webm'],
  vorbis: ['audio/ogg', 'audio/webm'],
  flac: ['audio/flac', 'audio/mp4'],
  prores: ['video/quicktime'],
};

/** Whether an element here says it plays a track of this codec (string), in any of its family's types. */
function canPlayTrack(codec: string | null, str: string | null): boolean {
  if (typeof document === 'undefined' || !codec) return false;
  const el = document.createElement(PLAY_TYPES[codec]?.[0]?.startsWith('audio') || codec.startsWith('pcm') ? 'audio' : 'video');
  // (MP3 and PCM have no codecs= string.)
  if (codec === 'mp3' && el.canPlayType('audio/mpeg') !== '') return true;
  if (codec.startsWith('pcm')) return el.canPlayType('audio/wav') !== '';
  return (PLAY_TYPES[codec] ?? []).some((t) => el.canPlayType(str ? `${t}; codecs="${str}"` : t) !== '');
}

/** The file's type: mediabunny's own (WebM before Matroska: a WebM is one). */
async function boxOf(mb: typeof import('./mb'), format: InputFormat): Promise<Box | null> {
  const by: [InputFormat, Box][] = [
    [mb.WEBM, 'webm'],
    [mb.MATROSKA, 'mkv'],
    [mb.MP4, 'mp4'],
    [mb.QTFF, 'mov'],
    [mb.MPEG_TS, 'ts'],
    [mb.OGG, 'ogg'],
    [mb.MP3, 'mp3'],
    [mb.WAVE, 'wav'],
    [mb.FLAC, 'flac'],
    [mb.ADTS, 'adts'],
  ];
  return by.find(([f]) => f === format)?.[1] ?? null;
}

const quietly = async <T>(p: Promise<T>, or: T): Promise<T> => {
  try {
    return await p;
  } catch {
    return or;
  }
};

/** A track's common facts; bps from its own metadata, else the file's size over its length. */
async function trackFacts(t: InputVideoTrack | InputAudioTrack, bps: number | null): Promise<TrackFacts> {
  const codec = await quietly(t.getCodec(), null);
  const str = await quietly(t.getCodecParameterString(), null);
  return { codec, str, decodes: await quietly(t.canDecode(), false), bps: (await quietly(t.getAverageBitrate(), null)) ?? bps, cpt: canPlayTrack(codec, str) };
}

/**
 * What's in a file. `duration: 'compute'`: its length from its last packet when its header doesn't say (slower: a
 * dialog asks it, never a list). `fps`: the picture's frames a second, from its first 50 frames.
 */
export async function readFacts(blob: Blob, opts: { duration?: 'metadata' | 'compute'; fps?: boolean } = {}): Promise<MediaFacts> {
  const none: MediaFacts = { box: null, seconds: null, size: blob.size, video: null, audio: null, moreAudio: 0, subtitles: false };
  const mb = await import('./mb');
  let input: Input | null = null;
  try {
    input = new mb.Input({ source: new mb.BlobSource(blob, { maxCacheSize: 16 * MiB }), formats: mb.INPUTS });
    const box = await boxOf(mb, await input.getFormat());
    if (!box) return none;
    let seconds = await quietly(input.getDurationFromMetadata(), null);
    if ((seconds === null || !Number.isFinite(seconds)) && opts.duration === 'compute') seconds = await quietly(input.computeDuration(), null);
    if (seconds !== null && !(Number.isFinite(seconds) && seconds > 0)) seconds = null;
    const whole = seconds ? Math.round((blob.size * 8) / seconds) : null;
    const v = await quietly(input.getPrimaryVideoTrack(), null);
    const a = await quietly(input.getPrimaryAudioTrack(), null);
    const tracks = await quietly(input.getTracks(), []);
    const audios = tracks.filter((t) => t.isAudioTrack()).length;
    const video = v
      ? {
          ...(await trackFacts(v, a ? null : whole)),
          width: await v.getDisplayWidth(),
          height: await v.getDisplayHeight(),
          rotation: await quietly(v.getRotation(), 0 as const),
          hdr: await quietly(v.hasHighDynamicRange(), false),
          ...(opts.fps ? { fps: await quietly(v.computePacketStats(50).then((s) => s.averagePacketRate || null), null) } : {}),
        }
      : null;
    const audio = a
      ? {
          ...(await trackFacts(a, v ? null : whole)),
          channels: await quietly(a.getNumberOfChannels(), 2),
          label: (await quietly(a.getName(), null)) || ((l) => (l && l !== 'und' ? l : null))(await quietly(a.getLanguageCode(), 'und')),
        }
      : null;
    return { box, seconds, size: blob.size, video, audio, moreAudio: Math.max(0, audios - 1), subtitles: tracks.some((t) => t.type === 'subtitle') };
  } catch {
    return none;
  } finally {
    input?.dispose();
  }
}
