// 🗜 A smaller copy for phones, made and put in the game (card-files spec §4.4): made outside the undo history (it takes
// a while, and the host keeps working meanwhile), checked, stored, then put in as one step of its own, which Ctrl+Z
// takes back. History labels and toasts never name the file: the pre-game screen and play show them on stream.
import { app } from '../app.svelte';
import { whileWriting } from '../desktop.svelte';
import { step } from '../history.svelte';
import { dropPhoneCopies, formatBytes, getBlob, putMedia, restoreStash } from '../media.svelte';
import { uniqueMediaName } from '../medianame';
import { newId, type Game, type Id, type MediaRef } from '../model';
import { phoneCopyOf } from '../phonecard';
import { gifInfo, gifToVideo } from './gif';
import { addJob, jobFor } from './jobs.svelte';
import { copyName, gifSize, madeLabel, NOT_SMALLER, planGif, removedLabel, smallEnough, type CopyOf, type GifInfo } from './plan';
import { encodersFor } from './probe';

export const CAME_OUT_WRONG = 'The copy didn’t come out right: nothing was changed.';
export const CHANGED = 'The file changed while the copy was being made: nothing was changed.';

/** A GIF (by its type, else its name). */
export const isGifRef = (m: Pick<MediaRef, 'kind' | 'mime' | 'name'>): boolean => m.kind === 'image' && (m.mime === 'image/gif' || /\.gif$/i.test(m.name));

/** Whether 🗜 makes copies of this file: a GIF stored in the game (not a link, nor a copy itself). */
export const shrinkable = (m: MediaRef): boolean => !m.url && !m.phoneCopy && isGifRef(m);

/** What a file is, for History and toasts ("a GIF"). */
export const copyOfWhat = (m: Pick<MediaRef, 'kind' | 'mime' | 'name'>): CopyOf => (isGifRef(m) ? 'GIF' : m.kind === 'audio' ? 'sound' : 'video');

/** What a copy made and stored is (its bytes are under `id` already). */
export interface StoredCopy {
  id: Id;
  mime: string;
  size: number;
  ext: string;
  width?: number;
  height?: number;
}

/**
 * Inside a step: `made` becomes file `of`'s copy for phones, in place of any earlier one. `range`: the part of the file
 * it holds (none: all of it).
 */
export function applyPhoneCopy(game: Game, of: Id, made: StoredCopy, range?: { from?: number; to?: number | null }): MediaRef {
  const orig = game.media.find((m) => m.id === of);
  if (!orig) throw new Error('That file is no longer in the game.');
  dropPhoneCopies(game, of);
  game.media.push({
    id: made.id,
    name: uniqueMediaName(
      game.media.map((m) => m.name),
      copyName(orig.name, made.ext),
    ),
    mime: made.mime,
    size: made.size,
    kind: made.mime.startsWith('audio/') ? 'audio' : 'video',
    phoneCopy: { of, ...(range ?? {}), ...(made.width && made.height ? { width: made.width, height: made.height } : {}) },
  });
  return game.media[game.media.length - 1];
}

/** As a step of its own: file `of`'s copy for phones goes (phones get the file itself again). */
export function removePhoneCopy(game: Game, of: Id): void {
  const ref = game.media.find((m) => m.id === of);
  if (!ref || !phoneCopyOf(game, ref)) return;
  step(removedLabel(copyOfWhat(ref)), () => dropPhoneCopies(game, of), { place: { tab: 'media', media: of } });
}

/** A copy plays here: a video element nobody sees opens it within 10 s, with a picture, about as long as it should be. */
function playsHere(blob: Blob, seconds: number): Promise<boolean> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    const url = URL.createObjectURL(blob);
    let done = false;
    const end = (ok: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      v.removeAttribute('src');
      v.load();
      URL.revokeObjectURL(url);
      resolve(ok);
    };
    const timer = setTimeout(() => end(false), 10_000);
    v.muted = true;
    v.preload = 'metadata';
    v.onloadedmetadata = () => end(v.videoWidth > 0 && (!Number.isFinite(v.duration) || Math.abs(v.duration - seconds) <= 0.5));
    v.onerror = () => end(false);
    v.src = url;
  });
}

const stopped = () => new DOMException('Stopped', 'AbortError');

/**
 * 🗜 Make a smaller copy of file `of` (in the game in the editor) for phones: queued as a job, which puts the copy in
 * as one step when it's done, unless the file or the game changed meanwhile. Returns the job's id (null: it isn't a file
 * 🗜 makes copies of).
 */
export function queuePhoneCopy(of: Id): string | null {
  const game = app.game;
  const ref = game.media.find((m) => m.id === of);
  if (!ref || !shrinkable(ref)) return null;
  const had = jobFor(of);
  if (had) return had.id;
  const gameId = game.id;
  const what = copyOfWhat(ref);
  return addJob({ kind: 'phone', what, media: of, gameId, copying: false }, async (ctl) => {
    const src = getBlob(of);
    if (!src) return { failed: 'That file isn’t stored in this browser: nothing was changed.' };
    let bytes: Uint8Array;
    let info: GifInfo;
    try {
      bytes = new Uint8Array(await src.arrayBuffer());
      info = gifInfo(bytes);
    } catch {
      return { failed: 'The app can’t read this GIF: nothing was changed.' };
    }
    if (ctl.signal.aborted) throw stopped();
    const size = gifSize(info.width, info.height);
    const plan = planGif(info, await encodersFor(size.width, size.height));
    if ('refuse' in plan) return { failed: plan.refuse };
    ctl.phase('working');
    const made = await gifToVideo(bytes, info, plan, { signal: ctl.signal, onProgress: ctl.progress });
    if (!smallEnough(made.blob.size, src.size)) return { failed: NOT_SMALLER };
    ctl.phase('checking');
    if (!(await playsHere(made.blob, made.seconds))) return { failed: CAME_OUT_WRONG };
    if (ctl.signal.aborted) throw stopped();
    // Still the editor, the same game, and the very file it was made from.
    const same = () => app.screen === 'editor' && !app.editGame && app.game.id === gameId && app.game.media.some((m) => m.id === of) && getBlob(of) === src;
    if (!same()) return { failed: CHANGED };
    ctl.phase('storing');
    const id = newId();
    await whileWriting(() => putMedia(id, made.blob));
    if (ctl.signal.aborted || !same()) {
      await restoreStash(id, null);
      if (ctl.signal.aborted) throw stopped();
      return { failed: CHANGED };
    }
    const copy: StoredCopy = { id, mime: made.mime, size: made.blob.size, ext: plan.ext, width: made.width, height: made.height };
    step(madeLabel(what), () => applyPhoneCopy(app.game, of, copy), { place: { tab: 'media', media: of } });
    return { toast: `🗜 Phones get the smaller copy now: ${formatBytes(made.blob.size)} instead of ${formatBytes(src.size)} (Ctrl+Z takes it back)`, media: id };
  });
}
