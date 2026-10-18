// What a 🗜 copy for phones comes out as (card-files spec §4.6): its size, codec, file type and name, worked out before
// anything is made. Pure, so it's unit-tested.
import type { Encoders } from './probe';
import { NO_WEBCODECS } from './probe';

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
  if (!codec) return { refuse: NO_WEBCODECS };
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

/** The words for what a copy is made as ("MP4 (H.264)"), and for WebM, that some iPhones may not play it. */
export function formatLine(plan: Pick<GifPlan, 'codec'>): string {
  if (plan.codec === 'avc') return 'Made as an MP4 (H.264), which every phone plays.';
  return `Made as a WebM (${plan.codec === 'vp9' ? 'VP9' : 'VP8'}). ${WEBM_NOTE}`;
}

/** A copy's type in a word: "MP4", "WebM". */
export const typeWord = (mime: string): string => ({ 'video/mp4': 'MP4', 'video/webm': 'WebM', 'audio/mp4': 'M4A', 'audio/ogg': 'OGG' })[mime.split(';')[0]] ?? mime;

/** What's copied, for History and toasts (never its name: they can be on stream). */
export type CopyOf = 'video' | 'GIF' | 'sound';
/** History: "Made a smaller copy of a GIF for phones". */
export const madeLabel = (what: CopyOf): string => `Made a smaller copy of a ${what} for phones`;
/** History: "Removed a GIF's smaller copy for phones". */
export const removedLabel = (what: CopyOf): string => `Removed a ${what}’s smaller copy for phones`;

/** "about 40 s left", "about 3 min left". */
export function leftText(seconds: number): string {
  if (seconds < 55) return `about ${Math.max(5, Math.round(seconds / 5) * 5)} s left`;
  return `about ${Math.max(1, Math.round(seconds / 60))} min left`;
}
