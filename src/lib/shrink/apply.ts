// 🗜 A smaller copy for phones, made and put in the game (card-files spec §4.4, §4.7), and 🔄 a file converted into one
// that plays here, put in its place (§4.12.6): made outside the undo history (it takes a while, and the host keeps
// working meanwhile), checked, stored, then put in as one step of its own, which Ctrl+Z takes back. A copy can be made
// in play too (§4.9): it goes into the game being played, and into the editor's as a step (the pre-game screen's
// Ctrl+Z takes it back). History labels and toasts never name the file: play shows them on stream.
import { app, toast } from '../app.svelte';
import { fileType, SLOW_FILE_BYTES } from '../buzzproto';
import { whileWriting } from '../desktop.svelte';
import { step, whenSettled } from '../history.svelte';
import { ask } from '../ask.svelte';
import { dropPhoneCopies, dropStoredMedia, formatBytes, getBlob, mediaUrls, moveToFile, putMedia, renameForType, restoreStash } from '../media.svelte';
import { flash } from '../nav.svelte';
import { uniqueMediaName } from '../medianame';
import { newId, type AudioEl, type Game, type Id, type MediaRef, type VideoEl } from '../model';
import { phoneCopyOf, phonesGetLink } from '../phonecard';
import { allCardSlides, mediaUsage, slideMediaIds } from '../usage';
import { cardUses } from '../phonecopies';
import { fileLimitsNow } from '../serverlimits.svelte';
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
  planConvert,
  planGif,
  removedLabel,
  smallEnough,
  SOUND_TOO_LONG,
  videoChoices,
  avDefault,
  CANT_READ_EDIT,
  CANT_CUT_SOUND,
  CANT_SIZE,
  editedName,
  lengthText,
  spanSeconds,
  type AvRead,
  type OverCopy,
  type EditExtra,
  type EditPlan,
  type How,
  type CopyOf,
  type CopyPlan,
  type GifInfo,
  type Span,
} from './plan';
import { dismissOffer, markChecked, verdictOf } from './checks.svelte';
import { openMediaDialog } from './dialog.svelte';
import { isLossless, type Fix, type Verdict } from './playable';
import { encodersFor, hardwareFor, probe, shrinkMaybe, type Encoders } from './probe';
import { checkMade, convertBlob, RunError, type Made, type RunReason, type Want } from './run';
import { soundHere } from './sound';
import { itemsPlaying, refitBoxes, retimeUses } from './retime';
import { fixBoxName } from './words';

export const CAME_OUT_WRONG = 'The copy didn’t come out right: nothing was changed.';
export const CHANGED = 'The file changed while the copy was being made: nothing was changed.';
const NOT_STORED = 'That file isn’t stored in this browser: nothing was changed.';

/** A GIF (by its type, else its name). */
export const isGifRef = (m: Pick<MediaRef, 'kind' | 'mime' | 'name'>): boolean => m.kind === 'image' && (m.mime === 'image/gif' || /\.gif$/i.test(m.name));

/** Whether 🗜 makes copies of this file: a GIF, a video or a sound stored in the game (not a link, nor a copy itself). */
export const shrinkable = (m: MediaRef): boolean => !m.url && !m.phoneCopy && (isGifRef(m) || m.kind === 'video' || m.kind === 'audio');

/**
 * Whether 🗜 can make a copy of file `id` of `game` here, for the host panel's 🗜 Make smaller: a GIF, video or sound
 * stored in this browser (not one phones get from its link), where WebCodecs may be.
 */
export function shrinkHere(game: Pick<Game, 'media'>, id: Id): boolean {
  const m = game.media.find((x) => x.id === id);
  return !!m && shrinkMaybe() && shrinkable(m) && !!mediaUrls[m.id] && !phonesGetLink(m);
}

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
 * `over`: its copy, when that came out too big for the buzzer server (only smaller ones are offered then).
 */
