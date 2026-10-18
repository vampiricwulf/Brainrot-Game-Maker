// 🗜 A smaller copy for phones, made and put in the game (card-files spec §4.4, §4.7): made outside the undo history (it
// takes a while, and the host keeps working meanwhile), checked, stored, then put in as one step of its own, which
// Ctrl+Z takes back. History labels and toasts never name the file: the pre-game screen and play show them on stream.
import { app } from '../app.svelte';
import { fileType, SLOW_FILE_BYTES } from '../buzzproto';
import { whileWriting } from '../desktop.svelte';
import { step, whenSettled } from '../history.svelte';
import { dropPhoneCopies, formatBytes, getBlob, mediaUrls, putMedia, restoreStash } from '../media.svelte';
import { uniqueMediaName } from '../medianame';
import { newId, type Game, type Id, type MediaRef } from '../model';
import { phoneCopyOf, phonesGetLink } from '../phonecard';
import { allCardSlides, slideMediaIds } from '../usage';
import { readFacts } from './facts';
import { gifInfo, gifToVideo } from './gif';
import { addJob, jobFor, type JobCtl } from './jobs.svelte';
import {
  CANT_READ_FILE,
  CANT_READ_VIDEO,
  cardSpan,
  COPY_MAX_SHARE,
  copyName,
  gifSize,
  madeLabel,
  NOT_SMALLER,
  planGif,
  removedLabel,
  smallEnough,
  SOUND_TOO_LONG,
  videoChoices,
  type AvRead,
  type CopyOf,
  type CopyPlan,
  type GifInfo,
  type Span,
} from './plan';
import { encodersFor, probe, type Encoders } from './probe';
import { checkMade, convertBlob, RunError, type Made, type Want } from './run';
import { soundHere } from './sound';

export const CAME_OUT_WRONG = 'The copy didn’t come out right: nothing was changed.';
export const CHANGED = 'The file changed while the copy was being made: nothing was changed.';
const NOT_STORED = 'That file isn’t stored in this browser: nothing was changed.';

/** A GIF (by its type, else its name). */
export const isGifRef = (m: Pick<MediaRef, 'kind' | 'mime' | 'name'>): boolean => m.kind === 'image' && (m.mime === 'image/gif' || /\.gif$/i.test(m.name));

/** Whether 🗜 makes copies of this file: a GIF, a video or a sound stored in the game (not a link, nor a copy itself). */
export const shrinkable = (m: MediaRef): boolean => !m.url && !m.phoneCopy && (isGifRef(m) || m.kind === 'video' || m.kind === 'audio');

/** Phones play this file as it is: its type is one they take (a GIF always is). */
export const phonesTake = (m: Pick<MediaRef, 'kind' | 'mime' | 'name'>): boolean => isGifRef(m) || !!fileType(m.mime)?.startsWith(`${m.kind}/`);

/** What a file is, for History and toasts ("a GIF"). */
export const copyOfWhat = (m: Pick<MediaRef, 'kind' | 'mime' | 'name'>): CopyOf => (isGifRef(m) ? 'GIF' : m.kind === 'audio' ? 'sound' : 'video');

/**
 * The files on 🤫 cards that are big for phones (over SLOW_FILE_BYTES, or over what the buzzer server takes) and have no
 * copy yet, that 🗜 can make one of here: 🖼 Media's "🗜 3 files are big for phones" (one step a file).
 */
export function bigForPhones(game: Game, fileBytes: number): MediaRef[] {
  const onCards = new Set(allCardSlides(game).flatMap(({ slide }) => slideMediaIds(slide)));
  return game.media.filter(
    (m) => onCards.has(m.id) && shrinkable(m) && !!mediaUrls[m.id] && !phoneCopyOf(game, m) && !phonesGetLink(m) && !jobFor(m.id) && m.size > Math.min(SLOW_FILE_BYTES, fileBytes),
  );
}

/**
 * A video or sound read for 🗜's dialog (`uses`: where its 🤫 cards' items start and stop): what's in it (its length
 * worked out when its header doesn't say), what this browser makes, and the encoders there are at each choice's size.
 */
export async function readForCopy(ref: MediaRef, blob: Blob, uses: { start?: number; end?: number }[]): Promise<AvRead> {
  const kind = ref.kind === 'audio' ? 'audio' : 'video';
  const can = await probe();
  const facts = await readFacts(blob, { duration: 'compute', fps: kind === 'video' });
  const enc: Record<string, Encoders> = {};
  if (kind === 'video' && facts.video && can.ok)
    for (const c of videoChoices(facts.video.width, facts.video.height)) enc[`${c.width}×${c.height}`] = await encodersFor(c.width, c.height, c.bps);
  return { kind, facts, can, playable: phonesTake(ref), span: cardSpan(uses, facts.seconds), enc };
}

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

/** A copy's range as MediaRef.phoneCopy keeps it (none: the whole file). */
const rangeOf = (span: Span | null): { from?: number; to?: number | null } | undefined =>
  span ? { ...(span.from > 0 ? { from: span.from } : {}), ...(span.to !== null ? { to: span.to } : span.from > 0 ? { to: null } : {}) } : undefined;

/** As a step of its own: file `of`'s copy for phones goes (phones get the file itself again). */
export function removePhoneCopy(game: Game, of: Id): void {
  const ref = game.media.find((m) => m.id === of);
  if (!ref || !phoneCopyOf(game, ref)) return;
  step(removedLabel(copyOfWhat(ref)), () => dropPhoneCopies(game, of), { place: { tab: 'media', media: of } });
}

const stopped = () => new DOMException('Stopped', 'AbortError');

