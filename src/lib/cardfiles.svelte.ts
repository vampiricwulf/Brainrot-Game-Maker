// 🤫 Card files (partner-clues spec §13.5): a card's pictures, GIFs, videos and sounds from this computer, put in the
// buzzer room for the phones the card is sent to. Only the host's presses start an upload: a send (a partner clue's
// sent cards, and the cards out with 🤫 Send a card… or from a tile's panel: Session.cards) or ⇡ Get it ready
// (PartnerState.ready); a reload only finishes what one of those started (filesWanted). Pictures are shrunk here first;
// one file goes up at a time, and stops as soon as no card wants it. One the room holds already isn't sent again. The
// panel counts them ("uploading 1 of 2 (34%)…") and never names them.
import { fileType, isFileId, mbText, SLOW_FILE_BYTES } from './buzzproto';
import { canvasToBlob, loadImage } from './imageedit';
import { fileDigest, mediaUrls, storedBlob } from './media.svelte';
import type { Clue, Game, Id, PartnerState, Session, Slide } from './model';
import { cardHash, cardSends, cardSlides, filesWanted } from './partner';
import { filesToSend, phoneCard, sendsOf, shrinks, type LeftOut, type PhoneCan } from './phonecard';
import { cardsOut, sentSlide } from './sentcards';
import { forgetCardFiles, remote, roomHasFiles, uploadCardFile } from './remote.svelte';
import { fileLimitsNow } from './serverlimits.svelte';

/** A picture's longest side on a phone, and how it's packed (WebP, else JPEG). */
export const SHRINK_PX = 1600;
export const SHRINK_QUALITY = 0.85;

/** One file on its way to room `code` (by media id): waiting its turn, going up, up, or turned down (why, in words). */
interface Upload {
  code: string;
  state: 'waiting' | 'uploading' | 'done' | 'failed';
  why?: LeftOut;
  error?: string;
  /** Tries that didn't reach the buzzer server (a network blip), each tried again a little later: RETRIES at most. */
  tries?: number;
  /** Waiting until then (Date.now()) after such a try: its timer lifts it. */
  after?: number;
  /** How much of it went up (0 to 1), while it goes. */
  progress?: number;
}

/** A file that didn't reach the buzzer server goes again this many times (5 s, 10 s, then 15 s later), then no more. */
const RETRIES = 3;
/** A big one (over SLOW_FILE_BYTES) only once more: each try may take minutes on a slow line. */
const RETRIES_BIG = 1;

export const uploads = $state<{ jobs: Record<Id, Upload> }>({ jobs: {} });

/** Whether one is going up now (one at a time). */
let busy = false;
/** The one going up now (by media id), and what stops it. */
let going: { id: Id; stop: AbortController } | null = null;

/** The files the room holds now (its id for each, by media id), or null when it takes none. */
export function heldFiles(session: Pick<Session, 'remote'>): Record<Id, string> | null {
  const r = session.remote;
  if (!r || !roomHasFiles()) return null;
  if (r.files?.code !== r.code || typeof r.files.ids !== 'object' || !r.files.ids) return {};
  // (Until the room says which it holds, the ones put there are taken as there.)
  const have = remote.files;
  return Object.fromEntries(Object.entries(r.files.ids).filter(([, id]) => typeof id === 'string' && (!have || have.includes(id))));
}

/** Every file put in this room (by media id), whether it still holds it or not. */
function putFiles(session: Pick<Session, 'remote'>): Record<Id, string> {
  const r = session.remote;
  return r?.files?.code === r?.code && r?.files?.ids && typeof r.files.ids === 'object' ? r.files.ids : {};
}

/** The files whose upload was turned down in this room, and why. */
export function failedFiles(session: Pick<Session, 'remote'>): Record<Id, LeftOut> {
  const code = session.remote?.code;
  return Object.fromEntries(Object.entries(uploads.jobs).flatMap(([id, j]) => (j.code === code && j.state === 'failed' ? [[id, j.why ?? 'failed']] : [])));
}

