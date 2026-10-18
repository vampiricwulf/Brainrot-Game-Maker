// Making one file from another (card-files spec §4.13.3): a video or sound made again with mediabunny (WebCodecs), as
// a plan says (a smaller picture, another codec, only part of it), read a few pieces at a time and written into Blob
// parts (target.ts), so a big file never sits in memory whole. Then checked before anything is changed: it reads back
// as it should, and a page element opens it. Nothing here names a file, and what's made carries no tags (a title tag
// can name an answer).
import type { ConversionAudioOptions, ConversionVideoOptions, DiscardedTrack, Input } from 'mediabunny';
import { readFacts } from './facts';
import { blobTarget } from './target';

const MiB = 1024 * 1024;

/** The file types made here. */
export type OutBox = 'mp4' | 'webm' | 'm4a' | 'ogg' | 'mp3' | 'flac' | 'wav';

/** What's done to the picture (as mediabunny's video options, with a plain bitrate: plan.ts loads no mediabunny). */
export interface RunVideo {
  discard?: true;
  /** The picture's size as shown, both even. */
  width?: number;
  height?: number;
  fit?: 'fill' | 'contain' | 'cover';
  /** The part of the picture kept (pixels of the picture as shown, after any rotation), before it's resized. */
  crop?: { left: number; top: number; width: number; height: number };
  codec?: 'avc' | 'vp9' | 'vp8';
  /** Bits a second. */
  bitrate?: number;
  /** 'variable': the bitrate may rise and fall with the picture (the show's own file); else it's kept even. */
  bitrateMode?: 'constant' | 'variable';
  keyFrameInterval?: number;
  frameRate?: number;
  forceTranscode?: boolean;
  hardwareAcceleration?: 'no-preference' | 'prefer-hardware' | 'prefer-software';
}

/** What's done to the sound. */
export interface RunAudio {
  discard?: true;
  /** (Uncompressed sound made again as it was: a trim exact to the sample, with nothing lost.) */
  codec?: 'aac' | 'opus' | `pcm-${string}` | 'ulaw' | 'alaw';
  bitrate?: number;
  numberOfChannels?: number;
  forceTranscode?: boolean;
}

export interface RunPlan {
  box: OutBox;
  video?: RunVideo;
  audio?: RunAudio;
  /** Seconds on the file's timeline (no end: to the end). */
  trim?: { start: number; end?: number };
  copy?: { mode?: 'forced' | 'preferred'; shiftTolerance?: number };
}

/** What was made: its bytes and type, and how long and big it came out (as read back). */
export interface Made {
  blob: Blob;
  mime: string;
  seconds: number | null;
  width?: number;
  height?: number;
}

/**
 * Why a file couldn't be made: unreadable, a track this browser can't decode, no encoder for it, no copy possible, or
 * too long to decode here (sound.ts).
 */
export type RunReason = 'unreadable' | 'undecodable' | 'no-encoder' | 'cannot-copy' | 'check' | 'too-long';

export class RunError extends Error {
  constructor(
    readonly reason: RunReason,
    message: string = reason,
  ) {
    super(message);
    this.name = 'RunError';
  }
}

const stopped = () => new DOMException('Stopped', 'AbortError');

/** Why a track was left out, as a RunError's reason (null: as planned). */
export function discardReason(d: Pick<DiscardedTrack, 'reason'>): RunReason | null {
  switch (d.reason) {
    case 'discarded_by_user':
    case 'max_track_count_reached':
    case 'max_track_count_of_type_reached':
      return null;
    case 'undecodable_source_codec':
    case 'unknown_source_codec':
      return 'undecodable';
    case 'no_encodable_target_codec':
      return 'no-encoder';
    case 'cannot_copy':
      return 'cannot-copy';
  }
}

/** A plan's picture and sound options as mediabunny's (its bitrates as a Quality). */
function options(mb: typeof import('./mb'), plan: RunPlan): { video?: ConversionVideoOptions; audio?: ConversionAudioOptions } {
  const quality = (bps?: number, bitrateMode?: 'constant' | 'variable') => (bps ? { quality: new mb.Quality({ bitrate: bps, ...(bitrateMode ? { bitrateMode } : {}) }) } : {});
  const { bitrate: vbps, bitrateMode, ...video } = plan.video ?? {};
  const { bitrate: abps, ...audio } = plan.audio ?? {};
  return {
    ...(plan.video ? { video: { ...video, ...quality(vbps, bitrateMode) } } : {}),
    ...(plan.audio ? { audio: { ...audio, codec: audio.codec as ConversionAudioOptions['codec'], ...quality(abps) } } : {}),
  };
}

/** The container for a file type. */
function outputFormat(mb: typeof import('./mb'), box: OutBox) {
  switch (box) {
    case 'mp4':
    case 'm4a':
      return new mb.Mp4OutputFormat({ fastStart: false });
    case 'webm':
      return new mb.WebMOutputFormat();
    case 'ogg':
      return new mb.OggOutputFormat();
    case 'mp3':
      return new mb.Mp3OutputFormat();
    case 'flac':
      return new mb.FlacOutputFormat();
    case 'wav':
      return new mb.WavOutputFormat();
  }
}

