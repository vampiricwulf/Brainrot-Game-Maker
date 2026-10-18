// What a 🗜 copy for phones comes out as (card-files spec §4.6, §4.7): its size, codec, file type and name, worked out
// before anything is made, for a GIF (a looping video), a video (a smaller picture, or only the part the cards play) or
// a sound. And how 🔄 Convert makes a file that plays here in its place (§4.12.6). Pure, so it's unit-tested.
import { SLOW_FILE_BYTES } from '../buzzproto';
import type { MediaFacts } from './facts';
import type { Can, Encoders } from './probe';
import { NO_WEBCODECS } from './probe';
import { fixMime, isLossless, type Fix } from './playable';
import type { RunAudio, RunPlan, RunVideo, Want } from './run';
import { codecName, fixBoxName } from './words';

/** 🖼 Media offers 🗜 for a file over this (bytes). */
export const SHRINK_OFFER_BYTES = 2 * 1024 * 1024;
/** A GIF's copy: a picture no bigger than this on its long side. */
export const GIF_LONG_SIDE = 720;
/** A GIF longer than this (frames, or seconds) isn't turned into a video here. */
export const GIF_MAX_FRAMES = 2000;
export const GIF_MAX_SECONDS = 60;
/** A GIF's copy lasts at least this long (seconds): a short GIF goes round more than once in it. */
export const GIF_MIN_SECONDS = 2;
/** A copy has to come out under this share of its file, or nothing is changed. */
export const GIF_MAX_SHARE = 0.5;
/** What a GIF's see-through parts show in its copy: the phone card's own background (buzzer/phone/style.css .card). */
export const GIF_MATTE = '#2a293e';

export const TOO_LONG = 'This GIF is too long to turn into a video here';
/** Said where WebCodecs is here but not the encoder a copy needs (no VP9 at that size, no AAC or Opus for a sound). */
export const NO_ENCODER = 'This browser can’t make this copy: try Chrome, Edge, Firefox or the desktop app';
export const NOT_SMALLER = 'A video of it wouldn’t be much smaller: nothing was changed';
/** Said under the choice when this browser makes WebM only. */
export const WEBM_NOTE = 'This browser makes WebM videos: some iPhones may not play them. For a copy every phone plays, make it in Chrome or Edge on Windows or Mac, or in the desktop app.';

/** What a copy is called: "Dance.gif" → "Dance (phones).mp4" (its own type's extension: packs name files by it). */
export function copyName(name: string, ext: string): string {
  const base = name.replace(/\.[a-z0-9]{1,5}$/i, '').trim() || 'File';
  return `${base} (phones).${ext}`;
}

/** The even whole number at or under `n` (2 at least): video encoders want even sizes. */
export const evenBelow = (n: number): number => Math.max(2, Math.floor(n / 2) * 2);

/** A GIF's copy's size: its long side GIF_LONG_SIDE at most (never bigger than the GIF), even both ways. */
export function gifSize(w: number, h: number): { width: number; height: number } {
  const k = Math.min(1, GIF_LONG_SIDE / Math.max(w, h, 1));
  return { width: evenBelow(w * k), height: evenBelow(h * k) };
}

/** A GIF's copy's bitrate: 0.1 bit a pixel a frame, at most 30 frames a second, from 200 kbps to 2.5 Mbps. */
export const gifBitrate = (w: number, h: number, fps: number): number => Math.min(2_500_000, Math.max(200_000, Math.round(0.1 * w * h * Math.min(fps, 30))));

/** What a GIF is: its size, frames and how long one time through lasts (seconds). */
export interface GifInfo {
  width: number;
  height: number;
  frames: number;
  seconds: number;
}

