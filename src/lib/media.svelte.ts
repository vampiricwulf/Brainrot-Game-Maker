// Media store: blobs for images/video/audio/fonts, keyed by MediaRef id.
// Kept in memory (with object URLs for rendering) and persisted to IndexedDB when available,
// so autosaved drafts keep their media. The .brainrot pack is the portable copy.
// Media added from an online link is downloaded into the same store when the site allows it; when it
// doesn't, the MediaRef keeps the link (`url`) and plays straight from the internet.
import { del, delMany, get, getMany, keys, set } from 'idb-keyval';
import { newId, type Game, type MediaKind, type MediaRef } from './model';
import { uniqueMediaName } from './medianame';
import { uploadedFamily } from './fonts';
import { clipboard } from './clipboard.svelte';
import { askToKeepStorage, loadPlay, playFileKey, unstored, write } from './persist';
import { recentMedia } from './recent';
import { imageFallback, isLinkProblem, isWebUrl, linkMessages, nameFromUrl, parseMediaLink, type LinkKind, type MediaLink } from './links';
import { DownloadError, downloadDrive, downloadFirst, isAbort, LinkError, probeLink, type Downloaded, type DownloadJob } from './download';
import { kindOfMime, mimeFromName, soundTwin } from './sniff';
import { inTauri } from './platform';
import { toast } from './app.svelte';

const blobs = new Map<string, Blob>();
/** id → object URL (or the web link of a live-link file), reactive so components re-render when media arrives. */
export const mediaUrls = $state<Record<string, string>>({});

/** Where a file is stored: the builder's store, or a player-only file's saved game (see storePlayFiles). */
const KEY = (id: string) => (playFiles ? playFileKey(id) : `media:${id}`);

function forget(id: string): void {
  if (mediaUrls[id]?.startsWith('blob:')) URL.revokeObjectURL(mediaUrls[id]);
}

export function registerBlob(id: string, blob: Blob): void {
  if (blobs.get(id) === blob) return;
  forget(id);
  blobs.set(id, blob);
  mediaUrls[id] = URL.createObjectURL(blob);
}

/** Point the game's live-link files at their links (they have no stored file). Call whenever a game arrives. */
export function registerLinks(game: Game): void {
  for (const ref of game.media) {
    if (!ref.url || blobs.has(ref.id) || !isWebUrl(ref.url)) continue;
    if (mediaUrls[ref.id] !== ref.url) mediaUrls[ref.id] = ref.url;
  }
}

export function getBlob(id: string): Blob | undefined {
  return blobs.get(id);
}

/** A file's bytes as this browser holds them (in memory, else in storage), or undefined: none under that id. */
export async function storedBlob(id: string): Promise<Blob | undefined> {
  const b = blobs.get(id);
  if (b || memoryOnly) return b;
  try {
    return await get<Blob>(KEY(id));
  } catch {
    return undefined;
  }
}

/**
 * An exported player-only file: its pack's files stay in memory and never touch the stored ones (see keepInMemory).
 * (Files added during its game are stored with that game: storePlayFiles.)
 */
let memoryOnly = false;
/**
 * Keep files in memory only, for an exported player-only file: every copy of the app opened from disk shares one
 * storage, so storing them would put an older export's files back in place of the builder's (same ids).
 */
export function keepInMemory(): void {
  memoryOnly = true;
}

/** A player-only file whose pack is open: the files added from now on are stored with its saved game. */
let playFiles = false;
/**
 * Call once a player-only file's pack is open: a file added during play (a drawing, a file dropped on the stage) is
 * stored with its saved game, so Resume after a reload brings it back. Never in the builder's store: its pruneMedia
 * would delete it, as no builder game uses it.
 */
export function storePlayFiles(): void {
  playFiles = true;
}

/** Write a file's bytes (what's in memory under `id`, or none) to storage; tried again later if it fails. */
function store(id: string): Promise<boolean> {
  if (memoryOnly && !playFiles) return Promise.resolve(true);
  return write(KEY(id), async () => {
    const blob = blobs.get(id);
    if (blob) await set(KEY(id), blob);
    else await del(KEY(id));
  });
}