export async function readForCopy(ref: MediaRef, blob: Blob, uses: { start?: number; end?: number }[], over?: MediaRef): Promise<AvRead> {
  const kind = ref.kind === 'audio' ? 'audio' : 'video';
  const can = await probe();
  const facts = await readFacts(blob, { duration: 'compute', fps: kind === 'video' });
  const enc: Record<string, Encoders> = {};
  if (kind === 'video' && facts.video && can.ok)
    for (const c of videoChoices(facts.video.width, facts.video.height)) enc[`${c.width}×${c.height}`] = await encodersFor(c.width, c.height, c.bps);
  const was = over && overOf(over, facts.seconds ?? 0);
  return { kind, facts, can, playable: phonesTake(ref), span: cardSpan(uses, facts.seconds), enc, ...(was ? { over: was } : {}) };
}

/** The part of its file a 🗜 copy holds (to null: to the end). */
const copySpan = (pc: NonNullable<MediaRef['phoneCopy']>): Span => ({ from: pc.from ?? 0, to: pc.to ?? null });

/** A 🗜 copy as the plan weighs one that came out too big: its size, its part's length (of a file `length` long), its picture. */
function overOf(c: MediaRef, length: number): OverCopy | undefined {
  const pc = c.phoneCopy;
  return pc && { size: c.size, seconds: spanSeconds(copySpan(pc), length), ...(pc.width && pc.height ? { width: pc.width, height: pc.height } : {}) };
}

/**
 * Whether 🗜 again can make file `ref`'s copy smaller (one that came out too big for the buzzer server): a video's at
 * a smaller picture, or a video's or a sound's of only the part its 🤫 cards play, when that's shorter than the copy's.
 * (A GIF's comes out the same each time, and a sound's is at one size only.)
 */
export function smallerLeft(game: Game, ref: MediaRef | undefined): boolean {
  const pc = ref && phoneCopyOf(game, ref)?.phoneCopy;
  if (!ref || !pc || isGifRef(ref)) return false;
  if (ref.kind === 'video' && (!pc.width || !pc.height || videoChoices(pc.width, pc.height).length > 1)) return true;
  const part = cardSpan(cardUses(game, ref.id), null)?.span;
  const copy = copySpan(pc);
  // (Within the copy's part, and shorter: its end isn't known here, so "to the end" is longer than any time.)
  const end = (t: number | null) => t ?? Infinity;
  return !!part && part.from >= copy.from - 0.05 && end(part.to) <= end(copy.to) + 0.05 && (part.from > copy.from + 0.05 || end(part.to) < end(copy.to) - 0.05);
}

/**
 * Whether 🗜 has a smaller copy of file `ref` to make than the one it has (for the checklist's 🗜): it has none, or one
 * that a buzzer server taking files up to `fileBytes` takes, or one too big that smallerLeft says can be made smaller.
 */