/** Why a copy couldn't be made, as the host is told. */
function runFailed(e: RunError, what: CopyOf): string {
  switch (e.reason) {
    case 'unreadable':
      return `${CANT_READ_FILE}: nothing was changed.`;
    case 'undecodable':
      return what === 'sound' ? 'This browser can’t read this sound’s format. Add it as MP3 or M4A, or from a link: nothing was changed.' : `${CANT_READ_VIDEO}: nothing was changed.`;
    case 'no-encoder':
      return 'This browser can’t make this copy: nothing was changed.';
    case 'too-long':
      return `${SOUND_TOO_LONG}: nothing was changed.`;
    default:
      return CAME_OUT_WRONG;
  }
}

/**
 * The end of every copy's job: `made` checked (as `want` says), stored, then put in as one step, unless the file or
 * the game changed meanwhile. Returns the job's end.
 */
async function putIn(
  ctl: JobCtl,
  c: { of: Id; src: Blob; gameId: string; what: CopyOf; made: Made; want: Want; ext: string; range: Span | null; playable: boolean },
): Promise<{ toast: string; media: Id } | { failed: string }> {
  const { of, src, gameId, made } = c;
  ctl.phase('checking');
  const bad = await checkMade(made, c.want);
  if (bad) {
    console.warn('A copy for phones came out wrong:', bad);
    return { failed: CAME_OUT_WRONG };
  }
  if (ctl.signal.aborted) throw stopped();
  // Still the editor, the same game, and the very file it was made from.
  const same = () => app.screen === 'editor' && !app.editGame && app.game.id === gameId && app.game.media.some((m) => m.id === of) && getBlob(of) === src;
  // (Not while a step is being made, a drag or a file being stored: the copy's would join it, and take its name.)
  await whenSettled();
  if (ctl.signal.aborted) throw stopped();
  if (!same()) return { failed: CHANGED };
  ctl.phase('storing');
  const id = newId();
  await whileWriting(() => putMedia(id, made.blob));
  await whenSettled();
  if (ctl.signal.aborted || !same()) {
    await restoreStash(id, null);
    if (ctl.signal.aborted) throw stopped();
    return { failed: CHANGED };
  }
  // (At once after the checks: nothing can change in between.)
  const copy: StoredCopy = { id, mime: made.mime, size: made.blob.size, ext: c.ext, width: made.width, height: made.height };
  step(madeLabel(c.what, c.playable), () => applyPhoneCopy(app.game, of, copy, rangeOf(c.range)), { place: { tab: 'media', media: of } });
  const size = formatBytes(made.blob.size);
  return {
    toast: c.playable ? `🗜 Phones get the smaller copy now: ${size} instead of ${formatBytes(src.size)} (Ctrl+Z takes it back)` : `🗜 Phones get a copy they can play now: ${size} (Ctrl+Z takes it back)`,
    media: id,
  };
}

/**
 * 🗜 Make a smaller copy of file `of` (in the game in the editor) for phones: queued as a job, which puts the copy in
 * as one step when it's done, unless the file or the game changed meanwhile. A GIF's is worked out here; a video's or a
 * sound's is `plan` (the dialog's choice). Returns the job's id (null: it isn't a file 🗜 makes copies of, or a video or
 * sound with no plan).
 */
export function queuePhoneCopy(of: Id, plan?: CopyPlan): string | null {
  const game = app.game;
  const ref = game.media.find((m) => m.id === of);
  if (!ref || !shrinkable(ref)) return null;
  const had = jobFor(of);
  if (had) return had.id;
  const gameId = game.id;
  const what = copyOfWhat(ref);
  if (what === 'GIF')
    return addJob({ kind: 'phone', what, media: of, gameId, copying: false }, async (ctl) => {
      const src = getBlob(of);
      if (!src) return { failed: NOT_STORED };
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
      const p = planGif(info, await encodersFor(size.width, size.height));
      if ('refuse' in p) return { failed: p.refuse };
      ctl.phase('working');
      const made = await gifToVideo(bytes, info, p, { signal: ctl.signal, onProgress: ctl.progress });
      if (!smallEnough(made.blob.size, src.size)) return { failed: NOT_SMALLER };
      return putIn(ctl, { of, src, gameId, what, made, want: { seconds: made.seconds, width: p.width, height: p.height, sound: false }, ext: p.ext, range: null, playable: true });
    });
  if (!plan) return null;
  return addJob({ kind: 'phone', what, media: of, gameId, copying: false }, async (ctl) => {
    const src = getBlob(of);
    if (!src) return { failed: NOT_STORED };
    ctl.phase('working');
    let made: Made;
    try {
      made = plan.here ? await soundHere(src, { ...plan.here, mime: plan.mime, range: plan.range }, ctl) : await convertBlob(src, plan.run, plan.mime, ctl);
    } catch (e) {
      if (e instanceof RunError) {
        console.warn('A copy for phones couldn’t be made:', e.reason, e.message);
        return { failed: runFailed(e, what) };
      }
      throw e;
    }
    if (ctl.signal.aborted) throw stopped();
    // (One phones can play as it is has to be worth it.)
    if (plan.playable && !(made.blob.size < COPY_MAX_SHARE * src.size))
      return { failed: `It came out hardly smaller (${formatBytes(made.blob.size)} of ${formatBytes(src.size)}): nothing was changed.` };
    const want: Want = { ...plan.out, seconds: plan.out.seconds ?? made.seconds };
    return putIn(ctl, { of, src, gameId, what, made, want, ext: plan.ext, range: plan.range, playable: plan.playable });
  });
}
