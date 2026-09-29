// Media store: blobs for images/video/audio/fonts, keyed by MediaRef id.
// Kept in memory (with object URLs for rendering) and persisted to IndexedDB when available,
// so autosaved drafts keep their media. The .jbr pack is the portable copy.
// Media added from an online link is downloaded into the same store when the site allows it; when it
// doesn't, the MediaRef keeps the link (`url`) and plays straight from the internet.
import { del, get, keys, set } from 'idb-keyval';
import { newId, type Game, type MediaKind, type MediaRef } from './model';
import { uniqueMediaName } from './medianame';
import { loadPlay } from './persist';
import { imageFallback, isLinkProblem, isWebUrl, linkMessages, nameFromUrl, parseMediaLink, type LinkKind, type MediaLink } from './links';
import { DownloadError, downloadDrive, downloadFirst, isAbort, LinkError, probeLink, type Downloaded, type DownloadJob } from './download';
import { kindOfMime, mimeFromName, soundTwin } from './sniff';
import { inTauri } from './platform';

const blobs = new Map<string, Blob>();
/** id → object URL (or the web link of a live-link file), reactive so components re-render when media arrives. */
export const mediaUrls = $state<Record<string, string>>({});

const KEY = (id: string) => `media:${id}`;

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

export async function putMedia(id: string, blob: Blob): Promise<void> {
  registerBlob(id, blob);
  try {
    await set(KEY(id), blob);
  } catch {
    /* storage unavailable: media lives in memory until the game is saved */
  }
}

/** Load any of the game's media that isn't in memory yet from IndexedDB. Returns ids still missing. */
export async function loadGameMedia(game: Game): Promise<string[]> {
  registerLinks(game);
  const missing: string[] = [];
  for (const ref of game.media) {
    if (blobs.has(ref.id) || ref.url) continue;
    try {
      const b = await get<Blob>(KEY(ref.id));
      if (b) registerBlob(ref.id, b);
      else missing.push(ref.id);
    } catch {
      missing.push(ref.id);
    }
  }
  return missing;
}

/** Delete stored media not referenced by any of the given games (or by the saved game in progress). */
export async function pruneMedia(games: (Game | null | undefined)[]): Promise<void> {
  // Safety net: never delete what a resumable saved game still needs, even if a caller forgot to pass it.
  const saved = (await loadPlay())?.game;
  const keep = new Set([...games, saved].flatMap((g) => g?.media?.map((m) => m.id) ?? []));
  try {
    for (const k of await keys()) {
      if (typeof k === 'string' && k.startsWith('media:') && !keep.has(k.slice(6))) await del(k);
    }
  } catch {
    /* ignore */
  }
  for (const id of [...blobs.keys()]) {
    if (!keep.has(id)) {
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

export const ACCEPT = {
  image: 'image/*,.svg,.avif',
  video: 'video/*,.mkv,.mov',
  audio: 'audio/*,.flac,.opus,.m4a,.weba,.mka',
  font: '.ttf,.otf,.woff,.woff2',
  any: 'image/*,video/*,audio/*,.mkv,.mov,.flac,.opus,.m4a,.weba,.mka',
};

/**
 * Store a user file with the game and return its ref. SVGs are sanitized first. `extra` (where a
 * downloaded file came from) is set before the ref joins the game, so it's part of the reactive copy.
 */
export async function addMediaFile(
  game: Game,
  file: File | Blob,
  name = (file as File).name ?? 'file',
  extra: Pick<MediaRef, 'source' | 'expiresAt'> = {},
): Promise<MediaRef> {
  const mime = mimeFor(name, file.type);
  const kind = mediaKind(name, mime);
  if (!kind) throw new Error(`"${name}" isn't a supported image, video, audio or font file.`);
  let blob: Blob = file;
  if (mime === 'image/svg+xml') blob = new Blob([sanitizeSvg(await file.text())], { type: mime });
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
    const ref = await addMediaFile(game, file.blob, file.name, extra);
    return { ref, saved: true, message: linkMessages.saved(link), warn: false, link };
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

/**
 * "Save a copy": download a live-link file into the game after all. It keeps its id, so every place
 * that uses it keeps working, now offline.
 */
export async function saveLinkCopy(game: Game, id: string, job: DownloadJob = {}): Promise<void> {
  const ref = game.media.find((m) => m.id === id);
  if (!ref?.url) return;
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
  await putMedia(id, mime === file.mime ? file.blob : file.blob.slice(0, file.blob.size, mime));
  ref.mime = mime;
  ref.size = file.blob.size;
  delete ref.url;
  delete ref.expiresAt;
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

/** Strip scripts, event handlers and external references from an SVG (spec §10 security). */
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
