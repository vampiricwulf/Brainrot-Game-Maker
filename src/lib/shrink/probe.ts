// What this browser can make 🗜 copies with (card-files spec §4.5, §4.13.4): asked of WebCodecs itself (through
// mediabunny's canEncode…), never from a list of browsers. Each answer is asked once a page.
import type { Quality } from 'mediabunny';

/** ok: WebCodecs on a secure page (a file, https://, the desktop app). aac, opus: the sound encoders it has. */
export interface Can {
  ok: boolean;
  aac: boolean;
  opus: boolean;
  why?: string;
}

/** Said where 🗜 can't work at all. */
export const NO_WEBCODECS = '🗜 needs Chrome, Edge, Firefox or the desktop app, with the app opened from a file or an https:// address.';

/** Whether 🗜 may work here, known at once (the probe then says which encoders there are). */
export const shrinkMaybe = (): boolean => !!globalThis.isSecureContext && 'VideoEncoder' in globalThis;

let asked: Promise<Can> | null = null;

/** What this browser can make, asked once a page. */
export function probe(): Promise<Can> {
  return (asked ??= (async (): Promise<Can> => {
    if (!shrinkMaybe()) return { ok: false, aac: false, opus: false, why: NO_WEBCODECS };
    const mb = await import('./mb');
    const [aac, opus] = await Promise.all([mb.canEncodeAudio('aac').catch(() => false), mb.canEncodeAudio('opus').catch(() => false)]);
    return { ok: true, aac, opus };
  })());
}

/** The video encoders there are here, by codec and size (asked once each). */
export type Encoders = { avc: boolean; vp9: boolean; vp8: boolean };
const encoders = new Map<string, Promise<boolean>>();

/** Which of H.264, VP9 and VP8 this browser can make a `w`×`h` video in (at `bps`, when given). */
export async function encodersFor(w: number, h: number, bps?: number): Promise<Encoders> {
  if (!shrinkMaybe()) return { avc: false, vp9: false, vp8: false };
  const mb = await import('./mb');
  const one = (codec: 'avc' | 'vp9' | 'vp8'): Promise<boolean> => {
    const key = `${codec}:${w}×${h}`;
    let p = encoders.get(key);
    if (!p) {
      const quality: Quality | undefined = bps ? new mb.Quality({ bitrate: bps }) : undefined;
      p = mb.canEncodeVideo(codec, { width: w, height: h, ...(quality ? { quality } : {}) }).catch(() => false);
      encoders.set(key, p);
    }
    return p;
  };
  const [avc, vp9, vp8] = await Promise.all([one('avc'), one('vp9'), one('vp8')]);
  return { avc, vp9, vp8 };
}

const hardware = new Map<string, Promise<boolean>>();

/**
 * Whether this computer's graphics chip can make a `w`×`h` video in `codec` (asked once each): in play, a copy is made
 * there when it can, so the stream stutters less. (Asked first, as some browsers take "prefer hardware" as "hardware
 * only" and would fail where there's none.)
 */
export async function hardwareFor(codec: 'avc' | 'vp9' | 'vp8', w: number, h: number): Promise<boolean> {
  if (!shrinkMaybe()) return false;
  const key = `${codec}:${w}×${h}`;
  let p = hardware.get(key);
  if (!p) {
    const mb = await import('./mb');
    p = mb.canEncodeVideo(codec, { width: w, height: h, hardwareAcceleration: 'prefer-hardware' }).catch(() => false);
    hardware.set(key, p);
  }
  return p;
}