/** How a GIF's copy is made. loops: times through the GIF (a short one more than once). */
export interface GifPlan {
  width: number;
  height: number;
  codec: 'avc' | 'vp9' | 'vp8';
  box: 'mp4' | 'webm';
  mime: 'video/mp4' | 'video/webm';
  ext: 'mp4' | 'webm';
  bitrate: number;
  loops: number;
  /** Seconds the copy lasts. */
  seconds: number;
  /** Its size, about (bytes). */
  estimate: number;
}

/** A GIF's copy, from what this browser can encode (H.264 in an MP4, else VP9 or VP8 in a WebM), or why it can't be. */
export function planGif(info: GifInfo, enc: Encoders): GifPlan | { refuse: string } {
  if (info.frames > GIF_MAX_FRAMES || info.seconds > GIF_MAX_SECONDS) return { refuse: TOO_LONG };
  const codec = enc.avc ? 'avc' : enc.vp9 ? 'vp9' : enc.vp8 ? 'vp8' : null;
  if (!codec) return { refuse: NO_ENCODER };
  const { width, height } = gifSize(info.width, info.height);
  const once = Math.max(info.seconds, 0.01);
  const loops = once < GIF_MIN_SECONDS ? Math.ceil(GIF_MIN_SECONDS / once) : 1;
  const bitrate = gifBitrate(width, height, info.frames / once);
  const mp4 = codec === 'avc';
  const seconds = once * loops;
  return {
    width,
    height,
    codec,
    box: mp4 ? 'mp4' : 'webm',
    mime: mp4 ? 'video/mp4' : 'video/webm',
    ext: mp4 ? 'mp4' : 'webm',
    bitrate,
    loops,
    seconds,
    estimate: Math.round(((bitrate * seconds) / 8) * 1.03),
  };
}

/** Whether a copy of `made` bytes is worth having for a file of `size`. */
export const smallEnough = (made: number, size: number): boolean => made < GIF_MAX_SHARE * size;

/** The words for what a copy is made as ("MP4 (H.264, AAC)"), and for WebM, that some iPhones may not play it. */
export function formatLine(plan: Pick<GifPlan, 'codec'>, sound?: string): string {
  const and = sound ? `, ${sound}` : '';
  if (plan.codec === 'avc') return `Made as an MP4 (H.264${and}), which every phone plays.`;
  return `Made as a WebM (${plan.codec === 'vp9' ? 'VP9' : 'VP8'}${and}). ${WEBM_NOTE}`;
}

/** A copy's type in a word: "MP4", "WebM". */
export const typeWord = (mime: string): string =>
  ({ 'video/mp4': 'MP4', 'video/webm': 'WebM', 'audio/mp4': 'M4A', 'audio/ogg': 'OGG', 'audio/mpeg': 'MP3', 'audio/wav': 'WAV', 'audio/flac': 'FLAC' })[mime.split(';')[0]] ?? mime;

/** What's copied, for History and toasts (never its name: they can be on stream). */
export type CopyOf = 'video' | 'GIF' | 'sound';
/** History: "Made a smaller copy of a GIF for phones" (`playable` false: phones couldn't play the file as it is). */
export const madeLabel = (what: CopyOf, playable = true): string => (playable ? `Made a smaller copy of a ${what} for phones` : `Made a copy of a ${what} that phones can play`);
/** History: "Removed a GIF's smaller copy for phones". */
export const removedLabel = (what: CopyOf): string => `Removed a ${what}’s smaller copy for phones`;

/** "about 40 s left", "about 3 min left". */
export function leftText(seconds: number): string {
  if (seconds < 55) return `about ${Math.max(5, Math.round(seconds / 5) * 5)} s left`;
  return `about ${Math.max(1, Math.round(seconds / 60))} min left`;
}

// ---------- Videos and sounds (card-files spec §4.7) ----------

