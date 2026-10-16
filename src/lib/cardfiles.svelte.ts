// 🤫 Card files (partner-clues spec §13.5): a card's pictures, GIFs, videos and sounds from this computer, put in the
// buzzer room for the phones the card is sent to. Only the host's presses start an upload: a send (sent cards) or
// ⇡ Get it ready (PartnerState.ready); a reload only finishes what one of those started (filesWanted). Pictures are
// shrunk here first; one file goes up at a time. The panel counts them ("uploading 1 of 2…") and never names them.
import { FILE_MAX_BYTES, fileType } from './buzzproto';
import { canvasToBlob, loadImage } from './imageedit';
import { storedBlob } from './media.svelte';
import type { Clue, ClueCard, Game, Id, Session } from './model';
import { filesWanted } from './partner';
import { phoneCard, shrinks, type LeftOut } from './phonecard';
import { remote, roomHasFiles, uploadCardFile } from './remote.svelte';

/** A picture's longest side on a phone, and how it's packed (WebP, else JPEG). */
export const SHRINK_PX = 1600;
export const SHRINK_QUALITY = 0.85;

/** One file on its way to room `code` (by media id): waiting its turn, going up, up, or turned down (why, in words). */
interface Upload {
  code: string;
  state: 'waiting' | 'uploading' | 'done' | 'failed';
  why?: LeftOut;
  error?: string;
}

export const uploads = $state<{ jobs: Record<Id, Upload> }>({ jobs: {} });

/** Whether one is going up now (one at a time). */
let busy = false;

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

/** What the phones can get now (phoneCard's `can`): the room's files, and those turned down. */
export const phoneCan = (session: Pick<Session, 'remote'>) => ({ files: heldFiles(session), failed: failedFiles(session) });

/**
 * Starts the uploads the open partner clue's cards want now (filesWanted: what was sent or got ready, and isn't in the
 * room). Play calls it whenever those change; nothing else starts one.
 */
export function syncUploads(game: Game, session: Session, clue: Clue | undefined): void {
  const s = session.partner;
  const code = session.remote?.code;
  const held = heldFiles(session);
  if (!s || !clue || clue.id !== s.clue || !code || !held || remote.status !== 'online') return;
  const wanted = filesWanted(game, clue, s, held, putFiles(session), failedFiles(session));
  let added = false;
  for (const id of wanted) {
    const j = uploads.jobs[id];
    if (j?.code === code && (j.state === 'waiting' || j.state === 'uploading')) continue;
    uploads.jobs[id] = { code, state: 'waiting' };
    added = true;
  }
  if (added) void next(game, session);
}

/** ↻ Send again or ⇡ again: the cards' files that were turned down are tried again. */
export function retryFiles(game: Game, session: Session, cards: ClueCard[]): void {
  const code = session.remote?.code;
  for (const card of cards)
    for (const it of phoneCard(game, card, { files: {} }).items) if (it.media && uploads.jobs[it.media]?.code === code && uploads.jobs[it.media].state === 'failed') delete uploads.jobs[it.media];
}

/** The next file waiting, up it goes; then the one after. */
async function next(game: Game, session: Session): Promise<void> {
  if (busy) return;
  const entry = Object.entries(uploads.jobs).find(([, j]) => j.state === 'waiting' && j.code === session.remote?.code);
  if (!entry) return;
  const [id, job] = entry;
  busy = true;
  job.state = 'uploading';
  try {
    const r = await putFile(game, id);
    const room = session.remote;
    if (job.code !== room?.code) return;
    if ('id' in r) {
      job.state = 'done';
      const ids = room.files?.code === room.code ? room.files.ids : {};
      room.files = { code: room.code, ids: { ...ids, [id]: r.id } };
    } else Object.assign(job, { state: 'failed', why: r.why, error: r.error });
  } finally {
    busy = false;
    void next(game, session);
  }
}

/** One file of the game into the room: a picture shrunk first, anything else as it is (if phones take its type and size). */
async function putFile(game: Game, id: Id): Promise<{ id: string } | { why: LeftOut; error: string }> {
  const ref = game.media.find((m) => m.id === id);
  const blob = await storedBlob(id);
  if (!ref || !blob) return { why: 'lost', error: 'That file isn’t in this game any more' };
  const kind = ref.kind === 'image' ? (/gif/i.test(ref.mime) || /\.gif$/i.test(ref.name) ? 'gif' : 'picture') : ref.kind === 'video' ? 'video' : 'sound';
  let body: Blob = blob;
  let type: string | null = fileType(ref.mime) ?? fileType(blob.type);
  if (shrinks({ kind })) {
    const small = await shrink(blob).catch(() => null);
    if (!small) return { why: 'kind', error: 'This picture can’t be read here' };
    ({ blob: body, type } = small);
  }
  if (!type) return { why: 'kind', error: 'Phones don’t take this kind of file' };
  if (body.size > FILE_MAX_BYTES) return { why: 'big', error: 'Too big for phones' };
  const r = await uploadCardFile(body, type);
  if ('id' in r) return r;
  return { why: r.refused === 'big' ? 'big' : r.refused === 'kind' ? 'kind' : 'failed', error: r.error };
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
 */
export function cardFileCounts(game: Game, session: Session, card: ClueCard): { files: number; up: number; going: number; failed: number } {
  const code = session.remote?.code;
  const items = phoneCard(game, card, phoneCan(session)).items.filter((i) => i.file);
  const going = items.filter((i) => !i.why && 'pending' in i.goes && i.media && uploads.jobs[i.media]?.code === code && uploads.jobs[i.media].state !== 'failed').length;
  return { files: items.length, up: items.filter((i) => 'file' in i.goes).length, going, failed: items.filter((i) => i.why).length };
}

/** Cards' files from this computer, counted together (the clue's not sent yet: what ⇡ Get it ready puts in the room). */
export function filesCounted(game: Game, session: Session, cards: ClueCard[]): { files: number; up: number; going: number; failed: number } {
  const all = { files: 0, up: 0, going: 0, failed: 0 };
  for (const card of cards) {
    const c = cardFileCounts(game, session, card);
    all.files += c.files;
    all.up += c.up;
    all.going += c.going;
    all.failed += c.failed;
  }
  return all;
}

/** Forget every upload (a new room: its files are its own). */
export function clearUploads(): void {
  uploads.jobs = {};
}