/**
 * What the phones can get now (phoneCard's `can`): the room's files, those turned down, how big a file its server
 * takes, which 🗜 copies for phones are here, and whether the room shows a GIF's copy like a GIF. Only listing a card's
 * files: `{ ...phoneCan(session), files: {} }`, so the same file is picked as goes up (a copy or its file).
 */
export const phoneCan = (session: Pick<Session, 'remote'>): PhoneCan => {
  const lim = fileLimitsNow();
  return { files: heldFiles(session), failed: failedFiles(session), fileBytes: lim.limits.fileBytes, stored: (id) => id in mediaUrls, gifs: lim.gifs };
};

/** The files of the open partner clue's cards that are out (sent, not edited since) or got ready (⇡), by media id. */
let wantedNow = new Set<Id>();

/** The files of the cards that are out or got ready now: any other upload isn't wanted (taken back, the tile closed). */
function cardsWanting(game: Game, session: Session, clue: Clue, s: PartnerState): Id[] {
  return cardSlides(clue)
    .filter((c) => {
      const sends = cardSends(s, c.id);
      return (sends.length > 0 && sends.every((x) => x.hash === cardHash(c))) || !!s.ready?.includes(c.id);
    })
    .flatMap((c) => phoneCard(game, c, { ...phoneCan(session), files: {} }).items.flatMap((i) => (i.file && sendsOf(i) ? [sendsOf(i)!] : [])));
}

/** The cards out with 🤫 Send a card… or from a tile's panel, as they went (not edited since): what's on each. */
function sentSlides(game: Game, session: Session): Slide[] {
  return cardsOut(game, session).flatMap((c) => {
    const slide = sentSlide(game, c);
    return slide && cardHash(slide) === c.hash ? [slide] : [];
  });
}

/**
 * Starts the uploads the cards out want now (the open partner clue's: filesWanted, what was sent or got ready; and the
 * cards sent with 🤫 Send a card… or from a tile's panel) that aren't in the room, and drops the waiting ones no card
 * wants any more (✖ Take back, the tile closed: `clue` undefined). Play calls it whenever those change; nothing else
 * starts one.
 */
export function syncUploads(game: Game, session: Session, clue: Clue | undefined): void {
  const s = session.partner;
  const code = session.remote?.code;
  const live = !!s && !!clue && clue.id === s.clue;
  const sent = sentSlides(game, session);
  const can = phoneCan(session);
  const mine = (slide: Slide) => phoneCard(game, slide, { ...can, files: {} }).items.flatMap((i) => (i.file && sendsOf(i) ? [sendsOf(i)!] : []));
  wantedNow = new Set([...(live ? cardsWanting(game, session, clue!, s!) : []), ...sent.flatMap(mine)]);
  for (const [id, j] of Object.entries(uploads.jobs)) if (j.state === 'waiting' && !wantedNow.has(id)) delete uploads.jobs[id];
  // (The one going up stops too: next() then drops it.)
  if (going && !wantedNow.has(going.id)) going.stop.abort();
  const held = heldFiles(session);
  if ((!live && !sent.length) || !code || !held || remote.status !== 'online') return;
  const failed = failedFiles(session);
  const wanted = new Set([
    ...(live ? filesWanted(game, clue!, s!, held, putFiles(session), can, failed) : []),
    ...sent.flatMap((slide) => filesToSend(phoneCard(game, slide, { ...can, files: held, failed }))),
  ]);
  let added = false;
  for (const id of wanted) {
    const j = uploads.jobs[id];
    if (j?.code === code && (j.state === 'waiting' || j.state === 'uploading')) continue;
    uploads.jobs[id] = { code, state: 'waiting' };
    added = true;
  }
  if (added) void next(game, session);
}

/**
 * ⇡ Get it ready again: the cards' files the room no longer holds (cleaned up after 10 unused minutes, or let go when
 * their card was taken back) aren't taken as put there any more, so they go up again.
 */
export function unputGone(game: Game, session: Session, cards: Slide[]): void {
  const r = session.remote;
  if (!r?.files || r.files.code !== r.code) return;
  const held = heldFiles(session) ?? {};
  const ids = { ...r.files.ids };
  let gone = false;
  for (const card of cards)
    for (const it of phoneCard(game, card, { ...phoneCan(session), files: {} }).items) {
      const id = sendsOf(it);
      if (id && id in ids && !(id in held)) {
        delete ids[id];
        gone = true;
      }
    }
  if (gone) r.files = { ...r.files, ids };
}