/** A video's copies, biggest first: the long side of the picture, and its bitrate (bits a second). */
export const PRESETS = [
  { name: 'Phones', long: 1280, bps: 2_500_000 },
  { name: 'Small', long: 854, bps: 1_200_000 },
  { name: 'Tiny', long: 640, bps: 600_000 },
] as const;
export type PresetName = (typeof PRESETS)[number]['name'];
/** A copy's frames a second, at most. */
export const MAX_FPS = 30;
/** A key frame this often (seconds): phones can start it anywhere. */
export const KEY_EVERY = 2;
/** A sound made again: 128 kbps, 96 kbps for one channel. */
export const SOUND_BPS = 128_000;
export const MONO_BPS = 96_000;
/** A video's copy is offered only at sizes that come out under this share of the file. */
export const PRESET_MAX_SHARE = 0.8;
/** A sound's copy is offered when the sound is over this (bytes), and comes out under SOUND_MAX_SHARE of it. */
export const SOUND_OFFER_BYTES = 1024 * 1024;
export const SOUND_MAX_SHARE = 0.75;
/** What's made has to come out under this share of the file, or nothing is changed. */
export const COPY_MAX_SHARE = 0.9;
/** "Only the part the cards play" is ticked when that part is under this share of the file. */
export const TRIM_SHARE = 0.8;

export const NOT_MUCH_SMALLER = 'A copy of it wouldn’t be much smaller: nothing was changed';
export const NO_PICTURE = 'The app finds no picture in this video, so it can’t make a copy of it';
export const CANT_READ_VIDEO = 'This browser can’t read this video’s format. Try Chrome or Edge on Windows, or add it from a link';
export const CANT_READ_FILE = 'The app can’t read this file, so it can’t make a copy of it';
export const CANT_MAKE_SOUND = 'This browser can’t make this video’s sound for phones. Try Chrome or Edge on Windows or Mac, or add it from a link';
export const SOUND_TOO_LONG = 'This browser can only make a copy of a sound like this one up to 15 minutes long';
/** Said under the choice when a sound's copy is Opus. */
export const OPUS_NOTE = 'Its sound is Opus: some iPhones may not play it. For a copy every phone plays, make it in Chrome or Edge on Windows or Mac, or in the desktop app.';
/** Said under the choices when even the smallest is over what the buzzer server takes. */
export const STILL_TOO_BIG = 'Still too big for this buzzer server: try only the part the cards play, or add it from a link.';

/** One of a video's copies: its preset, its picture's size and its bitrate. */
export interface VideoChoice {
  name: PresetName;
  width: number;
  height: number;
  bps: number;
}

/**
 * The presets for a video whose picture is `w`×`h`, never bigger than it: those as big as it or bigger come out at its
 * own size, and only the smallest of them is kept (its bitrate suits that size best).
 */
export function videoChoices(w: number, h: number): VideoChoice[] {
  const out: VideoChoice[] = [];
  // (The nearest even number, never past the picture's own: the shape stays within a pixel.)
  const even = (n: number, max: number) => Math.min(evenBelow(max), Math.max(2, Math.round(n / 2) * 2));
  for (const p of PRESETS) {
    const k = Math.min(1, p.long / Math.max(w, h, 1));
    const c: VideoChoice = { name: p.name, width: even(w * k, w), height: even(h * k, h), bps: p.bps };
    const last = out[out.length - 1];
    if (last && last.width === c.width && last.height === c.height) out[out.length - 1] = c;
    else out.push(c);
  }
  return out;
}

/** About how big a file of `bps` bits a second for `seconds` comes out (bytes), with 3% for its container. */
export const estimateBytes = (bps: number, seconds: number): number => Math.round(((bps * seconds) / 8) * 1.03);

/** What a video's sound costs in its copy (bits a second): its own when it's copied as it is (AAC, Opus), else 128/96 kbps. */
export function soundBps(f: Pick<MediaFacts, 'audio'>): number {
  const a = f.audio;
  if (!a) return 0;
  if ((a.codec === 'aac' || a.codec === 'opus') && a.bps) return a.bps;
  return a.channels === 1 ? MONO_BPS : SOUND_BPS;
}