export function shrinksFurther(game: Game, ref: MediaRef, fileBytes: number): boolean {
  const c = phoneCopyOf(game, ref);
  return !c || c.size <= fileBytes || smallerLeft(game, ref);
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
 * Where a copy is made for: the game being played (`play`: the pre-game screen too, its copy kept in the editor's game
 * as well), else the editor's.
 */
function copyFor(): { game: Game; play: boolean } {
  return app.screen === 'play' && app.playGame ? { game: app.playGame, play: true } : { game: app.game, play: false };
}

/** In play: the editor's copy of the game being played has file `of` too (a quick card's file is the game in play's only). */
const editorHas = (of: Id): boolean => !app.playerOnly && !!app.playGame && app.game.id === app.playGame.id && app.game.media.some((m) => m.id === of);

/**
 * The end of every copy's job: `made` checked (as `want` says), stored, then put in as one step, unless the file or
 * the game changed meanwhile. In play (`play`), it goes into the game being played, and into the editor's as a step of
 * its own when that has the file. Returns the job's end.
 */
async function putIn(
  ctl: JobCtl,
  c: { of: Id; src: Blob; gameId: string; what: CopyOf; made: Made; want: Want; ext: string; range: Span | null; playable: boolean; play: boolean },
): Promise<{ toast: string; media: Id } | { failed: string }> {
  const { of, src, gameId, made } = c;
  ctl.phase('checking');
  const bad = await checkMade(made, c.want);
  if (bad) {
    console.warn('A copy for phones came out wrong:', bad);
    return { failed: CAME_OUT_WRONG };
  }
  if (ctl.signal.aborted) throw stopped();
  // Still the editor (or the game being played), the same game, and the very file it was made from.
  const here = (): Game | null =>
    c.play ? (app.screen === 'play' && app.playGame?.id === gameId ? app.playGame : null) : app.screen === 'editor' && !app.editGame && app.game.id === gameId ? app.game : null;
  const same = () => !!here()?.media.some((m) => m.id === of) && getBlob(of) === src;
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
  const label = madeLabel(c.what, c.playable);
  const place = { tab: 'media', media: of } as const;
  let undo = true;
  if (c.play) {
    // (The cards out that have it switch over to the copy: their files go up again, the copy's.)
    applyPhoneCopy(here()!, of, copy, rangeOf(c.range));
    // Kept with the game in the editor too, as a step there (the pre-game screen's Ctrl+Z takes it back).
    undo = editorHas(of);
    if (undo) step(label, () => applyPhoneCopy(app.game, of, copy, rangeOf(c.range)), { during: 'play', place });
    undo &&= app.pregame;
  } else step(label, () => applyPhoneCopy(app.game, of, copy, rangeOf(c.range)), { place });
  const size = formatBytes(made.blob.size);
  const back = undo ? ' (Ctrl+Z takes it back)' : '';
  // (An encoder can go far over its bitrate on a busy picture: a copy still over what this buzzer server takes is kept,
  // as it's smaller, but phones can't get it, and the words say so. 🗜 again offers only smaller ones, where there are.)
  const limit = fileLimitsNow().limits.fileBytes;
  if (made.blob.size > limit) {
    const g = here();
    const next = g && smallerLeft(g, g.media.find((m) => m.id === of)) ? '🗜 again makes a smaller one, or add it from a link' : 'add it from a link instead';
    return { toast: `🗜 Made a smaller copy, but it’s still too big for this buzzer server (${size}; it takes ${formatBytes(limit)}): ${next}${back}`, media: id };
  }
  return {
    toast: c.playable ? `🗜 Phones get the smaller copy now: ${size} instead of ${formatBytes(src.size)}${back}` : `🗜 Phones get a copy they can play now: ${size}${back}`,
    media: id,
  };
}

/** A copy's plan with its video made on the graphics chip, when this computer has one that can (in play). */
async function onHardware(run: CopyPlan['run']): Promise<CopyPlan['run']> {
  const v = run.video;
  if (!v?.codec || !v.width || !v.height || !(await hardwareFor(v.codec, v.width, v.height))) return run;
  return { ...run, video: { ...v, hardwareAcceleration: 'prefer-hardware' } };
}

/**
 * 🗜 Make a smaller copy of file `of` for phones, in the game in the editor, or in play in the game being played (and
 * the editor's): queued as a job, which puts the copy in as one step when it's done, unless the file or the game
 * changed meanwhile. A GIF's is worked out here; a video's or a sound's is `plan` (the dialog's choice). `hardware`:
 * made on the graphics chip where it can be (in play: the stream stutters less). Returns the job's id (null: it isn't a
 * file 🗜 makes copies of, or a video or sound with no plan).
 */
export function queuePhoneCopy(of: Id, plan?: CopyPlan, opts: { hardware?: boolean } = {}): string | null {
  const { game, play } = copyFor();
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
      const hardware = !!opts.hardware && (await hardwareFor(p.codec, p.width, p.height));
      ctl.phase('working');
      const made = await gifToVideo(bytes, info, p, { signal: ctl.signal, onProgress: ctl.progress, hardware });
      if (!smallEnough(made.blob.size, src.size)) return { failed: NOT_SMALLER };
      return putIn(ctl, { of, src, gameId, what, made, want: { seconds: made.seconds, width: p.width, height: p.height, sound: false }, ext: p.ext, range: null, playable: true, play });
    });
  if (!plan) return null;
  return addJob({ kind: 'phone', what, media: of, gameId, copying: false }, async (ctl) => {
    const src = getBlob(of);
    if (!src) return { failed: NOT_STORED };
    const run = opts.hardware ? await onHardware(plan.run) : plan.run;
    ctl.phase('working');
    let made: Made;
    try {
      made = plan.here ? await soundHere(src, { ...plan.here, mime: plan.mime, range: plan.range }, ctl) : await convertBlob(src, run, plan.mime, ctl);
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
    return putIn(ctl, { of, src, gameId, what, made, want, ext: plan.ext, range: plan.range, playable: plan.playable, play });
  });
}