/** ↻ Send again or ⇡ again: the cards' files that were turned down are tried again. */
export function retryFiles(game: Game, session: Session, cards: Slide[]): void {
  const code = session.remote?.code;
  for (const card of cards)
    for (const it of phoneCard(game, card, { ...phoneCan(session), files: {} }).items) {
      const id = sendsOf(it);
      if (id && uploads.jobs[id]?.code === code && uploads.jobs[id].state === 'failed') delete uploads.jobs[id];
    }
}

/** The next file waiting, up it goes; then the one after. */
async function next(game: Game, session: Session): Promise<void> {
  if (busy) return;
  const entry = Object.entries(uploads.jobs).find(([, j]) => j.state === 'waiting' && j.code === session.remote?.code && !(j.after && j.after > Date.now()));
  if (!entry) return;
  const [id, job] = entry;
  busy = true;
  job.state = 'uploading';
  const stop = new AbortController();
  going = { id, stop };
  try {
    // (Kept in whole percents: the panels show no more, and each change draws them again.)
    const onProgress = (p: number) => {
      if (Math.floor(p * 100) !== Math.floor((job.progress ?? -1) * 100)) job.progress = p;
    };
    const r = await putFile(game, id, { signal: stop.signal, onProgress });
    delete job.progress;
    const room = session.remote;
    if (job.code !== room?.code) return;
    if ('id' in r) {
      job.state = 'done';
      const ids = room.files?.code === room.code ? room.files.ids : {};
      room.files = { code: room.code, ids: { ...ids, [id]: r.id } };
      // Its card was taken back (or the tile closed) while it went up: the room lets go of it now, not 10 minutes on.
      if (!wantedNow.has(id)) forgetCardFiles([r.id]);
    } else if (r.retry && !wantedNow.has(id)) {
      // Its card was taken back (or the tile closed) while it went: no use trying again.
      delete uploads.jobs[id];
    } else if (r.retry && (job.tries ?? 0) < (r.bytes > SLOW_FILE_BYTES ? RETRIES_BIG : RETRIES)) {
      // (Not one the server turned down: off, out of budget for now, too big… That goes the same way again.)
      const tries = (job.tries ?? 0) + 1;
      const wait = 5000 * tries;
      Object.assign(job, { state: 'waiting', tries, after: Date.now() + wait });
      // (Its wait is over when this timer says so, not by the clock: a timer can run a moment early by Date.now().)
      setTimeout(() => {
        delete job.after;
        void next(game, session);
      }, wait);
    } else Object.assign(job, { state: 'failed', why: r.why, error: r.error });
  } finally {
    busy = false;
    going = null;
    void next(game, session);
  }
}

/**
 * One file of the game into the room: a picture shrunk first, anything else as it is (if phones take its type and
 * size), unless the room holds it already (another card's, or one whose answer was lost on the way). `retry`: it didn't
 * reach the buzzer server (or was stopped); `bytes`: how big what goes up is.
 */