/** The part of a file a copy holds (seconds; to null: to the end). */
export interface Span {
  from: number;
  to: number | null;
}

/**
 * The part of a file its 🤫 cards play (`uses`: each one's Start at and Stop at): from the earliest start to the latest
 * stop, to the end when one plays to the end (or has a Stop at that isn't after its Start at). Null when that's all of
 * it. `ticked`: "Only the part the cards play" is ticked at first: every use stops, and the part is under TRIM_SHARE of
 * the file.
 */
export function cardSpan(uses: { start?: number; end?: number }[], length: number | null): { span: Span; ticked: boolean } | null {
  if (!uses.length) return null;
  let from = Infinity;
  let to: number | null = -Infinity;
  for (const u of uses) {
    const s = u.start && u.start > 0 ? u.start : 0;
    from = Math.min(from, s);
    const e = u.end !== undefined && u.end > s ? u.end : null;
    to = to === null || e === null ? null : Math.max(to, e);
  }
  if (length !== null && to !== null && to >= length - 0.05) to = null;
  if (length !== null && from >= length) return null;
  if (from <= 0.05 && to === null) return null;
  const span = { from: from <= 0.05 ? 0 : from, to };
  const ticked = to !== null && length !== null && to - span.from < TRIM_SHARE * length;
  return { span, ticked };
}

/** How long a part of a file lasts (seconds). */
export const spanSeconds = (span: Span | null, length: number): number => Math.max(0, (span?.to ?? length) - (span?.from ?? 0));