// ---------- 🔄 Convert (card-files spec §4.12.6) ----------

/** What 🔄 Convert (or ↻, for one that plays here but not on phones) would do with file `id` as its bytes are now. */
export function convertFix(id: Id): { fix: Fix; v: Verdict } | null {
  const v = verdictOf(id);
  if (typeof v !== 'object') return null;
  const fix = v.is === 'plays' ? v.repack : v.is === 'unknown' ? null : v.fix;
  return fix ? { fix, v } : null;
}

/**
 * Inside a step: converted bytes `to` (of type `made.mime`) take file `id`'s place everywhere it's used, the ref too,
 * its name's extension following its type. Undo puts the old one back.
 */
export function applyConvert(game: Game, id: Id, to: Id, made: { mime: string; size: number }): MediaRef {
  const ref = moveToFile(game, id, to, made);
  renameForType(game, ref, made.mime);
  return ref;
}

export const CONVERT_CHANGED = 'The file changed while it was being worked on: nothing was changed.';

/** Why a file couldn't be converted, in a few words after "couldn't be converted: ". */
function convertReason(why: RunReason | 'unreadable-now'): string {
  switch (why) {
    case 'cannot-copy':
      return 'it couldn’t be repackaged as it is';
    case 'undecodable':
      return 'this browser can’t read it';
    case 'no-encoder':
      return 'this browser can’t make it';
    case 'unreadable':
    case 'unreadable-now':
      return 'the app can’t read it';
    default:
      return 'it didn’t come out right';
  }
}

const MiB = 1024 * 1024;

/**
 * Whether there's room in this browser's storage for a big new file (`bytes`): when it may not fit, the host is asked
 * whether to go ahead, keeping it in memory until 💾 Save.
 */
async function roomFor(bytes: number): Promise<boolean> {
  if (bytes <= 256 * MiB) return true;
  const est = await navigator.storage?.estimate?.().catch(() => null);
  if (!est?.quota || est.usage === undefined) return true;
  const left = est.quota - est.usage;
  if (left >= 1.2 * bytes) return true;
  const gb = (n: number) => `${(n / 1024 ** 3).toFixed(1)} GB`;
  return ask(`This needs about ${gb(bytes)} of room, and this browser has about ${gb(Math.max(0, left))} left for the app's files. The new file would be kept in memory only until you 💾 Save. Go ahead?`, {
    ok: 'Go ahead',
  });
}

/**
 * 🔄 Convert file `id` of `game` (in the editor) as its verdict's fix says, or ↻ repackage one phones can't open: made
 * outside the undo history as a job, checked, stored, then put in its place as one step, unless the file or the game
 * changed meanwhile. `batch`: jobs started together (ConvertDialog), which one toast sums up. Returns the job's id
 * (null: there's nothing to do for it).
 */
