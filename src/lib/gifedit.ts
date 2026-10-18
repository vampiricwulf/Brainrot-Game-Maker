// 🎨 Edit image on an animated GIF: the same edits (turn, crop, size, filters, drawing, captions, stickers) go on every
// frame, and it's saved as a GIF again, so it still moves (each frame as long as before, looping as it did).
import { GifReader } from 'omggif';
import { GifFile } from './gifwrite';
import { canvasToBlob, renderForSave } from './imageedit';
import type { ImageEdits } from './model';
import { decodeGif } from './shrink/gif';

/** Frames × finished pixels past which a GIF is too big to edit frame by frame here (about half a minute's work). */
const MAX_WORK = 250_000_000;

/** How many frames a GIF has (0: not a GIF this app reads). */
export function gifFrames(bytes: Uint8Array): number {
  try {
    return new GifReader(bytes).numFrames();
  } catch {
    return 0;
  }
}

/** A file's bytes, from its address in the page (a stored file's blob: URL). Null when it can't be read. */
export async function fileBytes(url: string | undefined): Promise<Uint8Array | null> {
  if (!url) return null;
  try {
    return new Uint8Array(await (await fetch(url)).arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * The file a picture's edits make, and its size: an animated GIF (its bytes in `gif`) stays one, every frame edited;
 * anything else is one picture, a PNG where it can have see-through parts, else a JPEG. `onProgress` hears how far a
 * GIF has got (0 to 1); the page gets a moment between its frames.
 */
export async function editedFile(
  img: HTMLImageElement,
  mime: string,
  e: ImageEdits,
  gif: Uint8Array | null,
  onProgress?: (done: number) => void,
): Promise<{ blob: Blob; ext: string; width: number; height: number }> {
  if (gif && gifFrames(gif) > 1) return { ...(await editGif(gif, e, onProgress)), ext: 'gif' };
  const canvas = renderForSave(img, e);
  const alpha = /png|gif|webp|svg/.test(mime) || e.rotate % 90 !== 0;
  const blob = await canvasToBlob(canvas, alpha ? 'image/png' : 'image/jpeg', 0.92);
  return { blob, ext: alpha ? 'png' : 'jpg', width: canvas.width, height: canvas.height };
}

/** Every frame of an animated GIF edited the same way, as a GIF. */
async function editGif(bytes: Uint8Array, e: ImageEdits, onProgress?: (done: number) => void): Promise<{ blob: Blob; width: number; height: number }> {
  const r = new GifReader(bytes);
  const total = r.numFrames();
  const frame = document.createElement('canvas');
  frame.width = r.width;
  frame.height = r.height;
  const fctx = frame.getContext('2d');
  if (!fctx) throw new Error('the picture is too big to edit here');
  let out: GifFile | null = null;
  let n = 0;
  for (const f of decodeGif(bytes)) {
    fctx.putImageData(new ImageData(f.rgba, r.width, r.height), 0, 0);
    const c = renderForSave(frame, e);
    if (!out) {
      if (c.width * c.height * total > MAX_WORK) throw new Error(`this GIF is too big to edit frame by frame here (${total} frames of ${c.width}×${c.height})`);
      out = new GifFile(c.width, c.height, r.loopCount());
    }
    out.add(c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data, f.seconds);
    onProgress?.(++n / total);
    await new Promise((ok) => setTimeout(ok));
  }
  if (!out) throw new Error('the GIF has no frames');
  return { blob: out.end(), width: out.width, height: out.height };
}