/** "0:12", "1:32", "1:02:03" (whole seconds, rounded). */
export function clockText(s: number): string {
  const t = Math.max(0, Math.round(s));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = String(t % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** "0:12.4" (tenths; a whole second: "0:12"). */
export function clockTenths(s: number): string {
  const t = Math.max(0, Math.round(s * 10) / 10);
  const whole = Math.floor(t);
  const tenth = Math.round((t - whole) * 10);
  return tenth ? `${clockText(whole)}.${tenth}` : clockText(whole);
}

/** "2.4 s", "1:32". */
export const lengthText = (s: number): string => (s < 60 ? `${Math.round(s * 10) / 10} s` : clockText(s));

/** "0:12 → 0:45 (33 s)", "0:12 → the end (1:08)". */
export const spanText = (span: Span, length: number | null): string =>
  `${clockTenths(span.from)} → ${span.to === null ? 'the end' : clockTenths(span.to)}${length !== null || span.to !== null ? ` (${lengthText(spanSeconds(span, length ?? 0))})` : ''}`;

/**
 * A video's copies as they'd come out (`seconds` of it), each with its size about, biggest first; and the one picked:
 * the biggest under 0.9 × SLOW_FILE_BYTES, else under 0.9 × the buzzer server's `fileBytes`, else the smallest
 * (`tooBig`). Those not much smaller than the file are left out, unless phones can't play the file as it is
 * (`playable` false).
 */
export function videoOptions(
  f: MediaFacts,
  seconds: number,
  opts: { fileBytes: number; playable: boolean },
): { choices: (VideoChoice & { estimate: number })[]; pick: number; tooBig: boolean } | { refuse: string } {
  if (!f.box) return { refuse: CANT_READ_FILE };
  if (!f.video) return { refuse: NO_PICTURE };
  if (!f.video.decodes) return { refuse: CANT_READ_VIDEO };
  const abps = soundBps(f);
  const all = videoChoices(f.video.width, f.video.height).map((c) => ({ ...c, estimate: estimateBytes(c.bps + abps, seconds) }));
  const choices = opts.playable ? all.filter((c) => c.estimate < PRESET_MAX_SHARE * f.size) : all;
  if (!choices.length) return { refuse: NOT_MUCH_SMALLER };
  const under = (n: number) => choices.findIndex((c) => c.estimate < 0.9 * n);
  let pick = under(SLOW_FILE_BYTES);
  if (pick < 0) pick = under(opts.fileBytes);
  return pick < 0 ? { choices, pick: choices.length - 1, tooBig: true } : { choices, pick, tooBig: false };
}

/** How a video's or a sound's copy is made: what convertBlob does, what it should come out as, and its words. */
export interface CopyPlan {
  run: RunPlan;
  mime: string;
  ext: string;
  /** What it should come out as (checkMade). */
  out: Want;
  /** Its size, about (bytes; 0: not known). */
  estimate: number;
  /** The part of the file it holds (null: all of it). */
  range: Span | null;
  /** "Made as an MP4 (H.264, AAC), which every phone plays." */
  format: string;
  /** Phones can play the file as it is: the copy has to come out smaller (else it's made so they can play it at all). */
  playable: boolean;
  /** A sound the app's reader can't decode: the browser decodes it (sound.ts), into this. */
  here?: { codec: 'aac' | 'opus'; bitrate: number };
}

const trimOf = (span: Span | null): Pick<RunPlan, 'trim'> => (span ? { trim: { start: span.from, ...(span.to !== null ? { end: span.to } : {}) } } : {});

/**
 * A video's copy at `choice`, of the part `span` holds, from what this browser can encode at that size (`enc`) and
 * what it can make sound with (`can`): an MP4 (H.264, its sound AAC, copied when it is) when it can, else a WebM (VP9,
 * else VP8, its sound Opus or Vorbis copied, else Opus). At most MAX_FPS frames a second, a key frame every KEY_EVERY.
 */
export function planVideoCopy(f: MediaFacts, can: Can, enc: Encoders, choice: VideoChoice, span: Span | null, playable: boolean): CopyPlan | { refuse: string } {
  if (!f.box) return { refuse: CANT_READ_FILE };
  if (!f.video) return { refuse: NO_PICTURE };
  if (!f.video.decodes) return { refuse: CANT_READ_VIDEO };
  if (!can.ok) return { refuse: can.why ?? NO_WEBCODECS };
  const a = f.audio;
  const made = (codec: 'aac' | 'opus'): RunAudio => ({ codec, bitrate: a?.channels === 1 ? MONO_BPS : SOUND_BPS, forceTranscode: true, ...(a && a.channels > 2 ? { numberOfChannels: 2 } : {}) });
  let codec: 'avc' | 'vp9' | 'vp8';
  let audio: RunAudio | undefined;
  let sound = '';
  if (enc.avc && (!a || a.codec === 'aac' || (can.aac && a.decodes))) {
    codec = 'avc';
    if (a) [audio, sound] = [a.codec === 'aac' ? {} : made('aac'), 'AAC'];
  } else if (enc.vp9 || enc.vp8) {
    codec = enc.vp9 ? 'vp9' : 'vp8';
    if (a?.codec === 'opus' || a?.codec === 'vorbis') [audio, sound] = [{}, a.codec === 'opus' ? 'Opus' : 'Vorbis'];
    else if (a && can.opus && a.decodes) [audio, sound] = [made('opus'), 'Opus'];
    else if (a) return { refuse: CANT_MAKE_SOUND };
  } else return { refuse: NO_ENCODER };
  const length = f.seconds ?? 0;
  const seconds = spanSeconds(span, length);
  const box = codec === 'avc' ? 'mp4' : 'webm';
  const fps = f.video.fps;
  return {
    run: {
      box,
      video: {
        width: choice.width,
        height: choice.height,
        fit: 'fill',
        codec,
        bitrate: choice.bps,
        keyFrameInterval: KEY_EVERY,
        forceTranscode: true,
        ...(fps && fps > MAX_FPS + 1 ? { frameRate: MAX_FPS } : {}),
      },
      ...(audio ? { audio } : {}),
      ...trimOf(span),
      // (A sound copied as it is may move by a tenth of a second to fit the cut: it stays with the picture.)
      copy: { shiftTolerance: 0.1 },
    },
    mime: `video/${box}`,
    ext: box,
    out: { seconds: f.seconds !== null ? seconds : null, width: choice.width, height: choice.height, sound: !!a },
    estimate: estimateBytes(choice.bps + soundBps(f), seconds),
    range: span,
    format: formatLine({ codec }, sound || undefined),
    playable,
  };
}

/**
 * A sound's copy, of the part `span` holds: AAC in an M4A when this browser can make it, else Opus in an OGG; 128 kbps
 * (96 for one channel), 2 channels at most. One the app's reader can't decode is decoded by the browser (`here`, 15
 * minutes at most). When phones can play it as it is, it's offered only over SOUND_OFFER_BYTES and when the copy comes
 * out under SOUND_MAX_SHARE of it.
 */
export function planSoundCopy(f: MediaFacts, can: Can, span: Span | null, playable: boolean): CopyPlan | { refuse: string } {
  if (!can.ok) return { refuse: can.why ?? NO_WEBCODECS };
  if (f.box && !f.audio) return { refuse: 'The app finds no sound in this file, so it can’t make a copy of it' };
  const codec = can.aac ? 'aac' : can.opus ? 'opus' : null;
  if (!codec) return { refuse: NO_ENCODER };
  const bitrate = f.audio?.channels === 1 ? MONO_BPS : SOUND_BPS;
  const here = !f.box || !f.audio?.decodes;
  if (here && f.seconds !== null && f.seconds > 15 * 60) return { refuse: SOUND_TOO_LONG };
  const seconds = f.seconds !== null ? spanSeconds(span, f.seconds) : null;
  const estimate = seconds !== null ? estimateBytes(bitrate, seconds) : 0;
  if (playable && (f.size <= SOUND_OFFER_BYTES || (seconds !== null && estimate >= SOUND_MAX_SHARE * f.size))) return { refuse: NOT_MUCH_SMALLER };
  const [box, mime, ext] = codec === 'aac' ? (['m4a', 'audio/mp4', 'm4a'] as const) : (['ogg', 'audio/ogg', 'ogg'] as const);
  return {
    run: {
      box,
      ...(f.video ? { video: { discard: true } } : {}),
      audio: { codec, bitrate, forceTranscode: true, ...(f.audio && f.audio.channels > 2 ? { numberOfChannels: 2 } : {}) },
      ...trimOf(span),
    },
    mime,
    ext,
    out: { seconds, sound: true },
    estimate,
    range: span,
    format: codec === 'aac' ? 'Made as an M4A (AAC), which every phone plays.' : `Made as an OGG (Opus). ${OPUS_NOTE}`,
    playable,
    ...(here ? { here: { codec, bitrate } } : {}),
  };
}

/** What 🗜's dialog read of a video or a sound, to plan its copy from (apply.ts readForCopy). */
export interface AvRead {
  kind: 'video' | 'audio';
  facts: MediaFacts;
  can: Can;
  /** Phones can play the file as it is. */
  playable: boolean;
  /** The part its 🤫 cards play (cardSpan), when that isn't all of it. */
  span: { span: Span; ticked: boolean } | null;
  /** The video encoders there are at each choice's size ("1280×720"). */
  enc: Record<string, Encoders>;
}

const NO_ENCODERS: Encoders = { avc: false, vp9: false, vp8: false };

/** A video's copies as they'd come out, with only the part the cards play (`trim`) or all of it (a sound has none). */
export function avOptions(r: AvRead, trim: boolean, fileBytes: number): ReturnType<typeof videoOptions> {
  if (r.kind === 'audio') return { choices: [], pick: 0, tooBig: false };
  const span = trim && r.span ? r.span.span : null;
  return videoOptions(r.facts, spanSeconds(span, r.facts.seconds ?? 0), { fileBytes, playable: r.playable });
}

/** How a video's copy at `choice` (a sound's: there's one), with or without only the part the cards play, is made. */
export function avPlan(r: AvRead, trim: boolean, choice: VideoChoice | null): CopyPlan | { refuse: string } {
  const span = trim && r.span ? r.span.span : null;
  if (r.kind === 'audio') return planSoundCopy(r.facts, r.can, span, r.playable);
  if (!choice) return { refuse: NOT_MUCH_SMALLER };
  return planVideoCopy(r.facts, r.can, r.enc[`${choice.width}×${choice.height}`] ?? NO_ENCODERS, choice, span, r.playable);
}

/** A file's copy as 🗜 makes it unasked (a list of files at once): the part the cards play when ticked, the picked size. */
export function avDefault(r: AvRead, fileBytes: number): CopyPlan | { refuse: string } {
  const trim = r.span?.ticked ?? false;
  const o = avOptions(r, trim, fileBytes);
  if ('refuse' in o) return o;
  return avPlan(r, trim, o.choices[o.pick] ?? null);
}

// ---------- 🔄 Convert (card-files spec §4.12.6) ----------

/**
 * How a file of the game is made again in its own place (🔄 Convert; ✎ Edit later): what convertBlob does, what it
 * should come out as, and its words.
 */
export interface EditPlan {
  run: RunPlan;
  mime: string;
  /** What it should come out as (checkMade). */
  out: Want;
  /** Nothing re-encoded: quick, and nothing lost. */
  copied: boolean;
  /** The part of the file kept, which items' times move by (null: all of it). */
  cut: { from: number; to: number; length: number } | null;
  /** Its size, about (bytes; 0: not known). */
  estimate: number;
  /** "MP4 (H.264, AAC)". */
  format: string;
  /** What else to know: a second sound track or subtitles left out, an HDR picture made again. */
  notes: string[];
  /** History's words (never the file's name). */
  label: string;
}

/**
 * A picture's bitrate when it's made again for the show (bits a second): 5 Mbps at 720p, by its pixels, from 1.2 to 8
 * Mbps (a fifth less for VP9), never more than the source's own rate a pixel allows (half as much again from HEVC,
 * AV1 or VP9 to H.264, a tenth otherwise), and 300 kbps at least.
 */
export function videoBitrate(w: number, h: number, codec: 'avc' | 'vp9' | 'vp8', src?: { bps: number | null; w: number; h: number; codec: string | null }): number {
  let bps = Math.min(8_000_000, Math.max(1_200_000, (5_000_000 * w * h) / (1280 * 720))) * (codec === 'vp9' ? 0.8 : 1);
  if (src?.bps && src.w > 0 && src.h > 0) {
    const k = codec === 'avc' && (src.codec === 'hevc' || src.codec === 'av1' || src.codec === 'vp9') ? 1.5 : 1.1;
    bps = Math.min(bps, ((src.bps * w * h) / (src.w * src.h)) * k);
  }
  return Math.round(Math.max(300_000, bps));
}

/** History: "Repackaged a video as MP4 (nothing lost)", "Converted a sound to OGG", "… without its sound". */
export function convertLabel(kind: 'video' | 'audio', fix: Fix): string {
  const what = kind === 'audio' ? 'sound' : 'video';
  const box = fixBoxName(fix.box);
  const silent = fix.audio === 'drop' ? ' without its sound' : '';
  if (isLossless(fix)) return silent ? `Repackaged a ${what} as ${box}${silent}` : `Repackaged a ${what} as ${box} (nothing lost)`;
  return `Converted a ${what} to ${box}${silent}`;
}

/**
 * How file `f` (a `kind` file of the game) is made into one that plays here, as `fix` (playable.ts) says: its main
 * picture and sound copied as they are (forced: never re-encoded behind the host's back), or made again in this
 * browser's own codecs at the picture's own size, or the sound left out; all of it, in the type `fix.box`.
 */
export function planConvert(f: MediaFacts, fix: Fix, can: Can, kind: 'video' | 'audio'): EditPlan {
  const lossless = isLossless(fix);
  const v = kind === 'video' ? f.video : null;
  const a = f.audio;
  const secs = f.seconds;
  let video: RunVideo | undefined;
  if (f.video && !v) video = { discard: true };
  else if (v && fix.video === 'encode') {
    const codec = fix.to?.video ?? 'vp9';
    video = {
      codec,
      bitrate: videoBitrate(v.width, v.height, codec, { bps: v.bps, w: v.width, h: v.height, codec: v.codec }),
      keyFrameInterval: KEY_EVERY,
      forceTranscode: true,
    };
  }
  let audio: RunAudio | undefined;
  const dropped = !!a && (!fix.audio || fix.audio === 'drop');
  if (dropped) audio = { discard: true };
  else if (a && fix.audio === 'encode') {
    const codec = fix.to?.audio ?? (can.aac ? 'aac' : 'opus');
    audio = { codec, bitrate: a.channels === 1 ? MONO_BPS : SOUND_BPS, forceTranscode: true, ...(a.channels > 2 ? { numberOfChannels: 2 } : {}) };
  }
  // About how big: the file as it is, less what's left out, when nothing is made again; else the rates it's made at.
  const ownBps = (t: { bps: number | null } | null, rest: number) => t?.bps ?? (secs ? Math.max(0, (f.size * 8) / secs - rest) : 0);
  const abps = !a || dropped ? 0 : audio?.bitrate ?? ownBps(a, v?.bps ?? 0);
  const vbps = !v ? 0 : video?.bitrate ?? ownBps(v, a?.bps ?? 0);
  let estimate: number;
  if (lossless) {
    const less = (dropped && secs ? ((a?.bps ?? 0) * secs) / 8 : 0) + (f.video && !v && secs ? ((f.video.bps ?? 0) * secs) / 8 : 0);
    estimate = Math.round(Math.max(f.size * 0.05, f.size * 1.01 - less));
  } else estimate = secs ? estimateBytes(vbps + abps, secs) : 0;
  const names = [
    ...(v ? [codecName(fix.video === 'encode' ? fix.to?.video : v.codec) ?? 'its video'] : []),
    ...(a ? [dropped ? 'no sound' : (codecName(fix.audio === 'encode' ? fix.to?.audio : a.codec) ?? 'its sound')] : []),
  ];
  const notes: string[] = [];
  if (a && !dropped && f.moreAudio) notes.push(`It has ${f.moreAudio + 1} sound tracks: the converted file keeps ${a.label ? `“${a.label}”` : 'the first'} only.`);
  if (f.subtitles) notes.push('Its subtitles aren’t kept.');
  if (v?.hdr && fix.video === 'encode') notes.push('It’s an HDR video (iPhones film in HDR): converting it may make its colors look a little dull.');
  if (v && fix.video === 'encode' && fix.box === 'mp4' && fix.to?.video !== 'avc')
    notes.push('This browser can’t make H.264 videos, so the video is VP9 in an MP4: it plays in Chrome, Edge, Firefox and the desktop app; some iPhones may not play it.');
  return {
    run: {
      box: fix.box,
      ...(video ? { video } : {}),
      ...(audio ? { audio } : {}),
      // (Copied as they are, a tenth of a second's shift allowed; made again, with its times exact.)
      copy: lossless ? { mode: 'forced', shiftTolerance: 0.1 } : {},
    },
    mime: fixMime(fix.box, kind),
    out: { seconds: secs, ...(v ? { width: v.width, height: v.height } : {}), sound: !!a && !dropped },
    copied: lossless,
    cut: null,
    estimate,
    format: `${fixBoxName(fix.box)}${names.length ? ` (${names.join(', ')})` : ''}`,
    notes,
    label: convertLabel(kind, fix),
  };
}