export function queueConvert(game: Game, id: Id, batch?: string): string | null {
  const ref = game.media.find((m) => m.id === id);
  if (!ref || ref.url || ref.phoneCopy || (ref.kind !== 'video' && ref.kind !== 'audio')) return null;
  const had = jobFor(id);
  if (had) return had.id;
  const c = convertFix(id);
  const src = getBlob(id);
  if (!c || !src) return null;
  const { fix, v } = c;
  const kind = ref.kind;
  const what = kind === 'audio' ? 'sound' : 'video';
  const gameId = game.id;
  const failed = (why: RunReason | 'unreadable-now') => {
    const reason = convertReason(why);
    return { failed: `${reason[0].toUpperCase()}${reason.slice(1)}: nothing was changed.`, toast: `🔄 A ${what} couldn’t be converted: ${reason}. Nothing was changed.` };
  };
  return addJob({ kind: 'convert', what, media: id, gameId, batch, copying: isLossless(fix) }, async (ctl) => {
    const facts = await readFacts(src, { duration: 'compute' });
    if (!facts.box) return failed('unreadable-now');
    const plan = planConvert(facts, fix, await probe(), kind);
    if (ctl.signal.aborted) throw stopped();
    ctl.phase('working');
    let made: Made;
    try {
      made = await convertBlob(src, plan.run, plan.mime, ctl);
    } catch (e) {
      if (e instanceof RunError) {
        console.warn('A file couldn’t be converted:', e.reason, e.message);
        return failed(e.reason);
      }
      throw e;
    }
    if (ctl.signal.aborted) throw stopped();
    ctl.phase('checking');
    const bad = await checkMade(made, { ...plan.out, seconds: plan.out.seconds ?? made.seconds });
    if (bad) {
      console.warn('A converted file came out wrong:', bad);
      return failed('check');
    }
    if (ctl.signal.aborted || !(await roomFor(made.blob.size))) throw stopped();
    // Still the editor, the same game, and the very file it was made from.
    const same = () => app.screen === 'editor' && !app.editGame && app.game.id === gameId && app.game.media.some((m) => m.id === id) && getBlob(id) === src;
    // (Not while a step is being made, a drag or a file being stored: the conversion's would join it.)
    await whenSettled();
    if (ctl.signal.aborted) throw stopped();
    if (!same()) return { failed: CONVERT_CHANGED, toast: CONVERT_CHANGED };
    ctl.phase('storing');
    const to = newId();
    await whileWriting(() => putMedia(to, made.blob));
    await whenSettled();
    if (ctl.signal.aborted || !same()) {
      await dropStoredMedia(to);
      if (ctl.signal.aborted) throw stopped();
      return { failed: CONVERT_CHANGED, toast: CONVERT_CHANGED };
    }
    // (At once after the checks: nothing can change in between. The ops say where it was.)
    step(plan.label, () => applyConvert(app.game, id, to, { mime: made.mime, size: made.blob.size }));
    markChecked(made.blob, { is: 'plays', repack: null });
    dismissOffer(id);
    flash(`media:${to}`);
    const box = fixBoxName(fix.box);
    if (v.is === 'plays') return { toast: `↻ Repackaged as ${box}: nothing lost, and phones can open it now. Ctrl+Z puts the old one back.`, media: to };
    const silent = fix.audio === 'drop' ? ' (without its sound)' : '';
    return { toast: `🔄 It plays here now${silent}: ${box}, ${formatBytes(made.blob.size)} (was ${formatBytes(src.size)}). Ctrl+Z puts the old one back.`, media: to };
  });
}

/** 🔄 or ↻ on a file: a quick one (nothing re-encoded) runs at once; otherwise its window opens first, saying what it costs. */
export function convertNow(game: Game, id: Id): void {
  const c = convertFix(id);
  if (!c) return;
  if (isLossless(c.fix)) queueConvert(game, id);
  else openMediaDialog({ mode: 'convert', ids: [id] });
}

/** A file's type as phones know it, for "phones can't open MKV files": its name's extension ("MKV"). */
export const typeName = (m: Pick<MediaRef, 'name'>): string => (m.name.match(/\.([a-z0-9]{1,5})$/i)?.[1] ?? '').toUpperCase();

// ---------- ✎ Edit (card-files spec §4.11.6) ----------

export const EDIT_WRONG = 'The edit didn’t come out right: nothing was changed.';

/**
 * Whether ✎ Edit… is offered for file `m` here: in the editor, for a video or sound stored in this browser (not a
 * link, a missing file or a 🗜 copy) that plays here, or hasn't been checked yet. 'busy': a job is working on it
 * (offered, but not now). Null: not offered.
 */
export function editOffer(m: MediaRef | undefined): 'on' | 'busy' | null {
  if (!m || (m.kind !== 'video' && m.kind !== 'audio') || m.url || m.phoneCopy || !mediaUrls[m.id]) return null;
  if (app.screen !== 'editor' || app.editGame || app.playerOnly) return null;
  const v = verdictOf(m.id);
  if (typeof v === 'object' && v.is !== 'plays' && v.is !== 'silent') return null;
  return jobFor(m.id) ? 'busy' : 'on';
}

