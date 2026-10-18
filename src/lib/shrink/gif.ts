// A GIF as a small looping video for phones (card-files spec §4.6): its frames read with omggif, drawn one at a time on
// a canvas that isn't in the page (nobody sees them: a 🤫 card's GIF), and encoded with WebCodecs through mediabunny.
// decodeGif is plain code (tested in Node); gifToVideo needs a browser.
import { GifReader } from 'omggif';
import { GIF_MATTE, type GifInfo, type GifPlan } from './plan';
import type { Made } from './run';
import { blobTarget } from './target';

/** One frame as it shows: every pixel (RGBA, width × height), and how long it stays (seconds). */
export interface GifFrame {
  rgba: Uint8ClampedArray<ArrayBuffer>;
  seconds: number;
}

/** How long a frame stays: its delay, with 0 and 1 hundredths taken as 10, as browsers do. */
const frameSeconds = (delay: number): number => (delay <= 1 ? 10 : delay) / 100;

/** A GIF's size, frames and length (throws when it isn't a GIF omggif can read). */
export function gifInfo(bytes: Uint8Array): GifInfo {
  const r = new GifReader(bytes);
  let seconds = 0;
  for (let i = 0; i < r.numFrames(); i++) seconds += frameSeconds(r.frameInfo(i).delay);
  return { width: r.width, height: r.height, frames: r.numFrames(), seconds };
}

/**
 * A GIF's frames as they show, one after another: each drawn over what the last one left (disposal 0 and 1 keep it, 2
 * clears the frame's own rectangle, 3 puts back what was there before it). The same buffer each time: use a frame before
 * asking for the next.
 */
export function* decodeGif(bytes: Uint8Array): Generator<GifFrame> {
  const r = new GifReader(bytes);
  const { width, height } = r;
  const rgba = new Uint8ClampedArray(new ArrayBuffer(width * height * 4));
  for (let i = 0; i < r.numFrames(); i++) {
    const f = r.frameInfo(i);
    const before = f.disposal === 3 ? rgba.slice() : null;
    r.decodeAndBlitFrameRGBA(i, rgba);
    yield { rgba, seconds: frameSeconds(f.delay) };
    if (f.disposal === 2) {
      // (Only what's on the GIF's own screen.)
      const x0 = Math.min(f.x, width);
      const x1 = Math.min(f.x + f.width, width);
      for (let y = f.y; y < Math.min(f.y + f.height, height); y++) rgba.fill(0, (y * width + x0) * 4, (y * width + x1) * 4);
    } else if (before) rgba.set(before);
  }
}

/** A canvas nobody sees: never in the page. */
function offCanvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

const stopped = () => new DOMException('Stopped', 'AbortError');

/**
 * A GIF as a video, made as `plan` says: each frame matted on the phone card's background (a video has no see-through
 * parts) and scaled, the GIF gone through `plan.loops` times, a key frame every 2 seconds. It gives the page a moment
 * every 10 frames. `signal` stops it (an AbortError).
 */
export async function gifToVideo(bytes: Uint8Array, info: GifInfo, plan: GifPlan, ctl: { signal?: AbortSignal; onProgress?: (done: number) => void } = {}): Promise<Made> {
  const mb = await import('./mb');
  const frame = offCanvas(info.width, info.height);
  const out = offCanvas(plan.width, plan.height);
  const fctx = frame.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  const ctx = out.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  if (!fctx || !ctx) throw new Error('This browser can’t draw the GIF’s frames');
  ctx.imageSmoothingQuality = 'high';
  const t = blobTarget(mb);
  const output = new mb.Output({ format: plan.box === 'mp4' ? new mb.Mp4OutputFormat({ fastStart: false }) : new mb.WebMOutputFormat(), target: t.target });
  const source = new mb.CanvasSource(out, { codec: plan.codec, quality: new mb.Quality({ bitrate: plan.bitrate }), keyFrameInterval: 2 });
  output.addVideoTrack(source);
  const stop = () => void output.cancel().catch(() => {});
  ctl.signal?.addEventListener('abort', stop, { once: true });
  let at = 0;
  try {
    if (ctl.signal?.aborted) throw stopped();
    await output.start();
    const total = info.frames * plan.loops;
    let n = 0;
    for (let loop = 0; loop < plan.loops; loop++)
      for (const f of decodeGif(bytes)) {
        if (ctl.signal?.aborted) throw stopped();
        fctx.putImageData(new ImageData(f.rgba, info.width, info.height), 0, 0);
        ctx.fillStyle = GIF_MATTE;
        ctx.fillRect(0, 0, plan.width, plan.height);
        ctx.drawImage(frame, 0, 0, plan.width, plan.height);
        await source.add(at, f.seconds);
        at += f.seconds;
        ctl.onProgress?.(++n / total);
        if (n % 10 === 0) await new Promise((r) => setTimeout(r));
      }
    if (ctl.signal?.aborted) throw stopped();
    await output.finalize();
  } catch (e) {
    stop();
    throw ctl.signal?.aborted ? stopped() : e;
  } finally {
    ctl.signal?.removeEventListener('abort', stop);
  }
  return { blob: t.blob(plan.mime), mime: plan.mime, seconds: at, width: plan.width, height: plan.height };
}