async function putFile(
  game: Game,
  id: Id,
  opts: { signal?: AbortSignal; onProgress?: (done: number) => void } = {},
): Promise<{ id: string } | { why: LeftOut; error: string; retry?: boolean; bytes: number }> {
  const ref = game.media.find((m) => m.id === id);
  const blob = await storedBlob(id);
  if (!ref || !blob) return { why: 'lost', error: 'That file isn’t in this game any more', bytes: 0 };
  const kind = ref.kind === 'image' ? (/gif/i.test(ref.mime) || /\.gif$/i.test(ref.name) ? 'gif' : 'picture') : ref.kind === 'video' ? 'video' : 'sound';
  let body: Blob = blob;
  let type: string | null = fileType(ref.mime) ?? fileType(blob.type);
  if (shrinks({ kind })) {
    const small = await shrink(blob).catch(() => null);
    if (!small) return { why: 'kind', error: 'This picture can’t be read here', bytes: 0 };
    ({ blob: body, type } = small);
  }
  const bytes = body.size;
  if (!type) return { why: 'kind', error: 'Phones don’t take this kind of file', bytes };
  const max = fileLimitsNow().limits.fileBytes;
  if (bytes > max) return { why: 'big', error: `Too big for the buzzer server (${mbText(max)} at most)`, bytes };
  // (Its id in the room is its SHA-256. A page with no Web Crypto (not https) just sends it.)
  if (globalThis.crypto?.subtle) {
    const have = await fileDigest(body).catch(() => '');
    if (isFileId(have) && remote.files?.includes(have)) return { id: have };
  }
  if (opts.signal?.aborted) return { why: 'failed', error: 'Stopped', retry: true, bytes };
  const r = await uploadCardFile(body, type, opts);
  if ('id' in r) return r;
  return { why: r.refused === 'big' ? 'big' : r.refused === 'kind' ? 'kind' : r.refused === 'full' ? 'full' : 'failed', error: r.error, retry: r.refused === 'error', bytes };
}

/**
 * A picture for phones: at most SHRINK_PX on its longest side, as WebP (JPEG where the browser can't make WebP) at
 * SHRINK_QUALITY; the file as it was when that's smaller already and phones take its type.
 */
async function shrink(blob: Blob): Promise<{ blob: Blob; type: string }> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const k = Math.min(1, SHRINK_PX / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round((img.naturalWidth || 1) * k));
    c.height = Math.max(1, Math.round((img.naturalHeight || 1) * k));
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('no canvas');
    ctx.drawImage(img, 0, 0, c.width, c.height);
    let out = await canvasToBlob(c, 'image/webp', SHRINK_QUALITY);
    if (out.type !== 'image/webp') {
      // (JPEG has no see-through parts: those go white, not black.)
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      out = await canvasToBlob(c, 'image/jpeg', SHRINK_QUALITY);
    }
    const own = fileType(blob.type);
    if (k === 1 && own && own.startsWith('image/') && own !== 'image/gif' && blob.size <= out.size) return { blob, type: own };
    return { blob: out, type: out.type || 'image/jpeg' };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * How a card's files stand, counted for the panel (never named): `files` going up from this computer in all, how many
 * are `up`, `going` up now or waiting their turn, and `failed` (turned down, too big, or a kind phones don't take).
 * `progress`: how much of the one going up now went (0 to 1), once it has said.
 */
export interface FileCounts {
  files: number;
  up: number;
  going: number;
  failed: number;
  progress?: number;
}

export function cardFileCounts(game: Game, session: Session, card: Slide): FileCounts {
  const code = session.remote?.code;
  const items = phoneCard(game, card, phoneCan(session)).items.filter((i) => i.file);
  // (Only what's moving: a file up once that the room let go of since is pending again, not on its way.)
  const moving = items.flatMap((i) => {
    const id = sendsOf(i);
    const j = id ? uploads.jobs[id] : undefined;
    return !i.why && 'pending' in i.goes && !!j && j.code === code && (j.state === 'waiting' || j.state === 'uploading') ? [j] : [];
  });
  const progress = moving.find((j) => j.state === 'uploading' && j.progress !== undefined)?.progress;
  return {
    files: items.length,
    up: items.filter((i) => 'file' in i.goes).length,
    going: moving.length,
    failed: items.filter((i) => i.why).length,
    ...(progress !== undefined ? { progress } : {}),
  };
}

/** Cards' files from this computer, counted together (the clue's not sent yet: what ⇡ Get it ready puts in the room). */
export function filesCounted(game: Game, session: Session, cards: Slide[]): FileCounts {
  const all: FileCounts = { files: 0, up: 0, going: 0, failed: 0 };
  for (const card of cards) {
    const c = cardFileCounts(game, session, card);
    all.files += c.files;
    all.up += c.up;
    all.going += c.going;
    all.failed += c.failed;
    if (c.progress !== undefined) all.progress = c.progress;
  }
  return all;
}

/** Forget every upload (a new room: its files are its own). */
export function clearUploads(): void {
  uploads.jobs = {};
}