export async function putMedia(id: string, blob: Blob): Promise<void> {
  registerBlob(id, blob);
  if (!memoryOnly) askToKeepStorage();
  // Storage unavailable or full: media lives in memory until it can be stored, or the game is saved (the header says
  // so meanwhile).
  await store(id);
}

/**
 * Keep a copy of a file's bytes (memory and storage) under a new id, so an undo can put them back after they're
 * replaced. Returns that id, or null when the file has no stored bytes (a link, a missing file).
 */
export async function stashMedia(id: string): Promise<string | null> {
  const blob = blobs.get(id);
  if (!blob) return null;
  const stash = `stash-${newId()}`;
  blobs.set(stash, blob);
  await store(stash);
  return stash;
}

/**
 * Make a stashed copy file `id`'s bytes again (null: the file had none, so it has none again). The picture changes at
 * once when the copy is in memory; after a reload it's read from storage first.
 */
export async function restoreStash(id: string, stash: string | null): Promise<void> {
  if (!stash) {
    forget(id);
    blobs.delete(id);
    delete mediaUrls[id];
    await store(id);
    return;
  }
  let blob = blobs.get(stash);
  if (!blob) {
    blob = await get<Blob>(KEY(stash)).catch(() => undefined);
    if (!blob) return;
    blobs.set(stash, blob);
  }
  registerBlob(id, blob);
  await store(id);
}

/** Load any of the game's media that isn't in memory yet from IndexedDB. Returns ids still missing. */
export async function loadGameMedia(game: Game): Promise<string[]> {
  registerLinks(game);
  const ids = game.media.filter((ref) => !blobs.has(ref.id) && !ref.url).map((ref) => ref.id);
  if (!ids.length) return [];
  try {
    // One read for them all: a big game has hundreds of files.
    const found = await getMany<Blob>(ids.map(KEY));
    const missing: string[] = [];
    ids.forEach((id, i) => {
      const b = found[i];
      if (b) registerBlob(id, b);
      else missing.push(id);
    });
    return missing;
  } catch {
    return ids;
  }
}

/** Held (shared) by every open copy of the app, so one copy can tell whether others are open. */
const OPEN_LOCK = 'brainrot-games-open';
/** The name copies from before the rename (Jeopardy Builder) hold. It's held too, so an old copy open at the same
 *  time sees this one and never prunes its media (and this one sees the old copy). */
const OLD_OPEN_LOCK = 'jeopardy-builder-open';

/** Mark this copy of the app as open for as long as the page lives (see pruneMedia). */
export function holdOpenLock(): void {
  try {
    // (Refused where site data is blocked: its storage is too, so there's nothing to prune.)
    for (const name of [OPEN_LOCK, OLD_OPEN_LOCK]) void navigator.locks?.request(name, { mode: 'shared' }, () => new Promise<never>(() => {})).catch(() => {});
  } catch {
    /* no Web Locks: pruning just can't see other copies */
  }
}

/** Another copy of the app (tab or window) shares this storage and may use media this one doesn't know about. */
async function otherCopiesOpen(): Promise<boolean> {
  try {
    const held = (await navigator.locks?.query())?.held ?? [];
    return held.filter((l) => l.name === OPEN_LOCK).length > 1 || held.filter((l) => l.name === OLD_OPEN_LOCK).length > 1;
  } catch {
    return false;
  }
}

/**
 * Delete stored media not referenced by any of the given games (or by the saved game in progress, or by what's on the
 * in-app clipboard: a slide copied in the last game can be pasted into the next one), nor `held`: files and stashed
 * copies that the undo history can bring back.
 */
export async function pruneMedia(games: (Game | null | undefined)[], held: ReadonlySet<string> = new Set()): Promise<void> {
  // Every copy of the app opened from disk shares one storage: with another copy open (a second tab
  // or window), its media would look unused here, so leave storage alone.
  const shared = await otherCopiesOpen();
  // Safety net: never delete what a resumable saved game still needs, even if a caller forgot to pass it. Nor what the
  // recent games (New and Open… keep the game they replace) use or can bring back.
  const saved = (await loadPlay())?.game;
  const recent = await recentMedia();
  // Checked again once the stored files are listed: media added while this runs must survive.
  const keep = () => new Set([...[...games, saved].flatMap((g) => g?.media?.map((m) => m.id) ?? []), ...clipboard.media.map((m) => m.id), ...held]);
  if (!shared) {
    try {
      const stored = await keys();
      const used = new Set([...keep(), ...recent]);
      await delMany(stored.filter((k) => typeof k === 'string' && k.startsWith('media:') && !used.has(k.slice(6))));
    } catch {
      /* ignore */
    }
  }
  // A recent game's files are read back from storage when it's reopened (unless storing them failed so far).
  const kept = keep();
  for (const id of [...blobs.keys()]) {
    if (!kept.has(id) && !unstored(KEY(id))) {
      blobs.delete(id);
      forget(id);
      delete mediaUrls[id];
    }
  }
}