/**
 * `src` made again as `plan` says, of type `mime`. `ctl.progress` hears how far it got (4 times a second at most);
 * `ctl.signal` stops it (an AbortError). Throws a RunError when it can't be made as planned (a track left out that
 * wasn't meant to be).
 */
export async function convertBlob(src: Blob, plan: RunPlan, mime: string, ctl: { signal: AbortSignal; progress(p: number): void }): Promise<Made> {
  if (ctl.signal.aborted) throw stopped();
  const mb = await import('./mb');
  let input: Input | null = null;
  const t = blobTarget(mb);
  try {
    input = new mb.Input({ source: new mb.BlobSource(src, { maxCacheSize: 16 * MiB }), formats: mb.INPUTS });
    const output = new mb.Output({ format: outputFormat(mb, plan.box), target: t.target });
    let conversion: Awaited<ReturnType<typeof mb.Conversion.init>>;
    try {
      conversion = await mb.Conversion.init({
        input,
        output,
        tracks: 'primary',
        tags: {},
        showWarnings: false,
        ...options(mb, plan),
        ...(plan.trim ? { trim: plan.trim } : {}),
        ...(plan.copy ? { copy: plan.copy } : {}),
      });
    } catch (e) {
      throw new RunError('unreadable', (e as Error)?.message);
    }
    for (const d of conversion.discardedTracks) {
      const why = discardReason(d);
      if (why) throw new RunError(why, `${d.track.type} track: ${d.reason}`);
    }
    if (!conversion.isValid) throw new RunError('unreadable', 'nothing to make');
    let last = -Infinity;
    conversion.onProgress = (p) => {
      const now = performance.now();
      if (p < 1 && now - last < 250) return;
      last = now;
      ctl.progress(Math.min(1, Math.max(0, p)));
    };
    const stop = () => void conversion.cancel().catch(() => {});
    ctl.signal.addEventListener('abort', stop, { once: true });
    try {
      if (ctl.signal.aborted) throw stopped();
      await conversion.execute();
    } catch (e) {
      if (ctl.signal.aborted || e instanceof mb.ConversionCanceledError) throw stopped();
      throw e;
    } finally {
      ctl.signal.removeEventListener('abort', stop);
    }
  } finally {
    input?.dispose();
  }
  if (ctl.signal.aborted) throw stopped();
  const blob = t.blob(mime);
  const f = await readFacts(blob);
  return { blob, mime, seconds: f.seconds, ...(f.video ? { width: f.video.width, height: f.video.height } : {}) };
}

/** Whether a page element nobody sees opens a file within 10 s, and (a video) shows a picture. */
export function opensHere(blob: Blob, kind: 'video' | 'audio'): Promise<{ opens: boolean; picture: boolean }> {
  return new Promise((resolve) => {
    const el = document.createElement(kind);
    const url = URL.createObjectURL(blob);
    let done = false;
    const end = (opens: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      const picture = el instanceof HTMLVideoElement && el.videoWidth > 0;
      el.removeAttribute('src');
      el.load();
      URL.revokeObjectURL(url);
      resolve({ opens, picture });
    };
    const timer = setTimeout(() => end(false), 10_000);
    el.muted = true;
    el.preload = 'metadata';
    el.onloadedmetadata = () => end(true);
    el.onerror = () => end(false);
    el.src = url;
  });
}

/** What a made file should be: how long (seconds, null: not known), how big a picture, and whether it has sound. */
export interface Want {
  seconds: number | null;
  width?: number;
  height?: number;
  sound: boolean;
}

/**
 * Whether a made file came out right: it reads back as long as it should be (within a quarter second, or 2% of a long
 * one), its picture the size it should be (2 px either way), with sound when it should have it, and an element here
 * opens it (a video with its picture). Null: it did; else what's wrong (for the console: the host is told it didn't
 * come out right).
 */
export async function checkMade(m: Pick<Made, 'blob' | 'mime'>, want: Want, opens: typeof opensHere = opensHere): Promise<string | null> {
  const f = await readFacts(m.blob, { duration: 'compute' });
  if (!f.box) return 'it can’t be read back';
  if (want.seconds !== null && (f.seconds === null || Math.abs(f.seconds - want.seconds) > Math.max(0.25, 0.02 * want.seconds)))
    return `it lasts ${f.seconds ?? '?'} s, not ${want.seconds} s`;
  if (want.width !== undefined && (!f.video || Math.abs(f.video.width - want.width) > 2 || Math.abs(f.video.height - (want.height ?? f.video.height)) > 2))
    return `its picture is ${f.video ? `${f.video.width}×${f.video.height}` : 'missing'}, not ${want.width}×${want.height}`;
  if (want.sound && !f.audio) return 'it has no sound';
  const el = await opens(m.blob, m.mime.startsWith('audio/') ? 'audio' : 'video');
  if (!el.opens) return 'it doesn’t open here';
  if (want.width !== undefined && !el.picture) return 'it shows no picture here';
  return null;
}