/** The video or sound item with this id playing file `media` in `game` (null: it's gone, or plays another now). */
function findItem(game: Game, itemId: string, media: Id): VideoEl | AudioEl | null {
  return itemsPlaying(game, media).find((el) => el.id === itemId) ?? null;
}

/**
 * Inside a step: edited bytes `to` (of type `made.mime`) go in as `how` says. 'all': in file `id`'s place everywhere
 * it's used (its name's extension following its type), the items playing it retimed and their boxes refitted.
 * 'item': a new file, for that one item only (retimed and refitted). 'new': a new file next to it, nothing else
 * changed. Returns the new file's ref and how the items' times went.
 */
export function applyFileEdit(
  game: Game,
  id: Id,
  to: Id,
  made: { mime: string; size: number },
  plan: Pick<EditPlan, 'cut'> & Pick<EditExtra, 'aspect'>,
  how: How,
  itemId?: string,
): { ref: MediaRef; times: { kept: number; clipped: number; whole: number } } {
  const none = { kept: 0, clipped: 0, whole: 0 };
  if (how === 'all') {
    const ref = moveToFile(game, id, to, made);
    renameForType(game, ref, made.mime);
    const times = plan.cut ? retimeUses(game, to, plan.cut) : none;
    if (plan.aspect) refitBoxes(game, to, plan.aspect.was, plan.aspect.now);
    return { ref, times };
  }
  const orig = game.media.find((m) => m.id === id);
  if (!orig) throw new Error('That file is no longer in the game.');
  const item = how === 'item' && itemId ? findItem(game, itemId, id) : null;
  if (how === 'item' && !item) throw new Error('That item is no longer in the game.');
  game.media.push({
    id: to,
    name: uniqueMediaName(
      game.media.map((m) => m.name),
      editedName(orig.name, made.mime),
    ),
    mime: made.mime,
    size: made.size,
    kind: orig.kind,
  });
  const ref = game.media[game.media.length - 1];
  if (!item) return { ref, times: none };
  item.media = to;
  const times = plan.cut ? retimeUses(game, to, plan.cut, item) : none;
  if (plan.aspect && item.kind === 'video') refitBoxes(game, to, plan.aspect.was, plan.aspect.now, item);
  return { ref, times };
}

/** Why an edit of a `kind` file couldn't be made, as the host is told. */
function editFailed(e: RunError, kind: 'video' | 'audio'): string {
  // (A sound needs no encoder unless it can't be cut there as it is: that's never about a video's size.)
  if (e.reason === 'no-encoder') return kind === 'audio' ? CANT_CUT_SOUND : CANT_SIZE;
  if (e.reason === 'unreadable') return `${CANT_READ_EDIT.replace(/\.$/, '')}: nothing was changed.`;
  return EDIT_WRONG;
}

/**
 * ✎ Edit file `id` of `game` (in the editor) as `plan` says, put in as `how` says (`item`: the one slide item, for
 * 'item'): made outside the undo history as a job, checked, stored, then put in as one step, unless the file, the item
 * or the game changed meanwhile. `remakeCopy`: its 🗜 copy for phones went with the old file, so a new one is made
 * after (another job). Returns the job's id (null: it isn't a file ✎ edits).
 */