const EXT_KIND: Record<string, MediaKind> = {
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', svg: 'image', avif: 'image', bmp: 'image',
  mp4: 'video', webm: 'video', mov: 'video', mkv: 'video', ogv: 'video', m4v: 'video',
  mp3: 'audio', wav: 'audio', ogg: 'audio', oga: 'audio', m4a: 'audio', aac: 'audio', flac: 'audio', opus: 'audio',
  weba: 'audio', mka: 'audio', ttf: 'font', otf: 'font', woff: 'font', woff2: 'font',
};

const EXT_MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  avif: 'image/avif', bmp: 'image/bmp', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  mkv: 'video/x-matroska', ogv: 'video/ogg', m4v: 'video/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
  oga: 'audio/ogg', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', opus: 'audio/opus', weba: 'audio/webm',
  mka: 'audio/x-matroska', ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2',
};

export function extOf(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

export function mediaKind(name: string, mime: string): MediaKind | null {
  const top = mime.split('/')[0];
  if (top === 'image' || top === 'video' || top === 'audio') return top;
  if (top === 'font') return 'font';
  return EXT_KIND[extOf(name)] ?? null;
}

export function mimeFor(name: string, mime?: string): string {
  return mime || EXT_MIME[extOf(name)] || 'application/octet-stream';
}

/** HEIC photos (the iPhone's format): no browser, nor the desktop app, can show them. */
const isHeic = (name: string, mime: string) => /^image\/hei[cf]/.test(mime) || /^hei[cf]$/.test(extOf(name));

/**
 * The checks every file added to the game goes through: a HEIC photo is refused (it would stay blank rather than show),
 * so is a file that isn't a picture, video, sound or font; an SVG is sanitized. Returns what to store.
 */
async function checkedFile(file: Blob, name: string): Promise<{ mime: string; kind: MediaKind; blob: Blob }> {
  const mime = mimeFor(name, file.type);
  if (isHeic(name, mime)) throw new Error(`"${name}" is a HEIC photo (the iPhone's format), which the game can't show. Convert it to JPG or PNG first.`);
  const kind = mediaKind(name, mime);
  if (!kind) throw new Error(`"${name}" isn't a supported image, video, audio or font file.`);
  const blob = mime === 'image/svg+xml' ? new Blob([sanitizeSvg(await file.text())], { type: mime }) : file;
  return { mime, kind, blob };
}

export const ACCEPT = {
  image: 'image/*,.svg,.avif',
  video: 'video/*,.mkv,.mov',
  audio: 'audio/*,.flac,.opus,.m4a,.weba,.mka',
  font: '.ttf,.otf,.woff,.woff2',
  any: 'image/*,video/*,audio/*,.mkv,.mov,.flac,.opus,.m4a,.weba,.mka',
};

/** A file's SHA-256 (hex), worked out once per stored blob. */
const digests = new WeakMap<Blob, Promise<string>>();
export function fileDigest(blob: Blob): Promise<string> {
  let d = digests.get(blob);
  if (!d) {
    d = blob.arrayBuffer().then(async (buf) => {
      const subtle = globalThis.crypto?.subtle;
      // (No Web Crypto, an insecure page: the bytes themselves, so equal files still match.)
      if (!subtle) return Array.from(new Uint8Array(buf), (b) => String.fromCharCode(b)).join('');
      return Array.from(new Uint8Array(await subtle.digest('SHA-256', buf)), (b) => b.toString(16).padStart(2, '0')).join('');
    });
    digests.set(blob, d);
  }
  return d;
}

/**
 * A file already in the game with exactly the same bytes (the same picture dropped on another clue), or undefined.
 * Only stored files of the same kind and size are compared.
 */
export async function identicalMedia(game: Game, blob: Blob, kind: MediaKind): Promise<MediaRef | undefined> {
  const same = game.media.filter((m) => !m.url && m.kind === kind && m.size === blob.size && blobs.has(m.id));
  if (!same.length) return undefined;
  const mine = await fileDigest(blob);
  for (const m of same) {
    const b = blobs.get(m.id);
    if (b && (await fileDigest(b)) === mine) return m;
  }
  return undefined;
}

/**
 * Store a user file with the game and return its ref. SVGs are sanitized first. `extra` (where a
 * downloaded file came from) is set before the ref joins the game, so it's part of the reactive copy.
 * A file with exactly the same bytes as one already in the game isn't stored again: that one is used (and a toast says
 * so), so the same picture on 25 clues takes its space once.
 */
export async function addMediaFile(
  game: Game,
  file: File | Blob,
  name = (file as File).name ?? 'file',
  extra: Pick<MediaRef, 'source' | 'expiresAt'> = {},
): Promise<MediaRef> {
  const { mime, kind, blob } = await checkedFile(file, name);
  const twin = await identicalMedia(game, blob, kind);
  if (twin) {
    toast(`“${twin.name}” is already in 🖼 Media: using that one`);
    return twin;
  }
  // Same name as a file already in the game (e.g. every pasted screenshot is "image.png"): randomize it.
  const ref: MediaRef = { id: newId(), name: uniqueMediaName(game.media.map((m) => m.name), name), mime, size: blob.size, kind, ...extra };
  await putMedia(ref.id, blob.type ? blob : new Blob([blob], { type: mime }));
  game.media.push(ref);
  return ref;
}

// ---------- Online links ----------

export interface LinkAdded {
  ref: MediaRef;
  /** A copy was saved in the game (otherwise it plays from the link). */
  saved: boolean;
  /** What to tell the user. */
  message: string;
  /** The message is a warning (a live link that expires). */
  warn: boolean;
  link: MediaLink;
}

const wrongKind = (is: LinkKind, need: MediaKind) => new LinkError({ problem: 'wrong-kind', message: linkMessages.wrongKind(is, need) });
/** A downloaded file of a type that never shows or plays here (a HEIC photo, an AVI video), or null. */
function unplayable(mime: string): LinkError | null {
  if (isHeic('', mime)) return new LinkError({ problem: 'not-media', message: linkMessages.heic });
  if (mime === 'video/x-msvideo') return new LinkError({ problem: 'not-media', message: linkMessages.avi });
  return null;
}
const cancelled = () => new DOMException('Cancelled', 'AbortError');

/** Explain a failed download, for when the link won't play live either. */
function explain(e: unknown, link: MediaLink): LinkError {
  if (e instanceof LinkError) return e;
  if (e instanceof DownloadError) {
    if (e.reason === 'http') return new LinkError({ problem: 'http', message: linkMessages.http(link.host, e.status) });
    if (e.reason === 'html') return new LinkError({ problem: 'html-page', message: linkMessages.htmlPage });
    if (e.reason === 'not-media') return new LinkError({ problem: 'not-media', message: linkMessages.notMedia });
    if (e.reason === 'too-big') return new LinkError({ problem: 'unreachable', message: linkMessages.tooBig });
    if (e.reason === 'declined') return new LinkError({ problem: 'unreachable', message: linkMessages.declined(link.host) });
  }
  return new LinkError({ problem: 'unreachable', message: linkMessages.unreachable(link.host) });
}

/** Add a file that plays from its link (the site won't let the game save a copy). */
function addLinkRef(game: Game, url: string, kind: LinkKind, link: MediaLink, extra: Pick<MediaRef, 'source' | 'expiresAt'>): MediaRef {
  const base = link.drive ? `Google Drive ${kind === 'image' ? 'picture' : kind}` : nameFromUrl(url);
  const name = uniqueMediaName(game.media.map((m) => m.name), base);
  const ref: MediaRef = { id: newId(), name, mime: mimeFromName(name) ?? '', size: 0, kind, url, ...extra };
  mediaUrls[ref.id] = url;
  game.media.push(ref);
  return ref;
}

/**
 * Add media from an online link (spec §5.5): a copy is downloaded into the game when the site allows
 * it (the desktop app always can), so it works offline and survives the link expiring. Otherwise, if
 * the link plays at all, it's added as a live link that plays from the internet. `want` is what the
 * spot needs. Throws LinkError with a message for the user, or an AbortError when `job.signal` fires.
 * YouTube/Streamable (slide players) and Drive video in the browser are the caller's to handle first.
 */
export async function addMediaLink(game: Game, raw: string | MediaLink, want?: LinkKind, job: DownloadJob = {}): Promise<LinkAdded> {
  const link = typeof raw === 'string' ? parseMediaLink(raw, want) : raw;
  if (!link) throw new LinkError({ problem: 'not-link', message: linkMessages.notLink });
  if (isLinkProblem(link)) throw new LinkError(link);
  if (link.embed) throw new LinkError({ problem: 'embed-only', message: link.embed === 'youtube' ? linkMessages.youtubeOnly : linkMessages.streamableOnly });
  // The same link again (e.g. one picture on several tiles): reuse it.
  const same = game.media.find((m) => m.source === link.source && (!want || m.kind === want));
  if (same) return { ref: same, saved: !same.url, message: 'That link is already in your game, so it was reused.', warn: false, link };
  if (want && link.kindHint && link.kindHint !== want) throw wrongKind(link.kindHint, want);
  const desktop = inTauri();
  const extra = { source: link.source, ...(link.temporary?.expiresAt ? { expiresAt: link.temporary.expiresAt } : {}) };

  // Google refuses Drive files to web pages: the browser can only show a Drive picture, from its image link.
  if (link.drive && !desktop) {
    if (want !== 'image') throw new LinkError({ problem: 'drive-browser', message: linkMessages.driveBrowser });
    for (const url of link.playUrls) {
      if ((await probeLink(url, 'image', job.signal)) === 'image')
        return { ref: addLinkRef(game, url, 'image', link, extra), saved: false, message: linkMessages.live(link, false), warn: false, link };
      if (job.signal?.aborted) throw cancelled();
    }
    throw new LinkError({ problem: 'drive-image', message: linkMessages.driveImage });
  }

  let failure: LinkError;
  /** Why there's no copy when the site did allow one: the user said no to a big file, or it's over 1 GB. */
  let notSaved: 'declined' | 'too-big' | undefined;
  try {
    const got = { ...job, want };
    const file: Downloaded = link.drive ? await downloadDrive(link.drive, got) : await downloadFirst(link.fetchUrls, got);
    const kind = kindOfMime(file.mime);
    if (!kind) throw new LinkError({ problem: 'not-media', message: linkMessages.notMedia });
    if (want && kind !== want) throw wrongKind(kind, want);
    const cant = unplayable(file.mime);
    if (cant) throw cant;
    // The same file already in the game (added from disk, or from another link): that one is used, and nothing is added.
    const had = new Set(game.media.map((m) => m.id));
    const ref = await addMediaFile(game, file.blob, file.name, extra);
    const message = had.has(ref.id) ? `That file is already in your game as “${ref.name}”, so it was reused.` : linkMessages.saved(link);
    return { ref, saved: true, message, warn: false, link };
  } catch (e) {
    if (isAbort(e) || e instanceof LinkError) throw e;
    failure = explain(e, link);
    if (e instanceof DownloadError && (e.reason === 'declined' || e.reason === 'too-big')) notSaved = e.reason;
    // A web page, or a file that isn't media, won't play live either; nor will a Drive link that failed.
    if (e instanceof DownloadError && (e.reason === 'html' || e.reason === 'not-media')) throw failure;
    if (link.drive) throw failure;
  }
  if (link.noLive) throw new LinkError(link.noLive);
  // No copy (the site doesn't allow it, or it's too big): does it play straight from the link?
  for (const url of link.playUrls) {
    const kind = await probeLink(url, want, job.signal);
    if (job.signal?.aborted) throw cancelled();
    if (!kind) continue;
    if (want && kind !== want) throw wrongKind(kind, want);
    return { ref: addLinkRef(game, url, kind, link, extra), saved: false, message: linkMessages.live(link, desktop, notSaved), warn: !!link.temporary, link };
  }
  throw failure;
}

/** A live-link file's bytes, downloaded for "Store in game" (see keepLinkCopy). */
export interface LinkCopy {
  blob: Blob;
  mime: string;
}

/**
 * "Store in game", first half: download a live-link file's bytes (null: it's no longer a link). Nothing in the game
 * changes yet: keepLinkCopy puts them in, as one step however long the download took.
 */
export async function fetchLinkCopy(game: Game, id: string, job: DownloadJob = {}): Promise<LinkCopy | null> {
  const ref = game.media.find((m) => m.id === id);
  if (!ref?.url) return null;
  const url = ref.url;
  const parsed = ref.source ? parseMediaLink(ref.source, ref.kind === 'font' ? undefined : ref.kind) : null;
  const link = parsed && !isLinkProblem(parsed) && !parsed.embed ? parsed : null;
  let file: Downloaded;
  const got = { ...job, want: ref.kind === 'font' ? undefined : ref.kind };
  try {
    if (link?.drive && inTauri()) file = await downloadDrive(link.drive, got);
    else file = await downloadFirst([...new Set([...(link && !link.drive ? link.fetchUrls : []), url])], got);
  } catch (e) {
    if (isAbort(e) || e instanceof LinkError) throw e;
    const host = link?.host ?? new URL(url).hostname;
    if (e instanceof DownloadError && e.reason === 'http') throw new LinkError({ problem: 'http', message: linkMessages.http(host, e.status) });
    throw new LinkError({ problem: 'save-failed', message: linkMessages.saveFailed(host, inTauri()) });
  }
  let mime = file.mime;
  // The link already played as a sound: an MP4 or WebM copy is that sound, whatever its header or name says.
  const twin = ref.kind === 'audio' && soundTwin(mime);
  if (twin) mime = twin;
  const kind = kindOfMime(mime);
  if (kind !== ref.kind) throw kind ? wrongKind(kind, ref.kind) : new LinkError({ problem: 'not-media', message: linkMessages.notMedia });
  const cant = unplayable(mime);
  if (cant) throw cant;
  return { blob: mime === file.mime ? file.blob : file.blob.slice(0, file.blob.size, mime), mime };
}

/**
 * "Store in game", second half: the downloaded bytes become the file's. It keeps its id, so every place that uses it
 * keeps working, now offline. False when it's no longer a link (Undo took it back meanwhile…).
 */
export async function keepLinkCopy(game: Game, id: string, copy: LinkCopy): Promise<boolean> {
  const ref = game.media.find((m) => m.id === id);
  if (!ref?.url) return false;
  await putMedia(id, copy.blob);
  ref.mime = copy.mime;
  ref.size = copy.blob.size;
  delete ref.url;
  delete ref.expiresAt;
  return true;
}

/** <img onerror>: a Drive picture that won't load tries its thumbnail instead (once). */
export function imgFallback(e: Event): void {
  const img = e.currentTarget as HTMLImageElement;
  const next = imageFallback(img.src);
  if (next && !img.dataset.fallback) {
    img.dataset.fallback = '1';
    img.src = next;
  }
}

/** A game picture's size as a new slide picture: up to 1100 × 700 (and 1.5× its own size), 960 × 540 if it won't load. */
export function slideImageSize(id: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1100 / img.naturalWidth, 700 / img.naturalHeight, 1.5);
      resolve({ w: Math.round(img.naturalWidth * s) || 960, h: Math.round(img.naturalHeight * s) || 540 });
    };
    img.onerror = () => resolve({ w: 960, h: 540 });
    img.src = mediaUrls[id];
  });
}

