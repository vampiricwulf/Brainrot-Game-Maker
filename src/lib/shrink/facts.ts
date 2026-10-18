// What's inside a video or sound file (card-files spec §4.12.1): its file type by its content (not its name), how long
// it is, and its picture and sound tracks: their codecs, size and bitrate, and whether this browser can decode them.
// Read with mediabunny, a few small pieces of the file at a time (never the whole of it). 🗜's dialog shows it, and
// what 🗜 made is checked with it before it's put in.
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