export function queueFileEdit(game: Game, id: Id, plan: EditPlan & EditExtra, how: How, item?: VideoEl | AudioEl, remakeCopy = false): string | null {
  const ref = game.media.find((m) => m.id === id);
  if (!ref || ref.url || ref.phoneCopy || (ref.kind !== 'video' && ref.kind !== 'audio')) return null;
  const had = jobFor(id);
  if (had) return had.id;
  const src = getBlob(id);
  if (!src) return null;
  const kind = ref.kind;
  const what = kind === 'audio' ? 'sound' : 'video';
  const gameId = game.id;
  const itemId = how === 'item' ? item?.id : undefined;
  if (how === 'item' && !itemId) return null;
  const others = Math.max(0, (mediaUsage(game).get(id) ?? 1) - 1);
  return addJob({ kind: 'edit', what, media: id, gameId, copying: plan.copied }, async (ctl) => {
    ctl.phase('working');
    let made: Made;
    try {
      made = await convertBlob(src, plan.run, plan.mime, ctl);
    } catch (e) {
      if (e instanceof RunError) {
        console.warn('A file couldn’t be edited:', e.reason, e.message);
        return { failed: editFailed(e, kind) };
      }
      throw e;
    }
    if (ctl.signal.aborted) throw stopped();
    ctl.phase('checking');
    const bad = await checkMade(made, { ...plan.out, seconds: plan.out.seconds ?? made.seconds });
    if (bad) {
      console.warn('An edited file came out wrong:', bad);
      return { failed: EDIT_WRONG };
    }
    if (ctl.signal.aborted || !(await roomFor(made.blob.size))) throw stopped();
    // Still the editor, the same game, the very file it was made from (and, for one item, that item on it).
    const same = () =>
      app.screen === 'editor' &&
      !app.editGame &&
      app.game.id === gameId &&
      app.game.media.some((m) => m.id === id) &&
      getBlob(id) === src &&
      (!itemId || !!findItem(app.game, itemId, id));
    // (Not while a step is being made, a drag or a file being stored: the edit's would join it.)
    await whenSettled();
    if (ctl.signal.aborted) throw stopped();
    if (!same()) return { failed: CONVERT_CHANGED };
    ctl.phase('storing');
    const to = newId();
    await whileWriting(() => putMedia(to, made.blob));
    await whenSettled();
    if (ctl.signal.aborted || !same()) {
      await dropStoredMedia(to);
      if (ctl.signal.aborted) throw stopped();
      return { failed: CONVERT_CHANGED };
    }
    // (At once after the checks: nothing can change in between. The ops say where it was.)
    const { times } = step(plan.labels[how], () => applyFileEdit(app.game, id, to, { mime: made.mime, size: made.blob.size }, plan, how, itemId));
    markChecked(made.blob, { is: 'plays', repack: null });
    // (One that played without its sound plays now: it's left out of what was made.)
    if (how === 'all') dismissOffer(id);
    flash(`media:${to}`);
    if (remakeCopy && how === 'all') void remakePhoneCopy(to);
    if (how === 'new') return { toast: '✂ Saved as a new file in 🖼 Media: the original is unchanged.', media: to };
    if (how === 'item')
      return { toast: `✂ This item plays its own edited copy now: ${others === 1 ? 'the other place keeps' : `the other ${others} places keep`} the original.`, media: to };
    const length = made.seconds ?? plan.out.seconds;
    const bits = [
      ...(length ? [lengthText(length)] : []),
      ...(kind === 'video' && plan.aspect && made.width ? [`${made.width}×${made.height}`] : []),
      `${formatBytes(made.blob.size)} (was ${formatBytes(src.size)})`,
    ];
    const verb = kind === 'video' && !/^Trimmed/.test(plan.labels.all) ? 'edited' : 'trimmed';
    const whole = times.whole
      ? ` ${times.whole} slide item${times.whole === 1 ? '' : 's'} played a part you cut out: ${times.whole === 1 ? 'it plays' : 'they play'} the whole clip now.`
      : '';
    return { toast: `✂ ${what === 'sound' ? 'Sound' : 'Video'} ${verb}: ${bits.join(', ')}. Ctrl+Z puts the old one back.${whole}`, media: to };
  });
}

/** A new 🗜 copy for phones of file `id` (just edited), as 🗜 makes one unasked: another job, after this one. */
async function remakePhoneCopy(id: Id): Promise<void> {
  const ref = app.game.media.find((m) => m.id === id);
  const blob = getBlob(id);
  if (!ref || !blob) return;
  try {
    const plan = avDefault(await readForCopy(ref, blob, cardUses(app.game, id)), fileLimitsNow().limits.fileBytes);
    if ('refuse' in plan) return void toast(`🗜 Its copy for phones wasn’t made again: ${plan.refuse[0].toLowerCase()}${plan.refuse.slice(1)}.`);
    queuePhoneCopy(id, plan);
  } catch (e) {
    console.warn('The copy for phones couldn’t be planned', e);
  }
}