const KIND_WORD: Record<MediaKind, string> = { image: 'a picture', video: 'a video', audio: 'a sound', font: 'a font' };

/** Every reference to file `from` in `node` points at `to`: its id, and an uploaded font's family in the font lists. */
function moveMediaRefs(node: unknown, from: string, to: string, font: boolean): void {
  if (!node || typeof node !== 'object') return;
  const o = node as Record<string, unknown>;
  for (const [k, v] of Object.entries(o)) {
    if (v === from) o[k] = to;
    else if (typeof v !== 'string') moveMediaRefs(v, from, to, font);
    else if (font && v.includes(uploadedFamily(from))) o[k] = v.split(uploadedFamily(from)).join(uploadedFamily(to));
  }
}

/**
 * Put a new file in place of a game file (one that went missing, or one to swap), keeping its id so
 * every tile, slide and sound that uses it is fixed at once. The new file must be the same kind. It takes the new
 * file's name, unless `keepName` (a missing file found again under its own name). With `copy` (another game kept here
 * shares the file), the new bytes get an id of their own and this game's uses move to it, so that game keeps the old file.
 */
export async function replaceMediaFile(game: Game, id: string, file: File, keepName = false, copy = false): Promise<MediaRef> {
  const ref = game.media.find((m) => m.id === id);
  if (!ref) throw new Error('That file is no longer in the game.');
  const { mime, kind, blob } = await checkedFile(file, file.name);
  if (kind !== ref.kind) throw new Error(`"${file.name}" is ${KIND_WORD[kind]}, but "${ref.name}" is ${KIND_WORD[ref.kind]}. Pick ${KIND_WORD[ref.kind]}.`);
  const to = copy ? newId() : id;
  await putMedia(to, blob.type ? blob : new Blob([blob], { type: mime }));
  // (The file's own id too.)
  if (to !== id) moveMediaRefs(game, id, to, ref.kind === 'font');
  // A file the user renamed keeps the name they gave it (the new file's name is its own name now).
  if (ref.file !== undefined) ref.file = file.name;
  else if (!keepName) ref.name = uniqueMediaName(game.media.filter((m) => m.id !== to).map((m) => m.name), file.name);
  if (ref.file === ref.name) delete ref.file;
  ref.mime = mime;
  ref.size = blob.size;
  // It's a stored file now, not a link.
  delete ref.url;
  delete ref.expiresAt;
  delete ref.source;
  return ref;
}

/** Game files with nothing to show: not stored in this browser and not a link. */
export function missingMedia(game: Game): MediaRef[] {
  return game.media.filter((m) => !m.url && !mediaUrls[m.id]);
}

/**
 * Reconnect missing files from a batch the user picked, matched by file name (ignoring case; a renamed one by its own
 * name too): each keeps its name.
 * `swapped` is told of each file's bytes put back (stashed copies, for Undo to take them out again).
 * Returns how many were reconnected and the names still missing.
 */
export async function relinkMissing(
  game: Game,
  files: File[],
  swapped: (s: { id: string; before: string | null; after: string | null }) => void = () => {},
): Promise<{ fixed: number; stillMissing: string[]; errors: string[] }> {
  const byName = new Map(files.map((f) => [f.name.toLowerCase(), f]));
  let fixed = 0;
  const errors: string[] = [];
  for (const ref of missingMedia(game)) {
    // By its name, or by the file's own name if it was renamed.
    const key = [ref.name, ref.file].find((n) => n && byName.has(n.toLowerCase()))?.toLowerCase();
    const f = key ? byName.get(key) : undefined;
    if (!key || !f) continue;
    try {
      const before = await stashMedia(ref.id);
      await replaceMediaFile(game, ref.id, f, true);
      swapped({ id: ref.id, before, after: await stashMedia(ref.id) });
      byName.delete(key);
      fixed++;
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  return { fixed, stillMissing: missingMedia(game).map((m) => m.name), errors };
}

/**
 * Strip scripts, embedded HTML (foreignObject), event handlers and javascript: links from an SVG (spec §10 security).
 * Links to other files stay: a picture shown in an <img> never loads them.
 */
export function sanitizeSvg(svg: string): string {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  doc.querySelectorAll('script, foreignObject').forEach((n) => n.remove());
  doc.querySelectorAll('*').forEach((el) => {
    for (const attr of [...el.attributes]) {
      const v = attr.value.trim().toLowerCase();
      if (attr.name.startsWith('on') || ((attr.name === 'href' || attr.name === 'xlink:href') && v.startsWith('javascript:'))) {
        el.removeAttribute(attr.name);
      }
    }
  });
  return new XMLSerializer().serializeToString(doc);
}

/** Will this browser likely play the file? Used to warn on import (e.g. HEVC .mov). */
export function canPlay(mime: string): boolean {
  const el = document.createElement(mime.startsWith('audio') ? 'audio' : 'video');
  return el.canPlayType(mime) !== '';
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}
